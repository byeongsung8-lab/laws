// 메인 화면 스크립트
function handleSearch(event) {
  event.preventDefault();
  const category = document.getElementById('searchCategory').value;
  const keyword = document.getElementById('searchInput').value.trim();

  let targetUrl = `/list.html?category=${encodeURIComponent(category)}`;
  if (keyword) {
    targetUrl += `&keyword=${encodeURIComponent(keyword)}`;
  }
  window.location.href = targetUrl;
}

// 새 창에서 본문 상세 뷰어 열람 (첨부2 스타일)
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

