import React from "react";

/** `member` 오른쪽 열 — 접근성용 **숨김** Field 묶음 (`className="hidden"`). `Field`는 `App.jsx` 정의를 props로 전달. */
export function MemberHiddenFieldsPanel(props) {
  const {
    Field,
    theme,
    adminMember,
    setAdminMember,
    adminParent,
    setAdminParent,
    adminReceivedRate,
    setAdminReceivedRate,
    adminRate,
    setAdminRate,
  } = props;

  return (
    <div className="hidden">
      <Field label="대상 회원 ID / 지갑 / 이메일" theme={theme}>
        <input value={adminMember} onChange={(e) => setAdminMember(e.target.value)} className={`rounded-2xl border px-4 py-3 font-bold outline-none ${theme.input}`} placeholder="예: TG-MEMBER-001" />
      </Field>
      <Field label="상위 회원 / 추천인 / 레벨 관리자 ID" theme={theme}>
        <input value={adminParent} onChange={(e) => setAdminParent(e.target.value)} className={`rounded-2xl border px-4 py-3 font-bold outline-none ${theme.input}`} placeholder="예: TG777" />
      </Field>
      <Field label="상위자가 받은 배분율 (%)" theme={theme}>
        <input value={adminReceivedRate} onChange={(e) => setAdminReceivedRate(e.target.value)} className={`rounded-2xl border px-4 py-3 font-bold outline-none ${theme.input}`} placeholder="예: 50" />
      </Field>
      <Field label="하위에게 내려줄 배분율 (%)" theme={theme}>
        <input value={adminRate} onChange={(e) => setAdminRate(e.target.value)} className={`rounded-2xl border px-4 py-3 font-bold outline-none ${theme.input}`} placeholder="예: 45" />
      </Field>
    </div>
  );
}
