import React from "react";
import { RISK_GUARD_TEST_IDS } from "../../risk/riskGuardTestIds.js";

const STYLE = {
  pass: "bg-emerald-500/25 text-emerald-200 border-emerald-500/40",
  warn: "bg-amber-500/25 text-amber-200 border-amber-500/40",
  fail: "bg-rose-500/25 text-rose-200 border-rose-500/40",
};

export function RiskStatusBadge({ status = "pass", label, compact }) {
  const lvl = STYLE[status] || STYLE.pass;
  return (
    <span
      data-testid={RISK_GUARD_TEST_IDS.statusBadge}
      data-risk-status={status}
      className={`inline-flex items-center rounded border px-2 py-0.5 font-black uppercase tracking-wide ${
        compact ? "text-[8px]" : "text-[10px]"
      } ${lvl}`}
    >
      {label || status}
    </span>
  );
}
