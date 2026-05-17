import { useCallback, useSyncExternalStore } from "react";
import {
  getUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
} from "../../notifications/notificationHelpers.js";
import {
  getNotificationStoreRevision,
  loadActivityFeed,
  loadNotifications,
  subscribeNotificationStore,
} from "../../notifications/notificationStore.js";

function getServerSnapshot() {
  return { notifications: [], activity: [], unread: 0 };
}

let cachedRevision = -1;
/** @type {ReturnType<typeof getServerSnapshot>} */
let cachedSnapshot = getServerSnapshot();

function getClientSnapshot() {
  const revision = getNotificationStoreRevision();
  if (revision === cachedRevision) return cachedSnapshot;
  cachedRevision = revision;
  cachedSnapshot = {
    notifications: loadNotifications(),
    activity: loadActivityFeed(),
    unread: getUnreadNotificationCount(),
  };
  return cachedSnapshot;
}

export function useNotificationLive() {
  const subscribe = useCallback((onStoreChange) => subscribeNotificationStore(onStoreChange), []);

  const snapshot = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);

  return {
    notifications: snapshot.notifications,
    activity: snapshot.activity,
    unread: snapshot.unread,
    markRead: markNotificationRead,
    markAllRead: markAllNotificationsRead,
  };
}
