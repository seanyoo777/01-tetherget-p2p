# TetherGet MVP

## Vercel Preview / Production (important)

The hosted UI is **static**. API calls use `VITE_API_BASE` baked in at build time.

1. In Vercel Project → **Settings → Environment Variables**, set for **Preview** and **Production**:
   - `VITE_API_BASE` → your real backend origin (must include `https://`, no trailing slash), e.g. `https://your-api.example.com`
   - `VITE_GOOGLE_CLIENT_ID` → same as Google OAuth client id (if you use Google login)
2. Redeploy after changing env vars (Vite reads them at build time).

Without `VITE_API_BASE`, the app uses **same-origin** `/api/...` requests (works only if you proxy `/api` on the same host — **do not** use a blanket SPA rewrite that sends `/api/*` to `index.html`).

## Local setup

1. Copy `.env.example` to `.env`.
2. Fill required values:
   - `JWT_SECRET`
   - `GOOGLE_CLIENT_ID`
   - `VITE_GOOGLE_CLIENT_ID` (same value as `GOOGLE_CLIENT_ID`)
3. Install and run:
   - `npm install`
   - `npm run dev:full`

## Google click login (real)

- Frontend button: `로그인 / 가입` modal -> `Google 클릭 로그인`
- Backend endpoint: `POST /api/auth/google` (ID token verification with `google-auth-library`)
- If `GOOGLE_CLIENT_ID` is missing, API returns `503` by design.

## Referral downline validation flow

1. Open referral owner account and copy referral code.
2. Open another browser profile/incognito with `/?ref=<CODE>`.
3. Use `Google 클릭 로그인` (new email).
4. Confirm DB fields are set:
   - `users.referred_by_user_id`
   - `users.referred_by_code`
5. Confirm admin view reflects downline relation.

## Admin consistency checks

- `npm run verify:admin-smoke`
  - stage summary consistency
  - downline parent override consistency

## Release gate (must pass)

- Follow `RELEASE_CHECKLIST.md` before every deploy.
- Minimum automated gate: `npm run release:check` (server syntax + build + admin smoke)
- If any checklist item fails, do not deploy.

## GitHub push -> Vercel deploy

This repository includes `.github/workflows/vercel-deploy.yml` for production deploys on `master` push.
It also includes `.github/workflows/ci-gate.yml` to enforce release gates on pull requests to `master`.

Set these GitHub repository secrets first:
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

## Branch protection (required)

Set GitHub branch protection on `master`:

1. GitHub repository -> `Settings` -> `Branches` -> `Add branch protection rule`
2. Branch name pattern: `master`
3. Enable `Require a pull request before merging`
4. Enable `Require status checks to pass before merging`
5. Select required checks:
   - **`CI Release Gate / gate`** — workflow name + job id from `.github/workflows/ci-gate.yml`.
   - If the name does not appear yet, open any PR (or push a branch) so the workflow runs once; GitHub then lists the exact check in the dropdown.
6. Enable `Require branches to be up to date before merging`
7. (Recommended) Enable `Require conversation resolution before merging`
8. Save rule

Result: PR cannot merge unless release gate passes.

## Contributing

See `CONTRIBUTING.md` for branch flow, PR expectations, and review basics.
