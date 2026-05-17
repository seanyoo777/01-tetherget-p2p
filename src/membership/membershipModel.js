import { computeMockFeeBreakdown } from "../admin/adminSelfTestModel.js";
import {
  computeTierProgress,
  getMembershipTierById,
  resolveTierFromPoints,
} from "./membershipTiers.js";
import { isMembershipDiscountEnabled } from "./membershipFeatureFlags.js";
import { appendMembershipAuditEvent, MEMBERSHIP_AUDIT_EVENT } from "./membershipAudit.js";
import { bridgeMembershipLevelUpdated } from "../notifications/notificationHelpers.js";

export const TG_MEMBERSHIP_MOCK_STORAGE_KEY = "tg_membership_mock_v1";

/** @type {readonly string[]} */
export const ONEAI_SYNC_STATUSES = Object.freeze(["mock_idle", "mock_pending", "mock_synced"]);

export const DEFAULT_MEMBERSHIP_MOCK_STATE = Object.freeze({
  oneAiPoints: 6_200,
  oneAiSyncStatus: "mock_synced",
  lastSyncAt: null,
  auditTrail: [],
  _mock: true,
});

/**
 * @param {object} [raw]
 */
export function normalizeMembershipMockState(raw = {}) {
  const points = Math.max(0, Number(raw.oneAiPoints ?? DEFAULT_MEMBERSHIP_MOCK_STATE.oneAiPoints) || 0);
  const tier = resolveTierFromPoints(points);
  const sync = ONEAI_SYNC_STATUSES.includes(raw.oneAiSyncStatus)
    ? raw.oneAiSyncStatus
    : DEFAULT_MEMBERSHIP_MOCK_STATE.oneAiSyncStatus;
  return {
    oneAiPoints: points,
    tierId: tier.id,
    tierLabel: tier.label,
    discountPct: tier.discountPct,
    oneAiSyncStatus: sync,
    lastSyncAt: raw.lastSyncAt ?? null,
    auditTrail: Array.isArray(raw.auditTrail) ? raw.auditTrail.slice(0, 50) : [],
    progress: computeTierProgress(points),
    _mock: true,
  };
}

/**
 * @param {object} state
 * @param {string} eventType
 * @param {object} [detail]
 */
export function withMembershipAudit(state, eventType, detail = {}) {
  const trail = appendMembershipAuditEvent(state.auditTrail ?? [], eventType, detail);
  return normalizeMembershipMockState({ ...state, auditTrail: trail });
}

/**
 * @param {{ notionalUsdt?: number, points?: number, tierId?: string, buyerFeeBps?: number, sellerFeeBps?: number, enabled?: boolean }} params
 */
export function computeMembershipFeePreview(params = {}) {
  const notional = Number(params.notionalUsdt ?? 1000);
  const enabled = params.enabled ?? isMembershipDiscountEnabled();
  const tier =
    params.tierId != null
      ? getMembershipTierById(params.tierId)
      : resolveTierFromPoints(params.points ?? 0);
  const base = computeMockFeeBreakdown({
    notionalUsdt: notional,
    buyerFeeBps: params.buyerFeeBps,
    sellerFeeBps: params.sellerFeeBps,
  });
  const discountPct = enabled ? tier.discountPct : 0;
  const discountAmount = Math.round((base.totalFee * (discountPct / 100)) * 100) / 100;
  const discountedTotalFee = Math.round((base.totalFee - discountAmount) * 100) / 100;

  const preview = {
    ...base,
    tier,
    discountPct,
    discountAmount,
    discountedTotalFee,
    membershipEnabled: enabled,
    noRealFeeEngine: true,
    _mock: true,
  };

  return preview;
}

/**
 * Mock OneAI sync (no HTTP).
 * @param {object} state
 */
export function mockSyncOneAiMembership(state) {
  const next = withMembershipAudit(
    { ...state, oneAiSyncStatus: "mock_pending" },
    MEMBERSHIP_AUDIT_EVENT.SYNC_MOCK,
    { action: "start" },
  );
  const synced = normalizeMembershipMockState({
    ...next,
    oneAiSyncStatus: "mock_synced",
    lastSyncAt: Date.now(),
  });
  bridgeMembershipLevelUpdated(synced.tierLabel || synced.tierId || "updated");
  return synced;
}

/**
 * @param {object} state
 */
export function recordMembershipLevelMock(state) {
  const next = withMembershipAudit(state, MEMBERSHIP_AUDIT_EVENT.LEVEL_MOCK, {
    tierId: state.tierId,
    points: state.oneAiPoints,
  });
  return next;
}

/**
 * @param {object} state
 * @param {object} preview
 */
export function recordMembershipDiscountPreview(state, preview) {
  return withMembershipAudit(state, MEMBERSHIP_AUDIT_EVENT.DISCOUNT_PREVIEW, {
    notionalUsdt: preview.notionalUsdt,
    discountPct: preview.discountPct,
    discountAmount: preview.discountAmount,
  });
}

/**
 * @returns {object}
 */
export function loadMembershipMockState() {
  if (typeof localStorage === "undefined") {
    return normalizeMembershipMockState(DEFAULT_MEMBERSHIP_MOCK_STATE);
  }
  try {
    const raw = localStorage.getItem(TG_MEMBERSHIP_MOCK_STORAGE_KEY);
    if (!raw) return normalizeMembershipMockState(DEFAULT_MEMBERSHIP_MOCK_STATE);
    return normalizeMembershipMockState(JSON.parse(raw));
  } catch {
    return normalizeMembershipMockState(DEFAULT_MEMBERSHIP_MOCK_STATE);
  }
}

/**
 * @param {object} state
 */
export function saveMembershipMockState(state) {
  if (typeof localStorage === "undefined") return state;
  try {
    const normalized = normalizeMembershipMockState(state);
    localStorage.setItem(TG_MEMBERSHIP_MOCK_STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
  } catch {
    return normalizeMembershipMockState(state);
  }
}
