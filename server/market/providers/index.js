/**
 * 내장 시세 제공자 레지스트리.
 * 새 출처: 이 디렉터리에 모듈 추가 후 아래 builtinPriceFeedProviders 에 한 줄 등록.
 */

import fetchStatic from "./static.js";
import fetchCoingecko from "./coingecko.js";
import fetchCoinmarketcap from "./coinmarketcap.js";
import fetchUpbit from "./upbit.js";

/** @type {Record<string, import("./types.js").PriceFeedHandler>} */
export const builtinPriceFeedProviders = {
  static: fetchStatic,
  coingecko: fetchCoingecko,
  coinmarketcap: fetchCoinmarketcap,
  upbit: fetchUpbit,
};

export const BUILTIN_PRICE_FEED_IDS = Object.freeze(Object.keys(builtinPriceFeedProviders).sort());
