import React, { forwardRef } from "react";

/** `member` 오른쪽 열 — `directDownlineListRef` 직접 하부 테이블. 트리·단계 블록은 `App.jsx`에 유지. */
export const MemberDirectDownlinePanel = forwardRef(function MemberDirectDownlinePanel(props, ref) {
  const {
    theme,
    monitorCurrentUser,
    selectedChildUser,
    setSelectedChildUser,
    selectedChildRateInput,
    setSelectedChildRateInput,
    isSuperAdmin,
    saveSelectedChildRate,
    bulkChildRateInput,
    setBulkChildRateInput,
    applyBulkChildRate,
    selectedChildren,
    setSelectedChildIds,
    selectedChildIds,
    toggleChildSelection,
    pagedSelectedChildren,
    drillDownToUser,
    formatNumber,
    childInlineRates,
    setInlineChildRate,
    appliedRate,
    saveInlineChildRate,
    memberChildPage,
    setMemberChildPage,
    memberChildTotalPages,
  } = props;

  return (
    <div ref={ref} className="mt-2 rounded-2xl bg-black/10 p-2.5">
      <div className="mb-3 flex items-center justify-between">
        <div className="font-black">{monitorCurrentUser.nickname}의 직접 하부</div>
        <div className={`text-xs ${theme.muted}`}>행 클릭으로 선택 · 행에서 배분율 바로 수정 · 선택 항목만 부분 일괄 적용</div>
      </div>
      {selectedChildUser && (
        <div className={`mb-3 rounded-xl border px-3 py-2 text-xs ${theme.input}`}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-black">선택 하부</span>
            <span>
              {selectedChildUser.nickname} ({selectedChildUser.id})
            </span>
            <input
              value={selectedChildRateInput}
              onChange={(e) => setSelectedChildRateInput(e.target.value)}
              disabled={!isSuperAdmin}
              className={`w-20 rounded-lg border px-2 py-1 text-[11px] font-bold outline-none ${theme.input}`}
              placeholder="%"
              aria-label="선택 하부 배분율"
            />
            <span className="text-[11px]">%</span>
            <button
              type="button"
              onClick={saveSelectedChildRate}
              disabled={!isSuperAdmin}
              className={`rounded-lg border px-2 py-1 text-[11px] font-black ${theme.input}`}
            >
              배분율 저장
            </button>
            <button
              type="button"
              onClick={() => setSelectedChildUser(null)}
              className={`rounded-lg border px-2 py-1 text-[11px] font-black ${theme.input}`}
            >
              선택 해제
            </button>
          </div>
        </div>
      )}
      <div className="mb-3 grid gap-2 md:grid-cols-[1fr_auto_auto]">
        <input
          value={bulkChildRateInput}
          onChange={(e) => setBulkChildRateInput(e.target.value)}
          className={`rounded-2xl border px-3 py-2 text-xs font-bold outline-none ${theme.input}`}
          placeholder="선택 하부 일괄 배분율(%)"
        />
        <button onClick={applyBulkChildRate} className={`rounded-2xl border px-3 py-2 text-xs font-black ${theme.input}`}>
          선택 하부 일괄 저장
        </button>
        <div className="flex gap-2">
          <button
            onClick={() => setSelectedChildIds(selectedChildren.map((child) => child.id))}
            className={`rounded-2xl border px-3 py-2 text-xs font-black ${theme.input}`}
          >
            전체선택
          </button>
          <button onClick={() => setSelectedChildIds([])} className={`rounded-2xl border px-3 py-2 text-xs font-black ${theme.input}`}>
            전체해제
          </button>
        </div>
      </div>
      <div className="space-y-1.5">
        {pagedSelectedChildren.map((child) => (
          <div
            key={child.id}
            role="button"
            tabIndex={0}
            onClick={() => setSelectedChildUser(child)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setSelectedChildUser(child);
              }
            }}
            className={`w-full cursor-pointer rounded-2xl border px-3 py-2 text-left text-xs transition ${theme.input} ${
              selectedChildUser?.id === child.id ? "ring-2 ring-indigo-500 ring-offset-2 ring-offset-transparent" : ""
            }`}
          >
            <div className="grid items-center gap-2 md:grid-cols-[auto_1.2fr_1fr_1fr_auto_auto_auto]">
              <label className="inline-flex items-center">
                <input
                  type="checkbox"
                  checked={selectedChildIds.includes(child.id)}
                  onChange={(e) => {
                    e.stopPropagation();
                    toggleChildSelection(child.id);
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              </label>
              <div className="pointer-events-none font-black">
                {child.nickname} ({child.id})
              </div>
              <div className="opacity-80">가입일 {child.joined}</div>
              <div className="opacity-80">거래 {formatNumber(child.trades)}건</div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  drillDownToUser(child);
                }}
                className={`rounded-full border px-2 py-1 text-[10px] font-black ${theme.input}`}
              >
                하부 {child.children}명 열기
              </button>
              <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                <input
                  value={childInlineRates[child.id] ?? String(appliedRate(child))}
                  onChange={(e) => setInlineChildRate(child.id, e.target.value)}
                  className={`w-20 rounded-xl border px-2 py-1 text-[11px] font-bold outline-none ${theme.input}`}
                  placeholder="배분율"
                />
                <span className="text-[11px]">%</span>
                <button type="button" onClick={() => saveInlineChildRate(child)} className={`rounded-xl border px-2 py-1 text-[11px] font-black ${theme.input}`}>
                  저장
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <button
          onClick={() => setMemberChildPage((prev) => Math.max(1, prev - 1))}
          disabled={memberChildPage <= 1}
          className={`rounded-xl border px-2 py-1 text-[11px] font-black ${memberChildPage <= 1 ? "bg-slate-500 text-white" : theme.input}`}
        >
          이전
        </button>
        <div className={`text-[11px] ${theme.muted}`}>
          {memberChildPage} / {memberChildTotalPages}
        </div>
        <button
          onClick={() => setMemberChildPage((prev) => Math.min(memberChildTotalPages, prev + 1))}
          disabled={memberChildPage >= memberChildTotalPages}
          className={`rounded-xl border px-2 py-1 text-[11px] font-black ${memberChildPage >= memberChildTotalPages ? "bg-slate-500 text-white" : theme.input}`}
        >
          다음
        </button>
      </div>
    </div>
  );
});

MemberDirectDownlinePanel.displayName = "MemberDirectDownlinePanel";