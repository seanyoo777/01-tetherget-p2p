import { ADMIN_SELF_TEST_STATUS, makeCheck, worstStatus } from "../admin/adminSelfTestModel.js";
import { MEMBERSHIP_TIERS, resolveTierFromPoints, computeTierProgress } from "./membershipTiers.js";
import {
  computeMembershipFeePreview,
  normalizeMembershipMockState,
  DEFAULT_MEMBERSHIP_MOCK_STATE,
} from "./membershipModel.js";
import { isMembershipDiscountEnabled, isOneAiBridgeEnabled, MEMBERSHIP_FEATURE_FLAG_KEYS } from "./membershipFeatureFlags.js";
import { MEMBERSHIP_AUDIT_EVENT } from "./membershipAudit.js";

function summarizeCard(card) {
  const issueCount = card.checks.filter(
    (c) => c.status === ADMIN_SELF_TEST_STATUS.FAIL || c.status === ADMIN_SELF_TEST_STATUS.WARN,
  ).length;
  return { ...card, issueCount, status: worstStatus(card.checks), lastChecked: Date.now(), _mock: true };
}

export function validateMembershipThresholdSelfTest() {
  const checks = MEMBERSHIP_TIERS.map((tier) => {
    const resolved = resolveTierFromPoints(tier.pointsRequired);
    const ok = resolved.id === tier.id;
    return makeCheck(
      ok ? ADMIN_SELF_TEST_STATUS.PASS : ADMIN_SELF_TEST_STATUS.FAIL,
      `${tier.label} @ ${tier.pointsRequired} pts → ${resolved.label}`,
      { expected: tier.id, actual: resolved.id },
    );
  });
  const progress = computeTierProgress(6200);
  checks.push(
    makeCheck(progress.current.id === "gold" ? ADMIN_SELF_TEST_STATUS.PASS : ADMIN_SELF_TEST_STATUS.WARN, "sample 6200 pts tier"),
  );
  return summarizeCard({ id: "membership_threshold", title: "Membership threshold", checks });
}

export function validateMembershipDiscountSchemaSelfTest() {
  const checks = [];
  for (const tier of MEMBERSHIP_TIERS) {
    const preview = computeMembershipFeePreview({ notionalUsdt: 10_000, tierId: tier.id });
    const baseFeeTotal = preview.totalFee;
    const discountOk =
      tier.discountPct === 0
        ? preview.discountAmount === 0
        : preview.discountAmount > 0 && preview.discountedTotalFee < baseFeeTotal;
    checks.push(
      makeCheck(
        preview.discountPct === tier.discountPct && discountOk ? ADMIN_SELF_TEST_STATUS.PASS : ADMIN_SELF_TEST_STATUS.FAIL,
        `${tier.label} ${tier.discountPct}% → save ${preview.discountAmount}`,
        { discountAmount: preview.discountAmount },
      ),
    );
  }
  return summarizeCard({ id: "membership_discount_schema", title: "Discount schema", checks });
}

export function validateOneAiBridgeMockSelfTest() {
  const state = normalizeMembershipMockState(DEFAULT_MEMBERSHIP_MOCK_STATE);
  const checks = [
    makeCheck(state._mock === true ? ADMIN_SELF_TEST_STATUS.PASS : ADMIN_SELF_TEST_STATUS.FAIL, "mock state flagged"),
    makeCheck(
      ["mock_idle", "mock_pending", "mock_synced"].includes(state.oneAiSyncStatus)
        ? ADMIN_SELF_TEST_STATUS.PASS
        : ADMIN_SELF_TEST_STATUS.FAIL,
      `sync status ${state.oneAiSyncStatus}`,
    ),
    makeCheck(
      isOneAiBridgeEnabled({ DEV: false, VITE_MEMBERSHIP_BRIDGE_ONEAI_ENABLED: "1" })
        ? ADMIN_SELF_TEST_STATUS.PASS
        : ADMIN_SELF_TEST_STATUS.FAIL,
      MEMBERSHIP_FEATURE_FLAG_KEYS.ONEAI_BRIDGE,
    ),
  ];
  return summarizeCard({ id: "oneai_bridge_mock", title: "OneAI bridge (mock)", checks, bridge: { points: state.oneAiPoints } });
}

export function validateNoRealFeeEngineSelfTest() {
  const preview = computeMembershipFeePreview({ notionalUsdt: 1000, points: 6200 });
  const checks = [
    makeCheck(preview.noRealFeeEngine === true ? ADMIN_SELF_TEST_STATUS.PASS : ADMIN_SELF_TEST_STATUS.FAIL, "noRealFeeEngine flag"),
    makeCheck(preview._mock === true ? ADMIN_SELF_TEST_STATUS.PASS : ADMIN_SELF_TEST_STATUS.FAIL, "preview _mock"),
    makeCheck(
      isMembershipDiscountEnabled({ DEV: false, VITE_MEMBERSHIP_DISCOUNT_ENABLED: "0" }) === false
        ? ADMIN_SELF_TEST_STATUS.PASS
        : ADMIN_SELF_TEST_STATUS.FAIL,
      "discount flag off when env 0",
    ),
    makeCheck(
      computeMembershipFeePreview({ notionalUsdt: 1000, tierId: "gold", enabled: false }).discountAmount === 0
        ? ADMIN_SELF_TEST_STATUS.PASS
        : ADMIN_SELF_TEST_STATUS.FAIL,
      "disabled → zero discount",
    ),
  ];
  return summarizeCard({ id: "membership_no_real_engine", title: "No real fee engine", checks });
}

export function validateMembershipAuditEventsSelfTest() {
  const events = Object.values(MEMBERSHIP_AUDIT_EVENT);
  const checks = events.map((ev) =>
    makeCheck(ev.startsWith("membership.") ? ADMIN_SELF_TEST_STATUS.PASS : ADMIN_SELF_TEST_STATUS.FAIL, ev),
  );
  return summarizeCard({ id: "membership_audit_events", title: "Audit event ids", checks });
}

export function validateMembershipMobileCardSelfTest() {
  const checks = [
    makeCheck(MEMBERSHIP_TIERS.length === 5 ? ADMIN_SELF_TEST_STATUS.PASS : ADMIN_SELF_TEST_STATUS.FAIL, "5 tiers defined"),
    makeCheck(
      MEMBERSHIP_TIERS.every((t) => typeof t.discountPct === "number") ? ADMIN_SELF_TEST_STATUS.PASS : ADMIN_SELF_TEST_STATUS.FAIL,
      "discountPct on all tiers",
    ),
    makeCheck(
      typeof computeTierProgress(1000).progressPct === "number" ? ADMIN_SELF_TEST_STATUS.PASS : ADMIN_SELF_TEST_STATUS.FAIL,
      "progressPct for mobile bar",
    ),
  ];
  return summarizeCard({ id: "membership_mobile_card", title: "Mobile card shape", checks });
}

export function runMembershipSelfTestSuite() {
  const cards = [
    validateMembershipThresholdSelfTest(),
    validateMembershipDiscountSchemaSelfTest(),
    validateOneAiBridgeMockSelfTest(),
    validateNoRealFeeEngineSelfTest(),
    validateMembershipAuditEventsSelfTest(),
    validateMembershipMobileCardSelfTest(),
  ];
  const issueCount = cards.reduce((n, c) => n + c.issueCount, 0);
  return {
    status: worstStatus(cards),
    issueCount,
    lastChecked: Date.now(),
    cards,
    _mock: true,
  };
}
