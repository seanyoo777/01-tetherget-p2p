/**
 * Phase 24: 고급 정산 — 조정분·세금 태그·환율 메모(금액은 minor 정수, 환율은 문자열 기록).
 */

const KINDS = new Set(["fee_credit", "fee_debit", "fx_gain", "fx_loss", "tax", "other"]);

/**
 * @param {import("better-sqlite3").Database} db
 * @param {string} yyyymm
 */
export function rollupAdjustmentsForMonth(db, yyyymm) {
  const ym = String(yyyymm || "").replace(/\D/g, "").slice(0, 6);
  if (ym.length !== 6) return {};
  const r = db
    .prepare(`SELECT COALESCE(SUM(amount_minor),0) as s, COUNT(*) as c FROM p2p_settlement_adjustments WHERE yyyymm = ?`)
    .get(ym);
  const tax = db
    .prepare(
      `SELECT COALESCE(SUM(amount_minor),0) as s FROM p2p_settlement_adjustments WHERE yyyymm = ? AND upper(tax_tag) IN ('VAT','GST','SALES_TAX','TAX')`,
    )
    .get(ym);
  return {
    adjustments_minor_sum: Number(r?.s ?? 0) || 0,
    adjustment_line_count: Number(r?.c ?? 0) || 0,
    tax_tagged_adjustments_minor_sum: Number(tax?.s ?? 0) || 0,
  };
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {object} p
 */
export function appendSettlementAdjustment(db, p) {
  const ym = String(p.yyyymm || "").replace(/\D/g, "").slice(0, 6);
  if (ym.length !== 6) throw new Error("INVALID_YYYYMM");
  const kind = String(p.kind || "other").trim().toLowerCase();
  if (!KINDS.has(kind)) throw new Error("INVALID_KIND");
  const amount = Math.trunc(Number(p.amount_minor) || 0);
  const currency = String(p.currency || "USDT").trim().toUpperCase().slice(0, 12) || "USDT";
  const fx = String(p.fx_rate_applied || "").trim().slice(0, 64);
  const taxTag = String(p.tax_tag || "").trim().toUpperCase().slice(0, 32);
  const note = String(p.note || "").slice(0, 2000);
  const uid = Number(p.created_by_user_id) || null;
  const ins = db
    .prepare(
      `INSERT INTO p2p_settlement_adjustments (yyyymm, kind, amount_minor, currency, fx_rate_applied, tax_tag, note, created_by_user_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    )
    .run(ym, kind, amount, currency, fx, taxTag, note, uid);
  return db.prepare(`SELECT * FROM p2p_settlement_adjustments WHERE id = ?`).get(Number(ins.lastInsertRowid));
}

export function listSettlementAdjustments(db, yyyymm, limit = 200) {
  const ym = String(yyyymm || "").replace(/\D/g, "").slice(0, 6);
  const lim = Math.min(500, Math.max(1, Number(limit) || 200));
  if (ym.length !== 6) return [];
  return db.prepare(`SELECT * FROM p2p_settlement_adjustments WHERE yyyymm = ? ORDER BY id DESC LIMIT ?`).all(ym, lim);
}
