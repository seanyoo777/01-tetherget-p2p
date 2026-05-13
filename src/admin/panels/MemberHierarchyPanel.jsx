import React, { forwardRef } from "react";

/** `member` 오른쪽 열 — `hierarchyPathSectionRef` 하부 트리 검색·단계 지정·경로 버튼. `AdminSectionBoundary`·2열 래퍼는 `App.jsx`에 유지. */
export const MemberHierarchyPanel = forwardRef(function MemberHierarchyPanel(props, ref) {
  const {
    theme,
    setAdminUserSearch,
    hierarchyQuickSearch,
    setHierarchyQuickSearch,
    hierarchyQuickMatches,
    jumpToTreeMember,
    monitorCurrentUser,
    getEffectiveStage,
    monitorDirectChildrenCount,
    monitorDescendantCount,
    stageSelectionValue,
    setStageSelectionValue,
    isSelfTargetMember,
    adminStageOptions,
    requestApplyStage,
    saveSelectedStage,
    isSuperAdmin,
    applyMonitorAdminAssignment,
    isAdminAssignedUser,
    monitorPath,
    memberUsers,
    moveToHierarchyDepth,
  } = props;

  return (
    <div ref={ref} className="mt-3 rounded-2xl border p-3">
      <div className="mb-3 rounded-xl border border-white/10 bg-black/15 p-2.5">
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-black">하부 트리 · 회원 검색</div>
          <button
            type="button"
            onClick={() => setAdminUserSearch(hierarchyQuickSearch)}
            className={`rounded-lg border px-2 py-1 text-[10px] font-black ${theme.input}`}
          >
            이 검색어를 왼쪽 목록에도 적용
          </button>
        </div>
        <input
          value={hierarchyQuickSearch}
          onChange={(e) => setHierarchyQuickSearch(e.target.value)}
          className={`w-full rounded-xl border px-3 py-2 text-xs font-bold outline-none ${theme.input}`}
          placeholder="ID · 닉네임 · 이메일 · 상위 · 단계(예: LEVEL 1, VD-004)"
          aria-label="하부 트리 회원 검색"
        />
        {hierarchyQuickMatches.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {hierarchyQuickMatches.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => jumpToTreeMember(u)}
                className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${theme.input}`}
              >
                {u.nickname} · {u.id} · {String(u.stageLabel || "").slice(0, 6)}
              </button>
            ))}
          </div>
        ) : hierarchyQuickSearch.trim() ? (
          <div className={`mt-2 text-[11px] ${theme.muted}`}>일치하는 회원이 없습니다.</div>
        ) : (
          <div className={`mt-1.5 text-[10px] ${theme.muted}`}>검색 결과에서 회원을 누르면 트리 경로가 해당 회원으로 이동합니다.</div>
        )}
      </div>
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-black">회원 단계 지정</div>
        <div className="flex items-center gap-1 text-xs">
          <span className={`rounded-full border px-2 py-0.5 font-black ${theme.main}`}>
            선택 회원: {monitorCurrentUser.nickname} ({getEffectiveStage(monitorCurrentUser)})
          </span>
          <span className={`rounded-full border px-2 py-0.5 font-black ${theme.input}`}>직계 하부 {monitorDirectChildrenCount}명</span>
          <span className={`rounded-full border px-2 py-0.5 font-black ${theme.input}`}>전체 하위 {monitorDescendantCount}명</span>
        </div>
      </div>
      <div className="mb-2 grid gap-1.5 md:grid-cols-[1fr_auto_auto]">
        <select
          value={stageSelectionValue || getEffectiveStage(monitorCurrentUser)}
          onChange={(e) => setStageSelectionValue(e.target.value)}
          disabled={isSelfTargetMember}
          className={`rounded-xl border px-2.5 py-1.5 text-sm font-black outline-none ${theme.input}`}
        >
          {adminStageOptions.map((stageName) => (
            <option key={stageName} value={stageName}>
              {stageName}
            </option>
          ))}
        </select>
        <button type="button" onClick={requestApplyStage} disabled={isSelfTargetMember} className={`rounded-xl px-3 py-1.5 text-sm font-black ${isSelfTargetMember ? "bg-slate-500 text-white" : theme.main}`}>
          단계 적용
        </button>
        <button type="button" onClick={saveSelectedStage} className={`rounded-xl border px-3 py-1.5 text-sm font-black ${isSelfTargetMember ? "bg-slate-500 text-white" : theme.input}`} disabled={isSelfTargetMember}>
          저장/확인
        </button>
      </div>
      <div className="mb-2 flex flex-wrap items-stretch gap-2">
        <button
          type="button"
          onClick={() => void applyMonitorAdminAssignment(true)}
          disabled={
            isSelfTargetMember || !(isSuperAdmin || String(monitorCurrentUser.id || "").startsWith("VD-")) || isAdminAssignedUser(monitorCurrentUser)
          }
          className={`rounded-xl px-3 py-1.5 text-xs font-black ${
            isSelfTargetMember || isAdminAssignedUser(monitorCurrentUser) ? "bg-slate-600 text-white" : "bg-indigo-600 text-white"
          }`}
        >
          관리자 지정 ON
        </button>
        <button
          type="button"
          onClick={() => void applyMonitorAdminAssignment(false)}
          disabled={isSelfTargetMember || !(isSuperAdmin || String(monitorCurrentUser.id || "").startsWith("VD-")) || !isAdminAssignedUser(monitorCurrentUser)}
          className={`rounded-xl border px-3 py-1.5 text-xs font-black ${theme.input}`}
        >
          관리자 해제 OFF
        </button>
        <div className={`min-w-[160px] flex-1 rounded-xl border px-2 py-1.5 text-[10px] leading-snug ${theme.muted}`}>
          <span className="font-black text-white/90">안내:</span> 실회원 저장은 슈퍼관리자만 가능합니다. <span className="text-amber-200/90">VD- 가상 회원</span>은 버튼 클릭 시 즉시 로컬 반영됩니다.
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {monitorPath.map((userId, index) => {
          const nodeUser = memberUsers.find((u) => String(u.id) === String(userId));
          return (
            <button
              key={`${userId}-${index}`}
              onClick={() => moveToHierarchyDepth(index)}
              className={`rounded-full border px-2 py-1 text-[11px] font-black ${index === monitorPath.length - 1 ? theme.main : theme.input}`}
            >
              {nodeUser?.nickname || userId}
            </button>
          );
        })}
        {monitorPath.length > 1 && (
          <button onClick={() => moveToHierarchyDepth(monitorPath.length - 2)} className={`rounded-full border px-2 py-1 text-[11px] font-black ${theme.input}`}>
            한 단계 위로
          </button>
        )}
      </div>
    </div>
  );
});

MemberHierarchyPanel.displayName = "MemberHierarchyPanel";
