# P2P Activity Feed (mock)

## Purpose

Append-only timeline of user-visible actions: trades, escrow, disputes, admin ops, membership — for support and power users.

## `P2PActivityItem` shape

- `id`, `actor`, `action`, `targetType`, `targetId`, `message`, `createdAt`, `mockOnly: true`

## Write path

Every `emitNotificationEvent()` in `notificationHelpers.ts` also appends an activity row (same mock store, separate list).

Dispute/admin bridges append via the same helper.

## UI

- `ActivityFeedPage` — `activePage === "activity"`
- `ActivityFeedList` / `ActivityFeedItem` components
- Drawer shortcut: **활동 피드** from notification bell

## Constraints

- No realtime websocket; refresh via `subscribeNotificationStore` + `useSyncExternalStore` in `useNotificationLive.js`
- No wallet/bank side effects
