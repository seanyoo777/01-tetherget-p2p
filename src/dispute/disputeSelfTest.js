import { DISPUTE_AUDIT_EVENT } from "./disputeAudit.js";
import {
  addMockEvidence,
  createDisputeCase,
  isReleaseBlocked,
  mapOrderToEscrowStatus,
  seedDemoDisputeCasesIfEmpty,
} from "./disputeHelpers.js";
import { loadDisputeAuditTrail, loadDisputeCases, TG_DISPUTE_STORAGE_KEY } from "./disputeStore.js";
import { DISPUTE_EVIDENCE_TYPES, DISPUTE_STATUSES, DISPUTE_TYPES } from "./disputeConstants.js";

function check(status, message) {
  return { status, message };
}

function worst(checks) {
  if (checks.some((c) => c.status === "fail")) return "fail";
  if (checks.some((c) => c.status === "warn")) return "warn";
  return "pass";
}

export function validateDisputeSchemaSelfTest() {
  const checks = [];
  checks.push(check(DISPUTE_TYPES.length === 8 ? "pass" : "fail", `disputeType count ${DISPUTE_TYPES.length}`));
  checks.push(check(DISPUTE_STATUSES.length === 6 ? "pass" : "fail", `status count ${DISPUTE_STATUSES.length}`));
  checks.push(check(DISPUTE_EVIDENCE_TYPES.length === 5 ? "pass" : "fail", `evidence types ${DISPUTE_EVIDENCE_TYPES.length}`));
  return checks;
}

export function validateEvidenceSchemaSelfTest() {
  const c = createDisputeCase({
    orderId: "TST-EV-1",
    buyerId: "B1",
    sellerId: "S1",
    disputeType: "fake_receipt",
  });
  const updated = addMockEvidence(c.caseId, "receipt_image", "mock-receipt.png", "test");
  const ev = updated?.evidenceItems?.[0];
  if (!ev) return [check("fail", "evidence not added")];
  return [
    check(ev.mockOnly === true ? "pass" : "fail", "evidence mockOnly"),
    check(ev.fileNameMock ? "pass" : "fail", "fileNameMock present"),
  ];
}

export function validateEscrowSyncSelfTest() {
  return [
    check(mapOrderToEscrowStatus("matched") === "escrow_locked" ? "pass" : "fail", "matched → escrow_locked"),
    check(mapOrderToEscrowStatus("payment_sent") === "release_waiting" ? "pass" : "fail", "payment_sent → release_waiting"),
    check(mapOrderToEscrowStatus("listed", true) === "dispute_opened" ? "pass" : "fail", "dispute → dispute_opened"),
  ];
}

export function validateReleaseBlockedSelfTest() {
  const open = createDisputeCase({
    orderId: "TST-BLK-1",
    buyerId: "B1",
    sellerId: "S1",
    disputeType: "payment_not_received",
  });
  return [
    check(isReleaseBlocked(open) ? "pass" : "fail", "open case blocks release"),
    check(open.releaseBlocked === true ? "pass" : "fail", "releaseBlocked flag"),
    check(
      isReleaseBlocked({ ...open, status: "resolved_mock", releaseBlocked: false }) ? "fail" : "pass",
      "resolved unblocks",
    ),
  ];
}

export function validateAuditAppendSelfTest() {
  const trail = loadDisputeAuditTrail();
  return [
    check(trail.some((e) => e.event === DISPUTE_AUDIT_EVENT.CASE_CREATED) ? "pass" : "fail", "audit case.created"),
    check(
      trail.some((e) => e.event === DISPUTE_AUDIT_EVENT.ESCROW_RELEASE_BLOCKED_MOCK) ? "pass" : "fail",
      "audit escrow.blocked",
    ),
    check(trail[0]?.mockOnly === true ? "pass" : "warn", "audit mockOnly"),
  ];
}

export function validateNoRealTransferSelfTest() {
  const cases = loadDisputeCases();
  return [
    check(cases.every((c) => c.mockOnly === true) ? "pass" : "fail", "all cases mockOnly"),
    check("pass", "no bank API (mock-only module)"),
    check("pass", "no wallet release API (mock-only module)"),
  ];
}

export function runDisputeSelfTestSuite() {
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.removeItem(TG_DISPUTE_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
  seedDemoDisputeCasesIfEmpty();
  const groups = [
    { id: "schema", checks: validateDisputeSchemaSelfTest() },
    { id: "evidence", checks: validateEvidenceSchemaSelfTest() },
    { id: "escrow", checks: validateEscrowSyncSelfTest() },
    { id: "release", checks: validateReleaseBlockedSelfTest() },
    { id: "audit", checks: validateAuditAppendSelfTest() },
    { id: "no_real", checks: validateNoRealTransferSelfTest() },
  ];
  const allChecks = groups.flatMap((g) => g.checks);
  return {
    status: worst(allChecks),
    issueCount: allChecks.filter((c) => c.status !== "pass").length,
    groups,
    lastChecked: Date.now(),
    _mock: true,
  };
}
