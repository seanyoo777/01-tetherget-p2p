import React from "react";

/** `member` 오른쪽 열 — 단계 변경 확인 카드. `stageConfirmOpen && monitorCurrentUser` 조건은 `App.jsx`에서 유지. */
export function MemberStageConfirmPanel(props) {
  const {
    theme,
    monitorCurrentUser,
    stageConfirmFromStage,
    stageConfirmTarget,
    adminStageDisplayName,
    onCancel,
    onConfirm,
  } = props;

  return (
    <div className="mt-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3">
      <div className="text-sm font-black">단계 변경 확인</div>
      <div className="mt-2 text-sm leading-relaxed">
        <span className="font-bold">{monitorCurrentUser.nickname}</span>을(를){" "}
        <span className="font-black text-amber-200">{adminStageDisplayName(stageConfirmFromStage)}</span>에서{" "}
        <span className="font-black text-amber-200">{adminStageDisplayName(stageConfirmTarget)}</span>
        로 변경하시겠습니까?
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={onCancel} className={`rounded-xl border px-4 py-2 text-sm font-black ${theme.input}`}>
          취소
        </button>
        <button type="button" onClick={() => void onConfirm()} className={`rounded-xl px-4 py-2 text-sm font-black ${theme.main}`}>
          확인
        </button>
      </div>
    </div>
  );
}
