/** Toss × Binance P2P × OKX — trade surface tokens (class fragments). */

export function isP2pTradeDark(theme) {
  return Boolean(theme?.card?.includes("slate-900"));
}

export function p2pSurfaceCard(isDark) {
  return isDark
    ? "border-white/[0.08] bg-gradient-to-b from-slate-900/95 to-slate-950 shadow-[0_16px_48px_-24px_rgba(0,0,0,0.65)]"
    : "border-stone-200/95 bg-gradient-to-b from-white to-stone-50/90 shadow-[0_14px_44px_-26px_rgba(15,23,42,0.14)]";
}

export function p2pAccentBtn(isDark) {
  return isDark
    ? "bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/25"
    : "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20";
}
