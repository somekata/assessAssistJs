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
  updateActionButtonsState()
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
  updateActionButtonsState()
}

function unfinalizeCurrentReview() {
  const reviewer = document.getElementById("reviewerName").value.trim();
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
  updateActionButtonsState()
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
  updateActionButtonsState()
}

// ====== アクションボタン状態の一元管理 ======
function updateActionButtonsState() {
  const reviewer = document.getElementById("reviewerName")?.value?.trim() || "";
  const saveBtn = document.getElementById("saveBtn");
  const finalizeBtn = document.getElementById("finalizeBtn");
  const unfinalizeBtn = document.getElementById("unfinalizeBtn");

  // いったんツールチップ初期化
  saveBtn.title = "";
  finalizeBtn.title = "";
  unfinalizeBtn.title = "";

  // 未ロード/審査者名なし
  if (!reviewer || !Array.isArray(papers) || papers.length === 0) {
    saveBtn.disabled = true;
    finalizeBtn.disabled = true;
    unfinalizeBtn.disabled = true;

    if (!reviewer) finalizeBtn.title = saveBtn.title = "審査者名を入力してください";
    if (!papers || papers.length === 0) finalizeBtn.title = saveBtn.title = "data.csvを読み込んでください";
    return;
  }

  const currentPaper = papers[currentIndex];
  const locked = isPaperLocked(currentPaper?.id);
  const comment = document.getElementById("commentInput")?.value?.trim() ?? "";

  if (locked) {
    saveBtn.disabled = true;     saveBtn.title = "確定済みのため編集できません";
    finalizeBtn.disabled = true; finalizeBtn.title = "確定済みです";
    unfinalizeBtn.disabled = false;
    unfinalizeBtn.title = "未確定に戻すことができます";
    return;
  }

  // 保存ボタン：スコア未選択なら無効
  const canSave = selectedScore !== null && selectedScore !== undefined;
  saveBtn.disabled = !canSave;
  if (!canSave) saveBtn.title = "スコア(1〜5)を選んでください";

  // 確定ボタン：保存済みと完全一致のときだけ有効
  const all = loadAllReviews();
  const rec = all.find(r => r.reviewer === reviewer && r.paper_id === currentPaper.id);
  const savedMatchesCurrent =
    !!rec &&
    rec.finalized === false &&
    String(rec.score) === String(selectedScore) &&
    (rec.comment || "").trim() === comment;

  finalizeBtn.disabled = !savedMatchesCurrent;
  if (!rec) {
    finalizeBtn.title = "まず『評価を保存』してください";
  } else if (!savedMatchesCurrent) {
    finalizeBtn.title = "保存内容と現在のスコア/コメントが一致していません（保存し直してください）";
  }

  unfinalizeBtn.disabled = true;
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
  updateActionButtonsState()
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
  // ★ここを直す★  ← いまは「要素＝文字列」になってる
  const secEl = document.getElementById("paperSection");
  if (secEl) {
    secEl.textContent = "…";
  }
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

  // ★sectionを追加
  const secEl = document.getElementById("paperSection");
  if (secEl) {
    secEl.textContent = p.section && p.section.trim() !== ""
      ? p.section
      : "（分類なし）";
  }

  console.log(p.section);
  // 背景色を切り替え
  // 既存クラスをリセットしてから新しいクラスを追加
  secEl.classList.remove("sec-basic", "sec-clinical", "sec-other");

  if (p.section === "basic" || p.section === "基礎") {
    secEl.classList.add("sec-basic");
  } else if (p.section === "clinical" || p.section === "臨床") {
    secEl.classList.add("sec-clinical");
  } else {
    secEl.classList.add("sec-other");
  }

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
  updateActionButtonsState()
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