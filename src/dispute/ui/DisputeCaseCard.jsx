import React from "react";
import { DISPUTE_TEST_IDS } from "../disputeTestIds.js";
import { evaluateEscrowReleaseGuard, evaluateSuspiciousPartyRisk } from "../../risk/riskGuardHelpers.js";
import { RiskStatusBadge } from "../../components/risk/RiskStatusBadge.jsx";
import { CasePriorityBadge } from "./CasePriorityBadge.jsx";

export function DisputeCaseCard({ row, theme, onOpen }) {
  const guard = evaluateEscrowReleaseGuard(row);
  const party = evaluateSuspiciousPartyRisk(row);
  return (
    <button
      type="button"
      data-testid={DISPUTE_TEST_IDS.caseCard}
      data-case-id={row.caseId}
      onClick={() => onOpen?.(row.caseId)}
      className={`w-full rounded-2xl border p-3 text-left transition ${theme.cardSoft} hover:border-emerald-500/40`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-mono text-xs font-black">{row.caseId}</div>
          <div className={`text-[10px] ${theme.muted}`}>주문 {row.orderId}</div>
        </div>
        <CasePriorityBadge priority={row.priority} />
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-[10px]">
        <span className="rounded bg-violet-500/20 px-2 py-0.5 font-bold text-violet-200">{row.disputeType}</span>
        <span className="rounded bg-slate-500/20 px-2 py-0.5 font-bold">{row.status}</span>
        <span className="rounded bg-amber-500/20 px-2 py-0.5 font-bold">{row.escrowStatus}</span>
        {row.releaseBlocked ? (
          <span className="rounded bg-rose-500/20 px-2 py-0.5 font-bold text-rose-200">release blocked</span>
        ) : null}
        <RiskStatusBadge status={guard.status} compact />
        {(row.suspiciousBuyer || party.buyer !== "pass") && <RiskStatusBadge status={party.buyer} label="B" compact />}
        {(row.suspiciousSeller || party.seller !== "pass") && <RiskStatusBadge status={party.seller} label="S" compact />}
      </div>
    </button>
  );
}
