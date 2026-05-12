/**
 * 관리자 메뉴·화면 진입용 게이트 (세션 삭제와 무관).
 * @param {object} [user]
 * @param {string} [user.email]
 * @param {string} [user.role]
 * @param {string|null} [user.session_role]
 * @param {boolean} [user.isSuperAdmin]
 */
const ALLOW_EMAILS = new Set(["hq2@tetherget.test", "admin@tetherget.test", "admin@tetherget.com"]);

const ALLOW_SR = new Set(["super_admin", "admin", "hq_ops", "hq", "operator", "sales", "hqops", "superadmin"]);

function norm(s) {
  return String(s ?? "")
    .trim()
    .toLowerCase();
}

export function canAccessAdminSafe(user = {}) {
  const email = norm(user.email);
  if (ALLOW_EMAILS.has(email)) return true;
  if (user.isSuperAdmin === true) return true;
  const r = norm(user.role);
  const sr = norm(user.session_role);
  if (ALLOW_SR.has(r) || ALLOW_SR.has(sr)) return true;
  const raw = String(user.role || "");
  if (raw.includes("영업") || raw.includes("레벨")) return true;
  if (raw.includes("관리자") || raw.includes("본사") || raw.includes("슈퍼")) return true;
  return false;
}
