/**
 * Memoized P2P diagnostics snapshot (read-only during React render).
 * Side effects (localStorage, listener notify) run outside render via refresh + debounce.
 */
import {
  computeAdminAuditKpi,
  getP2pAdminAuditSurface,
  getP2pAdminCacheMeta,
  isP2pAdminAuditCacheSynced,
} from "./p2pAdminAuditSurface.js";
import { validateP2pAdminSurface } from "./p2pAdminSurfaceSelfTest.js";
import { getRiskGuardDiagnosticsSnapshot } from "../risk/riskGuardHelpers.js";
import { getLastP2pSelfTestCoreBundle } from "./p2pSelfTestCoreAdapter.js";
import { isEscrowHealthOverviewEnabled } from "../escrowHealth/escrowHealthFeatureFlags.js";

function formatP2pCacheAgeLabel(ageMs) {
  if (ageMs == null || ageMs < 0) return "mock_static";
  if (ageMs < 60_000) return `${Math.round(ageMs / 1000)}s`;
  if (ageMs < 3_600_000) return `${Math.round(ageMs / 60_000)}m`;
  return `${(ageMs / 3_600_000).toFixed(1)}h`;
}

export const P2P_DIAGNOSTICS_STORAGE_KEY = "tetherget.p2p_diagnostics_snapshot_v1";
const P2P_DIAGNOSTICS_PERSIST_MAX_BYTES = 48_000;

/** @type {object|null} */
let cachedSnapshot = null;
/** @type {number} */
let snapshotRevision = 0;
const listeners = new Set();

/** @type {ReturnType<typeof setTimeout>|null} */
let persistTimer = null;

function notifyListenersDeferred() {
  const run = () => listeners.forEach((fn) => fn());
  if (typeof queueMicrotask === "function") {
    queueMicrotask(run);
  } else {
    setTimeout(run, 0);
  }
}

export function subscribeP2pDiagnosticsSnapshot(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getP2pDiagnosticsSnapshotRevision() {
  return snapshotRevision;
}

function buildValidationSlice(surface, lastRefreshValidation) {
  const validation = lastRefreshValidation ?? validateP2pAdminSurface(surface);
  const issueCount = validation.issueCount ?? validation.issues?.length ?? 0;
  const alignedCount = validation.alignedCount ?? 0;
  const orderCount = validation.orderCount ?? 0;
  return { validation, issueCount, alignedCount, orderCountValidated: orderCount, validationOk: Boolean(validation.ok) };
}

/**
 * Pure snapshot builder (no localStorage / subscriptions).
 * @param {{ lastRefreshValidation?: object|null }} [opts]
 */
export function buildP2pDiagnosticsSnapshot(opts = {}) {
  const surface = getP2pAdminAuditSurface();
  const kpi = computeAdminAuditKpi();
  const cacheMeta = getP2pAdminCacheMeta();
  const validationSlice = buildValidationSlice(surface, opts.lastRefreshValidation ?? null);
  const riskGuard = getRiskGuardDiagnosticsSnapshot();
  const selfTestCore = getLastP2pSelfTestCoreBundle();
  const escrowHealthEnabled = isEscrowHealthOverviewEnabled();

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
    ...validationSlice,
    refreshSelfTestRan: opts.lastRefreshValidation != null,
    refreshRanAt: opts.lastRefreshValidation?.ranAt ?? null,
    kpi,
    riskGuard,
    riskGuardIssueCount: riskGuard.issueCount,
    riskGuardStatus: riskGuard.escrowGuardStatus,
    riskGuardLastChecked: riskGuard.lastChecked,
    selfTestCore,
    selfTestCoreOverall: selfTestCore?.overall ?? null,
    selfTestCoreIssueCount: selfTestCore?.issueCount ?? null,
    selfTestCoreWiringOk: Boolean(selfTestCore),
    selfTestCoreLastChecked: selfTestCore?.lastCheckedAtMs ?? null,
    escrowHealthEnabled,
    escrowHealthMockOnly: true,
    revision: snapshotRevision,
    _mock: true,
  };
}

function trimPersistPayload(snapshot) {
  const kpi = snapshot.kpi
    ? {
        tradeCount: snapshot.kpi.tradeCount,
        disputeRatio: snapshot.kpi.disputeRatio,
        delayedRatio: snapshot.kpi.delayedRatio,
        cacheSource: snapshot.kpi.cacheSource,
      }
    : null;
  return {
    mockOnly: true,
    revision: snapshot.revision,
    validationOk: snapshot.validationOk,
    issueCount: snapshot.issueCount,
    cacheSource: snapshot.cacheSource,
    orderCount: snapshot.orderCount,
    riskGuardStatus: snapshot.riskGuardStatus,
    selfTestCoreOverall: snapshot.selfTestCoreOverall,
    kpi,
    savedAt: Date.now(),
  };
}

function schedulePersistSnapshot(snapshot) {
  if (typeof localStorage === "undefined") return;
  if (persistTimer != null) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      const payload = trimPersistPayload(snapshot);
      let raw = JSON.stringify(payload);
      if (raw.length > P2P_DIAGNOSTICS_PERSIST_MAX_BYTES) {
        raw = JSON.stringify({ mockOnly: true, revision: snapshot.revision, truncated: true, savedAt: Date.now() });
      }
      localStorage.setItem(P2P_DIAGNOSTICS_STORAGE_KEY, raw);
    } catch (err) {
      if (err?.name === "QuotaExceededError") {
        try {
          localStorage.removeItem(P2P_DIAGNOSTICS_STORAGE_KEY);
          localStorage.setItem(
            P2P_DIAGNOSTICS_STORAGE_KEY,
            JSON.stringify({ mockOnly: true, quotaExceeded: true, savedAt: Date.now() }),
          );
        } catch {
          /* ignore */
        }
      }
    }
  }, 400);
}

/**
 * Rebuild memoized snapshot (call from useEffect / refresh handlers, not render).
 * @param {{ lastRefreshValidation?: object|null, persist?: boolean }} [opts]
 */
export function refreshP2pDiagnosticsSnapshot(opts = {}) {
  cachedSnapshot = buildP2pDiagnosticsSnapshot(opts);
  snapshotRevision += 1;
  cachedSnapshot.revision = snapshotRevision;
  if (opts.persist !== false) {
    schedulePersistSnapshot(cachedSnapshot);
  }
  notifyListenersDeferred();
  return cachedSnapshot;
}

export function getP2pDiagnosticsSnapshot() {
  if (!cachedSnapshot) {
    cachedSnapshot = buildP2pDiagnosticsSnapshot();
    snapshotRevision += 1;
    cachedSnapshot.revision = snapshotRevision;
  }
  return cachedSnapshot;
}

export function clearP2pDiagnosticsSnapshotCache() {
  cachedSnapshot = null;
  if (persistTimer != null) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.removeItem(P2P_DIAGNOSTICS_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
  snapshotRevision += 1;
  notifyListenersDeferred();
}

/** @alias runMockDiagnostics */
export function runMockDiagnostics(opts = {}) {
  return refreshP2pDiagnosticsSnapshot(opts);
}
