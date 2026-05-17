import React, { useMemo, useState } from "react";
import { rejectDisputeMock, resolveDisputeMock, startOperatorReview } from "../disputeHelpers.js";
import { evaluateEscrowReleaseGuard } from "../../risk/riskGuardHelpers.js";
import { RISK_GUARD_TEST_IDS } from "../../risk/riskGuardTestIds.js";

export function OperatorReviewPanel({ caseId, disputeCase, operatorId, theme, onUpdated, notify }) {
  const [note, setNote] = useState("");
  const guard = useMemo(() => evaluateEscrowReleaseGuard(disputeCase), [disputeCase]);
  const releaseDisabled = !guard.canMockRelease || disputeCase?.escrowStatus === "dispute_opened";

  const run = (fn) => {
    const next = fn(caseId, operatorId || "OP-MOCK", note || "mock review");
    if (next) {
      notify?.("[MOCK] 케이스 상태가 갱신되었습니다.");
      onUpdated?.(next);
    }
  };

  return (
    <div className={`rounded-xl border p-3 ${theme.card}`}>
      <div className="text-xs font-black">운영자 검토 (mock)</div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="운영 메모"
        className={`mt-2 h-20 w-full rounded-lg border p-2 text-xs ${theme.input}`}
      />
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" onClick={() => run(startOperatorReview)} className={`rounded-lg px-3 py-1.5 text-[10px] font-black ${theme.input}`}>
          검토 시작
        </button>
        <button type="button" onClick={() => run(resolveDisputeMock)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[10px] font-black text-white">
          Resolve mock
        </button>
        <button type="button" onClick={() => run(rejectDisputeMock)} className="rounded-lg bg-rose-600 px-3 py-1.5 text-[10px] font-black text-white">
          Reject mock
        </button>
        <button
          type="button"
          data-testid={RISK_GUARD_TEST_IDS.mockReleaseBtn}
          disabled={releaseDisabled}
          className={`rounded-lg px-3 py-1.5 text-[10px] font-black ${
            releaseDisabled ? `cursor-not-allowed opacity-40 ${theme.input}` : "bg-violet-700 text-white"
          }`}
          title="Operator panel — mock release only"
        >
          Mock Release {releaseDisabled ? "(blocked)" : ""}
        </button>
      </div>
    </div>
  );
}
