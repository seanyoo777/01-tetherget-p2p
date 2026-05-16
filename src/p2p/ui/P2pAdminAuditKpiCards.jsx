import React from "react";
import { P2P_TEST_IDS } from "../p2pTestIds.js";
import { formatP2pCacheAgeLabel } from "../p2pDevDiagnostics.js";
import { isP2pTradeDark } from "./p2pTradeShell.js";

export function P2pAdminAuditKpiCards({ theme, kpi }) {
  const isDark = isP2pTradeDark(theme);
  if (!kpi) return null;

  const cacheAgeLabel = formatP2pCacheAgeLabel(kpi.cacheAgeMs);

  return (
    <div
      data-testid={P2P_TEST_IDS.adminAuditKpi}
      className={`mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4 ${isDark ? "" : ""}`}
    >
      <KpiCard kpiKey="tradeCount" theme={theme} label="거래" value={`${kpi.tradeCount}건`} sub={kpi.cacheSource} />
      <KpiCard
        kpiKey="delayed"
        theme={theme}
        label="지연 릴리스"
        value={kpi.delayedReleaseCount}
        sub={`${kpi.delayedRatio}%`}
        accent="sky"
      />
      <KpiCard
        kpiKey="disputeRatio"
        theme={theme}
        label="분쟁 비율"
        value={`${kpi.disputeRatio}%`}
        sub={`${kpi.ordersWithDisputeFlag}건`}
        accent="rose"
      />
      <KpiCard
        kpiKey="highRisk"
        theme={theme}
        label="고위험"
        value={kpi.highRiskCount}
        sub={`분쟁 이벤트 ${kpi.disputeCount}`}
        accent="amber"
      />
      <KpiCard kpiKey="completed" theme={theme} label="완료 주문" value={kpi.completedCount} sub="completed/released" accent="emerald" />
      <KpiCard
        kpiKey="disputedOrders"
        theme={theme}
        label="분쟁 주문"
        value={kpi.disputedOrdersCount}
        sub="dispute flag"
        accent="rose"
      />
      <KpiCard
        kpiKey="avgDelay"
        theme={theme}
        label="평균 mock 릴리스 지연"
        value={`${kpi.avgMockReleaseDelayMin}m`}
        sub="delayed rows only"
        accent="sky"
      />
      <KpiCard kpiKey="cacheAge" theme={theme} label="캐시 경과" value={cacheAgeLabel} sub="mock age" accent="slate" />
    </div>
  );
}

function KpiCard({ theme, label, value, sub, accent, kpiKey }) {
  const border =
    accent === "rose"
      ? "border-rose-500/30"
      : accent === "amber"
        ? "border-amber-500/30"
        : accent === "sky"
          ? "border-sky-500/30"
          : accent === "emerald"
            ? "border-emerald-500/30"
            : "border-white/10";
  return (
    <div
      data-testid={P2P_TEST_IDS.adminAuditKpiCard}
      data-kpi-key={kpiKey}
      className={`rounded-xl border p-2.5 ${theme.cardSoft} ${border}`}
    >
      <div className={`text-[9px] font-bold uppercase ${theme.muted}`}>{label}</div>
      <div className="mt-1 text-base font-black tabular-nums">{value}</div>
      {sub ? <div className={`mt-0.5 text-[8px] font-mono ${theme.muted}`}>{sub}</div> : null}
    </div>
  );
}
