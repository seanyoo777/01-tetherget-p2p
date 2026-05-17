import React, { useCallback, useMemo, useState } from "react";
import { RISK_GUARD_TEST_IDS } from "../../risk/riskGuardTestIds.js";
import { getAdminRiskGuardOverview, getRiskGuardDiagnostics } from "../../risk/riskGuardHelpers.js";
import { seedDemoDisputeCasesIfEmpty } from "../../dispute/disputeHelpers.js";
import { RiskStatusBadge } from "./RiskStatusBadge.jsx";
import { evaluateEscrowReleaseGuard, evaluateSuspiciousPartyRisk } from "../../risk/riskGuardHelpers.js";

export function AdminRiskGuardPanel({ theme, notify, onSelectCase, visible = true }) {
  const [revision, setRevision] = useState(0);

  const refresh = useCallback(() => {
    seedDemoDisputeCasesIfEmpty();
    setRevision((r) => r + 1);
  }, []);

  const overview = useMemo(() => {
    void revision;
    return getAdminRiskGuardOverview();
  }, [revision]);

  const diagnostics = overview.diagnostics || getRiskGuardDiagnostics();

  if (!visible) return null;

  return (
    <div data-testid={RISK_GUARD_TEST_IDS.adminPanel} className={`mb-4 rounded-2xl border p-4 ${theme.cardSoft}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-black">Admin Risk Guard (mock)</div>
          <p className={`text-[10px] ${theme.muted}`}>releaseBlocked · suspicious flags · no real transfer</p>
        </div>
        <button type="button" onClick={refresh} className={`rounded-lg border px-3 py-1.5 text-[10px] font-black ${theme.main}`}>
          새로고침
        </button>
      </div>

      <div
        data-testid={RISK_GUARD_TEST_IDS.diagnosticsStrip}
        className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-amber-500/30 bg-amber-500/5 px-3 py-2"
      >
        <span className="rounded bg-cyan-500/20 px-1.5 py-0.5 text-[8px] font-black text-cyan-300">MOCK ONLY</span>
        <RiskStatusBadge status={diagnostics.escrowGuardStatus} label={`ESCROW ${diagnostics.escrowGuardStatus.toUpperCase()}`} />
        <span className={`text-[10px] font-mono tabular-nums ${theme.muted}`}>issues {diagnostics.issueCount}</span>
        <span className={`text-[10px] font-mono ${theme.muted}`}>blocked {diagnostics.blockedCaseCount}</span>
        <span className={`text-[10px] font-mono ${theme.muted}`}>
          checked {new Date(diagnostics.lastChecked).toLocaleTimeString()}
        </span>
      </div>

      <div data-testid={RISK_GUARD_TEST_IDS.blockedList} className="max-h-48 space-y-2 overflow-y-auto">
        {overview.blockedCases.length === 0 ? (
          <p className={`text-xs ${theme.muted}`}>releaseBlocked 케이스 없음</p>
        ) : (
          overview.blockedCases.map((row) => {
            const guard = evaluateEscrowReleaseGuard(row);
            const party = evaluateSuspiciousPartyRisk(row);
            return (
              <button
                key={row.caseId}
                type="button"
                onClick={() => {
                  onSelectCase?.(row.caseId);
                  notify?.(`[MOCK] 케이스 ${row.caseId} 선택`);
                }}
                className={`w-full rounded-xl border p-2 text-left text-[10px] ${theme.card}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-black">{row.caseId}</span>
                  <RiskStatusBadge status={guard.status} compact />
                  <RiskStatusBadge status={party.buyer} label="B" compact />
                  <RiskStatusBadge status={party.seller} label="S" compact />
                </div>
                <div className={`mt-1 ${theme.muted}`}>
                  {row.orderId} · {row.escrowStatus} · {row.disputeType}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
