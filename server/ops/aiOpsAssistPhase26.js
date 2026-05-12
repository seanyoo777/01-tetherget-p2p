/**
 * Phase 26: AI 운영 보조(규칙 기반) — SRE 스냅샷·정산 flags·카오스·오픈 티켓으로 RCA·런북 힌트 생성.
 * 외부 LLM 미사용; 운영자 검증 필수.
 */

import { computeSreSnapshot } from "./srePhase23.js";
import { listChaosRuns } from "./chaosRollbackPhase24.js";
import { buildRevenuePartnerDashboard } from "./revenueReconciliationPhase25.js";
import { listSettlementVarianceTickets } from "./settlementMaturityPhase26.js";
import { readOpsEscalation } from "./opsEscalation.js";

function currentYyyymm() {
  const d = new Date();
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {NodeJS.ProcessEnv} env
 * @param {{ mode?: string; yyyymm?: string }} opts
 */
export function buildAiOpsSuggestion(db, env, opts = {}) {
  const mode = String(opts.mode || "rca").trim().toLowerCase();
  const ym = String(opts.yyyymm || "").replace(/\D/g, "").slice(0, 6) || currentYyyymm();
  const snap = computeSreSnapshot(db, env);
  const dash = buildRevenuePartnerDashboard(db, ym);
  const chaos = listChaosRuns(db, 8);
  const tickets = listSettlementVarianceTickets(db, { yyyymm: ym, status: "open", limit: 40 });
  const esc = readOpsEscalation(db);

  const recommendations = [];
  const runbook_hints = [];

  if (snap.burn_ratio_vs_monthly_budget >= Number(env.AI_OPS_BURN_WARN || 0.85)) {
    recommendations.push({
      id: "sre_burn",
      priority: snap.burn_ratio_vs_monthly_budget >= 1.25 ? "P1" : "P2",
      summary: "관리 웹훅 실패율이 월간 에러 버짓 대비 높게 추정됩니다.",
      checks: [
        "GET /api/admin/ops/sre-snapshot 재확인",
        "p2p_outbound_admin_webhooks dead/pending, p2p_billing_webhook_outbox dead 점검",
        "PATCH /api/admin/ops/sre-config — error_budget_monthly_pct·burn_window_hours 조정 검토",
      ],
    });
    runbook_hints.push("sre-config + outbound admin webhooks retry");
  }

  if (dash?.flags?.some((f) => f.code === "ledger_invoice_fee_mismatch")) {
    recommendations.push({
      id: "settlement_ledger_invoice",
      priority: "P1",
      summary: "원장 수수료 합계와 발행 인보이스 수수료 합계 차이가 큽니다.",
      checks: [
        "GET /api/admin/ops/revenue-partner-dashboard?period_yyyymm=" + ym,
        "POST /api/admin/ops/settlement-variance-tickets/sync 로 티켓 생성 후 담당 배정",
        "billing_invoices 발행 누락·기간 경계 확인",
      ],
    });
    runbook_hints.push("revenue-partner-dashboard + settlement variance tickets");
  }

  if (dash?.flags?.some((f) => f.code === "sparse_daily_reconciliation")) {
    recommendations.push({
      id: "recon_sparse",
      priority: "P2",
      summary: "월간 일별 대사 스냅샷 행이 부족합니다.",
      checks: ["GET /api/admin/p2p/reconciliation/daily — 스냅샷 습관화", "월말 close 전 일별 대사"],
    });
  }

  if (chaos.length && chaos.some((c) => String(c.status) === "running")) {
    recommendations.push({
      id: "chaos_running",
      priority: "P2",
      summary: "카오스 자동화 실행이 running 상태입니다.",
      checks: ["POST .../chaos-automation/:id/complete 또는 rollback", "스테이징 전용 여부 확인"],
    });
  }

  if (tickets.length > 0) {
    recommendations.push({
      id: "open_variance_tickets",
      priority: "P2",
      summary: `정산 차이 티켓 오픈 ${tickets.length}건 (${ym})`,
      checks: ["GET /api/admin/ops/settlement-variance-tickets?status=open&yyyymm=" + ym],
    });
  }

  if (mode === "runbook") {
    runbook_hints.push(
      "ops escalation: GET/PATCH /api/admin/ops/escalation-policy",
      "oncall: GET/PATCH /api/admin/ops/oncall-integrations",
      "sla: GET /api/public/sla-summary + slo-alert-policy",
    );
  }

  return {
    mode: mode === "runbook" ? "runbook" : "rca",
    yyyymm: ym,
    sre_snapshot: {
      burn_ratio_vs_monthly_budget: snap.burn_ratio_vs_monthly_budget,
      outbound_webhook_dead_letters: snap.outbound_webhook_dead_letters,
    },
    escalation_notes: String(esc?.slo_escalation_note || "").slice(0, 500) || null,
    recommendations,
    runbook_hints: [...new Set(runbook_hints)],
    disclaimer: "규칙 기반 제안이며 LLM 출력이 아닙니다. 조치 전 항상 데이터를 확인하세요.",
  };
}
