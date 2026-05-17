import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  buildEmergencyPlaybookSnapshot,
  recordEmergencyPlaybookView,
  recordMockEmergencyAction,
} from "../emergencyPlaybookHelpers.js";
import { runEmergencyPlaybookSelfTestSuite } from "../emergencyPlaybookSelfTest.js";
import { EMERGENCY_PLAYBOOK_AUDIT_EVENT } from "../emergencyPlaybookAudit.js";
import { EMERGENCY_MOCK_ACTIONS } from "../emergencyPlaybookConstants.js";
import { clearEmergencyPlaybookStorageForSelfTest, loadEmergencyPlaybookAuditTrail } from "../emergencyPlaybookStore.js";
import { clearDisputeMemoryFallback, TG_DISPUTE_STORAGE_KEY } from "../../dispute/disputeStore.js";
import { clearRiskGuardStorageForSelfTest } from "../../risk/riskGuardStore.js";
import { clearNotificationStorageForSelfTest } from "../../notifications/notificationStore.js";
import { clearEscrowHealthStorageForSelfTest } from "../../escrowHealth/escrowHealthStore.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const moduleDir = join(__dirname, "..");

function readPlaybookSources() {
  const names = [
    "emergencyPlaybookHelpers.js",
    "emergencyPlaybookStore.js",
    "emergencyPlaybookAudit.js",
    "emergencyPlaybookFeatureFlags.js",
    "emergencyPlaybookConstants.js",
  ];
  return names.map((n) => readFileSync(join(moduleDir, n), "utf8")).join("\n");
}

describe("emergency response playbook", () => {
  beforeEach(() => {
    clearEmergencyPlaybookStorageForSelfTest();
    clearEscrowHealthStorageForSelfTest();
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
  });

  it("buildEmergencyPlaybookSnapshot has required mock fields", () => {
    const snap = buildEmergencyPlaybookSnapshot();
    assert.equal(snap.mockOnly, true);
    assert.equal(snap.escrowEmergencyState.mockOnly, true);
    assert.equal(snap.disputeSpikeWarning.mockOnly, true);
    assert.equal(snap.releaseBlockEmergencyMode.mockOnly, true);
    assert.ok(snap.operatorChecklist.length > 0);
    assert.equal(snap.escrowHealthRef.mockOnly, true);
    assert.equal(snap.riskGuardRef.mockOnly, true);
    assert.ok(["pass", "warn", "fail"].includes(snap.overviewVerdict));
  });

  it("recordMockEmergencyAction writes audit and log", () => {
    recordEmergencyPlaybookView("test");
    const result = recordMockEmergencyAction(EMERGENCY_MOCK_ACTIONS.ACK_DISPUTE_SPIKE.id, "op_test");
    assert.equal(result.entry.mockOnly, true);
    assert.equal(result.entry.detail.noRealRelease, true);
    const trail = loadEmergencyPlaybookAuditTrail();
    assert.ok(trail.some((e) => e.event === EMERGENCY_PLAYBOOK_AUDIT_EVENT.MOCK_ACTION_RECORDED));
    assert.ok(result.snapshot.mockEmergencyActionLog.some((e) => e.actionId === EMERGENCY_MOCK_ACTIONS.ACK_DISPUTE_SPIKE.id));
  });

  it("runEmergencyPlaybookSelfTestSuite includes required groups", () => {
    const suite = runEmergencyPlaybookSelfTestSuite();
    const ids = suite.groups.map((g) => g.id);
    assert.ok(ids.includes("emergency-playbook-schema"));
    assert.ok(ids.includes("emergency-playbook-mock-only"));
    assert.ok(ids.includes("emergency-playbook-no-websocket"));
    assert.ok(ids.includes("emergency-no-real-release"));
    assert.equal(suite._mock, true);
  });

  it("playbook modules do not import fetch or WebSocket", () => {
    const src = readPlaybookSources();
    assert.equal(/\bfetch\s*\(/.test(src), false);
    assert.equal(/\bWebSocket\b/.test(src), false);
    assert.equal(/\bsendTransaction\b/.test(src), false);
  });
});
