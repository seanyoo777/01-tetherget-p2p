import React, { useState } from "react";
import { P2P_TEST_IDS } from "../p2pTestIds.js";
import { isP2pTradeDark } from "./p2pTradeShell.js";
import { P2pTradeDetailPanel } from "./P2pTradeDetailPanel.jsx";
import { P2pTradeTimeline } from "./P2pTradeTimeline.jsx";

export function P2pProgressOrdersSection({
  theme,
  orders,
  loading,
  formatNumber,
  formatMatchCountdown,
  tradeFlowActionId,
  tradeTimelineOrderId,
  tradeOrderEventsCache,
  tradeOrderEventsLoadingId,
  onPaymentStart,
  onMarkPaid,
  onCompleteSeller,
  onWithdrawMatch,
  onToggleTimeline,
  onRefreshTimeline,
}) {
  const [expandedId, setExpandedId] = useState(null);
  const isDark = isP2pTradeDark(theme);
  const activeExpandedId = expandedId ?? orders?.[0]?.id ?? null;

  if (!orders?.length && !loading) return null;

  return (
    <div
      data-testid={P2P_TEST_IDS.progressOrders}
      className={`mb-4 space-y-3 rounded-2xl border p-3 sm:p-4 ${
        isDark ? "border-amber-500/20 bg-amber-950/20" : "border-amber-200 bg-amber-50/80"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-black">진행 중인 주문</div>
        {loading ? <span className={`text-xs ${theme.muted}`}>동기화…</span> : null}
      </div>
      <div className="space-y-3">
        {orders.map((row) => {
          const expanded = activeExpandedId === row.id;
          const countdown =
            row.status === "matched" && row.match_deadline_at ? formatMatchCountdown(row.match_deadline_at) : null;
          return (
            <div key={row.id} className="space-y-2">
              <P2pTradeDetailPanel
                theme={theme}
                row={row}
                formatNumber={formatNumber}
                matchCountdown={countdown}
                expanded={expanded}
                onToggle={() => setExpandedId((cur) => (cur === row.id ? "" : row.id))}
                childrenActions={
                  <>
                    {row.my_role === "buyer" && row.status === "matched" && !row.buyer_payment_started_at ? (
                      <button
                        type="button"
                        disabled={tradeFlowActionId === row.id}
                        onClick={() => onPaymentStart(row.id)}
                        className={`rounded-xl border border-violet-500/60 px-3 py-2 text-[11px] font-black text-violet-200 ${theme.input}`}
                      >
                        {tradeFlowActionId === row.id ? "처리 중…" : "송금 신청"}
                      </button>
                    ) : null}
                    {row.my_role === "buyer" && row.status === "matched" && row.buyer_payment_started_at ? (
                      <button
                        type="button"
                        disabled={tradeFlowActionId === row.id}
                        onClick={() => onMarkPaid(row.id)}
                        className={`rounded-xl border border-sky-500/60 px-3 py-2 text-[11px] font-black text-sky-200 ${theme.input}`}
                      >
                        {tradeFlowActionId === row.id ? "처리 중…" : "송금 완료 표시"}
                      </button>
                    ) : null}
                    {row.my_role === "seller" && row.status === "payment_sent" ? (
                      <button
                        type="button"
                        disabled={tradeFlowActionId === row.id}
                        onClick={() => onCompleteSeller(row.id)}
                        className={`rounded-xl border border-emerald-500/60 px-3 py-2 text-[11px] font-black text-emerald-200 ${theme.input}`}
                      >
                        {tradeFlowActionId === row.id ? "처리 중…" : "거래 완료(모의 릴리즈)"}
                      </button>
                    ) : null}
                    {row.status === "matched" && row.my_role === "seller" ? (
                      <button
                        type="button"
                        disabled={tradeFlowActionId === row.id}
                        onClick={() => onWithdrawMatch(row.id)}
                        className={`rounded-xl border border-red-500/50 px-3 py-2 text-[11px] font-black text-red-300 ${theme.input}`}
                      >
                        {tradeFlowActionId === row.id ? "처리 중…" : "매칭 취소"}
                      </button>
                    ) : null}
                    {row.status === "matched" && row.my_role === "buyer" && !row.buyer_payment_started_at ? (
                      <button
                        type="button"
                        disabled={tradeFlowActionId === row.id}
                        onClick={() => onWithdrawMatch(row.id)}
                        className={`rounded-xl border border-red-500/50 px-3 py-2 text-[11px] font-black text-red-300 ${theme.input}`}
                      >
                        {tradeFlowActionId === row.id ? "처리 중…" : "매칭 철회"}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => onToggleTimeline(row.id)}
                      className={`rounded-xl border px-3 py-2 text-[11px] font-black ${theme.input}`}
                    >
                      {tradeTimelineOrderId === row.id ? "타임라인 닫기" : "타임라인"}
                    </button>
                  </>
                }
              />
              {expanded && tradeTimelineOrderId === row.id ? (
                <P2pTradeTimeline
                  theme={theme}
                  row={row}
                  serverEvents={tradeOrderEventsCache[row.id]}
                  loading={tradeOrderEventsLoadingId === row.id}
                  onRefresh={() => onRefreshTimeline(row.id)}
                  compact
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
