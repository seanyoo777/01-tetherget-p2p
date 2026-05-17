export const TG_RISK_GUARD_AUDIT_KEY = "tg_risk_guard_audit_v1";
export const TG_RISK_GUARD_META_KEY = "tg_risk_guard_meta_v1";

const memoryFallback = new Map();

function readJson(key, fallback) {
  if (typeof localStorage !== "undefined") {
    try {
      const raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw);
    } catch {
      /* fall through */
    }
  }
  return memoryFallback.has(key) ? memoryFallback.get(key) : fallback;
}

function writeJson(key, value) {
  memoryFallback.set(key, value);
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export function loadRiskGuardAuditTrail() {
  return readJson(TG_RISK_GUARD_AUDIT_KEY, []);
}

export function saveRiskGuardAuditTrail(trail) {
  writeJson(TG_RISK_GUARD_AUDIT_KEY, trail.slice(0, 200));
}

export function loadRiskGuardMeta() {
  return readJson(TG_RISK_GUARD_META_KEY, { lastChecked: 0, lastDiagnostics: null });
}

export function saveRiskGuardMeta(meta) {
  writeJson(TG_RISK_GUARD_META_KEY, meta);
}

export function clearRiskGuardMemoryFallback() {
  memoryFallback.clear();
}

export function clearRiskGuardStorageForSelfTest() {
  clearRiskGuardMemoryFallback();
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(TG_RISK_GUARD_AUDIT_KEY);
    localStorage.removeItem(TG_RISK_GUARD_META_KEY);
  } catch {
    /* ignore */
  }
}
