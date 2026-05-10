/** P2P 목록 카드용 결정적(deterministic) UI 메타 — 서버 필드 없을 때 데모 품질용 */

export function hashStr(s) {
  let h = 2166136261;
  const str = String(s ?? "");
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function getListingUiMeta(row, tick = 0) {
  const seed = hashStr(`${row.id}:${row.seller_user_id}`);
  const grades = ["A+", "A", "B+", "B", "C"];
  const grade = grades[seed % grades.length];
  const completionRate = 92 + (seed % 8) + (tick % 3) * 0.01;
  const tradeCount = 120 + (seed % 3880);
  const avgMinutes = 4 + (seed % 18);
  const tags = [];
  if (seed % 4 === 0) tags.push("HOT");
  if (seed % 3 !== 0) tags.push("VERIFIED");
  if (seed % 5 === 0) tags.push("FAST");
  if (tags.length === 0) tags.push("VERIFIED");

  const sellerAlias = `TG·${String(row.seller_user_id).slice(-4)}`;

  return {
    grade,
    completionRate: Math.min(99.9, Math.round(completionRate * 10) / 10),
    tradeCount,
    avgMinutes,
    tags,
    sellerAlias,
    trustStars: grade.startsWith("A") ? 5 : grade === "B+" ? 4 : grade === "B" ? 3 : 2,
  };
}

export function formatCompactVol(n) {
  const x = Number(n);
  if (!Number.isFinite(x) || x <= 0) return "—";
  if (x >= 1e12) return `${(x / 1e12).toFixed(2)}T`;
  if (x >= 1e9) return `${(x / 1e9).toFixed(2)}B`;
  if (x >= 1e6) return `${(x / 1e6).toFixed(2)}M`;
  if (x >= 1e3) return `${(x / 1e3).toFixed(1)}K`;
  return String(Math.round(x));
}

export function estimateListingNotional(row) {
  const amt = Number(row.amount) || 0;
  const px = Number(row.unit_price) || 0;
  return amt * px;
}

export function buildP2pTickerEntries(orders, tick) {
  const list = orders.length ? orders : [{ id: "x", coin: "USDT", amount: 1200, payment_method: "KRW", seller_user_id: 1 }];
  const out = [];
  for (let i = 0; i < 20; i++) {
    const r = list[i % list.length];
    const seed = hashStr(`${r.id}-${i}-${tick}`);
    const sides = ["매수 체결", "매도 체결", "호가 갱신", "ESCROW 릴리즈"];
    const fiat = r.payment_method || "KRW";
    const base = Number(r.amount) || 1000;
    const wobble = 0.88 + ((seed % 24) / 100);
    const amt = base * wobble;
    const coin = r.coin || "USDT";
    const shown =
      amt >= 100
        ? amt >= 1e6
          ? `${(amt / 1e6).toFixed(2)}M`
          : amt >= 1e3
            ? `${(amt / 1e3).toFixed(1)}K`
            : `${Math.round(amt)}`
        : amt.toFixed(4);
    out.push({
      id: `tk-${i}-${tick}`,
      text: `${sides[seed % sides.length]} · ${shown} ${coin} · ${fiat}`,
      accent: seed % 9 === 0,
    });
  }
  return out;
}
