# Admin Operations Manual

This checklist keeps admin member-stage updates stable and reproducible.

## Daily Start

1. Run frontend only from:
   - `c:/Users/USER/Downloads/tetherget-mvp-main/tetherget-mvp-main`
2. Start dev server:
   - `npm run dev -- --host 0.0.0.0 --port 5175`
3. Open:
   - `http://localhost:5175/`

## Stage Update Flow (Operator)

1. Open `관리자 > 회원관리`.
2. Select a member from the left list.
3. Choose the target stage from `회원 단계 지정`.
4. Click `단계 적용`.
5. Verify 3 places match:
   - Stage chips count
   - Member row `현재 단계`
   - Right panel `현재 단계`

## Audit Log Coverage

The following actions are now recorded in admin action logs:

- Stage change (`단계 변경`, `단계 변경(로컬)`)
- Admin assignment toggle (`관리자 지정 변경`)
- Downline parent reassignment (`하위 지정 변경`)
- Child rate update (`하부 배분율 변경`)

## Health Signal

In `회원관리`, if stage summary and expected member count differ, a red warning appears:

- `단계 집계 점검 필요: 합계 X / 기대 Y`

If shown, do not continue bulk operations until mismatch is resolved.
