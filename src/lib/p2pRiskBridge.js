/**
 * P2P 화면 ↔ @tetherget/core 강경 정책 브리지 (점진 도입).
 * 관리자 스위치: localStorage KYC_ADMIN_SWITCHES_STORAGE_KEY — /owner 에서 편집.
 */

import {
  KycLevel,
  clampKycLevel,
  mergeKycAdminSwitches,
  isStrictIdentityRequiredForAllTrades,
  createTradeDraft,
  evaluateTradeCreationPreflightWithSignals,
  evaluateTradingAccessFromSignals,
  collectDeviceFingerprintSignals,
  hashDeviceFingerprintPreferred,
  scoreMultiAccountRisk,
  evaluateBuyerPaymentSentClick,
  requiresHighValuePushAndUiReconfirm,
  getSettlementPolicyForTrade,
  formatHighValueNoticeKrw,
} from "./coreRiskPolicy.js";
import { estimateListingNotional } from "../utils/p2pListingUiMeta.js";

export const KYC_ADMIN_SWITCHES_STORAGE_KEY = "tetherget_kyc_admin_switches_v1";

export function loadKycAdminSwitches() {
  try {
    const raw = localStorage.getItem(KYC_ADMIN_SWITCHES_STORAGE_KEY);
    if (raw) return mergeKycAdminSwitches(JSON.parse(raw));
  } catch {
    /* ignore */
  }
  if (import.meta.env.DEV) {
    return mergeKycAdminSwitches({ requireVerifiedIdentityForAllTrades: false });
  }
  return mergeKycAdminSwitches({});
}

function readStoredSwitchPartial() {
  try {
    const raw = localStorage.getItem(KYC_ADMIN_SWITCHES_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** 오너 콘솔에서 스위치 일부만 덮어쓸 때 */
export function saveKycAdminSwitchesPartial(partial) {
  const merged = mergeKycAdminSwitches({ ...readStoredSwitchPartial(), ...partial });
  localStorage.setItem(
    KYC_ADMIN_SWITCHES_STORAGE_KEY,
    JSON.stringify({
      kycPipelineEnabled: merged.kycPipelineEnabled,
      identityDocumentUploadEnabled: merged.identityDocumentUploadEnabled,
      requireVerifiedIdentityForAllTrades: merged.requireVerifiedIdentityForAllTrades,
      automatedReviewEnabled: merged.automatedReviewEnabled,
      enforceLevelRequirements: merged.enforceLevelRequirements,
    }),
  );
  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("tgx-kyc-switches-changed"));
    }
  } catch {
    /* ignore */
  }
  return merged;
}

export function resolveIdentityFlag(raw, switches) {
  if (!isStrictIdentityRequiredForAllTrades(switches)) return true;
  return raw === true || raw === 1 || raw === "1" || raw === "true";
}

/** 스위치 ON일 때 로컬 데모용: localStorage tetherget_identity_ok_<userId> = "1" */
export function resolveMeIdentity(userId, switches) {
  if (!isStrictIdentityRequiredForAllTrades(switches)) return true;
  if (userId == null) return false;
  try {
    return localStorage.getItem(`tetherget_identity_ok_${userId}`) === "1";
  } catch {
    return false;
  }
}

export function matchedOrderToTradeDraft(row) {
  const fiat = estimateListingNotional(row);
  const cur = row.payment_method || "KRW";
  return createTradeDraft({
    id: String(row.id),
    buyerUserId: String(row.buyer_user_id ?? ""),
    sellerUserId: String(row.seller_user_id ?? ""),
    amountFiat: fiat,
    currency: cur,
    friendMatch: Boolean(row.friend_match),
    buyerKycLevel: clampKycLevel(Number(row.buyer_kyc_level ?? KycLevel.STANDARD)),
    sellerKycLevel: clampKycLevel(Number(row.seller_kyc_level ?? KycLevel.STANDARD)),
  });
}

export function buildEscrowFromP2pRow(row) {
  return {
    onchainEscrowId: String(row.onchain_escrow_id || row.escrow_onchain_id || `p2p-${row.id}`),
    buyerAck: "pending",
  };
}

export function matchedOrderPartyFlags(row, switches) {
  return {
    buyer: { identityDocumentVerified: resolveIdentityFlag(row.buyer_identity_verified, switches) },
    seller: { identityDocumentVerified: resolveIdentityFlag(row.seller_identity_verified, switches) },
  };
}

/** 호가 매수(테이크): 매수자=현재 사용자, 매도자=등록자 */
export function listingTakePartyFlags(row, takerUserId, switches) {
  return {
    buyer: { identityDocumentVerified: resolveMeIdentity(takerUserId, switches) },
    seller: { identityDocumentVerified: resolveIdentityFlag(row.seller_identity_verified, switches) },
  };
}

/** IP·지문·multi-account 등 클라 보안 시그널 — 서버와 동일 규칙 재현 시 값 주입 */
export async function buildDefaultP2pRawSignals() {
  const digest = await hashDeviceFingerprintPreferred(collectDeviceFingerprintSignals());
  return {
    nowMs: Date.now(),
    clientIp: typeof window !== "undefined" ? window.__TGX_CLIENT_IP__ || "" : "",
    ipBlacklist: [],
    fingerprintDigest: digest,
    deviceFingerprintBlacklist: [],
    userUnderAutoBlock: false,
    multiAccountScore: scoreMultiAccountRisk({
      distinctUsersOnSameIp: 0,
      distinctUsersOnSameFingerprint: 0,
      isNewAccount: false,
    }),
  };
}

export async function preflightTakeListing(row, takerUserId) {
  const switches = loadKycAdminSwitches();
  const parties = listingTakePartyFlags(row, takerUserId, switches);
  const rawSignals = await buildDefaultP2pRawSignals();
  return evaluateTradeCreationPreflightWithSignals({
    kycSwitches: switches,
    buyer: parties.buyer,
    seller: parties.seller,
    rawSignals,
  });
}

/**
 * 매칭된 주문에서 다음 단계(송금 신청 등) 전 — 양측 신분증 게이트 + 보안 시그널.
 * (매수 테이크와 동일 코어 규칙, 역할만 고정된 행 사용)
 */
export async function preflightMatchedTradeContinue(row) {
  const switches = loadKycAdminSwitches();
  const parties = matchedOrderPartyFlags(row, switches);
  const rawSignals = await buildDefaultP2pRawSignals();
  return evaluateTradeCreationPreflightWithSignals({
    kycSwitches: switches,
    buyer: parties.buyer,
    seller: parties.seller,
    rawSignals,
  });
}

/**
 * 판매 호가 등록 — 매도자 신분증(스위치 ON 시) + 보안 시그널만 검사 (매수자 미정이라 양측 게이트 불가)
 */
export async function preflightSellerNewListing(sellerUserId) {
  const switches = loadKycAdminSwitches();
  if (isStrictIdentityRequiredForAllTrades(switches)) {
    const sellerOk = resolveMeIdentity(sellerUserId, switches);
    if (!sellerOk) {
      return {
        allowed: false,
        errors: [
          "판매 등록에는 신분증 검증 완료가 필요합니다. (/owner 또는 관리자 KYC 탭에서 스위치·데모 플래그 확인)",
        ],
      };
    }
  }
  const rawSignals = await buildDefaultP2pRawSignals();
  const access = evaluateTradingAccessFromSignals(rawSignals);
  if (!access.allowed) {
    return { allowed: false, errors: access.denialReasons.map((r) => `[security] ${r}`) };
  }
  return { allowed: true, errors: [] };
}

/**
 * @param {object} opts
 * @param {boolean} [opts.pushOk] 고액일 때 푸시 확인
 * @param {boolean} [opts.modalOk] 고액일 때 앱 재확인
 */
export function checkBuyerMarkPaid(row, actingUserId, opts = {}) {
  const switches = loadKycAdminSwitches();
  const trade = matchedOrderToTradeDraft(row);
  const escrow = buildEscrowFromP2pRow(row);
  const needHv = requiresHighValuePushAndUiReconfirm(trade.amountFiat, trade.currency);
  const buyerOk =
    resolveIdentityFlag(row.buyer_identity_verified, switches) || resolveMeIdentity(actingUserId, switches);
  return evaluateBuyerPaymentSentClick({
    trade,
    escrow,
    actingUserId: String(actingUserId),
    buyerIdentityDocumentVerified: buyerOk,
    userConfirmedHighValueModal: needHv ? Boolean(opts.modalOk) : true,
    pushNotificationAcknowledged: needHv ? Boolean(opts.pushOk) : undefined,
  });
}

export function settlementHintForRow(row) {
  const pol = getSettlementPolicyForTrade(matchedOrderToTradeDraft(row));
  if (pol.mode === "instant_release_path") return pol.reason;
  return `${pol.reason} · 약 ${pol.delayHours}시간`;
}

export function highValueNoticeLineForRow(row) {
  const t = matchedOrderToTradeDraft(row);
  return formatHighValueNoticeKrw(t.amountFiat);
}
