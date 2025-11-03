// ====== 定数（ストレージキー） ======
const STORAGE_KEY_REVIEWER = "gakkai_reviewer_name";
const STORAGE_KEY_REVIEWS  = "gakkai_reviews_v1";

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