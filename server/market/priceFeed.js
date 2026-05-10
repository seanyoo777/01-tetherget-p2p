/**
 * 시세 스냅샷 진입점. 출처별 구현은 ./providers/ 와 ./priceFeedCore.js 에 분리되어 있습니다.
 *
 * 확장 방법:
 * 1) 정식 내장: server/market/providers/<이름>.js 를 만들고 default export 로 async (ctx) => snapshot 을 구현한 뒤
 *    providers/index.js 의 builtinPriceFeedProviders 에 등록합니다.
 * 2) 런타임/플러그인: 서버 기동 시 registerPriceFeedProvider("이름", handler) 로 같은 시그니처의 핸들러를 넣습니다.
 *    (내장 id 와 동일 키면 커스텀이 우선합니다.)
 *
 * ctx: { providerId, fetchedAt, options, delegate(nextId) }
 */

import { resolvePriceFeedProvider, FALLBACK_FIAT, FALLBACK_COIN } from "./priceFeedCore.js";
import { builtinPriceFeedProviders, BUILTIN_PRICE_FEED_IDS } from "./providers/index.js";

/** @type {Record<string, import("./providers/types.js").PriceFeedHandler>} */
const customProviders = Object.create(null);

/**
 * @param {string} id
 * @param {import("./providers/types.js").PriceFeedHandler} handler
 */
export function registerPriceFeedProvider(id, handler) {
  const key = String(id || "").trim().toLowerCase();
  if (!key) throw new Error("registerPriceFeedProvider: id is required");
  if (typeof handler !== "function") throw new Error("registerPriceFeedProvider: handler must be a function");
  customProviders[key] = handler;
}

/** @returns {string[]} */
export function listPriceFeedProviders() {
  return [...new Set([...Object.keys(builtinPriceFeedProviders), ...Object.keys(customProviders)])].sort();
}

/** 내장으로 번들된 제공자 id (문서·헬스용) */
export function listBuiltinPriceFeedProviders() {
  return [...BUILTIN_PRICE_FEED_IDS];
}

function unknownProviderSnapshot(providerId, fetchedAt) {
  return {
    provider: providerId,
    sourceLabel: "unknown-provider",
    fiatRates: structuredClone(FALLBACK_FIAT),
    coinRates: structuredClone(FALLBACK_COIN),
    fetchedAt,
    error: `unsupported PRICE_FEED_PROVIDER: ${providerId}`,
  };
}

/**
 * @param {string} providerId
 * @param {Record<string, unknown>} options
 * @param {string} fetchedAt
 * @param {(id: string) => Promise<object>} delegate
 */
async function runPriceFeedProvider(providerId, options, fetchedAt, delegate) {
  const handler = customProviders[providerId] || builtinPriceFeedProviders[providerId];
  if (!handler) return unknownProviderSnapshot(providerId, fetchedAt);

  /** @type {import("./providers/types.js").PriceFeedContext} */
  const ctx = {
    providerId,
    fetchedAt,
    options,
    delegate,
  };
  return handler(ctx);
}

/**
 * @param {Record<string, unknown>} [options]
 */
export async function buildPriceSnapshot(options = {}) {
  const providerId = resolvePriceFeedProvider(options.provider);
  const fetchedAt = new Date().toISOString();

  /** @param {string} nextId */
  function delegate(nextId) {
    const id = String(nextId || "").trim().toLowerCase();
    return runPriceFeedProvider(id, options, fetchedAt, delegate);
  }

  return runPriceFeedProvider(providerId, options, fetchedAt, delegate);
}

export { FALLBACK_FIAT, FALLBACK_COIN };
export { resolvePriceFeedProvider } from "./priceFeedCore.js";
