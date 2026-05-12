/** 오너 콘솔과 /exchange 가 공유하는 최대 레버리지(1~100). */
export const EXCHANGE_ADMIN_MAX_LEVERAGE_KEY = "tgx_exchange_max_leverage_v1";

export function loadExchangeMaxLeverage() {
  try {
    const raw = localStorage.getItem(EXCHANGE_ADMIN_MAX_LEVERAGE_KEY);
    const n = Number(raw);
    if (!Number.isFinite(n)) return 100;
    return Math.min(100, Math.max(1, Math.floor(n)));
  } catch {
    return 100;
  }
}

export function saveExchangeMaxLeverage(value) {
  const n = Math.min(100, Math.max(1, Math.floor(Number(value) || 100)));
  localStorage.setItem(EXCHANGE_ADMIN_MAX_LEVERAGE_KEY, String(n));
  window.dispatchEvent(new CustomEvent("tgx-exchange-max-leverage-changed", { detail: n }));
  return n;
}
