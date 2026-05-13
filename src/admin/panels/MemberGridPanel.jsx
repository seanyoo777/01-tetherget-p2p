import React from "react";

/** `member` 탭 첫 블록(왼쪽 하부 목록·단계·검색·페이지네이션) — `AdminSectionBoundary`(`admin-tab-member`)와 2열 그리드 래퍼는 `App.jsx`에서 유지. */
export function MemberGridPanel(props) {
  const {
    theme,
    childListLabel,
    virtualDownlineMemberCount,
    visibleUsersCount,
    memberStageFilterExpanded,
    setMemberStageFilterExpanded,
    memberStageFilter,
    setMemberStageFilter,
    downlineStageSummaryEntries,
    summaryScopeUsersCount,
    stageSummaryHealth,
    showAdminDebug,
    setShowAdminDebug,
    adminStats,
    engineUsersLength,
    treeIntegrity,
    debugDirectDownlineCount,
    debugAllDownlineCount,
    superPageMemberCount,
    adminUserSearch,
    setAdminUserSearch,
    memberListSort,
    setMemberListSort,
    pagedVisibleUsers,
    selectUser,
    selectedAdminUser,
    getEffectiveStage,
    formatNumber,
    memberUserPage,
    setMemberUserPage,
    memberUserTotalPages,
  } = props;

  return (
    <div className={`rounded-2xl p-2 ${theme.cardSoft}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-lg font-black">{childListLabel}</div>
          <div className={`text-xs ${theme.muted}`}>내 하부 가상 {virtualDownlineMemberCount}명 · 단계별 분포 분석</div>
        </div>
        <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-black text-white">{visibleUsersCount}명</span>
      </div>
      <div
        className={
          memberStageFilterExpanded
            ? "mb-2 flex flex-wrap gap-1.5"
            : "mb-1 flex max-h-[5.5rem] flex-wrap gap-1.5 overflow-hidden"
        }
      >
        <button
          type="button"
          onClick={() => setMemberStageFilter("전체")}
          className={`shrink-0 rounded-xl border px-2.5 py-1.5 text-center text-xs font-black whitespace-nowrap ${memberStageFilter === "전체" ? theme.main : theme.input}`}
        >
          <div>전체</div>
          <div>{summaryScopeUsersCount}</div>
        </button>
        {downlineStageSummaryEntries.map(([stage, count]) => (
          <button
            key={stage}
            type="button"
            onClick={() => setMemberStageFilter(stage)}
            className={`shrink-0 rounded-xl border px-2.5 py-1.5 text-center text-xs font-black whitespace-nowrap ${memberStageFilter === stage ? theme.main : theme.input}`}
          >
            <div>{stage}</div>
            <div>{count}</div>
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setMemberStageFilterExpanded((v) => !v)}
        className={`mb-2 w-full rounded-xl border px-3 py-2 text-center text-[11px] font-black ${theme.input}`}
      >
        {memberStageFilterExpanded ? "▲ 감추기" : "▼ 모든 단계 보기"}
      </button>
      {stageSummaryHealth.mismatch && (
        <div className="mb-2 rounded-xl border border-red-500/40 bg-red-500/10 px-2 py-1 text-[11px] font-black text-red-300">
          단계 집계 점검 필요: 합계 {stageSummaryHealth.total} / 기대 {stageSummaryHealth.expected}
        </div>
      )}
      <label className={`mb-2 flex items-center gap-2 text-[11px] font-black ${theme.muted}`}>
        <input type="checkbox" checked={showAdminDebug} onChange={(e) => setShowAdminDebug(e.target.checked)} />
        관리자 디버그 체크
      </label>
      {showAdminDebug && (
        <div className={`mb-2 rounded-xl border p-2 text-[11px] ${theme.input}`}>
          <div>전체 회원 수(엔진): {adminStats.totalUsers}</div>
          <div>레벨별 회원 수 합계: {adminStats.levelCountSum}</div>
          <div>실제 users.length: {engineUsersLength}</div>
          <div>불일치 여부: {adminStats.levelCountMismatch ? "불일치" : "정상"}</div>
          <div>트리 무결성 검사: {treeIntegrity.ok ? "통과" : `실패 (${treeIntegrity.errors.length})`}</div>
          <div>직접 하부(선택): {debugDirectDownlineCount}</div>
          <div>전체 하부(선택): {debugAllDownlineCount}</div>
          <div>슈퍼페이지 회원 수: {superPageMemberCount}</div>
        </div>
      )}

      <div className="mb-2 grid gap-1.5 md:grid-cols-[1fr_auto]">
        <input
          value={adminUserSearch}
          onChange={(e) => setAdminUserSearch(e.target.value)}
          className={`w-full rounded-2xl border px-3 py-2 text-xs font-bold outline-none ${theme.input}`}
          placeholder="닉네임 · ID · 이메일 · 지갑 · 단계(LEVEL 1~10, 본사) 검색"
        />
        <select
          value={memberListSort}
          onChange={(e) => setMemberListSort(e.target.value)}
          className={`rounded-2xl border px-2 py-2 text-xs font-black outline-none ${theme.input}`}
        >
          <option value="joined_desc">가입순 (최신)</option>
          <option value="joined_asc">가입순 (오래된)</option>
          <option value="children_desc">하부 많은순</option>
          <option value="children_asc">하부 적은순</option>
          <option value="trades_desc">거래 많은순</option>
          <option value="trades_asc">거래 적은순</option>
        </select>
      </div>

      <div className="space-y-1.5">
        {pagedVisibleUsers.map((user) => (
          <button
            key={user.id}
            onClick={() => selectUser(user)}
            className={`w-full rounded-xl border p-2.5 text-left transition ${selectedAdminUser?.id === user.id ? theme.main : theme.input}`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="font-black">{user.nickname}</div>
              <div className={`rounded-full px-2 py-1 text-xs font-black ${user.status === "주의" ? "bg-red-600 text-white" : "bg-emerald-600 text-white"}`}>{user.status}</div>
            </div>
            <div className="mt-1 text-xs opacity-80">{user.id} · 상위: {user.parent}</div>
            <div className="mt-1 text-xs opacity-80">현재 단계: {getEffectiveStage(user)}</div>
            <div className="mt-1 text-xs opacity-80">배분 {user.childRate}% · 거래 {formatNumber(user.trades)}건 · 하부 {user.children}명</div>
          </button>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <button
          onClick={() => setMemberUserPage((prev) => Math.max(1, prev - 1))}
          disabled={memberUserPage <= 1}
          className={`rounded-xl border px-2 py-1 text-[11px] font-black ${memberUserPage <= 1 ? "bg-slate-500 text-white" : theme.input}`}
        >
          이전
        </button>
        <div className={`text-[11px] ${theme.muted}`}>
          {memberUserPage} / {memberUserTotalPages}
        </div>
        <button
          onClick={() => setMemberUserPage((prev) => Math.min(memberUserTotalPages, prev + 1))}
          disabled={memberUserPage >= memberUserTotalPages}
          className={`rounded-xl border px-2 py-1 text-[11px] font-black ${memberUserPage >= memberUserTotalPages ? "bg-slate-500 text-white" : theme.input}`}
        >
          다음
        </button>
      </div>
    </div>
  );
}
