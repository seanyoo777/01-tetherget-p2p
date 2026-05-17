export const NOTIFICATION_AUDIT_EVENT = {
  CREATED: "notification.created",
  READ: "notification.read",
  CLEARED_MOCK: "notification.cleared_mock",
  ACTIVITY_APPENDED: "activity.appended",
};

export function appendNotificationAudit(trail, event, detail = {}) {
  const entry = {
    id: `NA-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    event,
    notificationId: detail.notificationId,
    activityId: detail.activityId,
    detail: detail.extra,
    at: Date.now(),
    mockOnly: true,
  };
  return [entry, ...trail].slice(0, 200);
}
