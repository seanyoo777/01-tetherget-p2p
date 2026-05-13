import React from "react";

/** `memberOps` 두 번째 블록(관리 메모) — 두 번째 `AdminSectionBoundary`(`admin-tab-memberOps`)는 `App.jsx`에서 유지. */
export function MemberOpsMemoPanel(props) {
  const { theme, visible, Field, adminMemo, setAdminMemo } = props;

  return (
    <div className={visible ? "" : "hidden"}>
      <Field label="관리 메모" theme={theme}>
        <textarea value={adminMemo} onChange={(e) => setAdminMemo(e.target.value)} className={`min-h-24 rounded-2xl border px-4 py-3 font-bold outline-none ${theme.input}`} placeholder="관리자 메모" />
      </Field>
    </div>
  );
}
