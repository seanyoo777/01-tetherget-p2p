/**
 * Phase 19: billing 웹훅 outbox 폴링.
 */

import { processBillingOutboxBatch } from "./p2pBillingWebhookOutbox.js";

/**
 * @param {import("better-sqlite3").Database} db
 * @param {NodeJS.ProcessEnv} env
 * @param {number} pollMs
 */
export function startBillingWebhookOutboxWorker(db, env, pollMs = 30_000) {
  const ms = Math.max(10_000, pollMs);
  const tick = () => {
    void processBillingOutboxBatch(db, env, 10).catch((e) => console.warn("[billing-outbox-worker]", e?.message || e));
  };
  const t = setInterval(tick, ms);
  setTimeout(tick, 4000);
  return () => clearInterval(t);
}
