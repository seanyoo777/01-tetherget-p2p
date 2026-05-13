# Security rules (TetherGet P2P)

Security-first architecture for **01-TetherGet-P2P** under **mock/demo** constraints: protect users and operators, keep escrow logic safe, and never blur demo behavior with real payment execution.

## Non-negotiables (repository policy)

From `AGENTS.md` and `.cursorrules`:

- **Do not** connect real trading APIs or production payment rails as a default.
- **Do not** implement **automatic real fund release** (fiat or on-chain) from this MVP path.
- **Do not** remove existing safety or gating features without replacement controls.
- **Keep build and lint passing** so static checks remain part of the security posture.

## Defense in depth: P2P risk

### Client preview (`src/lib/p2pRiskBridge.js`)

- Loads **KYC admin switches** from `localStorage` (key `tetherget_kyc_admin_switches_v1`) for **UX preview** and owner-console experiments.
- Uses `@tetherget/core` exports (via `coreRiskPolicy.js`) for trade drafts, preflight, buyer payment-sent evaluation, device fingerprint collection hooks, and high-value notices.

### Server enforcement (`server/risk/p2pCoreGate.js`)

- **Re-evaluates** the same core rules using database-backed truth (KYC profiles, user levels, order metadata).
- Merges admin switches from SQLite (`platform_settings`, key `kyc.admin_switches_v1`).
- **Never trust** the client for identity verification: `isUserIdentityVerified` derives from `kyc_profiles` fields and approval strings.

**Rule**: Any new P2P action that can change money-like state or irreversible order status **must** pass server gates, not only client checks.

## Secrets and cryptography

- Server utilities under **`server/security/crypto.js`** are for **documented cryptographic operations** (keys, hashing where applicable). New features must avoid ad-hoc crypto in route handlers.
- Environment variables for RPC URLs, contract addresses, and webhooks belong in **deployment config**, not in source or client bundles beyond safe public constants.

## API and abuse resistance

- Rate limiting middleware (`server/middleware/apiRateLimit.js`) is part of the abuse model; extend it when adding sensitive endpoints.
- **CORS** and loopback rules in `server/index.js` exist for dev ergonomics — production deployments must tighten origin policy explicitly.

## On-chain surface

- Optional escrow panels must respect:
  - **Correct ABI** and **address** from env (`VITE_ESCROW_CONTRACT_ADDRESS`, server-side mirrors).
  - **Buyer-only** `confirmReceipt` semantics documented in `src/lib/onchainP2pBridge.js`.
- The **escrow indexer** (`server/onchain/escrowIndexer.js`) should run with sane finality and reorg parameters; disabling it via env is supported for environments without RPC.

## Admin and operator access

- Admin UI entry uses **`canAccessAdminSafe`** (`src/admin/canAccessAdminSafe.js`) — allow-lists and role tokens are **demo-oriented**. Production must replace this with hardened RBAC, SSO, and audit logging.
- **Owner / HQ consoles** that toggle KYC switches affect real user flows in staging; treat switch changes as **security-relevant events**.

## Mock admin state transitions (UTE prep)

- **`src/tetherget/p2pStateMachine.ts`** — declarative `canTransition*` helpers; sensitive transitions require `MOCK_UT_ADMIN_ACK` (see file).
- **`src/tetherget/adminRiskGuards.ts`** — `adminRiskChangeRequiresConfirm` enumerates operations that must show explicit confirmation in UTE.
- Helpers are **side-effect free**; they must not replace server enforcement.

## Data protection

- `kyc_profiles` holds sensitive markers (upload flags, approval status). Minimize logging of raw PII; prefer IDs and hashed fingerprints where core APIs support `hashDeviceFingerprintPreferred`.

## Mobile-first security UX

- High-value flows require **push + UI reconfirm** patterns from core (`requiresHighValuePushAndUiReconfirm` usage in client bridge) when enabled — ensure these remain usable on small screens (no tiny tap targets for confirmations).

## Incident readiness (future)

- Centralize **audit JSON** for money-like mutations (referral audit, order events). Use `mergeDomainPayload` / `mergeAuditPayload` patterns for uniform `_platform` / `_line` metadata.

## When to update this document

Update when authentication, admin switches, rate limits, on-chain integration, or KYC rules change — and update `MASTER_MANUAL.md` per `AGENTS.md`.

## Related documents

- [ESCROW_RULES.md](./ESCROW_RULES.md)
- [ADMIN_RULES.md](./ADMIN_RULES.md)
- [WALLET_STRUCTURE.md](./WALLET_STRUCTURE.md)
