import React from "react";
import { DISPUTE_TEST_IDS } from "../disputeTestIds.js";
import { RiskStatusBadge } from "../../components/risk/RiskStatusBadge.jsx";

const ESCROW_STEPS = ["escrow_pending", "escrow_locked", "release_waiting", "dispute_opened", "manual_hold"];

const LABELS = {
  escrow_pending: "예치 대기",
  escrow_locked: "잠금",
  release_waiting: "릴리스 대기",
  dispute_opened: "분쟁·홀드",
  manual_hold: "수동 홀드",
};

export function EscrowStatusTimeline({ escrowStatus, releaseBlocked, theme }) {
  const current = escrowStatus || "escrow_locked";
  const idx = ESCROW_STEPS.indexOf(current);
  return (
    <div data-testid={DISPUTE_TEST_IDS.escrowTimeline} className={`rounded-xl border p-3 ${theme.cardSoft}`}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-black uppercase text-amber-400">Escrow timeline (mock)</span>
        {releaseBlocked ? <RiskStatusBadge status="fail" label="RELEASE BLOCKED" compact /> : null}
        {current === "dispute_opened" ? <RiskStatusBadge status="fail" label="DISPUTE" compact /> : null}
      </div>
      <div className="flex flex-col gap-1 sm:flex-row sm:flex-wrap">
        {ESCROW_STEPS.map((st, i) => (
          <div
            key={st}
            className={`rounded-lg border px-2 py-1 text-[10px] font-bold ${
              st === current ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-200" : theme.card
            } ${i <= idx ? "opacity-100" : "opacity-40"}`}
          >
            {LABELS[st] || st}
          </div>
        ))}
      </div>
    </div>
  );
}
