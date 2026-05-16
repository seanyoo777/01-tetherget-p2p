import React from "react";
import { deriveTradeFlowView } from "../tradeFlowModel.js";
import { P2pTradeFlowStepper } from "./P2pTradeFlowStepper.jsx";
import { P2pRoleBadge } from "./P2pRoleBadge.jsx";
import { P2pEscrowStatusPanel } from "./P2pEscrowStatusPanel.jsx";
import { P2pDisputeMockBadge } from "./P2pDisputeMockBadge.jsx";
import { P2pStatusMatrixBadge, P2pStatusMatrixStrip } from "./P2pStatusMatrixBadge.jsx";
import { isP2pTradeDark, p2pSurfaceCard } from "./p2pTradeShell.js";

export function P2pTradeDetailPanel({
  theme,
  row,
  formatNumber,
  matchCountdown,
  expanded = true,
  onToggle,
  childrenActions,
}) {
  const [section, setSection] = React.useState({ flow: true, escrow: true, hints: true });
  if (!row) return null;
  const flow = deriveTradeFlowView(row);
  const isDark = isP2pTradeDark(theme);

  return (
    <div className={`overflow-hidden rounded-2xl border ${p2pSurfaceCard(isDark)}`}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start justify-between gap-2 p-3 text-left sm:p-4"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <P2pRoleBadge role={flow.role} theme={theme} />
            <P2pStatusMatrixBadge theme={theme} matrixStatus={flow.matrixStatus} compact />
            <span className="font-mono text-[10px] text-emerald-500">{row.id}</span>
          </div>
          <div className="mt-1 text-base font-black sm:text-lg">
            {formatNumber(row.amount)} {row.coin}
            {Number(row.unit_price) > 0 ? (
              <span className={`ml-2 text-sm font-bold ${theme.muted}`}>@ {formatNumber(row.unit_price)}</span>
            ) : null}
          </div>
          {matchCountdown ? <p className="mt-1 text-[11px] font-bold text-amber-400">{matchCountdown}</p> : null}
        </div>
        <span className={`shrink-0 text-xs font-black ${theme.muted}`}>{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded ? (
        <div className="space-y-3 border-t border-white/10 px-3 pb-3 pt-3 sm:px-4 sm:pb-4">
          <SectionToggle label="상태 매트릭스" open={section.flow} onToggle={() => setSection((s) => ({ ...s, flow: !s.flow }))} theme={theme} />
          {section.flow ? (
            <>
              <P2pStatusMatrixStrip theme={theme} activeStatus={flow.matrixStatus} />
              <P2pTradeFlowStepper
                theme={theme}
                steps={flow.steps}
                matrixHint={flow.stepperMatrixHint}
                matrixStatus={flow.matrixStatus}
              />
            </>
          ) : null}
          <SectionToggle label="Escrow · 안내" open={section.escrow} onToggle={() => setSection((s) => ({ ...s, escrow: !s.escrow }))} theme={theme} />
          {section.escrow ? (
          <div className="grid gap-3 lg:grid-cols-2">
            <P2pEscrowStatusPanel theme={theme} flow={flow} />
            <div className={`rounded-xl border p-3 ${isDark ? "border-white/10 bg-white/5" : "border-stone-200 bg-white"}`}>
              <div className="text-[10px] font-black uppercase tracking-wide opacity-70">내 역할 안내</div>
              <p className={`mt-2 text-xs leading-relaxed ${theme.subtext}`}>
                {flow.buyerHint || flow.sellerHint || "진행 단계에 따라 버튼이 표시됩니다. (모의 거래)"}
              </p>
              <div className={`mt-2 grid grid-cols-2 gap-2 text-[10px] ${theme.muted}`}>
                <span>결제: {row.payment_method || "—"}</span>
                <span>갱신: {row.updated_at || row.created_at}</span>
              </div>
            </div>
          </div>
          ) : null}
          <P2pDisputeMockBadge dispute={flow.dispute} theme={theme} />
          {childrenActions ? (
            <div className="sticky bottom-0 z-10 -mx-3 flex flex-wrap gap-2 border-t border-white/10 bg-black/40 p-3 backdrop-blur-sm sm:-mx-4">
              {childrenActions}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function SectionToggle({ label, open, onToggle, theme }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`flex w-full items-center justify-between rounded-lg border px-2 py-1.5 text-left text-[10px] font-black ${theme.input}`}
    >
      <span>{label}</span>
      <span className={theme.muted}>{open ? "▼" : "▶"}</span>
    </button>
  );
}
