/** JS-friendly constants for JSX (mirrors disputeTypes.ts). */
export const DISPUTE_STATUSES = [
  "opened",
  "reviewing",
  "waiting_evidence",
  "resolved_mock",
  "rejected_mock",
  "escalated",
];

export const DISPUTE_PRIORITIES = ["low", "normal", "high", "critical"];

export const DISPUTE_TYPES = [
  "payment_not_received",
  "fake_receipt",
  "delayed_release",
  "suspicious_activity",
  "scam_report",
  "bank_issue",
  "wallet_issue",
  "manual_review",
];

export const DISPUTE_EVIDENCE_TYPES = [
  "receipt_image",
  "bank_transfer",
  "wallet_tx",
  "chat_capture",
  "id_verification",
];
