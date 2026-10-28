const http = require('http');
const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');

// server.js의 코드를 모듈화하거나 가상 request/response로 테스팅
// server.js 자체를 require해서 사용할 수 있도록 server.js를 살펴보면 server.listen이 있지만,
// 동일 프로세스에서 직접 테스트 가능합니다.

// Mock Request & Response 클래스
class MockReq extends EventEmitter {
  constructor({ method = 'GET', url = '/', headers = {}, body = '' }) {
    super();
    this.method = method;
    this.url = url;
    this.headers = headers;
    this._body = body;
  }
  start() {
    process.nextTick(() => {
      if (this._body) {
        if (Buffer.isBuffer(this._body)) {
          this.emit('data', this._body);
        } else {
          this.emit('data', Buffer.from(this._body, 'utf-8'));
        }
      }
      this.emit('end');
    });
  }
}

class MockRes extends EventEmitter {
  constructor() {
    super();
    this.statusCode = 200;
    this.headers = {};
    this.chunks = [];
  }
  setHeader(name, value) {
    this.headers[name.toLowerCase()] = value;
  }
  writeHead(code, headers = {}) {
    this.statusCode = code;
    for (let k in headers) {
      this.setHeader(k, headers[k]);
    }
  }
  write(chunk) {
    if (chunk) this.chunks.push(Buffer.from(chunk));
  }
  end(chunk) {
    if (chunk) this.chunks.push(Buffer.from(chunk));
    this.body = Buffer.concat(this.chunks).toString('utf-8');
    this.emit('finish');
  }
}

async function runInProcessTests() {
  console.log('--- 해양경찰 법령정보센터 통합 검증 테스트 (In-Process Mock Runner) ---');
  const results = [];

  // server.js의 리스너를 가져오기 위해 require
  // server.js가 listen을 호출하지만 테스트 프로세스에서 리스너 함수만 바인딩
  delete require.cache[require.resolve('./server.js')];
  
  // server.js 안의 server 객체에 등록된 request 리스너 추출
  // http.createServer 가로채기
  let requestHandler = null;
  const originalCreateServer = http.createServer;
  http.createServer = function(handler) {
    requestHandler = handler;
    const s = originalCreateServer.call(http, handler);
    // listen 실패 방지용 빈 핸들러
    s.listen = function(port, cb) {
      if (cb) cb();
      return s;
    };
    return s;
  };

  require('./server.js');
  http.createServer = originalCreateServer;

  if (!requestHandler) {
    console.error('Request handler not found!');
    return;
  }

  const dispatch = (options, body = '') => {
    return new Promise((resolve, reject) => {
      const req = new MockReq({
        method: options.method || 'GET',
        url: options.path || '/',
        headers: options.headers || {},
        body: body
      });
      const res = new MockRes();

      res.on('finish', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: res.body
        });
      });

      try {
        requestHandler(req, res);
        req.start();
      } catch (err) {
        reject(err);
      }
    });
  };

  const record = (id, name, pass, detail) => {
    results.push({ id, name, status: pass ? 'PASS' : 'FAIL', detail });
    console.log(`[${pass ? 'PASS' : 'FAIL'}] ${id}: ${name} - ${detail}`);
  };

  // TC-01: 메인 화면 서빙
  let res = await dispatch({ path: '/' });
  record('TC-01', '메인 화면 서빙 (index.html)', res.statusCode === 200 && res.body.includes('해양경찰 법령정보센터'), `Status: ${res.statusCode}`);

  // TC-02: 목록 화면 서빙
  res = await dispatch({ path: '/list.html?category=law' });
  record('TC-02', '목록 화면 서빙 (list.html)', res.statusCode === 200 && res.body.includes('법령 목록'), `Status: ${res.statusCode}`);

  // TC-03: 뷰어 화면 서빙
  res = await dispatch({ path: '/view.html?id=law-001' });
  record('TC-03', '본문 상세 뷰어 화면 서빙 (view.html)', res.statusCode === 200 && res.body.includes('조문 목차'), `Status: ${res.statusCode}`);

  // TC-04: 관리자 화면 서빙
  res = await dispatch({ path: '/admin.html' });
  record('TC-04', '관리자 수동 업로드 화면 서빙 (admin.html)', res.statusCode === 200 && res.body.includes('파일 수동 업로드'), `Status: ${res.statusCode}`);

  // TC-05: CSS 스타일시트 (첨부1 컬러 테마)
  res = await dispatch({ path: '/css/style.css' });
  const hasColors = res.body.includes('#3D5127') && res.body.includes('#F6F7F2') && res.body.includes('#EBB839');
  record('TC-05', '첨부1 컬러 테마 CSS 검증', res.statusCode === 200 && hasColors, `포레스트/골드/아이보리 지정 색상 정의 확인`);

  // TC-06: 법령 목록 API (법률·대통령령)
  res = await dispatch({ path: '/api/laws?category=law' });
  const jsonLaws = JSON.parse(res.body);
  record('TC-06', '법령 목록 API 조회', jsonLaws.success && jsonLaws.count >= 3, `조회 건수: ${jsonLaws.count}건`);

  // TC-07: 행정규칙 목록 API (훈령·예규·고시)
  res = await dispatch({ path: '/api/laws?category=rule' });
  const jsonRules = JSON.parse(res.body);
  record('TC-07', '행정규칙 목록 API 조회', jsonRules.success && jsonRules.count >= 3, `조회 건수: ${jsonRules.count}건`);

  // TC-08: 통합 키워드 검색 API
  res = await dispatch({ path: '/api/laws?keyword=' + encodeURIComponent('수색구조') });
  const jsonSearch = JSON.parse(res.body);
  const hasSearchMatch = jsonSearch.data.some(d => d.title.includes('수색구조'));
  record('TC-08', '키워드 검색 API (수색구조)', jsonSearch.success && hasSearchMatch, `검색 매칭 건수: ${jsonSearch.count}건`);

  // TC-09: 특정 법령 상세 조회 API
  res = await dispatch({ path: '/api/laws/law-001' });
  const jsonDetail = JSON.parse(res.body);
  const hasArticles = jsonDetail.data && jsonDetail.data.chapters && jsonDetail.data.chapters.length > 0;
  record('TC-09', '법령 상세 및 조문 구조 API', jsonDetail.success && hasArticles, `법령명: ${jsonDetail.data.title}, 장 수: ${jsonDetail.data.chapters.length}`);

  // TC-10: 신규 법령 수동 등록 API (관리자)
  const newLawPayload = JSON.stringify({
    category: 'rule',
    subType: '훈령',
    title: '테스트 해양경찰 경비함정 운영규칙',
    promulgationNo: '해양경찰청훈령 제999호',
    enforceDate: '2026. 12. 01.',
    department: '해양경찰청 경비과',
    revisionType: '제정',
    description: '단위 테스트를 위한 함정 운영 규칙',
    rawText: '제1장 총칙\n제1조(목적) 함정 운영의 효율화를 목적으로 한다.'
  });
  res = await dispatch({
    method: 'POST',
    path: '/api/laws',
    headers: {
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(newLawPayload)
    }
  }, newLawPayload);
  const jsonPost = JSON.parse(res.body);
  const createdId = jsonPost.data ? jsonPost.data.id : null;
  record('TC-10', '관리자 신규 법령 등록 API', res.statusCode === 201 && jsonPost.success, `생성된 ID: ${createdId}`);

  // TC-11: 원본 첨부파일 다운로드
  res = await dispatch({ path: '/download/' + encodeURIComponent('해양경비법_시행령_전문.pdf') });
  record('TC-11', '원본 첨부파일 다운로드', res.statusCode === 200 && res.body.includes('해양경비법 시행령'), `Status: ${res.statusCode}, Size: ${res.body.length} bytes`);

  // TC-12: 등록 법령 삭제 API
  if (createdId) {
    res = await dispatch({
      method: 'DELETE',
      path: `/api/laws/${createdId}`
    });
    const jsonDel = JSON.parse(res.body);
    record('TC-12', '관리자 법령 삭제 API', res.statusCode === 200 && jsonDel.success, `삭제 메시지: ${jsonDel.message}`);
  }

  console.log('\n--- 모든 12개 테스트 완료 ---');
  fs.writeFileSync('test_results.json', JSON.stringify(results, null, 2), 'utf-8');
}

runInProcessTests().catch(console.error);
