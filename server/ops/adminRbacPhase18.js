/**
 * Phase 18–20: 관리자 세분 스코프 + 지역 게이트(선택 헤더/쿼리).
 */

const ALL_SCOPES = [
  "ops",
  "feedback",
  "cohort",
  "monetization_read",
  "monetization_write",
  "audit",
  "billing_read",
  "billing_write",
];

function normSr(sr) {
  const s = String(sr || "").trim().toLowerCase();
  if (s === "hq_ops" || s === "hqops" || s === "super_admin" || s === "superadmin") return "hq_ops";
  if (s === "sales") return "sales";
  if (s === "ops_admin" || s === "operations_admin" || s === "operation_admin") return "ops_admin";
  if (s === "cs_admin" || s === "customer_success" || s === "customerservice_admin") return "cs_admin";
  if (s === "user" || s === "") return "user";
  return s;
}

/** @type {Record<string, Set<string>>} */
const ROLE_SCOPES = {
  hq_ops: new Set(ALL_SCOPES),
  ops_admin: new Set(["ops", "feedback", "cohort", "monetization_read", "audit", "billing_read", "billing_write"]),
  cs_admin: new Set(["feedback"]),
  sales: new Set(["cohort", "monetization_read"]),
};

function superLike(user) {
  if (!user) return false;
  const sr = normSr(user.session_role);
  if (sr === "hq_ops") return true;
  return String(user.role || "").includes("슈퍼페이지");
}

/**
 * @param {object} user req.user (JWT payload; admin_regions 배열 권장)
 */
export function adminRegionsForUser(user) {
  if (!user) return ["GLOBAL"];
  const raw = user.admin_regions;
  if (Array.isArray(raw) && raw.length) {
    return raw.map((r) => String(r).trim().toUpperCase().slice(0, 16)).filter(Boolean);
  }
  try {
    const j =
      typeof user.admin_regions_json === "string" ? JSON.parse(user.admin_regions_json) : user.admin_regions_json;
    if (Array.isArray(j) && j.length) {
      return j.map((r) => String(r).trim().toUpperCase().slice(0, 16)).filter(Boolean);
    }
  } catch {
    /* ignore */
  }
  return ["GLOBAL"];
}

/**
 * `X-Ops-Region` 또는 `?region=` 이 있을 때만 검사. 비우면 통과(레거시 호환).
 */
export function requireOpsRegionAccess(req, res, next) {
  const requested = String(req.headers["x-ops-region"] || req.query.region || "").trim().toUpperCase();
  if (!requested) return next();
  const regions = adminRegionsForUser(req.user);
  if (regions.includes("GLOBAL")) return next();
  if (regions.includes(requested)) return next();
  return res.status(403).json({
    message: "해당 리전에 대한 접근이 제한되었습니다.",
    requested_region: requested,
    your_regions: regions,
  });
}

/**
 * @param {object} user req.user
 */
export function scopesForAdminUser(user) {
  if (!user) return new Set();
  if (superLike(user)) return new Set(ALL_SCOPES);
  const sr = normSr(user.session_role);
  if (ROLE_SCOPES[sr]) return new Set(ROLE_SCOPES[sr]);
  const role = String(user.role || "");
  if (role.includes("관리자")) return new Set(ROLE_SCOPES.ops_admin);
  if (role.includes("영업")) return new Set(ROLE_SCOPES.sales);
  return new Set();
}

/**
 * @param {string} scope
 */
export function requireAdminScope(scope) {
  return (req, res, next) => {
    const ok = scopesForAdminUser(req.user).has(scope);
    if (!ok) {
      return res.status(403).json({ message: "이 기능에 대한 권한이 없습니다.", required_scope: scope });
    }
    next();
  };
}
