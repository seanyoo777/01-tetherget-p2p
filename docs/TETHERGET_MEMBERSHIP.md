# TetherGet P2P — Membership & Points Discount (mock)

Mock-first membership tiers for P2P fee **preview** only. Designed to align with **03-OneAI** Points / Level later — no real discount engine, settlement, or API calls.

## Tiers

| Tier | Points (mock) | P2P fee discount |
|------|---------------|------------------|
| Basic | 0 | 0% |
| Silver | 1,000 | 5% |
| Gold | 5,000 | 10% |
| Platinum | 15,000 | 20% |
| VIP | 50,000 | 30% |

Default demo state: **6,200 pts → Gold**.

## Modules

| Path | Role |
|------|------|
| `src/membership/membershipTiers.js` | Tier ladder, progress, next level |
| `src/membership/membershipModel.js` | Fee preview, localStorage mock state, audit helpers |
| `src/membership/membershipFeatureFlags.js` | `VITE_MEMBERSHIP_DISCOUNT_ENABLED`, `VITE_MEMBERSHIP_BRIDGE_ONEAI_ENABLED` |
| `src/membership/membershipAudit.js` | `membership.level.mock`, `discount.preview`, `sync.mock` |
| `src/membership/membershipSelfTest.js` | Pure validators + `runMembershipSelfTestSuite()` |
| `src/membership/ui/*` | Card, fee preview, OneAI strip, Help Center |

## UI entry points

- **내정보 → 멤버십** — card, OneAI bridge, fee preview (10k USDT sample)
- **거래** — fee preview strip when logged in + discount flag on
- **고객센터** — Help Center section

## Feature flags

| Env | Meaning |
|-----|---------|
| `VITE_MEMBERSHIP_DISCOUNT_ENABLED=1` | Show discount badge + fee preview (default on in mock) |
| `VITE_MEMBERSHIP_BRIDGE_ONEAI_ENABLED=1` | Show OneAI bridge strip |

## Self-test

Included in admin **자동검증** via `validateMembershipMvpSelfTest()` and unit tests:

```bash
npm test
```

## Constraints

- Additive only; no removal of existing fee flows
- `computeMembershipFeePreview` wraps `computeMockFeeBreakdown` — display math only
- No websocket / polling for sync

See also: `docs/TETHERGET_ONEAI_BRIDGE.md`, `docs/GLOBAL_SELF_TEST_VALIDATION.md`.
