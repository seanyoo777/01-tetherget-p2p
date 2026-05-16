import React from "react";
import { MEMBERSHIP_TEST_IDS } from "../membershipTestIds.js";
import { isOneAiBridgeEnabled } from "../membershipFeatureFlags.js";

const SYNC_LABEL = {
  mock_idle: "대기",
  mock_pending: "동기화 중…",
  mock_synced: "Mock 연동됨",
};

export function OneAiBridgeStrip({ theme, state, onSync, syncing = false }) {
  if (!isOneAiBridgeEnabled()) {
    return (
      <div className={`rounded-xl border p-3 text-xs ${theme.cardSoft}`}>
        <span className={theme.muted}>OneAI Bridge 비활성 (feature flag)</span>
      </div>
    );
  }

  const status = state?.oneAiSyncStatus ?? "mock_idle";
  const label = SYNC_LABEL[status] ?? status;
  const syncedAt = state?.lastSyncAt ? new Date(state.lastSyncAt).toLocaleString() : "—";

  return (
    <div data-testid={MEMBERSHIP_TEST_IDS.oneAiBridge} className={`rounded-xl border p-3 ${theme.card}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs font-black">OneAI Bridge (mock)</div>
          <p className={`mt-1 text-[10px] leading-relaxed ${theme.muted}`}>
            03-OneAI 포인트 잔액을 읽어 P2P 멤버십 등급에 반영하는 구조입니다. HTTP/API 호출 없음.
          </p>
        </div>
        <span className="rounded-full bg-violet-500/20 px-2 py-1 text-[10px] font-black text-violet-200">{label}</span>
      </div>
      <div className={`mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] ${theme.subtext}`}>
        <span>마지막 mock sync: {syncedAt}</span>
        <button
          type="button"
          disabled={syncing}
          onClick={onSync}
          className={`rounded-lg border px-3 py-1.5 text-[10px] font-black ${syncing ? "opacity-50" : theme.main}`}
        >
          {syncing ? "동기화…" : "Mock 동기화"}
        </button>
      </div>
    </div>
  );
}
