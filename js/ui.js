// ====== グローバル状態 ======
let papers = [];              // [{id, title, abstract}, ...] after CSV upload
let currentIndex = 0;
let selectedScore = null;
let commentPresets = [];      // [{id, text}, ...] from comment.json



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

// === ボタンの有効・無効制御 ===
function updateActionButtons(state) {
  const saveBtn = document.getElementById("saveBtn");
  const finalizeBtn = document.getElementById("finalizeBtn");
  const unfinalizeBtn = document.getElementById("unfinalizeBtn");

  if (state === "initial") {        // 開いた直後・未保存
    saveBtn.disabled = false;
    finalizeBtn.disabled = true;
    unfinalizeBtn.disabled = true;
  } else if (state === "saved") {   // 保存済み
    saveBtn.disabled = false;
    finalizeBtn.disabled = false;
    unfinalizeBtn.disabled = true;
  } else if (state === "finalized") { // 確定済み
    saveBtn.disabled = true;
    finalizeBtn.disabled = true;
    unfinalizeBtn.disabled = false;
  }
}

  // 保存ボタン
  document.getElementById("saveBtn").addEventListener("click", () => {
    saveCurrentReview();
    updateActionButtons("saved");
  });

  // 確定ボタン
  document.getElementById("finalizeBtn").addEventListener("click", () => {
    finalizeCurrentReview();
    updateActionButtons("finalized");
  });

  // 未確定ボタン
  document.getElementById("unfinalizeBtn").addEventListener("click", () => {
    unfinalizeCurrentReview();
    updateActionButtons("initial");
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
    document.getElementById("saveStatus").textContent = "編集中（未確定）";

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