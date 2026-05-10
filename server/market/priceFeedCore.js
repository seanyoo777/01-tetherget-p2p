/**
 * 시세 스냅샷 공통 타입·유틸.
 * 새 출처는 providers/ 에 모듈 추가 후 registry 에 등록하거나 registerPriceFeedProvider 로 연결.
 */

export const FALLBACK_FIAT = {
  USDT: { KRW: 1392, USD: 1, VND: 26000, JPY: 156 },
  SOL: { KRW: 238000, USD: 171, VND: 4446000, JPY: 26600 },
  BTC: { KRW: 90000000, USD: 64700, VND: 1682200000, JPY: 10090000 },
  ETH: { KRW: 4300000, USD: 3090, VND: 80340000, JPY: 482000 },
};

export const FALLBACK_COIN = {
  USDT: { USDT: 1, SOL: 0.0058, BTC: 0.000015, ETH: 0.00032 },
  SOL: { USDT: 171, SOL: 1, BTC: 0.0026, ETH: 0.055 },
  BTC: { USDT: 64700, SOL: 378, BTC: 1, ETH: 20.9 },
  ETH: { USDT: 3090, SOL: 18, BTC: 0.048, ETH: 1 },
};

export function deepMergeFiat(base, patch) {
  const out = {};
  for (const asset of Object.keys(base)) {
    out[asset] = { ...base[asset], ...(patch[asset] || {}) };
  }
  return out;
}

export function receiveTypeRoundCrypto(n) {
  if (!Number.isFinite(n) || n === 0) return 0;
  if (n >= 1) return Number(n.toFixed(6));
  if (n >= 0.0001) return Number(n.toFixed(8));
  return Number(n.toPrecision(6));
}

export function buildCoinRatesFromKrwPrices(krwPerUnit) {
  const assets = ["USDT", "BTC", "ETH", "SOL"];
  const prices = {
    USDT: Number(krwPerUnit.USDT),
    BTC: Number(krwPerUnit.BTC),
    ETH: Number(krwPerUnit.ETH),
    SOL: Number(krwPerUnit.SOL),
  };
  const out = {};
  for (const a of assets) {
    out[a] = {};
    for (const b of assets) {
      if (a === b) {
        out[a][b] = 1;
        continue;
      }
      const pa = prices[a];
      const pb = prices[b];
      if (!Number.isFinite(pa) || !Number.isFinite(pb) || pa <= 0 || pb <= 0) {
        out[a][b] = FALLBACK_COIN[a]?.[b] ?? 0;
        continue;
      }
      out[a][b] = receiveTypeRoundCrypto(pa / pb);
    }
  }
  return out;
}

export function patchFiatFromCoingeckoRow(row) {
  if (!row || typeof row !== "object") return {};
  const patch = {};
  const krw = Number(row.krw);
  const usd = Number(row.usd);
  const vnd = Number(row.vnd);
  const jpy = Number(row.jpy);
  if (Number.isFinite(krw) && krw > 0) patch.KRW = Math.round(krw);
  if (Number.isFinite(usd) && usd > 0)
    patch.USD = usd >= 1 ? Number(usd.toFixed(4)) : Number(usd.toPrecision(8));
  if (Number.isFinite(vnd) && vnd > 0) patch.VND = Math.round(vnd);
  if (Number.isFinite(jpy) && jpy > 0) patch.JPY = Math.round(jpy);
  return patch;
}

export function patchFiatFromCmcQuote(quote) {
  if (!quote || typeof quote !== "object") return {};
  const patch = {};
  const krw = Number(quote.KRW?.price);
  const usd = Number(quote.USD?.price);
  const vnd = Number(quote.VND?.price);
  const jpy = Number(quote.JPY?.price);
  if (Number.isFinite(krw) && krw > 0) patch.KRW = Math.round(krw);
  if (Number.isFinite(usd) && usd > 0)
    patch.USD = usd >= 1 ? Number(usd.toFixed(4)) : Number(usd.toPrecision(8));
  if (Number.isFinite(vnd) && vnd > 0) patch.VND = Math.round(vnd);
  if (Number.isFinite(jpy) && jpy > 0) patch.JPY = Math.round(jpy);
  return patch;
}

export function resolvePriceFeedProvider(explicit) {
  const opt = explicit != null ? String(explicit).trim().toLowerCase() : "";
  if (opt) return opt;
  const fromEnv = String(process.env.PRICE_FEED_PROVIDER || "").trim().toLowerCase();
  if (fromEnv) return fromEnv;
  const cmcKey = String(process.env.PRICE_FEED_CMC_API_KEY || "").trim();
  if (cmcKey) return "coinmarketcap";
  return "coingecko";
}
