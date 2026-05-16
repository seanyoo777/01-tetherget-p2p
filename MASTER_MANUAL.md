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
- **`npm run lint`** — ESLint on **stabilization slice** (includes **`src/p2p/**/*.{js,jsx}`**):
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
| 배포·점검·Feature Flag·rollback (공통 정책, 구현 없음) | `docs/PLATFORM_DEPLOYMENT_POLICY.md` |
| P2P 주문 상태·전이·분쟁 계약 (구현 없음) | `docs/TETHERGET_P2P_STATE_CONTRACT.md` |
| P2P 분쟁·중재·감사 append-only 계약 (구현 없음) | `docs/TETHERGET_DISPUTE_AUDIT_CONTRACT.md` |
| Escrow ↔ P2P ↔ Dispute 상태 정합 (구현 없음) | `docs/TETHERGET_ESCROW_STATE_ALIGNMENT.md` |
| P2P 거래 UI · Status Matrix · 타임라인 · mock 감사 | `docs/P2P_TRADE_FLOW.md` |
| Admin Self-Test Center (회원·수수료·레퍼럴·메뉴 mock) | `docs/P2P_ADMIN_SELF_TEST.md` |
| Global self-test / validation rule (all platforms) | `docs/GLOBAL_SELF_TEST_VALIDATION.md` |
| P2P Membership · Points discount (mock) | `docs/TETHERGET_MEMBERSHIP.md` |
| OneAI bridge scope (mock, 03 연동 예정) | `docs/TETHERGET_ONEAI_BRIDGE.md` |

### P2P trade UI layer (`src/p2p/`)

- **`src/p2p/p2pStatusMatrix.js`** — 8-state operational matrix (`pending` … `cancelled`).
- **`src/p2p/p2pEscrowDisplay.js`** — UI escrow display (`locked`, `waiting_release`, `released`, `refunded`, `disputed`).
- **`src/p2p/p2pTimelineEvents.js`** — timeline `actor`, `source`, `severity`, unified timestamps.
- **`src/p2p/tradeFlowModel.js`** — `deriveTradeFlowView` (matrix + escrow display + 5-step stepper).
- **`src/p2p/ui/*`** — TradeList / My Trades / admin audit components (mock only).
- **`src/mock/p2pTradeFlowMock.js`** — referral, admin risk, timeline builders.
- **`npm test`** — `src/p2p/__tests__/*.test.js` (matrix, escrow copy, UTE align, admin audit cache, testids).
- **`npm run smoke:p2p`** — unit tests + optional Playwright (`scripts/smoke-p2p-ui.mjs`, `P2P_TEST_IDS`, API route mock).
- **`SMOKE_P2P_UNIT_ONLY=1`** — skip browser in smoke (CI).
- **`npm run release:check`** — includes `npm test` after build/admin verify.
- **`src/p2p/p2pUteFieldAlign.js`** — `ute-surface` ↔ admin mock (`escrow_lifecycle`, `db_status`, legacy fallback).
- **`src/p2p/p2pEscrowCopy.js`** — platform vs on-chain escrow wording; payment_confirmed / waiting_release dual copy; disputed/refunded.
- **`src/p2p/p2pAdminAuditSurface.js`** — admin audit rows/KPI from `refreshAdminPlatformSurface` cache (no polling); `getP2pAdminCacheMeta`, extended KPI.
- **`src/p2p/p2pDevDiagnostics.js`** / **`P2pDevDiagnosticsPanel`** — DEV mock diagnostics; `runP2pAdminRefreshSelfTest` after `refreshAdminPlatformSurface`; shared in **`SimpleAdmin.tsx`**.
- **`src/p2p/p2pSmokeJwtFixture.js`** — mock admin JWT + `isSimpleAdminSmokePath` for smoke only (no real auth verify).
- **`src/pages/SimpleAdminSmokeRoute.jsx`** — `/smoke/simple-admin` diagnostics-only page (Playwright).
- **`notifyP2pRefreshValidation`** — App/SimpleAdmin client toast (mock OK/FAIL + issue count); **`shouldThrottleP2pRefreshNotify`** dedupes tab re-entry.
- **`isP2pDiagnosticsEnabled`** — `DEV` or `VITE_P2P_SHOW_DIAGNOSTICS=1` (production default off).
- **`UteSurfacePanel`** — strip/badge diagnostics + escrow legend on UTE·P2P tab.
- **`src/p2p/p2pAdminSurfaceSelfTest.js`** — `validateP2pAdminSurface()` pure self-test (UTE alignment, cache row count).
- **`src/p2p/p2pEscrowLifecycleLegend.js`** / **`P2pEscrowLifecycleLegend`** — compact escrow lifecycle legend on admin + escrow panel.
- **`src/p2p/p2pTestIds.js`** — stable Playwright selectors for TradeList, timeline, escrow, admin audit, diagnostics.
- **`src/admin/adminSelfTestModel.js`** / **`adminSelfTestEngine.js`** — `runAdminSelfTestSuite()` (member level, fees, referral spread, trade/escrow, menu smoke).
- **`src/admin/panels/AdminSelfTestCenterPanel.jsx`** — admin **자동검증** tab; PASS/WARN/FAIL + MOCK ONLY (manual run, no polling).
- **`src/admin/adminTestIds.js`** — `admin-self-test-center`, `admin-self-test-run`, `admin-self-test-card`.
- **`npm test`** — also `src/admin/__tests__/adminSelfTest.test.js`.
- **`docs/GLOBAL_SELF_TEST_VALIDATION.md`** — cross-platform PASS/WARN/FAIL, diagnostics, audit append-only, feature-flag checks, no realtime loops.
- Self-test cards **Feature Flag / Fallback**, **Audit Trail (mock)** in `runAdminSelfTestSuite()`.
- **`src/membership/`** — tier ladder (Basic→VIP), `computeMembershipFeePreview`, OneAI bridge mock, 내정보 **멤버십** tab, 거래 fee preview, Help Center.
- Feature flags: `VITE_MEMBERSHIP_DISCOUNT_ENABLED`, `VITE_MEMBERSHIP_BRIDGE_ONEAI_ENABLED`.

## Next recommended work

- Wire `ute-surface` into automated smoke tests (admin JWT fixture).
- Persist optional `referral_payout_ledger` migration in `server/index.js` if inserts should succeed on fresh DBs.
- Gradually widen `npm run lint` globs as `App.jsx` is split into smaller modules.
