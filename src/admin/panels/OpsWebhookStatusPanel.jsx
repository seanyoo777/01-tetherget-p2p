import React from "react";

/** `ops` tab — **Webhook 전송 상태** card (inside `admin-tab-ops`, boundary in `App.jsx`). */
export function OpsWebhookStatusPanel(props) {
  const {
    theme,
    visible,
    webhookChainAlertUnreadCount,
    webhookAutoRefresh,
    webhookChainAlertOnly,
    latestWebhookChainAlertAt,
    webhookStatusFilter,
    setWebhookStatusFilter,
    setWebhookAutoRefresh,
    setWebhookChainAlertOnly,
    webhookAutoFocusOpsOnAlert,
    setWebhookAutoFocusOpsOnAlert,
    webhookAlertSoundEnabled,
    setWebhookAlertSoundEnabled,
    loadWebhookEvents,
    webhookLoading,
    acknowledgeWebhookChainAlerts,
    filteredWebhookEvents,
  } = props;

  return (
    <div className={`${visible ? "" : "hidden "}mb-5 rounded-3xl border p-4 ${theme.cardSoft}`}>
      <div className="mb-2 flex items-center justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-black">Webhook 전송 상태</span>
            {webhookChainAlertUnreadCount > 0 ? (
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-black text-white ${
                  webhookAutoRefresh && webhookChainAlertOnly ? "bg-red-600" : "bg-amber-600"
                }`}
                title={webhookAutoRefresh && webhookChainAlertOnly ? "자동 감시 중 신규 CHAIN ALERT" : "신규 CHAIN ALERT (확인 전)"}
              >
                +{webhookChainAlertUnreadCount} CHAIN
              </span>
            ) : null}
          </div>
          <div className={`text-xs ${theme.muted}`}>
            최근 관리자 이벤트 전송 결과 (성공/실패/비활성)
            {latestWebhookChainAlertAt ? ` · 최근 CHAIN ALERT: ${latestWebhookChainAlertAt}` : ""}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={webhookStatusFilter}
            onChange={(e) => setWebhookStatusFilter(e.target.value)}
            className={`rounded-xl border px-2 py-2 text-xs font-black outline-none ${theme.input}`}
          >
            <option value="all">전체</option>
            <option value="success">성공</option>
            <option value="failed">실패</option>
            <option value="disabled">비활성</option>
          </select>
          <label className={`flex items-center gap-1 rounded-xl border px-2 py-2 text-xs font-black ${theme.input}`}>
            <input
              type="checkbox"
              checked={webhookAutoRefresh}
              onChange={(e) => setWebhookAutoRefresh(e.target.checked)}
            />
            15초 자동
          </label>
          <label className={`relative flex items-center gap-1 rounded-xl border px-2 py-2 text-xs font-black ${theme.input}`}>
            <input
              type="checkbox"
              checked={webhookChainAlertOnly}
              onChange={(e) => setWebhookChainAlertOnly(e.target.checked)}
            />
            CHAIN ALERT만
            {webhookChainAlertUnreadCount > 0 && webhookChainAlertOnly ? (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-black leading-none text-white">
                {webhookChainAlertUnreadCount > 99 ? "99+" : webhookChainAlertUnreadCount}
              </span>
            ) : null}
          </label>
          <label className={`flex items-center gap-1 rounded-xl border px-2 py-2 text-xs font-black ${theme.input}`}>
            <input
              type="checkbox"
              checked={webhookAutoFocusOpsOnAlert}
              onChange={(e) => setWebhookAutoFocusOpsOnAlert(e.target.checked)}
            />
            경보시 ops 고정
          </label>
          <label className={`flex items-center gap-1 rounded-xl border px-2 py-2 text-xs font-black ${theme.input}`}>
            <input
              type="checkbox"
              checked={webhookAlertSoundEnabled}
              onChange={(e) => setWebhookAlertSoundEnabled(e.target.checked)}
            />
            소리 알림
          </label>
          <button
            onClick={() => loadWebhookEvents({ acknowledgeUnread: true })}
            className={`rounded-xl border px-3 py-2 text-xs font-black ${theme.input}`}
          >
            {webhookLoading ? "조회중..." : "새로고침"}
          </button>
          <button
            onClick={acknowledgeWebhookChainAlerts}
            className={`rounded-xl border px-3 py-2 text-xs font-black ${theme.input}`}
          >
            경보 확인처리
          </button>
        </div>
      </div>
      <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
        {filteredWebhookEvents.length ? (
          filteredWebhookEvents.map((event) => {
            const badgeClass =
              event.status === "success"
                ? "bg-emerald-600 text-white"
                : event.status === "failed"
                  ? "bg-red-600 text-white"
                  : "bg-amber-500 text-white";
            const isChainAlertEvent = String(event.event_type || "") === "market_catalog_audit_chain_changed";
            return (
              <div key={event.id} className={`flex items-center justify-between rounded-xl border p-2 text-xs ${theme.input}`}>
                <div>
                  <div className="flex items-center gap-1">
                    <div className="font-black">{event.event_type}</div>
                    {isChainAlertEvent ? (
                      <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-black text-white">CHAIN ALERT</span>
                    ) : null}
                  </div>
                  <div className={theme.muted}>
                    {event.occurred_at}
                    {event.status_code ? ` · HTTP ${event.status_code}` : ""}
                  </div>
                  {!!event.error_message && <div className="text-[11px] text-red-400">{event.error_message}</div>}
                </div>
                <span className={`rounded-full px-2 py-1 text-[11px] font-black ${badgeClass}`}>{event.status}</span>
              </div>
            );
          })
        ) : (
          <div className={`rounded-xl border p-2 text-xs ${theme.input}`}>조건에 맞는 웹훅 이벤트가 없습니다.</div>
        )}
      </div>
    </div>
  );
}
