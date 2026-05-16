import React from "react";
import { isP2pTradeDark } from "./p2pTradeShell.js";

export function P2pDisputeMockBadge({ dispute, theme }) {
  if (!dispute) return null;
  const isDark = isP2pTradeDark(theme);
  return (
    <div
      className={`rounded-xl border px-3 py-2 ${
        isDark ? "border-rose-500/35 bg-rose-950/30" : "border-rose-200 bg-rose-50"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-black uppercase tracking-wide text-rose-400">Dispute (mock)</span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${isDark ? "bg-rose-500/30 text-rose-100" : "bg-rose-200 text-rose-900"}`}>
          {dispute.stateLabel || dispute.state}
        </span>
        <span className={`font-mono text-[9px] ${theme.muted}`}>{dispute.id}</span>
      </div>
      {dispute.state === "WAITING_EVIDENCE" ? (
        <p className={`mt-1 text-[10px] ${theme.subtext}`}>증빙 {dispute.evidence_count}건 · 자동 판결 없음</p>
      ) : null}
    </div>
  );
}
