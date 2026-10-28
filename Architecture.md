# Architecture: 해양경찰 법령정보센터

## 1. 시스템 아키텍처 개요

해양경찰 법령정보센터는 **로컬 PC 환경에 최적화된 경량 모놀리식 웹 아키텍처(Lightweight Local Monolithic Architecture)**로 설계되었습니다. 추가적인 DBMS 서버(MySQL, Oracle 등)나 복잡한 컨테이너 인프라 없이, 사용자의 로컬 Node.js 런타임과 파일 시스템만을 사용하여 즉시 구동됩니다.

```
┌─────────────────────────────────────────────────────────────┐
│                    사용자 웹 브라우저 (Client)               │
│  [메인 화면(첨부3)] ── [목록/검색 화면] ── [본문 뷰어(첨부2)] │
│                              │                              │
│                    [관리자 업로드 화면]                     │
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTP / JSON API / Static 서빙
┌──────────────────────────────▼──────────────────────────────┐
│                  Node.js / Express 서버 (Server)             │
│  ├── Static File Server (HTML, CSS, JS, 첨부파일)            │
│  ├── Routing Engine (검색, 목록, 상세, 업로드, 삭제)        │
│  └── Storage Engine (Multer 파일 파서, JSON DB 핸들러)       │
└──────────────────────────────┬──────────────────────────────┘
                               │ File I/O
┌──────────────────────────────▼──────────────────────────────┐
│                    로컬 파일 시스템 (Storage)               │
│  ├── data/laws.json          : 법령/행정규칙 메타데이터 & 조문 │
│  └── storage/uploads/        : 업로드된 원본 문서 파일 보관   │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. 프로젝트 디렉터리 구조

```
c:\test\edu\
├── server.js               # 메인 백엔드 서버 (Express, API 및 정적 파일 라우팅)
├── package.json            # Node.js 프로젝트 설정 및 의존성 선언
├── start.bat               # 윈도우 원클릭 자동 실행 배치 파일
├── PRD.md                  # 기능 요구사항 정의서
├── Architecture.md         # 시스템 아키텍처 문서
├── Operation.md            # 설치 및 운영 가이드
├── README.md               # 프로젝트 기본 설명서
├── data/
│   └── laws.json           # 법령/행정규칙 데이터 저장소 (초기 기본 데이터 포함)
├── storage/
│   └── uploads/            # 수동 업로드된 원본 파일(PDF, HWP, TXT 등) 보관소
└── public/                 # 웹 클라이언트 프론트엔드 정적 파일
    ├── index.html          # 메인 화면 (첨부3 스타일)
    ├── list.html           # 법령/행정규칙 목록 및 검색 결과 화면
    ├── view.html           # 본문 상세 뷰어 화면 (첨부2 스타일, 새 창)
    ├── admin.html          # 관리자 파일 업로드 및 관리 화면
    ├── css/
    │   └── style.css       # 첨부1 5색 팔레트 기반 공통 디자인 시스템
    └── js/
        ├── common.js       # 공통 유틸리티 (헤더, 네비게이션, API 호출 등)
        ├── main.js         # 메인 화면 로직 (검색 입력 처리)
        ├── list.js         # 목록 조회 및 필터/검색 처리
        ├── view.js         # 조문 트리 렌더링 및 본문 스크롤 싱크
        └── admin.js        # 파일 수동 업로드 및 데이터 등록/삭제 처리
```

---

## 3. 모듈별 역할 및 책임

### 3.1 백엔드 모듈 (`server.js`)
- **정적 파일 서빙**: `public/` 디렉터리의 웹 리소스 및 `storage/uploads/`의 첨부파일 서빙
- **법령 데이터 핸들러**: `data/laws.json` 파일을 안전하게 읽고 쓰는 File-based Repository 역할
- **파일 업로드 미들웨어 (Multer)**: 업로드된 파일의 유효성 검증 및 로컬 디렉터리 저장
- **검색 엔진**: 법령명(title), 조문 본문(articles), 소관부서(department) 대상의 인메모리 필터링/전문 검색 지원

### 3.2 데이터 스토리지 (`data/laws.json`)
- **데이터 스키마**:
  ```json
  [
    {
      "id": "law-001",
      "category": "law",          // "law" (법령) 또는 "rule" (행정규칙)
      "subType": "대통령령",       // 세부 구분 (법률, 대통령령, 부령, 훈령, 예규, 고시 등)
      "title": "해양경비법 시행령",
      "enforceDate": "2026-10-27",
      "promulgationNo": "대통령령 제36794호",
      "department": "해양경찰청(경비과), 032-835-2151",
      "revisionType": "일부개정",
      "originalFile": "filename.pdf",
      "articles": [
        {
          "chapter": "제1장 총칙",
          "articleNo": "제1조",
          "title": "목적",
          "content": "이 영은 「해양경비법」에서 위임된 사항과 그 시행에 필요한 사항을 규정함을 목적으로 한다."
        }
      ]
    }
  ]
  ```

### 3.3 프론트엔드 모듈
1. **메인 화면 (`index.html`, `main.js`)**
   - 첨부3에 정의된 UI 구조 구현:
     - '해양경찰 법령정보센터' 타이틀
     - '법령', '행정규칙' 상단 네비게이션
     - 중앙 검색바 (키워드 입력 및 법령/행정규칙 셀렉터)
2. **목록 화면 (`list.html`, `list.js`)**
   - 메뉴 클릭(`category=law` or `category=rule`) 또는 검색어(`keyword=...`) 쿼리 파라미터를 수신하여 비동기 데이터 로딩
   - 홈으로 돌아가기 버튼 제공
   - 항목 클릭 시 `window.open('view.html?id=...', '_blank')` 새 창 열기 실행
3. **상세 뷰어 화면 (`view.html`, `view.js`)**
   - 첨부2의 2분할 조문 뷰어 구현:
     - 좌측: 조문 목차 트리(Tree-view)
     - 우측: 법령 상세 본문, 화면 내 검색, 폰트 조절, 인쇄 기능
4. **관리자 화면 (`admin.html`, `admin.js`)**
   - `multipart/form-data`를 통한 파일 로컬 업로드
   - 법령/행정규칙 메타데이터 및 조문 텍스트 등록 폼 제공
5. **디자인 시스템 (`style.css`)**
   - 첨부1 컬러 팔레트 CSS Custom Properties(변수) 선언 및 컴포넌트 스타일 적용

---

## 4. RESTful API 명세

| Method | Endpoint | 설명 | 파라미터 / Payload |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/laws` | 법령/행정규칙 목록 및 검색 | `category` (law/rule/all), `keyword` (검색어) |
| `GET` | `/api/laws/:id` | 특정 법령/행정규칙 상세 조회 | `id` (법령 ID) |
| `POST` | `/api/laws` | 신규 법령 수동 업로드 및 등록 | `multipart/form-data` (메타데이터 + 파일) |
| `DELETE` | `/api/laws/:id` | 법령 항목 삭제 | `id` (법령 ID) |
| `GET` | `/download/:filename` | 원본 첨부파일 다운로드 | `filename` (파일명) |

