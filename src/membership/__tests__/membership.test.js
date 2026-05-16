import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MEMBERSHIP_TIERS, resolveTierFromPoints, computeTierProgress } from "../membershipTiers.js";
import { computeMembershipFeePreview } from "../membershipModel.js";
import { isMembershipDiscountEnabled, isOneAiBridgeEnabled } from "../membershipFeatureFlags.js";
import { MEMBERSHIP_AUDIT_EVENT, appendMembershipAuditEvent } from "../membershipAudit.js";
import { runMembershipSelfTestSuite } from "../membershipSelfTest.js";

describe("membershipTiers", () => {
  it("defines 5 tiers with discount ladder", () => {
    assert.equal(MEMBERSHIP_TIERS.length, 5);
    assert.equal(MEMBERSHIP_TIERS[0].discountPct, 0);
    assert.equal(MEMBERSHIP_TIERS[4].discountPct, 30);
  });

  it("resolves gold at 6200 points", () => {
    assert.equal(resolveTierFromPoints(6200).id, "gold");
  });

  it("progress toward platinum", () => {
    const p = computeTierProgress(6200);
    assert.equal(p.current.id, "gold");
    assert.equal(p.next?.id, "platinum");
    assert.ok(p.pointsToNext > 0);
  });
});

describe("membershipModel", () => {
  it("applies tier discount to mock fee total", () => {
    const preview = computeMembershipFeePreview({ notionalUsdt: 1000, tierId: "gold" });
    assert.equal(preview.discountPct, 10);
    assert.ok(preview.discountAmount > 0);
    assert.ok(preview.discountedTotalFee < preview.totalFee);
    assert.equal(preview.noRealFeeEngine, true);
  });

  it("append-only audit trail", () => {
    const t1 = appendMembershipAuditEvent([], MEMBERSHIP_AUDIT_EVENT.LEVEL_MOCK, { tier: "gold" });
    assert.equal(t1.length, 1);
    assert.ok(t1[0].line.includes("membership.level.mock"));
  });
});

describe("membershipFeatureFlags", () => {
  it("discount enabled by default mock env", () => {
    assert.equal(isMembershipDiscountEnabled({ DEV: false, VITE_MEMBERSHIP_DISCOUNT_ENABLED: "1" }), true);
    assert.equal(isMembershipDiscountEnabled({ DEV: false, VITE_MEMBERSHIP_DISCOUNT_ENABLED: "0" }), false);
  });

  it("oneai bridge flag", () => {
    assert.equal(isOneAiBridgeEnabled({ VITE_MEMBERSHIP_BRIDGE_ONEAI_ENABLED: "1" }), true);
  });
});

describe("membershipSelfTest", () => {
  it("runMembershipSelfTestSuite passes", () => {
    const suite = runMembershipSelfTestSuite();
    assert.ok(suite.cards.length >= 6);
    assert.notEqual(suite.status, "fail");
    assert.equal(suite._mock, true);
  });
});
