export const DISPUTE_AUDIT_EVENT = {
  CASE_CREATED: "dispute.case.created",
  EVIDENCE_UPLOADED_MOCK: "dispute.evidence.uploaded_mock",
  OPERATOR_REVIEW_STARTED: "dispute.operator.review_started",
  CASE_RESOLVED_MOCK: "dispute.case.resolved_mock",
  CASE_REJECTED_MOCK: "dispute.case.rejected_mock",
  ESCROW_RELEASE_BLOCKED_MOCK: "escrow.release.blocked_mock",
};

export function appendDisputeAudit(trail, event, caseId, detail = {}) {
  const entry = {
    id: `DA-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    event,
    caseId,
    detail: { ...detail, _mock: true },
    at: Date.now(),
    mockOnly: true,
  };
  return [entry, ...(Array.isArray(trail) ? trail : [])].slice(0, 200);
}
