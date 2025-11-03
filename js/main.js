// ====== 初期処理 ======
window.addEventListener("DOMContentLoaded", () => {
  // 審査者名の復元
  const savedReviewer = localStorage.getItem(STORAGE_KEY_REVIEWER) || "";
  document.getElementById("reviewerName").value = savedReviewer;

  // 定型コメントを読み込み
  loadCommentPresets();

  // イベントハンドラ登録
  setupEventHandlers();

  // ★ 追加：入力監視（保存後の編集で確定ボタンを自動OFFにするため）
  const commentEl  = document.getElementById("commentInput");
  const reviewerEl = document.getElementById("reviewerName");
  if (commentEl)  commentEl.addEventListener("input", updateActionButtonsState);
  if (reviewerEl) reviewerEl.addEventListener("input", updateActionButtonsState);

  // 初期状態（data.csv未ロード）
  renderPaperList(); // 空
  showPlaceholderPaper();
  updateStatsUI();
  updateLoadStatus("（まだ読み込まれていません）");
  // ★ 追加：初回同期（起動直後＝保存のみ有効／確定・未確定は無効）
  updateActionButtonsState();  
});