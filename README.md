# TetherGet MVP

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
