/**
 * 세션 역할 (메인 서비스 앱 — 플랫폼 오너는 /owner 별도 엔트리)
 * - hq_ops: 본사 운영(직원). 거래 UI 비활성, 관리자 패널 저장 권한 유지.
 * - sales: 영업(레퍼럴 L1~). 관리자 패널 접근, 저장/API 일부는 제한(allowDestructiveAdminWrite=false).
 * - user: 일반 회원.
 */
export const SESSION_ROLE = Object.freeze({
  HQ_OPS: "hq_ops",
  SALES: "sales",
  USER: "user",
});

/**
 * @param {object} p
 * @param {string} [p.legacyRole]
 * @param {string} [p.email]
 * @param {string|null} [p.sessionRoleHint] — 백엔드/저장된 명시 역할
 * @param {number|null} [p.salesLevel] — 영업 레벨 (1=레퍼럴 1단, 확장 시 2~10…)
 */
export function deriveSessionProfile({
  legacyRole = "",
  email = "",
  sessionRoleHint = null,
  salesLevel: explicitSalesLevel = null,
} = {}) {
  const lr = String(legacyRole || "");
  let sessionRole =
    sessionRoleHint && Object.values(SESSION_ROLE).includes(sessionRoleHint) ? sessionRoleHint : null;
  let salesLevel =
    explicitSalesLevel != null && Number.isFinite(Number(explicitSalesLevel)) ? Number(explicitSalesLevel) : null;

  if (!sessionRole) {
    if (lr.includes("영업") || lr.includes("레벨")) {
      sessionRole = SESSION_ROLE.SALES;
      salesLevel = salesLevel ?? 1;
    } else if (
      lr.includes("본사")
      || lr.includes("운영관리자")
      || lr.includes("슈퍼관리자")
      || lr.includes("관리자")
    ) {
      sessionRole = SESSION_ROLE.HQ_OPS;
      salesLevel = null;
    } else {
      sessionRole = SESSION_ROLE.USER;
    }
  }

  if (sessionRole === SESSION_ROLE.SALES && (salesLevel == null || !Number.isFinite(salesLevel))) {
    salesLevel = 1;
  }

  const isHqOps = sessionRole === SESSION_ROLE.HQ_OPS;
  const isSales = sessionRole === SESSION_ROLE.SALES;

  return {
    sessionRole,
    salesLevel: isSales ? salesLevel : null,
    email: String(email || "").trim().toLowerCase(),
    /** 본사·영업 모두 관리자 메뉴 진입 (일반 유저만 제외) */
    canAccessAdmin: isHqOps || isSales,
    /** 저장·정책 등 파괴적 관리 작업 — 본사 운영층만 (영업진은 조회·제한 UI) */
    allowDestructiveAdminWrite: isHqOps,
    /** 본사 운영 계정은 거래·내 거래·판매등록 숨김 */
    hideTradingUi: isHqOps,
    displayLabel: isHqOps ? "본사 운영" : isSales ? `영업 L${salesLevel}` : "회원",
  };
}

export function isLoginTestAdminLike(user) {
  if (!user) return false;
  const r = String(user.role || "");
  const sr = user.session_role;
  return (
    r.includes("관리자")
    || r.includes("영업")
    || sr === SESSION_ROLE.HQ_OPS
    || sr === SESSION_ROLE.SALES
  );
}
