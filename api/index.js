const fs = require('fs');
const path = require('path');
const url = require('url');

// Vercel 환경 감지
const IS_VERCEL = process.env.VERCEL === '1' || process.env.NOW_REGION != null;

const DATA_FILE = path.join(process.cwd(), 'data', 'laws.json');
const UPLOAD_DIR = IS_VERCEL 
  ? path.join('/tmp', 'uploads') 
  : path.join(process.cwd(), 'storage', 'uploads');

// 인메모리 캐시 (Vercel 서버리스 환경에서 쓰기 지원)
let inMemoryLaws = null;

if (!fs.existsSync(UPLOAD_DIR)) {
  try {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  } catch (e) {}
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.hwp': 'application/x-hwp',
  '.hwpx': 'application/x-hwp',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
};

function sanitizeFilename(originalName) {
  if (!originalName) return 'document.pdf';
  let clean = originalName.replace(/[\\/:*?"<>|]/g, '_').trim();
  if (!clean) clean = 'document_' + Date.now();
  return clean;
}

function readLaws() {
  if (inMemoryLaws) return inMemoryLaws;
  try {
    if (fs.existsSync(DATA_FILE)) {
      const content = fs.readFileSync(DATA_FILE, 'utf-8');
      inMemoryLaws = JSON.parse(content || '[]');
      return inMemoryLaws;
    }
  } catch (err) {
    console.error('Error reading laws:', err);
  }
  inMemoryLaws = [];
  return inMemoryLaws;
}

function writeLaws(laws) {
  inMemoryLaws = laws;
  if (!IS_VERCEL) {
    try {
      fs.writeFileSync(DATA_FILE, JSON.stringify(laws, null, 2), 'utf-8');
    } catch (err) {
      console.error('Error writing laws to disk:', err);
    }
  }
}

function parseRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      try {
        resolve(Buffer.concat(chunks).toString('utf-8'));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', err => reject(err));
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    const method = req.method.toUpperCase();

    // 1. 법령 목록 및 검색
    if ((pathname === '/api/laws' || pathname === '/api') && method === 'GET') {
      const { category, keyword, subType } = parsedUrl.query;
      let list = readLaws();

      if (category && category !== 'all') {
        list = list.filter(item => item.category === category);
      }
      if (subType && subType !== 'all') {
        list = list.filter(item => item.subType === subType);
      }
      if (keyword && keyword.trim()) {
        const q = keyword.trim().toLowerCase();
        list = list.filter(item => {
          const inTitle = item.title && item.title.toLowerCase().includes(q);
          const inDesc = item.description && item.description.toLowerCase().includes(q);
          const inDept = item.department && item.department.toLowerCase().includes(q);
          const inArticles = item.chapters && item.chapters.some(ch =>
            ch.articles && ch.articles.some(ar =>
              (ar.title && ar.title.toLowerCase().includes(q)) ||
              (ar.content && ar.content.toLowerCase().includes(q)) ||
              (ar.articleNo && ar.articleNo.toLowerCase().includes(q))
            )
          );
          return inTitle || inDesc || inDept || inArticles;
        });
      }

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: true, count: list.length, data: list }));
      return;
    }

    // 2. 단건 조회
    if (pathname.startsWith('/api/laws/') && method === 'GET') {
      const id = pathname.replace('/api/laws/', '');
      const list = readLaws();
      const item = list.find(l => l.id === id);

      if (!item) {
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, message: '법령 정보를 찾을 수 없습니다.' }));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: true, data: item }));
      return;
    }

    // 3. 법령 등록
    if ((pathname === '/api/laws' || pathname === '/api') && method === 'POST') {
      const raw = await parseRequestBody(req);
      const fields = JSON.parse(raw || '{}');
      let originalFileName = '';

      if (fields.fileBase64 && fields.fileName) {
        try {
          const cleanName = sanitizeFilename(fields.fileName);
          const savedName = Date.now() + '_' + cleanName;
          const filePath = path.join(UPLOAD_DIR, savedName);
          const base64Data = fields.fileBase64.replace(/^data:.*?;base64,/, '');
          fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
          originalFileName = savedName;
        } catch (fileErr) {
          console.error('File save error:', fileErr);
        }
      }

      const laws = readLaws();
      const newId = (fields.category === 'rule' ? 'rule-' : 'law-') + String(Date.now()).slice(-6);

      let chapters = [];
      if (fields.articlesJson) {
        try {
          chapters = typeof fields.articlesJson === 'string' ? JSON.parse(fields.articlesJson) : fields.articlesJson;
        } catch (e) {
          chapters = [];
        }
      }

      const newLaw = {
        id: newId,
        category: fields.category || 'law',
        subType: fields.subType || (fields.category === 'rule' ? '훈령' : '법률'),
        title: fields.title || '무제 법령',
        shortTitle: fields.shortTitle || fields.title || '',
        enforceDate: fields.enforceDate || new Date().toISOString().slice(0, 10).replace(/-/g, '. ') + '.',
        promulgationNo: fields.promulgationNo || '',
        promulgationDate: fields.promulgationDate || '',
        department: fields.department || '해양경찰청',
        revisionType: fields.revisionType || '제정',
        originalFile: originalFileName || '',
        description: fields.description || '',
        chapters: chapters.length > 0 ? chapters : [
          {
            chapterTitle: "제1장 총칙",
            articles: [
              {
                articleNo: "제1조",
                title: "목적",
                content: (fields.title || '법령') + "에 관한 사항을 규정함을 목적으로 한다."
              }
            ]
          }
        ]
      };

      laws.unshift(newLaw);
      writeLaws(laws);

      res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: true, message: '성공적으로 등록되었습니다.', data: newLaw }));
      return;
    }

    // 4. 삭제
    if (pathname.startsWith('/api/laws/') && method === 'DELETE') {
      const id = pathname.replace('/api/laws/', '');
      let list = readLaws();
      const beforeLen = list.length;
      list = list.filter(l => l.id !== id);

      if (list.length === beforeLen) {
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, message: '항목을 찾을 수 없습니다.' }));
        return;
      }

      writeLaws(list);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: true, message: '삭제되었습니다.' }));
      return;
    }

    // 5. 다운로드
    if (pathname.startsWith('/download/')) {
      const filename = path.basename(decodeURIComponent(pathname.replace('/download/', '')));
      const filePath = path.join(UPLOAD_DIR, filename);
      const defaultFilePath = path.join(process.cwd(), 'storage', 'uploads', filename);

      const targetPath = fs.existsSync(filePath) ? filePath : (fs.existsSync(defaultFilePath) ? defaultFilePath : null);

      if (targetPath) {
        const ext = path.extname(targetPath).toLowerCase();
        const mime = MIME_TYPES[ext] || 'application/octet-stream';
        const stat = fs.statSync(targetPath);

        res.writeHead(200, {
          'Content-Type': mime,
          'Content-Length': stat.size,
          'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`
        });
        fs.createReadStream(targetPath).pipe(res);
        return;
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('첨부파일을 찾을 수 없습니다.');
        return;
      }
    }

    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Endpoint not found' }));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: err.message }));
  }
};
