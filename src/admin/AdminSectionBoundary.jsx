import React from "react";
import { AdminErrorBoundary } from "./AdminErrorBoundary.jsx";

/**
 * AdminReferralPanel 등 대형 패널 내부의 **탭 단위** 격리용.
 * 한 섹션에서 런타임 예외가 나도 나머지 탭·셸 네비는 유지된다.
 *
 * @param {object} props
 * @param {object} [props.theme]
 * @param {string} [props.sectionId] — 로그/문서용 짧은 id (예: audit-tab)
 * @param {string} [props.sectionLabel] — 오류 카드에 표시할 한글 라벨
 */
export function AdminSectionBoundary({ theme, sectionId, sectionLabel, children }) {
  const label = sectionLabel || sectionId || "section";
  return (
    <AdminErrorBoundary theme={theme} sectionLabel={label}>
      {children}
    </AdminErrorBoundary>
  );
}
