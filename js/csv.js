

// ====== CSV読み込み（UTF-8/Shift_JIS自動判定）→ papers セット ======
function handleCSVUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (evt) => {
    const buffer = evt.target.result; // ArrayBuffer
    const bytes = new Uint8Array(buffer);

    // まずUTF-8としてdecodeを試す（fatal: trueで不正ならthrow）
    let textUtf8 = "";
    let utf8Ok = true;
    try {
      textUtf8 = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch (err) {
      utf8Ok = false;
    }

    let finalText = "";
    if (utf8Ok) {
      finalText = textUtf8;
    } else {
      // Shift_JISで再挑戦
      try {
        finalText = new TextDecoder("shift_jis").decode(bytes);
      } catch (err2) {
        // だめなら最後にutf-8で緩くdecode
        finalText = new TextDecoder("utf-8").decode(bytes);
      }
    }

    papers = parseCSV(finalText); // [{id,title,abstract},...]

    if (!papers || papers.length === 0) {
      updateLoadStatus("読み込みに失敗しました（空か形式不正）");
      papers = [];
      renderPaperList();
      showPlaceholderPaper();
      updateStatsUI();
      updateActionButtonsState()
      return;
    }

    currentIndex = 0;
    renderPaperList();
    showPaper(0);
    updateStatsUI();
    updateLoadStatus(`読み込み完了：${papers.length}件`);
  };

  // ArrayBufferとして読む（→上で文字コード判定）
  reader.readAsArrayBuffer(file);
}

// ====== CSVパーサ ======
// 期待ヘッダ: id,title,abstract
// ダブルクォート対応（"テキスト,カンマあり"）
function parseCSV(csvText) {
  const rows = [];
  let cur = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const c = csvText[i];
    const next = csvText[i + 1];

    if (inQuotes) {
      if (c === '"' && next === '"') {
        // "" -> " エスケープ
        field += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        cur.push(field);
        field = "";
      } else if (c === "\r") {
        // CR無視
      } else if (c === "\n") {
        cur.push(field);
        rows.push(cur);
        cur = [];
        field = "";
      } else {
        field += c;
      }
    }
  }

  // 最終行
  if (field.length > 0 || cur.length > 0) {
    cur.push(field);
    rows.push(cur);
  }

  if (rows.length === 0) return [];

  const header = rows[0].map(h => h.trim().toLowerCase());
  const idIdx = header.indexOf("id");
  const titleIdx = header.indexOf("title");
  const absIdx = header.indexOf("abstract");
  const sectionIdx = header.indexOf("section");
  const data = rows.slice(1).map(cols => {
    return {
      id: cols[idIdx] || "",
      title: cols[titleIdx] || "",
      abstract: cols[absIdx] || "",
      section: cols[sectionIdx] || ""
    };
  }).filter(p => p.id || p.title || p.abstract || p.section);

  return data;
}

// ヘッダー右側の読み込み状況
function updateLoadStatus(msg) {
  const el = document.getElementById("loadStatus");
  if (el) el.textContent = msg;
}





// ====== CSVダウンロード（提出用） ======
function sanitizeCSVValue(value) {
  // CSVインジェクション対策: 先頭が = + - @ の場合は'を付ける
  if (typeof value === "string" && /^[=+\-@]/.test(value)) {
    return "'" + value;
  }
  return value;
}

function downloadCSV() {
  const reviewer = document.getElementById("reviewerName").value.trim();
  if (!reviewer) {
    alert("審査者名を入力してください。");
    return;
  }

  const allMine = loadAllReviews().filter(r => r.reviewer === reviewer);
  if (allMine.length === 0) {
    alert("まだこの審査者の保存データがありません。");
    return;
  }

  const headers = ["reviewer","paper_id","score","comment","timestamp","finalized"];
  const lines = [headers.join(",")];

  allMine.forEach(r => {
    const row = [
      sanitizeCSVValue(r.reviewer),
      sanitizeCSVValue(r.paper_id),
      sanitizeCSVValue(String(r.score)),
      sanitizeCSVValue((r.comment || "").replace(/"/g,'""')),
      sanitizeCSVValue(r.timestamp),
      r.finalized ? "true" : "false"
    ].map(v => `"${v}"`);
    lines.push(row.join(","));
  });

  const csvContent = lines.join("\r\n");

  // Excelの文字化け対策でUTF-8 BOM付き
  const BOM = "\uFEFF";
  const blob = new Blob([BOM + csvContent], { type: "text/csv;charset=utf-8;" });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `review_${reviewer}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
