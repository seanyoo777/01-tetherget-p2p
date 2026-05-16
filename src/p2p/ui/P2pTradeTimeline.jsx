import React, { useMemo, useState } from "react";
import { buildTradeTimelineEvents } from "../../mock/p2pTradeFlowMock.js";
import { severityTone } from "../p2pTimelineEvents.js";
import { P2P_TEST_IDS } from "../p2pTestIds.js";
import { isP2pTradeDark } from "./p2pTradeShell.js";

const SOURCE_LABEL = { system: "SYS", user: "USER", admin: "ADM" };

export function P2pTradeTimeline({ theme, row, serverEvents, loading, onRefresh, compact = false }) {
  const isDark = isP2pTradeDark(theme);
  const [collapsed, setCollapsed] = useState(false);
  const events = useMemo(() => buildTradeTimelineEvents(row, serverEvents), [row, serverEvents]);

  return (
    <div
      data-testid={P2P_TEST_IDS.timeline}
      className={`rounded-xl border ${compact ? "p-2" : "p-3"} ${
        isDark ? "border-white/10 bg-black/20" : "border-stone-200 bg-stone-50"
      }`}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="text-left text-[11px] font-black text-emerald-500"
        >
          {collapsed ? "▶" : "▼"} 거래 타임라인 {compact ? "" : `(${events.length})`}
        </button>
        <div className="flex gap-1">
          {onRefresh ? (
            <button
              type="button"
              disabled={loading}
              onClick={onRefresh}
              className={`rounded-lg border px-2 py-1 text-[10px] font-black ${theme.input}`}
            >
              {loading ? "…" : "새로고침"}
            </button>
          ) : null}
        </div>
      </div>
      {!collapsed && (
        <>
          {loading ? (
            <p className={`text-[10px] ${theme.muted}`}>불러오는 중…</p>
          ) : events.length ? (
            <ol className={`relative space-y-0 overflow-auto pl-3 ${compact ? "max-h-36" : "max-h-52"}`}>
              {events.map((ev, i) => {
                const sev = severityTone(ev.severity);
                return (
                  <li
                    key={ev.id || `${ev.action}-${i}`}
                    className={`relative border-l-2 pb-2 pl-3 last:pb-0 ${
                      sev === "rose"
                        ? "border-rose-500/50"
                        : sev === "amber"
                          ? "border-amber-500/50"
                          : "border-emerald-500/40"
                    }`}
                  >
                    <span
                      className={`absolute -left-[5px] top-1 h-2 w-2 rounded-full ${
                        sev === "rose" ? "bg-rose-500" : sev === "amber" ? "bg-amber-500" : "bg-emerald-500"
                      }`}
                      aria-hidden
                    />
                    <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                      <span className="font-mono text-[9px] text-sky-400">{ev.created_at}</span>
                      <span className={`rounded px-1 text-[8px] font-black ${isDark ? "bg-white/10" : "bg-stone-200"}`}>
                        {SOURCE_LABEL[ev.source] || ev.source}
                      </span>
                      <span className={`${compact ? "text-[9px]" : "text-[10px]"} font-black`}>{ev.action}</span>
                      {ev._mock ? (
                        <span className="rounded bg-amber-600/80 px-1 text-[8px] font-black text-white">MOCK</span>
                      ) : null}
                    </div>
                    <div className={`mt-0.5 flex flex-wrap gap-2 text-[8px] ${theme.muted}`}>
                      <span>actor: {ev.actor}</span>
                      <span>sev: {ev.severity}</span>
                    </div>
                    {ev.detail_json ? (
                      <pre
                        className={`mt-0.5 max-h-10 overflow-auto whitespace-pre-wrap break-all font-mono text-[8px] ${theme.muted}`}
                      >
                        {ev.detail_json}
                      </pre>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className={`text-[10px] ${theme.muted}`}>이벤트가 없습니다.</p>
          )}
        </>
      )}
    </div>
  );
}
