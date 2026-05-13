import React from "react";

/** `memberOps` 세 번째 블록(첨부/음성 메시지 모니터링) — 세 번째 `AdminSectionBoundary`(`admin-tab-memberOps`)는 `App.jsx`에서 유지. */
export function MemberOpsMediaPanel(props) {
  const {
    theme,
    visible,
    adminMediaTypeFilter,
    setAdminMediaTypeFilter,
    appendAdminAction,
    adminMediaFriendFilter,
    setAdminMediaFriendFilter,
    friends,
    totalMediaCount,
    fileMediaCount,
    voiceMediaCount,
    filteredMediaEvents,
    isRiskyFileName,
  } = props;

  return (
    <div className={`${visible ? "" : "hidden "}mt-5 rounded-3xl border p-5 ${theme.card}`}>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-xl font-black">첨부/음성 메시지 모니터링</div>
          <div className={`text-sm ${theme.subtext}`}>친구 채팅방에서 오간 첨부파일과 음성 메시지를 관리자에서 추적합니다.</div>
        </div>
        <span className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-black text-white">{totalMediaCount}건</span>
      </div>
      <div className="mb-3 grid gap-2 md:grid-cols-2">
        <select
          value={adminMediaTypeFilter}
          onChange={(e) => {
            setAdminMediaTypeFilter(e.target.value);
            appendAdminAction?.(`미디어 타입 필터 변경: ${e.target.value}`);
          }}
          className={`rounded-2xl border px-3 py-2 text-sm font-black outline-none ${theme.input}`}
        >
          <option>전체</option>
          <option>첨부파일</option>
          <option>음성</option>
        </select>
        <select
          value={adminMediaFriendFilter}
          onChange={(e) => {
            setAdminMediaFriendFilter(e.target.value);
            appendAdminAction?.(`친구 필터 변경: ${e.target.value}`);
          }}
          className={`rounded-2xl border px-3 py-2 text-sm font-black outline-none ${theme.input}`}
        >
          <option value="전체">전체 친구</option>
          {(friends || []).map((friend) => (
            <option key={friend.id} value={friend.id}>
              {friend.nickname} ({friend.id})
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <div className={`rounded-2xl p-3 ${theme.cardSoft}`}>
          <div className={theme.muted}>전체 첨부</div>
          <div className="mt-1 text-xl font-black">{totalMediaCount}</div>
        </div>
        <div className={`rounded-2xl p-3 ${theme.cardSoft}`}>
          <div className={theme.muted}>일반 첨부</div>
          <div className="mt-1 text-xl font-black">{fileMediaCount}</div>
        </div>
        <div className={`rounded-2xl p-3 ${theme.cardSoft}`}>
          <div className={theme.muted}>음성 메시지</div>
          <div className="mt-1 text-xl font-black">{voiceMediaCount}</div>
        </div>
      </div>
      <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
        {filteredMediaEvents.length ? (
          filteredMediaEvents.slice().reverse().map((item) => (
            <div key={item.id} className={`rounded-2xl border p-3 text-sm ${theme.input}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="font-black">{item.friendName} ({item.friendId})</div>
                <span className={`rounded-full px-2 py-0.5 text-xs font-black ${item.isVoice ? "bg-violet-600 text-white" : "bg-blue-600 text-white"}`}>
                  {item.isVoice ? "음성" : "첨부"}
                </span>
              </div>
              <div className={`mt-1 text-xs ${isRiskyFileName(item.fileName) ? "font-black text-red-500" : theme.muted}`}>
                {item.fileName}
                {isRiskyFileName(item.fileName) ? " · 위험 파일명 의심" : ""}
              </div>
              <div className={`mt-1 text-xs ${theme.muted}`}>{item.fileType} · {item.sender === "me" ? "내 전송" : "상대 전송"} · {item.createdAt}</div>
            </div>
          ))
        ) : (
          <div className={`rounded-2xl border p-3 text-sm ${theme.input}`}>아직 수집된 첨부/음성 이벤트가 없습니다.</div>
        )}
      </div>
    </div>
  );
}
