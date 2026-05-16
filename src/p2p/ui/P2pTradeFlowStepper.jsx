import React from "react";
import { P2P_TEST_IDS } from "../p2pTestIds.js";
import { isP2pTradeDark } from "./p2pTradeShell.js";

export function P2pTradeFlowStepper({ theme, steps, compact = false, matrixHint = null, matrixStatus = null }) {
  const isDark = isP2pTradeDark(theme);
  if (!steps?.length) return null;

  return (
    <div data-testid={P2P_TEST_IDS.flowStepper} className={compact ? "w-full" : "w-full py-1"}>
      {matrixHint ? (
        <p className={`mb-2 text-[9px] font-bold leading-snug ${isDark ? "text-indigo-300" : "text-indigo-800"}`}>
          {matrixHint}
          {matrixStatus === "payment_confirmed" ? (
            <span className={`ml-1 font-mono opacity-80 ${theme.muted}`}>(payment_confirmed)</span>
          ) : null}
        </p>
      ) : null}
      <div className="flex items-center justify-between gap-0.5">
        {steps.map((step, i) => {
          const done = step.status === "done";
          const current = step.status === "current";
          const cancelled = step.status === "cancelled";
          const dot =
            done || current
              ? isDark
                ? "bg-emerald-500 text-white ring-2 ring-emerald-400/40"
                : "bg-emerald-600 text-white ring-2 ring-emerald-200"
              : cancelled
                ? "bg-red-500/80 text-white"
                : isDark
                  ? "bg-white/10 text-slate-500"
                  : "bg-stone-200 text-stone-500";
          const line =
            i < steps.length - 1
              ? done
                ? isDark
                  ? "bg-emerald-500/60"
                  : "bg-emerald-400"
                : isDark
                  ? "bg-white/10"
                  : "bg-stone-200"
              : "";
          return (
            <React.Fragment key={step.key}>
              <div className="flex min-w-0 flex-shrink-0 flex-col items-center gap-1">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-black ${dot} ${
                    current ? "scale-110" : ""
                  }`}
                >
                  {step.status === "done" ? "✓" : step.short}
                </span>
                {!compact ? (
                  <span
                    className={`max-w-[4.5rem] truncate text-center text-[9px] font-bold ${
                      current ? (isDark ? "text-emerald-300" : "text-emerald-700") : theme.muted
                    }`}
                  >
                    {step.label}
                  </span>
                ) : null}
              </div>
              {i < steps.length - 1 ? <div className={`h-0.5 min-w-[8px] flex-1 rounded ${line}`} aria-hidden /> : null}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
