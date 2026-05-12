/**
 * Phase 24: 카오스 스케줄 틱(감사만) — 프로덕션은 CHAOS_AUTOMATION_ENABLED=1 + 스테이징 권장.
 */

import { createChaosRun, finishChaosRun } from "./chaosRollbackPhase24.js";

export function startChaosAutomationWorker(db, env, pollMs = 3_600_000) {
  if (String(env.CHAOS_AUTOMATION_ENABLED || "").trim() !== "1") {
    return () => {};
  }
  const ms = Math.max(600_000, Number(env.CHAOS_AUTOMATION_POLL_MS || pollMs) || pollMs);
  const tick = () => {
    try {
      const row = createChaosRun(db, { scenario: "scheduled_tick", payload: { at: new Date().toISOString() } });
      finishChaosRun(db, row.id, "completed");
    } catch (e) {
      console.warn("[chaos-automation]", e?.message || e);
    }
  };
  const id = setInterval(tick, ms);
  tick();
  return () => clearInterval(id);
}
