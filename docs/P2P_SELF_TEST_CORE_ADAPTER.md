# P2P Self-Test Core Adapter (PHASE35)

## Purpose

Wrap existing **01-TetherGet-P2P** mock self-test output in [`@tetherget/self-test-core`](../../packages/self-test-core) `buildSelfTestResult` without removing legacy shapes.

## Module

| File | Role |
|------|------|
| `src/p2p/p2pSelfTestCoreAdapter.js` | Verdict mapping, suite conversion, dual/platform bundles |
| `src/p2p/p2pSelfTestCoreAdapter.ts` | Re-export for TS consumers |

## API

| Export | Description |
|--------|-------------|
| `runP2pSelfTestDualBundle(ctx)` | `{ legacy: runAdminSelfTestSuite(), core: buildSelfTestResult }` |
| `runP2pSelfTestCoreBundle(ctx)` | Extended core bundle (+ dispute, risk, notification, membership suites) |
| `adaptAdminLegacySuiteToCore(legacy)` | Admin cards → `SelfTestResult` |
| `runAdminSelfTestSuiteWithCore(ctx)` | Legacy admin return + `coreBundle` field |
| `getLastP2pSelfTestCoreBundle()` | Last core result (for diagnostics strip) |
| `validateP2pSelfTestCoreWiring()` | Node wiring self-test (no WebSocket) |

## Verdict mapping

| Legacy (`adminSelfTestModel`) | Core |
|-----------------------------|------|
| `pass` | `PASS` |
| `warn` | `WARN` |
| `fail` | `FAIL` |

Core `issueCount` = **FAIL** issue tally (platform convention). Legacy admin `issueCount` on cards may count WARN+FAIL — both remain available.

## UI (minimal)

- **Admin Self-Test Center** — summary chip `core · FAIL n` when `runAdminSelfTestSuiteWithCore` runs.
- **P2pDevDiagnosticsPanel** — strip/full cells `core ST` / `core fail#` when a core bundle was cached from admin run.

No change to card layout or legacy PASS/WARN/FAIL chips.

## Constraints

- mockOnly: true
- append-only audit unchanged
- no WebSocket, no external API, no real settlement/on-chain
- additive only — existing `runAdminSelfTestSuite()` unchanged

## Verification

```bash
npm run build --prefix ../packages/self-test-core
cd ../packages/self-test-core && npm test
cd ../../01-TetherGet-P2P
npm test
npm run lint
npm run build
```
