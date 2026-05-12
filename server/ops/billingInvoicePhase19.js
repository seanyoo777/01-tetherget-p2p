/**
 * Phase 19: 청구서(인보이스) 초안 — 원장 구간 집계.
 */

/**
 * @param {import("better-sqlite3").Database} db
 * @param {{ periodStart: string; periodEnd: string; tierLabel?: string; createdByUserId?: number }} p
 */
export function createInvoiceFromLedgerRange(db, p) {
  const ps = String(p.periodStart || "").trim().slice(0, 10);
  const pe = String(p.periodEnd || "").trim().slice(0, 10);
  if (!ps || !pe) throw new Error("INVALID_PERIOD");
  const agg = db
    .prepare(
      `SELECT SUM(fee_minor) as fee_minor_total, COUNT(*) as ledger_row_count FROM p2p_platform_fee_ledger
       WHERE date(created_at) >= date(?) AND date(created_at) <= date(?)`,
    )
    .get(ps, pe);
  const feeTotal = Number(agg?.fee_minor_total ?? 0) || 0;
  const cnt = Number(agg?.ledger_row_count ?? 0) || 0;
  const tier = String(p.tierLabel || "default").trim().slice(0, 120) || "default";
  const lines = [{ kind: "p2p_platform_fee_ledger", period_start: ps, period_end: pe, fee_minor_total: feeTotal, rows: cnt }];
  const ins = db
    .prepare(
      `INSERT INTO billing_invoices (
        period_start, period_end, tier_label, currency, fee_minor_total, ledger_row_count,
        status, line_items_json, notes, created_by_user_id, created_at
      ) VALUES (?, ?, ?, 'USDT', ?, ?, 'draft', ?, '', ?, CURRENT_TIMESTAMP)`,
    )
    .run(ps, pe, tier, feeTotal, cnt, JSON.stringify(lines), p.createdByUserId != null ? p.createdByUserId : null);
  return db.prepare(`SELECT * FROM billing_invoices WHERE id = ?`).get(Number(ins.lastInsertRowid));
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {number} id
 */
export function issueInvoice(db, id) {
  const r = db
    .prepare(`UPDATE billing_invoices SET status = 'issued', issued_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'draft'`)
    .run(id);
  if (r.changes !== 1) return null;
  return db.prepare(`SELECT * FROM billing_invoices WHERE id = ?`).get(id);
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {number} limit
 */
export function listInvoices(db, limit = 60) {
  const lim = Math.min(200, Math.max(1, limit));
  return db.prepare(`SELECT * FROM billing_invoices ORDER BY id DESC LIMIT ?`).all(lim);
}
