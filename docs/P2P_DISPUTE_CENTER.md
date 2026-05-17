# P2P Dispute Center (mock)

## Overview

Local dispute cases, escrow hold flags, and operator review — integrated with the **notification center** and **activity feed** (01-TetherGet-P2P).

## Storage

- `tg_dispute_cases_v1`, `tg_dispute_audit_v1`, `tg_dispute_notify_v1` (legacy dispute-specific notifications)

## Notification bridge

On `createDisputeCase()` (`dispute/disputeHelpers.js`):

- Unified center: `dispute.case.created`, `escrow.release.blocked_mock`, `escrow.locked_mock`
- Optional: `suspicious.activity.detected` when flags set

On evidence / review / resolve:

- `dispute.evidence.required`, `admin.review.started`, `admin.case.resolved_mock`

See [P2P_NOTIFICATION_CENTER.md](./P2P_NOTIFICATION_CENTER.md).

## UI routes

- `disputeCenter` — `DisputeCenterPage`
- `disputeDetail` — `DisputeCaseDetailPage`
- Support entry can open dispute center

## Escrow release block

- `releaseBlocked: true` while case open
- `isReleaseBlocked()` in helpers — no on-chain release from this module

## Self-test

- `runDisputeSelfTestSuite()` in `dispute/disputeSelfTest.ts`
- Notification suite: `runNotificationSelfTestSuite()` includes dispute bridge checks
