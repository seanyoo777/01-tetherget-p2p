export const TG_NOTIFICATION_STORAGE_KEY = "tg_p2p_notifications_v1";
export const TG_ACTIVITY_FEED_STORAGE_KEY = "tg_p2p_activity_feed_v1";
export const TG_NOTIFICATION_AUDIT_KEY = "tg_p2p_notification_audit_v1";

const NOTIFICATION_CAP = 120;
const ACTIVITY_CAP = 150;

/** @type {Map<string, unknown>} */
const memoryFallback = new Map();

const listeners = new Set();
let storeRevision = 0;

export function getNotificationStoreRevision() {
  return storeRevision;
}

export function subscribeNotificationStore(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function bumpNotificationStore() {
  storeRevision += 1;
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  });
}

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

export function clearNotificationMemoryFallback() {
  memoryFallback.clear();
  bumpNotificationStore();
}

export function loadNotifications() {
  return readJson(TG_NOTIFICATION_STORAGE_KEY, []);
}

export function saveNotifications(items) {
  writeJson(TG_NOTIFICATION_STORAGE_KEY, items.slice(0, NOTIFICATION_CAP));
  bumpNotificationStore();
}

export function loadActivityFeed() {
  return readJson(TG_ACTIVITY_FEED_STORAGE_KEY, []);
}

export function saveActivityFeed(items) {
  writeJson(TG_ACTIVITY_FEED_STORAGE_KEY, items.slice(0, ACTIVITY_CAP));
  bumpNotificationStore();
}

export function loadNotificationAuditTrail() {
  return readJson(TG_NOTIFICATION_AUDIT_KEY, []);
}

export function saveNotificationAuditTrail(trail) {
  writeJson(TG_NOTIFICATION_AUDIT_KEY, trail.slice(0, 200));
}

export function loadNotificationStoreSnapshot() {
  return {
    notifications: loadNotifications(),
    activity: loadActivityFeed(),
    auditTrail: loadNotificationAuditTrail(),
  };
}

export function persistNotificationStoreSnapshot(snapshot) {
  saveNotifications(snapshot.notifications);
  saveActivityFeed(snapshot.activity);
  saveNotificationAuditTrail(snapshot.auditTrail);
}

export function clearNotificationStorageForSelfTest() {
  memoryFallback.delete(TG_NOTIFICATION_STORAGE_KEY);
  memoryFallback.delete(TG_ACTIVITY_FEED_STORAGE_KEY);
  memoryFallback.delete(TG_NOTIFICATION_AUDIT_KEY);
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.removeItem(TG_NOTIFICATION_STORAGE_KEY);
      localStorage.removeItem(TG_ACTIVITY_FEED_STORAGE_KEY);
      localStorage.removeItem(TG_NOTIFICATION_AUDIT_KEY);
    } catch {
      /* ignore */
    }
  }
  bumpNotificationStore();
}
