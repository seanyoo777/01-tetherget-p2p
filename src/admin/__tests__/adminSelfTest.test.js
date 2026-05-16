import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeMockFeeBreakdown,
  simulateLevelTransition,
  getMockStageReferralRates,
  ADMIN_SELF_TEST_STATUS,
} from "../adminSelfTestModel.js";
import {
  runAdminSelfTestSuite,
  validateMemberLevelSelfTest,
  validateFeeStructureSelfTest,
  validateReferralSpreadSelfTest,
  validateAdminMenuSmokeSelfTest,
  validateFeatureFlagFallbackSelfTest,
  validateAuditTrailMockSelfTest,
  validateTradeStatusSelfTest,
  validateEscrowStateSelfTest,
} from "../adminSelfTestEngine.js";
import { mockAppendAuditEntry } from "../adminSelfTestModel.js";
import { SALES_LEVEL_STAGES } from "../adminMemberModel.js";

describe("adminSelfTestModel", () => {
  it("computeMockFeeBreakdown splits buyer/seller/referral/company", () => {
    const b = computeMockFeeBreakdown({ notionalUsdt: 1000, receivedRate: 45, childRate: 40 });
    assert.ok(b.buyerFee > 0);
    assert.ok(b.sellerFee > 0);
    assert.equal(b.totalFee, b.buyerFee + b.sellerFee);
    assert.ok(b.marginOk);
    assert.equal(b._mock, true);
  });

  it("simulateLevelTransition shows before/after stage and rates", () => {
    const t = simulateLevelTransition({ id: "1" }, SALES_LEVEL_STAGES[2], SALES_LEVEL_STAGES[3]);
    assert.notEqual(t.fromLevel, t.toLevel);
    assert.ok(t.tableAfter.receivedRate <= t.tableBefore.receivedRate || t.toLevel.includes("LEVEL"));
    assert.equal(t.tableAfter.marginRate, t.tableAfter.receivedRate - t.tableAfter.childRate);
  });

  it("getMockStageReferralRates keeps received >= child for known stages", () => {
    const r = getMockStageReferralRates(SALES_LEVEL_STAGES[0]);
    assert.ok(r.received >= r.child);
  });
});

describe("adminSelfTestEngine", () => {
  it("validateMemberLevelSelfTest passes for LEVEL 3→4", () => {
    const card = validateMemberLevelSelfTest();
    assert.equal(card.id, "member_level");
    assert.ok(card.checks.length >= 3);
    assert.notEqual(card.status, ADMIN_SELF_TEST_STATUS.FAIL);
  });

  it("validateFeeStructureSelfTest passes fee math", () => {
    const card = validateFeeStructureSelfTest();
    assert.equal(card.status, ADMIN_SELF_TEST_STATUS.PASS);
  });

  it("validateReferralSpreadSelfTest covers stage ladder", () => {
    const card = validateReferralSpreadSelfTest();
    assert.ok(card.checks.length >= 4);
  });

  it("validateTradeStatusSelfTest maps sample rows", () => {
    const card = validateTradeStatusSelfTest();
    assert.ok(card.checks.every((c) => c.status === ADMIN_SELF_TEST_STATUS.PASS));
  });

  it("validateEscrowStateSelfTest maps escrow pairs", () => {
    const card = validateEscrowStateSelfTest();
    assert.ok(card.checks.every((c) => c.status === ADMIN_SELF_TEST_STATUS.PASS));
  });

  it("validateAdminMenuSmokeSelfTest maps shell menus to panel tabs", () => {
    const card = validateAdminMenuSmokeSelfTest();
    assert.equal(card.status, ADMIN_SELF_TEST_STATUS.PASS);
    assert.ok(card.menus.length >= 5);
  });

  it("validateFeatureFlagFallbackSelfTest covers env toggles", () => {
    const card = validateFeatureFlagFallbackSelfTest();
    assert.equal(card.id, "feature_flags");
    assert.notEqual(card.status, ADMIN_SELF_TEST_STATUS.FAIL);
  });

  it("validateAuditTrailMockSelfTest uses append-only trail", () => {
    const card = validateAuditTrailMockSelfTest();
    assert.equal(card.id, "audit_trail");
    assert.notEqual(card.status, ADMIN_SELF_TEST_STATUS.FAIL);
    const t = mockAppendAuditEntry([], "a");
    assert.equal(t.length, 1);
    assert.ok(t[0].t);
  });

  it("runAdminSelfTestSuite returns cards and aggregate status", () => {
    const suite = runAdminSelfTestSuite();
    assert.ok(suite.cards.length >= 9);
    assert.ok(["pass", "warn", "fail"].includes(suite.status));
    assert.equal(typeof suite.issueCount, "number");
    assert.ok(suite.lastChecked > 0);
    assert.equal(suite._mock, true);
    assert.ok(suite.levelTransition);
    assert.ok(suite.feeBreakdown);
  });
});
