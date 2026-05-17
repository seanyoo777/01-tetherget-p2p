import React, { useCallback, useMemo, useState } from "react";
import { DISPUTE_TEST_IDS } from "../disputeTestIds.js";
import { filterDisputeCases, seedDemoDisputeCasesIfEmpty } from "../disputeHelpers.js";
import { loadDisputeCases } from "../disputeStore.js";
import { DISPUTE_STATUSES, DISPUTE_PRIORITIES } from "../disputeConstants.js";
import { DisputeCaseCard } from "./DisputeCaseCard.jsx";
import { OperatorReviewPanel } from "./OperatorReviewPanel.jsx";
import { EvidenceUploadPanel } from "./EvidenceUploadPanel.jsx";
import { EscrowStatusTimeline } from "./EscrowStatusTimeline.jsx";
import { RiskWarningBanner } from "./RiskWarningBanner.jsx";
import { AdminRiskGuardPanel } from "../../components/risk/AdminRiskGuardPanel.jsx";
import { EscrowReleaseGuardPanel } from "../../components/risk/EscrowReleaseGuardPanel.jsx";
import { EscrowHealthBoard } from "../../components/escrowHealth/EscrowHealthBoard.jsx";
import { EmergencyPlaybookPanel } from "../../components/emergencyPlaybook/EmergencyPlaybookPanel.jsx";

export function DisputeAdminCaseCenter({ theme, notify, operatorId, onOpenCase, visible = true }) {
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [suspiciousOnly, setSuspiciousOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [revision, setRevision] = useState(0);

  const refresh = useCallback(() => {
    seedDemoDisputeCasesIfEmpty();
    setRevision((r) => r + 1);
  }, []);

  const cases = useMemo(() => {
    void revision;
    return filterDisputeCases({ status: statusFilter, priority: priorityFilter, suspiciousOnly, query });
  }, [revision, statusFilter, priorityFilter, suspiciousOnly, query]);

  const selected = useMemo(() => {
    void revision;
    return loadDisputeCases().find((c) => c.caseId === selectedId) ?? null;
  }, [selectedId, revision]);

  if (!visible) return null;

  return (
    <div data-testid={DISPUTE_TEST_IDS.adminCenter} className={`mt-4 rounded-2xl border p-4 ${theme.cardSoft}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-black">P2P Dispute Case Center (mock)</div>
          <p className={`text-[10px] ${theme.muted}`}>localStorage · 실제 송금/릴리스 없음</p>
        </div>
        <button type="button" onClick={refresh} className={`rounded-lg border px-3 py-1.5 text-[10px] font-black ${theme.main}`}>
          새로고침
        </button>
      </div>

      <div className="mb-3 grid gap-2 sm:grid-cols-4">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={`rounded-lg border px-2 py-1.5 text-xs ${theme.input}`}>
          <option value="all">status: all</option>
          {DISPUTE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} className={`rounded-lg border px-2 py-1.5 text-xs ${theme.input}`}>
          <option value="all">priority: all</option>
          {DISPUTE_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <label className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-xs ${theme.input}`}>
          <input type="checkbox" checked={suspiciousOnly} onChange={(e) => setSuspiciousOnly(e.target.checked)} />
          suspicious only
        </label>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="case / order search"
          className={`rounded-lg border px-2 py-1.5 text-xs ${theme.input}`}
        />
      </div>

      <EscrowHealthBoard theme={theme} auditContext="admin_dispute" onRefresh={refresh} />
      <EmergencyPlaybookPanel theme={theme} operatorId={operatorId} auditContext="admin_dispute" onRefresh={refresh} />
      <AdminRiskGuardPanel theme={theme} notify={notify} visible={visible} onSelectCase={(id) => setSelectedId(id)} />

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="max-h-80 space-y-2 overflow-y-auto">
          {cases.map((row) => (
            <DisputeCaseCard
              key={row.caseId}
              row={row}
              theme={theme}
              onOpen={(id) => {
                setSelectedId(id);
                onOpenCase?.(id);
              }}
            />
          ))}
          {!cases.length ? <p className={`text-xs ${theme.muted}`}>케이스 없음</p> : null}
        </div>
        <div className="space-y-3">
          {selected ? (
            <>
              <RiskWarningBanner disputeCase={selected} theme={theme} />
              <EscrowStatusTimeline escrowStatus={selected.escrowStatus} releaseBlocked={selected.releaseBlocked} theme={theme} />
              <EscrowReleaseGuardPanel
                disputeCase={selected}
                theme={theme}
                operatorId={operatorId}
                notify={notify}
                onGuardChange={() => setRevision((r) => r + 1)}
              />
              <EvidenceUploadPanel
                caseId={selected.caseId}
                theme={theme}
                notify={notify}
                onUpdated={() => setRevision((r) => r + 1)}
              />
              <OperatorReviewPanel
                caseId={selected.caseId}
                disputeCase={selected}
                operatorId={operatorId}
                theme={theme}
                notify={notify}
                onUpdated={() => setRevision((r) => r + 1)}
              />
            </>
          ) : (
            <p className={`text-xs ${theme.muted}`}>케이스를 선택하세요.</p>
          )}
        </div>
      </div>
    </div>
  );
}
