# P2P Escrow Health Overview (mock)

## Scope

Operational aggregate of escrow/dispute/risk/notification/diagnostics for admin review. **Mock only** — no bank API, no on-chain release, no WebSocket, no polling backend.

## Feature flag

| Key | Env override |
|-----|----------------|
| `tetherget.enableEscrowHealthOverview` | `VITE_TETHERGET_ENABLE_ESCROW_HEALTH_OVERVIEW` (`1` / `true`) |

Default: enabled in `import.meta.env.DEV`.

## Modules

| Path | Role |
|------|------|
| `src/escrowHealth/escrowHealthTypes.ts` | `EscrowHealthSnapshot` and pressure types |
| `src/escrowHealth/escrowHealthHelpers.js` | `buildEscrowHealthSnapshot`, `recordEscrowHealthOverviewView` |
| `src/escrowHealth/escrowHealthStore.js` | `tg_escrow_health_audit_v1` |
| `src/escrowHealth/escrowHealthAudit.js` | Audit append helper |
| `src/escrowHealth/escrowHealthSelfTest.js` | Node self-test suite |
| `src/escrowHealth/escrowHealthFeatureFlags.js` | Feature flag resolver |
| `src/components/escrowHealth/EscrowHealthBoard.jsx` | Admin health board UI |

## EscrowHealthSnapshot

| Field | Source |
|-------|--------|
| `openEscrowCount` | Non-terminal dispute cases (`dispute/`) |
| `disputePressure` | Active vs platform order KPI |
| `releaseBlockedCount` | `listReleaseBlockedCases()` (`risk/`) |
| `riskGuardSummary` | `getRiskGuardDiagnostics()` |
| `notificationPressure` | `loadNotifications()` + activity feed |
| `diagnosticsVerdict` | `getP2pDevDiagnostics()` |
| `adminSelfTestRef` | `getLastP2pSelfTestCoreBundle()` |
| `disputeTrend` | Per-status counts |
| `overviewVerdict` | Worst of pressure + guard + diagnostics |
| `mockOnly` | Always `true` |

## UI

- **Admin → 분쟁/정산** — `EscrowHealthBoard` above `AdminRiskGuardPanel` when flag is on
- Summary cards, dispute trend, release-blocked strip, PASS/WARN/FAIL overview badge

## Audit

- `escrow.health_overview_view` — recorded on board mount / refresh (mock detail payload)

## Self-test (Node)

| Group id | Checks |
|----------|--------|
| `escrow-health-schema` | Snapshot shape + `mockOnly` |
| `escrow-health-mock-only` | Flag key + mock contract |
| `escrow-health-no-websocket` | No `WebSocket` / external API in module sources |
| `escrow-health-audit` | Overview view audit row |

Also wired in **Admin Self-Test** card `escrow_health_overview_mvp`.

## Integration (read-only)

- **Dispute center** — case list + demo seed
- **Risk guard** — blocked list + diagnostics
- **Notifications** — unread / dispute / escrow counts
- **P2P diagnostics** — UTE validation + risk status
- **Admin self-test core** — last core bundle overall

`getP2pDevDiagnostics()` exposes `escrowHealthEnabled` (full snapshot is built only via `buildEscrowHealthSnapshot` / board UI to avoid circular imports).

## Verification

```bash
npm run lint
npm test
node --test src/escrowHealth/__tests__/escrowHealth.test.js
npm run build
```
