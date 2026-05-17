import { appendDisputeAudit, DISPUTE_AUDIT_EVENT } from "./disputeAudit.js";
import {
  bridgeAdminCaseResolvedMock,
  bridgeAdminReviewStarted,
  bridgeDisputeCaseCreated,
  bridgeDisputeEvidenceRequired,
} from "../notifications/notificationHelpers.js";
import { recordReleaseBlockReason, syncGuardAfterDisputeFinalize } from "../risk/riskGuardHelpers.js";
import {
  loadDisputeAuditTrail,
  loadDisputeCases,
  loadDisputeNotifications,
  persistDisputeStoreSnapshot,
  saveDisputeAuditTrail,
  saveDisputeCases,
  saveDisputeNotifications,
} from "./disputeStore.js";

export function generateCaseId() {
  return `DSP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export function inferPriority(disputeType) {
  if (disputeType === "scam_report" || disputeType === "suspicious_activity") return "critical";
  if (disputeType === "fake_receipt" || disputeType === "payment_not_received") return "high";
  return "normal";
}

export function mapOrderToEscrowStatus(orderStatus, hasDispute) {
  if (hasDispute) return "dispute_opened";
  const st = String(orderStatus || "").toLowerCase();
  if (st === "listed") return "escrow_pending";
  if (st === "matched") return "escrow_locked";
  if (st === "payment_sent") return "release_waiting";
  if (st === "completed") return "release_waiting";
  return "escrow_locked";
}

export function isReleaseBlocked(caseRow) {
  if (!caseRow) return false;
  if (caseRow.status === "resolved_mock" || caseRow.status === "rejected_mock") return false;
  if (caseRow.releaseBlocked === false) return false;
  return (
    caseRow.releaseBlocked ||
    caseRow.escrowStatus === "dispute_opened" ||
    caseRow.escrowStatus === "manual_hold"
  );
}

function pushNotification(items, kind, title, body, caseId) {
  const row = {
    id: `DN-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    kind,
    title,
    body,
    caseId,
    at: Date.now(),
    mockOnly: true,
  };
  return [row, ...items].slice(0, 100);
}

export function createDisputeCase(input) {
  const now = Date.now();
  const escrowStatus = "dispute_opened";
  const caseRow = {
    caseId: generateCaseId(),
    orderId: input.orderId,
    buyerId: input.buyerId,
    sellerId: input.sellerId,
    disputeType: input.disputeType,
    status: "opened",
    priority: inferPriority(input.disputeType),
    evidenceItems: [],
    operatorNotes: [],
    escrowStatus,
    releaseBlocked: true,
    suspiciousBuyer: Boolean(input.suspiciousBuyer),
    suspiciousSeller: Boolean(input.suspiciousSeller),
    createdAt: now,
    updatedAt: now,
    mockOnly: true,
  };

  const cases = [caseRow, ...loadDisputeCases()];
  let audit = appendDisputeAudit(loadDisputeAuditTrail(), DISPUTE_AUDIT_EVENT.CASE_CREATED, caseRow.caseId, {
    orderId: caseRow.orderId,
    disputeType: caseRow.disputeType,
  });
  audit = appendDisputeAudit(audit, DISPUTE_AUDIT_EVENT.ESCROW_RELEASE_BLOCKED_MOCK, caseRow.caseId, {
    escrowStatus,
  });

  let notifications = loadDisputeNotifications();
  notifications = pushNotification(
    notifications,
    "dispute_opened",
    "분쟁 접수 (mock)",
    `주문 ${caseRow.orderId} 분쟁이 접수되었습니다.`,
    caseRow.caseId,
  );
  if (caseRow.priority === "critical" || caseRow.suspiciousBuyer || caseRow.suspiciousSeller) {
    notifications = pushNotification(
      notifications,
      "suspicious_activity",
      "위험 거래 플래그",
      "의심 활동이 감지되었습니다. 운영 검토가 필요합니다.",
      caseRow.caseId,
    );
  }
  notifications = pushNotification(
    notifications,
    "escrow_locked",
    "Escrow 잠금 (mock)",
    "분쟁으로 릴리스가 차단되었습니다.",
    caseRow.caseId,
  );

  saveDisputeCases(cases);
  saveDisputeAuditTrail(audit);
  saveDisputeNotifications(notifications);
  bridgeDisputeCaseCreated(caseRow);
  recordReleaseBlockReason(caseRow, "dispute_opened");
  return caseRow;
}

export function addMockEvidence(caseId, type, fileNameMock, note = "") {
  const cases = loadDisputeCases();
  const idx = cases.findIndex((c) => c.caseId === caseId);
  if (idx < 0) return null;
  const evidence = {
    id: `EV-${Date.now()}`,
    type,
    fileNameMock,
    uploadedAt: Date.now(),
    note,
    mockOnly: true,
  };
  const next = {
    ...cases[idx],
    evidenceItems: [evidence, ...cases[idx].evidenceItems],
    status: cases[idx].status === "opened" ? "waiting_evidence" : cases[idx].status,
    updatedAt: Date.now(),
  };
  cases[idx] = next;
  const audit = appendDisputeAudit(
    loadDisputeAuditTrail(),
    DISPUTE_AUDIT_EVENT.EVIDENCE_UPLOADED_MOCK,
    caseId,
    { type, fileNameMock },
  );
  const notifications = pushNotification(
    loadDisputeNotifications(),
    "evidence_required",
    "증빙 등록 (mock)",
    `${fileNameMock} 가 등록되었습니다.`,
    caseId,
  );
  saveDisputeCases(cases);
  saveDisputeAuditTrail(audit);
  saveDisputeNotifications(notifications);
  bridgeDisputeEvidenceRequired(caseId, fileNameMock);
  return next;
}

export function startOperatorReview(caseId, operatorId, note) {
  const cases = loadDisputeCases();
  const idx = cases.findIndex((c) => c.caseId === caseId);
  if (idx < 0) return null;
  const opNote = {
    id: `ON-${Date.now()}`,
    authorId: operatorId,
    body: note,
    at: Date.now(),
    mockOnly: true,
  };
  const next = {
    ...cases[idx],
    status: "reviewing",
    operatorNotes: [opNote, ...cases[idx].operatorNotes],
    updatedAt: Date.now(),
  };
  cases[idx] = next;
  const audit = appendDisputeAudit(
    loadDisputeAuditTrail(),
    DISPUTE_AUDIT_EVENT.OPERATOR_REVIEW_STARTED,
    caseId,
    { operatorId },
  );
  const notifications = pushNotification(
    loadDisputeNotifications(),
    "operator_review",
    "운영 검토 시작",
    "관리자가 케이스 검토를 시작했습니다.",
    caseId,
  );
  saveDisputeCases(cases);
  saveDisputeAuditTrail(audit);
  saveDisputeNotifications(notifications);
  bridgeAdminReviewStarted(caseId, operatorId);
  return next;
}

export function resolveDisputeMock(caseId, operatorId, note) {
  return finalizeDispute(caseId, "resolved_mock", DISPUTE_AUDIT_EVENT.CASE_RESOLVED_MOCK, operatorId, note);
}

export function rejectDisputeMock(caseId, operatorId, note) {
  return finalizeDispute(caseId, "rejected_mock", DISPUTE_AUDIT_EVENT.CASE_REJECTED_MOCK, operatorId, note);
}

function finalizeDispute(caseId, status, auditEvent, operatorId, note) {
  const cases = loadDisputeCases();
  const idx = cases.findIndex((c) => c.caseId === caseId);
  if (idx < 0) return null;
  const opNote = {
    id: `ON-${Date.now()}`,
    authorId: operatorId,
    body: note,
    at: Date.now(),
    mockOnly: true,
  };
  const next = {
    ...cases[idx],
    status,
    releaseBlocked: false,
    escrowStatus: status === "resolved_mock" ? "manual_hold" : "escrow_locked",
    operatorNotes: [opNote, ...cases[idx].operatorNotes],
    updatedAt: Date.now(),
  };
  cases[idx] = next;
  const audit = appendDisputeAudit(loadDisputeAuditTrail(), auditEvent, caseId, { operatorId, status });
  saveDisputeCases(cases);
  saveDisputeAuditTrail(audit);
  bridgeAdminCaseResolvedMock(caseId, status, operatorId);
  syncGuardAfterDisputeFinalize(next, operatorId, status);
  return next;
}

export function syncCaseEscrowFromOrder(caseId, orderStatus) {
  const cases = loadDisputeCases();
  const idx = cases.findIndex((c) => c.caseId === caseId);
  if (idx < 0) return null;
  const row = cases[idx];
  const escrowStatus = mapOrderToEscrowStatus(orderStatus, row.status !== "resolved_mock" && row.status !== "rejected_mock");
  const next = {
    ...row,
    escrowStatus,
    releaseBlocked: isReleaseBlocked({ ...row, escrowStatus, status: row.status }),
    updatedAt: Date.now(),
  };
  cases[idx] = next;
  saveDisputeCases(cases);
  return next;
}

export function seedDemoDisputeCasesIfEmpty() {
  if (loadDisputeCases().length > 0) return loadDisputeCases();
  createDisputeCase({
    orderId: "P2P-DEMO-1001",
    buyerId: "BUY-101",
    sellerId: "SEL-202",
    disputeType: "payment_not_received",
    orderStatus: "payment_sent",
  });
  createDisputeCase({
    orderId: "P2P-DEMO-1002",
    buyerId: "BUY-303",
    sellerId: "SEL-404",
    disputeType: "suspicious_activity",
    orderStatus: "matched",
    suspiciousSeller: true,
  });
  return loadDisputeCases();
}

export function getCaseById(caseId) {
  return loadDisputeCases().find((c) => c.caseId === caseId) ?? null;
}

export function getDisputeCaseByOrderId(orderId) {
  const oid = String(orderId || "").trim();
  if (!oid) return null;
  return loadDisputeCases().find((c) => c.orderId === oid) ?? null;
}

export function filterDisputeCases(filters = {}) {
  let rows = loadDisputeCases();
  if (filters.status && filters.status !== "all") {
    rows = rows.filter((c) => c.status === filters.status);
  }
  if (filters.priority && filters.priority !== "all") {
    rows = rows.filter((c) => c.priority === filters.priority);
  }
  if (filters.suspiciousOnly) {
    rows = rows.filter((c) => c.suspiciousBuyer || c.suspiciousSeller);
  }
  const q = String(filters.query || "").trim().toLowerCase();
  if (q) {
    rows = rows.filter(
      (c) =>
        c.caseId.toLowerCase().includes(q) ||
        c.orderId.toLowerCase().includes(q) ||
        c.buyerId.toLowerCase().includes(q) ||
        c.sellerId.toLowerCase().includes(q),
    );
  }
  return rows;
}

export function replaceDisputeStoreSnapshot(snapshot) {
  persistDisputeStoreSnapshot(snapshot);
}
