import { MOCK_ADMIN_ALLOW_EMAILS } from "../auth/mockAdminAccount.js";

/**
 * 관리자 UI 진입용 안전 권한 판별 (로그아웃·세션 삭제와 무관하게 호출 가능).
 * @param {object} [user]
 * @param {string} [user.email]
 * @param {string} [user.role]
 * @param {string|null} [user.session_role]
 * @param {boolean} [user.isSuperAdmin]
 */
const ALLOW_EMAILS = new Set(MOCK_ADMIN_ALLOW_EMAILS);

const ALLOW_ROLE_TOKENS = new Set(["super_admin", "admin", "hq_ops", "hq", "operator", "sales", "hqops", "superadmin"]);

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
  if (ALLOW_ROLE_TOKENS.has(r) || ALLOW_ROLE_TOKENS.has(sr)) return true;

  const rawRole = String(user.role || "");
  if (rawRole.includes("영업") || rawRole.includes("레벨")) return true;
  if (rawRole.includes("관리자") || rawRole.includes("본사") || rawRole.includes("슈퍼")) return true;

  return false;
}
