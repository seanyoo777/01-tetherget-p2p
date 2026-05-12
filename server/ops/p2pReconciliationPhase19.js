/**
 * Phase 19: 일별 수수료 정산·대사 스냅샷.
 */

/**
 * @param {import("better-sqlite3").Database} db
 * @param {string} fromIso date YYYY-MM-DD
 * @param {string} toIso date YYYY-MM-DD
 */
export function queryDailyFeeRollup(db, fromIso, toIso) {
  const from = String(fromIso || "").trim().slice(0, 10);
  const to = String(toIso || "").trim().slice(0, 10);
  if (!from || !to) return [];
  return db
    .prepare(
      `SELECT date(created_at) as recon_date,
              SUM(fee_minor) as fee_minor_sum,
              SUM(trade_minor) as trade_minor_sum,
              COUNT(*) as ledger_row_count
       FROM p2p_platform_fee_ledger
       WHERE date(created_at) >= date(?) AND date(created_at) <= date(?)
       GROUP BY date(created_at)
       ORDER BY recon_date`,
    )
    .all(from, to);
}

/**
 * @param {import("better-sqlite3").Database} db
 */
export function readCompanyWalletMinorSnapshot(db) {
  const row = db.prepare(`SELECT available_balance_minor FROM company_wallet WHERE id = 1`).get();
  return row != null ? Number(row.available_balance_minor ?? 0) : null;
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {string} reconDate YYYY-MM-DD
 */
export function upsertDailyReconciliationSnapshot(db, reconDate) {
  const d = String(reconDate || "").trim().slice(0, 10);
  if (!d) return null;
  const agg = db
    .prepare(
      `SELECT SUM(fee_minor) as fee_minor_sum, COUNT(*) as ledger_row_count FROM p2p_platform_fee_ledger WHERE date(created_at) = date(?)`,
    )
    .get(d);
  const feeSum = Number(agg?.fee_minor_sum ?? 0) || 0;
  const cnt = Number(agg?.ledger_row_count ?? 0) || 0;
  const wallet = readCompanyWalletMinorSnapshot(db);
  db.prepare(
    `INSERT INTO p2p_fee_reconciliation_daily (recon_date, fee_minor_sum, ledger_row_count, company_wallet_minor_snapshot, notes, created_at)
     VALUES (?, ?, ?, ?, '', CURRENT_TIMESTAMP)
     ON CONFLICT(recon_date) DO UPDATE SET
       fee_minor_sum = excluded.fee_minor_sum,
       ledger_row_count = excluded.ledger_row_count,
       company_wallet_minor_snapshot = excluded.company_wallet_minor_snapshot,
       created_at = excluded.created_at`,
  ).run(d, feeSum, cnt, wallet != null ? wallet : null);
  return db.prepare(`SELECT * FROM p2p_fee_reconciliation_daily WHERE recon_date = ?`).get(d);
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {number} limit
 */
export function listReconciliationSnapshots(db, limit = 90) {
  const lim = Math.min(500, Math.max(1, limit));
  return db.prepare(`SELECT * FROM p2p_fee_reconciliation_daily ORDER BY recon_date DESC LIMIT ?`).all(lim);
}
