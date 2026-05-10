import {
  FALLBACK_FIAT,
  FALLBACK_COIN,
  deepMergeFiat,
  buildCoinRatesFromKrwPrices,
  patchFiatFromCoingeckoRow,
} from "../priceFeedCore.js";

const DEFAULT_COINGECKO_IDS = "bitcoin,ethereum,solana,tether";
const DEFAULT_COINGECKO_VS = "krw,usd,vnd,jpy";

const COINGECKO_ID_TO_ASSET = {
  bitcoin: "BTC",
  ethereum: "ETH",
  solana: "SOL",
  tether: "USDT",
};

/** @type {import("./types.js").PriceFeedHandler} */
export default async function fetchCoingecko(ctx) {
  const ids = String(process.env.PRICE_FEED_COINGECKO_IDS || DEFAULT_COINGECKO_IDS).trim();
  const vs = String(process.env.PRICE_FEED_COINGECKO_VS || DEFAULT_COINGECKO_VS).trim();
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=${encodeURIComponent(vs)}`;
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "tetherget-price-feed/1.0",
      },
    });
    if (!res.ok) throw new Error(`coingecko http ${res.status}`);
    const data = await res.json();
    if (!data || typeof data !== "object") throw new Error("coingecko invalid json");

    const fiatPatch = {};
    for (const [cgId, asset] of Object.entries(COINGECKO_ID_TO_ASSET)) {
      const rowPatch = patchFiatFromCoingeckoRow(data[cgId]);
      if (Object.keys(rowPatch).length) fiatPatch[asset] = rowPatch;
    }

    const fiatRates = deepMergeFiat(FALLBACK_FIAT, fiatPatch);
    const mergedKrw = {
      USDT: fiatRates.USDT.KRW,
      BTC: fiatRates.BTC.KRW,
      ETH: fiatRates.ETH.KRW,
      SOL: fiatRates.SOL.KRW,
    };
    const coinRates = buildCoinRatesFromKrwPrices(mergedKrw);

    return {
      provider: "coingecko",
      sourceLabel: "api.coingecko.com (global aggregate)",
      fiatRates,
      coinRates,
      fetchedAt: ctx.fetchedAt,
      idsQueried: ids,
      vsCurrencies: vs,
    };
  } catch (error) {
    console.warn("[priceFeed] coingecko fetch failed, using static fallback:", error?.message || error);
    return {
      provider: "coingecko",
      sourceLabel: "fallback (coingecko unreachable)",
      fiatRates: structuredClone(FALLBACK_FIAT),
      coinRates: structuredClone(FALLBACK_COIN),
      fetchedAt: ctx.fetchedAt,
      error: String(error?.message || error),
    };
  }
}
