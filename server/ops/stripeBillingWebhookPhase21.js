/**
 * Phase 21: Stripe → 인보이스 결제 반영 (invoice.paid, checkout.session.completed).
 */

/**
 * @param {import("better-sqlite3").Database} db
 * @param {object} event Stripe event
 */
export function handleStripeBillingEvent(db, event) {
  const type = String(event.type || "");
  const obj = event.data?.object || {};

  let invoiceId = null;
  if (type === "invoice.paid") {
    invoiceId = Number(obj.metadata?.tetherget_invoice_id ?? obj.metadata?.invoice_id ?? NaN);
  } else if (type === "checkout.session.completed") {
    invoiceId = Number(obj.metadata?.tetherget_invoice_id ?? obj.metadata?.invoice_id ?? NaN);
  }
  if (!Number.isFinite(invoiceId) || invoiceId <= 0) {
    return { ok: true, skipped: true, reason: "no_invoice_metadata", type };
  }
  const extId = String(obj.id || obj.payment_intent || "").slice(0, 128);
  const paidSec = obj.status_transitions?.paid_at ?? event.created;
  const paidAt = new Date((Number(paidSec) || 0) * 1000 || Date.now()).toISOString();
  const r = db
    .prepare(
      `UPDATE billing_invoices
       SET payment_status = 'paid', paid_at = ?, payment_provider = 'stripe', external_payment_id = ?
       WHERE id = ? AND status = 'issued'`,
    )
    .run(paidAt, extId, invoiceId);
  return { ok: true, type, invoiceId, rows: r.changes };
}
