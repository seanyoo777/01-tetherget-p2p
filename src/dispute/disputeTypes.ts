/** P2P dispute / escrow case types (mock-only). */

export const DISPUTE_TYPES = [
  "payment_not_received",
  "fake_receipt",
  "delayed_release",
  "suspicious_activity",
  "scam_report",
  "bank_issue",
  "wallet_issue",
  "manual_review",
] as const;

export type DisputeType = (typeof DISPUTE_TYPES)[number];

export const DISPUTE_STATUSES = [
  "opened",
  "reviewing",
  "waiting_evidence",
  "resolved_mock",
  "rejected_mock",
  "escalated",
] as const;

export type DisputeStatus = (typeof DISPUTE_STATUSES)[number];

export const DISPUTE_PRIORITIES = ["low", "normal", "high", "critical"] as const;
export type DisputePriority = (typeof DISPUTE_PRIORITIES)[number];

export const DISPUTE_EVIDENCE_TYPES = [
  "receipt_image",
  "bank_transfer",
  "wallet_tx",
  "chat_capture",
  "id_verification",
] as const;

export type DisputeEvidenceType = (typeof DISPUTE_EVIDENCE_TYPES)[number];

export const ESCROW_CASE_STATUSES = [
  "escrow_pending",
  "escrow_locked",
  "release_waiting",
  "dispute_opened",
  "manual_hold",
] as const;

export type EscrowCaseStatus = (typeof ESCROW_CASE_STATUSES)[number];

export interface DisputeEvidence {
  id: string;
  type: DisputeEvidenceType;
  fileNameMock: string;
  uploadedAt: number;
  note: string;
  mockOnly: true;
}

export interface OperatorNote {
  id: string;
  authorId: string;
  body: string;
  at: number;
  mockOnly: true;
}

export interface P2PDisputeCase {
  caseId: string;
  orderId: string;
  buyerId: string;
  sellerId: string;
  disputeType: DisputeType;
  status: DisputeStatus;
  priority: DisputePriority;
  evidenceItems: DisputeEvidence[];
  operatorNotes: OperatorNote[];
  escrowStatus: EscrowCaseStatus;
  releaseBlocked: boolean;
  suspiciousBuyer: boolean;
  suspiciousSeller: boolean;
  createdAt: number;
  updatedAt: number;
  mockOnly: true;
}

export interface DisputeAuditEntry {
  id: string;
  event: string;
  caseId: string;
  detail: Record<string, unknown>;
  at: number;
  mockOnly: true;
}

export interface DisputeNotification {
  id: string;
  kind: string;
  title: string;
  body: string;
  caseId?: string;
  at: number;
  mockOnly: true;
}
