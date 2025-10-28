// ====== 定数（ストレージキー） ======
const STORAGE_KEY_REVIEWER = "gakkai_reviewer_name";
const STORAGE_KEY_REVIEWS  = "gakkai_reviews_v1";

// ====== グローバル状態 ======
let papers = [];              // [{id, title, abstract}, ...] after CSV upload
let currentIndex = 0;
let selectedScore = null;
let commentPresets = [];      // [{id, text}, ...] from comment.json

// ====== 初期処理 ======
window.addEventListener("DOMContentLoaded", () => {
  // 審査者名の復元
  const savedReviewer = localStorage.getItem(STORAGE_KEY_REVIEWER) || "";
  document.getElementById("reviewerName").value = savedReviewer;

  // 定型コメントを読み込み
  loadCommentPresets();

  // イベントハンドラ登録
  setupEventHandlers();

  // 初期状態（data.csv未ロード）
  renderPaperList(); // 空
  showPlaceholderPaper();
  updateStatsUI();
  updateLoadStatus("（まだ読み込まれていません）");
});

// ====== 定型コメントの読み込み ======
async function loadCommentPresets() {
  try {
    const res = await fetch("comment.json");
    if (!res.ok) throw new Error("failed to load comment.json");
    commentPresets = await res.json(); // [{id,text}, ...]

    const selectEl = document.getElementById("commentPresetSelect");
    if (!selectEl) return;

    // 先頭の「（定型コメントを選択）」はそのまま残し、以下を追加
    commentPresets.forEach(preset => {
      const opt = document.createElement("option");
      opt.value = preset.text;
      opt.textContent = preset.text;
      selectEl.appendChild(opt);
    });
  } catch (err) {
    console.error("定型コメントの読み込みに失敗しました:", err);
  }
}

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

  // 前へ / 次へ
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

  // 定型コメント「追加」ボタン
  const addBtn = document.getElementById("addCommentPresetBtn");
  const presetSelect = document.getElementById("commentPresetSelect");
  const commentBox = document.getElementById("commentInput");

  addBtn.addEventListener("click", () => {
    const presetText = presetSelect.value;
    if (!presetText) return;

    const current = commentBox.value.trim();
    if (current === "") {
      commentBox.value = presetText;
    } else {
      commentBox.value = current + " " + presetText;
    }

    // カーソルを末尾に移動して、そのまま追記しやすくする
    commentBox.focus();
    const len = commentBox.value.length;
    commentBox.selectionStart = len;
    commentBox.selectionEnd = len;
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
    if (papers.length > 0) {
      updateEditLockState(papers[currentIndex].id);
    }
  });

  // 検索
  document.getElementById("searchBox").addEventListener("input", (e) => {
    const q = e.target.value.toLowerCase();
    filterPaperList(q);
  });
}

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
  const el = document.getElementById("loadStatus");
  if (el) el.textContent = msg;
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

// ====== スコア選択UI ======
function selectScore(score) {
  // ロック中なら反応しない（安全側）
  const currentPaper = papers[currentIndex];
  if (currentPaper && isPaperLocked(currentPaper.id)) {
    return;
  }

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

// ====== 表示（プレースホルダ） ======
function showPlaceholderPaper() {
  document.getElementById("paperId").textContent = "ID: -";
  document.getElementById("paperTitle").textContent = "（タイトル）";
  document.getElementById("paperAbstract").textContent =
    "data.csvを読み込むと、ここに抄録が表示されます。";

  document.getElementById("currentIndexInfo").textContent = `0 / 0`;

  selectedScore = null;
  document.getElementById("commentInput").value = "";
  updateScoreButtonsUI();
  updateCurrentScoreDisplay();
  document.getElementById("saveStatus").textContent = "";

  highlightActivePaper();

  // ロック状態更新（何もないのでunlock扱い）
  updateEditLockState(null);
}

// ====== 演題表示 ======
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

  // この審査者のこの演題の既存レビューを復元
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

  // 確定済みなら編集ロック、未確定なら編集可
  updateEditLockState(p.id);
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

  const currentPaper = papers[currentIndex];

  // ロック中なら保存禁止
  if (isPaperLocked(currentPaper.id)) {
    alert("この演題は確定済みのため編集できません。まず『未確定に戻す』を押してください。");
    return;
  }

  const comment = document.getElementById("commentInput").value.trim();
  const ts = new Date().toISOString();

  let all = loadAllReviews();
  const idx = all.findIndex(r =>
    r.reviewer === reviewer && r.paper_id === currentPaper.id
  );

  if (idx >= 0) {
    // finalizedは維持
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
  updateEditLockState(currentPaper.id);
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

  updateEditLockState(currentPaper.id);
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

  updateEditLockState(currentPaper.id);
}

// ====== ロック判定とUI制御 ======
function isPaperLocked(paperId) {
  if (!paperId) return false;
  const myReview = getMyReviewFor(paperId);
  return !!(myReview && myReview.finalized === true);
}

// 確定済みなら編集不可、未確定なら編集可にする
function updateEditLockState(paperId) {
  const locked = isPaperLocked(paperId);

  // スコアボタン
  document.querySelectorAll(".score-btn").forEach(btn => {
    btn.disabled = locked;
    btn.style.opacity = locked ? "0.4" : "";
    btn.style.cursor  = locked ? "not-allowed" : "pointer";
  });

  // コメント欄
  const commentBox = document.getElementById("commentInput");
  commentBox.disabled = locked;
  commentBox.style.backgroundColor = locked ? "#eee" : "";
  commentBox.style.opacity = locked ? "0.6" : "";
  commentBox.style.cursor = locked ? "not-allowed" : "text";

  // 定型コメントのUI（プリセット）
  const addPresetBtn = document.getElementById("addCommentPresetBtn");
  const presetSelect = document.getElementById("commentPresetSelect");
  addPresetBtn.disabled = locked;
  presetSelect.disabled = locked;
  addPresetBtn.style.opacity = locked ? "0.4" : "";
  presetSelect.style.opacity = locked ? "0.6" : "";
  addPresetBtn.style.cursor  = locked ? "not-allowed" : "pointer";
  presetSelect.style.cursor  = locked ? "not-allowed" : "pointer";

  // 「評価を保存」
  const saveBtn = document.getElementById("saveBtn");
  saveBtn.disabled = locked;
  saveBtn.style.opacity = locked ? "0.4" : "";
  saveBtn.style.cursor  = locked ? "not-allowed" : "pointer";

  // 「評価を確定」ボタンはロック済みなら押せない
  const finalizeBtn = document.getElementById("finalizeBtn");
  finalizeBtn.disabled = locked;
  finalizeBtn.style.opacity = locked ? "0.4" : "";
  finalizeBtn.style.cursor  = locked ? "not-allowed" : "pointer";

  // 「未確定に戻す」はロック中だけ押せる（ロック解除用）
  const unfinalizeBtn = document.getElementById("unfinalizeBtn");
  const canUnfinalize = locked;
  unfinalizeBtn.disabled = !canUnfinalize;
  unfinalizeBtn.style.opacity = canUnfinalize ? "" : "0.4";
  unfinalizeBtn.style.cursor  = canUnfinalize ? "pointer" : "not-allowed";

  // ステータス表示
  const statusEl = document.getElementById("saveStatus");
  if (locked) {
    statusEl.textContent = "この演題は確定済み（編集ロック中）🔒";
  } else {
    if (!statusEl.textContent) {
      statusEl.textContent = "編集中（未確定）";
    }
  }
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

    // タイトルなどをそのままinnerHTMLに入れているが、
    // 将来的にXSS対策する場合はescapeHTML()を通すことを推奨
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

  // リストが空ならインデックス表示も0/0
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
