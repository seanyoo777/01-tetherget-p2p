export const TG_DISPUTE_STORAGE_KEY = "tg_dispute_cases_v1";
export const TG_DISPUTE_AUDIT_KEY = "tg_dispute_audit_v1";
export const TG_DISPUTE_NOTIFY_KEY = "tg_dispute_notify_v1";

/** @type {Map<string, unknown>} */
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

export function clearDisputeMemoryFallback() {
  memoryFallback.clear();
}

export function loadDisputeCases() {
  return readJson(TG_DISPUTE_STORAGE_KEY, []);
}

export function saveDisputeCases(cases) {
  writeJson(TG_DISPUTE_STORAGE_KEY, cases);
}

export function loadDisputeAuditTrail() {
  return readJson(TG_DISPUTE_AUDIT_KEY, []);
}

export function saveDisputeAuditTrail(trail) {
  writeJson(TG_DISPUTE_AUDIT_KEY, trail.slice(0, 200));
}

export function loadDisputeNotifications() {
  return readJson(TG_DISPUTE_NOTIFY_KEY, []);
}

export function saveDisputeNotifications(items) {
  writeJson(TG_DISPUTE_NOTIFY_KEY, items.slice(0, 100));
}

export function loadDisputeStoreSnapshot() {
  return {
    cases: loadDisputeCases(),
    auditTrail: loadDisputeAuditTrail(),
    notifications: loadDisputeNotifications(),
  };
}

export function persistDisputeStoreSnapshot(snapshot) {
  saveDisputeCases(snapshot.cases);
  saveDisputeAuditTrail(snapshot.auditTrail);
  saveDisputeNotifications(snapshot.notifications);
}
