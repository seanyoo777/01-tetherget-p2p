/**
 * Phase 23: 관리용 아웃바운드 웹훅 큐 폴링.
 */

import { processOutboundAdminWebhookBatch } from "./p2pOutboundAdminWebhookPhase23.js";

export function startOutboundAdminWebhookWorker(db, env, pollMs = 35_000) {
  const ms = Math.max(12_000, pollMs);
  const tick = () => {
    void processOutboundAdminWebhookBatch(db, env, 8).catch((e) => console.warn("[outbound-admin-webhook-worker]", e?.message || e));
  };
  const t = setInterval(tick, ms);
  setTimeout(tick, 6000);
  return () => clearInterval(t);
}
