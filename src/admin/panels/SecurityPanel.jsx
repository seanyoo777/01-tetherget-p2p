import React from "react";

/** `security` 탭 본문(그리드) — `AdminSectionBoundary`는 `App.jsx`에서 그대로 감쌈. */
export function SecurityPanel({
  theme,
  visible,
  lang,
  securityFilter,
  setSecurityFilter,
  securityUsers,
  selectedSecurityUser,
  setSelectedSecurityUserId,
  blockReason,
  setBlockReason,
  notify,
  Field,
  Admin,
  DetailBox,
}) {
  return (
    <div className={`${visible ? "" : "hidden "}mt-5 grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]`}>
      <div className={`rounded-3xl border p-4 ${theme.card}`}>
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-black">{lang.riskMonitor}</div>
          <span className={`rounded-full px-2 py-1 text-[11px] font-black ${theme.input}`}>{securityUsers.length}명</span>
        </div>
        <select
          value={securityFilter}
          onChange={(e) => setSecurityFilter(e.target.value)}
          className={`mb-3 w-full rounded-2xl border px-3 py-2 text-xs font-black outline-none ${theme.input}`}
        >
          <option>전체</option>
          <option>주의</option>
          <option>신고</option>
          <option>블랙</option>
        </select>
        <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
          {securityUsers.map((user) => {
            const rowSel = String(selectedSecurityUser?.id) === String(user.id);
            const subCls = rowSel ? theme.mutedOnMain ?? theme.muted : theme.muted;
            return (
              <button
                key={user.id}
                type="button"
                onClick={() => setSelectedSecurityUserId(user.id)}
                className={`w-full rounded-2xl border p-3 text-left text-xs ${rowSel ? theme.main : theme.input}`}
              >
                <div className="font-black">{user.nickname}</div>
                <div className={`mt-1 ${subCls}`}>
                  {user.id} · 위험 {user.riskScore}
                </div>
                <div className={`mt-1 ${subCls}`}>
                  신고 {user.reports}건 · 블랙 {user.blacklist ? "Y" : "N"}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className={`rounded-3xl border p-4 ${theme.card}`}>
        {selectedSecurityUser ? (
          <>
            <div className="grid gap-2 md:grid-cols-3">
              <Admin title="위험 점수" value={selectedSecurityUser.riskScore} sub={selectedSecurityUser.blacklist ? "블랙리스트" : "모니터링"} theme={theme} />
              <Admin title="신고 건수" value={selectedSecurityUser.reports} sub="누적 신고" theme={theme} />
              <Admin title="최근 접속" value={selectedSecurityUser.lastLogin} sub={selectedSecurityUser.country} theme={theme} />
            </div>
            <div className="mt-3 grid gap-2 text-xs md:grid-cols-2">
              <DetailBox label="회원" value={`${selectedSecurityUser.nickname} (${selectedSecurityUser.id})`} theme={theme} />
              <DetailBox label="디바이스" value={selectedSecurityUser.device} theme={theme} />
              <DetailBox label="IP" value={selectedSecurityUser.ip} theme={theme} />
              <DetailBox label="전화번호" value={selectedSecurityUser.phone} theme={theme} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => notify(`${selectedSecurityUser.nickname} 거래 일시정지`)} className="rounded-xl bg-amber-500 px-3 py-2 text-xs font-black text-white">거래정지</button>
              <button onClick={() => notify(`${selectedSecurityUser.nickname} 블랙리스트 등록`)} className="rounded-xl bg-red-600 px-3 py-2 text-xs font-black text-white">블랙등록</button>
              <button onClick={() => notify(`${selectedSecurityUser.nickname} IP 추적 조회`)} className={`rounded-xl border px-3 py-2 text-xs font-black ${theme.input}`}>IP분석</button>
              <button onClick={() => notify(`${selectedSecurityUser.nickname} 다중계정 분석`)} className={`rounded-xl border px-3 py-2 text-xs font-black ${theme.input}`}>다중계정</button>
            </div>
            <Field label="차단 사유 메모" theme={theme}>
              <textarea
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
                className={`min-h-20 rounded-2xl border px-3 py-2 text-sm font-bold outline-none ${theme.input}`}
              />
            </Field>
          </>
        ) : (
          <div className={`text-sm ${theme.subtext}`}>왼쪽에서 보안 모니터링 유저를 선택하세요.</div>
        )}
      </div>
    </div>
  );
}
