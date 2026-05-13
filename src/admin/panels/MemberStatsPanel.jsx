import React from "react";

/** `member` 오른쪽 열 — 선택 회원 **4칸 요약 스탯** (단계·직계·전체 하위·관리자 지정). `AdminSectionBoundary`·2열 래퍼는 `App.jsx`에 유지. */
export function MemberStatsPanel(props) {
  const { theme, monitorCurrentUser, getEffectiveStage, monitorDirectChildrenCount, monitorDescendantCount, isAdminAssignedUser } = props;

  return (
    <div className="mt-2 grid gap-2 md:grid-cols-4">
      <div className={`rounded-xl border px-3 py-2 text-xs ${theme.input}`}>
        현재 단계 <b>{getEffectiveStage(monitorCurrentUser)}</b>
      </div>
      <div className={`rounded-xl border px-3 py-2 text-xs ${theme.input}`}>
        직계 하부 <b>{monitorDirectChildrenCount}명</b>
      </div>
      <div className={`rounded-xl border px-3 py-2 text-xs ${theme.input}`}>
        전체 하위 <b>{monitorDescendantCount}명</b>
      </div>
      <div className={`rounded-xl border px-3 py-2 text-xs ${theme.input}`}>
        관리자 지정 <b>{isAdminAssignedUser(monitorCurrentUser) ? "ON" : "OFF"}</b>
      </div>
    </div>
  );
}
