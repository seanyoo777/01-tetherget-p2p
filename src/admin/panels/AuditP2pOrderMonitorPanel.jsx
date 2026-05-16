import React from "react";

/** `audit` tab — **P2P 주문 모니터** block (`mt-8 border-t` slice; shared audit card root in `App.jsx`). */
export function AuditP2pOrderMonitorPanel(props) {
  const {
    theme,
    adminP2pLoading,
    adminP2pOrders,
    actorNameMap,
    toggleAdminP2pTimeline,
    adminP2pTimelineId,
    adminP2pCancelId,
    adminCancelP2pOrder,
    adminP2pEventsLoadingId,
    refreshAdminP2pTimeline,
    setAdminP2pTimelineId,
    adminP2pEventsCache,
  } = props;

  return (
    <div className="mt-8 border-t border-white/10 pt-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-black">P2P 주문 모니터</div>
          <div className={`text-xs ${theme.muted}`}>전체 주문 상태 · 판매자/매수자 user_id (관리자 전용)</div>
        </div>
        <span className={`rounded-full px-2 py-1 text-[11px] font-black ${theme.cardSoft}`}>
          {adminP2pLoading ? "…" : `${adminP2pOrders.length}건`}
        </span>
      </div>
      <div className="max-h-[min(50vh,420px)] overflow-auto rounded-2xl border border-white/10">
        <table className="min-w-full text-left text-[11px]">
          <thead className={`sticky top-0 z-10 ${theme.card}`}>
            <tr className={`border-b ${theme.muted}`}>
              <th className="px-2 py-2">주문 ID</th>
              <th className="py-2 pr-2">상태</th>
              <th className="py-2 pr-2">플랫폼</th>
              <th className="py-2 pr-2">코인/수량</th>
              <th className="py-2 pr-2">판매자</th>
              <th className="py-2 pr-2">매수자</th>
              <th className="py-2 pr-2">갱신</th>
              <th className="py-2 pr-2">이벤트</th>
              <th className="py-2 pr-2">중재</th>
            </tr>
          </thead>
          <tbody>
            {(adminP2pOrders || []).map((row) => (
              <tr key={row.id} className={`border-b border-white/5 ${theme.subtext}`}>
                <td className="max-w-[140px] truncate px-2 py-1.5 font-mono text-[10px]" title={row.id}>{row.id}</td>
                <td className="py-1.5 pr-2">{row.status}</td>
                <td className="py-1.5 pr-2 font-mono text-[10px]">{row.platform_code || "—"}</td>
                <td className="py-1.5 pr-2 whitespace-nowrap">{row.amount} {row.coin}</td>
                <td className="py-1.5 pr-2">{actorNameMap[row.seller_user_id] || `#${row.seller_user_id}`}</td>
                <td className="py-1.5 pr-2">{row.buyer_user_id != null ? (actorNameMap[row.buyer_user_id] || `#${row.buyer_user_id}`) : "—"}</td>
                <td className="py-1.5 pr-2 whitespace-nowrap text-[10px]">{row.updated_at}</td>
                <td className="py-1.5 pr-2">
                  <button
                    type="button"
                    onClick={() => toggleAdminP2pTimeline(row.id)}
                    className={`rounded-lg border px-2 py-1 text-[10px] font-black ${theme.input}`}
                  >
                    {adminP2pTimelineId === row.id ? "닫기" : "보기"}
                  </button>
                </td>
                <td className="py-1.5 pr-2">
                  {row.status === "matched" || row.status === "payment_sent" ? (
                    <button
                      type="button"
                      disabled={adminP2pCancelId === row.id}
                      onClick={() => adminCancelP2pOrder(row.id)}
                      className={`rounded-lg border border-red-500/50 px-2 py-1 text-[10px] font-black text-red-300 ${theme.input}`}
                    >
                      {adminP2pCancelId === row.id ? "…" : "취소"}
                    </button>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {adminP2pTimelineId ? (
        <div className={`mt-4 rounded-2xl border border-white/10 p-4 ${theme.card}`}>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-black text-emerald-400">이벤트 타임라인 · {adminP2pTimelineId}</span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={adminP2pEventsLoadingId === adminP2pTimelineId}
                onClick={() => refreshAdminP2pTimeline(adminP2pTimelineId)}
                className={`rounded-lg border px-2 py-1 text-[10px] font-black ${theme.input}`}
              >
                {adminP2pEventsLoadingId === adminP2pTimelineId ? "…" : "타임라인 새로고침"}
              </button>
              <button type="button" onClick={() => setAdminP2pTimelineId("")} className={`rounded-lg border px-2 py-1 text-[10px] font-black ${theme.input}`}>
                닫기
              </button>
            </div>
          </div>
          {adminP2pEventsLoadingId === adminP2pTimelineId ? (
            <div className={`text-xs ${theme.muted}`}>불러오는 중…</div>
          ) : (adminP2pEventsCache[adminP2pTimelineId] || []).length ? (
            <ul className="max-h-64 space-y-2 overflow-auto text-[11px]">
              {(adminP2pEventsCache[adminP2pTimelineId] || []).map((ev) => (
                <li key={ev.id} className={`rounded-lg border border-white/5 px-2 py-2 ${theme.cardSoft}`}>
                  <div className="flex flex-wrap gap-2">
                    <span className="font-mono text-[10px] text-sky-400">{ev.created_at}</span>
                    <span className="font-black">{ev.action}</span>
                    <span className={`text-[10px] ${theme.muted}`}>#{ev.actor_user_id ?? "—"}</span>
                  </div>
                  <pre className={`mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-all font-mono text-[10px] ${theme.muted}`}>{ev.detail_json}</pre>
                </li>
              ))}
            </ul>
          ) : (
            <div className={`text-xs ${theme.muted}`}>이벤트가 없습니다.</div>
          )}
        </div>
      ) : null}
      {!adminP2pLoading && (!adminP2pOrders || adminP2pOrders.length === 0) ? (
        <div className={`mt-3 text-xs ${theme.muted}`}>등록된 P2P 주문이 없습니다.</div>
      ) : null}
    </div>
  );
}
