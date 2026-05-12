/**
 * Phase 22: 삭제 자동화 폴링 워커.
 */

import { runPrivacyDeletionAutomationBatch } from "./privacyAutomationPhase22.js";

/**
 * @param {import("better-sqlite3").Database} db
 * @param {NodeJS.ProcessEnv} env
 * @param {number} defaultPollMs
 * @returns {() => void}
 */
export function startPrivacyAutomationWorker(db, env, defaultPollMs = 120_000) {
  const raw = String(env.PRIVACY_AUTOMATION_POLL_MS || "").trim();
  if (raw === "0") return () => {};
  const ms = Math.max(60_000, Number(raw || defaultPollMs) || defaultPollMs);
  const tick = () => {
    try {
      const out = runPrivacyDeletionAutomationBatch(db, { maxBatch: 15 });
      if (out.processed > 0) console.log("[privacy-automation]", out);
    } catch (e) {
      console.warn("[privacy-automation]", e?.message || e);
    }
  };
  const id = setInterval(tick, ms);
  tick();
  return () => clearInterval(id);
}
