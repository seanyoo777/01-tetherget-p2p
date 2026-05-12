/**
 * 청구/외부 정산 웹훅 — Phase 19부터 outbox·서명·DLQ 경로 사용.
 */

import { enqueueBillingWebhookDelivery, deliverBillingOutboxById } from "./p2pBillingWebhookOutbox.js";

/**
 * @param {import("better-sqlite3").Database} db
 * @param {NodeJS.ProcessEnv} env
 * @param {object} payload must include order_id for idempotency
 */
export async function postP2pBillingWebhook(db, env, payload) {
  const orderId = String(payload?.order_id || "").trim();
  if (!orderId) return { ok: false, skipped: true, reason: "no_order_id" };
  const enq = enqueueBillingWebhookDelivery(db, env, payload, { idempotencyKey: `platform_fee:${orderId}` });
  if (!enq.ok || enq.duplicate) return enq.duplicate ? { ok: true, duplicate: true } : { ok: false, ...enq };
  if (!enq.id) return { ok: false, skipped: true };
  return deliverBillingOutboxById(db, env, enq.id);
}
