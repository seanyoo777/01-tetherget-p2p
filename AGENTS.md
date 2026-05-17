# AGENTS.md

## PROJECT OVERVIEW

Project Number:
01 = TetherGet-P2P

Current Role:
- Main P2P escrow platform
- USDT/SOL based structure
- Wallet integration
- Escrow architecture
- Referral system
- Admin system
- Future global P2P structure

---

## CORE RULES

- Do NOT remove existing features
- Keep build/lint passing
- mock/demo mode first
- No real payment release
- No real trading API
- Security-first structure
- UI/UX first
- Keep reusable architecture
- Escrow logic must remain isolated/safe

## GLOBAL SELF-TEST & VALIDATION (all platforms)

Follow `docs/GLOBAL_SELF_TEST_VALIDATION.md` on every change:

- Self-Test Center + Diagnostics Panel + mock Audit Trail + Feature Flag checks + Smoke
- PASS / WARN / FAIL, issue count, last checked, MOCK ONLY badge
- Admin state changes must be mock-validatable after change (no real settlement/on-chain)
- No uncontrolled realtime loops; additive-only extensions
- Keep `npm run release:check` (build, lint, test, admin verify)

01-TetherGet-P2P mapping: `runAdminSelfTestSuite()`, `runAdminSelfTestSuiteWithCore()` / `runP2pSelfTestDualBundle()` (`@tetherget/self-test-core`), `P2pDevDiagnosticsPanel`, `validateP2pAdminSurface()`, `runMembershipSelfTestSuite()`, `runDisputeSelfTestSuite()`, `runNotificationSelfTestSuite()`, `npm run smoke:p2p`. See `docs/P2P_SELF_TEST_CORE_ADAPTER.md`.

Membership / Points discount (mock): `src/membership/` — see `docs/TETHERGET_MEMBERSHIP.md`, `docs/TETHERGET_ONEAI_BRIDGE.md`.

P2P Dispute / Escrow Case Center (mock): `src/dispute/` — see `docs/P2P_DISPUTE_CENTER.md`, `docs/P2P_ESCROW_FLOW.md`, `docs/TETHERGET_AUDIT.md`. Additive to server `DisputePanel`; no real release/bank API.

Admin Risk Guard / Escrow Release Guard (mock): `src/risk/` + `src/components/risk/` — see `docs/P2P_RISK_GUARD.md`. `runRiskGuardSelfTestSuite()` in admin **자동검증**; mock release disabled when `dispute_opened`.

Notification / Activity feed (mock): `src/notifications/` — see `docs/P2P_NOTIFICATION_CENTER.md`, `docs/P2P_ACTIVITY_FEED.md`. localStorage only; no push; bridges from `dispute/disputeHelpers.js` and membership sync.

---

## REQUIRED DOCUMENT RULE

Whenever:
- architecture changes
- escrow logic changes
- wallet structure changes
- new systems are added
- new folders are added
- admin/referral structure changes

You MUST also update:
- MASTER_MANUAL.md
- docs/*.md

---

## CURRENT PRIORITIES

1. P2P escrow UX
2. Wallet structure
3. Referral/admin structure
4. Mock escrow flow
5. Security-oriented architecture
6. Mobile-first UI
7. Future TGX/UTE integration

---

## IMPORTANT

Update documentation together with architecture changes.