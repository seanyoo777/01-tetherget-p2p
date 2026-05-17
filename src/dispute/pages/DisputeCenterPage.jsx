import React, { useCallback, useMemo, useState } from "react";
import { DISPUTE_TEST_IDS } from "../disputeTestIds.js";
import { DISPUTE_TYPES } from "../disputeConstants.js";
import {
  createDisputeCase,
  filterDisputeCases,
  seedDemoDisputeCasesIfEmpty,
} from "../disputeHelpers.js";
import { loadDisputeCases } from "../disputeStore.js";
import { DisputeCaseCard } from "../ui/DisputeCaseCard.jsx";

export function DisputeCenterPage({ theme, notify, userId, onOpenCase }) {
  const [disputeType, setDisputeType] = useState("payment_not_received");
  const [orderId, setOrderId] = useState("");
  const [revision, setRevision] = useState(0);

  const refresh = useCallback(() => {
    seedDemoDisputeCasesIfEmpty();
    setRevision((r) => r + 1);
  }, []);

  const cases = useMemo(() => {
    void revision;
    return filterDisputeCases({});
  }, [revision]);

  const submit = () => {
    const oid = orderId.trim() || `P2P-USER-${Date.now()}`;
    const row = createDisputeCase({
      orderId: oid,
      buyerId: userId || "BUY-SELF",
      sellerId: "SEL-UNKNOWN",
      disputeType,
      orderStatus: "payment_sent",
    });
    notify?.(`[MOCK] 분쟁 접수 ${row.caseId}`);
    setOrderId("");
    setRevision((r) => r + 1);
  };

  return (
    <section data-testid={DISPUTE_TEST_IDS.center} className="mx-auto max-w-3xl px-4 py-6">
      <div className={`rounded-3xl border p-4 ${theme.card}`}>
        <h2 className="text-xl font-black">분쟁 · 신고 센터</h2>
        <p className={`mt-1 text-xs ${theme.muted}`}>거래 분쟁 접수 · escrow 추적 · MOCK ONLY (localStorage)</p>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <input
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            placeholder="주문 ID (비우면 자동)"
            className={`rounded-xl border px-3 py-2 text-sm ${theme.input}`}
          />
          <select value={disputeType} onChange={(e) => setDisputeType(e.target.value)} className={`rounded-xl border px-3 py-2 text-sm ${theme.input}`}>
            {DISPUTE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <button type="button" onClick={submit} className={`mt-3 w-full rounded-xl px-4 py-3 text-sm font-black ${theme.main}`}>
          분쟁 접수 (mock)
        </button>
        <button type="button" onClick={refresh} className={`mt-2 w-full rounded-xl border px-4 py-2 text-xs font-black ${theme.input}`}>
          목록 새로고침 ({loadDisputeCases().length})
        </button>

        <div className="mt-4 space-y-2">
          {cases.map((row) => (
            <DisputeCaseCard key={row.caseId} row={row} theme={theme} onOpen={onOpenCase} />
          ))}
        </div>
      </div>
    </section>
  );
}
