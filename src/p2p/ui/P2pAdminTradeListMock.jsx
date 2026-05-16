import React from "react";
import { getMockAdminTradeAudit } from "../../mock/p2pTradeFlowMock.js";
import { getP2pAdminAuditRows, computeAdminAuditKpi } from "../p2pAdminAuditSurface.js";
import { pickAdminRowDisplayStatus, pickAdminRowEscrowLifecycle } from "../p2pUteFieldAlign.js";
import { P2P_TEST_IDS } from "../p2pTestIds.js";
import { P2pAdminAuditKpiCards } from "./P2pAdminAuditKpiCards.jsx";
import { P2pDevDiagnosticsPanel } from "./P2pDevDiagnosticsPanel.jsx";
import { P2pEscrowLifecycleLegend } from "./P2pEscrowLifecycleLegend.jsx";
import { isP2pTradeDark } from "./p2pTradeShell.js";

export function P2pAdminTradeListMock({ theme, surfaceRevision = 0, showDevDiagnostics, diagnosticsRevision = 0 }) {
  void surfaceRevision;
  const isDark = isP2pTradeDark(theme);
  const rows = getP2pAdminAuditRows();
  const kpi = computeAdminAuditKpi(rows);

  return (
    <div
      data-testid={P2P_TEST_IDS.adminAudit}
      className={`mt-4 rounded-2xl border p-4 ${isDark ? "border-white/10 bg-black/20" : "border-stone-200 bg-stone-50"}`}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-black">거래 목록 · 감사 (mock)</div>
          <p className={`text-xs ${theme.muted}`}>
            UTE surface 캐시 연동 · {kpi.cacheSource} · polling 없음
          </p>
        </div>
        <span className={`rounded-full px-2 py-1 text-[10px] font-black ${theme.cardSoft}`}>{kpi.tradeCount}건</span>
      </div>
      <P2pDevDiagnosticsPanel
        theme={theme}
        showDevDiagnostics={showDevDiagnostics}
        diagnosticsRevision={diagnosticsRevision}
      />
      <P2pEscrowLifecycleLegend theme={theme} />
      <P2pAdminAuditKpiCards theme={theme} kpi={kpi} />
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table data-testid={P2P_TEST_IDS.adminAuditTable} className="min-w-full text-left text-[11px]">
          <thead className={theme.card}>
            <tr className={`border-b ${theme.muted}`}>
              <th className="px-2 py-2">주문</th>
              <th className="py-2 pr-2">db_status</th>
              <th className="py-2 pr-2">escrow_lifecycle</th>
              <th className="py-2 pr-2">위험</th>
              <th className="py-2 pr-2">배지</th>
              <th className="py-2 pr-2">수량</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const audit = getMockAdminTradeAudit(row);
              return (
                <tr
                  key={row.id}
                  data-testid={P2P_TEST_IDS.adminAuditRow}
                  className={`border-b border-white/5 ${theme.subtext}`}
                >
                  <td className="px-2 py-1.5 font-mono text-[10px]">{row.id}</td>
                  <td className="py-1.5 pr-2 font-mono text-[9px]">{pickAdminRowDisplayStatus(row)}</td>
                  <td className="py-1.5 pr-2">
                    <EscrowPill escrow={pickAdminRowEscrowLifecycle(row)} />
                  </td>
                  <td className="py-1.5 pr-2 font-mono tabular-nums">{audit.riskScore}</td>
                  <td className="py-1.5 pr-2">
                    <div className="flex flex-wrap gap-1">
                      {audit.highRisk ? <Badge label="HIGH" tone="rose" /> : null}
                      {audit.delayedRelease ? <Badge label="DELAY" tone="amber" /> : null}
                      {audit.disputeCount > 0 ? (
                        <Badge label={`DSP ${audit.disputeCount}`} tone="violet" />
                      ) : null}
                    </div>
                  </td>
                  <td className="py-1.5 pr-2 whitespace-nowrap">
                    {row.amount} {row.coin}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Badge({ label, tone }) {
  const cls =
    tone === "rose"
      ? "bg-rose-600 text-white"
      : tone === "amber"
        ? "bg-amber-600 text-white"
        : "bg-violet-600 text-white";
  return <span className={`rounded px-1.5 py-0.5 text-[8px] font-black ${cls}`}>{label}</span>;
}

function EscrowPill({ escrow }) {
  const cls =
    escrow === "disputed"
      ? "bg-rose-500/30 text-rose-200"
      : escrow === "waiting_release" || escrow === "release_pending"
        ? "bg-sky-500/30 text-sky-200"
        : escrow === "refunded"
          ? "bg-slate-500/30 text-slate-200"
          : "bg-emerald-500/20 text-emerald-200";
  return <span className={`rounded px-1.5 py-0.5 font-mono text-[9px] font-bold ${cls}`}>{escrow}</span>;
}
