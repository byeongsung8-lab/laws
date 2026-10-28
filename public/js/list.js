// 목록 화면 스크립트
let currentCategory = 'all';
let currentKeyword = '';
let currentSubType = 'all';
let cachedData = [];

// URL 파라미터 파싱
function getQueryParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    category: params.get('category') || 'all',
    keyword: params.get('keyword') || '',
    subType: params.get('subType') || 'all'
  };
}

// 초기화
window.addEventListener('DOMContentLoaded', () => {
  const query = getQueryParams();
  currentCategory = query.category;
  currentKeyword = query.keyword;
  currentSubType = query.subType;

  if (document.getElementById('listKeywordInput')) {
    document.getElementById('listKeywordInput').value = currentKeyword;
  }

  updateNavState();
  fetchLawList();
});

// 상단 GNB 활성 탭 및 타이틀 업데이트
function updateNavState() {
  const menuLaw = document.getElementById('menuLaw');
  const menuRule = document.getElementById('menuRule');
  const pageTitle = document.getElementById('pageTitle');
  const breadcrumbCategory = document.getElementById('breadcrumbCategory');
  const breadcrumbKeyword = document.getElementById('breadcrumbKeyword');

  if (menuLaw) menuLaw.classList.remove('active');
  if (menuRule) menuRule.classList.remove('active');

  if (currentCategory === 'law') {
    if (menuLaw) menuLaw.classList.add('active');
    pageTitle.textContent = '법령 목록 (법률 · 대통령령 · 부령)';
    breadcrumbCategory.textContent = '법령';
  } else if (currentCategory === 'rule') {
    if (menuRule) menuRule.classList.add('active');
    pageTitle.textContent = '행정규칙 목록 (훈령 · 예규 · 고시)';
    breadcrumbCategory.textContent = '행정규칙';
  } else {
    pageTitle.textContent = '통합 검색 및 전체 목록';
    breadcrumbCategory.textContent = '전체 목록';
  }

  if (currentKeyword) {
    pageTitle.textContent += ` - 검색어: "${currentKeyword}"`;
    breadcrumbKeyword.innerHTML = ` &gt; <span>"${currentKeyword}" 검색 결과</span>`;
  } else {
    breadcrumbKeyword.innerHTML = '';
  }
}

// 백엔드 API에서 목록 데이터 조회
async function fetchLawList() {
  const tableBody = document.getElementById('lawTableBody');
  const resultCount = document.getElementById('resultCount');

  try {
    let url = `/api/laws?category=${encodeURIComponent(currentCategory)}&keyword=${encodeURIComponent(currentKeyword)}`;
    if (currentSubType !== 'all') {
      url += `&subType=${encodeURIComponent(currentSubType)}`;
    }

    const res = await fetch(url);
    const result = await res.json();

    if (!result.success) {
      throw new Error(result.message || '데이터 로딩 실패');
    }

    cachedData = result.data || [];
    resultCount.textContent = cachedData.length;

    renderTable(cachedData);
  } catch (err) {
    console.error(err);
    tableBody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 40px; color: var(--color-terracotta);">
          데이터를 불러오지 못했습니다: ${err.message}
        </td>
      </tr>
    `;
  }
}

// 테이블 렌더링
function renderTable(list) {
  const tableBody = document.getElementById('lawTableBody');

  if (!list || list.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 50px 20px; color: var(--text-muted);">
          <div style="font-size: 24px; margin-bottom: 8px;">📂</div>
          <div style="font-size: 15px; font-weight: 600;">조건에 해당하는 법령 또는 행정규칙이 없습니다.</div>
          <p style="font-size: 13px; margin-top: 6px;">다른 검색어를 입력하시거나 [관리자 모드]에서 신규 파일을 등록해보세요.</p>
        </td>
      </tr>
    `;
    return;
  }

  let html = '';
  list.forEach((item, index) => {
    const isLaw = item.category === 'law';
    const tagClass = isLaw ? 'tag-law' : 'tag-rule';
    const categoryName = isLaw ? '법령' : '행정규칙';

    // 첨부파일 버튼
    let dlBtn = '';
    if (item.originalFile) {
      dlBtn = `
        <a href="/download/${encodeURIComponent(item.originalFile)}" class="btn-file-dl" title="원본 다운로드: ${item.originalFile}">
          💾 다운
        </a>
      `;
    }

    html += `
      <tr>
        <td style="text-align: center; color: var(--text-muted); font-size: 13px;">${index + 1}</td>
        <td>
          <span class="badge-tag ${tagClass}">${item.subType || categoryName}</span>
        </td>
        <td>
          <a href="javascript:void(0);" onclick="openLawView('${item.id}')" class="law-title-link" title="새 창으로 상세 보기">
            ${escapeHtml(item.title)}
          </a>
          <div class="law-sub-info">
            <span>${escapeHtml(item.promulgationNo || '')}</span>
            <span>[${escapeHtml(item.revisionType || '일부개정')}]</span>
            <span style="color: var(--text-muted);">${escapeHtml(item.description || '')}</span>
          </div>
        </td>
        <td style="font-size: 13px; color: var(--text-secondary);">${escapeHtml(item.department || '해양경찰청')}</td>
        <td style="font-size: 13px; font-weight: 600; color: var(--color-forest);">
          ${escapeHtml(item.enforceDate || '-')}
        </td>
        <td style="text-align: center; white-space: nowrap;">
          <button type="button" onclick="openLawView('${item.id}')" class="btn-open-view">
            <span>📖</span> 본문열람 ↗
          </button>
          ${dlBtn}
        </td>
      </tr>
    `;
  });

  tableBody.innerHTML = html;
}

// 새 창에서 본문 상세 뷰어 열람 (첨부2 참조)
function openLawView(lawId) {
  const url = `/view.html?id=${encodeURIComponent(lawId)}`;
  const winWidth = Math.min(1300, window.screen.availWidth - 50);
  const winHeight = Math.min(900, window.screen.availHeight - 80);
  const left = (window.screen.availWidth - winWidth) / 2;
  const top = (window.screen.availHeight - winHeight) / 2;

  window.open(
    url,
    `LawDetail_${lawId}`,
    `width=${winWidth},height=${winHeight},top=${top},left=${left},resizable=yes,scrollbars=yes,status=no,toolbar=no`
  );
}

// 세부 분류 필터
function setSubTypeFilter(subType, btnElement) {
  currentSubType = subType;
  const chips = document.querySelectorAll('#filterChips .chip-btn');
  chips.forEach(c => c.classList.remove('active'));
  if (btnElement) btnElement.classList.add('active');

  fetchLawList();
}

// 목록 내 간이 검색
function handleListSearch(event) {
  event.preventDefault();
  currentKeyword = document.getElementById('listKeywordInput').value.trim();
  updateNavState();
  fetchLawList();
}

// HTML 이스케이프 유틸
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

