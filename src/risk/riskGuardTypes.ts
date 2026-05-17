/** Admin Risk Guard / Escrow Release Guard (mock-only). */

export const RISK_GUARD_LEVELS = ["pass", "warn", "fail"] as const;
export type RiskGuardLevel = (typeof RISK_GUARD_LEVELS)[number];

export const RISK_GUARD_ISSUE_CODES = [
  "release_blocked",
  "dispute_opened",
  "manual_hold",
  "suspicious_buyer",
  "suspicious_seller",
  "critical_priority",
  "escrow_dispute_hold",
] as const;

export type RiskGuardIssueCode = (typeof RISK_GUARD_ISSUE_CODES)[number];

export interface RiskGuardIssue {
  code: RiskGuardIssueCode;
  level: RiskGuardLevel;
  message: string;
  mockOnly: true;
}

export interface EscrowReleaseGuardSnapshot {
  status: RiskGuardLevel;
  releaseBlocked: boolean;
  canMockRelease: boolean;
  issues: RiskGuardIssue[];
  blockReasons: string[];
  caseId?: string;
  orderId?: string;
  escrowStatus?: string;
  lastChecked: number;
  mockOnly: true;
}

export interface RiskGuardDiagnostics {
  escrowGuardStatus: RiskGuardLevel;
  issueCount: number;
  blockedCaseCount: number;
  suspiciousWarnCount: number;
  suspiciousFailCount: number;
  lastChecked: number;
  mockOnly: true;
}
