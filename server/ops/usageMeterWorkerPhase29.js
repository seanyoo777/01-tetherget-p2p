/**
 * Phase 29: USAGE_METER_ROLLUP_MS>0 이면 직전 시간대 usage 버킷 롤업.
 * @param {import("better-sqlite3").Database} db
 * @param {NodeJS.ProcessEnv} env
 */
import { rollupUsageMeterPreviousHour } from "./usageMeteringRealtimePhase29.js";

export function startUsageMeterWorker(db, env) {
  const raw = Number(env.USAGE_METER_ROLLUP_MS || 0);
  const ms = Number.isFinite(raw) && raw >= 60_000 ? Math.min(3_600_000, Math.floor(raw)) : 0;
  if (!ms) return () => {};
  const tick = () => {
    try {
      rollupUsageMeterPreviousHour(db);
    } catch (e) {
      console.warn("[usage-meter-worker]", e?.message || e);
    }
  };
  tick();
  const id = setInterval(tick, ms);
  return () => clearInterval(id);
}
