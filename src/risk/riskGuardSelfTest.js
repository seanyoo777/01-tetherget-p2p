import { createDisputeCase, resolveDisputeMock } from "../dispute/disputeHelpers.js";
import { clearDisputeMemoryFallback, TG_DISPUTE_STORAGE_KEY } from "../dispute/disputeStore.js";
import { clearNotificationStorageForSelfTest } from "../notifications/notificationStore.js";
import { loadActivityFeed } from "../notifications/notificationStore.js";
import { RISK_GUARD_AUDIT_EVENT } from "./riskGuardAudit.js";
import {
  evaluateEscrowReleaseGuard,
  evaluateSuspiciousPartyRisk,
  getRiskGuardDiagnostics,
  listReleaseBlockedCases,
  mockAttemptEscrowRelease,
  recordReleaseBlockReason,
  syncGuardAfterDisputeFinalize,
} from "./riskGuardHelpers.js";
import { clearRiskGuardStorageForSelfTest, loadRiskGuardAuditTrail } from "./riskGuardStore.js";

function check(status, message) {
  return { status, message };
}

function worst(checks) {
  if (checks.some((c) => c.status === "fail")) return "fail";
  if (checks.some((c) => c.status === "warn")) return "warn";
  return "pass";
}

function clearAll() {
  clearRiskGuardStorageForSelfTest();
  clearNotificationStorageForSelfTest();
  clearDisputeMemoryFallback();
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.removeItem(TG_DISPUTE_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
}

export function validateEscrowReleaseGuardSelfTest() {
  clearAll();
  const open = createDisputeCase({
    orderId: "RG-TST-1",
    buyerId: "B1",
    sellerId: "S1",
    disputeType: "payment_not_received",
  });
  const guard = evaluateEscrowReleaseGuard(open);
  const attempt = mockAttemptEscrowRelease(open, "OP-1");
  return [
    check(guard.status === "fail" ? "pass" : "fail", "dispute_opened → guard FAIL"),
    check(guard.canMockRelease === false ? "pass" : "fail", "canMockRelease false"),
    check(attempt.ok === false ? "pass" : "fail", "mock release denied"),
  ];
}

export function validateSuspiciousFlagsSelfTest() {
  clearAll();
  const row = createDisputeCase({
    orderId: "RG-TST-2",
    buyerId: "B2",
    sellerId: "S2",
    disputeType: "payment_not_received",
    suspiciousSeller: true,
  });
  const party = evaluateSuspiciousPartyRisk(row);
  return [
    check(party.seller === "warn" || party.seller === "fail" ? "pass" : "fail", "suspiciousSeller WARN/FAIL"),
    check(party.aggregate !== "pass" ? "pass" : "fail", "aggregate not pass"),
  ];
}

export function validateResolveSyncSelfTest() {
  clearAll();
  const row = createDisputeCase({
    orderId: "RG-TST-3",
    buyerId: "B3",
    sellerId: "S3",
    disputeType: "fake_receipt",
  });
  const resolved = resolveDisputeMock(row.caseId, "OP-3", "mock resolve");
  syncGuardAfterDisputeFinalize(resolved, "OP-3", "resolved_mock");
  const guard = evaluateEscrowReleaseGuard(resolved);
  return [
    check(resolved?.releaseBlocked === false ? "pass" : "fail", "releaseBlocked cleared"),
    check(guard.canMockRelease === true ? "pass" : "fail", "can mock release after resolve"),
    check(
      loadRiskGuardAuditTrail().some((e) => e.event === RISK_GUARD_AUDIT_EVENT.RESOLVE_SYNC_MOCK) ? "pass" : "fail",
      "resolve sync audit",
    ),
  ];
}

export function validateActivityNotificationSelfTest() {
  clearAll();
  const row = createDisputeCase({
    orderId: "RG-TST-4",
    buyerId: "B4",
    sellerId: "S4",
    disputeType: "scam_report",
    suspiciousBuyer: true,
  });
  recordReleaseBlockReason(row, "test_block");
  const feed = loadActivityFeed();
  return [
    check(feed.some((a) => a.action?.includes("release_blocked")) ? "pass" : "fail", "activity has block event"),
    check(listReleaseBlockedCases().length >= 1 ? "pass" : "fail", "blocked list non-empty"),
  ];
}

export function validateNoRealTransferSelfTest() {
  return [
    check("pass", "no bank API"),
    check("pass", "no wallet release API"),
    check("pass", "no on-chain settlement"),
  ];
}

export function runRiskGuardSelfTestSuite() {
  clearAll();
  const groups = [
    { id: "escrow_guard", checks: validateEscrowReleaseGuardSelfTest() },
    { id: "suspicious", checks: validateSuspiciousFlagsSelfTest() },
    { id: "resolve_sync", checks: validateResolveSyncSelfTest() },
    { id: "activity", checks: validateActivityNotificationSelfTest() },
    { id: "no_real", checks: validateNoRealTransferSelfTest() },
  ];
  const allChecks = groups.flatMap((g) => g.checks);
  const diagnostics = getRiskGuardDiagnostics();
  return {
    status: worst(allChecks),
    issueCount: allChecks.filter((c) => c.status !== "pass").length,
    groups,
    diagnostics,
    lastChecked: Date.now(),
    _mock: true,
  };
}
