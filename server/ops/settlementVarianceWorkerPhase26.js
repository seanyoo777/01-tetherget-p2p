/**
 * Phase 26: 선택 — 주기적으로 정산 variance 티켓 동기화(현재 UTC 월).
 */

import { syncVarianceTicketsFromDashboard } from "./settlementMaturityPhase26.js";

function currentYyyymm() {
  const d = new Date();
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {NodeJS.ProcessEnv} env
 * @param {number} intervalMs
 */
export function startSettlementVarianceScanWorker(db, env) {
  const ms = Math.floor(Number(env.SETTLEMENT_VARIANCE_AUTOSCAN_MS || 0) || 0);
  if (ms <= 0) return () => {};
  const tick = () => {
    try {
      syncVarianceTicketsFromDashboard(db, currentYyyymm());
    } catch (e) {
      console.warn("[settlement-variance-scan]", e?.message || e);
    }
  };
  const t = setInterval(tick, Math.max(3_600_000, ms));
  return () => clearInterval(t);
}
