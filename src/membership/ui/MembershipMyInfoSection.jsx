import React, { useCallback, useState } from "react";
import { MembershipCard } from "./MembershipCard.jsx";
import { OneAiBridgeStrip } from "./OneAiBridgeStrip.jsx";
import { MembershipFeePreview } from "./MembershipFeePreview.jsx";
import {
  loadMembershipMockState,
  saveMembershipMockState,
  mockSyncOneAiMembership,
  recordMembershipLevelMock,
} from "../membershipModel.js";

export function MembershipMyInfoSection({ theme, notify, formatNumber }) {
  const [state, setState] = useState(() => recordMembershipLevelMock(loadMembershipMockState()));
  const [syncing, setSyncing] = useState(false);

  const persist = useCallback((next) => {
    const saved = saveMembershipMockState(next);
    setState(saved);
    return saved;
  }, []);

  const handleSync = useCallback(() => {
    setSyncing(true);
    const next = mockSyncOneAiMembership(state);
    persist(next);
    setSyncing(false);
    notify?.("[MOCK] OneAI 멤버십 동기화 완료");
  }, [state, persist, notify]);

  return (
    <div className="grid gap-4 md:grid-cols-1">
      <MembershipCard theme={theme} state={state} formatNumber={formatNumber} />
      <OneAiBridgeStrip theme={theme} state={state} onSync={handleSync} syncing={syncing} />
      <MembershipFeePreview theme={theme} notionalUsdt={10_000} membershipState={state} formatNumber={formatNumber} />
    </div>
  );
}
