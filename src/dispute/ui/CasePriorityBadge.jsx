import React from "react";
import { DISPUTE_TEST_IDS } from "../disputeTestIds.js";

const TONE = {
  low: "bg-slate-500/20 text-slate-200",
  normal: "bg-sky-500/20 text-sky-200",
  high: "bg-amber-500/20 text-amber-200",
  critical: "bg-rose-500/20 text-rose-200",
};

export function CasePriorityBadge({ priority }) {
  const p = priority || "normal";
  return (
    <span
      data-testid={DISPUTE_TEST_IDS.priorityBadge}
      data-priority={p}
      className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${TONE[p] || TONE.normal}`}
    >
      {p}
    </span>
  );
}
