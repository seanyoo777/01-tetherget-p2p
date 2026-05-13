import React from "react";

/** `memberOps` 탭 첫 번째 블록(운영 그리드) — 첫 `AdminSectionBoundary`(`admin-tab-memberOps`)는 `App.jsx`에서 유지. */
export function MemberOpsGridPanel(props) {
  const {
    theme,
    visible,
    DetailBox,
    authUsers,
    selectedOpsUser,
    setSelectedOpsUserId,
    updateAuthRole,
    isSuperAdmin,
    notify,
    setAuthUsers,
    updateAuthProfile,
    sellerDepositNotice,
    setSellerDepositNotice,
    appendAdminAction,
    setAdminViewTab,
  } = props;

  return (
    <div className={`${visible ? "" : "hidden "}mt-5 grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]`}>
      <div className={`rounded-3xl border p-4 ${theme.card}`}>
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-black">회원 운영 대상</div>
          <span className={`rounded-full px-2 py-1 text-[11px] font-black ${theme.input}`}>{authUsers.length}명</span>
        </div>
        <div className="max-h-[560px] space-y-2 overflow-y-auto pr-1">
          {authUsers.map((user) => (
            <button
              key={user.id}
              onClick={() => setSelectedOpsUserId(user.id)}
              className={`w-full rounded-2xl border p-3 text-left text-xs ${String(selectedOpsUser?.id) === String(user.id) ? theme.main : theme.input}`}
            >
              <div className="font-black">{user.nickname}</div>
              <div className={`mt-1 ${theme.muted}`}>{user.id}</div>
              <div className={`mt-1 ${theme.muted}`}>{user.role}</div>
            </button>
          ))}
        </div>
      </div>

      <div className={`rounded-3xl border p-4 ${theme.card}`}>
        {selectedOpsUser ? (
          <>
            <div className="grid gap-2 md:grid-cols-2">
              <DetailBox label="닉네임" value={selectedOpsUser.nickname} theme={theme} />
              <DetailBox label="회원 ID" value={selectedOpsUser.id} theme={theme} />
              <DetailBox label="이메일" value={selectedOpsUser.email} theme={theme} />
              <DetailBox label="현재 권한" value={selectedOpsUser.role} theme={theme} />
              <DetailBox label="현재 단계" value={selectedOpsUser.stage_label || "미지정"} theme={theme} />
              <DetailBox label="상위 참조" value={selectedOpsUser.parent_user_ref || "미지정"} theme={theme} />
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto]">
              <select
                value={selectedOpsUser.role}
                onChange={(e) => updateAuthRole(selectedOpsUser.id, e.target.value)}
                disabled={!isSuperAdmin}
                className={`rounded-2xl border px-3 py-2 text-sm font-black outline-none ${theme.input}`}
              >
                <option>회원</option>
                <option>본사 관계자</option>
                <option>본사 관리자</option>
                <option>슈퍼페이지 관리자</option>
              </select>
              <button
                onClick={() => notify(`${selectedOpsUser.nickname} 정보 수정 화면`)}
                className={`rounded-2xl border px-4 py-2 text-sm font-black ${theme.input}`}
              >
                정보 수정
              </button>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-3">
              <input
                value={selectedOpsUser.stage_label || ""}
                onChange={(e) =>
                  setAuthUsers((prev) =>
                    prev.map((user) => (String(user.id) === String(selectedOpsUser.id) ? { ...user, stage_label: e.target.value } : user))
                  )
                }
                placeholder="현재 단계 (예: LEVEL 1)"
                className={`rounded-2xl border px-3 py-2 text-sm font-bold outline-none ${theme.input}`}
              />
              <input
                value={selectedOpsUser.parent_user_ref || ""}
                onChange={(e) =>
                  setAuthUsers((prev) =>
                    prev.map((user) => (String(user.id) === String(selectedOpsUser.id) ? { ...user, parent_user_ref: e.target.value } : user))
                  )
                }
                placeholder="상위 관리자/회원 ID"
                className={`rounded-2xl border px-3 py-2 text-sm font-bold outline-none ${theme.input}`}
              />
              <label className={`flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-black ${theme.input}`}>
                <input
                  type="checkbox"
                  checked={Boolean(selectedOpsUser.admin_assigned)}
                  onChange={(e) =>
                    setAuthUsers((prev) =>
                      prev.map((user) =>
                        String(user.id) === String(selectedOpsUser.id) ? { ...user, admin_assigned: e.target.checked } : user
                      )
                    )
                  }
                />
                관리자 지정
              </label>
            </div>
            <button
              onClick={async () => {
                const ok = await updateAuthProfile(selectedOpsUser.id, {
                  stageLabel: selectedOpsUser.stage_label || "",
                  parentUserRef: selectedOpsUser.parent_user_ref || "",
                  adminAssigned: Boolean(selectedOpsUser.admin_assigned),
                });
                if (ok) notify("회원 단계/관리자 지정 정보가 저장되었습니다.");
              }}
              className={`mt-2 rounded-2xl px-4 py-2 text-sm font-black ${theme.main}`}
            >
              단계/관리자 지정 저장
            </button>
            <div className="mt-3 rounded-2xl border p-3">
              <div className="mb-2 text-xs font-black">판매자 입금자명 공지</div>
              <textarea
                value={sellerDepositNotice}
                onChange={(e) => setSellerDepositNotice(e.target.value)}
                className={`min-h-20 w-full rounded-xl border px-3 py-2 text-xs font-bold outline-none ${theme.input}`}
              />
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => {
                    appendAdminAction?.("판매자 입금자명 확인 공지 수정");
                    notify("판매자 공지 문구가 업데이트되었습니다.");
                  }}
                  className={`rounded-xl px-3 py-2 text-xs font-black ${theme.main}`}
                >
                  공지 저장
                </button>
                <button
                  onClick={() => {
                    setAdminViewTab("ops");
                    notify("감사/복구 탭으로 이동합니다.");
                  }}
                  className={`rounded-xl border px-3 py-2 text-xs font-black ${theme.input}`}
                >
                  로그 보기
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className={`text-sm ${theme.subtext}`}>왼쪽에서 운영 대상을 선택하세요.</div>
        )}
      </div>
    </div>
  );
}
