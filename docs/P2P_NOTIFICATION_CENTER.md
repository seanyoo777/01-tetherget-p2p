# P2P Notification Center (mock)

## Scope

- Unified in-app notification center for TetherGet-P2P (01).
- **localStorage** persistence only — no FCM/APNs, no email, no bank webhooks.
- All rows carry `mockOnly: true`.

## Storage keys

| Key | Purpose |
|-----|---------|
| `tg_p2p_notifications_v1` | `P2PNotification[]` (cap 120) |
| `tg_p2p_activity_feed_v1` | `P2PActivityItem[]` (cap 150) |
| `tg_p2p_notification_audit_v1` | append-only audit (cap 200) |

## `P2PNotification` shape

- `id`, `type`, `title`, `message`
- `severity`: `info` \| `warning` \| `danger` \| `success`
- `source`: `trade` \| `escrow` \| `dispute` \| `membership` \| `admin` \| `system`
- `read`, optional `actionUrl`, `createdAt`, `mockOnly: true`

## Event types

- `trade.created_mock`, `trade.status.updated`
- `escrow.locked_mock`, `escrow.release.blocked_mock`
- `dispute.case.created`, `dispute.evidence.required`
- `admin.review.started`, `admin.case.resolved_mock`
- `membership.level.updated`
- `suspicious.activity.detected`

## Module layout

- `src/notifications/notificationTypes.ts`
- `src/notifications/notificationStore.ts`
- `src/notifications/notificationHelpers.ts` — emit, read, bridges
- `src/notifications/notificationAudit.ts`
- `src/notifications/notificationSelfTest.ts` — `runNotificationSelfTestSuite()`

## UI

- Header: `NotificationBell` + `NotificationDrawer` (desktop + mobile compact bell)
- Full page: `NotificationCenterPage` (`activePage === "notifications"`)

## Audit events

- `notification.created`, `notification.read`, `notification.cleared_mock`
- `activity.appended` (feed writes)

## Bridges

- `dispute/disputeHelpers.js` → `bridgeDisputeCaseCreated`, evidence, admin review/resolve
- `membership/membershipModel.js` → `bridgeMembershipLevelUpdated` on OneAI mock sync

## Tests

- `src/p2p/__tests__/notificationCenter.test.js`
- `npm test` (included in default test glob)
