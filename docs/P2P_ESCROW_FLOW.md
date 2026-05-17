# P2P Escrow flow (mock dispute linkage)

## Escrow case statuses (dispute center)

Used by `P2PDisputeCase.escrowStatus` in `src/dispute/`:

| Status | Meaning (mock UI) |
|--------|-------------------|
| `escrow_pending` | Order listed, escrow not yet locked in UI |
| `escrow_locked` | Matched / funds notionally locked |
| `release_waiting` | Buyer marked payment sent; release pending |
| `dispute_opened` | Active dispute — **release blocked** |
| `manual_hold` | Post mock-resolve hold |

## Order → escrow mapping

`mapOrderToEscrowStatus(orderStatus, hasDispute)` in `disputeHelpers.js`:

- `listed` → `escrow_pending`
- `matched` → `escrow_locked`
- `payment_sent` / `completed` → `release_waiting`
- Active dispute → `dispute_opened` (overrides order status)

## On dispute open

1. `createDisputeCase()` sets `escrowStatus: dispute_opened`, `releaseBlocked: true`.
2. Audit: `dispute.case.created`, `escrow.release.blocked_mock`.
3. Notifications: dispute opened, escrow locked; optional suspicious flag.

## On mock resolve / reject

- `resolveDisputeMock` → `releaseBlocked: false`, `escrowStatus: manual_hold`
- `rejectDisputeMock` → `releaseBlocked: false`, `escrowStatus: escrow_locked`

No wallet or bank APIs are invoked.

## Related docs

- [P2P_DISPUTE_CENTER.md](./P2P_DISPUTE_CENTER.md)
- [TETHERGET_ESCROW_STATE_ALIGNMENT.md](./TETHERGET_ESCROW_STATE_ALIGNMENT.md)
- [P2P_TRADE_FLOW.md](./P2P_TRADE_FLOW.md)
