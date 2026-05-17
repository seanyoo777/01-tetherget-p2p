/**
 * Fixed mock admin test account (localStorage / local verify only).
 * NOT a production service account.
 */

export const MOCK_ADMIN_EMAIL = "admin@tetherget.local";
export const MOCK_ADMIN_PASSWORD = "admin1234";
export const MOCK_ADMIN_ROLE = "super_admin";
export const MOCK_ADMIN_SESSION_ROLE = "hq_ops";
export const MOCK_ADMIN_NICKNAME = "본사 관리자 (mock)";
export const MOCK_ADMIN_LEGACY_ROLE_LABEL = "슈퍼페이지 관리자";

export const MOCK_ADMIN_ALLOW_EMAILS = Object.freeze([
  MOCK_ADMIN_EMAIL,
  "admin@tetherget.com",
  "admin@tetherget.test",
  "hq2@tetherget.test",
]);

/** @readonly */
export const MOCK_ADMIN_SEED_ROW = Object.freeze({
  id: "AUTH-ADMIN-LOCAL",
  email: MOCK_ADMIN_EMAIL,
  password: MOCK_ADMIN_PASSWORD,
  nickname: MOCK_ADMIN_NICKNAME,
  role: MOCK_ADMIN_LEGACY_ROLE_LABEL,
  session_role: MOCK_ADMIN_SESSION_ROLE,
  sales_level: null,
  createdAt: "2026-05-01",
  mockOnly: true,
  systemRole: MOCK_ADMIN_ROLE,
});

export function isMockAdminEmail(email) {
  return MOCK_ADMIN_ALLOW_EMAILS.includes(String(email || "").trim().toLowerCase());
}

/** Admin-class role labels (API super_admin vs local Korean display strings). */
export function isElevatedAdminRoleLabel(role) {
  const s = String(role || "").trim().toLowerCase();
  return (
    s === "super_admin"
    || s === "superadmin"
    || s === "admin"
    || s === "hq_ops"
    || s === "hqops"
    || s.includes("관리자")
    || s.includes("영업")
    || s.includes("본사")
    || s.includes("슈퍼")
    || s.includes("운영")
  );
}

/**
 * Avoid setCurrentRole ping-pong between API role tokens and seed display labels.
 * @param {string} currentRole
 * @param {string} nextRole
 */
export function shouldApplyAuthUserRoleSync(currentRole, nextRole) {
  const next = String(nextRole || "").trim();
  const current = String(currentRole || "").trim();
  if (!next || next === current) return false;
  if (isElevatedAdminRoleLabel(current) && isElevatedAdminRoleLabel(next)) return false;
  if (next === "회원" && isElevatedAdminRoleLabel(current)) return false;
  if (isElevatedAdminRoleLabel(current) && !isElevatedAdminRoleLabel(next)) return false;
  return true;
}

export function getMockAdminLoginHint() {
  return {
    email: MOCK_ADMIN_EMAIL,
    password: MOCK_ADMIN_PASSWORD,
    role: MOCK_ADMIN_ROLE,
    session_role: MOCK_ADMIN_SESSION_ROLE,
    mockOnly: true,
  };
}
