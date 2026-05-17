import {
  EMERGENCY_PLAYBOOK_FEATURE_FLAG_KEY,
  isEmergencyResponsePlaybookEnabled,
} from "./emergencyPlaybookFeatureFlags.js";
import { EMERGENCY_PLAYBOOK_AUDIT_EVENT } from "./emergencyPlaybookAudit.js";
import { EMERGENCY_MOCK_ACTIONS } from "./emergencyPlaybookConstants.js";
import {
  buildEmergencyPlaybookSnapshot,
  recordEmergencyPlaybookView,
  recordMockEmergencyAction,
} from "./emergencyPlaybookHelpers.js";
import { clearEmergencyPlaybookStorageForSelfTest, loadEmergencyPlaybookAuditTrail } from "./emergencyPlaybookStore.js";

function check(status, message) {
  return { status, message };
}

function worst(checks) {
  if (checks.some((c) => c.status === "fail")) return "fail";
  if (checks.some((c) => c.status === "warn")) return "warn";
  return "pass";
}

export function validateEmergencyPlaybookSchemaSelfTest() {
  const snap = buildEmergencyPlaybookSnapshot();
  return [
    check(snap.mockOnly === true ? "pass" : "fail", "snapshot mockOnly"),
    check(snap.escrowEmergencyState?.mockOnly === true ? "pass" : "fail", "escrowEmergencyState"),
    check(snap.disputeSpikeWarning?.mockOnly === true ? "pass" : "fail", "disputeSpikeWarning"),
    check(snap.releaseBlockEmergencyMode?.mockOnly === true ? "pass" : "fail", "releaseBlockEmergencyMode"),
    check(snap.notificationPressure?.mockOnly === true ? "pass" : "fail", "notificationPressure"),
    check(Array.isArray(snap.operatorChecklist) && snap.operatorChecklist.length > 0 ? "pass" : "fail", "operatorChecklist"),
    check(Array.isArray(snap.mockEmergencyActionLog) ? "pass" : "fail", "mockEmergencyActionLog"),
    check(snap.escrowHealthRef?.mockOnly === true ? "pass" : "fail", "escrowHealthRef"),
    check(snap.riskGuardRef?.mockOnly === true ? "pass" : "fail", "riskGuardRef"),
    check(["pass", "warn", "fail"].includes(snap.overviewVerdict) ? "pass" : "fail", "overviewVerdict"),
  ];
}

export function validateEmergencyPlaybookMockOnlySelfTest() {
  const snap = buildEmergencyPlaybookSnapshot();
  return [
    check(snap.mockOnly === true ? "pass" : "fail", "no real settlement flag"),
    check(isEmergencyResponsePlaybookEnabled({ DEV: true }) ? "pass" : "fail", "feature flag DEV default on"),
    check(
      EMERGENCY_PLAYBOOK_FEATURE_FLAG_KEY === "tetherget.enableEmergencyResponsePlaybook" ? "pass" : "fail",
      "flag key",
    ),
  ];
}

export function validateEmergencyPlaybookNoWebSocketSelfTest() {
  const snap = buildEmergencyPlaybookSnapshot();
  return [
    check(typeof WebSocket === "undefined" ? "pass" : "warn", "no WebSocket runtime in Node self-test"),
    check(snap.mockOnly === true ? "pass" : "fail", "snapshot built without live API contract"),
    check(snap.escrowHealthRef != null ? "pass" : "fail", "local escrow health ref only"),
  ];
}

export function validateEmergencyNoRealReleaseSelfTest() {
  const result = recordMockEmergencyAction(EMERGENCY_MOCK_ACTIONS.ACK_DISPUTE_SPIKE.id, "self_test_op");
  return [
    check(result.entry?.detail?.noRealRelease === true ? "pass" : "fail", "mock action marks noRealRelease"),
    check(result.snapshot.mockOnly === true ? "pass" : "fail", "post-action snapshot mockOnly"),
    check(
      !String(result.entry?.label || "").toLowerCase().includes("on-chain") ? "pass" : "fail",
      "action label not on-chain",
    ),
    check(snapHasNoReleasePath(result.snapshot) ? "pass" : "fail", "playbook does not enable real release"),
  ];
}

function snapHasNoReleasePath(snap) {
  return snap.releaseBlockEmergencyMode?.mockOnly === true && snap.escrowEmergencyState?.mockOnly === true;
}

export function validateEmergencyPlaybookAuditSelfTest() {
  clearEmergencyPlaybookStorageForSelfTest();
  recordEmergencyPlaybookView("self_test");
  recordMockEmergencyAction(EMERGENCY_MOCK_ACTIONS.NOTIFY_OPERATORS.id, "self_test_op");
  const trail = loadEmergencyPlaybookAuditTrail();
  return [
    check(trail.some((e) => e.event === EMERGENCY_PLAYBOOK_AUDIT_EVENT.PLAYBOOK_VIEW) ? "pass" : "fail", "playbook view audit"),
    check(trail.some((e) => e.event === EMERGENCY_PLAYBOOK_AUDIT_EVENT.MOCK_ACTION_RECORDED) ? "pass" : "fail", "mock action audit"),
    check(trail[0]?.mockOnly === true ? "pass" : "fail", "audit mockOnly"),
  ];
}

export function runEmergencyPlaybookSelfTestSuite() {
  const groups = [
    { id: "emergency-playbook-schema", checks: validateEmergencyPlaybookSchemaSelfTest() },
    { id: "emergency-playbook-mock-only", checks: validateEmergencyPlaybookMockOnlySelfTest() },
    { id: "emergency-playbook-no-websocket", checks: validateEmergencyPlaybookNoWebSocketSelfTest() },
    { id: "emergency-no-real-release", checks: validateEmergencyNoRealReleaseSelfTest() },
    { id: "emergency-playbook-audit", checks: validateEmergencyPlaybookAuditSelfTest() },
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
