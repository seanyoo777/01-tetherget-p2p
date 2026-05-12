/**
 * Phase 25: 파트너 정산·월간 정산·조정을 한 화면에서 자동 대사 힌트.
 */

import { buildMonthlySettlementDraft, getMonthlySettlement } from "./settlementEnginePhase23.js";
import { rollupAdjustmentsForMonth } from "./settlementAdvancedPhase24.js";

/**
 * @param {import("better-sqlite3").Database} db
 * @param {string} yyyymm
 */
export function buildRevenuePartnerDashboard(db, yyyymm) {
  const ym = String(yyyymm || "").replace(/\D/g, "").slice(0, 6);
  if (ym.length !== 6) return null;
  const draft = buildMonthlySettlementDraft(db, ym);
  const adj = rollupAdjustmentsForMonth(db, ym);
  const closed = getMonthlySettlement(db, ym);
  let report = {};
  if (closed?.report_json) {
    try {
      report = JSON.parse(String(closed.report_json));
    } catch {
      report = {};
    }
  }
  const byPartner = db
    .prepare(
      `SELECT partner_slug, SUM(amount_minor) as amount_minor_sum, COUNT(*) as line_count
       FROM p2p_partner_settlement_lines WHERE period_yyyymm = ? GROUP BY partner_slug ORDER BY amount_minor_sum DESC`,
    )
    .all(ym);
  const flags = [];
  const ledger = draft?.ledger_fee_minor_sum ?? 0;
  const inv = draft?.invoices_fee_minor_sum ?? 0;
  const gap = ledger - inv;
  if (Math.abs(gap) > Math.max(100, Math.floor(ledger * 0.02))) {
    flags.push({
      code: "ledger_invoice_fee_mismatch",
      ledger_fee_minor_sum: ledger,
      invoices_fee_minor_sum: inv,
      delta_minor: gap,
    });
  }
  const reconDays = draft?.reconciliation_daily_rows_in_month ?? 0;
  if (reconDays < 10) {
    flags.push({ code: "sparse_daily_reconciliation", reconciliation_daily_rows_in_month: reconDays });
  }
  const partnerSum = draft?.partner_settlement_minor_sum ?? 0;
  const adjSum = adj.adjustments_minor_sum ?? 0;
  const impliedPlatform = ledger - partnerSum - adjSum;
  flags.push({
    code: "rollup_hint",
    implied_platform_minor_after_partner_and_adjustments: impliedPlatform,
    note: "참고용 휴리스틱 — 실제 회계는 별도 원장·계약에 따름",
  });
  return {
    yyyymm: ym,
    draft: draft ? { ...draft, ...adj } : null,
    closed_row: closed || null,
    closed_report_subset: {
      closed_at: report.closed_at ?? null,
      adjustments_minor_sum: report.adjustments_minor_sum ?? adj.adjustments_minor_sum,
    },
    partner_breakdown: byPartner,
    flags,
  };
}
