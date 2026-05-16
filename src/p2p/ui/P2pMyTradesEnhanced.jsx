import React, { useState } from "react";
import { P2pReferralSummaryCard } from "./P2pReferralSummaryCard.jsx";
import { P2pTradeDetailPanel } from "./P2pTradeDetailPanel.jsx";
import { P2pTradeTimeline } from "./P2pTradeTimeline.jsx";

export function P2pMyTradesEnhanced({
  theme,
  authToken,
  serverOrders,
  serverLoading,
  formatNumber,
  formatMatchCountdown,
  orderFlowActionId,
  timelineOrderId,
  orderEventsCache,
  orderEventsLoadingId,
  serverCancelId,
  onCancelListing,
  onPaymentStart,
  onMarkPaid,
  onCompleteSeller,
  onWithdrawMatch,
  onToggleTimeline,
  onRefreshTimeline,
  demoTradesSection,
}) {
  const [expandedId, setExpandedId] = useState(null);
  const activeExpandedId = expandedId ?? serverOrders?.[0]?.id ?? null;

  return (
    <>
      {authToken ? <div className="mb-6"><P2pReferralSummaryCard theme={theme} formatNumber={formatNumber} /></div> : null}

      {authToken ? (
        <div className="mb-6 space-y-3">
          <div className={`text-sm font-black ${theme.subtext}`}>
            서버 P2P 주문 {serverLoading ? "(불러오는 중…)" : `(${serverOrders.length}건)`}
          </div>
          {serverOrders.length ? (
            serverOrders.map((row) => {
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
                        {row.my_role === "seller" && row.status === "listed" ? (
                          <button
                            type="button"
                            disabled={serverCancelId === row.id}
                            onClick={() => onCancelListing(row.id)}
                            className={`rounded-xl border border-amber-500/60 px-3 py-2 text-xs font-black text-amber-600 ${theme.input}`}
                          >
                            {serverCancelId === row.id ? "취소 중…" : "호가 취소"}
                          </button>
                        ) : null}
                        {row.my_role === "buyer" && row.status === "matched" && !row.buyer_payment_started_at ? (
                          <button
                            type="button"
                            disabled={orderFlowActionId === row.id}
                            onClick={() => onPaymentStart(row.id)}
                            className={`rounded-xl border border-violet-500/60 px-3 py-2 text-xs font-black text-violet-200 ${theme.input}`}
                          >
                            {orderFlowActionId === row.id ? "처리 중…" : "송금 신청"}
                          </button>
                        ) : null}
                        {row.my_role === "buyer" && row.status === "matched" && row.buyer_payment_started_at ? (
                          <button
                            type="button"
                            disabled={orderFlowActionId === row.id}
                            onClick={() => onMarkPaid(row.id)}
                            className={`rounded-xl border border-sky-500/60 px-3 py-2 text-xs font-black text-sky-300 ${theme.input}`}
                          >
                            {orderFlowActionId === row.id ? "처리 중…" : "송금 완료 표시"}
                          </button>
                        ) : null}
                        {row.status === "matched" && row.my_role === "seller" ? (
                          <button
                            type="button"
                            disabled={orderFlowActionId === row.id}
                            onClick={() => onWithdrawMatch(row.id)}
                            className={`rounded-xl border border-red-500/50 px-3 py-2 text-xs font-black text-red-300 ${theme.input}`}
                          >
                            {orderFlowActionId === row.id ? "처리 중…" : "매칭 취소"}
                          </button>
                        ) : null}
                        {row.status === "matched" && row.my_role === "buyer" && !row.buyer_payment_started_at ? (
                          <button
                            type="button"
                            disabled={orderFlowActionId === row.id}
                            onClick={() => onWithdrawMatch(row.id)}
                            className={`rounded-xl border border-red-500/50 px-3 py-2 text-xs font-black text-red-300 ${theme.input}`}
                          >
                            {orderFlowActionId === row.id ? "처리 중…" : "매칭 철회"}
                          </button>
                        ) : null}
                        {row.my_role === "seller" && row.status === "payment_sent" ? (
                          <button
                            type="button"
                            disabled={orderFlowActionId === row.id}
                            onClick={() => onCompleteSeller(row.id)}
                            className={`rounded-xl border border-emerald-500/60 px-3 py-2 text-xs font-black text-emerald-300 ${theme.input}`}
                          >
                            {orderFlowActionId === row.id ? "처리 중…" : "거래 완료(모의 릴리즈)"}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => onToggleTimeline(row.id)}
                          className={`rounded-xl border px-3 py-2 text-xs font-black ${theme.input}`}
                        >
                          {timelineOrderId === row.id ? "타임라인 닫기" : "이벤트 타임라인"}
                        </button>
                      </>
                    }
                  />
                  {expanded && timelineOrderId === row.id ? (
                    <P2pTradeTimeline
                      theme={theme}
                      row={row}
                      serverEvents={orderEventsCache[row.id]}
                      loading={orderEventsLoadingId === row.id}
                      onRefresh={() => onRefreshTimeline(row.id)}
                    />
                  ) : null}
                </div>
              );
            })
          ) : !serverLoading ? (
            <div className={`rounded-2xl border p-4 text-sm ${theme.input}`}>아직 서버에 등록된 P2P 주문이 없습니다.</div>
          ) : null}
        </div>
      ) : (
        <div className={`mb-6 rounded-2xl border p-3 text-sm ${theme.input}`}>로그인하면 서버에 저장된 P2P 주문이 여기에 표시됩니다.</div>
      )}

      {demoTradesSection}
    </>
  );
}
