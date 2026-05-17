# P2P Admin Test Account (mock)

## Fixed credentials

| Field | Value |
|-------|--------|
| **ID (email)** | `admin@tetherget.local` |
| **Password** | `admin1234` |
| **Role** | `super_admin` (system) / `슈퍼페이지 관리자` (display) |
| **session_role** | `hq_ops` |

This is a **mock-only** account for browser QA. It is **not** a production service account.

## Source of truth (code)

| Path | Purpose |
|------|---------|
| `src/auth/mockAdminAccount.js` | Fixed email/password/role constants |
| `src/mock/adminTestAccount.js` | Re-export for mock layer |
| `src/testAccountRegistry.js` | `SEED_TEST_ACCOUNTS` + `verifyLocalEmailPassword()` |
| `src/admin/canAccessAdminSafe.js` | Admin UI gate allow-list |
| `localStorage` key `tetherget_local_session_v1` | Session restore after refresh |

When the API server is running, `admin@tetherget.local` is also seeded in SQLite (`server/index.js`) with the same password for unified login fallback.

## Login flow

1. Open app → **로그인**
2. Use **관리자 테스트 계정 자동 입력** or type ID/PW manually
3. Click **로그인** — if API is offline, local verify succeeds; if API is online, DB seed login also works
4. Open **관리자** in the nav → HQ admin dashboard

## Accessible admin areas (mock)

After login as `admin@tetherget.local`:

| Area | Admin shell / tab |
|------|-------------------|
| Dashboard | 대시보드 |
| Members | 회원관리 |
| Referral / stage | 추천·단계 |
| Trade / audit | 거래·감사 |
| **Dispute / settlement** | 분쟁/정산 (Dispute Case Center, Escrow Health, Emergency Playbook, Risk Guard) |
| Ops / settings | 운영·설정 |
| UTE / P2P surface | UTE·P2P |
| Self-test | Admin Self-Test Center |

User-facing modules (same session): **escrow** trade flow, **wallet** mock auth, **referral**, **dispute center**, **notifications**, **emergency playbook** panels (feature flags on in DEV).

## localStorage / mock-only

- Passwords for seed accounts live in client seed data only (not shown in user lists).
- Local login writes `tetherget_local_session_v1` (email, role, `session_role`, etc.).
- JWT keys `tetherget_auth_token` / refresh are cleared on local test login.
- No requirement to connect a real external auth provider for this account.

## Legacy aliases (still work)

- `admin@tetherget.com` / `admin1234`
- `hq2@tetherget.test` / `Test1234`

Prefer **`admin@tetherget.local`** for new QA per PHASE42 admin account policy.

## Verification

```bash
npm run lint
npm test
npm run build
npm run dev
npm run smoke:admin
```

Browser checklist:

- [ ] Login succeeds with fixed ID/PW
- [ ] Refresh keeps session (`tetherget_local_session_v1`)
- [ ] Logout clears session
- [ ] Admin nav → 분쟁/정산, Escrow Health, Emergency Playbook visible (DEV flags)
- [ ] No console errors on login/admin open
