/**
 * P2P 주문 API ↔ @tetherget/core 동일 게이트 (서버 이중 검증).
 * 클라 p2pRiskBridge와 같은 규칙 — 원시 시그널은 요청 헤더로 선택적 주입.
 */

import {
  mergeKycAdminSwitches,
  evaluateTradeCreationPreflightWithSignals,
  evaluateBuyerPaymentSentClick,
  evaluateTradingAccessFromSignals,
  scoreMultiAccountRisk,
  createTradeDraft,
  clampKycLevel,
  KycLevel,
  isStrictIdentityRequiredForAllTrades,
} from "@tetherget/core";
import { financialMinorToMajor } from "../finance/moneyAmount.js";

export const KYC_ADMIN_SWITCHES_SETTING_KEY = "kyc.admin_switches_v1";

function parseMeta(row) {
  try {
    return JSON.parse(row.metadata_json || "{}");
  } catch {
    return {};
  }
}

function readPartialFromDb(db) {
  const row = db.prepare("SELECT value_json FROM platform_settings WHERE setting_key = ?").get(KYC_ADMIN_SWITCHES_SETTING_KEY);
  if (!row?.value_json) return {};
  try {
    return JSON.parse(row.value_json);
  } catch {
    return {};
  }
}

/** 플랫폼 설정(JSON) — 클라 localStorage와 동일 필드 묶음 */
export function loadKycAdminSwitches(db) {
  return mergeKycAdminSwitches(readPartialFromDb(db));
}

export function upsertKycAdminSwitches(db, partial, updatedByUserId) {
  const merged = mergeKycAdminSwitches({ ...readPartialFromDb(db), ...partial });
  const payload = {
    kycPipelineEnabled: merged.kycPipelineEnabled,
    identityDocumentUploadEnabled: merged.identityDocumentUploadEnabled,
    requireVerifiedIdentityForAllTrades: merged.requireVerifiedIdentityForAllTrades,
    automatedReviewEnabled: merged.automatedReviewEnabled,
    enforceLevelRequirements: merged.enforceLevelRequirements,
  };
  db.prepare(`
    INSERT INTO platform_settings (setting_key, value_json, updated_by_user_id, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(setting_key) DO UPDATE SET
      value_json = excluded.value_json,
      updated_by_user_id = excluded.updated_by_user_id,
      updated_at = CURRENT_TIMESTAMP
  `).run(KYC_ADMIN_SWITCHES_SETTING_KEY, JSON.stringify(payload), updatedByUserId ?? null);
  return merged;
}

function getKycProfile(db, userId) {
  if (userId == null || !Number.isFinite(Number(userId))) return null;
  return db.prepare("SELECT * FROM kyc_profiles WHERE user_id = ?").get(Number(userId));
}

/** 서버 신뢰 플래그 — 프로필 심사 상태 기준 (클라 resolveIdentityFlag와 정합) */
export function isUserIdentityVerified(db, userId) {
  const p = getKycProfile(db, userId);
  if (!p) return false;
  return Boolean(
    p.id_image_uploaded &&
      p.bank_account_uploaded &&
      p.account_name_matched &&
      String(p.company_approval_status || "").includes("승인"),
  );
}

function getUserKycLevel(db, userId) {
  const row = db.prepare("SELECT sales_level FROM users WHERE id = ?").get(Number(userId));
  const n = Number(row?.sales_level ?? KycLevel.STANDARD);
  return clampKycLevel(Number.isFinite(n) ? n : KycLevel.STANDARD);
}

export function estimateOrderFiatKrw(row) {
  const amt = Number(financialMinorToMajor(row.amount_minor));
  const px = Number(financialMinorToMajor(row.unit_price_minor));
  if (!Number.isFinite(amt) || !Number.isFinite(px)) return 0;
  return amt * px;
}

function tradeDraftFromMatchedRow(db, row) {
  const meta = parseMeta(row);
  return createTradeDraft({
    id: String(row.id),
    buyerUserId: String(row.buyer_user_id ?? ""),
    sellerUserId: String(row.seller_user_id ?? ""),
    amountFiat: estimateOrderFiatKrw(row),
    currency: row.payment_method || "KRW",
    friendMatch: Boolean(meta.friend_match),
    buyerKycLevel: getUserKycLevel(db, row.buyer_user_id),
    sellerKycLevel: getUserKycLevel(db, row.seller_user_id),
  });
}

function tradeDraftFromListingTake(db, listingRow, takerUserId) {
  const meta = parseMeta(listingRow);
  return createTradeDraft({
    id: String(listingRow.id),
    buyerUserId: String(takerUserId),
    sellerUserId: String(listingRow.seller_user_id ?? ""),
    amountFiat: estimateOrderFiatKrw(listingRow),
    currency: listingRow.payment_method || "KRW",
    friendMatch: Boolean(meta.friend_match),
    buyerKycLevel: getUserKycLevel(db, takerUserId),
    sellerKycLevel: getUserKycLevel(db, listingRow.seller_user_id),
  });
}

/** 서버 SQLite denylist → 코어 IpBlacklistEntry (헤더 시그널과 합산) */
function loadServerIpDenylist(db) {
  if (!db) return [];
  try {
    const rows = db.prepare(`SELECT cidr_or_ip, reason, permanent, expires_at_ms FROM risk_ip_denylist`).all();
    return rows
      .map((r) => ({
        cidrOrIp: String(r.cidr_or_ip || "").trim(),
        reason: String(r.reason || "server_denylist"),
        permanent: Number(r.permanent) === 1,
        expiresAt: r.expires_at_ms != null ? Number(r.expires_at_ms) : undefined,
      }))
      .filter((e) => e.cidrOrIp);
  } catch {
    return [];
  }
}

function buildRawSignals(req, db) {
  let extra = {};
  const rawHeader = req.headers["x-tgx-risk-signals"];
  if (typeof rawHeader === "string" && rawHeader.trim()) {
    try {
      extra = JSON.parse(rawHeader);
    } catch {
      extra = {};
    }
  }
  const ip = String(extra.clientIp || req.ip || req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "");
  const digest = String(extra.fingerprintDigest || req.headers["x-tgx-fp-digest"] || "");
  const headerBlacklist = Array.isArray(extra.ipBlacklist) ? extra.ipBlacklist : [];
  const serverDeny = loadServerIpDenylist(db);
  return {
    nowMs: Date.now(),
    clientIp: ip,
    ipBlacklist: [...headerBlacklist, ...serverDeny],
    fingerprintDigest: digest,
    deviceFingerprintBlacklist: Array.isArray(extra.deviceFingerprintBlacklist) ? extra.deviceFingerprintBlacklist : [],
    userUnderAutoBlock: Boolean(extra.userUnderAutoBlock),
    multiAccountScore:
      extra.multiAccountScore && typeof extra.multiAccountScore === "object"
        ? extra.multiAccountScore
        : scoreMultiAccountRisk({
            distinctUsersOnSameIp: 0,
            distinctUsersOnSameFingerprint: 0,
            isNewAccount: false,
          }),
  };
}

function listingPartyFlags(db, listingRow, takerUserId, switches) {
  const sellerOk = isUserIdentityVerified(db, listingRow.seller_user_id);
  const buyerOk = isStrictIdentityRequiredForAllTrades(switches)
    ? isUserIdentityVerified(db, takerUserId)
    : true;
  return {
    buyer: { identityDocumentVerified: buyerOk },
    seller: { identityDocumentVerified: sellerOk },
  };
}

function matchedPartyFlags(db, row, switches) {
  const strict = isStrictIdentityRequiredForAllTrades(switches);
  return {
    buyer: {
      identityDocumentVerified: strict ? isUserIdentityVerified(db, row.buyer_user_id) : true,
    },
    seller: {
      identityDocumentVerified: strict ? isUserIdentityVerified(db, row.seller_user_id) : true,
    },
  };
}

/** 매칭 없는 판매 등록 — 매도자 신분증 + 보안 시그널 */
export function gateSellerCreatesListing(db, req, sellerUserId) {
  const switches = loadKycAdminSwitches(db);
  if (isStrictIdentityRequiredForAllTrades(switches) && !isUserIdentityVerified(db, sellerUserId)) {
    return { ok: false, message: "판매 등록에는 신분증 검증 완료가 필요합니다." };
  }
  const rawSignals = buildRawSignals(req, db);
  const access = evaluateTradingAccessFromSignals(rawSignals);
  if (!access.allowed) {
    return { ok: false, message: access.denialReasons[0] || "[security] 거래 접근이 거부되었습니다." };
  }
  return { ok: true };
}

/** 호가 매수(take) */
export function gateTakeListing(db, req, listingRow, takerUserId) {
  const switches = loadKycAdminSwitches(db);
  const parties = listingPartyFlags(db, listingRow, takerUserId, switches);
  const pre = evaluateTradeCreationPreflightWithSignals({
    kycSwitches: switches,
    buyer: parties.buyer,
    seller: parties.seller,
    rawSignals: buildRawSignals(req, db),
  });
  if (!pre.allowed) {
    return { ok: false, message: pre.errors.join(" · ") || "거래 생성 정책 검증에 실패했습니다." };
  }
  return { ok: true };
}

/** 매칭 후 송금 신청 등 */
export function gateMatchedTradeContinue(db, req, orderRow) {
  const switches = loadKycAdminSwitches(db);
  const parties = matchedPartyFlags(db, orderRow, switches);
  const pre = evaluateTradeCreationPreflightWithSignals({
    kycSwitches: switches,
    buyer: parties.buyer,
    seller: parties.seller,
    rawSignals: buildRawSignals(req, db),
  });
  if (!pre.allowed) {
    return { ok: false, message: pre.errors.join(" · ") || "정책 검증에 실패했습니다." };
  }
  return { ok: true };
}

/** Buyer 송금 완료 표시 — 본문에 고액 플래그(클라 모달·푸시와 동일 키) */
export function gateBuyerMarkPaid(db, req, orderRow, buyerUserId) {
  const switches = loadKycAdminSwitches(db);
  const trade = tradeDraftFromMatchedRow(db, orderRow);
  const escrow = {
    onchainEscrowId: String(parseMeta(orderRow).onchain_escrow_id || orderRow.onchain_escrow_id || `p2p-${orderRow.id}`),
    buyerAck: "pending",
  };
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const pushOk = body.pushNotificationAcknowledged === true || body.push_ok === true;
  const modalOk = body.userConfirmedHighValueModal === true || body.modal_ok === true;

  const gate = evaluateBuyerPaymentSentClick({
    trade,
    escrow,
    actingUserId: String(buyerUserId),
    buyerIdentityDocumentVerified: isUserIdentityVerified(db, buyerUserId),
    userConfirmedHighValueModal: modalOk,
    pushNotificationAcknowledged: pushOk,
  });
  if (!gate.allowed) {
    return { ok: false, message: gate.error || "송금 완료 표시 정책 검증에 실패했습니다." };
  }
  return { ok: true };
}
