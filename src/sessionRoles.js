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

/** API/저장소에서 오는 session_role 문자열 정규화 (대소문자·공백) */
export function normalizeSessionRoleHint(hint) {
  if (hint == null || hint === "") return null;
  const s = String(hint).trim().toLowerCase();
  if (s === SESSION_ROLE.HQ_OPS || s === "hqops") return SESSION_ROLE.HQ_OPS;
  if (s === SESSION_ROLE.SALES) return SESSION_ROLE.SALES;
  if (s === SESSION_ROLE.USER) return SESSION_ROLE.USER;
  return null;
}

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
  const normalizedHint = normalizeSessionRoleHint(sessionRoleHint);
  let sessionRole =
    normalizedHint && Object.values(SESSION_ROLE).includes(normalizedHint) ? normalizedHint : null;
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
      || lr.includes("슈퍼페이지")
      || lr.includes("관리자")
    ) {
      sessionRole = SESSION_ROLE.HQ_OPS;
      salesLevel = null;
    } else {
      sessionRole = SESSION_ROLE.USER;
    }
  }

  /** API가 session_role=user만 주고 role 문자열에는 영업·관리자가 있는 경우(얇은 행) 관리자 메뉴와 일치시키기 */
  if (sessionRole === SESSION_ROLE.USER) {
    if (lr.includes("영업") || lr.includes("레벨")) {
      sessionRole = SESSION_ROLE.SALES;
      salesLevel = salesLevel ?? 1;
    } else if (
      lr.includes("본사")
      || lr.includes("운영관리자")
      || lr.includes("슈퍼관리자")
      || lr.includes("슈퍼페이지")
      || lr.includes("관리자")
    ) {
      sessionRole = SESSION_ROLE.HQ_OPS;
      salesLevel = null;
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
    /**
     * 본사·영업 세션 힌트 (표시·hideTradingUi용).
     * UI admin gate는 `resolveAdminUiAccess` / `canEnterAdminUi` 단일 — Phase 2에서 alias 통합 후보.
     * @see src/admin/resolveAdminUiAccess.js
     */
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
