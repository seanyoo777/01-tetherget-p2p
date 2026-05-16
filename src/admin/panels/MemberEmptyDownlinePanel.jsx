import React from "react";

/** `member` 오른쪽 열 — 직계 하부가 없을 때 **등록된 하부가 없습니다** 안내. `selectedChildren.length === 0` 조건은 `App.jsx`에서 유지. */
export function MemberEmptyDownlinePanel(props) {
  const { theme } = props;

  return (
    <div className={`mt-1 rounded-xl border px-3 py-2 text-xs ${theme.input}`}>등록된 하부가 없습니다.</div>
  );
}
