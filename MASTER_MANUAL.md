# MASTER_MANUAL — 01-TetherGet-P2P

Single entry manual for **TetherGet P2P (repo 01)**. Keep in sync with `AGENTS.md`, `.cursorrules`, and `docs/*.md` whenever architecture, escrow, wallet, referral, admin, or new top-level folders change.

## Product stance

- **Mock / demo first** — no real trading API, no autonomous bank payout, no autonomous on-chain release from admin “snapshot” APIs.
- **Security-first** — server re-validates P2P risk (`server/risk/p2pCoreGate.js`); client uses `src/lib/p2pRiskBridge.js` for UX preview only.
- **Mobile-first** — admin shells and metric cards stack on narrow viewports before expanding on desktop.

## UTE (7번) alignment — read models

### Shared DB → canonical mapping

- File: **`shared/p2pLifecycleMap.js`**
- Maps SQLite `p2p_orders` (`listed`, `matched`, `payment_sent`, `completed`, `cancelled`) plus `buyer_payment_started_at` into canonical P2P lifecycles: `created`, `waiting_payment`, `paid`, `release_pending`, `released`, `dispute`, `cancelled`, `closed`.
- Maps canonical P2P lifecycle to **`escrow_lifecycle`**: `locked`, `release_pending`, `released`, `disputed`, `cancelled`.
- Maps `disputes.status` (Korean strings) to dispute canonical: `open`, `reviewing`, `resolved`, `rejected`.

### TypeScript contracts

- **`src/tetherget/types.ts`** — `P2pOrder`, `EscrowStatus`, `WalletStatus`, `ReferralNode`, `ReferralSettlement`, `DisputeCase`, `AdminRiskStatus`, `UteSurfacePayload`.
- **`src/tetherget/p2pStateMachine.ts`** — `canTransitionP2pLifecycle`, `canTransitionEscrowLifecycle`, `canTransitionDisputeLifecycle`, `MOCK_UT_ADMIN_ACK`.
- **`src/tetherget/adminRiskGuards.ts`** — `adminRiskChangeRequiresConfirm`.

### Admin mock surface (client)

- **`src/mock/adminPlatformMock.ts`** — `refreshAdminPlatformSurface`, `getP2pOrders`, `getEscrowStatuses`, `getWalletStatuses`, `getReferralSettlements`, `getDisputeCases`, `getAdminRiskStatus`, `getUteSurfaceMetrics`, `getUteSurfacePayload`.
- Uses `GET /api/admin/p2p/ute-surface` when `auth: true`; falls back to deterministic **`DEMO_SURFACE`** on error so admin numbers never show `undefined`.

### Server aggregate API

- **`GET /api/admin/p2p/ute-surface`** (admin JWT) — implemented via `server/admin/p2pUteSurface.js` + route in `server/index.js`.
- Returns JSON `schemaVersion: 1`, `orders[]` (each with `lifecycle`, `escrow_lifecycle`, optional `dispute_linked`), `escrow_statuses[]`, `wallet_statuses[]`, `referral_settlements[]`, `dispute_cases[]`, `admin_risk` (same shape as `/api/admin/ops/risk-summary`), and `metrics` (counts + escrow locked minor sum + wallet risk user heuristic).

## Admin UI wiring

- **`src/admin/AdminShell.jsx`** — sidebar menu includes **UTE·P2P** (`id: "ute"`).
- **`src/admin/adminMenuIds.js`** — shell menu ids, panel tab ids, `ADMIN_SHELL_TO_PANEL_TAB` (used by `App.jsx` `adminShellLegacyTab`).
- **`src/admin/AdminSectionBoundary.jsx`** — wraps **플랫폼 감사/P2P 모니터** (`audit`), **감사/복구·운영** (`ops`), **KYC 관리** (`kyc`), **분쟁 관리** (`dispute`), **회원 관리** (`member`), **회원 운영** (`memberOps`, split JSX roots), **보안 관리** (`security`) so a runtime error in one tab does not blank the entire `AdminReferralPanel`.
- **`src/admin/panels/UteSurfacePanel.jsx`** — `AdminReferralPanel`의 **UTE·P2P** (`uteSurface`) 탭 본문만 분리; 데이터 로딩은 `App.jsx`에 유지.
- **`src/admin/panels/DashboardPanel.jsx`** — **대시보드** (`dashboard`) 탭 본문; DOM 순서 유지를 위해 `segment`별로 세 곳에서 렌더.
- **`src/admin/panels/SecurityPanel.jsx`** — **보안** (`security`) 탭 본문 그리드; `AdminSectionBoundary`는 `App.jsx`에 유지.
- **`App.jsx`** — `adminShellLegacyTab` reads `ADMIN_SHELL_TO_PANEL_TAB`; `AdminReferralPanel` shows **UTE·P2P** tab metrics from `/api/admin/p2p/ute-surface`.
- **`src/pages/SimpleAdmin.tsx`** — optional UTE metrics strip (same API via `adminPlatformMock`).
- **Structure audit**: [docs/ADMIN_STRUCTURE_AUDIT.md](./docs/ADMIN_STRUCTURE_AUDIT.md).
- **Admin panel split plan** (incremental extractions; `uteSurface` + `dashboard` + `security` live tab done): [docs/ADMIN_PANEL_SPLIT_PLAN.md](./docs/ADMIN_PANEL_SPLIT_PLAN.md).

## Build, lint, checks

- **`npm run build`** — Vite production bundle (runs `prebuild` API base check).
- **`npm run lint`** — ESLint on **stabilization slice** only:
  - `src/tetherget/**/*.{ts,tsx}`
  - `src/mock/adminPlatformMock.ts`
  - `src/pages/SimpleAdmin.tsx`
  - `shared/p2pLifecycleMap.js`
  - `server/admin/p2pUteSurface.js`
  - `src/admin/AdminSectionBoundary.jsx`, `src/admin/AdminErrorBoundary.jsx`, `src/admin/adminMenuIds.js`, `src/admin/panels/UteSurfacePanel.jsx`, `src/admin/panels/DashboardPanel.jsx`, `src/admin/panels/SecurityPanel.jsx`
- Full-repo lint is intentionally **not** enforced yet (legacy `App.jsx` / ops modules exceed current hook rules). Expand the glob as files are brought into compliance.

## Documentation map

| Topic | Doc |
|-------|-----|
| Escrow layering + canonical | `docs/ESCROW_RULES.md` |
| Referral engine + UTE counts | `docs/REFERRAL_SYSTEM.md` |
| Wallet tables + snapshot fields | `docs/WALLET_STRUCTURE.md` |
| Security + confirm gates | `docs/SECURITY_RULES.md` |
| Admin UX + menus | `docs/ADMIN_RULES.md` |

## Next recommended work

- Wire `ute-surface` into automated smoke tests (admin JWT fixture).
- Persist optional `referral_payout_ledger` migration in `server/index.js` if inserts should succeed on fresh DBs.
- Gradually widen `npm run lint` globs as `App.jsx` is split into smaller modules.
