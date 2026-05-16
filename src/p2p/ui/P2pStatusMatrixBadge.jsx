import React from "react";
import { P2P_MATRIX_STATUS_ORDER, getMatrixMeta } from "../p2pStatusMatrix.js";
import { P2P_TEST_IDS } from "../p2pTestIds.js";
import { isP2pTradeDark } from "./p2pTradeShell.js";

const TONE = {
  slate: { dark: "bg-white/10 text-slate-300", light: "bg-stone-200 text-stone-700" },
  sky: { dark: "bg-sky-500/25 text-sky-100", light: "bg-sky-100 text-sky-900" },
  violet: { dark: "bg-violet-500/25 text-violet-100", light: "bg-violet-100 text-violet-900" },
  indigo: { dark: "bg-indigo-500/25 text-indigo-100", light: "bg-indigo-100 text-indigo-900" },
  amber: { dark: "bg-amber-500/25 text-amber-100", light: "bg-amber-100 text-amber-900" },
  emerald: { dark: "bg-emerald-500/25 text-emerald-100", light: "bg-emerald-100 text-emerald-900" },
  rose: { dark: "bg-rose-500/25 text-rose-100", light: "bg-rose-100 text-rose-900" },
};

export function P2pStatusMatrixBadge({ theme, matrixStatus, compact = false }) {
  const isDark = isP2pTradeDark(theme);
  const meta = getMatrixMeta(matrixStatus);
  const tone = TONE[meta.tone]?.[isDark ? "dark" : "light"] || TONE.slate.dark;

  return (
    <span
      data-testid={P2P_TEST_IDS.matrixBadge}
      className={`inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[10px] font-black ${tone}`}
    >
      {meta.label}
      {!compact ? <span className="ml-1 opacity-60">{matrixStatus}</span> : null}
    </span>
  );
}

export function P2pStatusMatrixStrip({ theme, activeStatus }) {
  const isDark = isP2pTradeDark(theme);
  return (
    <div
      data-testid={P2P_TEST_IDS.matrixStrip}
      className={`flex flex-wrap gap-1 rounded-xl border p-2 ${isDark ? "border-white/10 bg-black/20" : "border-stone-200 bg-stone-50"}`}
      role="list"
      aria-label="거래 상태 매트릭스"
    >
      {P2P_MATRIX_STATUS_ORDER.map((key) => {
        const meta = getMatrixMeta(key);
        const active = key === activeStatus;
        const tone = TONE[meta.tone]?.[isDark ? "dark" : "light"] || TONE.slate.dark;
        return (
          <span
            key={key}
            role="listitem"
            className={`rounded-md px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide ${
              active ? tone + " ring-1 ring-emerald-500/50" : isDark ? "text-slate-500" : "text-stone-400"
            }`}
          >
            {meta.label}
          </span>
        );
      })}
    </div>
  );
}
