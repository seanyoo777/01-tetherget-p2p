import React, { useState } from "react";
import { DISPUTE_TEST_IDS } from "../disputeTestIds.js";
import { addMockEvidence } from "../disputeHelpers.js";

const EVIDENCE_TYPES = ["receipt_image", "bank_transfer", "wallet_tx", "chat_capture", "id_verification"];

export function EvidenceUploadPanel({ caseId, theme, onUpdated, notify }) {
  const [type, setType] = useState("receipt_image");
  const [note, setNote] = useState("");

  const upload = () => {
    const fileNameMock = `mock-${type}-${Date.now()}.png`;
    const next = addMockEvidence(caseId, type, fileNameMock, note);
    if (next) {
      notify?.("[MOCK] 증빙이 등록되었습니다.");
      onUpdated?.(next);
      setNote("");
    }
  };

  return (
    <div data-testid={DISPUTE_TEST_IDS.evidencePanel} className={`rounded-xl border p-3 ${theme.card}`}>
      <div className="text-xs font-black">증빙 업로드 (mock)</div>
      <p className={`mt-1 text-[10px] ${theme.muted}`}>실제 파일 업로드·은행 API 없음 · localStorage 케이스만 갱신</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <select value={type} onChange={(e) => setType(e.target.value)} className={`rounded-lg border px-2 py-2 text-xs ${theme.input}`}>
          {EVIDENCE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="메모"
          className={`rounded-lg border px-2 py-2 text-xs ${theme.input}`}
        />
      </div>
      <button type="button" onClick={upload} className={`mt-2 w-full rounded-lg px-3 py-2 text-xs font-black ${theme.main}`}>
        Mock 증빙 추가
      </button>
    </div>
  );
}
