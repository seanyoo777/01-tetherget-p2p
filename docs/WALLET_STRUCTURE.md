# Wallet and balances structure (TetherGet P2P)

This document explains how **wallets** and **financial accounts** are represented in **01-TetherGet-P2P**, how they relate to **P2P escrow** and **referrals**, and how the design stays **mock-first** and **security-oriented**.

## Principles

- **Separation of identity**: A user may have **linked wallet addresses** (`user_wallets`) distinct from **ledger balances** (`user_financial_accounts`).
- **Minor units**: Amounts in internal tables use **integer minor units** (e.g. USDT-style 6 decimals policy should be applied consistently at conversion boundaries — see `server/finance/moneyAmount.js` for server conversions).
- **No silent on-chain sends**: Connecting a wallet in the UI or storing an address does **not** imply automatic transfers. Real execution remains **out of scope** for MVP demo mode (`AGENTS.md`, `.cursorrules`).

## Tables (conceptual)

### `user_wallets`

- Stores user-linked **wallet addresses** with uniqueness enforced on non-empty addresses (see migrations in `server/index.js`).
- Used for **identification**, **display**, and **optional** wagmi/viem flows when enabled — not as an implicit withdrawal pipeline.

### `user_financial_accounts`

Per-user ledger row (primary key `user_id`):

| Column | Purpose |
|--------|---------|
| `available_balance_minor` | Spendable/internal available balance in demo flows |
| `referral_earnings_total_minor` | Running total of referral earnings credited |
| `pending_withdrawal_minor` | Amount reserved while a withdrawal request is in flight (demo workflow) |
| `p2p_escrow_locked_minor` | Notional locked amount for P2P escrow-related UI and simulations |
| `updated_at` | Last mutation timestamp |

### `company_wallet`

- Singleton-style row (`id = 1`) representing a **demo company** balance and label.
- Default seed balance is large for **simulation**; not a production treasury.

### `withdrawal_requests`

- Records user-initiated withdrawal intent: amount, destination fields, status, processor, optional `company_wallet_tx_id`.
- In mock mode, approval paths should remain **explicit** and **audited** — never “auto-approve all” in production-like configs without a separate security review.

## On-chain vs off-chain

| Concept | Location | Notes |
|---------|----------|--------|
| **Connected wallet (read/write txs)** | Client (`wagmi` config, `OnchainEscrowPanel.jsx`, `P2pOnchainEscrowBlock.jsx`) | Optional; gated by env such as `VITE_ESCROW_CONTRACT_ADDRESS` |
| **Escrow balances** | Smart contract when deployed | Authoritative for locked token balances |
| **App “balances”** | SQLite `user_financial_accounts` | **Demo ledger**; must not be confused with chain state |

**Rule**: UI that shows a single “balance” should label whether it is **internal**, **on-chain**, or **both**, to avoid user confusion and security incidents.

## Referral credits

Referral completion (`server/referral/p2pReferralOnComplete.js`) credits **`available_balance_minor`** and increments **`referral_earnings_total_minor`**. Those updates are **ledger-only** in the current architecture.

## Mobile-first presentation

- Wallet summaries and escrow states should **fit narrow viewports first**; secondary detail (addresses, tx hashes) belongs in progressive disclosure or copy-friendly panels.
- Long addresses must use truncation with **full copy** affordances, not hidden truncation only.

## UTE wallet snapshot

`GET /api/admin/p2p/ute-surface` exposes `wallet_statuses[]` with:

- `pending_withdrawal_requests` — rows in `withdrawal_requests` with `status = 'pending'`
- `p2p_escrow_locked_minor_total` — `SUM(user_financial_accounts.p2p_escrow_locked_minor)`
- `wallet_risk_user_count` — heuristic distinct users (pending withdrawals or large locked balances)

These metrics support **mobile-first** triage layouts; they are not authorization to move funds.

## Scalability notes

- Moving from SQLite to Postgres or sharded ledgers should preserve:
  - **Per-user single financial row** semantics, or a documented migration to account history tables.
  - **Idempotent** referral and withdrawal processors keyed by `correlation_id` / request IDs.
- **`PLATFORM_CODE` / `SERVICE_LINE`** (`server/platform/context.js`) should propagate into any new wallet or payout audit payloads.

## When to update this document

Update when schema columns, withdrawal flow, escrow lock semantics, or client wallet integration change — and update `MASTER_MANUAL.md` per `AGENTS.md`.

## Related documents

- [ESCROW_RULES.md](./ESCROW_RULES.md)
- [REFERRAL_SYSTEM.md](./REFERRAL_SYSTEM.md)
- [SECURITY_RULES.md](./SECURITY_RULES.md)
