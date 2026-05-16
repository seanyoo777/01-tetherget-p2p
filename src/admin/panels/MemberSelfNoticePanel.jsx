import React from "react";

/** `member` 오른쪽 열 — 본인 계정 선택 시 안내. `isSelfTargetMember` 조건은 `App.jsx`에서 유지. */
export function MemberSelfNoticePanel(props) {
  const { theme } = props;

  return (
    <div className={`mt-1 rounded-xl border px-3 py-2 text-xs ${theme.input}`}>
      현재 선택한 회원은 본인 계정입니다. 본인 상태는 변경할 수 없고 하위 회원만 변경 가능합니다.
    </div>
  );
}
