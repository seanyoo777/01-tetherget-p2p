# Escrow rules (TetherGet P2P)

This document describes how escrow is modeled in **01-TetherGet-P2P**, how on-chain and off-chain layers relate, and the **mock-first** constraints that govern all work in this repository.

## Product scope

- **Primary role**: Main P2P escrow platform with USDT/SOL-oriented flows and wallet integration (see `AGENTS.md`).
- **Operating mode**: **Mock and demo only**. There is **no** automated execution of real fiat or crypto settlement from this codebase as a production payment rail.
- **UI priority**: Mobile-first layouts and clear state transitions for buyers and sellers.

## Architectural separation (escrow-safe)

Escrow concerns are split so that policy, bookkeeping, and optional on-chain actions do not collapse into a single path:

| Layer | Responsibility | Key locations |
|--------|----------------|---------------|
| **Off-chain P2P order lifecycle** | Listing, match, payment-sent UX, disputes metadata, audit events | Server P2P APIs, order tables, `p2p_order_events` patterns in `server/index.js` |
| **Risk and KYC gate** | Same rules on client preview and server enforcement via `@tetherget/core` | `src/lib/p2pRiskBridge.js`, `server/risk/p2pCoreGate.js` |
| **Optional on-chain escrow** | Non-custodial lock, buyer `confirmReceipt`, dispute resolution roles | `contracts/src/EscrowContract.sol`, `src/p2p/P2pOnchainEscrowBlock.jsx`, `src/contracts/OnchainEscrowPanel.jsx` |
| **Indexing and linkage** | Observing chain state and aligning with orders when RPC/contract env is set | `server/onchain/escrowIndexer.js`, `server/onchain/linkEscrowFromTx.js` |
| **Bridge documentation** | Explicit ordering: off-chain mark-paid vs on-chain `confirmReceipt` | `src/lib/onchainP2pBridge.js` |

**Rule**: Any change that moves funds, changes release conditions, or binds order state to chain state must keep **off-chain state machines** and **on-chain transitions** explicit. Do not imply that marking payment in the UI alone releases on-chain collateral.

## On-chain escrow rules (reference)

When `EscrowContract.sol` is deployed and configured (separate ops concern):

- Seller funds the escrow; buyer may call **`confirmReceipt(uint256 id)`** on the funded escrow to move to released state with fee logic defined in the contract.
- Dispute resolution is constrained to **`disputeResolver`** and **`superAdmin`** as defined in the contract — not arbitrary app roles.
- Fees and treasury routing are **contract-level**; the app must not duplicate “release” semantics in a way that contradicts the contract.

## Off-chain escrow policy

- **`escrow_policy`** (SQLite) holds operational parameters such as custody labels, approval counts, and per-level delay hours for **demo workflows**. Treat these as **configuration for UX and simulations**, not as authorization to bypass chain rules where a contract is authoritative.
- **Market catalog** entries (`server/index.js` seed data) declare `escrow_adapter` per market (`coin_escrow`, `nft_escrow`, etc.). New markets should keep adapter choice explicit.

## Order metadata contract

- For hybrid flows, **`metadata_json`** may carry **`onchain_escrow_id`** (and related fields) so the UI and indexer can correlate a row with chain state.
- Linking an on-chain ID to an order should occur only after **identity and value gates** (see `SECURITY_RULES.md`) when those features are enabled.

## Mock and demo guarantees

Per `AGENTS.md` and `.cursorrules`:

- **No real payment release** automation from this repo as a shipping requirement for MVP.
- **No real trading API** wiring as a default path.
- Escrow logic stays **isolated**: core risk evaluation in `@tetherget/core`, server re-validation in `p2pCoreGate.js`, UI hints in `p2pRiskBridge.js`.

## Canonical escrow lifecycle (UTE alignment)

For dashboards and future **UTE (7번)** integration, escrow is summarized in English canonical enums parallel to SQLite `p2p_orders.status`:

| Canonical `escrow_lifecycle` | Typical source |
|------------------------------|----------------|
| `locked` | `created`, `waiting_payment`, `paid`, `release_pending`, or P2P `dispute` (funds still under policy lock) |
| `release_pending` | Buyer marked paid (`payment_sent`); seller release step pending |
| `released` | Order `completed` (off-chain ledger path; **not** an automatic on-chain send) |
| `disputed` | Linked dispute active (see `shared/p2pLifecycleMap.js`) |
| `cancelled` | Order `cancelled` |

Mapping logic is shared in **`shared/p2pLifecycleMap.js`**. Client-side transition checks live in **`src/tetherget/p2pStateMachine.ts`** (`canTransitionEscrowLifecycle` — `released` is blocked for mock-only guards; real completion stays on existing P2P APIs). **Normative cross-doc mapping** (P2P MatchState, dispute, `AUTO_RELEASE` vs `FORCE_*`): [TETHERGET_ESCROW_STATE_ALIGNMENT.md](./TETHERGET_ESCROW_STATE_ALIGNMENT.md).

## Admin read model: `GET /api/admin/p2p/ute-surface`

- Returns `escrow_statuses[]` plus aggregate metrics for **read-only** admin / UTE panels.
- **Does not** execute payment, on-chain release, or referral payout.

## When to update this document

Update this file together with `MASTER_MANUAL.md` (when present) whenever escrow lifecycle, adapters, contract ABI expectations, indexer behavior, or risk gates affecting escrow change.

## Related documents

- [TETHERGET_ESCROW_STATE_ALIGNMENT.md](./TETHERGET_ESCROW_STATE_ALIGNMENT.md) — escrow ↔ P2P MatchState ↔ dispute (normative mapping; read with contracts below).
- [TETHERGET_P2P_STATE_CONTRACT.md](./TETHERGET_P2P_STATE_CONTRACT.md) — order lifecycle contract.
- [TETHERGET_DISPUTE_AUDIT_CONTRACT.md](./TETHERGET_DISPUTE_AUDIT_CONTRACT.md) — dispute, evidence, audit (append-only).
- [SECURITY_RULES.md](./SECURITY_RULES.md) — gates, secrets, and abuse resistance.
- [WALLET_STRUCTURE.md](./WALLET_STRUCTURE.md) — balances vs on-chain wallets.
- [ADMIN_RULES.md](./ADMIN_RULES.md) — operational UI and policy switches.
