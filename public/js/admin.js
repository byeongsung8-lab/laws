// 관리자 화면 스크립트 (파일 Base64 + JSON 안정 전송)
window.addEventListener('DOMContentLoaded', () => {
  loadAdminList();
});

// 구분 변경에 따른 세부분류 자동 설정
function handleCategoryChange() {
  const cat = document.getElementById('formCategory').value;
  const subType = document.getElementById('formSubType');
  if (cat === 'rule') {
    subType.value = '훈령';
  } else {
    subType.value = '법률';
  }
}

// 예시 템플릿 채우기
function fillSampleTemplate() {
  document.getElementById('formCategory').value = 'rule';
  document.getElementById('formSubType').value = '훈령';
  document.getElementById('formTitle').value = '해양오염 방제 자재 및 약제 관리규칙';
  document.getElementById('formRevisionType').value = '일부개정';
  document.getElementById('formPromulgationNo').value = '해양경찰청훈령 제588호';
  document.getElementById('formEnforceDate').value = '2026. 11. 15.';
  document.getElementById('formDepartment').value = '해양경찰청 (해양오염방제국), 032-835-2561';
  document.getElementById('formDescription').value = '해양오염사고 시 신속한 방제작업을 위해 비축하는 방제자재의 기준 및 유지관리에 관한 사항을 규정함';
  document.getElementById('formRawText').value = 
`제1장 총칙
제1조(목적) 이 규칙은 「해양환경관리법」에 따라 해양경찰청에서 관리하는 방제자재 및 약제의 비축과 관리에 필요한 사항을 정함을 목적으로 한다.
제2조(정의) 이 규칙에서 "방제자재"란 오일펜스, 유흡착재, 유처리제 등 유류 및 위험유해물질(HNS)의 유출 시 사용되는 장비와 소모품을 말한다.

제2장 비축 및 점검
제3조(비축기준) 지방해양경찰청장 및 해양경찰서장은 관할 해역의 위험도에 따라 적정 수량의 방제자재를 상시 비축하여야 한다.
제4조(정기점검) 방제자재의 성능 유지를 위하여 분기별 1회 이상 정기점검을 실시하고 그 결과를 기록 보관하여야 한다.`;
}

// 파일을 Base64 문자열로 읽는 헬퍼 함수
function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
    reader.readAsDataURL(file);
  });
}

// 텍스트를 구조화된 Chapter / Article 배열로 변환
function parseRawTextToChapters(rawText, defaultTitle) {
  if (!rawText || !rawText.trim()) {
    return [
      {
        chapterTitle: "제1장 총칙",
        articles: [
          {
            articleNo: "제1조",
            title: "목적",
            content: `${defaultTitle}에 관한 제반 사항을 규정함을 목적으로 한다.`
          }
        ]
      }
    ];
  }

  const lines = rawText.split('\n');
  const chapters = [];
  let currentChapter = {
    chapterTitle: "제1장 총칙",
    articles: []
  };
  let currentArticle = null;

  for (let line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // 장 판별
    const chapterMatch = trimmed.match(/^(제\s*\d+\s*장\s*.*|부칙.*)$/);
    if (chapterMatch) {
      if (currentArticle) {
        currentChapter.articles.push(currentArticle);
        currentArticle = null;
      }
      if (currentChapter.articles.length > 0) {
        chapters.push(currentChapter);
      }
      currentChapter = {
        chapterTitle: chapterMatch[1],
        articles: []
      };
      continue;
    }

    // 조문 판별
    const articleMatch = trimmed.match(/^(제\s*\d+\s*조(?:\s*의\s*\d+)?|부칙\s*제\s*\d+\s*조)(?:\(([^)]+)\))?\s*(.*)$/);
    if (articleMatch) {
      if (currentArticle) {
        currentChapter.articles.push(currentArticle);
      }
      currentArticle = {
        articleNo: articleMatch[1].replace(/\s+/g, ''),
        title: articleMatch[2] ? articleMatch[2].trim() : '',
        content: articleMatch[3] ? articleMatch[3].trim() : ''
      };
      continue;
    }

    // 기존 조문의 추가 본문
    if (currentArticle) {
      currentArticle.content += (currentArticle.content ? '\n' : '') + trimmed;
    } else {
      currentArticle = {
        articleNo: "전문",
        title: "개요",
        content: trimmed
      };
    }
  }

  if (currentArticle) {
    currentChapter.articles.push(currentArticle);
  }
  if (currentChapter.articles.length > 0) {
    chapters.push(currentChapter);
  }

  return chapters.length > 0 ? chapters : [
    {
      chapterTitle: "본문",
      articles: [{ articleNo: "전문", title: "내용", content: rawText }]
    }
  ];
}

// 업로드 폼 제출 처리 (안전한 JSON + Base64 방식)
async function handleUploadSubmit(event) {
  event.preventDefault();
  const btn = document.getElementById('btnSubmitForm');
  btn.disabled = true;
  btn.textContent = '업로드 처리 중...';

  try {
    const category = document.getElementById('formCategory').value;
    const subType = document.getElementById('formSubType').value;
    const title = document.getElementById('formTitle').value.trim();
    const revisionType = document.getElementById('formRevisionType').value;
    const promulgationNo = document.getElementById('formPromulgationNo').value.trim();
    const enforceDate = document.getElementById('formEnforceDate').value.trim();
    const department = document.getElementById('formDepartment').value.trim();
    const description = document.getElementById('formDescription').value.trim();
    const rawText = document.getElementById('formRawText').value;
    const fileInput = document.getElementById('formFile');

    // 조문 파싱
    const chapters = parseRawTextToChapters(rawText, title);

    const payload = {
      category,
      subType,
      title,
      revisionType,
      promulgationNo,
      enforceDate,
      department,
      description,
      articlesJson: chapters,
      fileName: '',
      fileBase64: ''
    };

    // 첨부 파일이 있을 경우 Base64로 안전하게 인코딩
    if (fileInput.files.length > 0) {
      const file = fileInput.files[0];
      payload.fileName = file.name;
      payload.fileBase64 = await readFileAsBase64(file);
    }

    const res = await fetch('/api/laws', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      throw new Error(`서버 응답 오류 (HTTP ${res.status})`);
    }

    const result = await res.json();
    if (!result.success) {
      throw new Error(result.message || '등록에 실패했습니다.');
    }

    alert(`[성공] "${title}" 이(가) 로컬 저장소에 성공적으로 등록되었습니다!`);
    document.getElementById('uploadLawForm').reset();
    loadAdminList();
  } catch (err) {
    console.error('Upload Error:', err);
    if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
      alert('오류 발생: 서버와의 통신이 원활하지 않습니다.\n\n[점검 사항]\n1. 로컬 서버(검은색 콘솔 창 또는 start.bat)가 정상적으로 켜져 있는지 확인해주세요.\n2. 브라우저 주소가 http://localhost:3000 인지 확인해주세요.');
    } else {
      alert('오류 발생: ' + err.message);
    }
  } finally {
    btn.disabled = false;
    btn.textContent = '💾 로컬에 등록 및 파일 저장';
  }
}

// 등록된 전체 법령 목록 불러오기
async function loadAdminList() {
  const tbody = document.getElementById('adminTableBody');
  const countEl = document.getElementById('adminTotalCount');

  try {
    const res = await fetch('/api/laws?category=all');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const result = await res.json();
    const list = result.data || [];

    countEl.textContent = `총 ${list.length}건`;

    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px;">등록된 데이터가 없습니다.</td></tr>';
      return;
    }

    let html = '';
    list.forEach(item => {
      const isLaw = item.category === 'law';
      const badgeClass = isLaw ? 'tag-law' : 'tag-rule';

      html += `
        <tr>
          <td><span class="badge-tag ${badgeClass}">${item.subType}</span></td>
          <td>
            <strong>${escapeHtml(item.title)}</strong>
            <div style="font-size: 11px; color: var(--text-muted);">${escapeHtml(item.promulgationNo || '')}</div>
          </td>
          <td style="font-size: 13px;">${escapeHtml(item.enforceDate || '-')}</td>
          <td style="font-size: 12px; color: var(--text-secondary);">
            ${item.originalFile ? `📄 ${escapeHtml(item.originalFile)}` : '<span style="color:#aaa;">없음</span>'}
          </td>
          <td style="text-align: center;">
            <button type="button" class="tool-btn" onclick="deleteLaw('${item.id}', '${escapeHtml(item.title)}')" style="color: var(--color-terracotta); padding: 3px 8px; font-size: 11px;">
              삭제
            </button>
          </td>
        </tr>
      `;
    });

    tbody.innerHTML = html;
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:red;">목록 조회 오류: ${err.message}</td></tr>`;
  }
}

// 법령 삭제
async function deleteLaw(id, title) {
  if (!confirm(`정말로 "${title}" 항목을 삭제하시겠습니까?`)) {
    return;
  }

  try {
    const res = await fetch(`/api/laws/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
    const result = await res.json();
    if (!result.success) throw new Error(result.message);

    alert('삭제되었습니다.');
    loadAdminList();
  } catch (err) {
    alert('삭제 오류: ' + err.message);
  }
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
