export const TG_ESCROW_HEALTH_AUDIT_KEY = "tg_escrow_health_audit_v1";

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

export function loadEscrowHealthAuditTrail() {
  return readJson(TG_ESCROW_HEALTH_AUDIT_KEY, []);
}

export function saveEscrowHealthAuditTrail(trail) {
  writeJson(TG_ESCROW_HEALTH_AUDIT_KEY, trail.slice(0, 200));
}

export function clearEscrowHealthStorageForSelfTest() {
  memoryFallback.clear();
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(TG_ESCROW_HEALTH_AUDIT_KEY);
  } catch {
    /* ignore */
  }
}
