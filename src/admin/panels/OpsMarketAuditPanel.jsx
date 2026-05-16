import React from "react";

/** `ops` tab — **마켓 카탈로그 변경 이력** card (inside `admin-tab-ops`, boundary in `App.jsx`). */
export function OpsMarketAuditPanel(props) {
  const {
    theme,
    visible,
    marketAuditScope,
    marketAuditIntegrity,
    recentMarketAuditChainHashes,
    marketAuditChainDrift,
    marketAuditChainStatus,
    loadMarketCatalogAudit,
    exportMarketCatalogAuditCsv,
    verifyMarketCatalogAuditIntegrity,
    marketAuditIntegrityLoading,
    loadRecentReportHashes,
    marketAuditActorFilter,
    setMarketAuditActorFilter,
    authUsers,
    marketAuditQuery,
    setMarketAuditQuery,
    marketAuditFromDate,
    setMarketAuditFromDate,
    marketAuditToDate,
    setMarketAuditToDate,
    applyMarketAuditQuickRange,
    resetMarketAuditFilters,
    marketCatalogLogs,
    expandedMarketAuditIds,
    toggleMarketAuditExpanded,
    marketAuditHasMore,
    marketAuditLoadingMore,
    marketAuditChangeAlerts,
  } = props;

  return (
        <div className={`${visible ? "" : "hidden "}mb-5 rounded-3xl border p-4 ${theme.cardSoft}`}>
          <div className="mb-2 flex items-center justify-between">
            <div>
              <div className="text-sm font-black">마켓 카탈로그 변경 이력</div>
              <div className={`text-xs ${theme.muted}`}>최근 변경 내역(작업자/시각/대상)을 추적합니다.</div>
              <div className={`mt-1 text-[11px] ${theme.muted}`}>
                scope: {marketAuditScope} · integrity rows: {marketAuditIntegrity.total || 0}
                {marketAuditIntegrity.rootHash ? ` · hash: ${marketAuditIntegrity.rootHash.slice(0, 12)}...` : ""}
              </div>
              <div className={`mt-1 text-[11px] ${theme.muted}`}>
                chain proof: {recentMarketAuditChainHashes.length ? `${recentMarketAuditChainHashes[0].created_at} / ${String(recentMarketAuditChainHashes[0].sha256_hash || "").slice(0, 12)}...` : "아직 없음"}
              </div>
              <div className={`mt-1 text-[11px] ${theme.muted}`}>
                chain compare: {!marketAuditChainDrift.ready
                  ? "비교용 기록 부족"
                  : marketAuditChainDrift.changed
                    ? `변경 감지 (${marketAuditChainDrift.previousAt} -> ${marketAuditChainDrift.latestAt})`
                    : "변경 없음(최근 2회 동일)"}
              </div>
              <div className="mt-1">
                <span className={`rounded-full px-2 py-1 text-[11px] font-black text-white ${
                  marketAuditChainStatus === "changed"
                    ? "bg-red-600"
                    : marketAuditChainStatus === "stable"
                      ? "bg-emerald-600"
                      : "bg-slate-600"
                }`}>
                  {marketAuditChainStatus === "changed" ? "CHAIN ALERT" : marketAuditChainStatus === "stable" ? "CHAIN STABLE" : "CHAIN PENDING"}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={loadMarketCatalogAudit} className={`rounded-xl border px-3 py-2 text-xs font-black ${theme.input}`}>
                이력 새로고침
              </button>
              <button onClick={exportMarketCatalogAuditCsv} className={`rounded-xl border px-3 py-2 text-xs font-black ${theme.input}`}>
                CSV 내보내기
              </button>
              <button onClick={verifyMarketCatalogAuditIntegrity} disabled={marketAuditIntegrityLoading} className={`rounded-xl border px-3 py-2 text-xs font-black ${theme.input}`}>
                {marketAuditIntegrityLoading ? "검증중..." : "무결성 검증"}
              </button>
              <button onClick={() => loadRecentReportHashes("market_catalog_audit_chain")} className={`rounded-xl border px-3 py-2 text-xs font-black ${theme.input}`}>
                체인기록 새로고침
              </button>
            </div>
          </div>
          <div className="mb-2 grid gap-2 md:grid-cols-2">
            <select
              value={marketAuditActorFilter}
              onChange={(e) => setMarketAuditActorFilter(e.target.value)}
              className={`rounded-xl border px-3 py-2 text-xs font-black outline-none ${theme.input}`}
            >
              <option value="">전체 작업자</option>
              {(authUsers || []).map((u) => (
                <option key={`audit-actor-${u.id}`} value={u.id}>
                  {u.nickname || u.email || u.id}
                </option>
              ))}
            </select>
            <input
              value={marketAuditQuery}
              onChange={(e) => setMarketAuditQuery(e.target.value)}
              placeholder="키워드 검색 (assetCode/marketKey/작업자)"
              className={`rounded-xl border px-3 py-2 text-xs font-bold outline-none ${theme.input}`}
            />
          </div>
          <div className="mb-2 grid gap-2 md:grid-cols-2">
            <input
              type="date"
              value={marketAuditFromDate}
              onChange={(e) => setMarketAuditFromDate(e.target.value)}
              className={`rounded-xl border px-3 py-2 text-xs font-bold outline-none ${theme.input}`}
            />
            <input
              type="date"
              value={marketAuditToDate}
              onChange={(e) => setMarketAuditToDate(e.target.value)}
              className={`rounded-xl border px-3 py-2 text-xs font-bold outline-none ${theme.input}`}
            />
          </div>
          <div className="mb-2 flex flex-wrap items-center gap-1">
            <button onClick={() => applyMarketAuditQuickRange(1)} className={`rounded-xl border px-2 py-1 text-[11px] font-black ${theme.input}`}>오늘</button>
            <button onClick={() => applyMarketAuditQuickRange(7)} className={`rounded-xl border px-2 py-1 text-[11px] font-black ${theme.input}`}>7일</button>
            <button onClick={() => applyMarketAuditQuickRange(30)} className={`rounded-xl border px-2 py-1 text-[11px] font-black ${theme.input}`}>30일</button>
            <button onClick={resetMarketAuditFilters} className={`rounded-xl border px-2 py-1 text-[11px] font-black ${theme.input}`}>필터 초기화</button>
          </div>
          <div className="max-h-36 space-y-1 overflow-y-auto pr-1">
            {marketCatalogLogs.length ? (
              marketCatalogLogs.map((log) => (
                <div key={log.id} className={`rounded-xl border p-2 text-xs ${theme.input}`}>
                  <div className="font-black">#{log.id} · {log.createdAt}</div>
                  <div className={theme.muted}>
                    actor: {log.actorName || log.actorUserId} · assets {log.assetsCount} · markets {log.marketsCount}
                  </div>
                  <div className="mt-1 text-[11px]">
                    a(+{log.summary?.assetDiff?.added?.length || 0}/-{log.summary?.assetDiff?.removed?.length || 0}/~{log.summary?.assetDiff?.updated?.length || 0})
                    {" · "}
                    m(+{log.summary?.marketDiff?.added?.length || 0}/-{log.summary?.marketDiff?.removed?.length || 0}/~{log.summary?.marketDiff?.updated?.length || 0})
                  </div>
                  <div className="mt-1 text-[11px]">
                    +asset: {Array.isArray(log.summary?.assetDiff?.added) && log.summary.assetDiff.added.length ? log.summary.assetDiff.added.slice(0, 5).join(", ") : "-"}
                    {" · "}
                    -asset: {Array.isArray(log.summary?.assetDiff?.removed) && log.summary.assetDiff.removed.length ? log.summary.assetDiff.removed.slice(0, 5).join(", ") : "-"}
                    {" · "}
                    ~asset: {Array.isArray(log.summary?.assetDiff?.updated) && log.summary.assetDiff.updated.length ? log.summary.assetDiff.updated.slice(0, 5).join(", ") : "-"}
                  </div>
                  <div className="mt-1 text-[11px]">
                    +market: {Array.isArray(log.summary?.marketDiff?.added) && log.summary.marketDiff.added.length ? log.summary.marketDiff.added.slice(0, 5).join(", ") : "-"}
                    {" · "}
                    -market: {Array.isArray(log.summary?.marketDiff?.removed) && log.summary.marketDiff.removed.length ? log.summary.marketDiff.removed.slice(0, 5).join(", ") : "-"}
                    {" · "}
                    ~market: {Array.isArray(log.summary?.marketDiff?.updated) && log.summary.marketDiff.updated.length ? log.summary.marketDiff.updated.slice(0, 5).join(", ") : "-"}
                  </div>
                  <div className="mt-1 text-[11px]">
                    {Array.isArray(log.summary?.assetCodes) ? `assets: ${log.summary.assetCodes.slice(0, 6).join(", ")}` : ""}
                    {Array.isArray(log.summary?.marketKeys) ? ` · markets: ${log.summary.marketKeys.slice(0, 6).join(", ")}` : ""}
                  </div>
                  <div className="mt-1">
                    <button
                      onClick={() => toggleMarketAuditExpanded(log.id)}
                      className={`rounded border px-2 py-1 text-[11px] font-black ${theme.input}`}
                    >
                      {expandedMarketAuditIds[log.id] ? "상세 닫기" : "상세 보기"}
                    </button>
                  </div>
                  {expandedMarketAuditIds[log.id] ? (
                    <div className={`mt-2 rounded-lg border p-2 text-[11px] ${theme.cardSoft}`}>
                      <div>
                        asset added: {Array.isArray(log.summary?.assetDiff?.added) && log.summary.assetDiff.added.length ? log.summary.assetDiff.added.join(", ") : "-"}
                      </div>
                      <div>
                        asset removed: {Array.isArray(log.summary?.assetDiff?.removed) && log.summary.assetDiff.removed.length ? log.summary.assetDiff.removed.join(", ") : "-"}
                      </div>
                      <div>
                        asset updated: {Array.isArray(log.summary?.assetDiff?.updated) && log.summary.assetDiff.updated.length ? log.summary.assetDiff.updated.join(", ") : "-"}
                      </div>
                      <div className="mt-1">
                        market added: {Array.isArray(log.summary?.marketDiff?.added) && log.summary.marketDiff.added.length ? log.summary.marketDiff.added.join(", ") : "-"}
                      </div>
                      <div>
                        market removed: {Array.isArray(log.summary?.marketDiff?.removed) && log.summary.marketDiff.removed.length ? log.summary.marketDiff.removed.join(", ") : "-"}
                      </div>
                      <div>
                        market updated: {Array.isArray(log.summary?.marketDiff?.updated) && log.summary.marketDiff.updated.length ? log.summary.marketDiff.updated.join(", ") : "-"}
                      </div>
                    </div>
                  ) : null}
                </div>
              ))
            ) : (
              <div className={`rounded-xl border p-2 text-xs ${theme.input}`}>카탈로그 변경 이력이 없습니다.</div>
            )}
          </div>
          <div className="mt-2 flex justify-end">
            <button
              onClick={() => loadMarketCatalogAudit({ append: true })}
              disabled={!marketAuditHasMore || marketAuditLoadingMore}
              className={`rounded-xl border px-3 py-2 text-xs font-black ${theme.input} ${!marketAuditHasMore ? "opacity-50" : ""}`}
            >
              {marketAuditLoadingMore ? "불러오는 중..." : marketAuditHasMore ? "더보기" : "끝"}
            </button>
          </div>
          <div className={`mt-2 rounded-xl border p-2 ${theme.cardSoft}`}>
            <div className="mb-1 text-xs font-black">감사 알림 로그</div>
            <div className="max-h-24 space-y-1 overflow-y-auto pr-1">
              {marketAuditChangeAlerts.length ? marketAuditChangeAlerts.map((alert) => (
                <div key={alert.id} className={`rounded border p-1 text-[11px] ${theme.input}`}>
                  <div className="font-black">{alert.at}</div>
                  <div>{alert.message}</div>
                  <div className="break-all text-[10px]">latest: {String(alert.latestHash || "").slice(0, 24)}... · prev: {String(alert.previousHash || "").slice(0, 24)}...</div>
                </div>
              )) : (
                <div className={`rounded border p-1 text-[11px] ${theme.input}`}>변경 감지 알림이 없습니다.</div>
              )}
            </div>
          </div>
        </div>
  );
}
