const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'laws.json');
const UPLOAD_DIR = path.join(__dirname, 'storage', 'uploads');
const PUBLIC_DIR = path.join(__dirname, 'public');

// 서버 다운 방지 (Global Error Handlers)
process.on('uncaughtException', (err) => {
  console.error('[CRITICAL] Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[CRITICAL] Unhandled Rejection at:', promise, 'reason:', reason);
});

// 디렉터리 보장
if (!fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
}
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// MIME 타입 매핑
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

// 파일명 안전 정제 (윈도우 금지문자 제거)
function sanitizeFilename(originalName) {
  if (!originalName) return 'document.pdf';
  // 윈도우 금지문자 \ / : * ? " < > | 제거
  let clean = originalName.replace(/[\\/:*?"<>|]/g, '_').trim();
  if (!clean) clean = 'document_' + Date.now();
  return clean;
}

// 데이터 헬퍼
function readLaws() {
  try {
    if (!fs.existsSync(DATA_FILE)) return [];
    const content = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(content || '[]');
  } catch (err) {
    console.error('Error reading laws:', err);
    return [];
  }
}

function writeLaws(laws) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(laws, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing laws:', err);
  }
}

// 요청 본문 파싱 (대용량 JSON 지원, 최대 100MB)
function parseRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => {
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const fullBuffer = Buffer.concat(chunks);
        resolve(fullBuffer.toString('utf-8'));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', err => reject(err));
  });
}

// 멀티파트 폼 파서 (예비용)
function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const contentType = req.headers['content-type'] || '';
    const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
    if (!boundaryMatch) {
      return reject(new Error('Invalid multipart boundary'));
    }
    const boundary = boundaryMatch[1] || boundaryMatch[2];
    const chunks = [];

    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      try {
        const buffer = Buffer.concat(chunks);
        const boundaryBuf = Buffer.from('--' + boundary);
        const fields = {};
        let fileInfo = null;

        let start = 0;
        while (start < buffer.length) {
          const bIdx = buffer.indexOf(boundaryBuf, start);
          if (bIdx === -1) break;

          const nextBIdx = buffer.indexOf(boundaryBuf, bIdx + boundaryBuf.length);
          if (nextBIdx === -1) break;

          const part = buffer.subarray(bIdx + boundaryBuf.length, nextBIdx);
          const headerEnd = part.indexOf(Buffer.from('\r\n\r\n'));
          if (headerEnd !== -1) {
            const headerStr = part.subarray(0, headerEnd).toString('utf-8');
            let bodyBuf = part.subarray(headerEnd + 4);
            if (bodyBuf.length >= 2 && bodyBuf[bodyBuf.length - 2] === 13 && bodyBuf[bodyBuf.length - 1] === 10) {
              bodyBuf = bodyBuf.subarray(0, bodyBuf.length - 2);
            }

            const nameMatch = headerStr.match(/name="([^"]+)"/);
            const filenameMatch = headerStr.match(/filename="([^"]+)"/);

            if (nameMatch) {
              const fieldName = nameMatch[1];
              if (filenameMatch && filenameMatch[1]) {
                let filename = Buffer.from(filenameMatch[1], 'latin1').toString('utf-8');
                filename = sanitizeFilename(path.basename(filename));
                if (filename && bodyBuf.length > 0) {
                  const safeName = Date.now() + '_' + filename;
                  const filePath = path.join(UPLOAD_DIR, safeName);
                  fs.writeFileSync(filePath, bodyBuf);
                  fileInfo = {
                    originalName: filename,
                    savedName: safeName,
                    size: bodyBuf.length
                  };
                }
              } else {
                fields[fieldName] = bodyBuf.toString('utf-8');
              }
            }
          }
          start = nextBIdx;
        }
        resolve({ fields, file: fileInfo });
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', err => reject(err));
  });
}

const server = http.createServer(async (req, res) => {
  // CORS 헤더 설정
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
    if (pathname === '/api/laws' && method === 'GET') {
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

    // 2. 특정 법령 상세 조회
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

    // 3. 법령 수동 등록 (관리자: JSON 또는 Multipart 둘 다 지원)
    if (pathname === '/api/laws' && method === 'POST') {
      const contentType = req.headers['content-type'] || '';
      let fields = {};
      let originalFileName = '';

      if (contentType.includes('multipart/form-data')) {
        const parsed = await parseMultipart(req);
        fields = parsed.fields;
        if (parsed.file) {
          originalFileName = parsed.file.savedName;
        }
      } else {
        const raw = await parseRequestBody(req);
        fields = JSON.parse(raw || '{}');

        // Base64 파일 업로드 처리
        if (fields.fileBase64 && fields.fileName) {
          try {
            const cleanName = sanitizeFilename(fields.fileName);
            const savedName = Date.now() + '_' + cleanName;
            const filePath = path.join(UPLOAD_DIR, savedName);
            const base64Data = fields.fileBase64.replace(/^data:.*?;base64,/, '');
            fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
            originalFileName = savedName;
            console.log(`[업로드 성공] 파일 저장 완료: ${savedName}`);
          } catch (fileErr) {
            console.error('Base64 file save error:', fileErr);
          }
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
      } else if (fields.rawText) {
        chapters = [
          {
            chapterTitle: "본문",
            articles: [
              {
                articleNo: "전문",
                title: fields.title || "내용",
                content: fields.rawText
              }
            ]
          }
        ];
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
        originalFile: originalFileName || fields.existingFile || '',
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

    // 4. 법령 삭제
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

    // 5. 원본 파일 다운로드
    if (pathname.startsWith('/download/')) {
      const filename = path.basename(decodeURIComponent(pathname.replace('/download/', '')));
      const filePath = path.join(UPLOAD_DIR, filename);

      if (fs.existsSync(filePath)) {
        const ext = path.extname(filePath).toLowerCase();
        const mime = MIME_TYPES[ext] || 'application/octet-stream';
        const stat = fs.statSync(filePath);

        res.writeHead(200, {
          'Content-Type': mime,
          'Content-Length': stat.size,
          'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`
        });
        fs.createReadStream(filePath).pipe(res);
        return;
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('첨부파일을 찾을 수 없습니다.');
        return;
      }
    }

    // 6. 정적 웹 리소스 서빙
    let safePath = pathname;
    if (safePath === '/' || safePath === '') safePath = '/index.html';
    if (safePath === '/list') safePath = '/list.html';
    if (safePath === '/view') safePath = '/view.html';
    if (safePath === '/admin') safePath = '/admin.html';

    const fullPath = path.join(PUBLIC_DIR, safePath);

    if (!fullPath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    fs.stat(fullPath, (err, stats) => {
      if (err || !stats.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>404 Not Found</h1><p>페이지를 찾을 수 없습니다.</p>');
        return;
      }

      const ext = path.extname(fullPath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      res.writeHead(200, { 'Content-Type': contentType });
      fs.createReadStream(fullPath).pipe(res);
    });
  } catch (err) {
    console.error('[Server Request Error]', err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: false, message: '서버 내부 오류: ' + err.message }));
    }
  }
});

server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(` 해양경찰 법령정보센터 로컬 웹 서버 구동 완료`);
  console.log(` 접속 주소: http://localhost:${PORT}`);
  console.log(`====================================================`);
});
