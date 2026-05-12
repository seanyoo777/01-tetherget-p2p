/**
 * 푸시 발송 큐(영속) — FCM 미설정 시 status stub 으로 적재만 수행.
 */

export function enqueuePushOutbound(db, { userId, channel = "fcm", title, body, payloadJson = {}, status = "stub_no_provider" }) {
  const r = db
    .prepare(
      `
    INSERT INTO push_notification_outbound (user_id, channel, title, body, payload_json, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `,
    )
    .run(
      userId ?? null,
      channel,
      String(title || "").slice(0, 500),
      String(body || "").slice(0, 2000),
      JSON.stringify(payloadJson && typeof payloadJson === "object" ? payloadJson : {}),
      status,
    );
  return { id: r.lastInsertRowid };
}

export function recordPushReceiptAck(db, { userId, context, refJson = {}, acknowledged = 1 }) {
  db.prepare(
    `
    INSERT INTO push_notification_receipts (user_id, context, ref_json, acknowledged)
    VALUES (?, ?, ?, ?)
  `,
  ).run(userId, String(context || "").slice(0, 128), JSON.stringify(refJson), acknowledged ? 1 : 0);
}
