/**
 * Phase 23: 관리/정산용 아웃바운드 웹훅 확장 큐(이벤트 유형별·SLO 마감 시각).
 * 전송 URL: P2P_OUTBOUND_ADMIN_WEBHOOK_URL 우선, 없으면 billing webhook URL.
 */

import crypto from "node:crypto";
import { getBillingWebhookUrl, getBillingWebhookSecret } from "./betaPhase17.js";

const MAX_ATTEMPTS_DEFAULT = 8;

function backoffMs(attempt) {
  const sec = Math.min(3600, Math.pow(2, Math.max(0, attempt)));
  return sec * 1000;
}

export function getOutboundAdminWebhookUrl(db, env) {
  const ext = String(env.P2P_OUTBOUND_ADMIN_WEBHOOK_URL || "").trim();
  if (ext) return ext;
  return getBillingWebhookUrl(db, env);
}

export function getOutboundAdminWebhookSecret(db, env) {
  const ext = String(env.P2P_OUTBOUND_ADMIN_WEBHOOK_SECRET || "").trim();
  if (ext) return ext;
  return getBillingWebhookSecret(db, env);
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {NodeJS.ProcessEnv} env
 * @param {{ eventType: string; payload: object; idempotencyKey: string; sloMinutes?: number }} opts
 */
export function enqueueOutboundAdminWebhook(db, env, opts) {
  const url = getOutboundAdminWebhookUrl(db, env);
  if (!url) return { ok: false, skipped: true, reason: "no_url" };
  const idempotencyKey = String(opts?.idempotencyKey || "").trim();
  if (!idempotencyKey) return { ok: false, skipped: true, reason: "no_idempotency_key" };
  const eventType = String(opts?.eventType || "p2p.admin.generic").trim().slice(0, 64);
  const bodyObj = {
    event: eventType,
    occurredAt: new Date().toISOString(),
    ...(opts?.payload && typeof opts.payload === "object" ? opts.payload : {}),
  };
  const bodyStr = JSON.stringify(bodyObj);
  const urlHash = crypto.createHash("sha256").update(url).digest("hex").slice(0, 48);
  const sloMin = Math.min(1440, Math.max(1, Math.floor(Number(opts?.sloMinutes) || 30)));
  const sloDeadline = new Date(Date.now() + sloMin * 60_000).toISOString();
  try {
    const ins = db
      .prepare(
        `INSERT INTO p2p_outbound_admin_webhooks (
          idempotency_key, event_type, payload_json, status, attempts, max_attempts,
          target_url_hash, last_error, slo_deadline_at, next_retry_at, created_at, updated_at
        ) VALUES (?, ?, ?, 'queued', 0, ?, ?, '', ?, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      )
      .run(idempotencyKey, eventType, bodyStr, MAX_ATTEMPTS_DEFAULT, urlHash, sloDeadline);
    return { ok: true, id: Number(ins.lastInsertRowid), slo_deadline_at: sloDeadline };
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
export async function deliverOutboundAdminWebhookById(db, env, id) {
  const row = db.prepare(`SELECT * FROM p2p_outbound_admin_webhooks WHERE id = ?`).get(id);
  if (!row) return { ok: false, message: "not_found" };
  if (row.status === "sent") return { ok: true, already: true };
  if (row.status === "dead") return { ok: false, message: "dead_letter" };
  const url = getOutboundAdminWebhookUrl(db, env);
  if (!url) {
    db.prepare(
      `UPDATE p2p_outbound_admin_webhooks SET status = 'failed', last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    ).run("outbound_url_missing", id);
    return { ok: false, message: "no_url" };
  }
  const secret = getOutboundAdminWebhookSecret(db, env);
  const bodyStr = String(row.payload_json || "");
  const headers = {
    "Content-Type": "application/json",
    "X-Tetherget-Webhook-Id": String(id),
    "X-Tetherget-Event-Type": String(row.event_type || ""),
  };
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
  const now = new Date().toISOString();
  const pastSlo = row.slo_deadline_at && String(row.slo_deadline_at) < now && httpStatus < 200;
  if (httpStatus >= 200 && httpStatus < 300) {
    db.prepare(
      `UPDATE p2p_outbound_admin_webhooks SET status = 'sent', attempts = ?, last_http_status = ?, last_error = '', sent_at = CURRENT_TIMESTAMP, next_retry_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    ).run(attempts, httpStatus, id);
    return { ok: true, httpStatus };
  }
  const nextRetry = new Date(Date.now() + backoffMs(attempts)).toISOString();
  const nextStatus = attempts >= maxAttempts ? "dead" : "failed";
  const errFinal = pastSlo ? `${errText || `http_${httpStatus}`}|slo_missed` : errText || `http_${httpStatus}`;
  db.prepare(
    `UPDATE p2p_outbound_admin_webhooks SET status = ?, attempts = ?, last_http_status = ?, last_error = ?, next_retry_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
  ).run(nextStatus, attempts, httpStatus, errFinal.slice(0, 1200), nextRetry, id);
  return { ok: false, httpStatus, attempts, status: nextStatus, error: errFinal, slo_missed: pastSlo };
}

export function listOutboundAdminWebhooks(db, { status = "", limit = 50 } = {}) {
  const lim = Math.min(200, Math.max(1, Number(limit) || 50));
  if (status && String(status).trim()) {
    return db
      .prepare(
        `SELECT id, idempotency_key, event_type, status, attempts, max_attempts, last_http_status, last_error, slo_deadline_at, created_at, updated_at, sent_at, next_retry_at
         FROM p2p_outbound_admin_webhooks WHERE status = ? ORDER BY id DESC LIMIT ?`,
      )
      .all(String(status).trim(), lim);
  }
  return db
    .prepare(
      `SELECT id, idempotency_key, event_type, status, attempts, max_attempts, last_http_status, last_error, slo_deadline_at, created_at, updated_at, sent_at, next_retry_at
       FROM p2p_outbound_admin_webhooks ORDER BY id DESC LIMIT ?`,
    )
    .all(lim);
}

export function resetOutboundAdminWebhookForRetry(db, id) {
  const r = db
    .prepare(
      `UPDATE p2p_outbound_admin_webhooks SET status = 'queued', next_retry_at = NULL, last_error = '', updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status IN ('failed','dead')`,
    )
    .run(id);
  return { ok: r.changes === 1 };
}

export async function processOutboundAdminWebhookBatch(db, env, batch = 8) {
  const n = Math.min(30, Math.max(1, batch));
  const now = new Date().toISOString();
  const rows = db
    .prepare(
      `SELECT id FROM p2p_outbound_admin_webhooks
       WHERE status IN ('queued','failed') AND attempts < max_attempts
         AND (next_retry_at IS NULL OR next_retry_at = '' OR next_retry_at <= ?)
       ORDER BY CASE WHEN slo_deadline_at IS NOT NULL AND slo_deadline_at != '' THEN slo_deadline_at ELSE '9999-12-31' END ASC, id ASC LIMIT ?`,
    )
    .all(now, n);
  const results = [];
  for (const row of rows) {
    results.push({ id: row.id, ...(await deliverOutboundAdminWebhookById(db, env, row.id)) });
  }
  return results;
}
