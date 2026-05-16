# Global Self-Test & Validation Rule

All TetherGet platform projects (starting with **01-TetherGet-P2P**) follow this policy. New work must stay **additive** and **mock-first**.

## Principles

1. Every feature addition must be **self-testable** (pure validators or manual run buttons — no hidden side effects).
2. Admin flows that change state (member level, fees, referral, trade/escrow) must support **post-change validation** (mock only).
3. Keep a **mock diagnostics panel** (cache, alignment, issue count).
4. Surface results as **PASS / WARN / FAIL**.
5. Always show **issue count**, **last checked**, and **MOCK ONLY** badge where applicable.
6. **Audit trail** stays append-only in mock/demo layers (no destructive rewrite of history).
7. Preserve **build → lint → test → smoke** gates (`npm run release:check`).
8. Validation must work **without websocket or live execution loops**.
9. **Feature flags and fallbacks** must be verifiable in self-test (env toggles, safe defaults).
10. **Do not remove** existing features; extend in additive layers only.

## Forbidden

- Real trade execution or payment release
- Real settlement / payout
- Real on-chain settlement in MVP paths
- Production destructive actions (hard delete, uncontrolled rollback)
- Uncontrolled realtime polling / websocket refresh loops for validation

## Required platform surfaces

| Surface | 01-TetherGet-P2P implementation |
|---------|----------------------------------|
| **Self-Test Center** | `src/admin/adminSelfTestEngine.js` + `AdminSelfTestCenterPanel` (admin tab **자동검증**) |
| **Diagnostics Panel** | `P2pDevDiagnosticsPanel` + `getP2pDevDiagnostics()` (`VITE_P2P_SHOW_DIAGNOSTICS`) |
| **Audit Trail** | Platform audit logs UI; P2P refresh validation snapshot; append-only mock helper |
| **Feature Flag Validation** | Self-test card: diagnostics flag, API base fallback, platform code |
| **Smoke Test** | `npm test`, `npm run smoke:p2p`, `SMOKE_P2P_UNIT_ONLY=1` |

## Agent / contributor checklist

When adding a feature:

- [ ] Pure test or `run*SelfTest()` hook exists
- [ ] Admin state change has a mock validator (if applicable)
- [ ] Diagnostics or self-test card updated (PASS/WARN/FAIL)
- [ ] `npm test` / `npm run lint` / `npm run build` pass
- [ ] `MASTER_MANUAL.md` + relevant `docs/*.md` updated
- [ ] No polling/websocket-only validation path

## Related docs

- `docs/P2P_ADMIN_SELF_TEST.md` — Admin Self-Test Center detail
- `docs/P2P_TRADE_FLOW.md` — P2P diagnostics & UTE alignment
- `AGENTS.md` — project agent rules (includes this policy by reference)
