# Referral system (TetherGet P2P)

This document describes the **reusable referral architecture** in **01-TetherGet-P2P**: how uplines are resolved, how pools are allocated using shared core logic, and how the implementation stays compatible with **mock/demo** operation and future scale-out.

## Design goals

- **Single source of policy**: Allocation math and validation live in **`@tetherget/core`**; the server applies them consistently after a trade completes.
- **Auditability**: Each run produces structured audit JSON and ledger rows for traceability.
- **Scalability**: Tier distribution is data-driven (`platform_settings`), not hard-coded in multiple places.
- **Demo safety**: Referral credits in SQLite are **internal ledger** entries. They do **not**, by themselves, constitute on-chain payouts or bank transfers.

## Server-side completion hook

On P2P order completion, the server may invoke:

- **`server/referral/p2pReferralOnComplete.js`** — `runP2pReferralOnComplete(db, { orderId, buyerUserId, tradeMinorBigInt })`

### Flow (high level)

1. **Fee-derived pool**: A portion of the notional fee model derives `poolMinor` via `p2pReferralPoolFromTradeFeeMinor` (core).
2. **Distribution map**: Loaded from `platform_settings` under key **`referral.p2p_distribution_bps`**. Keys are tier indices; values are basis points. **`validateReferralDistributionBps`** must pass or the run aborts with a warning.
3. **Referrer chain**: Built from `users.referred_by_user_id` up to a bounded depth (`buildReferrerChain`).
4. **Allocation**: `allocateReferralPool` returns per-beneficiary lines, treasury remainder, and rounding dust (core).
5. **Persistence**:
   - **`referral_distribution_audit`** — one row per order completion with `audit_json`.
   - **`referral_payout_ledger`** — per line with `status` such as `ledgered_internal` or `treasury_bucket`; **`onchain_tx_hash`** remains empty for internal ledgering in the mock path.

## Client-side tree utilities

For **admin and analytics-style** views that need a graph in memory:

- **`src/utils/referralTreeEngine.js`** — `buildReferralTree`, `getDirectDownlines`, `getAllDownlines`, normalized parent/level fields from heterogeneous user objects.

These utilities are **UI-oriented** and must not be treated as financial authorization. Server rules always win.

## Admin configuration surface

- **BPS distribution** is stored in SQLite (`platform_settings`). Admin flows that edit referral policy must preserve **sum invariants** enforced by core validation.
- **KYC / identity switches** that affect who can trade (and thus who generates referral-eligible volume) are documented in [SECURITY_RULES.md](./SECURITY_RULES.md) and implemented in `p2pRiskBridge.js` / `p2pCoreGate.js`.

## Relationship to wallet balances

Referral outcomes credit **`user_financial_accounts`** (see [WALLET_STRUCTURE.md](./WALLET_STRUCTURE.md)):

- **`referral_earnings_total_minor`**
- **`available_balance_minor`**

Withdrawals and external settlement remain **explicit future integrations** — not implied by ledger increments.

## Mock and demo constraints

- No requirement to broadcast referral payouts on-chain for MVP.
- **`referral_payout_ledger`** rows document intent and amount; bridging to chain or PSPs is a separate, gated project phase.

## UTE surface (`/api/admin/p2p/ute-surface`)

- `referral_settlements` may surface an aggregate pending row when matching statuses exist in `referral_payout_ledger` (otherwise empty).
- Counts are **display-only**; they never enqueue payouts.

## Future structure (TGX / UTE / multi-product)

- **`server/platform/context.js`** attaches **`PLATFORM_CODE`** and **`SERVICE_LINE`** into audit payloads (`mergeAuditPayload`, `mergeDomainPayload`). Referral audits inherit this metadata for **cross-product reconciliation** later.
- Keep **pool policy IDs** and **`correlation_id`** patterns stable so downstream settlement services can idempotently consume the same rows.

## When to update this document

Update when referral BPS schema, completion triggers, audit tables, or core function names change — and update `MASTER_MANUAL.md` per `AGENTS.md`.

## Related documents

- [WALLET_STRUCTURE.md](./WALLET_STRUCTURE.md)
- [ADMIN_RULES.md](./ADMIN_RULES.md)
- [ESCROW_RULES.md](./ESCROW_RULES.md)
