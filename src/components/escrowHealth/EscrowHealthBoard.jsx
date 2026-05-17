import React, { useEffect, useMemo, useState } from "react";
import { ESCROW_HEALTH_TEST_IDS } from "../../escrowHealth/escrowHealthTestIds.js";
import { buildEscrowHealthSnapshot, recordEscrowHealthOverviewView } from "../../escrowHealth/escrowHealthHelpers.js";
import { isEscrowHealthOverviewEnabled } from "../../escrowHealth/escrowHealthFeatureFlags.js";
import { RiskStatusBadge } from "../risk/RiskStatusBadge.jsx";

function HealthMetricCard({ label, value, sub, status, theme }) {
  return (
    <div
      data-testid={ESCROW_HEALTH_TEST_IDS.summaryCard}
      className={`rounded-xl border p-3 ${theme.card}`}
    >
      <div className={`text-[10px] font-bold uppercase opacity-70 ${theme.muted}`}>{label}</div>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <span className="text-lg font-black tabular-nums">{value}</span>
        {status ? <RiskStatusBadge status={status} compact /> : null}
      </div>
      {sub ? <p className={`mt-1 text-[10px] ${theme.muted}`}>{sub}</p> : null}
    </div>
  );
}

export function EscrowHealthBoard({ theme, compact = false, auditContext = "admin", onRefresh }) {
  const [revision, setRevision] = useState(0);

  const snapshot = useMemo(() => {
    void revision;
    return buildEscrowHealthSnapshot();
  }, [revision]);

  useEffect(() => {
    if (!isEscrowHealthOverviewEnabled()) return;
    recordEscrowHealthOverviewView(auditContext);
  }, [auditContext, revision]);

  if (!isEscrowHealthOverviewEnabled()) return null;

  const refresh = () => {
    setRevision((r) => r + 1);
    onRefresh?.();
  };

  return (
    <div
      data-testid={ESCROW_HEALTH_TEST_IDS.board}
      className={`mb-4 rounded-2xl border border-dashed border-teal-500/30 bg-teal-500/5 p-4 ${theme.cardSoft}`}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-black">Escrow Health Overview (mock)</div>
          <p className={`text-[10px] ${theme.muted}`}>운영 집계 · dispute · risk guard · notifications · no API</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded bg-cyan-500/20 px-1.5 py-0.5 text-[8px] font-black text-cyan-300">MOCK ONLY</span>
          <span data-testid={ESCROW_HEALTH_TEST_IDS.overviewVerdict}>
            <RiskStatusBadge
              status={snapshot.overviewVerdict}
              label={`OVERVIEW ${snapshot.overviewVerdict.toUpperCase()}`}
            />
          </span>
          <button type="button" onClick={refresh} className={`rounded-lg border px-2 py-1 text-[10px] font-black ${theme.main}`}>
            refresh
          </button>
        </div>
      </div>

      <div className={`grid gap-2 ${compact ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-4"}`}>
        <HealthMetricCard
          label="Open escrow (mock)"
          value={snapshot.openEscrowCount}
          sub="non-terminal dispute cases"
          theme={theme}
        />
        <HealthMetricCard
          label="Release blocked"
          value={snapshot.releaseBlockedCount}
          sub="risk guard active holds"
          status={snapshot.releaseBlockedCount > 0 ? "warn" : "pass"}
          theme={theme}
        />
        <HealthMetricCard
          label="Dispute pressure"
          value={`${snapshot.disputePressure.ratioPct}%`}
          sub={`${snapshot.disputePressure.activeCount} active · ${snapshot.disputePressure.label}`}
          status={snapshot.disputePressure.level}
          theme={theme}
        />
        <HealthMetricCard
          label="Notifications"
          value={snapshot.notificationPressure.unreadCount}
          sub={`dispute ${snapshot.notificationPressure.disputeRelatedCount} · escrow ${snapshot.notificationPressure.escrowRelatedCount}`}
          status={snapshot.notificationPressure.level}
          theme={theme}
        />
      </div>

      {!compact ? (
        <div className="mt-3 grid gap-3 lg:grid-cols-3">
          <div className={`rounded-xl border p-3 ${theme.card}`}>
            <div className="mb-2 text-[10px] font-black uppercase text-teal-300">Risk Guard</div>
            <div className="flex flex-wrap gap-2 text-[10px]">
              <RiskStatusBadge status={snapshot.riskGuardSummary.escrowGuardStatus} label="guard" />
              <span className={theme.muted}>blocked {snapshot.riskGuardSummary.blockedCaseCount}</span>
              <span className={theme.muted}>issues {snapshot.riskGuardSummary.issueCount}</span>
            </div>
          </div>
          <div className={`rounded-xl border p-3 ${theme.card}`}>
            <div className="mb-2 text-[10px] font-black uppercase text-teal-300">Diagnostics / Self-test</div>
            <div className="flex flex-wrap gap-2 text-[10px]">
              <RiskStatusBadge status={snapshot.diagnosticsVerdict.level} label="diag" />
              <RiskStatusBadge status={snapshot.adminSelfTestRef.status} label="admin ST" />
              <span className={theme.muted}>UTE issues {snapshot.diagnosticsVerdict.uteIssueCount}</span>
              {snapshot.adminSelfTestRef.coreOverall ? (
                <span className={theme.muted}>core {snapshot.adminSelfTestRef.coreOverall}</span>
              ) : null}
            </div>
          </div>
          <div
            data-testid={ESCROW_HEALTH_TEST_IDS.disputeTrend}
            className={`rounded-xl border p-3 ${theme.card}`}
          >
            <div className="mb-2 text-[10px] font-black uppercase text-teal-300">Dispute trend (status)</div>
            <div className="space-y-1">
              {snapshot.disputeTrend.map((row) => (
                <div key={row.status} className="flex justify-between text-[10px] font-mono">
                  <span>{row.status}</span>
                  <span className="font-bold">{row.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <div
        data-testid={ESCROW_HEALTH_TEST_IDS.releaseBlocked}
        className={`mt-3 rounded-lg border px-3 py-2 text-[10px] ${theme.input}`}
      >
        <span className="font-black">Release blocked summary:</span>{" "}
        {snapshot.releaseBlockedCount === 0
          ? "no active mock holds"
          : `${snapshot.releaseBlockedCount} case(s) — mock release disabled until resolve`}
      </div>
    </div>
  );
}
