import {
  FALLBACK_FIAT,
  FALLBACK_COIN,
  deepMergeFiat,
  buildCoinRatesFromKrwPrices,
} from "../priceFeedCore.js";

const DEFAULT_UPBIT_MARKETS = "KRW-BTC,KRW-ETH,KRW-USDT,KRW-SOL";

/** @type {import("./types.js").PriceFeedHandler} */
export default async function fetchUpbit(ctx) {
  const markets = String(process.env.PRICE_FEED_UPBIT_MARKETS || DEFAULT_UPBIT_MARKETS).trim();
  const url = `https://api.upbit.com/v1/ticker?markets=${encodeURIComponent(markets)}`;
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`upbit http ${res.status}`);
    const rows = await res.json();
    if (!Array.isArray(rows)) throw new Error("upbit invalid json");

    const krw = { USDT: null, BTC: null, ETH: null, SOL: null };
    for (const row of rows) {
      const m = row.market;
      const p = Number(row.trade_price);
      if (!Number.isFinite(p) || p <= 0) continue;
      if (m === "KRW-USDT") krw.USDT = p;
      if (m === "KRW-BTC") krw.BTC = p;
      if (m === "KRW-ETH") krw.ETH = p;
      if (m === "KRW-SOL") krw.SOL = p;
    }

    const fiatPatch = {};
    if (krw.USDT) fiatPatch.USDT = { KRW: Math.round(krw.USDT) };
    if (krw.BTC) fiatPatch.BTC = { KRW: Math.round(krw.BTC) };
    if (krw.ETH) fiatPatch.ETH = { KRW: Math.round(krw.ETH) };
    if (krw.SOL) fiatPatch.SOL = { KRW: Math.round(krw.SOL) };

    const mergedKrw = {
      USDT: krw.USDT || FALLBACK_FIAT.USDT.KRW,
      BTC: krw.BTC || FALLBACK_FIAT.BTC.KRW,
      ETH: krw.ETH || FALLBACK_FIAT.ETH.KRW,
      SOL: krw.SOL || FALLBACK_FIAT.SOL.KRW,
    };

    const fiatRates = deepMergeFiat(FALLBACK_FIAT, fiatPatch);
    const coinRates = buildCoinRatesFromKrwPrices(mergedKrw);

    return {
      provider: "upbit",
      sourceLabel: "api.upbit.com (public)",
      fiatRates,
      coinRates,
      fetchedAt: ctx.fetchedAt,
      marketsQueried: markets,
    };
  } catch (error) {
    console.warn("[priceFeed] upbit fetch failed, using static fallback:", error?.message || error);
    return {
      provider: "upbit",
      sourceLabel: "fallback (upbit unreachable)",
      fiatRates: structuredClone(FALLBACK_FIAT),
      coinRates: structuredClone(FALLBACK_COIN),
      fetchedAt: ctx.fetchedAt,
      error: String(error?.message || error),
    };
  }
}
