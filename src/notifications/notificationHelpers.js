import { appendNotificationAudit, NOTIFICATION_AUDIT_EVENT } from "./notificationAudit.js";
import {
  loadActivityFeed,
  loadNotificationAuditTrail,
  loadNotifications,
  saveActivityFeed,
  saveNotificationAuditTrail,
  saveNotifications,
} from "./notificationStore.js";

const EVENT_META = {
  "trade.created_mock": { title: "거래 생성 (mock)", severity: "info", source: "trade", actionUrl: "mytrades" },
  "trade.status.updated": { title: "거래 상태 변경", severity: "info", source: "trade", actionUrl: "mytrades" },
  "escrow.locked_mock": { title: "Escrow 잠금 (mock)", severity: "warning", source: "escrow", actionUrl: "mytrades" },
  "escrow.release.blocked_mock": {
    title: "Escrow 릴리스 차단",
    severity: "danger",
    source: "escrow",
    actionUrl: "mytrades",
  },
  "dispute.case.created": { title: "분쟁 접수", severity: "warning", source: "dispute", actionUrl: "notifications" },
  "dispute.evidence.required": { title: "증빙 필요", severity: "warning", source: "dispute", actionUrl: "notifications" },
  "admin.review.started": { title: "관리자 검토 시작", severity: "info", source: "admin", actionUrl: "admin" },
  "admin.case.resolved_mock": { title: "분쟁 처리 완료 (mock)", severity: "success", source: "admin", actionUrl: "admin" },
  "membership.level.updated": { title: "멤버십 등급 변경", severity: "success", source: "membership", actionUrl: "myinfo" },
  "suspicious.activity.detected": { title: "의심 활동 감지", severity: "danger", source: "system", actionUrl: "admin" },
};

function generateId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function defaultMessage(type, ctx) {
  if (ctx.message) return ctx.message;
  if (type === "trade.created_mock") return `주문 ${ctx.orderId || ctx.tradeId || "—"} 이 생성되었습니다. (mock)`;
  if (type === "trade.status.updated") return `주문 ${ctx.orderId || "—"} → ${ctx.status || "updated"}`;
  if (type === "escrow.locked_mock") return `주문 ${ctx.orderId || "—"} escrow가 잠겼습니다. (mock)`;
  if (type === "escrow.release.blocked_mock")
    return `주문 ${ctx.orderId || "—"} 릴리스가 차단되었습니다. 분쟁·검토를 확인하세요.`;
  if (type === "dispute.case.created") return `케이스 ${ctx.caseId || "—"} · 주문 ${ctx.orderId || "—"}`;
  if (type === "dispute.evidence.required") return `케이스 ${ctx.caseId || "—"} 에 증빙이 필요합니다.`;
  if (type === "admin.review.started") return `운영자 ${ctx.operatorId || "admin"} 가 검토를 시작했습니다.`;
  if (type === "admin.case.resolved_mock") return `케이스 ${ctx.caseId || "—"} 가 mock 처리되었습니다.`;
  if (type === "membership.level.updated") return `등급: ${ctx.tierLabel || ctx.status || "updated"} (mock)`;
  if (type === "suspicious.activity.detected") return `주문 ${ctx.orderId || "—"} · 위험 플래그 (mock)`;
  return "알림 (mock)";
}

export function buildNotificationRow(type, ctx = {}) {
  const meta = EVENT_META[type];
  return {
    id: generateId("NTF"),
    type,
    title: meta.title,
    message: defaultMessage(type, ctx),
    severity: meta.severity,
    source: meta.source,
    read: false,
    actionUrl: ctx.actionUrl ?? meta.actionUrl,
    createdAt: Date.now(),
    mockOnly: true,
    meta: {
      orderId: ctx.orderId,
      caseId: ctx.caseId,
      tradeId: ctx.tradeId,
      status: ctx.status,
    },
  };
}

export function appendActivityItem(input) {
  const row = {
    id: generateId("ACT"),
    actor: input.actor,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    message: input.message,
    createdAt: Date.now(),
    mockOnly: true,
  };
  saveActivityFeed([row, ...loadActivityFeed()]);
  const audit = appendNotificationAudit(loadNotificationAuditTrail(), NOTIFICATION_AUDIT_EVENT.ACTIVITY_APPENDED, {
    activityId: row.id,
    extra: { action: row.action, targetType: row.targetType },
  });
  saveNotificationAuditTrail(audit);
  return row;
}

export function emitNotificationEvent(type, ctx = {}) {
  const row = buildNotificationRow(type, ctx);
  saveNotifications([row, ...loadNotifications()]);
  const audit = appendNotificationAudit(loadNotificationAuditTrail(), NOTIFICATION_AUDIT_EVENT.CREATED, {
    notificationId: row.id,
    extra: { type, source: row.source },
  });
  saveNotificationAuditTrail(audit);
  appendActivityItem({
    actor: ctx.actor || row.source,
    action: type,
    targetType: row.source,
    targetId: ctx.caseId || ctx.orderId || ctx.tradeId || row.id,
    message: row.message,
  });
  return row;
}

export function getUnreadNotificationCount() {
  return loadNotifications().filter((n) => !n.read).length;
}

export function markNotificationRead(notificationId) {
  const items = loadNotifications();
  const idx = items.findIndex((n) => n.id === notificationId);
  if (idx < 0) return null;
  if (items[idx].read) return items[idx];
  const next = { ...items[idx], read: true };
  items[idx] = next;
  saveNotifications(items);
  const audit = appendNotificationAudit(loadNotificationAuditTrail(), NOTIFICATION_AUDIT_EVENT.READ, {
    notificationId,
  });
  saveNotificationAuditTrail(audit);
  return next;
}

export function markAllNotificationsRead() {
  const items = loadNotifications().map((n) => ({ ...n, read: true }));
  saveNotifications(items);
  return items;
}

export function clearAllNotificationsMock() {
  saveNotifications([]);
  const audit = appendNotificationAudit(loadNotificationAuditTrail(), NOTIFICATION_AUDIT_EVENT.CLEARED_MOCK, {});
  saveNotificationAuditTrail(audit);
}

export function bridgeDisputeCaseCreated(caseRow) {
  emitNotificationEvent("dispute.case.created", {
    caseId: caseRow.caseId,
    orderId: caseRow.orderId,
    message: `분쟁 ${caseRow.caseId} · 주문 ${caseRow.orderId}`,
  });
  emitNotificationEvent("escrow.release.blocked_mock", {
    orderId: caseRow.orderId,
    caseId: caseRow.caseId,
    message: `주문 ${caseRow.orderId} — escrow 릴리스 차단 (분쟁)`,
  });
  emitNotificationEvent("escrow.locked_mock", { orderId: caseRow.orderId, caseId: caseRow.caseId });
  if (caseRow.suspiciousBuyer || caseRow.suspiciousSeller) {
    emitNotificationEvent("suspicious.activity.detected", { orderId: caseRow.orderId, caseId: caseRow.caseId });
  }
}

export function bridgeDisputeEvidenceRequired(caseId, fileNameMock) {
  emitNotificationEvent("dispute.evidence.required", {
    caseId,
    message: `증빙 ${fileNameMock} 등록 · 케이스 ${caseId}`,
  });
}

export function bridgeAdminReviewStarted(caseId, operatorId) {
  emitNotificationEvent("admin.review.started", { caseId, operatorId });
}

export function bridgeAdminCaseResolvedMock(caseId, status, operatorId) {
  emitNotificationEvent("admin.case.resolved_mock", {
    caseId,
    operatorId,
    status,
    message: `케이스 ${caseId} → ${status}`,
  });
}

export function bridgeEscrowReleaseBlockedMock(orderId, caseId) {
  emitNotificationEvent("escrow.release.blocked_mock", { orderId, caseId });
}

export function bridgeMembershipLevelUpdated(tierLabel, actor = "membership") {
  emitNotificationEvent("membership.level.updated", {
    tierLabel,
    actor,
    message: `멤버십 등급이 ${tierLabel} 로 갱신되었습니다. (mock)`,
  });
}

export function bridgeTradeCreatedMock(orderId) {
  emitNotificationEvent("trade.created_mock", { orderId, tradeId: orderId });
}

export function bridgeTradeStatusUpdated(orderId, status) {
  emitNotificationEvent("trade.status.updated", { orderId, status });
}

export function seedDemoNotificationsIfEmpty() {
  if (loadNotifications().length > 0) return loadNotifications();
  emitNotificationEvent("trade.created_mock", { orderId: "P2P-DEMO-9001" });
  emitNotificationEvent("escrow.locked_mock", { orderId: "P2P-DEMO-9001" });
  return loadNotifications();
}
