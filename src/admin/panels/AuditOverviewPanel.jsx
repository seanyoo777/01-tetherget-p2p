import React from "react";

/** `audit` tab — first block (**플랫폼 감사 로그** table; inside `admin-tab-audit` shared card root in `App.jsx`). */
export function AuditOverviewPanel(props) {
  const {
    theme,
    loadPlatformAuditLogs,
    loadAdminP2pOrders,
    platformAuditLoading,
    adminP2pLoading,
    platformAuditLogs,
  } = props;

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-black">플랫폼 감사 로그</div>
          <div className={`text-xs ${theme.muted}`}>로그인·가입·지갑 로그인 등 서버에 기록된 공통 감사 이벤트입니다.</div>
        </div>
        <button
          type="button"
          onClick={() => {
            loadPlatformAuditLogs();
            loadAdminP2pOrders();
          }}
          disabled={platformAuditLoading || adminP2pLoading}
          className={`rounded-xl border px-3 py-2 text-xs font-black ${platformAuditLoading || adminP2pLoading ? "opacity-60" : theme.input}`}
        >
          {platformAuditLoading || adminP2pLoading ? "불러오는 중…" : "새로고침"}
        </button>
      </div>
      <div className="max-h-[min(70vh,560px)] overflow-auto rounded-2xl border border-white/10">
        <table className="min-w-full text-left text-[11px]">
          <thead className={`sticky top-0 z-10 ${theme.card}`}>
            <tr className={`border-b ${theme.muted}`}>
              <th className="px-2 py-2 pr-2">ID</th>
              <th className="py-2 pr-2">시각</th>
              <th className="py-2 pr-2">이벤트</th>
              <th className="py-2 pr-2">플랫폼</th>
              <th className="py-2 pr-2">user_id</th>
              <th className="py-2 pr-2">IP</th>
              <th className="py-2 pr-2">UA</th>
              <th className="py-2 pr-2">payload</th>
            </tr>
          </thead>
          <tbody>
            {(platformAuditLogs || []).map((row) => (
              <tr key={row.id} className={`border-b border-white/5 ${theme.subtext}`}>
                <td className="px-2 py-1.5 pr-2 font-mono">{row.id}</td>
                <td className="py-1.5 pr-2 whitespace-nowrap">{row.created_at}</td>
                <td className="py-1.5 pr-2">{row.event_type}</td>
                <td className="py-1.5 pr-2 font-mono text-[10px]">{row.platform_code || "—"}</td>
                <td className="py-1.5 pr-2">{row.user_id ?? "—"}</td>
                <td className="py-1.5 pr-2 font-mono text-[10px]">{row.ip || "—"}</td>
                <td className="py-1.5 pr-2 max-w-[120px] truncate text-[10px]" title={row.user_agent}>{row.user_agent || "—"}</td>
                <td className="py-1.5 pr-2 max-w-[min(40vw,220px)] truncate font-mono text-[10px]" title={row.payload_json}>{row.payload_json}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!platformAuditLoading && (!platformAuditLogs || platformAuditLogs.length === 0) ? (
        <div className={`mt-3 text-xs ${theme.muted}`}>기록이 없습니다. 로그인 후 이 탭을 다시 열어 보세요.</div>
      ) : null}
    </>
  );
}
