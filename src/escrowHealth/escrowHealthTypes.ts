/** Escrow Health Overview (mock-only, operational aggregate). */

export type EscrowHealthVerdict = "pass" | "warn" | "fail";

export interface EscrowHealthPressure {
  level: EscrowHealthVerdict;
  label: string;
  activeCount: number;
  totalCount: number;
  ratioPct: number;
  mockOnly: true;
}

export interface EscrowHealthRiskGuardSummary {
  escrowGuardStatus: EscrowHealthVerdict;
  issueCount: number;
  blockedCaseCount: number;
  suspiciousWarnCount: number;
  suspiciousFailCount: number;
  lastChecked: number;
  mockOnly: true;
}

export interface EscrowHealthNotificationPressure {
  level: EscrowHealthVerdict;
  unreadCount: number;
  disputeRelatedCount: number;
  escrowRelatedCount: number;
  recentActivityCount: number;
  mockOnly: true;
}

export interface EscrowHealthDiagnosticsVerdict {
  level: EscrowHealthVerdict;
  validationOk: boolean;
  uteIssueCount: number;
  riskGuardStatus: EscrowHealthVerdict;
  selfTestCoreOverall: string | null;
  mockOnly: true;
}

export interface EscrowHealthAdminSelfTestRef {
  status: EscrowHealthVerdict;
  issueCount: number;
  lastChecked: number | null;
  coreOverall: string | null;
  mockOnly: true;
}

export interface EscrowHealthDisputeTrendRow {
  status: string;
  count: number;
  mockOnly: true;
}

export interface EscrowHealthSnapshot {
  openEscrowCount: number;
  disputePressure: EscrowHealthPressure;
  releaseBlockedCount: number;
  riskGuardSummary: EscrowHealthRiskGuardSummary;
  notificationPressure: EscrowHealthNotificationPressure;
  diagnosticsVerdict: EscrowHealthDiagnosticsVerdict;
  adminSelfTestRef: EscrowHealthAdminSelfTestRef;
  disputeTrend: EscrowHealthDisputeTrendRow[];
  overviewVerdict: EscrowHealthVerdict;
  lastChecked: number;
  mockOnly: true;
}
