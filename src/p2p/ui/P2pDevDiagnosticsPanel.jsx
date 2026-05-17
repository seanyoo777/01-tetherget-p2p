import React, { useSyncExternalStore } from "react";
import {
  formatP2pCacheAgeLabel,
  resolveShowP2pDevDiagnostics,
  resolveP2pDiagnosticsMode,
  subscribeP2pDiagnosticsSnapshot,
  getP2pDiagnosticsSnapshotRevision,
} from "../p2pDevDiagnostics.js";
import { getP2pDiagnosticsSnapshot } from "../p2pDiagnosticsSnapshot.js";
import { P2P_TEST_IDS } from "../p2pTestIds.js";
import { isP2pTradeDark } from "./p2pTradeShell.js";

export function P2pDevDiagnosticsPanel({
  theme,
  show,
  showDevDiagnostics,
  diagnosticsRevision = 0,
  mode = "full",
  compact,
}) {
  const snapshotRevision = useSyncExternalStore(
    subscribeP2pDiagnosticsSnapshot,
    getP2pDiagnosticsSnapshotRevision,
    () => 0,
  );
  void diagnosticsRevision;
  void snapshotRevision;

  const visible = resolveShowP2pDevDiagnostics(showDevDiagnostics ?? show);
  if (!visible) return null;

  const resolvedMode = resolveP2pDiagnosticsMode(compact ? "strip" : mode);
  const isDark = isP2pTradeDark(theme);
  const diag = getP2pDiagnosticsSnapshot();
  const validationOk = diag.validationOk;

  const badges = (
    <>
      <span
        data-testid={P2P_TEST_IDS.mockOnlyBadge}
        className="rounded bg-cyan-500/20 px-1.5 py-0.5 text-[8px] font-black text-cyan-300"
      >
        MOCK ONLY
      </span>
      <span
        data-testid={P2P_TEST_IDS.validationBadge}
        data-validation-status={validationOk ? "ok" : "fail"}
        className={`rounded px-1.5 py-0.5 text-[8px] font-black ${
          validationOk ? "bg-emerald-500/25 text-emerald-200" : "bg-rose-500/25 text-rose-200"
        }`}
      >
        {validationOk ? "VALIDATION OK" : "VALIDATION FAIL"}
      </span>
    </>
  );

  if (resolvedMode === "badge-only") {
    return (
      <div
        data-testid={P2P_TEST_IDS.devDiagnostics}
        data-diagnostics-mode="badge-only"
        className={`mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-dashed px-2 py-1.5 ${
          isDark ? "border-cyan-500/30 bg-cyan-950/15" : "border-cyan-300 bg-cyan-50/60"
        }`}
      >
        <span className="text-[9px] font-black uppercase tracking-wider text-cyan-400">P2P diag</span>
        {badges}
        <span className={`text-[8px] font-mono ${theme.muted}`}>issues {diag.issueCount}</span>
      </div>
    );
  }

  if (resolvedMode === "strip") {
    return (
      <div
        data-testid={P2P_TEST_IDS.devDiagnosticsCompact}
        data-diagnostics-mode="strip"
        className={`mb-3 flex flex-col gap-2 rounded-xl border border-dashed p-2 sm:flex-row sm:flex-wrap sm:items-center ${
          isDark ? "border-cyan-500/30 bg-cyan-950/20" : "border-cyan-300 bg-cyan-50/80"
        }`}
      >
        <span className="text-[9px] font-black uppercase tracking-wider text-cyan-400">P2P diagnostics</span>
        {badges}
        <div className="flex flex-wrap gap-2 text-[9px] font-mono font-bold tabular-nums">
          <StripChip label="orders" value={String(diag.orderCount)} />
          <StripChip label="issues" value={String(diag.issueCount)} highlight={diag.issueCount > 0} />
          <StripChip
            label="risk"
            value={String(diag.riskGuardStatus || "—")}
            highlight={diag.riskGuardStatus === "fail"}
          />
          <StripChip label="rg-issues" value={String(diag.riskGuardIssueCount ?? 0)} highlight={(diag.riskGuardIssueCount ?? 0) > 0} />
          {diag.selfTestCoreOverall ? (
            <StripChip
              label="core"
              value={`${diag.selfTestCoreOverall}`}
              highlight={diag.selfTestCoreOverall === "FAIL"}
            />
          ) : (
            <StripChip label="core" value="—" />
          )}
          <StripChip label="aligned" value={`${diag.alignedCount}/${diag.orderCountValidated}`} />
          <StripChip label="dispute" value={`${diag.disputeRatio}%`} />
          <StripChip label="age" value={formatP2pCacheAgeLabel(diag.cacheAgeMs)} />
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid={P2P_TEST_IDS.devDiagnostics}
      data-diagnostics-mode="full"
      className={`mb-3 rounded-xl border border-dashed p-3 max-sm:p-2 ${
        isDark ? "border-cyan-500/30 bg-cyan-950/20" : "border-cyan-300 bg-cyan-50/80"
      }`}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2 sm:hidden">
        <span className="text-[9px] font-black uppercase text-cyan-400">P2P diag</span>
        {badges}
        <span className={`text-[8px] font-mono ${theme.muted}`}>
          {diag.orderCount}건 · issues {diag.issueCount}
        </span>
      </div>
      <div className="mb-2 hidden flex-wrap items-center gap-2 sm:flex">
        <span className="text-[10px] font-black uppercase tracking-wider text-cyan-400">Dev diagnostics</span>
        {badges}
        {diag.refreshSelfTestRan ? (
          <span className={`text-[8px] font-mono ${theme.muted}`}>post-refresh self-test</span>
        ) : null}
      </div>
      <div
        data-testid={P2P_TEST_IDS.adminCacheState}
        data-cache-synced={diag.cacheSynced ? "true" : "false"}
        data-cache-source={diag.cacheSource}
        className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 max-sm:hidden"
      >
        <DiagCell label="UTE cache" value={diag.cacheSynced ? "synced" : "fallback"} />
        <DiagCell label="cache source" value={diag.cacheSource} mono />
        <DiagCell label="order count" value={String(diag.orderCount)} />
        <DiagCell label="cache age" value={formatP2pCacheAgeLabel(diag.cacheAgeMs)} mono />
        <DiagCell label="dispute ratio" value={`${diag.disputeRatio}%`} />
        <DiagCell label="delayed ratio" value={`${diag.delayedRatio}%`} />
        <DiagCell label="aligned" value={`${diag.alignedCount}/${diag.orderCountValidated}`} />
        <DiagCell label="issues" value={String(diag.issueCount)} accent={diag.issueCount > 0 ? "rose" : "emerald"} />
        <DiagCell
          label="risk guard"
          value={String(diag.riskGuardStatus || "pass")}
          accent={diag.riskGuardStatus === "fail" ? "rose" : diag.riskGuardStatus === "warn" ? "rose" : "emerald"}
        />
        <DiagCell label="rg issues" value={String(diag.riskGuardIssueCount ?? 0)} accent={(diag.riskGuardIssueCount ?? 0) > 0 ? "rose" : "emerald"} />
        <DiagCell
          label="rg checked"
          value={diag.riskGuardLastChecked ? new Date(diag.riskGuardLastChecked).toLocaleTimeString() : "—"}
          mono
        />
        <DiagCell
          label="core ST"
          value={diag.selfTestCoreOverall || "—"}
          accent={diag.selfTestCoreOverall === "FAIL" ? "rose" : diag.selfTestCoreOverall === "WARN" ? "rose" : "emerald"}
        />
        <DiagCell label="core fail#" value={String(diag.selfTestCoreIssueCount ?? "—")} mono />
      </div>
      {!validationOk && diag.validation?.issues?.length ? (
        <p className={`mt-2 font-mono text-[9px] max-sm:mt-1 ${theme.muted}`}>
          {diag.validation.issues.slice(0, 5).join(" · ")}
        </p>
      ) : null}
    </div>
  );
}

function StripChip({ label, value, highlight = false }) {
  return (
    <span
      className={`rounded-md border px-1.5 py-0.5 ${
        highlight ? "border-rose-500/40 text-rose-300" : "border-white/15 text-slate-300"
      }`}
    >
      <span className="opacity-60">{label}</span> {value}
    </span>
  );
}

function DiagCell({ label, value, mono = false, accent }) {
  const border =
    accent === "rose" ? "border-rose-500/30" : accent === "emerald" ? "border-emerald-500/30" : "border-white/10";
  return (
    <div className={`rounded-lg border bg-black/20 px-2 py-1.5 ${border}`}>
      <div className="text-[8px] font-bold uppercase opacity-60">{label}</div>
      <div className={`text-[11px] font-black ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}
