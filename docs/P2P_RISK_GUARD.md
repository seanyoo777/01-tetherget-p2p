# P2P Admin Risk Guard / Escrow Release Guard (mock)

## Scope

Additive guard layer on top of `src/dispute/` and `src/notifications/`. No real bank API, wallet release, or on-chain settlement.

## Modules

| Path | Role |
|------|------|
| `src/risk/riskGuardTypes.ts` | PASS / WARN / FAIL levels, issue codes |
| `src/risk/riskGuardStore.js` | `tg_risk_guard_audit_v1`, meta |
| `src/risk/riskGuardAudit.js` | Append-only audit events |
| `src/risk/riskGuardHelpers.js` | Evaluate guard, blocked list, mock release attempt |
| `src/risk/riskGuardSelfTest.js` | Node self-test suite |
| `src/components/risk/*` | Admin UI panels and badges |

## UI surfaces

- **Admin → 분쟁/정산** — `AdminRiskGuardPanel` (blocked cases, diagnostics strip)
- **Dispute case detail** — `EscrowReleaseGuardPanel` (mock release disabled when `dispute_opened`)
- **EscrowStatusTimeline** — RELEASE BLOCKED / DISPUTE badges
- **OperatorReviewPanel** — disabled mock release when blocked
- **P2pDevDiagnosticsPanel** — risk guard status, issue count, last checked
- **Admin Self-Test** — card `risk_guard_mvp`

## Audit events

- `risk.guard.release_blocked`
- `risk.guard.release_attempt_denied_mock`
- `risk.guard.release_unblocked_mock`
- `risk.guard.resolve_sync_mock`

## Notifications & activity

On block / denied attempt: `escrow.release.blocked_mock` notification + `appendActivityItem` with risk_guard actor.

## Verification

```bash
npm test
node --test src/p2p/__tests__/riskGuard.test.js
```
