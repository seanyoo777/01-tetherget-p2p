import fs from "fs";
const p = "src/App.jsx";
const text = fs.readFileSync(p, "utf8");
const startMarker = "        {authToken ? (\n          <motionmotiondiv className=\"mb-6 space-y-3\">";
const start = text.indexOf("        {authToken ? (\n          <motionmotiondiv className=\"mb-6 space-y-3\">");
// fix - actual start
const start2 = text.indexOf("        {authToken ? (\n          <div className=\"mb-6 space-y-3\">");
const endMarker = "        <div className={`mb-2 text-sm font-black ${theme.subtext}`}>데모 목업 거래 (로컬)</div>";
const end = text.indexOf(endMarker);
if (start2 < 0 || end < 0) {
  console.error("markers not found", start2, end);
  process.exit(1);
}
const replacement = `        <P2pMyTradesEnhanced
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
        `;
const after = text.slice(end);
const newText = text.slice(0, start2) + replacement + after;
fs.writeFileSync(p, newText);
console.log("patched MyTradesOnly");
