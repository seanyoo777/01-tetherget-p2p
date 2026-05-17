import React from "react";
import { RISK_GUARD_TEST_IDS } from "../../risk/riskGuardTestIds.js";
import { RiskStatusBadge } from "./RiskStatusBadge.jsx";

export function RiskIssueList({ issues = [], theme }) {
  if (!issues.length) {
    return <p className={`text-[10px] ${theme?.muted || ""}`}>이슈 없음 (PASS)</p>;
  }
  return (
    <ul data-testid={RISK_GUARD_TEST_IDS.issueList} className="space-y-1">
      {issues.map((row) => (
        <li
          key={`${row.code}-${row.message}`}
          className={`flex flex-wrap items-center gap-2 rounded-lg border px-2 py-1 text-[10px] ${theme?.card || ""}`}
        >
          <RiskStatusBadge status={row.level} compact />
          <span className="font-mono opacity-70">{row.code}</span>
          <span>{row.message}</span>
        </li>
      ))}
    </ul>
  );
}
