/** Feature flag: tetherget.enableEmergencyResponsePlaybook */

export const EMERGENCY_PLAYBOOK_FEATURE_FLAG_KEY = "tetherget.enableEmergencyResponsePlaybook";

/**
 * @param {ImportMetaEnv|Record<string, unknown>} [env]
 */
export function isEmergencyResponsePlaybookEnabled(
  env = typeof import.meta !== "undefined" && import.meta.env ? import.meta.env : {},
) {
  if (env?.DEV) return true;
  const raw = String(env?.VITE_TETHERGET_ENABLE_EMERGENCY_PLAYBOOK ?? "1").trim();
  return raw === "1" || raw.toLowerCase() === "true";
}
