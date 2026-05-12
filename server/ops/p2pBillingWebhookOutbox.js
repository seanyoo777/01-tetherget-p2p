/**
 * Phase 19: billing 웹훅 DLQ·서명·재전송.
 */

import crypto from "node:crypto";
import { getBillingWebhookUrl, getBillingWebhookSecret } from "./betaPhase17.js";

const MAX_ATTEMPTS_DEFAULT = 8;

function backoffMs(attempt) {
  const sec = Math.min(3600, Math.pow(2, Math.max(0, attempt)));
  return sec * 1000;
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {NodeJS.ProcessEnv} env
 * @param {object} payload
 * @param {{ idempotencyKey: string }} opts
 */
export function enqueueBillingWebhookDelivery(db, env, payload, opts) {
  const url = getBillingWebhookUrl(db, env);
  if (!url) return { ok: false, skipped: true, reason: "no_url" };
  const idempotencyKey = String(opts?.idempotencyKey || "").trim();
  if (!idempotencyKey) return { ok: false, skipped: true, reason: "no_idempotency_key" };
  const bodyObj = {
    event: "p2p.platform_fee",
    occurredAt: new Date().toISOString(),
    ...payload,
  };
  const bodyStr = JSON.stringify(bodyObj);
  const urlHash = crypto.createHash("sha256").update(url).digest("hex").slice(0, 48);
  try {
    const ins = db
      .prepare(
        `INSERT INTO p2p_billing_webhook_outbox (
          idempotency_key, event_type, payload_json, status, attempts, max_attempts,
          target_url_hash, last_error, next_retry_at, created_at, updated_at
        ) VALUES (?, 'p2p.platform_fee', ?, 'queued', 0, ?, ?, '', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      )
      .run(idempotencyKey, bodyStr, MAX_ATTEMPTS_DEFAULT, urlHash);
    return { ok: true, id: Number(ins.lastInsertRowid) };
  } catch (e) {
    if (String(e?.message || e).includes("UNIQUE")) {
      return { ok: true, duplicate: true };
    }
    throw e;
  }
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {NodeJS.ProcessEnv} env
 * @param {number} id
 */
export async function deliverBillingOutboxById(db, env, id) {
  const row = db.prepare(`SELECT * FROM p2p_billing_webhook_outbox WHERE id = ?`).get(id);
  if (!row) return { ok: false, message: "not_found" };
  if (row.status === "sent") return { ok: true, already: true };
  if (row.status === "dead") return { ok: false, message: "dead_letter" };
  const url = getBillingWebhookUrl(db, env);
  if (!url) {
    db.prepare(
      `UPDATE p2p_billing_webhook_outbox SET status = 'failed', last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    ).run("billing_url_missing", id);
    return { ok: false, message: "no_url" };
  }
  const secret = getBillingWebhookSecret(db, env);
  const bodyStr = String(row.payload_json || "");
  const headers = { "Content-Type": "application/json", "X-Tetherget-Webhook-Id": String(id) };
  if (secret) {
    const sig = crypto.createHmac("sha256", secret).update(bodyStr).digest("hex");
    headers["X-Tetherget-Signature"] = `v1=${sig}`;
  }
  let httpStatus = 0;
  let errText = "";
  try {
    const res = await fetch(url, { method: "POST", headers, body: bodyStr });
    httpStatus = res.status;
    if (!res.ok) {
      errText = (await res.text().catch(() => "")).slice(0, 800);
    }
  } catch (e) {
    errText = String(e?.message || e).slice(0, 800);
    httpStatus = 0;
  }
  const attempts = Number(row.attempts || 0) + 1;
  const maxAttempts = Math.max(1, Number(row.max_attempts || MAX_ATTEMPTS_DEFAULT));
  if (httpStatus >= 200 && httpStatus < 300) {
    db.prepare(
      `UPDATE p2p_billing_webhook_outbox SET status = 'sent', attempts = ?, last_http_status = ?, last_error = '', sent_at = CURRENT_TIMESTAMP, next_retry_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    ).run(attempts, httpStatus, id);
    return { ok: true, httpStatus };
  }
  const nextRetry = new Date(Date.now() + backoffMs(attempts)).toISOString();
  const nextStatus = attempts >= maxAttempts ? "dead" : "failed";
  db.prepare(
    `UPDATE p2p_billing_webhook_outbox SET status = ?, attempts = ?, last_http_status = ?, last_error = ?, next_retry_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
  ).run(nextStatus, attempts, httpStatus, errText || `http_${httpStatus}`, nextRetry, id);
  return { ok: false, httpStatus, attempts, status: nextStatus, error: errText };
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {NodeJS.ProcessEnv} env
 */
export function listBillingWebhookOutbox(db, { status = "", limit = 50 } = {}) {
  const lim = Math.min(200, Math.max(1, Number(limit) || 50));
  if (status && String(status).trim()) {
    return db
      .prepare(
        `SELECT id, idempotency_key, event_type, status, attempts, max_attempts, last_http_status, last_error, target_url_hash, created_at, updated_at, sent_at, next_retry_at
         FROM p2p_billing_webhook_outbox WHERE status = ? ORDER BY id DESC LIMIT ?`,
      )
      .all(String(status).trim(), lim);
  }
  return db
    .prepare(
      `SELECT id, idempotency_key, event_type, status, attempts, max_attempts, last_http_status, last_error, target_url_hash, created_at, updated_at, sent_at, next_retry_at
       FROM p2p_billing_webhook_outbox ORDER BY id DESC LIMIT ?`,
    )
    .all(lim);
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {number} id
 */
export function resetOutboxForRetry(db, id) {
  const r = db
    .prepare(
      `UPDATE p2p_billing_webhook_outbox SET status = 'queued', next_retry_at = NULL, last_error = '', updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status IN ('failed','dead')`,
    )
    .run(id);
  return { ok: r.changes === 1 };
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {NodeJS.ProcessEnv} env
 * @param {number} batch
 */
export async function processBillingOutboxBatch(db, env, batch = 8) {
  const n = Math.min(30, Math.max(1, batch));
  const now = new Date().toISOString();
  const rows = db
    .prepare(
      `SELECT id FROM p2p_billing_webhook_outbox
       WHERE status IN ('queued','failed') AND attempts < max_attempts
         AND (next_retry_at IS NULL OR next_retry_at = '' OR next_retry_at <= ?)
       ORDER BY id ASC LIMIT ?`,
    )
    .all(now, n);
  const results = [];
  for (const row of rows) {
    results.push({ id: row.id, ...(await deliverBillingOutboxById(db, env, row.id)) });
  }
  return results;
}
