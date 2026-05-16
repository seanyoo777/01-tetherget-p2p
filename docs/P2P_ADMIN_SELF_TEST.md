# P2P Admin Self-Test Center (mock only)

Admin **자동검증** tab runs a pure client-side validation suite when an operator clicks **자동 검증 실행**. No database writes, settlement, wallet movement, or polling.

## Scope

| Card | Validates |
|------|-----------|
| 회원 단계 | LEVEL transition mock, badge, referral rates, admin table before/after |
| 수수료 체계 | buyer/seller/total fee, referral vs company share (mock BPS) |
| 레퍼럴 배분 | stage ladder `received >= child`, spread warnings |
| 거래상태 | `deriveMatrixStatus` on sample DB statuses |
| Escrow 상태 | `mapCanonicalEscrowToDisplay` pairs |
| 관리자 메뉴 | shell menu → panel tab smoke (회원/거래/레퍼럴/정산/UTE) |
| Feature Flag / Fallback | `VITE_P2P_SHOW_DIAGNOSTICS`, `resolveApiBase`, `PLATFORM_CODE` |
| Audit Trail (mock) | `mockAppendAuditEntry`, `runP2pAdminRefreshSelfTest` snapshot |
| UTE / P2P diagnostics | `getP2pDevDiagnostics()` mock flags |

## Files

| Path | Role |
|------|------|
| `src/admin/adminSelfTestModel.js` | Fee math, level transition, trade/escrow check helpers |
| `src/admin/adminSelfTestEngine.js` | `runAdminSelfTestSuite()`, per-card validators |
| `src/admin/panels/AdminSelfTestCenterPanel.jsx` | PASS/WARN/FAIL UI, MOCK ONLY badge |
| `src/admin/adminTestIds.js` | Playwright `data-testid` values |
| `src/admin/adminMenuIds.js` | `ADMIN_PANEL_TAB_IDS.SELF_TEST` = `selfTest` |

## Result shape

`runAdminSelfTestSuite()` returns aggregate `status`, `issueCount`, `lastChecked`, `cards[]`, plus `levelTransition` and `feeBreakdown` summaries for the panel detail blocks.

## Tests

```bash
npm test   # includes src/admin/__tests__/adminSelfTest.test.js
```

## UI entry

`App.jsx` admin nav → **자동검증** (`adminViewTab === "selfTest"`).

## Global policy

Aligned with `docs/GLOBAL_SELF_TEST_VALIDATION.md` (Self-Test Center, Diagnostics, Audit Trail, Feature Flags, Smoke — additive only).

## Constraints

- Mock/demo only — same rules as `docs/P2P_TRADE_FLOW.md` diagnostics layer.
- Triggered manually (button), not on an interval.
- Does not replace `validateP2pAdminSurface()`; complements it for member/fee/referral/menu checks.
