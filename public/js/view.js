// 본문 상세 뷰어 스크립트 (첨부2 스타일)
let currentLawData = null;

function getLawIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('id');
}

window.addEventListener('DOMContentLoaded', () => {
  const id = getLawIdFromUrl();
  if (!id) {
    alert('조회할 법령 ID가 지정되지 않았습니다.');
    window.close();
    return;
  }
  loadLawDetail(id);
});

// 법령 상세 데이터 로딩
async function loadLawDetail(id) {
  try {
    const res = await fetch(`/api/laws/${encodeURIComponent(id)}`);
    const result = await res.json();

    if (!result.success || !result.data) {
      throw new Error(result.message || '법령 데이터를 찾을 수 없습니다.');
    }

    currentLawData = result.data;
    renderViewer(currentLawData);
  } catch (err) {
    console.error(err);
    document.getElementById('lawTitleText').textContent = '오류 발생';
    document.getElementById('articleBodyContainer').innerHTML = `
      <div style="padding: 40px; text-align: center; color: var(--color-terracotta);">
        <h3>법령 정보를 불러오지 못했습니다.</h3>
        <p>${err.message}</p>
      </div>
    `;
  }
}

// 뷰어 화면 렌더링
function renderViewer(law) {
  // 문서 타이틀
  document.title = `${law.title} | 해양경찰 법령정보센터`;

  // 헤더 및 메타정보
  document.getElementById('lawTitleText').textContent = law.title;
  
  const typeBadge = document.getElementById('lawTypeBadge');
  typeBadge.textContent = law.subType || (law.category === 'law' ? '법령' : '행정규칙');
  if (law.category === 'rule') {
    typeBadge.className = 'badge-tag tag-rule';
  } else {
    typeBadge.className = 'badge-tag tag-law';
  }

  document.getElementById('metaEnforceDate').textContent = law.enforceDate || '-';
  document.getElementById('metaPromulgationNo').textContent = law.promulgationNo || '공포번호 미기재';
  document.getElementById('metaPromulgationDate').textContent = law.promulgationDate || '';
  document.getElementById('metaRevisionType').textContent = law.revisionType || '일부개정';
  document.getElementById('metaDepartment').textContent = law.department || '해양경찰청';

  // 원본 다운로드 버튼
  const dlBtn = document.getElementById('btnDownloadOriginal');
  if (law.originalFile) {
    dlBtn.style.display = 'inline-flex';
    dlBtn.href = `/download/${encodeURIComponent(law.originalFile)}`;
    dlBtn.title = `원본 파일 받기: ${law.originalFile}`;
  } else {
    dlBtn.style.display = 'none';
  }

  // 조문 트리 및 본문 렌더링
  renderTreeAndBody(law.chapters || []);
}

function renderTreeAndBody(chapters) {
  const treeContainer = document.getElementById('treeContainer');
  const bodyContainer = document.getElementById('articleBodyContainer');
  const articleCountBadge = document.getElementById('articleCountBadge');

  let treeHtml = '';
  let bodyHtml = '';
  let totalArticleCount = 0;

  if (!chapters || chapters.length === 0) {
    treeContainer.innerHTML = '<div style="padding: 16px; font-size: 13px; color: var(--text-muted);">등록된 조문이 없습니다.</div>';
    bodyContainer.innerHTML = '<div style="padding: 30px; color: var(--text-muted);">등록된 본문 내용이 없습니다.</div>';
    return;
  }

  chapters.forEach((ch, chIdx) => {
    const chTitle = ch.chapterTitle || `제${chIdx + 1}편`;
    treeHtml += `
      <div class="tree-chapter">
        <div class="tree-chapter-title">
          <span>📁</span> ${escapeHtml(chTitle)}
        </div>
    `;

    bodyHtml += `
      <div style="margin-top: 30px; margin-bottom: 16px; border-bottom: 2px solid var(--color-forest); padding-bottom: 6px;">
        <h3 style="font-size: 18px; color: var(--color-forest); font-weight: 800;">${escapeHtml(chTitle)}</h3>
      </div>
    `;

    if (ch.articles && ch.articles.length > 0) {
      ch.articles.forEach((art, artIdx) => {
        totalArticleCount++;
        const targetId = `art-${chIdx}-${artIdx}`;
        const artLabel = `${art.articleNo || ''} ${art.title ? `(${art.title})` : ''}`.trim();

        // 트리 아이템
        treeHtml += `
          <a class="tree-article-item" id="nav-${targetId}" href="javascript:void(0);" onclick="scrollToArticle('${targetId}')">
            • ${escapeHtml(artLabel)}
          </a>
        `;

        // 본문 블록
        bodyHtml += `
          <article class="article-block" id="${targetId}">
            <div class="article-header">
              <span class="article-no">${escapeHtml(art.articleNo || '')}</span>
              ${art.title ? `<span class="article-title-text">(${escapeHtml(art.title)})</span>` : ''}
            </div>
            <div class="article-content">${escapeHtml(art.content || '')}</div>
          </article>
        `;
      });
    }

    treeHtml += `</div>`;
  });

  articleCountBadge.textContent = `${totalArticleCount}개 조문`;
  treeContainer.innerHTML = treeHtml;
  bodyContainer.innerHTML = bodyHtml;
}

// 조문 목차 클릭 시 해당 본문으로 부드럽게 스크롤
function scrollToArticle(targetId) {
  // 활성 표시 갱신
  document.querySelectorAll('.tree-article-item').forEach(el => el.classList.remove('active'));
  const navEl = document.getElementById(`nav-${targetId}`);
  if (navEl) navEl.classList.add('active');

  const targetEl = document.getElementById(targetId);
  if (targetEl) {
    targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // 본문 블록 순간 강조
    targetEl.style.transition = 'background-color 0.4s';
    targetEl.style.backgroundColor = 'var(--color-lime-light)';
    setTimeout(() => {
      targetEl.style.backgroundColor = 'transparent';
    }, 1200);
  }
}

// 화면내 검색 토글
function toggleSearchInput() {
  const box = document.getElementById('inlineSearchBox');
  const input = document.getElementById('inlineSearchInput');
  if (box.style.display === 'none') {
    box.style.display = 'flex';
    input.focus();
  } else {
    box.style.display = 'none';
  }
}

// 화면내 검색 수행
function doInlineSearch() {
  const q = document.getElementById('inlineSearchInput').value.trim();
  const bodyContainer = document.getElementById('articleBodyContainer');
  const matchBadge = document.getElementById('searchMatchCount');

  if (!currentLawData) return;

  // 본문 재렌더링 후 하이라이트 적용
  renderTreeAndBody(currentLawData.chapters || []);

  if (!q) {
    matchBadge.textContent = '';
    return;
  }

  const contentEls = bodyContainer.querySelectorAll('.article-content, .article-title-text');
  let matchCount = 0;
  let firstMatch = null;

  contentEls.forEach(el => {
    const text = el.textContent;
    if (text.toLowerCase().includes(q.toLowerCase())) {
      const regex = new RegExp(`(${escapeRegex(q)})`, 'gi');
      el.innerHTML = text.replace(regex, '<mark class="highlight">$1</mark>');
      matchCount += (text.match(regex) || []).length;
      if (!firstMatch) {
        firstMatch = el.querySelector('mark.highlight');
      }
    }
  });

  matchBadge.textContent = `${matchCount}건 발견`;

  if (firstMatch) {
    firstMatch.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

