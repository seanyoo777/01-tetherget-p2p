import React from "react";

/** `member` 오른쪽 선택 영역 — `monitorCurrentUser` 없을 때 미선택 안내. 삼항 분기는 `App.jsx`에서 유지. */
export function MemberEmptySelectionPanel({ theme, lang }) {
  return (
    <div className={`mt-3 text-sm ${theme.subtext}`}>{lang.memberEmptySelectionHint}</div>
  );
}
