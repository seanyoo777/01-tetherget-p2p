/**
 * Admin self-test mock models (pure, no DB / payout).
 */
import {
  normalizeStageLabel,
  mapAuthUserToMember,
  SALES_LEVEL_STAGES,
  ADMIN_STAGE_LABEL,
} from "./adminMemberModel.js";
import { deriveMatrixStatus } from "../p2p/p2pStatusMatrix.js";
import { mapCanonicalEscrowToDisplay } from "../p2p/p2pEscrowDisplay.js";
import { MOCK_REFERRAL_SUMMARY } from "../mock/p2pTradeFlowMock.js";

export const ADMIN_SELF_TEST_STATUS = Object.freeze({
  PASS: "pass",
  WARN: "warn",
  FAIL: "fail",
});

/** @type {Record<string, { received: number, child: number }>} */
export const MOCK_STAGE_REFERRAL_RATES = Object.freeze({
  [ADMIN_STAGE_LABEL.SUPER_PAGE]: { received: 50, child: 45 },
  [ADMIN_STAGE_LABEL.HQ_ADMIN]: { received: 48, child: 44 },
  [ADMIN_STAGE_LABEL.HQ_STAFF]: { received: 46, child: 42 },
  [SALES_LEVEL_STAGES[0]]: { received: 45, child: 40 },
  [SALES_LEVEL_STAGES[1]]: { received: 40, child: 35 },
  [SALES_LEVEL_STAGES[2]]: { received: 35, child: 30 },
});

const DEFAULT_BUYER_FEE_BPS = 25;
const DEFAULT_SELLER_FEE_BPS = 15;

/**
 * @param {string} stageLabel
 */
export function getMockStageReferralRates(stageLabel) {
  const stage = normalizeStageLabel(stageLabel);
  return MOCK_STAGE_REFERRAL_RATES[stage] ?? { received: 35, child: 30 };
}

/**
 * @param {string} stageLabel
 */
export function getMockLevelBadge(stageLabel) {
  const stage = normalizeStageLabel(stageLabel);
  if (stage === ADMIN_STAGE_LABEL.SUPER_PAGE) return "SUPER";
  if (stage === ADMIN_STAGE_LABEL.HQ_ADMIN || stage === ADMIN_STAGE_LABEL.HQ_STAFF) return "HQ";
  const m = stage.match(/^LEVEL\s+(\d+)$/i);
  if (m) return `L${m[1]}`;
  return stage.slice(0, 8) || "MEM";
}

/**
 * @param {{ notionalUsdt?: number, buyerFeeBps?: number, sellerFeeBps?: number, receivedRate?: number, childRate?: number }} params
 */
export function computeMockFeeBreakdown(params = {}) {
  const notional = Number(params.notionalUsdt ?? 1000);
  const buyerBps = Number(params.buyerFeeBps ?? DEFAULT_BUYER_FEE_BPS);
  const sellerBps = Number(params.sellerFeeBps ?? DEFAULT_SELLER_FEE_BPS);
  const received = Number(params.receivedRate ?? 40);
  const child = Number(params.childRate ?? 35);

  const buyerFee = Math.round((notional * buyerBps) / 10_000 * 100) / 100;
  const sellerFee = Math.round((notional * sellerBps) / 10_000 * 100) / 100;
  const totalFee = Math.round((buyerFee + sellerFee) * 100) / 100;
  const spreadPct = Math.max(0, received - child);
  const referralShare = Math.round((totalFee * (spreadPct / 100)) * 100) / 100;
  const companyShare = Math.round((totalFee - referralShare) * 100) / 100;

  return {
    notionalUsdt: notional,
    buyerFeeBps: buyerBps,
    sellerFeeBps: sellerBps,
    buyerFee,
    sellerFee,
    totalFee,
    referralShare,
    companyShare,
    spreadPct,
    marginOk: received >= child,
    _mock: true,
  };
}

/**
 * @param {object} user
 * @param {string} fromLevel
 * @param {string} toLevel
 */
export function simulateLevelTransition(user, fromLevel, toLevel) {
  const before = mapAuthUserToMember(
    { ...user, stage_label: normalizeStageLabel(fromLevel) },
    0,
  );
  const afterRow = mapAuthUserToMember(
    { ...user, stage_label: normalizeStageLabel(toLevel) },
    0,
  );
  const fromRates = getMockStageReferralRates(fromLevel);
  const toRates = getMockStageReferralRates(toLevel);
  const fromStage = normalizeStageLabel(fromLevel);
  const toStage = normalizeStageLabel(toLevel);

  return {
    fromLevel: fromStage,
    toLevel: toStage,
    fromBadge: getMockLevelBadge(fromLevel),
    toBadge: getMockLevelBadge(toLevel),
    fromRates,
    toRates,
    tableBefore: {
      stageLabel: before.stageLabel || fromStage,
      receivedRate: fromRates.received,
      childRate: fromRates.child,
      marginRate: fromRates.received - fromRates.child,
    },
    tableAfter: {
      stageLabel: afterRow.stageLabel || toStage,
      receivedRate: toRates.received,
      childRate: toRates.child,
      marginRate: toRates.received - toRates.child,
    },
    referralSummaryLevel: MOCK_REFERRAL_SUMMARY.level,
    referralSummaryLabel: MOCK_REFERRAL_SUMMARY.levelLabel,
    _mock: true,
  };
}

/**
 * @param {string} status
 * @param {string} message
 * @param {object} [detail]
 */
export function makeCheck(status, message, detail = null) {
  return { status, message, detail, _mock: true };
}

/**
 * @param {Array<{ status: string }>} checks
 */
export function worstStatus(checks) {
  if (checks.some((c) => c.status === ADMIN_SELF_TEST_STATUS.FAIL)) return ADMIN_SELF_TEST_STATUS.FAIL;
  if (checks.some((c) => c.status === ADMIN_SELF_TEST_STATUS.WARN)) return ADMIN_SELF_TEST_STATUS.WARN;
  return ADMIN_SELF_TEST_STATUS.PASS;
}

/**
 * @param {object} row
 * @param {boolean} [dispute]
 */
/**
 * Append-only mock audit trail (newest first, capped).
 * @param {Array<{ t: string, line: string }>} trail
 * @param {string} line
 * @param {number} [maxLen]
 */
export function mockAppendAuditEntry(trail, line, maxLen = 100) {
  const entry = { t: new Date().toISOString(), line, _mock: true };
  const prev = Array.isArray(trail) ? trail : [];
  return [entry, ...prev].slice(0, maxLen);
}

export function validateTradeStatusRow(row, dispute = false) {
  const matrix = deriveMatrixStatus(row, dispute);
  const escrowCanon = row?.escrow_lifecycle ?? row?.escrow ?? "locked";
  const display = mapCanonicalEscrowToDisplay(escrowCanon, matrix);
  const ok = Boolean(matrix) && Boolean(display);
  return makeCheck(
    ok ? ADMIN_SELF_TEST_STATUS.PASS : ADMIN_SELF_TEST_STATUS.FAIL,
    ok ? `matrix ${matrix} · escrow ${display}` : "status mapping failed",
    { db_status: row?.status, matrix, escrowDisplay: display },
  );
}
