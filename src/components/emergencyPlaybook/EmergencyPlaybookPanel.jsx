import React, { useEffect, useMemo, useState } from "react";
import { EMERGENCY_PLAYBOOK_TEST_IDS } from "../../emergencyPlaybook/emergencyPlaybookTestIds.js";
import { EMERGENCY_MOCK_ACTIONS } from "../../emergencyPlaybook/emergencyPlaybookConstants.js";
import {
  buildEmergencyPlaybookSnapshot,
  recordEmergencyPlaybookView,
  recordMockEmergencyAction,
} from "../../emergencyPlaybook/emergencyPlaybookHelpers.js";
import { isEmergencyResponsePlaybookEnabled } from "../../emergencyPlaybook/emergencyPlaybookFeatureFlags.js";
import { RiskStatusBadge } from "../risk/RiskStatusBadge.jsx";

function StatusStrip({ label, value, status, theme }) {
  return (
    <div className={`rounded-lg border px-2 py-1.5 ${theme.card}`}>
      <div className={`text-[9px] font-bold uppercase opacity-70 ${theme.muted}`}>{label}</div>
      <div className="mt-0.5 flex flex-wrap items-center gap-1">
        <span className="text-xs font-black">{value}</span>
        {status ? <RiskStatusBadge status={status} compact /> : null}
      </div>
    </div>
  );
}

export function EmergencyPlaybookPanel({
  theme,
  operatorId = "admin_mock",
  auditContext = "admin_dispute",
  onRefresh,
}) {
  const [revision, setRevision] = useState(0);

  const snapshot = useMemo(() => {
    void revision;
    return buildEmergencyPlaybookSnapshot();
  }, [revision]);

  useEffect(() => {
    if (!isEmergencyResponsePlaybookEnabled()) return;
    recordEmergencyPlaybookView(auditContext);
  }, [auditContext, revision]);

  if (!isEmergencyResponsePlaybookEnabled()) return null;

  const refresh = () => {
    setRevision((r) => r + 1);
    onRefresh?.();
  };

  const runMockAction = (actionId) => {
    recordMockEmergencyAction(actionId, operatorId, { context: auditContext });
    refresh();
  };

  return (
    <div
      data-testid={EMERGENCY_PLAYBOOK_TEST_IDS.panel}
      className={`mb-4 rounded-2xl border border-dashed border-rose-500/35 bg-rose-500/5 p-4 ${theme.cardSoft}`}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-black">Emergency Response Playbook (mock)</div>
          <p className={`text-[10px] ${theme.muted}`}>비상 대응 절차 · escrow health · risk guard · no real release</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[8px] font-black text-rose-200">MOCK ONLY</span>
          <span data-testid={EMERGENCY_PLAYBOOK_TEST_IDS.overviewVerdict}>
            <RiskStatusBadge
              status={snapshot.overviewVerdict}
              label={`EMERGENCY ${snapshot.overviewVerdict.toUpperCase()}`}
            />
          </span>
          <button type="button" onClick={refresh} className={`rounded-lg border px-2 py-1 text-[10px] font-black ${theme.main}`}>
            refresh
          </button>
        </div>
      </div>

      <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <StatusStrip
          label="Escrow emergency"
          value={snapshot.escrowEmergencyState.label}
          status={snapshot.escrowEmergencyState.level}
          theme={theme}
        />
        <StatusStrip
          label="Dispute spike"
          value={snapshot.disputeSpikeWarning.spikeDetected ? "SPIKE" : "normal"}
          status={snapshot.disputeSpikeWarning.level}
          theme={theme}
        />
        <StatusStrip
          label="Release block mode"
          value={snapshot.releaseBlockEmergencyMode.active ? "ACTIVE" : "off"}
          status={snapshot.releaseBlockEmergencyMode.level}
          theme={theme}
        />
        <StatusStrip
          label="Notifications"
          value={snapshot.notificationPressure.unreadCount}
          status={snapshot.notificationPressure.level}
          theme={theme}
        />
      </div>

      <p className={`mb-2 text-[10px] ${theme.muted}`}>{snapshot.disputeSpikeWarning.message}</p>

      <div className="mb-3 flex flex-wrap gap-1">
        {Object.values(EMERGENCY_MOCK_ACTIONS).map((action) => (
          <button
            key={action.id}
            type="button"
            data-testid={EMERGENCY_PLAYBOOK_TEST_IDS.mockAction}
            onClick={() => runMockAction(action.id)}
            className={`rounded-lg border px-2 py-1 text-[9px] font-black ${theme.main}`}
          >
            {action.label}
          </button>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div data-testid={EMERGENCY_PLAYBOOK_TEST_IDS.checklist} className={`rounded-xl border p-3 ${theme.card}`}>
          <div className="mb-2 text-[10px] font-black uppercase text-rose-300">Operator checklist</div>
          <ul className="space-y-1.5">
            {snapshot.operatorChecklist.map((item) => (
              <li key={item.id} className="flex items-start gap-2 text-[10px]">
                <span className={item.completed ? "text-emerald-400" : "text-amber-400"}>
                  {item.completed ? "✓" : "○"}
                </span>
                <span className={theme.muted}>
                  {item.label}
                  {item.required ? <span className="ml-1 text-rose-300">*</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div data-testid={EMERGENCY_PLAYBOOK_TEST_IDS.actionLog} className={`rounded-xl border p-3 ${theme.card}`}>
          <div className="mb-2 text-[10px] font-black uppercase text-rose-300">Mock emergency action log</div>
          {snapshot.mockEmergencyActionLog.length === 0 ? (
            <p className={`text-[10px] ${theme.muted}`}>No mock actions recorded yet.</p>
          ) : (
            <ul className="max-h-32 space-y-1 overflow-y-auto">
              {snapshot.mockEmergencyActionLog.map((row) => (
                <li key={row.id} className={`rounded border px-2 py-1 text-[9px] ${theme.input}`}>
                  <span className="font-black">{row.label}</span>
                  <span className={`ml-1 ${theme.muted}`}>· {row.operatorId}</span>
                </li>
              ))}
            </ul>
          )}
          <div className={`mt-2 text-[9px] ${theme.muted}`}>
            Health {snapshot.escrowHealthRef.overviewVerdict} · Risk {snapshot.riskGuardRef.escrowGuardStatus} · blocked{" "}
            {snapshot.riskGuardRef.blockedCaseCount}
          </div>
        </div>
      </div>
    </div>
  );
}
