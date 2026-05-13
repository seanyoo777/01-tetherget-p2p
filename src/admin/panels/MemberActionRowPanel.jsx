import React from "react";

/** `member` 오른쪽 열 — **하부 N명 보기** / **정보 수정** 버튼 한 행. `AdminSectionBoundary`·2열 래퍼는 `App.jsx`에 유지. */
export function MemberActionRowPanel(props) {
  const { theme, selectedChildren, notify, directDownlineListRef, monitorCurrentUser } = props;

  return (
    <div className="mt-2 grid gap-1.5 md:grid-cols-2">
      <button
        type="button"
        onClick={() => {
          if (!selectedChildren.length) {
            notify("등록된 하부가 없습니다.");
            return;
          }
          directDownlineListRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }}
        className={`rounded-xl px-3 py-2.5 text-sm font-black ${theme.main}`}
      >
        하부 {selectedChildren.length}명 보기
      </button>
      <button
        onClick={() => notify(`${monitorCurrentUser.nickname} 닉네임/정보 수정 화면`)}
        className={`rounded-xl border px-3 py-2.5 text-sm font-black ${theme.input}`}
      >
        정보 수정
      </button>
    </div>
  );
}
