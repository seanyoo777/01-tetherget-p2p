export type NotificationSeverity = "info" | "warning" | "danger" | "success";

export type NotificationSource = "trade" | "escrow" | "dispute" | "membership" | "admin" | "system";

export type NotificationEventType =
  | "trade.created_mock"
  | "trade.status.updated"
  | "escrow.locked_mock"
  | "escrow.release.blocked_mock"
  | "dispute.case.created"
  | "dispute.evidence.required"
  | "admin.review.started"
  | "admin.case.resolved_mock"
  | "membership.level.updated"
  | "suspicious.activity.detected";

export interface P2PNotification {
  id: string;
  type: NotificationEventType;
  title: string;
  message: string;
  severity: NotificationSeverity;
  source: NotificationSource;
  read: boolean;
  actionUrl?: string;
  createdAt: number;
  mockOnly: true;
  meta?: Record<string, string | number | boolean | undefined>;
}

export interface P2PActivityItem {
  id: string;
  actor: string;
  action: string;
  targetType: string;
  targetId: string;
  message: string;
  createdAt: number;
  mockOnly: true;
}

export interface NotificationStoreSnapshot {
  notifications: P2PNotification[];
  activity: P2PActivityItem[];
  auditTrail: import("./notificationAudit.js").NotificationAuditEntry[];
}

export interface NotificationEventContext {
  orderId?: string;
  caseId?: string;
  tradeId?: string;
  actor?: string;
  status?: string;
  tierLabel?: string;
  operatorId?: string;
  message?: string;
  actionUrl?: string;
}
