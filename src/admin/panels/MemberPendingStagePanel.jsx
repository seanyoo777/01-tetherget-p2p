import React from "react";

/** `member` 오른쪽 열 — 단계 변경 대기 한 줄. `!!pendingStageValue` 조건은 `App.jsx`에서 유지. */
export function MemberPendingStagePanel(props) {
  const { pendingStageFrom, pendingStageValue, monitorCurrentUser, getEffectiveStage } = props;

  return (
    <div className="mt-1 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
      변경 대기: {pendingStageFrom || getEffectiveStage(monitorCurrentUser)} {"->"} {pendingStageValue}
    </div>
  );
}
