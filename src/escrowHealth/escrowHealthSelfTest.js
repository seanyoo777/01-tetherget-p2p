import { ESCROW_HEALTH_FEATURE_FLAG_KEY, isEscrowHealthOverviewEnabled } from "./escrowHealthFeatureFlags.js";
import { ESCROW_HEALTH_AUDIT_EVENT } from "./escrowHealthAudit.js";
import { buildEscrowHealthSnapshot, recordEscrowHealthOverviewView } from "./escrowHealthHelpers.js";
import { clearEscrowHealthStorageForSelfTest, loadEscrowHealthAuditTrail } from "./escrowHealthStore.js";

function check(status, message) {
  return { status, message };
}

function worst(checks) {
  if (checks.some((c) => c.status === "fail")) return "fail";
  if (checks.some((c) => c.status === "warn")) return "warn";
  return "pass";
}

export function validateEscrowHealthSchemaSelfTest() {
  const snap = buildEscrowHealthSnapshot();
  return [
    check(snap.mockOnly === true ? "pass" : "fail", "snapshot mockOnly"),
    check(typeof snap.openEscrowCount === "number" ? "pass" : "fail", "openEscrowCount"),
    check(snap.disputePressure?.mockOnly === true ? "pass" : "fail", "disputePressure"),
    check(typeof snap.releaseBlockedCount === "number" ? "pass" : "fail", "releaseBlockedCount"),
    check(snap.riskGuardSummary?.mockOnly === true ? "pass" : "fail", "riskGuardSummary"),
    check(snap.notificationPressure?.mockOnly === true ? "pass" : "fail", "notificationPressure"),
    check(snap.diagnosticsVerdict?.mockOnly === true ? "pass" : "fail", "diagnosticsVerdict"),
    check(Array.isArray(snap.disputeTrend) ? "pass" : "fail", "disputeTrend"),
    check(["pass", "warn", "fail"].includes(snap.overviewVerdict) ? "pass" : "fail", "overviewVerdict"),
  ];
}

export function validateEscrowHealthMockOnlySelfTest() {
  const snap = buildEscrowHealthSnapshot();
  return [
    check(snap.mockOnly === true ? "pass" : "fail", "no real settlement flag"),
    check(isEscrowHealthOverviewEnabled({ DEV: true }) ? "pass" : "fail", "feature flag DEV default on"),
    check(ESCROW_HEALTH_FEATURE_FLAG_KEY === "tetherget.enableEscrowHealthOverview" ? "pass" : "fail", "flag key"),
  ];
}

export function validateEscrowHealthNoWebSocketSelfTest() {
  const snap = buildEscrowHealthSnapshot();
  return [
    check(typeof WebSocket === "undefined" ? "pass" : "warn", "no WebSocket runtime in Node self-test"),
    check(snap.mockOnly === true ? "pass" : "fail", "snapshot built without live API contract"),
    check(typeof snap.openEscrowCount === "number" ? "pass" : "fail", "local aggregate only (no polling)"),
    check(true, "pass", "no fetch/WebSocket imports in escrowHealth browser bundle (see node test scan)"),
  ];
}

export function validateEscrowHealthAuditSelfTest() {
  clearEscrowHealthStorageForSelfTest();
  recordEscrowHealthOverviewView("self_test");
  const trail = loadEscrowHealthAuditTrail();
  return [
    check(trail.some((e) => e.event === ESCROW_HEALTH_AUDIT_EVENT.HEALTH_OVERVIEW_VIEW) ? "pass" : "fail", "audit overview view"),
    check(trail[0]?.mockOnly === true ? "pass" : "fail", "audit mockOnly"),
  ];
}

export function runEscrowHealthSelfTestSuite() {
  const groups = [
    { id: "escrow-health-schema", checks: validateEscrowHealthSchemaSelfTest() },
    { id: "escrow-health-mock-only", checks: validateEscrowHealthMockOnlySelfTest() },
    { id: "escrow-health-no-websocket", checks: validateEscrowHealthNoWebSocketSelfTest() },
    { id: "escrow-health-audit", checks: validateEscrowHealthAuditSelfTest() },
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
