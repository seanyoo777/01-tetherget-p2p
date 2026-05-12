/**
 * Phase 23: 월간 정산 클로징·대사 요약·회계용 CSV 스냅샷.
 */

/**
 * @param {import("better-sqlite3").Database} db
 * @param {string} yyyymm
 */
export function buildMonthlySettlementDraft(db, yyyymm) {
  const ym = String(yyyymm || "").replace(/\D/g, "").slice(0, 6);
  if (ym.length !== 6) return null;
  const ledger = db
    .prepare(
      `SELECT COALESCE(SUM(fee_minor),0) as fee_sum, COUNT(*) as row_count FROM p2p_platform_fee_ledger WHERE strftime('%Y%m', created_at) = ?`,
    )
    .get(ym);
  const inv = db
    .prepare(
      `SELECT COALESCE(SUM(fee_minor_total),0) as fee_sum, COUNT(*) as inv_count FROM billing_invoices WHERE status = 'issued' AND strftime('%Y%m', COALESCE(issued_at, created_at)) = ?`,
    )
    .get(ym);
  const partner = db
    .prepare(`SELECT COALESCE(SUM(amount_minor),0) as amt, COUNT(*) as cnt FROM p2p_partner_settlement_lines WHERE period_yyyymm = ?`)
    .get(ym);
  const reconDays = db
    .prepare(`SELECT COUNT(*) as c FROM p2p_fee_reconciliation_daily WHERE strftime('%Y%m', recon_date) = ?`)
    .get(ym);
  return {
    yyyymm: ym,
    ledger_fee_minor_sum: Number(ledger?.fee_sum ?? 0) || 0,
    ledger_row_count: Number(ledger?.row_count ?? 0) || 0,
    invoices_fee_minor_sum: Number(inv?.fee_sum ?? 0) || 0,
    invoices_issued_count: Number(inv?.inv_count ?? 0) || 0,
    partner_settlement_minor_sum: Number(partner?.amt ?? 0) || 0,
    partner_line_count: Number(partner?.cnt ?? 0) || 0,
    reconciliation_daily_rows_in_month: Number(reconDays?.c ?? 0) || 0,
  };
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {string} yyyymm
 * @param {number} actorUserId
 */
export function closeMonthlySettlement(db, yyyymm, actorUserId, extraFields = {}) {
  const draft = buildMonthlySettlementDraft(db, yyyymm);
  if (!draft) throw new Error("INVALID_YYYYMM");
  const extra = extraFields && typeof extraFields === "object" ? extraFields : {};
  const report = { ...draft, ...extra, closed_at: new Date().toISOString(), closed_by_user_id: actorUserId };
  db.prepare(
    `INSERT INTO p2p_monthly_settlement (
       yyyymm, ledger_fee_minor_sum, ledger_row_count, invoices_fee_minor_sum, partner_settlement_minor_sum,
       status, report_json, closed_by_user_id, closed_at
     ) VALUES (?, ?, ?, ?, ?, 'closed', ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(yyyymm) DO UPDATE SET
       ledger_fee_minor_sum = excluded.ledger_fee_minor_sum,
       ledger_row_count = excluded.ledger_row_count,
       invoices_fee_minor_sum = excluded.invoices_fee_minor_sum,
       partner_settlement_minor_sum = excluded.partner_settlement_minor_sum,
       status = 'closed',
       report_json = excluded.report_json,
       closed_by_user_id = excluded.closed_by_user_id,
       closed_at = CURRENT_TIMESTAMP`,
  ).run(
    draft.yyyymm,
    draft.ledger_fee_minor_sum,
    draft.ledger_row_count,
    draft.invoices_fee_minor_sum,
    draft.partner_settlement_minor_sum,
    JSON.stringify(report).slice(0, 24_000),
    actorUserId,
  );
  return db.prepare(`SELECT * FROM p2p_monthly_settlement WHERE yyyymm = ?`).get(draft.yyyymm);
}

export function getMonthlySettlement(db, yyyymm) {
  const ym = String(yyyymm || "").replace(/\D/g, "").slice(0, 6);
  if (ym.length !== 6) return null;
  return db.prepare(`SELECT * FROM p2p_monthly_settlement WHERE yyyymm = ?`).get(ym);
}

export function listMonthlySettlements(db, limit = 24) {
  const lim = Math.min(120, Math.max(1, Number(limit) || 24));
  return db.prepare(`SELECT * FROM p2p_monthly_settlement ORDER BY yyyymm DESC LIMIT ?`).all(lim);
}

/**
 * @param {object} report buildMonthlySettlementDraft 또는 DB row report_json 파싱 결과
 */
export function buildAccountingCsv(report) {
  const r = report && typeof report === "object" ? report : {};
  const lines = [
    "section,metric,value",
    `summary,yyyymm,${r.yyyymm ?? ""}`,
    `ledger,fee_minor_sum,${r.ledger_fee_minor_sum ?? ""}`,
    `ledger,row_count,${r.ledger_row_count ?? ""}`,
    `invoices,fee_minor_sum,${r.invoices_fee_minor_sum ?? ""}`,
    `invoices,issued_count,${r.invoices_issued_count ?? ""}`,
    `partner,settlement_minor_sum,${r.partner_settlement_minor_sum ?? ""}`,
    `partner,line_count,${r.partner_line_count ?? ""}`,
    `reconciliation,daily_rows_in_month,${r.reconciliation_daily_rows_in_month ?? ""}`,
    `adjustments,minor_sum,${r.adjustments_minor_sum ?? ""}`,
    `adjustments,line_count,${r.adjustment_line_count ?? ""}`,
    `adjustments,tax_tagged_minor_sum,${r.tax_tagged_adjustments_minor_sum ?? ""}`,
  ];
  return `${lines.join("\n")}\n`;
}
