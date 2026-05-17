export const TG_EMERGENCY_PLAYBOOK_AUDIT_KEY = "tg_emergency_playbook_audit_v1";
export const TG_EMERGENCY_PLAYBOOK_ACTION_LOG_KEY = "tg_emergency_playbook_action_log_v1";

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

export function loadEmergencyPlaybookAuditTrail() {
  return readJson(TG_EMERGENCY_PLAYBOOK_AUDIT_KEY, []);
}

export function saveEmergencyPlaybookAuditTrail(trail) {
  writeJson(TG_EMERGENCY_PLAYBOOK_AUDIT_KEY, trail.slice(0, 200));
}

export function loadMockEmergencyActionLog() {
  return readJson(TG_EMERGENCY_PLAYBOOK_ACTION_LOG_KEY, []);
}

export function saveMockEmergencyActionLog(log) {
  writeJson(TG_EMERGENCY_PLAYBOOK_ACTION_LOG_KEY, log.slice(0, 100));
}

export function clearEmergencyPlaybookStorageForSelfTest() {
  memoryFallback.clear();
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(TG_EMERGENCY_PLAYBOOK_AUDIT_KEY);
    localStorage.removeItem(TG_EMERGENCY_PLAYBOOK_ACTION_LOG_KEY);
  } catch {
    /* ignore */
  }
}
