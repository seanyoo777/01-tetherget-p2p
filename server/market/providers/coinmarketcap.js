import {
  FALLBACK_FIAT,
  FALLBACK_COIN,
  deepMergeFiat,
  buildCoinRatesFromKrwPrices,
  patchFiatFromCmcQuote,
} from "../priceFeedCore.js";

const DEFAULT_CMC_SYMBOLS = "BTC,ETH,SOL,USDT";
const DEFAULT_CMC_CONVERT = "KRW,USD,VND,JPY";

let warnedCmcMissingKey = false;

/** @type {import("./types.js").PriceFeedHandler} */
export default async function fetchCoinmarketcap(ctx) {
  const apiKey = String(process.env.PRICE_FEED_CMC_API_KEY || "").trim();
  if (!apiKey) {
    if (!warnedCmcMissingKey) {
      warnedCmcMissingKey = true;
      console.warn("[priceFeed] coinmarketcap requested but PRICE_FEED_CMC_API_KEY missing; using coingecko");
    }
    return ctx.delegate("coingecko");
  }

  const symbols = String(process.env.PRICE_FEED_CMC_SYMBOLS || DEFAULT_CMC_SYMBOLS).trim();
  const convert = String(process.env.PRICE_FEED_CMC_CONVERT || DEFAULT_CMC_CONVERT).trim();
  const params = new URLSearchParams({ symbol: symbols, convert });
  const url = `https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?${params}`;
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "X-CMC_PRO_API_KEY": apiKey,
      },
    });
    const data = await res.json();
    if (!res.ok) {
      const msg = data?.status?.error_message || `coinmarketcap http ${res.status}`;
      throw new Error(msg);
    }
    const bucket = data?.data;
    if (!bucket || typeof bucket !== "object") throw new Error("coinmarketcap invalid json");

    const fiatPatch = {};
    for (const row of Object.values(bucket)) {
      if (!row || typeof row !== "object") continue;
      const sym = String(row.symbol || "").toUpperCase();
      if (!["BTC", "ETH", "SOL", "USDT"].includes(sym)) continue;
      const rowPatch = patchFiatFromCmcQuote(row.quote);
      if (Object.keys(rowPatch).length) fiatPatch[sym] = rowPatch;
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
      provider: "coinmarketcap",
      sourceLabel: "pro-api.coinmarketcap.com (aggregate)",
      fiatRates,
      coinRates,
      fetchedAt: ctx.fetchedAt,
      symbolsQueried: symbols,
      convertCurrencies: convert,
    };
  } catch (error) {
    console.warn("[priceFeed] coinmarketcap fetch failed, using static fallback:", error?.message || error);
    return {
      provider: "coinmarketcap",
      sourceLabel: "fallback (coinmarketcap unreachable)",
      fiatRates: structuredClone(FALLBACK_FIAT),
      coinRates: structuredClone(FALLBACK_COIN),
      fetchedAt: ctx.fetchedAt,
      error: String(error?.message || error),
    };
  }
}
