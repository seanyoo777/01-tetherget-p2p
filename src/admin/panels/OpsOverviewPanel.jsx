import React from "react";

/** `ops` 탭 — **본사 운영 설정** 첫 카드 (`admin-tab-ops` 경계 **안**, `App.jsx`에 경계 유지). */
export function OpsOverviewPanel(props) {
  const {
    theme,
    visible,
    envFallbackSla,
    loadPlatformSettings,
    platformOpsLoading,
    platformOpsSaving,
    p2pMatchSlaInput,
    setP2pMatchSlaInput,
    priceFeedProviderSelect,
    setPriceFeedProviderSelect,
    priceFeedBuiltinIds,
    savePlatformSettings,
    p2pMatchSlaUpdatedAt,
    p2pMatchSlaUpdatedBy,
    priceFeedEffective,
    priceFeedEnvOnly,
    priceFeedUpdatedAt,
    priceFeedUpdatedBy,
  } = props;

  return (
    <div className={`${visible ? "" : "hidden "}mb-5 rounded-3xl border p-4 ${theme.cardSoft}`}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-black">본사 운영 설정</div>
          <div className={`text-xs ${theme.muted}`}>
            DB에 저장되며 재시작 후에도 유지됩니다. P2P 송금 마감: 환경변수 미설정 시 폴백 {envFallbackSla}분. 시세 출처를 비우면{" "}
            <span className="font-mono">PRICE_FEED_PROVIDER</span> 등 환경변수 규칙을 따릅니다.
          </div>
        </div>
        <button
          type="button"
          onClick={() => loadPlatformSettings()}
          disabled={platformOpsLoading}
          className={`rounded-xl border px-3 py-2 text-xs font-black ${platformOpsLoading ? "opacity-60" : theme.input}`}
        >
          {platformOpsLoading ? "불러오는 중…" : "새로고침"}
        </button>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className={`grid gap-1 ${theme.subtext}`}>
          <span className="text-[11px] font-black">P2P 매칭 후 송금 마감(분)</span>
          <input
            type="number"
            min={5}
            max={180}
            value={p2pMatchSlaInput}
            onChange={(e) => setP2pMatchSlaInput(e.target.value)}
            className={`w-28 rounded-xl border px-3 py-2 text-xs font-bold outline-none ${theme.input}`}
          />
        </label>
        <label className={`grid min-w-[220px] gap-1 ${theme.subtext}`}>
          <span className="text-[11px] font-black">참고 시세 출처 (앱 표시용)</span>
          <select
            value={priceFeedProviderSelect}
            onChange={(e) => setPriceFeedProviderSelect(e.target.value)}
            className={`rounded-xl border px-3 py-2 text-xs font-bold outline-none ${theme.input}`}
          >
            <option value="">(비움) 환경변수·자동 규칙</option>
            {(priceFeedBuiltinIds.length ? priceFeedBuiltinIds : ["coingecko", "coinmarketcap", "static", "upbit"]).map((id) => (
              <option key={id} value={id}>
                {id === "coingecko"
                  ? "CoinGecko (집계)"
                  : id === "coinmarketcap"
                    ? "CoinMarketCap (집계, API 키)"
                    : id === "static"
                      ? "내장 고정값"
                      : id === "upbit"
                        ? "업비트 공개 티커"
                        : id}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => savePlatformSettings()}
          disabled={platformOpsSaving || platformOpsLoading}
          className={`rounded-xl border px-4 py-2 text-xs font-black ${theme.main}`}
        >
          {platformOpsSaving ? "저장 중…" : "저장"}
        </button>
      </div>
      <div className={`mt-2 space-y-1 text-[11px] ${theme.muted}`}>
        <div>
          P2P 적용: {p2pMatchSlaInput}분 · 마지막 수정: {p2pMatchSlaUpdatedAt || "-"}
          {p2pMatchSlaUpdatedBy != null ? ` · by user #${p2pMatchSlaUpdatedBy}` : ""}
        </div>
        <div>
          시세 DB 지정: {priceFeedProviderSelect ? <span className="font-mono text-sky-400">{priceFeedProviderSelect}</span> : "— (환경변수 규칙)"}{" "}
          · 적용 출처 id: <span className="font-mono text-emerald-400">{priceFeedEffective || "—"}</span>
          {" "}
          <span className="opacity-80">(CMC는 키 없으면 내부적으로 coingecko 로 폴백)</span>
          {priceFeedEnvOnly ? (
            <>
              {" "}
              · 환경만 보면: <span className="font-mono">{priceFeedEnvOnly}</span>
            </>
          ) : null}
          {" · "}
          마지막 수정: {priceFeedUpdatedAt || "-"}
          {priceFeedUpdatedBy != null ? ` · by user #${priceFeedUpdatedBy}` : ""}
        </div>
      </div>
    </div>
  );
}
