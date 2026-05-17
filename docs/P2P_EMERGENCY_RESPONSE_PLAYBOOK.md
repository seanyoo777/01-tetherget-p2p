# P2P Emergency Response Playbook (mock)

## Scope

Mock-first operator playbook for escrow/dispute emergencies. Aggregates **Escrow Health Overview** and **Admin Risk Guard** signals. No real bank transfer, on-chain release, external API, or WebSocket.

## Feature flag

| Key | Env override |
|-----|----------------|
| `tetherget.enableEmergencyResponsePlaybook` | `VITE_TETHERGET_ENABLE_EMERGENCY_PLAYBOOK` (`1` / `true`) |

Default: enabled in `import.meta.env.DEV`.

## Modules

| Path | Role |
|------|------|
| `src/emergencyPlaybook/emergencyPlaybookTypes.ts` | `EmergencyPlaybookSnapshot` types |
| `src/emergencyPlaybook/emergencyPlaybookHelpers.js` | Build snapshot, record view, mock actions |
| `src/emergencyPlaybook/emergencyPlaybookStore.js` | Audit + mock action log (`localStorage`) |
| `src/emergencyPlaybook/emergencyPlaybookSelfTest.js` | Node self-test suite |
| `src/components/emergencyPlaybook/EmergencyPlaybookPanel.jsx` | Admin UI |

## EmergencyPlaybookSnapshot

| Field | Meaning |
|-------|---------|
| `escrowEmergencyState` | Open escrow + release-block severity |
| `disputeSpikeWarning` | Active dispute ratio / spike flag |
| `releaseBlockEmergencyMode` | Mock emergency hold mode (local flag + blocks) |
| `notificationPressure` | Unread / dispute-related alerts |
| `operatorChecklist` | Required operator steps (auto-completed from state) |
| `mockEmergencyActionLog` | Append-only mock operator actions |
| `escrowHealthRef` | Linked health overview verdict |
| `riskGuardRef` | Linked risk guard status |
| `overviewVerdict` | Worst-of aggregate |
| `mockOnly` | Always `true` |

## Mock actions

Recorded via `recordMockEmergencyAction()` — audit `emergency.mock_action_recorded`, detail includes `noRealRelease: true`.

- Acknowledge dispute spike (mock)
- Enable release-block emergency mode (mock)
- Broadcast operator alert (mock)
- Escalate to manual review queue (mock)

## UI

**Admin → 분쟁/정산** — `EmergencyPlaybookPanel` between `EscrowHealthBoard` and `AdminRiskGuardPanel` when flag is on.

## Audit events

- `emergency.playbook_view`
- `emergency.mock_action_recorded`

Storage: `tg_emergency_playbook_audit_v1`, `tg_emergency_playbook_action_log_v1`.

## Self-test (Node)

| Group id | Checks |
|----------|--------|
| `emergency-playbook-schema` | Snapshot shape + `mockOnly` |
| `emergency-playbook-mock-only` | Flag + mock contract |
| `emergency-playbook-no-websocket` | Local aggregate only |
| `emergency-no-real-release` | Mock actions never enable real release |
| `emergency-playbook-audit` | View + mock action audit rows |

Admin Self-Test card: `emergency_playbook_mvp`.

## Integration

- **`buildEscrowHealthSnapshot()`** — dispute pressure, notifications, health verdict
- **`getRiskGuardDiagnostics()`** — guard status, blocked cases
- No circular import with `getP2pDevDiagnostics()`

## Verification

```bash
npm run lint
npm test
node --test src/emergencyPlaybook/__tests__/emergencyPlaybook.test.js
npm run build
```
