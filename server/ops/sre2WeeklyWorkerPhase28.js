/**
 * Phase 28: SRE2 주간 리포트 워커 — SRE2_WEEKLY_TICK_MS>0 일 때만.
 */

import { recordWeeklySreReport } from "./sre2WeeklyPhase28.js";

/**
 * @param {import("better-sqlite3").Database} db
 * @param {NodeJS.ProcessEnv} env
 */
export function startSre2WeeklyWorker(db, env) {
  const ms = Math.floor(Number(env.SRE2_WEEKLY_TICK_MS || 0) || 0);
  if (ms <= 0) return () => {};
  const tick = () => {
    try {
      recordWeeklySreReport(db, env);
    } catch (e) {
      console.warn("[sre2-weekly]", e?.message || e);
    }
  };
  const t = setInterval(tick, Math.max(3_600_000, ms));
  return () => clearInterval(t);
}
