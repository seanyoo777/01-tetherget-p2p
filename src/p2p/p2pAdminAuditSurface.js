/**
 * P2P admin 감사 UI ↔ refreshAdminPlatformSurface 캐시 브리지 (polling/websocket 없음).
 */
import {
  MOCK_ADMIN_P2P_TRADES,
  MOCK_UTE_SURFACE_SNAPSHOT,
  getAdminMockRowsFromUteSurface,
  getMockAdminTradeAudit,
} from "../mock/p2pTradeFlowMock.js";
import { mockReleaseDelayMinutes } from "./p2pAdminSurfaceSelfTest.js";

/** @type {object|null} */
let syncedUteSurface = null;
/** @type {number|null} */
let syncedAtMs = null;

const MOCK_FALLBACK_CACHE_AGE_MS = 120_000;

/**
 * `refreshAdminPlatformSurface` 성공/폴백 후 호출.
 * @param {object|null} surface — UteSurfacePayload shape
 */
export function syncP2pAdminAuditCache(surface) {
  syncedUteSurface = surface && typeof surface === "object" ? surface : null;
  syncedAtMs = syncedUteSurface ? Date.now() : null;
}

export function clearP2pAdminAuditCache() {
  syncedUteSurface = null;
  syncedAtMs = null;
}

/** @returns {{ syncedAt: number|null, ageMs: number|null }} */
export function getP2pAdminCacheMeta() {
  if (syncedAtMs != null) {
    return { syncedAt: syncedAtMs, ageMs: Date.now() - syncedAtMs };
  }
  return { syncedAt: null, ageMs: MOCK_FALLBACK_CACHE_AGE_MS };
}

/** @returns {object} */
export function getP2pAdminAuditSurface() {
  return syncedUteSurface ?? MOCK_UTE_SURFACE_SNAPSHOT;
}

export function isP2pAdminAuditCacheSynced() {
  return syncedUteSurface != null;
}

/** @returns {object[]} */
export function getP2pAdminAuditRows() {
  return getAdminMockRowsFromUteSurface(getP2pAdminAuditSurface(), MOCK_ADMIN_P2P_TRADES);
}

/**
 * @param {object[]} [rows]
 */
function isCompletedAdminRow(row) {
  const st = String(row?.db_status ?? row?.status ?? "");
  const escrow = String(row?.escrow_lifecycle ?? row?.escrow ?? "");
  return st === "completed" || escrow === "released";
}

function isDisputedAdminRow(row, audit) {
  const escrow = String(row?.escrow_lifecycle ?? row?.escrow ?? "");
  return (audit?.disputeCount ?? 0) > 0 || escrow === "disputed" || Boolean(row?.dispute);
}

export function computeAdminAuditKpi(rows = getP2pAdminAuditRows()) {
  const list = Array.isArray(rows) ? rows : [];
  let disputeCount = 0;
  let highRiskCount = 0;
  let delayedReleaseCount = 0;
  let ordersWithDisputeFlag = 0;
  let completedCount = 0;
  let disputedOrdersCount = 0;
  let releaseDelaySum = 0;
  let releaseDelaySamples = 0;

  for (const row of list) {
    const a = getMockAdminTradeAudit(row);
    disputeCount += a.disputeCount;
    if (a.disputeCount > 0) ordersWithDisputeFlag += 1;
    if (a.highRisk) highRiskCount += 1;
    if (a.delayedRelease) delayedReleaseCount += 1;
    if (isCompletedAdminRow(row)) completedCount += 1;
    if (isDisputedAdminRow(row, a)) disputedOrdersCount += 1;
    if (a.delayedRelease) {
      releaseDelaySum += mockReleaseDelayMinutes(row);
      releaseDelaySamples += 1;
    }
  }

  const tradeCount = list.length;
  const disputeRatio = tradeCount > 0 ? Math.round((ordersWithDisputeFlag / tradeCount) * 1000) / 10 : 0;
  const delayedRatio = tradeCount > 0 ? Math.round((delayedReleaseCount / tradeCount) * 1000) / 10 : 0;
  const avgMockReleaseDelayMin =
    releaseDelaySamples > 0 ? Math.round((releaseDelaySum / releaseDelaySamples) * 10) / 10 : 0;
  const cacheMeta = getP2pAdminCacheMeta();

  return {
    tradeCount,
    disputeCount,
    ordersWithDisputeFlag,
    disputeRatio,
    highRiskCount,
    delayedReleaseCount,
    delayedRatio,
    completedCount,
    disputedOrdersCount,
    avgMockReleaseDelayMin,
    cacheAgeMs: cacheMeta.ageMs,
    cacheSource: isP2pAdminAuditCacheSynced() ? "ute_surface_sync" : "mock_fallback",
    _mock: true,
  };
}
