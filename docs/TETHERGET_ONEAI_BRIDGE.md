# TetherGet ↔ OneAI Bridge (mock scope)

**Project 01 (TetherGet-P2P)** exposes a client-only bridge surface for **Project 03 (OneAI)** Points / Level — without HTTP, auth, or shared DB in this MVP.

## Intended future flow (not implemented)

1. OneAI exposes read-only points balance / level (contract TBD).
2. TetherGet maps points → `MEMBERSHIP_TIERS` ladder.
3. P2P UI shows discounted fee **preview** before trade confirm.
4. Settlement and real fee debit remain out of scope until a governed phase.

## Current mock behavior

| Piece | Behavior |
|-------|----------|
| Points | `oneAiPoints` in `localStorage` key `tg_membership_mock_v1` (default 6200) |
| Sync button | Sets `oneAiSyncStatus` → `mock_synced`, `lastSyncAt` = now |
| Status values | `mock_idle` \| `mock_pending` \| `mock_synced` |
| Audit | `membership.sync.mock` append-only trail |

## Feature flag

`membership.bridge.oneai.enabled` → `VITE_MEMBERSHIP_BRIDGE_ONEAI_ENABLED=1`

When off, `OneAiBridgeStrip` shows “Bridge disabled”.

## UI copy

Explains that **03-OneAI** owns points ledger; TetherGet only mirrors tier for P2P mock preview.

## Forbidden in this bridge

- Calling OneAI production APIs
- Deducting points on trade
- Cross-project JWT or wallet signing

## Tests

`validateOneAiBridgeMockSelfTest()` in `src/membership/membershipSelfTest.js`.
