import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildEscrowHealthSnapshot, recordEscrowHealthOverviewView } from "../escrowHealthHelpers.js";
import { runEscrowHealthSelfTestSuite } from "../escrowHealthSelfTest.js";
import { ESCROW_HEALTH_AUDIT_EVENT } from "../escrowHealthAudit.js";
import { clearEscrowHealthStorageForSelfTest, loadEscrowHealthAuditTrail } from "../escrowHealthStore.js";
import { clearDisputeMemoryFallback, TG_DISPUTE_STORAGE_KEY } from "../../dispute/disputeStore.js";
import { clearRiskGuardStorageForSelfTest } from "../../risk/riskGuardStore.js";
import { clearNotificationStorageForSelfTest } from "../../notifications/notificationStore.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const escrowHealthDir = join(__dirname, "..");

function readEscrowHealthSources() {
  const names = [
    "escrowHealthHelpers.js",
    "escrowHealthStore.js",
    "escrowHealthAudit.js",
    "escrowHealthFeatureFlags.js",
  ];
  return names.map((n) => readFileSync(join(escrowHealthDir, n), "utf8")).join("\n");
}

describe("escrow health overview", () => {
  beforeEach(() => {
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

  it("buildEscrowHealthSnapshot has required mock fields", () => {
    const snap = buildEscrowHealthSnapshot();
    assert.equal(snap.mockOnly, true);
    assert.equal(typeof snap.openEscrowCount, "number");
    assert.equal(typeof snap.releaseBlockedCount, "number");
    assert.equal(snap.disputePressure.mockOnly, true);
    assert.equal(snap.riskGuardSummary.mockOnly, true);
    assert.equal(snap.notificationPressure.mockOnly, true);
    assert.equal(snap.diagnosticsVerdict.mockOnly, true);
    assert.ok(["pass", "warn", "fail"].includes(snap.overviewVerdict));
    assert.ok(Array.isArray(snap.disputeTrend));
  });

  it("recordEscrowHealthOverviewView writes audit event", () => {
    recordEscrowHealthOverviewView("test");
    const trail = loadEscrowHealthAuditTrail();
    assert.ok(trail.some((e) => e.event === ESCROW_HEALTH_AUDIT_EVENT.HEALTH_OVERVIEW_VIEW));
    assert.equal(trail[0].mockOnly, true);
  });

  it("runEscrowHealthSelfTestSuite includes required groups", () => {
    const suite = runEscrowHealthSelfTestSuite();
    const ids = suite.groups.map((g) => g.id);
    assert.ok(ids.includes("escrow-health-schema"));
    assert.ok(ids.includes("escrow-health-mock-only"));
    assert.ok(ids.includes("escrow-health-no-websocket"));
    assert.equal(suite._mock, true);
    assert.ok(["pass", "warn", "fail"].includes(suite.status));
  });

  it("escrowHealth modules do not import fetch or WebSocket", () => {
    const src = readEscrowHealthSources();
    assert.equal(/\bfetch\s*\(/.test(src), false);
    assert.equal(/\bWebSocket\b/.test(src), false);
    assert.equal(/\baxios\b/.test(src), false);
  });
});
