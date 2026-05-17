import React, { useMemo } from "react";
import { RISK_GUARD_TEST_IDS } from "../../risk/riskGuardTestIds.js";
import { evaluateEscrowReleaseGuard, evaluateSuspiciousPartyRisk, mockAttemptEscrowRelease } from "../../risk/riskGuardHelpers.js";
import { RiskStatusBadge } from "./RiskStatusBadge.jsx";
import { RiskIssueList } from "./RiskIssueList.jsx";

export function EscrowReleaseGuardPanel({ disputeCase, theme, operatorId, notify, onGuardChange }) {
  const guard = useMemo(() => evaluateEscrowReleaseGuard(disputeCase), [disputeCase]);
  const party = useMemo(() => evaluateSuspiciousPartyRisk(disputeCase), [disputeCase]);

  if (!disputeCase) return null;

  const tryMockRelease = () => {
    const result = mockAttemptEscrowRelease(disputeCase, operatorId || "ADMIN-MOCK");
    notify?.(result.message);
    onGuardChange?.(result.guard);
  };

  const releaseDisabled = !guard.canMockRelease || disputeCase.escrowStatus === "dispute_opened";

  return (
    <div
      data-testid={RISK_GUARD_TEST_IDS.escrowGuardPanel}
      className={`rounded-xl border p-3 ${theme.cardSoft}`}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-black">Escrow Release Guard (mock)</div>
        <RiskStatusBadge status={guard.status} label={`GUARD ${guard.status.toUpperCase()}`} />
      </div>

      <div className="mb-2 flex flex-wrap gap-2 text-[10px]">
        <span className={theme.muted}>releaseBlocked:</span>
        <RiskStatusBadge status={guard.releaseBlocked ? "fail" : "pass"} label={guard.releaseBlocked ? "BLOCKED" : "OPEN"} compact />
        <span className={theme.muted}>buyer:</span>
        <RiskStatusBadge status={party.buyer} compact />
        <span className={theme.muted}>seller:</span>
        <RiskStatusBadge status={party.seller} compact />
      </div>

      {guard.blockReasons.length ? (
        <p className={`mb-2 text-[10px] ${theme.muted}`}>사유: {guard.blockReasons.join(" · ")}</p>
      ) : null}

      <RiskIssueList issues={guard.issues} theme={theme} />

      <button
        type="button"
        data-testid={RISK_GUARD_TEST_IDS.mockReleaseBtn}
        disabled={releaseDisabled}
        onClick={tryMockRelease}
        title={releaseDisabled ? "분쟁/홀드 상태 — mock release 비활성" : "Mock only — 실제 릴리스 없음"}
        className={`mt-3 w-full rounded-lg px-3 py-2 text-xs font-black ${
          releaseDisabled ? `cursor-not-allowed opacity-40 ${theme.input}` : "bg-violet-600 text-white"
        }`}
      >
        Mock Escrow Release {releaseDisabled ? "(차단됨)" : "(시뮬레이션)"}
      </button>
    </div>
  );
}
