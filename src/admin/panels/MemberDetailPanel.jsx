import React from "react";

/** `member` 탭 오른쪽 열 — 하부 트리·단계 블록 다음의 **선택 회원 요약**(DetailBox 그리드). `memberTreeSectionRef` 2열 래퍼·`AdminSectionBoundary`는 `App.jsx`에서 유지. */
export function MemberDetailPanel(props) {
  const {
    theme,
    DetailBox,
    monitorCurrentUser,
    getEffectiveStage,
    getEffectiveParent,
    isAdminAssignedUser,
    formatNumber,
  } = props;

  return (
    <div className="mt-2 grid gap-2 text-sm md:grid-cols-2">
      <DetailBox label="닉네임" value={monitorCurrentUser?.nickname || "-"} theme={theme} />
      <DetailBox label="회원 ID" value={monitorCurrentUser?.id || "-"} theme={theme} />
      <DetailBox label="이메일" value={monitorCurrentUser?.email || "-"} theme={theme} />
      <DetailBox label="지갑" value={monitorCurrentUser?.wallet || "-"} theme={theme} />
      <DetailBox label="상위" value={getEffectiveParent(monitorCurrentUser)} theme={theme} />
      <DetailBox label="가입일" value={monitorCurrentUser?.joined || "-"} theme={theme} />
      <DetailBox label="현재 단계" value={getEffectiveStage(monitorCurrentUser)} theme={theme} />
      <DetailBox label="관리자 지정" value={isAdminAssignedUser(monitorCurrentUser) ? "지정됨" : "미지정"} theme={theme} />
      <DetailBox label="누적 거래" value={`${formatNumber(monitorCurrentUser?.trades || 0)}건`} theme={theme} />
      <DetailBox label="누적 거래액" value={`$${formatNumber(monitorCurrentUser?.volume || 0)}`} theme={theme} />
    </div>
  );
}
