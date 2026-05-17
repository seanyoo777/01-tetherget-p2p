import React from "react";
import { ESCROW_LABELS } from "../tradeFlowModel.js";
import { P2P_ESCROW_COPY } from "../p2pEscrowCopy.js";
import { P2P_TEST_IDS } from "../p2pTestIds.js";
import { P2pEscrowLifecycleLegend } from "./P2pEscrowLifecycleLegend.jsx";
import { isP2pTradeDark } from "./p2pTradeShell.js";
import { RiskStatusBadge } from "../../components/risk/RiskStatusBadge.jsx";
import { RISK_GUARD_TEST_IDS } from "../../risk/riskGuardTestIds.js";

const TONE = {
  amber: { dark: "border-amber-500/30 bg-amber-950/40 text-amber-100", light: "border-amber-200 bg-amber-50 text-amber-900" },
  sky: { dark: "border-sky-500/30 bg-sky-950/40 text-sky-100", light: "border-sky-200 bg-sky-50 text-sky-900" },
  emerald: { dark: "border-emerald-500/30 bg-emerald-950/40 text-emerald-100", light: "border-emerald-200 bg-emerald-50 text-emerald-900" },
  rose: { dark: "border-rose-500/30 bg-rose-950/40 text-rose-100", light: "border-rose-200 bg-rose-50 text-rose-900" },
  slate: { dark: "border-white/10 bg-white/5 text-slate-300", light: "border-stone-200 bg-stone-100 text-slate-700" },
};

export function P2pEscrowStatusPanel({ theme, flow }) {
  const isDark = isP2pTradeDark(theme);
  const displayKey = flow?.escrowDisplay || flow?.escrow;
  const meta = flow?.escrowDisplayMeta || ESCROW_LABELS[displayKey] || ESCROW_LABELS.locked;
  const tone =
    flow?.mockReleaseBlocked
      ? TONE.rose[isDark ? "dark" : "light"]
      : TONE[meta.tone]?.[isDark ? "dark" : "light"] || TONE.slate.dark;
  const phase = flow?.escrowPhaseCopy;
  const guard = flow?.escrowGuard;
  const party = flow?.partyRisk;

  return (
    <div data-testid={P2P_TEST_IDS.escrowPanel} className={`rounded-xl border p-3 ${tone}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-[10px] font-black uppercase tracking-wider opacity-80">
            {P2P_ESCROW_COPY.platformPanelTitle}
          </div>
          <div className="mt-0.5 text-sm font-black">{phase?.headline || meta.label}</div>
          <div className="mt-1 font-mono text-[10px] opacity-75">
            escrow · {displayKey}
            {flow?.escrowCanonical && flow.escrowCanonical !== displayKey ? ` · canon ${flow.escrowCanonical}` : ""}
          </div>
        </div>
        <span className="rounded-lg bg-black/20 px-2 py-1 font-mono text-[10px] font-bold">
          {flow?.matrixReleasing ? "releasing" : flow?.escrowCanonical || flow?.matrixStatus}
        </span>
      </div>

      {guard ? (
        <div
          data-testid={RISK_GUARD_TEST_IDS.escrowGuardPanel}
          className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-2 py-1.5"
        >
          <span className="text-[9px] font-bold opacity-80">Release Guard</span>
          <RiskStatusBadge status={guard.status} label={guard.status.toUpperCase()} compact />
          <RiskStatusBadge
            status={guard.releaseBlocked ? "fail" : "pass"}
            label={guard.releaseBlocked ? "BLOCKED" : "OPEN"}
            compact
          />
          {party?.buyer !== "pass" ? <RiskStatusBadge status={party.buyer} label="BUYER" compact /> : null}
          {party?.seller !== "pass" ? <RiskStatusBadge status={party.seller} label="SELLER" compact /> : null}
        </div>
      ) : null}

      {phase?.detail ? <p className="mt-2 text-[10px] leading-snug opacity-90">{phase.detail}</p> : null}
      {phase?.dualNote ? (
        <p className={`mt-2 rounded border border-white/10 px-2 py-1 text-[9px] leading-snug ${isDark ? "text-sky-200" : "text-sky-900"}`}>
          {phase.dualNote}
        </p>
      ) : null}
      {flow?.delayedRelease && !phase?.detail ? (
        <p className="mt-2 text-[10px] leading-snug opacity-90">
          릴리스 대기(waiting_release) 구간 — 실제 온체인·송금은 발생하지 않습니다.
        </p>
      ) : null}
      {flow?.hasActiveDispute ? (
        <p className="mt-2 text-[10px] font-bold text-rose-300">분쟁 활성 — escrow는 disputed</p>
      ) : null}
      {flow?.mockReleaseBlocked ? (
        <p className="mt-2 text-[10px] font-bold text-rose-200">
          Mock escrow release 비활성 — dispute_opened / releaseBlocked (실제 릴리스 없음)
        </p>
      ) : null}
      <p className={`mt-2 text-[9px] ${isDark ? "text-slate-400" : "text-slate-600"}`}>{P2P_ESCROW_COPY.platformPanelFootnote}</p>
      <div className="mt-2">
        <P2pEscrowLifecycleLegend theme={theme} compact />
      </div>
    </div>
  );
}
