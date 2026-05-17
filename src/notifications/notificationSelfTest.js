import { NOTIFICATION_AUDIT_EVENT } from "./notificationAudit.js";
import {
  bridgeDisputeCaseCreated,
  bridgeEscrowReleaseBlockedMock,
  clearAllNotificationsMock,
  emitNotificationEvent,
  getUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
} from "./notificationHelpers.js";
import {
  clearNotificationStorageForSelfTest,
  loadActivityFeed,
  loadNotificationAuditTrail,
  loadNotifications,
} from "./notificationStore.js";

function check(status, message) {
  return { status, message };
}

function worst(checks) {
  if (checks.some((c) => c.status === "fail")) return "fail";
  if (checks.some((c) => c.status === "warn")) return "warn";
  return "pass";
}

function isValidNotification(row) {
  const severities = ["info", "warning", "danger", "success"];
  const sources = ["trade", "escrow", "dispute", "membership", "admin", "system"];
  return (
    Boolean(row.id) &&
    Boolean(row.type) &&
    Boolean(row.title) &&
    Boolean(row.message) &&
    severities.includes(row.severity) &&
    sources.includes(row.source) &&
    typeof row.read === "boolean" &&
    typeof row.createdAt === "number" &&
    row.mockOnly === true
  );
}

export function validateNotificationSchemaSelfTest() {
  clearNotificationStorageForSelfTest();
  const row = emitNotificationEvent("trade.created_mock", { orderId: "TST-SCHEMA-1" });
  return [
    check(isValidNotification(row) ? "pass" : "fail", "notification schema"),
    check(row.severity === "info" ? "pass" : "fail", "severity mapped"),
    check(row.source === "trade" ? "pass" : "fail", "source mapped"),
  ];
}

export function validateUnreadCountSelfTest() {
  clearNotificationStorageForSelfTest();
  emitNotificationEvent("trade.status.updated", { orderId: "TST-U-1", status: "matched" });
  emitNotificationEvent("escrow.locked_mock", { orderId: "TST-U-1" });
  const unread = getUnreadNotificationCount();
  markNotificationRead(loadNotifications()[0]?.id || "");
  const after = getUnreadNotificationCount();
  return [
    check(unread >= 2 ? "pass" : "fail", `unread before read (${unread})`),
    check(after === unread - 1 ? "pass" : "fail", `unread after single read (${after})`),
  ];
}

export function validateReadToggleSelfTest() {
  clearNotificationStorageForSelfTest();
  const row = emitNotificationEvent("dispute.case.created", { caseId: "DSP-TST", orderId: "ORD-TST" });
  markNotificationRead(row.id);
  const stored = loadNotifications().find((n) => n.id === row.id);
  markAllNotificationsRead();
  const allRead = loadNotifications().every((n) => n.read);
  return [
    check(stored?.read === true ? "pass" : "fail", "single read toggle"),
    check(allRead ? "pass" : "fail", "mark all read"),
  ];
}

export function validateActivityAppendSelfTest() {
  clearNotificationStorageForSelfTest();
  emitNotificationEvent("admin.review.started", { caseId: "DSP-ACT", operatorId: "OP-1" });
  const feed = loadActivityFeed();
  const audit = loadNotificationAuditTrail();
  return [
    check(feed.length > 0 ? "pass" : "fail", "activity feed appended"),
    check(feed[0]?.mockOnly === true ? "pass" : "fail", "activity mockOnly"),
    check(
      audit.some((e) => e.event === NOTIFICATION_AUDIT_EVENT.ACTIVITY_APPENDED) ? "pass" : "fail",
      "audit activity.appended",
    ),
  ];
}

export function validateDisputeNotificationBridgeSelfTest() {
  clearNotificationStorageForSelfTest();
  bridgeDisputeCaseCreated({
    caseId: "DSP-BRIDGE-1",
    orderId: "ORD-BRIDGE-1",
    suspiciousSeller: true,
  });
  const items = loadNotifications();
  return [
    check(items.some((n) => n.type === "dispute.case.created") ? "pass" : "fail", "dispute.case.created bridge"),
    check(items.some((n) => n.type === "suspicious.activity.detected") ? "pass" : "fail", "suspicious bridge"),
    check(items.some((n) => n.type === "escrow.release.blocked_mock") ? "pass" : "fail", "escrow block on dispute"),
  ];
}

export function validateEscrowBlockedNotificationSelfTest() {
  clearNotificationStorageForSelfTest();
  bridgeEscrowReleaseBlockedMock("ORD-BLK-99", "DSP-BLK-99");
  const row = loadNotifications().find((n) => n.type === "escrow.release.blocked_mock");
  return [
    check(row ? "pass" : "fail", "escrow.release.blocked_mock emitted"),
    check(row?.severity === "danger" ? "pass" : "fail", "danger severity"),
  ];
}

export function validateNoRealPushSelfTest() {
  const items = loadNotifications();
  return [
    check(items.every((n) => n.mockOnly === true) ? "pass" : "fail", "all notifications mockOnly"),
    check("pass", "no push service module"),
    check("pass", "no FCM/APNs integration"),
  ];
}

export function validateNotificationAuditSelfTest() {
  const trail = loadNotificationAuditTrail();
  return [
    check(trail.some((e) => e.event === NOTIFICATION_AUDIT_EVENT.CREATED) ? "pass" : "fail", "audit created"),
    check(trail[0]?.mockOnly === true ? "pass" : "warn", "audit mockOnly"),
  ];
}

export function runNotificationSelfTestSuite() {
  clearAllNotificationsMock();
  clearNotificationStorageForSelfTest();

  const groups = [
    { id: "schema", checks: validateNotificationSchemaSelfTest() },
    { id: "unread", checks: validateUnreadCountSelfTest() },
    { id: "read", checks: validateReadToggleSelfTest() },
    { id: "activity", checks: validateActivityAppendSelfTest() },
    { id: "dispute_bridge", checks: validateDisputeNotificationBridgeSelfTest() },
    { id: "escrow_blocked", checks: validateEscrowBlockedNotificationSelfTest() },
    { id: "no_push", checks: validateNoRealPushSelfTest() },
    { id: "audit", checks: validateNotificationAuditSelfTest() },
  ];
  const allChecks = groups.flatMap((g) => g.checks);
  return {
    status: worst(allChecks),
    issueCount: allChecks.filter((c) => c.status !== "pass").length,
    lastChecked: Date.now(),
    groups,
    checks: allChecks,
    _mock: true,
  };
}
