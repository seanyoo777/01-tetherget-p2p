/**
 * Phase 22: 외부 결제 웹훅 관측성 — 멱등 키, 시도 횟수, DLQ, 페이로드 보관(재시도용).
 */

const MAX_ATTEMPTS = 8;

function safeJson(s, fallback = {}) {
  try {
    return s ? JSON.parse(String(s)) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {{ provider: string; idempotencyKey: string; eventType: string; payloadJson: string; payloadSha256: string }} spec
 * @param {() => object} handlerSync 동기 핸들러(트랜잭션 내에서 호출)
 * @returns {{ duplicate?: boolean; dlq?: boolean; out?: object; error?: string }}
 */
export function executeInboundWebhookIdempotent(db, spec, handlerSync) {
  const provider = String(spec.provider || "").trim().slice(0, 24);
  const idempotencyKey = String(spec.idempotencyKey || "").trim().slice(0, 256);
  const eventType = String(spec.eventType || "").trim().slice(0, 128);
  const payloadJson = String(spec.payloadJson || "").slice(0, 24_000);
  const payloadSha256 = String(spec.payloadSha256 || "").trim().slice(0, 64);
  if (!provider || !idempotencyKey) return { error: "missing_keys" };

  const existing = db.prepare(`SELECT * FROM p2p_inbound_webhook_inbox WHERE idempotency_key = ?`).get(idempotencyKey);
  if (existing?.status === "processed") {
    return { duplicate: true, out: safeJson(existing.result_json, {}) };
  }
  if (existing?.status === "dlq") {
    return { duplicate: true, dlq: true, out: safeJson(existing.result_json, {}) };
  }

  if (!existing) {
    try {
      db.prepare(
        `INSERT INTO p2p_inbound_webhook_inbox (provider, idempotency_key, event_type, payload_sha256, payload_json, status, attempts, last_error, result_json, created_at)
         VALUES (?, ?, ?, ?, ?, 'received', 0, '', '{}', CURRENT_TIMESTAMP)`,
      ).run(provider, idempotencyKey, eventType, payloadSha256, payloadJson);
    } catch (e) {
      if (String(e?.code || "") !== "SQLITE_CONSTRAINT_UNIQUE") throw e;
    }
  }

  const row = db.prepare(`SELECT * FROM p2p_inbound_webhook_inbox WHERE idempotency_key = ?`).get(idempotencyKey);
  if (!row) return { error: "row_missing" };
  if (row.status === "processed") {
    return { duplicate: true, out: safeJson(row.result_json, {}) };
  }
  if (row.status === "dlq") {
    return { duplicate: true, dlq: true };
  }

  const nextAttempts = Number(row.attempts || 0) + 1;
  db.prepare(`UPDATE p2p_inbound_webhook_inbox SET attempts = ?, status = 'processing', last_error = '' WHERE id = ?`).run(
    nextAttempts,
    row.id,
  );

  try {
    const out = handlerSync() || {};
    db.prepare(
      `UPDATE p2p_inbound_webhook_inbox SET status = 'processed', processed_at = CURRENT_TIMESTAMP, result_json = ?, last_error = '' WHERE id = ?`,
    ).run(JSON.stringify(out).slice(0, 8000), row.id);
    return { out };
  } catch (err) {
    const msg = String(err?.message || err).slice(0, 2000);
    const st = nextAttempts >= MAX_ATTEMPTS ? "dlq" : "failed";
    db.prepare(`UPDATE p2p_inbound_webhook_inbox SET status = ?, last_error = ?, next_retry_at = datetime('now', '+120 seconds') WHERE id = ?`).run(
      st,
      msg,
      row.id,
    );
    throw err;
  }
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {{ status?: string; limit?: number }} q
 */
export function listInboundWebhookInbox(db, { status = "", limit = 80 } = {}) {
  const lim = Math.min(200, Math.max(1, Number(limit) || 80));
  const st = String(status || "").trim();
  if (st) {
    return db
      .prepare(`SELECT id, provider, idempotency_key, event_type, payload_sha256, status, attempts, last_error, created_at, processed_at, next_retry_at FROM p2p_inbound_webhook_inbox WHERE status = ? ORDER BY id DESC LIMIT ?`)
      .all(st, lim);
  }
  return db
    .prepare(
      `SELECT id, provider, idempotency_key, event_type, payload_sha256, status, attempts, last_error, created_at, processed_at, next_retry_at FROM p2p_inbound_webhook_inbox ORDER BY id DESC LIMIT ?`,
    )
    .all(lim);
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {number} id
 * @param {(event: object) => object} stripeHandler
 * @param {(body: object) => object} paddleHandler
 */
export function retryInboundWebhookInboxById(db, id, stripeHandler, paddleHandler) {
  const row = db.prepare(`SELECT * FROM p2p_inbound_webhook_inbox WHERE id = ?`).get(id);
  if (!row) return { ok: false, reason: "not_found" };
  if (row.status === "processed") return { ok: false, reason: "already_processed" };
  const provider = String(row.provider || "");
  let payload = {};
  try {
    payload = JSON.parse(String(row.payload_json || "{}"));
  } catch {
    payload = {};
  }
  db.prepare(`UPDATE p2p_inbound_webhook_inbox SET status = 'received', last_error = '', attempts = 0 WHERE id = ?`).run(id);
  const fn =
    provider === "paddle"
      ? () => paddleHandler(payload)
      : () => stripeHandler(payload);
  try {
    const out = executeInboundWebhookIdempotent(db, {
      provider: row.provider,
      idempotencyKey: row.idempotency_key,
      eventType: row.event_type,
      payloadJson: String(row.payload_json || "").slice(0, 24_000),
      payloadSha256: row.payload_sha256,
    }, fn);
    return { ok: true, ...out };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}
