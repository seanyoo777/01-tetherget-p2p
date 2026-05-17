import { canAccessAdminSafe } from "./canAccessAdminSafe.js";
import { SESSION_ROLE } from "../sessionRoles.js";

/** localStorage debug flag — nav·본문·gate 동기 (sessionProfile 단독 우회 금지) */
export function readDebugAdminFlag() {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem("tg_debug_admin") === "1";
  } catch {
    return false;
  }
}

/**
 * @param {object} p
 * @param {string} [p.linkedGoogle]
 * @param {object|null} [p.meAuthUser]
 * @param {string} [p.currentRole]
 * @param {string} [p.authToken]
 * @param {boolean} [p.isSuperAdmin]
 * @param {string|null} [p.sessionRoleHint] — deriveSessionProfile.sessionRole (hq_ops/sales)
 * @param {(token: string) => object|null} [p.decodeJwtPayload]
 */
export function buildAdminGateUser({
  linkedGoogle = "",
  meAuthUser = null,
  currentRole = "",
  authToken = "",
  isSuperAdmin = false,
  sessionRoleHint = null,
  decodeJwtPayload = null,
} = {}) {
  let jwtRole = "";
  let jwtSessionRole = "";
  if (authToken && linkedGoogle && typeof decodeJwtPayload === "function") {
    try {
      const p = decodeJwtPayload(authToken);
      const pe = String(p?.email || "").trim().toLowerCase();
      const em = String(linkedGoogle || "").trim().toLowerCase();
      if (pe && em && pe === em) {
        jwtRole = String(p.role || "");
        jwtSessionRole = String(p.session_role || "");
      }
    } catch {
      /* ignore */
    }
  }

  let sessionRole =
    meAuthUser?.session_role != null && meAuthUser.session_role !== ""
      ? meAuthUser.session_role
      : null;

  if (sessionRole == null || sessionRole === "") {
    const hint = String(sessionRoleHint || "").trim().toLowerCase();
    if (hint === SESSION_ROLE.HQ_OPS || hint === SESSION_ROLE.SALES) {
      sessionRole = sessionRoleHint;
    } else {
      sessionRole = jwtSessionRole || null;
    }
  }

  return {
    email: String(linkedGoogle || "").trim().toLowerCase(),
    role: String(meAuthUser?.role || currentRole || jwtRole || "").trim(),
    session_role: sessionRole,
    isSuperAdmin: Boolean(isSuperAdmin),
  };
}

/**
 * Single source for admin nav, body, openPage, API prefetch, restore.
 * @param {object} gateUser — from buildAdminGateUser
 */
export function resolveAdminUiAccess(gateUser) {
  if (readDebugAdminFlag()) return true;
  return canAccessAdminSafe(gateUser);
}

/**
 * Persisted home screen normalization (tg_ui_home_screen_v1).
 * @param {string} storedPage
 * @param {boolean} canEnterAdminUi
 * @returns {string}
 */
export function normalizeStoredMainScreen(storedPage, canEnterAdminUi) {
  const v = String(storedPage || "").trim();
  if (v === "admin-denied") return canEnterAdminUi ? "admin" : "trade";
  if (v === "admin" && !canEnterAdminUi) return "trade";
  return v;
}

/** Cold-load initializer: never reopen admin-denied from LS */
export function readInitialMainScreen(storageKey, allowedPages, fallback = "trade") {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw === "admin-denied") return fallback;
    if (raw && allowedPages.includes(raw)) return raw;
  } catch {
    /* ignore */
  }
  return fallback;
}
