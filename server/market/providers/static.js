import { FALLBACK_FIAT, FALLBACK_COIN } from "../priceFeedCore.js";

/** @type {import("./types.js").PriceFeedHandler} */
export default async function fetchStatic(ctx) {
  return {
    provider: "static",
    sourceLabel: "built-in",
    fiatRates: structuredClone(FALLBACK_FIAT),
    coinRates: structuredClone(FALLBACK_COIN),
    fetchedAt: ctx.fetchedAt,
  };
}
