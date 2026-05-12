/**
 * FCM: HTTP v1(서비스 계정) 우선, 없으면 레거시 server key.
 * 재시도 큐, 토큰 소프트 무효화, 영구 실패 훅, v1 배달 리포트(delivery JSON) 저장.
 */

import { loadFcmServiceAccount, sendFcmV1Message } from "./fcmV1.js";

function isInvalidTokenError(err) {
  const s = String(err || "").toLowerCase();
  return (
    s.includes("notregistered") ||
    s.includes("invalidregistration") ||
    s.includes("mismatchsenderid") ||
    s.includes("invalid_package_name") ||
    s.includes("requested_entity_was_not_found") ||
    s.includes("unregistered")
  );
}

function backoffMs(attemptZeroBased) {
  return Math.min(300_000, 4_000 * 2 ** Math.min(Math.max(0, attemptZeroBased), 7));
}

async function sendFcmLegacy(serverKey, deviceToken, title, body, dataPayload) {
  const res = await fetch("https://fcm.googleapis.com/fcm/send", {
    method: "POST",
    headers: {
      Authorization: `key=${serverKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: deviceToken,
      notification: { title: String(title || ""), body: String(body || "") },
      data: dataPayload && typeof dataPayload === "object" ? dataPayload : {},
    }),
  });
  let json = {};
  try {
    json = await res.json();
  } catch {
    json = {};
  }
  const ok = res.ok && Number(json.success) >= 1;
  const mid = json.results?.[0]?.message_id || json.message_id || "";
  const err = json.results?.[0]?.error || json.error || (!ok ? `http_${res.status}` : "");
  return {
    ok,
    messageId: mid,
    error: err,
    delivery: ok ? { state: "legacy_sent", message_id: mid } : { state: "legacy_failed", error: err },
  };
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {{ legacyKey?: string; serviceAccount?: object | null }} transport
 * @param {number} limit
 * @param {{ onPermanentFailure?: (row: object) => void }} [hooks]
 */
export async function processPushOutboundBatch(db, transport, limit = 8, hooks = {}) {
  const legacyKey = String(transport.legacyKey || "").trim();
  const sa = transport.serviceAccount || null;
  if (!legacyKey && !sa) return { processed: 0, note: "no_fcm_transport" };

  const nowIso = new Date().toISOString();
  const rows = db
    .prepare(
      `
      SELECT id, user_id, title, body, payload_json, attempts, max_attempts
      FROM push_notification_outbound
      WHERE channel = 'fcm'
        AND status = 'queued'
        AND (next_retry_at IS NULL OR next_retry_at = '' OR next_retry_at <= ?)
        AND attempts < COALESCE(max_attempts, 8)
      ORDER BY id ASC
      LIMIT ?
    `,
    )
    .all(nowIso, limit);

  let processed = 0;
  for (const row of rows) {
    const maxA = Number(row.max_attempts ?? 8);
    const claimed = db
      .prepare(`UPDATE push_notification_outbound SET status = 'sending', error_message = '' WHERE id = ? AND status = 'queued'`)
      .run(row.id);
    if (claimed.changes === 0) continue;

    const tokens = db
      .prepare(
        `SELECT token FROM user_fcm_tokens WHERE user_id = ? AND (invalidated_at IS NULL OR invalidated_at = '') ORDER BY updated_at DESC LIMIT 5`,
      )
      .all(row.user_id);
    if (!tokens.length) {
      db.prepare(
        `UPDATE push_notification_outbound SET status = 'failed', error_message = ?, attempts = attempts + 1 WHERE id = ?`,
      ).run("no_device_token", row.id);
      hooks.onPermanentFailure?.(row);
      processed += 1;
      continue;
    }
    let payload = {};
    try {
      payload = JSON.parse(String(row.payload_json || "{}"));
    } catch {
      payload = {};
    }
    const dataStr = {};
    for (const [k, v] of Object.entries(payload)) {
      dataStr[String(k)] = String(v);
    }
    let anyOk = false;
    let lastErr = "";
    let lastMid = "";
    let lastDelivery = null;
    for (const t of tokens) {
      let r;
      if (sa) {
        r = await sendFcmV1Message(sa, t.token, row.title, row.body, dataStr, { analyticsLabel: `outbound_${row.id}` });
      } else {
        r = await sendFcmLegacy(legacyKey, t.token, row.title, row.body, dataStr);
      }
      lastDelivery = r.delivery ?? null;
      if (r.ok) {
        anyOk = true;
        lastMid = r.messageId;
        break;
      }
      lastErr = r.error || "send_failed";
      if (isInvalidTokenError(lastErr)) {
        db.prepare(
          `UPDATE user_fcm_tokens SET invalidated_at = CURRENT_TIMESTAMP, last_error = ? WHERE user_id = ? AND token = ?`,
        ).run(String(lastErr || "").slice(0, 400), row.user_id, t.token);
      }
    }
    const sentAt = new Date().toISOString();
    const reportJson = lastDelivery ? JSON.stringify(lastDelivery).slice(0, 4000) : "";
    if (anyOk) {
      db.prepare(
        `UPDATE push_notification_outbound SET status = 'sent', provider_message_id = ?, sent_at = ?, error_message = '', delivery_report_json = ? WHERE id = ?`,
      ).run(lastMid, sentAt, reportJson, row.id);
    } else {
      const nextAttempt = Number(row.attempts || 0) + 1;
      const terminal = nextAttempt >= maxA || isInvalidTokenError(lastErr);
      if (terminal) {
        db.prepare(
          `UPDATE push_notification_outbound SET status = 'failed', error_message = ?, attempts = attempts + 1, delivery_report_json = ? WHERE id = ?`,
        ).run(String(lastErr || "send_failed").slice(0, 500), reportJson, row.id);
        hooks.onPermanentFailure?.({ ...row, attempts: nextAttempt, error_message: lastErr });
      } else {
        const waitUntil = new Date(Date.now() + backoffMs(Number(row.attempts || 0))).toISOString();
        db.prepare(
          `UPDATE push_notification_outbound SET status = 'queued', error_message = ?, attempts = attempts + 1, next_retry_at = ?, delivery_report_json = ? WHERE id = ?`,
        ).run(String(lastErr || "send_failed").slice(0, 500), waitUntil, reportJson, row.id);
      }
    }
    processed += 1;
  }
  return { processed };
}

export function markPushDelivered(db, outboundId, userId) {
  const row = db.prepare(`SELECT id, user_id FROM push_notification_outbound WHERE id = ?`).get(outboundId);
  if (!row || Number(row.user_id) !== Number(userId)) return { ok: false };
  db.prepare(
    `UPDATE push_notification_outbound SET status = 'delivered', delivered_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'sent'`,
  ).run(outboundId);
  return { ok: true };
}

/**
 * @returns {() => void}
 */
export function startFcmWorker(db, env, hooks = {}) {
  const legacyKey = String(env.FCM_SERVER_KEY || "").trim();
  const sa = loadFcmServiceAccount(env);
  if (!legacyKey && !sa) {
    console.warn("[fcm-worker] FCM_SERVER_KEY 또는 FCM 서비스 계정(v1) 미설정 — 발송 스킵");
    return () => {};
  }
  const transport = { legacyKey, serviceAccount: sa };
  if (sa) console.warn("[fcm-worker] FCM HTTP v1 (service account) 사용");
  else console.warn("[fcm-worker] FCM HTTP legacy (server key) 사용");

  const pollMs = Math.max(5000, Number(env.FCM_WORKER_POLL_MS || 12_000));
  const timer = setInterval(() => {
    void processPushOutboundBatch(db, transport, 10, hooks).catch((e) => console.warn("[fcm-worker]", e?.message || e));
  }, pollMs);
  void processPushOutboundBatch(db, transport, 10, hooks).catch((e) => console.warn("[fcm-worker]", e?.message || e));
  return () => clearInterval(timer);
}
