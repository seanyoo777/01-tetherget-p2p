# P2P Trade Flow — UI & Operational Stability Layer

**Project:** 01-TetherGet-P2P  
**Mode:** mock / demo only — no real payment, release, or on-chain settlement.

## Purpose

This document describes the **client-side** P2P trade flow UI layer added for operational stability: status matrix, timeline normalization, escrow display, admin audit mocks, and referral summary extensions.

Server canonical mapping remains in `shared/p2pLifecycleMap.js`. UI-only extensions live under `src/p2p/`.

## Status Matrix (8 states)

| Matrix key | Label (KO) | Typical DB / flags |
|------------|--------------|-------------------|
| `pending` | 대기 | `listed` |
| `matched` | 매칭됨 | `matched`, no `buyer_payment_started_at` |
| `payment_sent` | 송금 진행 | `matched` + `buyer_payment_started_at` |
| `payment_confirmed` | 송금 확인 | `payment_sent` |
| `releasing` | 릴리스 중 | (escrow `waiting_release`; timeline mock) |
| `completed` | 완료 | `completed` |
| `disputed` | 분쟁 | active mock dispute overlay |
| `cancelled` | 취소 | `cancelled` |

**Module:** `src/p2p/p2pStatusMatrix.js`  
**UI:** `P2pStatusMatrixBadge`, `P2pStatusMatrixStrip` in `P2pTradeDetailPanel`

## Escrow display (5 states)

UI display keys (not replacing server `escrow_lifecycle`):

| Display | Label | Maps from canonical |
|---------|-------|---------------------|
| `locked` | 예치 잠금 | `locked` |
| `waiting_release` | 릴리스 대기 | `release_pending`, payment phases |
| `released` | 릴리스 완료 | `released` |
| `refunded` | 환불·해제 | `cancelled` |
| `disputed` | 분쟁·홀드 | `disputed` |

**Module:** `src/p2p/p2pEscrowDisplay.js`  
**UI:** `P2pEscrowStatusPanel`

## Timeline events

Each event is normalized with:

- `created_at` — `YYYY-MM-DD HH:mm:ss` via `formatP2pTimestamp`
- `actor` — mock role (`buyer`, `seller`, `admin_ops`, `system`, …)
- `source` — `system` | `user` | `admin`
- `severity` — `info` | `success` | `warning` | `critical`

**Modules:** `src/p2p/p2pTimelineEvents.js`, `buildTradeTimelineEvents` in `src/mock/p2pTradeFlowMock.js`  
**UI:** `P2pTradeTimeline` (compact + collapsible on mobile)

## Admin audit mock

`P2pAdminTradeListMock` — risk score, dispute count, **HIGH** / **DELAY** / **DSP** badges.  
Helpers: `getMockAdminTradeAudit`, `getMockAdminAuditSummary`.

**Cache bridge (no polling / websocket):** `refreshAdminPlatformSurface` in `src/mock/adminPlatformMock.ts` calls `syncP2pAdminAuditCache` / `clearP2pAdminAuditCache`.  
`src/p2p/p2pAdminAuditSurface.js` exposes `getP2pAdminAuditRows`, `computeAdminAuditKpi` (`disputeRatio`, `delayedRatio`, `cacheSource`, `completedCount`, `disputedOrdersCount`, `avgMockReleaseDelayMin`, `cacheAgeMs`).  
`P2pAdminAuditKpiCards` shows mock KPI tiles when the audit tab is open.

## Dev diagnostics & self-test (mock only)

| Module | Role |
|--------|------|
| `p2pDevDiagnostics.js` | `getP2pDevDiagnostics()` — cache synced, source, ratios, mock-only flag |
| `P2pDevDiagnosticsPanel` | `isP2pDiagnosticsEnabled()` — `DEV` or `VITE_P2P_SHOW_DIAGNOSTICS=1` (production default hidden) |
| `p2pAdminSurfaceSelfTest.js` | `validateP2pAdminSurface()` — UTE field alignment + row count consistency (pure) |
| `p2pEscrowLifecycleLegend.js` | Compact legend: `release_pending`, `waiting_release`, `released`, `refunded`, `disputed` |

No websocket, polling, or server refresh loops. Cache age is mock (`syncedAt` on `syncP2pAdminAuditCache`, static fallback when unsynced).

`refreshAdminPlatformSurface` → `runP2pAdminRefreshSelfTest()` 1회 (결과를 diagnostics panel·`getLastP2pAdminRefreshValidation()`에 표시).

**Client notify (mock):** `notifyP2pRefreshValidation(validation, notify)` → `[MOCK] … OK/FAIL · issues N`. 서버 notify 없음.

**Notify throttle (local):** `shouldThrottleP2pRefreshNotify` — 동일 validation fingerprint는 30s 내 1회만 toast. 탭 재진입(`useEffect` refresh) 중복 최소화. 수동 UTE refresh는 `{ force: true }`로 항상 1회 표시.

**Staging flag:** `.env` / Vite — `VITE_P2P_SHOW_DIAGNOSTICS=1` (see `.env.example`). `isP2pDiagnosticsEnabled()` = `DEV || flag`.

**UTE·P2P 탭:** `UteSurfacePanel` — `mode="strip"` + `mode="badge-only"` diagnostics, escrow legend (audit 탭과 동일 `P2pDevDiagnosticsPanel` 재사용).

**Compact modes:** `full` | `strip` (`p2p-dev-diagnostics-compact`) | `badge-only` — mobile에서는 full 패널이 배지+요약 스트립으로 축소.

**SimpleAdmin smoke route:** `/smoke/simple-admin` — mock API only, `p2p-simple-admin-smoke-root`, Playwright 전용.

`src/p2p/p2pSmokeJwtFixture.js` — mock admin JWT for Playwright only (no server signature verify).

**`release:check` / CI:** `npm run release:check` includes `npm test`. For PRs without a dev server, prefer:

```bash
SMOKE_P2P_UNIT_ONLY=1 npm run smoke:p2p
```

Full browser smoke (`npm run smoke:p2p`) needs `npm run dev` on `:5171` and clicks admin **플랫폼로그** tab.

## Admin Self-Test Center (mock only)

See **`docs/P2P_ADMIN_SELF_TEST.md`**.

- Admin nav → **자동검증** (`adminViewTab === "selfTest"`).
- **`runAdminSelfTestSuite()`** — member level transition, fee breakdown, referral spread, trade/escrow matrix, shell menu smoke, P2P diagnostics card.
- Triggered by **자동 검증 실행** only (no interval polling).
- Selectors: `admin-self-test-center`, `admin-self-test-run`, `admin-self-test-summary`, `admin-self-test-card`.

## Playwright `data-testid` map

| Constant | Value | Component |
|----------|-------|-----------|
| `tradeList` | `p2p-trade-list` | `TradeList` grid in `App.jsx` |
| `progressOrders` | `p2p-progress-orders` | `P2pProgressOrdersSection` |
| `timeline` | `p2p-trade-timeline` | `P2pTradeTimeline` |
| `escrowPanel` | `p2p-escrow-panel` | `P2pEscrowStatusPanel` |
| `matrixBadge` | `p2p-matrix-badge` | `P2pStatusMatrixBadge` |
| `matrixStrip` | `p2p-matrix-strip` | `P2pStatusMatrixStrip` |
| `flowStepper` | `p2p-flow-stepper` | `P2pTradeFlowStepper` |
| `adminAudit` | `p2p-admin-audit` | `P2pAdminTradeListMock` |
| `adminAuditKpi` | `p2p-admin-audit-kpi` | `P2pAdminAuditKpiCards` |
| `adminAuditKpiCard` | `p2p-admin-audit-kpi-card` | each KPI tile (`data-kpi-key`) |
| `devDiagnostics` | `p2p-dev-diagnostics` | `P2pDevDiagnosticsPanel` |
| `adminCacheState` | `p2p-admin-cache-state` | cache grid (`data-cache-source`) |
| `escrowLegend` | `p2p-escrow-legend` | `P2pEscrowLifecycleLegend` |
| `validationBadge` | `p2p-validation-badge` | `data-validation-status` ok/fail |
| `mockOnlyBadge` | `p2p-mock-only-badge` | MOCK ONLY chip |
| `adminAuditTab` | `p2p-admin-audit-tab` | 플랫폼 감사 로그 tab |

**Module:** `src/p2p/p2pTestIds.js` — also used by `SimpleAdmin.tsx` (shared `P2pDevDiagnosticsPanel`). — imported by UI and `scripts/smoke-p2p-ui.mjs`.

## Referral summary mock

Extended fields in `MOCK_REFERRAL_SUMMARY`: `totalVolumeUsdt`, `referralFeeUsdt`, `level`, `levelLabel`, `weeklyActivity`.

## payment_confirmed ↔ releasing (dual display)

| Layer | Shows | Meaning |
|-------|--------|---------|
| **Stepper / matrix** | `payment_confirmed` | Buyer marked transfer complete (DB `payment_sent`) |
| **Escrow panel** | `waiting_release` | Platform escrow still waiting for seller mock release |

Copy modules: `src/p2p/p2pEscrowCopy.js` → `getStepperMatrixHint`, `getEscrowPhaseCopy`.  
`deriveTradeFlowView` exposes `stepperMatrixHint`, `escrowPhaseCopy`, `matrixReleasing`.

## UTE surface field alignment

`GET /api/admin/p2p/ute-surface` orders use: `lifecycle`, `escrow_lifecycle`, `db_status`, `seller_user_id`, `buyer_user_id`, `dispute_linked`.

`src/p2p/p2pUteFieldAlign.js` maps these to admin table rows while **keeping legacy** keys (`status`, `escrow`, `seller`, `buyer`).  
`MOCK_UTE_SURFACE_SNAPSHOT` in `src/mock/p2pTradeFlowMock.js` mirrors server shape for client mock.

## Mobile UX

- Collapsible timeline and detail sections (`SectionToggle`, timeline collapse)
- Compact timeline in progress orders (`compact` prop)
- Sticky action footer on trade detail panel (mock actions only)

## On-chain vs platform escrow copy

| Block | File | Role |
|-------|------|------|
| Platform escrow (mock) | `P2pEscrowStatusPanel` | `P2P_ESCROW_COPY.platformPanelTitle` |
| Optional on-chain link | `P2pOnchainEscrowBlock` | `P2P_ESCROW_COPY.onchainBlockTitle` — manual ID only, no auto tx |

Shared terms: `src/p2p/p2pEscrowCopy.js`.

## Escrow lifecycle copy (disputed / refunded)

`src/p2p/p2pEscrowCopy.js` → `getEscrowPhaseCopy` headlines for `disputed`, `refunded`, `released` (mock-only; no auto settlement).  
Constants: `disputedDetail`, `refundedDetail`, `releasePendingCanon`, `waitingReleaseUi`.

## Tests & smoke

### CI / release baseline

| Command | When | Notes |
|---------|------|-------|
| `npm run release:check` | Pre-release / CI gate | `syntax:server` + `build` + `verify:admin-smoke` + **`npm test`** |
| `npm test` | Every PR | `src/p2p/__tests__/*.test.js` (matrix, escrow, UTE, throttle, staging flag) |
| `SMOKE_P2P_UNIT_ONLY=1 npm run smoke:p2p` | PR without browser | Unit tests only; skips Playwright |
| `npm run smoke:p2p` | Nightly / manual | Needs `npm run dev` on `:5171`; admin **플랫폼로그** + **UTE·P2P** tabs |
| `http://localhost:5171/smoke/simple-admin` | Optional Playwright | Diagnostics-only route; no real auth |

```bash
npm test
SMOKE_P2P_UNIT_ONLY=1 npm run smoke:p2p
npm run release:check
# Full UI smoke (local):
npm run dev
npm run smoke:p2p
```

Lint includes `src/p2p/**/*.{js,jsx}` via `npm run lint`.

## Related contracts

- `docs/TETHERGET_P2P_STATE_CONTRACT.md`
- `docs/TETHERGET_ESCROW_STATE_ALIGNMENT.md`
- `docs/TETHERGET_DISPUTE_AUDIT_CONTRACT.md`

## Forbidden (unchanged)

- Real wallet signing, bank payout, blockchain tx, websocket live settlement
