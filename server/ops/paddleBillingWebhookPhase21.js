/**
 * Phase 21: Paddle Billing → 인보이스 결제 반영 (transaction.* 완료류).
 */

import crypto from "node:crypto";

/**
 * Paddle Billing `Paddle-Signature`: `ts=...;h1=...` — 페이로드는 `ts + ":" + rawBody` (UTF-8).
 * @param {Buffer} rawBody
 * @param {string|undefined} sigHeader
 * @param {string} secret
 */
export function verifyPaddleBillingSignature(rawBody, sigHeader, secret) {
  const s = String(secret || "").trim();
  if (!s || !sigHeader) return false;
  const raw = Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : String(rawBody || "");
  const parts = Object.fromEntries(
    String(sigHeader)
      .split(";")
      .map((p) => p.trim())
      .filter(Boolean)
      .map((kv) => {
        const i = kv.indexOf("=");
        if (i < 0) return [kv, ""];
        return [kv.slice(0, i).trim(), kv.slice(i + 1).trim()];
      }),
  );
  const ts = parts.ts;
  const h1 = parts.h1;
  if (!ts || !h1) return false;
  const signedPayload = `${ts}:${raw}`;
  const expected = crypto.createHmac("sha256", s).update(signedPayload, "utf8").digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(String(h1), "utf8"));
  } catch {
    return false;
  }
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {object} body JSON 파싱된 웹훅 본문
 */
export function handlePaddleBillingEvent(db, body) {
  const eventType = String(body?.event_type || body?.type || "");
  const data = body?.data && typeof body.data === "object" ? body.data : body;
  const custom = data?.custom_data && typeof data.custom_data === "object" ? data.custom_data : {};
  const invoiceId = Number(custom.tetherget_invoice_id ?? custom.invoice_id ?? NaN);
  if (!Number.isFinite(invoiceId) || invoiceId <= 0) {
    return { ok: true, skipped: true, reason: "no_invoice_metadata", eventType };
  }
  const paidish =
    /transaction\.(completed|paid|payment_succeeded)/i.test(eventType) ||
    eventType === "payment_succeeded" ||
    eventType === "transaction.completed";
  if (!paidish) {
    return { ok: true, skipped: true, reason: "event_not_payment", eventType };
  }
  const extId = String(data?.id || data?.transaction_id || "").slice(0, 128);
  const paidAt = new Date().toISOString();
  const r = db
    .prepare(
      `UPDATE billing_invoices
       SET payment_status = 'paid', paid_at = ?, payment_provider = 'paddle', external_payment_id = ?
       WHERE id = ? AND status = 'issued'`,
    )
    .run(paidAt, extId || `paddle:${invoiceId}`, invoiceId);
  return { ok: true, eventType, invoiceId, rows: r.changes };
}
