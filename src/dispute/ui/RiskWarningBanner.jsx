import React from "react";
import { DISPUTE_TEST_IDS } from "../disputeTestIds.js";
import { evaluateEscrowReleaseGuard, evaluateSuspiciousPartyRisk } from "../../risk/riskGuardHelpers.js";
import { RiskStatusBadge } from "../../components/risk/RiskStatusBadge.jsx";

export function RiskWarningBanner({ disputeCase, theme }) {
  if (!disputeCase) return null;
  const guard = evaluateEscrowReleaseGuard(disputeCase);
  const party = evaluateSuspiciousPartyRisk(disputeCase);
  if (!guard.releaseBlocked && guard.status === "pass" && party.aggregate === "pass") return null;

  const risky = disputeCase.suspiciousBuyer || disputeCase.suspiciousSeller || disputeCase.priority === "critical";

  return (
    <div
      data-testid={DISPUTE_TEST_IDS.riskBanner}
      className={`rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs ${theme?.cardSoft || ""}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-black text-rose-200">Risk Guard (mock)</span>
        <RiskStatusBadge status={guard.status} label={`GUARD ${guard.status.toUpperCase()}`} compact />
        {party.suspiciousBuyer || disputeCase.suspiciousBuyer ? (
          <RiskStatusBadge status={party.buyer} label="BUYER" compact />
        ) : null}
        {party.suspiciousSeller || disputeCase.suspiciousSeller ? (
          <RiskStatusBadge status={party.seller} label="SELLER" compact />
        ) : null}
      </div>
      <p className={`mt-1 ${theme?.muted || "opacity-70"}`}>
        releaseBlocked: {guard.releaseBlocked ? "yes" : "no"} · escrow {disputeCase.escrowStatus}
        {disputeCase.escrowStatus === "dispute_opened" ? " — mock release 비활성" : ""}
        {risky ? " · 위험 플래그 활성" : ""}
      </p>
      <p className={`mt-1 text-[10px] ${theme?.muted || "opacity-60"}`}>
        실제 송금·지갑 release·은행 API·온체인 처리 없음
      </p>
    </div>
  );
}
