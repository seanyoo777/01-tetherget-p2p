import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createDisputeCase, getDisputeCaseByOrderId } from "../../dispute/disputeHelpers.js";
import {
  checkMockEscrowReleaseForOrder,
  evaluateEscrowReleaseGuard,
  evaluateSuspiciousPartyRisk,
} from "../../risk/riskGuardHelpers.js";
import { runRiskGuardSelfTestSuite } from "../../risk/riskGuardSelfTest.js";
import { clearRiskGuardStorageForSelfTest } from "../../risk/riskGuardStore.js";
import { clearNotificationStorageForSelfTest } from "../../notifications/notificationStore.js";
import { clearDisputeMemoryFallback, TG_DISPUTE_STORAGE_KEY } from "../../dispute/disputeStore.js";

describe("risk guard", () => {
  beforeEach(() => {
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

  it("blocks mock release when dispute_opened", () => {
    const row = createDisputeCase({
      orderId: "ORD-RG-1",
      buyerId: "B1",
      sellerId: "S1",
      disputeType: "payment_not_received",
    });
    const guard = evaluateEscrowReleaseGuard(row);
    assert.equal(guard.canMockRelease, false);
    assert.equal(guard.status, "fail");
    const check = checkMockEscrowReleaseForOrder("ORD-RG-1");
    assert.equal(check.allowed, false);
  });

  it("flags suspicious seller as warn or fail", () => {
    const row = createDisputeCase({
      orderId: "ORD-RG-2",
      buyerId: "B2",
      sellerId: "S2",
      disputeType: "suspicious_activity",
      suspiciousSeller: true,
    });
    const party = evaluateSuspiciousPartyRisk(row);
    assert.notEqual(party.seller, "pass");
    assert.ok(getDisputeCaseByOrderId("ORD-RG-2"));
  });

  it("runRiskGuardSelfTestSuite passes", () => {
    const suite = runRiskGuardSelfTestSuite();
    assert.ok(["pass", "warn"].includes(suite.status));
    assert.equal(suite._mock, true);
    assert.equal(suite.diagnostics.mockOnly, true);
  });
});
