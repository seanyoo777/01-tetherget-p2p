/** Feature flag: tetherget.enableEscrowHealthOverview */

export const ESCROW_HEALTH_FEATURE_FLAG_KEY = "tetherget.enableEscrowHealthOverview";

/**
 * @param {ImportMetaEnv|Record<string, unknown>} [env]
 */
export function isEscrowHealthOverviewEnabled(env = typeof import.meta !== "undefined" && import.meta.env ? import.meta.env : {}) {
  if (env?.DEV) return true;
  const raw = String(env?.VITE_TETHERGET_ENABLE_ESCROW_HEALTH_OVERVIEW ?? "1").trim();
  return raw === "1" || raw.toLowerCase() === "true";
}
