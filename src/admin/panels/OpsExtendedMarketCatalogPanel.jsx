import React from "react";

/** `ops` tab — **확장형 마켓 카탈로그** card (inside `admin-tab-ops`, boundary in `App.jsx`). */
export function OpsExtendedMarketCatalogPanel(props) {
  const {
    theme,
    visible,
    loadMarketCatalog,
    marketCatalogLoading,
    resetMarketCatalogDraft,
    marketCatalogSaving,
    marketCatalogDiff,
    isSuperAdmin,
    openMarketSaveConfirm,
    marketAssetTypeFilter,
    setMarketAssetTypeFilter,
    addAssetRow,
    filteredMarketAssets,
    updateAssetRow,
    removeAssetRow,
    marketStatusFilter,
    setMarketStatusFilter,
    addMarketRow,
    filteredMarketCatalog,
    updateMarketRow,
    removeMarketRow,
    marketSaveConfirmOpen,
    setMarketSaveConfirmOpen,
    saveMarketCatalog,
  } = props;

  return (
    <div className={`${visible ? "" : "hidden "}mb-5 rounded-3xl border p-4 ${theme.cardSoft}`}>
      <div className="mb-2 flex items-center justify-between">
        <div>
          <div className="text-sm font-black">확장형 마켓 카탈로그 (코인/NFT)</div>
          <div className={`text-xs ${theme.muted}`}>현재는 결제 코인 중심으로 운영하고, NFT 등은 planned 상태로 확장할 수 있습니다.</div>
        </div>
        <div className="flex gap-2">
          <button onClick={loadMarketCatalog} className={`rounded-xl border px-3 py-2 text-xs font-black ${theme.input}`}>
            {marketCatalogLoading ? "조회중..." : "카탈로그 새로고침"}
          </button>
          <button
            onClick={resetMarketCatalogDraft}
            disabled={marketCatalogSaving || !marketCatalogDiff.hasChanges}
            className={`rounded-xl border px-3 py-2 text-xs font-black ${theme.input}`}
          >
            편집 원복
          </button>
          <button
            onClick={openMarketSaveConfirm}
            disabled={!isSuperAdmin || marketCatalogSaving}
            className={`rounded-xl border px-3 py-2 text-xs font-black ${isSuperAdmin ? theme.main : theme.input}`}
          >
            {marketCatalogSaving ? "저장중..." : "카탈로그 저장"}
          </button>
        </div>
      </div>
      <div className={`mb-2 text-[11px] ${theme.muted}`}>자산/마켓을 행 단위로 수정한 뒤 저장하세요. (코인 active, NFT planned 권장)</div>
      <div className={`mb-2 rounded-xl border px-2 py-1 text-[11px] ${theme.input}`}>
        변경 요약 ·
        assets +{marketCatalogDiff.addedAssets} / -{marketCatalogDiff.removedAssets} / ~{marketCatalogDiff.updatedAssets}
        {"  "}· markets +{marketCatalogDiff.addedMarkets} / -{marketCatalogDiff.removedMarkets} / ~{marketCatalogDiff.updatedMarkets}
        {!marketCatalogDiff.hasChanges && " (변경 없음)"}
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <div className={`rounded-xl border p-2 ${theme.input}`}>
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs font-black">Assets</div>
            <div className="flex items-center gap-1">
              <select
                value={marketAssetTypeFilter}
                onChange={(e) => setMarketAssetTypeFilter(e.target.value)}
                className={`rounded-lg border px-2 py-1 text-[11px] font-black ${theme.input}`}
              >
                <option value="all">all type</option>
                <option value="coin">coin</option>
                <option value="nft">nft</option>
                <option value="tokenized_asset">tokenized</option>
                <option value="point">point</option>
              </select>
              <button onClick={addAssetRow} className={`rounded-lg border px-2 py-1 text-[11px] font-black ${theme.input}`}>+ asset</button>
            </div>
          </div>
          <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
            {filteredMarketAssets.map(({ asset, index }) => (
              <div key={`asset-${index}`} className={`rounded-lg border p-2 text-[11px] ${theme.cardSoft}`}>
                <div className="grid gap-1 md:grid-cols-2">
                  <input value={asset.assetCode || ""} onChange={(e) => updateAssetRow(index, "assetCode", e.target.value.toUpperCase())} placeholder="assetCode" className={`rounded border px-2 py-1 ${theme.input}`} />
                  <input value={asset.displayName || ""} onChange={(e) => updateAssetRow(index, "displayName", e.target.value)} placeholder="displayName" className={`rounded border px-2 py-1 ${theme.input}`} />
                  <select value={asset.assetType || "coin"} onChange={(e) => updateAssetRow(index, "assetType", e.target.value)} className={`rounded border px-2 py-1 ${theme.input}`}>
                    <option value="coin">coin</option><option value="nft">nft</option><option value="tokenized_asset">tokenized_asset</option><option value="point">point</option>
                  </select>
                  <input value={asset.network || ""} onChange={(e) => updateAssetRow(index, "network", e.target.value)} placeholder="network" className={`rounded border px-2 py-1 ${theme.input}`} />
                </div>
                <textarea
                  value={asset.metadataText || "{}"}
                  onChange={(e) => updateAssetRow(index, "metadataText", e.target.value)}
                  placeholder='metadata JSON (e.g. {"precision":6})'
                  className={`mt-1 min-h-16 w-full rounded border px-2 py-1 font-mono text-[10px] ${theme.input}`}
                />
                <div className="mt-1 flex items-center gap-3">
                  <label className="flex items-center gap-1"><input type="checkbox" checked={Boolean(asset.settlementEnabled)} onChange={(e) => updateAssetRow(index, "settlementEnabled", e.target.checked)} />settlement</label>
                  <label className="flex items-center gap-1"><input type="checkbox" checked={asset.isActive !== false} onChange={(e) => updateAssetRow(index, "isActive", e.target.checked)} />active</label>
                  <button onClick={() => removeAssetRow(index)} className="rounded border px-2 py-1 text-[11px] font-black text-red-400">삭제</button>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className={`rounded-xl border p-2 ${theme.input}`}>
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs font-black">Markets</div>
            <div className="flex items-center gap-1">
              <select
                value={marketStatusFilter}
                onChange={(e) => setMarketStatusFilter(e.target.value)}
                className={`rounded-lg border px-2 py-1 text-[11px] font-black ${theme.input}`}
              >
                <option value="all">all status</option>
                <option value="active">active</option>
                <option value="planned">planned</option>
                <option value="disabled">disabled</option>
              </select>
              <button onClick={addMarketRow} className={`rounded-lg border px-2 py-1 text-[11px] font-black ${theme.input}`}>+ market</button>
            </div>
          </div>
          <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
            {filteredMarketCatalog.map(({ market, index }) => (
              <div key={`market-${index}`} className={`rounded-lg border p-2 text-[11px] ${theme.cardSoft}`}>
                <div className="grid gap-1 md:grid-cols-2">
                  <input value={market.marketKey || ""} onChange={(e) => updateMarketRow(index, "marketKey", e.target.value)} placeholder="marketKey" className={`rounded border px-2 py-1 ${theme.input}`} />
                  <select value={market.marketType || "p2p"} onChange={(e) => updateMarketRow(index, "marketType", e.target.value)} className={`rounded border px-2 py-1 ${theme.input}`}>
                    <option value="p2p">p2p</option><option value="mock">mock</option><option value="spot">spot</option>
                  </select>
                  <input value={market.offeredAssetCode || ""} onChange={(e) => updateMarketRow(index, "offeredAssetCode", e.target.value.toUpperCase())} placeholder="offeredAssetCode" className={`rounded border px-2 py-1 ${theme.input}`} />
                  <input value={market.requestedAssetCode || ""} onChange={(e) => updateMarketRow(index, "requestedAssetCode", e.target.value.toUpperCase())} placeholder="requestedAssetCode" className={`rounded border px-2 py-1 ${theme.input}`} />
                  <input value={market.settlementAssetCode || ""} onChange={(e) => updateMarketRow(index, "settlementAssetCode", e.target.value.toUpperCase())} placeholder="settlementAssetCode" className={`rounded border px-2 py-1 ${theme.input}`} />
                  <input value={market.escrowAdapter || ""} onChange={(e) => updateMarketRow(index, "escrowAdapter", e.target.value)} placeholder="escrowAdapter" className={`rounded border px-2 py-1 ${theme.input}`} />
                  <select value={market.status || "planned"} onChange={(e) => updateMarketRow(index, "status", e.target.value)} className={`rounded border px-2 py-1 ${theme.input}`}>
                    <option value="active">active</option><option value="planned">planned</option><option value="disabled">disabled</option>
                  </select>
                </div>
                <textarea
                  value={market.metadataText || "{}"}
                  onChange={(e) => updateMarketRow(index, "metadataText", e.target.value)}
                  placeholder='metadata JSON (e.g. {"label":"BTC/USDT"})'
                  className={`mt-1 min-h-16 w-full rounded border px-2 py-1 font-mono text-[10px] ${theme.input}`}
                />
                <div className="mt-1">
                  <button onClick={() => removeMarketRow(index)} className="rounded border px-2 py-1 text-[11px] font-black text-red-400">삭제</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {marketSaveConfirmOpen && (
        <div className={`mt-2 rounded-xl border p-2 text-xs ${theme.input}`}>
          <div className="font-black">카탈로그 저장 확인</div>
          <div className="mt-1">
            assets +{marketCatalogDiff.addedAssets} / -{marketCatalogDiff.removedAssets} / ~{marketCatalogDiff.updatedAssets}
            {" · "}
            markets +{marketCatalogDiff.addedMarkets} / -{marketCatalogDiff.removedMarkets} / ~{marketCatalogDiff.updatedMarkets}
          </div>
          <div className="mt-2 flex gap-2">
            <button
              onClick={async () => {
                setMarketSaveConfirmOpen(false);
                await saveMarketCatalog();
              }}
              className={`rounded-lg px-3 py-1.5 font-black ${theme.main}`}
            >
              저장 실행
            </button>
            <button onClick={() => setMarketSaveConfirmOpen(false)} className={`rounded-lg border px-3 py-1.5 font-black ${theme.input}`}>
              취소
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
