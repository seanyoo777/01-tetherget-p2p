import fs from "fs";
import path from "path";

const appPath = path.join(process.cwd(), "src", "App.jsx");
let s = fs.readFileSync(appPath, "utf8");

const listedOld = `                    <div className="mb-1 text-[10px] font-black text-emerald-400">서버 이벤트</div>
                    {tradeOrderEventsLoadingId === row.id ? (
                      <div className={\`text-[10px] \${theme.muted}\`}>불러오는 중…</div>
                    ) : (tradeOrderEventsCache[row.id] || []).length ? (
                      <ul className="max-h-32 space-y-1 overflow-auto text-[10px]">
                        {(tradeOrderEventsCache[row.id] || []).map((ev) => (
                          <li key={ev.id} className={\`rounded border border-white/5 px-1.5 py-1.5 \${theme.card}\`}>
                            <div className="flex flex-wrap gap-1.5">
                              <span className="font-mono text-[9px] text-sky-400">{ev.created_at}</span>
                              <span className="font-black">{ev.action}</span>
                            </div>
                            <pre className={\`mt-0.5 max-h-12 overflow-auto whitespace-pre-wrap break-all font-mono text-[9px] \${theme.muted}\`}>{ev.detail_json}</pre>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className={\`text-[10px] \${theme.muted}\`}>이벤트가 없습니다.</div>
                    )}`;

const listedNew = `                    <div className="mb-2">
                      <P2pTradeFlowStepper theme={theme} steps={deriveTradeFlowView(row).steps} compact />
                    </div>
                    <P2pTradeTimeline
                      theme={theme}
                      row={row}
                      serverEvents={tradeOrderEventsCache[row.id]}
                      loading={tradeOrderEventsLoadingId === row.id}
                      onRefresh={() => refreshTradeTimeline(row.id)}
                    />`;

const myTradesStart = `        {authToken ? (
          <div className="mb-6 space-y-3">
            <div className={\`text-sm font-black \${theme.subtext}\`}>서버 P2P 주문`;

const demoHeader = `        <div className={\`mb-2 text-sm font-black \${theme.subtext}\`}>데모 목업 거래 (로컬)</div>`;
const demoBlockEnd = `        </div>
      </div>
    </section>`;

const myTradesNew = `        <P2pMyTradesEnhanced
          theme={theme}
          authToken={authToken}
          serverOrders={filteredServerOrders}
          serverLoading={serverLoading}
          formatNumber={number}
          formatMatchCountdown={formatP2pMatchCountdown}
          orderFlowActionId={orderFlowActionId}
          timelineOrderId={timelineOrderId}
          orderEventsCache={orderEventsCache}
          orderEventsLoadingId={orderEventsLoadingId}
          serverCancelId={serverCancelId}
          onCancelListing={cancelMyListing}
          onPaymentStart={paymentStartOrder}
          onMarkPaid={markBuyerPaid}
          onCompleteSeller={completeSellerOrder}
          onWithdrawMatch={withdrawMatched}
          onToggleTimeline={toggleOrderTimeline}
          onRefreshTimeline={refreshOrderTimeline}
          demoTradesSection={
            <>
              <div className={\`mb-2 text-sm font-black \${theme.subtext}\`}>데모 목업 거래 (로컬)</div>
              <div className="space-y-3">
                {filteredTrades.length ? filteredTrades.map((tr) => (
                  <div key={tr.id} className={\`flex items-center justify-between rounded-2xl p-4 \${theme.cardSoft}\`}>
                    <div>
                      <div className="font-black">{tr.type} {tr.amount} {tr.coin}</div>
                      <div className={\`mt-1 text-xs \${theme.muted}\`}>{tr.id} · {tr.time}</div>
                    </div>
                    <span className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-black text-white">{tr.status}</span>
                  </div>
                )) : (
                  <div className={\`rounded-2xl border p-4 text-sm \${theme.input}\`}>선택한 기간의 데모 거래 기록이 없습니다.</div>
                )}
              </div>
            </>
          }
        />`;

let patches = 0;
if (s.includes(listedOld)) {
  s = s.replace(listedOld, listedNew);
  patches++;
  console.log("listed timeline ok");
} else {
  console.warn("listed timeline block not found");
}

const startIdx = s.indexOf(myTradesStart);
const demoIdx = startIdx >= 0 ? s.indexOf(demoHeader, startIdx) : -1;
if (startIdx >= 0 && demoIdx > startIdx) {
  const demoEndIdx = s.indexOf(demoBlockEnd, demoIdx);
  if (demoEndIdx > demoIdx) {
    const before = s.slice(0, startIdx);
    const after = s.slice(demoEndIdx);
    s = before + myTradesNew + "\n" + after;
    patches++;
    console.log("my trades ok");
  } else {
    console.warn("demo block end not found");
  }
} else {
  console.warn("my trades block not found", startIdx, demoIdx);
}

fs.writeFileSync(appPath, s);
console.log("patches applied:", patches);
