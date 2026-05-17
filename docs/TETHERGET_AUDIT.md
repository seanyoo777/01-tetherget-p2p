# TetherGet audit streams (mock MVP)

## Dispute center audit (`src/dispute/disputeAudit.js`)

Stored in `tg_dispute_audit_v1` (localStorage). Each entry:

```json
{
  "id": "DA-…",
  "event": "dispute.case.created",
  "caseId": "DSP-…",
  "detail": { "_mock": true },
  "at": 1710000000000,
  "mockOnly": true
}
```

### Event catalog

| Event | When |
|-------|------|
| `dispute.case.created` | New mock dispute case |
| `dispute.evidence.uploaded_mock` | Mock evidence row added |
| `dispute.operator.review_started` | Operator starts review |
| `dispute.case.resolved_mock` | Mock resolve |
| `dispute.case.rejected_mock` | Mock reject |
| `escrow.release.blocked_mock` | Release block on dispute open |

## Membership audit

See `src/membership/membershipAudit.js` and [TETHERGET_MEMBERSHIP.md](./TETHERGET_MEMBERSHIP.md).

## Admin action logs

Server/UI admin strip (`appendAdminAction`) — separate from dispute localStorage trail.

## P2P admin refresh validation

`src/p2p/p2pDevDiagnostics.js` — UTE surface refresh checks (mock).

## Self-test coverage

- `runDisputeSelfTestSuite()` — schema, evidence, escrow sync, release block, audit, no-real-transfer flags.
- `runAdminSelfTestSuite()` — includes card `dispute_center_mvp`.

## Contract references

Normative long-form contracts (may differ naming from MVP mock keys):

- [TETHERGET_DISPUTE_AUDIT_CONTRACT.md](./TETHERGET_DISPUTE_AUDIT_CONTRACT.md)
- [GLOBAL_SELF_TEST_VALIDATION.md](./GLOBAL_SELF_TEST_VALIDATION.md)
