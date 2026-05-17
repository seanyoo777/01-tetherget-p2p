/** Emergency Response Playbook (mock-only, operational). */

export type EmergencyPlaybookVerdict = "pass" | "warn" | "fail";

export interface EmergencyEscrowState {
  level: EmergencyPlaybookVerdict;
  label: string;
  openEscrowCount: number;
  releaseBlockedCount: number;
  mockOnly: true;
}

export interface EmergencyDisputeSpikeWarning {
  level: EmergencyPlaybookVerdict;
  activeCount: number;
  ratioPct: number;
  spikeDetected: boolean;
  message: string;
  mockOnly: true;
}

export interface EmergencyReleaseBlockMode {
  active: boolean;
  level: EmergencyPlaybookVerdict;
  blockedCaseCount: number;
  reason: string;
  mockOnly: true;
}

export interface EmergencyNotificationPressure {
  level: EmergencyPlaybookVerdict;
  unreadCount: number;
  disputeRelatedCount: number;
  mockOnly: true;
}

export interface EmergencyOperatorChecklistItem {
  id: string;
  label: string;
  required: boolean;
  completed: boolean;
  mockOnly: true;
}

export interface EmergencyMockActionLogEntry {
  id: string;
  actionId: string;
  label: string;
  operatorId: string;
  detail: Record<string, unknown>;
  at: number;
  mockOnly: true;
}

export interface EmergencyPlaybookHealthRef {
  overviewVerdict: EmergencyPlaybookVerdict;
  openEscrowCount: number;
  mockOnly: true;
}

export interface EmergencyPlaybookRiskRef {
  escrowGuardStatus: EmergencyPlaybookVerdict;
  blockedCaseCount: number;
  mockOnly: true;
}

export interface EmergencyPlaybookSnapshot {
  escrowEmergencyState: EmergencyEscrowState;
  disputeSpikeWarning: EmergencyDisputeSpikeWarning;
  releaseBlockEmergencyMode: EmergencyReleaseBlockMode;
  notificationPressure: EmergencyNotificationPressure;
  operatorChecklist: EmergencyOperatorChecklistItem[];
  mockEmergencyActionLog: EmergencyMockActionLogEntry[];
  escrowHealthRef: EmergencyPlaybookHealthRef;
  riskGuardRef: EmergencyPlaybookRiskRef;
  overviewVerdict: EmergencyPlaybookVerdict;
  lastChecked: number;
  mockOnly: true;
}
