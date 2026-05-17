import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  TG_DISPUTE_STORAGE_KEY,
  TG_DISPUTE_AUDIT_KEY,
  TG_DISPUTE_NOTIFY_KEY,
  clearDisputeMemoryFallback,
} from "../disputeStore.js";
import { createDisputeCase, isReleaseBlocked, getCaseById } from "../disputeHelpers.js";
import { DISPUTE_AUDIT_EVENT } from "../disputeAudit.js";
import { loadDisputeAuditTrail } from "../disputeStore.js";
import { runDisputeSelfTestSuite } from "../disputeSelfTest.js";
import { DISPUTE_TYPES, DISPUTE_EVIDENCE_TYPES } from "../disputeConstants.js";

function clearDisputeStorage() {
  clearDisputeMemoryFallback();
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(TG_DISPUTE_STORAGE_KEY);
  localStorage.removeItem(TG_DISPUTE_AUDIT_KEY);
  localStorage.removeItem(TG_DISPUTE_NOTIFY_KEY);
}

describe("dispute domain", () => {
  beforeEach(() => clearDisputeStorage());

  it("creates mock-only case with release blocked", () => {
    const row = createDisputeCase({
      orderId: "ORD-1",
      buyerId: "B1",
      sellerId: "S1",
      disputeType: "payment_not_received",
    });
    assert.equal(row.mockOnly, true);
    assert.equal(row.escrowStatus, "dispute_opened");
    assert.equal(isReleaseBlocked(row), true);
    assert.ok(getCaseById(row.caseId));
  });

  it("appends audit on create", () => {
    createDisputeCase({
      orderId: "ORD-2",
      buyerId: "B1",
      sellerId: "S1",
      disputeType: "scam_report",
    });
    const trail = loadDisputeAuditTrail();
    assert.ok(trail.some((e) => e.event === DISPUTE_AUDIT_EVENT.CASE_CREATED));
    assert.ok(trail.some((e) => e.event === DISPUTE_AUDIT_EVENT.ESCROW_RELEASE_BLOCKED_MOCK));
  });

  it("defines 8 dispute types and 5 evidence types", () => {
    assert.equal(DISPUTE_TYPES.length, 8);
    assert.equal(DISPUTE_EVIDENCE_TYPES.length, 5);
  });

  it("self-test suite passes aggregate", () => {
    const suite = runDisputeSelfTestSuite();
    assert.notEqual(suite.status, "fail");
    assert.equal(suite._mock, true);
  });
});
