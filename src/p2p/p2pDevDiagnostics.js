/**
 * Dev / self-test diagnostics snapshot (pure, no polling).
 */
import {
  computeAdminAuditKpi,
  getP2pAdminAuditSurface,
  getP2pAdminCacheMeta,
  isP2pAdminAuditCacheSynced,
} from "./p2pAdminAuditSurface.js";
import { validateP2pAdminSurface } from "./p2pAdminSurfaceSelfTest.js";

/** @type {object|null} */
let lastRefreshValidation = null;

/**
 * `refreshAdminPlatformSurface` 완료 후 1회 호출 (polling 없음).
 * @param {object|null} [surface]
 */
export function runP2pAdminRefreshSelfTest(surface = getP2pAdminAuditSurface()) {
  const validation = validateP2pAdminSurface(surface);
  const issueCount = validation.issues?.length ?? 0;
  lastRefreshValidation = {
    ...validation,
    issueCount,
    ranAt: Date.now(),
    trigger: "refreshAdminPlatformSurface",
    _mock: true,
  };
  return lastRefreshValidation;
}

export function getLastP2pAdminRefreshValidation() {
  return lastRefreshValidation;
}

export function clearP2pAdminRefreshValidation() {
  lastRefreshValidation = null;
}

/** Default duplicate-notify window (mock/local only). */
export const P2P_REFRESH_NOTIFY_THROTTLE_MS = 30_000;

/** @type {string|null} */
let lastNotifyFingerprint = null;
/** @type {number} */
let lastNotifyAtMs = 0;

/**
 * @param {ImportMetaEnv|Record<string, unknown>} [env]
 */
export function isP2pDiagnosticsEnabled(env = import.meta.env) {
  if (env?.DEV) return true;
  return String(env?.VITE_P2P_SHOW_DIAGNOSTICS ?? "").trim() === "1";
}

/**
 * @param {boolean|undefined} showDevDiagnostics
 * @param {ImportMetaEnv|Record<string, unknown>} [env]
 */
export function resolveShowP2pDevDiagnostics(showDevDiagnostics, env = import.meta.env) {
  if (showDevDiagnostics === true) return true;
  if (showDevDiagnostics === false) return false;
  return isP2pDiagnosticsEnabled(env);
}

/**
 * @param {object|null|undefined} validation
 */
export function buildP2pValidationNotifyFingerprint(validation) {
  if (!validation || typeof validation !== "object") return "none";
  const issueList = Array.isArray(validation.issues) ? validation.issues.slice(0, 8).join("|") : "";
  return [
    validation.ok ? "ok" : "fail",
    validation.issueCount ?? validation.issues?.length ?? 0,
    validation.orderCount ?? 0,
    validation.alignedCount ?? 0,
    issueList,
  ].join(":");
}

/**
 * @param {object|null|undefined} validation
 * @param {{ throttleMs?: number, force?: boolean }} [opts]
 */
export function shouldThrottleP2pRefreshNotify(validation, opts = {}) {
  const throttleMs = opts.throttleMs ?? P2P_REFRESH_NOTIFY_THROTTLE_MS;
  const fingerprint = buildP2pValidationNotifyFingerprint(validation);
  const message = formatP2pRefreshValidationNotify(validation);
  if (opts.force) {
    return { emit: true, message, fingerprint, throttled: false, _mock: true };
  }
  const now = Date.now();
  if (lastNotifyFingerprint === fingerprint && now - lastNotifyAtMs < throttleMs) {
    return { emit: false, message, fingerprint, throttled: true, _mock: true };
  }
  return { emit: true, message, fingerprint, throttled: false, _mock: true };
}

export function recordP2pRefreshNotifyEmitted(fingerprint) {
  lastNotifyFingerprint = fingerprint;
  lastNotifyAtMs = Date.now();
}

export function clearP2pRefreshNotifyThrottle() {
  lastNotifyFingerprint = null;
  lastNotifyAtMs = 0;
}

/**
 * Client-only toast (mock). Skips duplicate validation toasts within throttle window.
 * @param {object|null|undefined} validation
 * @param {(msg: string) => void} notifyFn
 * @param {{ throttleMs?: number, force?: boolean }} [opts]
 */
export function notifyP2pRefreshValidation(validation, notifyFn, opts = {}) {
  const decision = shouldThrottleP2pRefreshNotify(validation, opts);
  if (decision.emit && typeof notifyFn === "function") {
    notifyFn(decision.message);
    recordP2pRefreshNotifyEmitted(decision.fingerprint);
  }
  return decision;
}

/**
 * @param {number|null} ageMs
 */
export function formatP2pCacheAgeLabel(ageMs) {
  if (ageMs == null || ageMs < 0) return "mock_static";
  if (ageMs < 60_000) return `${Math.round(ageMs / 1000)}s`;
  if (ageMs < 3_600_000) return `${Math.round(ageMs / 60_000)}m`;
  return `${(ageMs / 3_600_000).toFixed(1)}h`;
}

/**
 * Client-only toast summary (mock). No server notify.
 * @param {object|null|undefined} validation
 */
export function formatP2pRefreshValidationNotify(validation) {
  if (!validation || typeof validation !== "object") {
    return "[MOCK] P2P UTE self-test — validation 없음";
  }
  const issueCount = validation.issueCount ?? validation.issues?.length ?? 0;
  const status = validation.ok ? "OK" : "FAIL";
  const aligned = validation.alignedCount ?? 0;
  const orders = validation.orderCount ?? "—";
  return `[MOCK] P2P UTE self-test ${status} · issues ${issueCount} · aligned ${aligned}/${orders}`;
}

/**
 * @param {"full"|"strip"|"badge-only"} mode
 */
export function resolveP2pDiagnosticsMode(mode) {
  if (mode === "strip" || mode === "badge-only") return mode;
  return "full";
}

/** @returns {object} */
export function getP2pDevDiagnostics() {
  const surface = getP2pAdminAuditSurface();
  const kpi = computeAdminAuditKpi();
  const cacheMeta = getP2pAdminCacheMeta();
  const validation = lastRefreshValidation ?? validateP2pAdminSurface(surface);
  const issueCount = validation.issueCount ?? validation.issues?.length ?? 0;
  const alignedCount = validation.alignedCount ?? 0;
  const orderCount = validation.orderCount ?? kpi.tradeCount;

  return {
    cacheSynced: isP2pAdminAuditCacheSynced(),
    cacheSource: kpi.cacheSource,
    orderCount: kpi.tradeCount,
    disputeRatio: kpi.disputeRatio,
    delayedRatio: kpi.delayedRatio,
    mockOnly: true,
    cacheAgeMs: cacheMeta.ageMs,
    cacheAgeLabel: formatP2pCacheAgeLabel(cacheMeta.ageMs),
    cacheSyncedAt: cacheMeta.syncedAt,
    validation,
    validationOk: Boolean(validation.ok),
    issueCount,
    alignedCount,
    orderCountValidated: orderCount,
    refreshSelfTestRan: lastRefreshValidation != null,
    refreshRanAt: lastRefreshValidation?.ranAt ?? null,
    kpi,
    _mock: true,
  };
}
