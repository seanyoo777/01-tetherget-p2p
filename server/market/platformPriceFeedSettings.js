/**
 * 관리자 플랫폼 설정과 연동되는 시세 출처(market.price_feed).
 * DB 값은 내장 제공자 id 만 허용 — 무효 JSON·미지원 id 는 무시하고 환경변수 규칙으로 폴백합니다.
 */

import { resolvePriceFeedProvider } from "./priceFeedCore.js";
import { BUILTIN_PRICE_FEED_IDS } from "./providers/index.js";

export const MARKET_PRICE_FEED_SETTING_KEY = "market.price_feed";

/** @returns {string | null} 저장된 내장 id. 없거나 무효·상속이면 null (환경변수 규칙 사용). */
export function parseStoredMarketPriceFeedProvider(valueJson) {
  try {
    const j = JSON.parse(valueJson || "{}");
    const p = String(j?.provider ?? "").trim().toLowerCase();
    if (!p || p === "auto") return null;
    if (!BUILTIN_PRICE_FEED_IDS.includes(p)) return null;
    return p;
  } catch {
    return null;
  }
}

/**
 * 관리자 PATCH 입력 정규화.
 * @returns {{ skip: true } | { error: string } | { value: string }}
 */
export function normalizeAdminPriceFeedProviderInput(raw) {
  if (raw === undefined) return { skip: true };
  const t = raw === null ? "" : String(raw).trim().toLowerCase();
  if (t === "" || t === "auto") return { value: "" };
  if (!BUILTIN_PRICE_FEED_IDS.includes(t)) {
    return { error: `지원하지 않는 시세 출처입니다. 허용: ${BUILTIN_PRICE_FEED_IDS.join(", ")} 또는 빈 값(환경변수 규칙).` };
  }
  return { value: t };
}

/** DB 저장용 payload JSON 문자열 (provider 빈 문자열 = 상속). */
export function storageJsonForPriceFeedProvider(canonicalIdOrEmpty) {
  return JSON.stringify({ provider: String(canonicalIdOrEmpty || "").trim().toLowerCase() });
}

/** DB에 id 가 있으면 env 재해석 없이 그 출처로 고정. 없으면 환경변수·자동 규칙. */
export function resolvedPriceFeedProviderFromStored(storedId) {
  if (storedId) return resolvePriceFeedProvider(storedId);
  return resolvePriceFeedProvider(undefined);
}

export function envResolutionPriceFeedProviderId() {
  return resolvePriceFeedProvider(undefined);
}
