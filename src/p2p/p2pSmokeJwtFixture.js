/**
 * Playwright / smoke용 mock admin JWT (실제 서명·서버 검증 없음).
 */
export const MOCK_ADMIN_SMOKE_JWT = "smoke-mock-admin-jwt-ute";

export const MOCK_ADMIN_SMOKE_USER = Object.freeze({
  id: 1,
  email: "smoke@tetherget.com",
  role: "admin",
  nickname: "SmokeAdmin",
});

/** @returns {{ token: string, user: object }} */
export function getMockAdminSmokeAuthResponse() {
  return {
    token: MOCK_ADMIN_SMOKE_JWT,
    user: { ...MOCK_ADMIN_SMOKE_USER },
  };
}

/** @returns {Record<string, string>} */
export function buildMockAdminSmokeAuthHeaders() {
  return {
    Authorization: `Bearer ${MOCK_ADMIN_SMOKE_JWT}`,
  };
}

/**
 * @param {string|undefined|null} token
 */
export function isMockAdminSmokeToken(token) {
  return token === MOCK_ADMIN_SMOKE_JWT;
}

/** @param {string} [pathname] */
export function isSimpleAdminSmokePath(pathname = "") {
  return String(pathname).startsWith("/smoke/simple-admin");
}
