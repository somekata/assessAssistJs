// ====== 定数（ストレージキー） ======
const STORAGE_KEY_REVIEWER = "gakkai_reviewer_name";
const STORAGE_KEY_REVIEWS  = "gakkai_reviews_v1";

// ====== グローバル状態 ======
let papers = [];           // [{id, title, abstract}, ...] after CSV upload
let currentIndex = 0;
let selectedScore = null;

// ====== 初期処理 ======
window.addEventListener("DOMContentLoaded", () => {
  // 審査者名の復元
  const savedReviewer = localStorage.getItem(STORAGE_KEY_REVIEWER) || "";
  document.getElementById("reviewerName").value = savedReviewer;

  setupEventHandlers();

  // 初期状態（data.csv未ロード）
  renderPaperList();     // 空リスト
  showPlaceholderPaper();
  updateStatsUI();
  updateLoadStatus("（まだ読み込まれていません）");
});

// ====== イベントハンドラ登録 ======
function setupEventHandlers() {
  // data.csvを読み込む
  const csvInput = document.getElementById("csvInput");
  csvInput.addEventListener("change", handleCSVUpload);

  // 審査者名変更
  const reviewerInput = document.getElementById("reviewerName");
  reviewerInput.addEventListener("input", () => {
    localStorage.setItem(STORAGE_KEY_REVIEWER, reviewerInput.value.trim());
    updateStatsUI();
    renderPaperList();
    if (papers.length > 0) {
      showPaper(currentIndex);
    } else {
      showPlaceholderPaper();
    }
  });

  // 前/次
  document.getElementById("prevBtn").addEventListener("click", () => {
    if (currentIndex > 0) {
      showPaper(currentIndex - 1);
    }
  });

  document.getElementById("nextBtn").addEventListener("click", () => {
    if (currentIndex < papers.length - 1) {
      showPaper(currentIndex + 1);
    }
  });

  // スコアボタン
  document.querySelectorAll(".score-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const score = parseInt(btn.dataset.score, 10);
      selectScore(score);
    });
  });

  // 評価を保存
  document.getElementById("saveBtn").addEventListener("click", () => {
    saveCurrentReview();
  });

  // 評価を確定
  document.getElementById("finalizeBtn").addEventListener("click", () => {
    finalizeCurrentReview();
  });

  // 未確定に戻す
  document.getElementById("unfinalizeBtn").addEventListener("click", () => {
    unfinalizeCurrentReview();
  });

  // CSVダウンロード（採点結果）
  document.getElementById("downloadBtn").addEventListener("click", () => {
    downloadCSV();
  });

  // 全データ初期化
  document.getElementById("resetBtn").addEventListener("click", () => {
    const ok = confirm("本当に全ての保存済み評価を初期化しますか？このPCのデータは元に戻せません。");
    if (!ok) return;

    localStorage.removeItem(STORAGE_KEY_REVIEWS);

    selectedScore = null;
    document.getElementById("commentInput").value = "";
    document.getElementById("saveStatus").textContent = "初期化しました";

    updateScoreButtonsUI();
    updateCurrentScoreDisplay();
    updateStatsUI();
    renderPaperList();
  });

  // 検索
  document.getElementById("searchBox").addEventListener("input", (e) => {
    const q = e.target.value.toLowerCase();
    filterPaperList(q);
  });
}

// ====== CSV読み込み → papers セット ======
function handleCSVUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (evt) => {
    const text = evt.target.result;
    papers = parseCSV(text); // [{id,title,abstract},...]

    if (!papers || papers.length === 0) {
      updateLoadStatus("読み込みに失敗しました（空か形式不正）");
      papers = [];
      renderPaperList();
      showPlaceholderPaper();
      updateStatsUI();
      return;
    }

    currentIndex = 0;
    renderPaperList();
    showPaper(0);
    updateStatsUI();
    updateLoadStatus(`読み込み完了：${papers.length}件`);
  };
  reader.readAsText(file, "UTF-8");
}

// ====== CSVパーサ ======
// ヘッダ1行目: id,title,abstract
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
        // skip CR
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

  // 最終行をpush
  if (field.length > 0 || cur.length > 0) {
    cur.push(field);
    rows.push(cur);
  }

  if (rows.length === 0) return [];

  const header = rows[0].map(h => h.trim().toLowerCase());
  const idIdx = header.indexOf("id");
  const titleIdx = header.indexOf("title");
  const absIdx = header.indexOf("abstract");

  const data = rows.slice(1).map(cols => {
    return {
      id: cols[idIdx] || "",
      title: cols[titleIdx] || "",
      abstract: cols[absIdx] || ""
    };
  }).filter(p => p.id || p.title || p.abstract);

  return data;
}

// ヘッダー右側の読み込み状況
function updateLoadStatus(msg) {
  document.getElementById("loadStatus").textContent = msg;
}

// ====== localStorageでのレビュー管理 ======
function loadAllReviews() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY_REVIEWS) || "[]");
  } catch (e) {
    console.error("Failed to parse reviews from localStorage", e);
    return [];
  }
}

function saveAllReviews(arr) {
  localStorage.setItem(STORAGE_KEY_REVIEWS, JSON.stringify(arr));
}

function getMyReviewFor(paperId) {
  const reviewer = document.getElementById("reviewerName").value.trim();
  if (!reviewer) return null;
  const all = loadAllReviews();
  return all.find(r => r.reviewer === reviewer && r.paper_id === paperId) || null;
}

// ====== スコア操作UI ======
function selectScore(score) {
  selectedScore = score;
  updateScoreButtonsUI();
  updateCurrentScoreDisplay();
}

function updateScoreButtonsUI() {
  document.querySelectorAll(".score-btn").forEach(btn => {
    const s = parseInt(btn.dataset.score, 10);
    btn.classList.toggle("active", s === selectedScore);
  });
}

function updateCurrentScoreDisplay() {
  document.getElementById("currentScoreDisplay").textContent =
    selectedScore ? selectedScore : "-";
}

// ====== 演題表示 ======
function showPlaceholderPaper() {
  document.getElementById("paperId").textContent = "ID: -";
  document.getElementById("paperTitle").textContent = "（タイトル）";
  document.getElementById("paperAbstract").textContent =
    "data.csvを読み込むと、ここに抄録が表示されます。";

  document.getElementById("currentIndexInfo").textContent =
    `0 / 0`;

  selectedScore = null;
  document.getElementById("commentInput").value = "";
  updateScoreButtonsUI();
  updateCurrentScoreDisplay();
  document.getElementById("saveStatus").textContent = "";
  highlightActivePaper();
}

function showPaper(index) {
  if (!papers || papers.length === 0) {
    showPlaceholderPaper();
    return;
  }

  currentIndex = index;
  const p = papers[index];

  document.getElementById("paperId").textContent = "ID: " + p.id;
  document.getElementById("paperTitle").textContent = p.title;
  document.getElementById("paperAbstract").textContent = p.abstract;

  document.getElementById("currentIndexInfo").textContent =
    (index + 1) + " / " + papers.length;

  // 復元：この審査者のこの演題の既存レビュー
  const myReview = getMyReviewFor(p.id);
  if (myReview) {
    selectedScore = myReview.score;
    document.getElementById("commentInput").value = myReview.comment;
  } else {
    selectedScore = null;
    document.getElementById("commentInput").value = "";
  }

  updateScoreButtonsUI();
  updateCurrentScoreDisplay();
  document.getElementById("saveStatus").textContent = "";

  highlightActivePaper();
}

// ====== レビュー保存・確定・未確定 ======
function saveCurrentReview() {
  const reviewer = document.getElementById("reviewerName").value.trim();
  if (!reviewer) {
    alert("審査者名を入力してください。");
    return;
  }
  if (!selectedScore) {
    alert("スコア(1〜5)を選んでください。");
    return;
  }
  if (!papers.length) {
    alert("data.csvが読み込まれていません。");
    return;
  }

  const comment = document.getElementById("commentInput").value.trim();
  const currentPaper = papers[currentIndex];
  const ts = new Date().toISOString();

  let all = loadAllReviews();
  const idx = all.findIndex(r =>
    r.reviewer === reviewer && r.paper_id === currentPaper.id
  );

  if (idx >= 0) {
    // finalizedは保持
    all[idx] = {
      ...all[idx],
      score: selectedScore,
      comment: comment,
      timestamp: ts
    };
  } else {
    all.push({
      reviewer: reviewer,
      paper_id: currentPaper.id,
      score: selectedScore,
      comment: comment,
      timestamp: ts,
      finalized: false
    });
  }

  saveAllReviews(all);

  document.getElementById("saveStatus").textContent = "保存しました ✔";

  updateStatsUI();
  renderPaperList();
}

function finalizeCurrentReview() {
  const reviewer = document.getElementById("reviewerName").value.trim();
  if (!reviewer) {
    alert("審査者名を入力してください。");
    return;
  }
  if (!papers.length) {
    alert("data.csvが読み込まれていません。");
    return;
  }

  const currentPaper = papers[currentIndex];
  let all = loadAllReviews();

  const idx = all.findIndex(r =>
    r.reviewer === reviewer && r.paper_id === currentPaper.id
  );

  if (idx === -1) {
    alert("まず『評価を保存』でスコアとコメントを記録してください。");
    return;
  }

  all[idx].finalized = true;
  all[idx].timestamp = new Date().toISOString();
  saveAllReviews(all);

  document.getElementById("saveStatus").textContent = "確定しました 🔒";

  updateStatsUI();
  renderPaperList();
}

function unfinalizeCurrentReview() {
  const reviewer = document.getElementById("reviewerName").value.trim();
  if (!reviewer) {
    alert("審査者名を入力してください。");
    return;
  }
  if (!papers.length) {
    alert("data.csvが読み込まれていません。");
    return;
  }

  const currentPaper = papers[currentIndex];
  let all = loadAllReviews();

  const idx = all.findIndex(r =>
    r.reviewer === reviewer && r.paper_id === currentPaper.id
  );

  if (idx === -1) {
    alert("まだこの演題の評価データがありません。");
    return;
  }

  all[idx].finalized = false;
  all[idx].timestamp = new Date().toISOString();
  saveAllReviews(all);

  document.getElementById("saveStatus").textContent = "未確定に戻しました 🌀";

  updateStatsUI();
  renderPaperList();
}

// ====== リスト表示と検索 ======
function getStatusForPaper(paperId, reviewer) {
  // "red" = 未着手, "yellow" = 保存済み未確定, "blue" = 確定
  if (!reviewer) return "red";

  const all = loadAllReviews();
  const rec = all.find(r => r.reviewer === reviewer && r.paper_id === paperId);

  if (!rec) return "red";
  if (rec.finalized) return "blue";
  return "yellow";
}

function renderPaperList(filteredIndexes = null) {
  const ul = document.getElementById("paperList");
  ul.innerHTML = "";

  const reviewer = document.getElementById("reviewerName").value.trim();
  const idxArray = filteredIndexes ?? papers.map((_, i) => i);

  idxArray.forEach(i => {
    const p = papers[i];
    const li = document.createElement("li");
    li.dataset.index = i;

    const status = getStatusForPaper(p.id, reviewer);
    if (status === "red") li.classList.add("state-red");
    if (status === "yellow") li.classList.add("state-yellow");
    if (status === "blue") li.classList.add("state-blue");

    li.innerHTML = `
      <div class="pid">ID: ${p.id}</div>
      <div class="ptitle">${p.title}</div>
    `;

    li.addEventListener("click", () => {
      showPaper(i);
    });

    ul.appendChild(li);
  });

  highlightActivePaper();

  // リストが空ならインデックス表示も0/0に
  const info = document.getElementById("currentIndexInfo");
  if (papers.length === 0) {
    info.textContent = "0 / 0";
  }
}

function filterPaperList(q) {
  if (!papers.length) {
    renderPaperList([]);
    return;
  }

  const matchedIndexes = [];
  papers.forEach((p, idx) => {
    const hay = (p.id + " " + p.title + " " + p.abstract).toLowerCase();
    if (hay.includes(q)) {
      matchedIndexes.push(idx);
    }
  });
  renderPaperList(matchedIndexes);
}

function highlightActivePaper() {
  const lis = document.querySelectorAll("#paperList li");
  lis.forEach(li => {
    const idx = parseInt(li.dataset.index, 10);
    li.classList.toggle("active", idx === currentIndex);
  });
}

// ====== 集計表示 ======
function updateStatsUI() {
  const reviewer = document.getElementById("reviewerName")?.value?.trim() || "";
  const all = loadAllReviews();

  // スコア分布
  const mine = reviewer ? all.filter(r => r.reviewer === reviewer) : [];
  const countsScore = {1:0,2:0,3:0,4:0,5:0};
  mine.forEach(r => {
    if (countsScore[r.score] !== undefined) {
      countsScore[r.score]++;
    }
  });
  for (let s = 1; s <= 5; s++) {
    const el = document.getElementById("count"+s);
    if (el) el.textContent = countsScore[s] ?? 0;
  }

  // 進捗サマリ
  let notStarted = 0;
  let inProgress = 0;
  let finalized = 0;

  papers.forEach(p => {
    const st = getStatusForPaper(p.id, reviewer);
    if (st === "red") notStarted++;
    else if (st === "yellow") inProgress++;
    else if (st === "blue") finalized++;
  });

  const nsEl = document.getElementById("countNotStarted");
  const ipEl = document.getElementById("countInProgress");
  const fnEl = document.getElementById("countFinalized");

  if (nsEl) nsEl.textContent = notStarted;
  if (ipEl) ipEl.textContent = inProgress;
  if (fnEl) fnEl.textContent = finalized;
}

// ====== 自分の採点結果をCSVでダウンロード ======
function downloadCSV() {
  const reviewer = document.getElementById("reviewerName").value.trim();
  if (!reviewer) {
    alert("審査者名を入力してください。");
    return;
  }

  const all = loadAllReviews().filter(r => r.reviewer === reviewer);
  if (all.length === 0) {
    alert("まだこの審査者の保存データがありません。");
    return;
  }

  const headers = ["reviewer","paper_id","score","comment","timestamp","finalized"];
  const lines = [headers.join(",")];

  all.forEach(r => {
    const row = [
      r.reviewer,
      r.paper_id,
      r.score,
      (r.comment || "").replace(/"/g,'""'),
      r.timestamp,
      r.finalized ? "true" : "false"
    ].map(v => `"${v}"`);
    lines.push(row.join(","));
  });

  const csvContent = lines.join("\r\n");

  // Excel向けにBOM付きUTF-8
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
