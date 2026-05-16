/**
 * Membership feature flags (client mock). No server fee engine.
 * @param {ImportMetaEnv|Record<string, unknown>} [env]
 */
export function isMembershipDiscountEnabled(env = typeof import.meta !== "undefined" && import.meta.env ? import.meta.env : {}) {
  if (env?.DEV) return true;
  const raw = String(env?.VITE_MEMBERSHIP_DISCOUNT_ENABLED ?? "1").trim();
  return raw === "1" || raw.toLowerCase() === "true";
}

/**
 * @param {ImportMetaEnv|Record<string, unknown>} [env]
 */
export function isOneAiBridgeEnabled(env = typeof import.meta !== "undefined" && import.meta.env ? import.meta.env : {}) {
  if (env?.DEV) return true;
  const raw = String(env?.VITE_MEMBERSHIP_BRIDGE_ONEAI_ENABLED ?? "1").trim();
  return raw === "1" || raw.toLowerCase() === "true";
}

export const MEMBERSHIP_FEATURE_FLAG_KEYS = Object.freeze({
  DISCOUNT: "membership.discount.enabled",
  ONEAI_BRIDGE: "membership.bridge.oneai.enabled",
});
