import React from "react";
import { P2P_ESCROW_LEGEND_ENTRIES } from "../p2pEscrowLifecycleLegend.js";
import { P2P_TEST_IDS } from "../p2pTestIds.js";
import { isP2pTradeDark } from "./p2pTradeShell.js";

const TONE = {
  sky: { dark: "border-sky-500/40 bg-sky-500/10 text-sky-200", light: "border-sky-200 bg-sky-50 text-sky-900" },
  emerald: { dark: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200", light: "border-emerald-200 bg-emerald-50 text-emerald-900" },
  slate: { dark: "border-white/15 bg-white/5 text-slate-300", light: "border-stone-200 bg-stone-100 text-stone-700" },
  rose: { dark: "border-rose-500/40 bg-rose-500/10 text-rose-200", light: "border-rose-200 bg-rose-50 text-rose-900" },
};

export function P2pEscrowLifecycleLegend({ theme, compact = true }) {
  const isDark = isP2pTradeDark(theme);

  return (
    <div
      data-testid={P2P_TEST_IDS.escrowLegend}
      className={`rounded-xl border p-2 ${isDark ? "border-white/10 bg-black/15" : "border-stone-200 bg-white/80"}`}
      role="list"
      aria-label="Escrow lifecycle legend"
    >
      <div className={`mb-1.5 text-[9px] font-black uppercase tracking-wider ${theme.muted}`}>
        Escrow lifecycle {compact ? "(compact)" : ""}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {P2P_ESCROW_LEGEND_ENTRIES.map((entry) => {
          const tone = TONE[entry.tone]?.[isDark ? "dark" : "light"] || TONE.slate.dark;
          return (
            <span
              key={entry.key}
              role="listitem"
              data-escrow-key={entry.key}
              className={`inline-flex max-w-[11rem] flex-col rounded-lg border px-2 py-1 ${tone}`}
              title={entry.short}
            >
              <span className="font-mono text-[9px] font-black">{entry.key}</span>
              <span className="text-[8px] leading-tight opacity-90">{entry.label}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
