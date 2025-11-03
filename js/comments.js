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