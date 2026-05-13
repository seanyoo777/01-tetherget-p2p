import React from "react";

/** `member` 오른쪽 열 — **하위 유저 ID 입력 + 하위 유저 지정** 한 행. `AdminSectionBoundary`·2열 래퍼는 `App.jsx`에 유지. */
export function MemberAssignChildPanel(props) {
  const { theme, downlineTargetUserId, setDownlineTargetUserId, isSelfTargetMember, assignDownlineUser } = props;

  return (
    <div className="mt-2 grid gap-2 md:grid-cols-[1fr_auto]">
      <input
        value={downlineTargetUserId}
        onChange={(e) => setDownlineTargetUserId(e.target.value.trim().toUpperCase())}
        disabled={isSelfTargetMember}
        placeholder="하위 유저 ID 입력 (예: TG-MEMBER-015)"
        className={`rounded-2xl border px-3 py-2 text-sm font-bold outline-none ${theme.input}`}
      />
      <button onClick={assignDownlineUser} disabled={isSelfTargetMember} className={`rounded-2xl border px-4 py-2 text-sm font-black ${isSelfTargetMember ? "bg-slate-500 text-white" : theme.input}`}>
        하위 유저 지정
      </button>
    </div>
  );
}
