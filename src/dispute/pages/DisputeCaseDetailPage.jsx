import React, { useCallback, useMemo, useState } from "react";
import { DISPUTE_TEST_IDS } from "../disputeTestIds.js";
import { getCaseById, seedDemoDisputeCasesIfEmpty } from "../disputeHelpers.js";
import { DisputeCaseCard } from "../ui/DisputeCaseCard.jsx";
import { EvidenceUploadPanel } from "../ui/EvidenceUploadPanel.jsx";
import { EscrowStatusTimeline } from "../ui/EscrowStatusTimeline.jsx";
import { RiskWarningBanner } from "../ui/RiskWarningBanner.jsx";
import { EscrowReleaseGuardPanel } from "../../components/risk/EscrowReleaseGuardPanel.jsx";

export function DisputeCaseDetailPage({ caseId, theme, notify, onBack }) {
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => {
    seedDemoDisputeCasesIfEmpty();
    setRevision((r) => r + 1);
  }, []);

  const row = useMemo(() => {
    void revision;
    return caseId ? getCaseById(caseId) : null;
  }, [caseId, revision]);

  if (!row) {
    return (
      <section className="mx-auto max-w-3xl px-4 py-6">
        <p className={theme.muted}>케이스를 찾을 수 없습니다.</p>
        <button type="button" onClick={onBack} className={`mt-2 rounded-xl px-4 py-2 text-xs font-black ${theme.input}`}>
          목록으로
        </button>
      </section>
    );
  }

  return (
    <section data-testid={DISPUTE_TEST_IDS.detail} className="mx-auto max-w-3xl px-4 py-6">
      <button type="button" onClick={onBack} className={`mb-3 rounded-xl border px-3 py-1.5 text-xs font-black ${theme.input}`}>
        ← 분쟁 목록
      </button>
      <DisputeCaseCard row={row} theme={theme} onOpen={() => {}} />
      <div className="mt-3 space-y-3">
        <RiskWarningBanner disputeCase={row} theme={theme} />
        <EscrowStatusTimeline escrowStatus={row.escrowStatus} releaseBlocked={row.releaseBlocked} theme={theme} />
        <EscrowReleaseGuardPanel disputeCase={row} theme={theme} notify={notify} onGuardChange={refresh} />
        <EvidenceUploadPanel
          caseId={row.caseId}
          theme={theme}
          notify={notify}
          onUpdated={() => {
            refresh();
          }}
        />
      </div>
    </section>
  );
}
