# Admin rules (TetherGet P2P)

This document defines how **admin**, **owner**, and **HQ-style** surfaces interact with the rest of the platform while preserving **mock-first** behavior, **mobile-first** UX, and a **reusable** structure for future products (TGX / UTE, multi-line services).

## Scope

- **In scope**: UI entry policy, member stage modeling, KYC switch governance, referral configuration touchpoints, alignment with server gates.
- **Explicitly mock/demo**: Admin actions configure **simulations and policies**; they do not authorize **real** bank or chain payouts unless a future phase adds separately reviewed infrastructure.

## Who can open admin UI

Client-side gate (**demo-oriented**):

- **`src/admin/canAccessAdminSafe.js`** — allows specific test emails, `isSuperAdmin`, normalized **role** / **session_role** tokens (`admin`, `hq_ops`, `super_admin`, etc.), and selected Korean role substrings.

**Production rule**: Replace allow-lists with centralized identity (OIDC), step-up MFA, and server-side session claims mapped to RBAC. Until then, treat all admin paths as **staging/demo**.

## Shell and navigation

- **`src/admin/AdminShell.jsx`** — layout wrapper for admin experiences; keep responsive breakpoints **mobile-first** (single column, collapsible nav). Default nav includes **UTE·P2P** (maps to internal `uteSurface` tab).
- **`src/pages/SimpleAdmin.tsx`**, **`src/admin/AdminPlaceholder.jsx`** — lightweight or placeholder admin routes; extend here rather than duplicating policy in `App.jsx` where possible.
- **`AdminSectionBoundary`** — **`audit`**, **`ops`**, **`kyc`**, **`dispute`**, **`member`**, **`memberOps`** (split roots), **`security`** in `AdminReferralPanel` (`App.jsx`) so a runtime error in one tab shows that section’s fallback only; other tabs stay interactive. See [ADMIN_STRUCTURE_AUDIT.md](./ADMIN_STRUCTURE_AUDIT.md).
- **Panel split (incremental)**: [ADMIN_PANEL_SPLIT_PLAN.md](./ADMIN_PANEL_SPLIT_PLAN.md) — `uteSurface` → `src/admin/panels/UteSurfacePanel.jsx` (phase 5); further `src/admin/panels/` extractions follow the plan.

## UTE · P2P admin snapshot

- **Shell**: menu id `ute` → in-app tab `uteSurface` (see `App.jsx` `adminShellLegacyTab`).
- **Main admin panel** (`AdminReferralPanel` in `App.jsx`): **UTE·P2P** tab shows metrics from `GET /api/admin/p2p/ute-surface` (order count, escrow locked minor total, active disputes, referral pending, wallet risk user count, ops risk level).
- **SimpleAdmin**: optional `UTE 연동 예비` strip using `src/mock/adminPlatformMock.ts` getters when an auth token is present.
- All of the above are **read-only aggregations** for mock/demo; they must not be wired to autonomous payout or on-chain release.

## Member model and stages

- **`src/admin/adminMemberModel.js`** — shared **stage labels**, **sales level** ladder (`LEVEL 1` … `LEVEL 12`), aliases (Korean labels), `normalizeStageLabel`, and **`mapAuthUserToMember`** for list views.
- **`VIRTUAL_DOWNLINE_MEMBER_COUNT`** — mock scale for downline displays; clearly fictional for performance demos.

Keep stage normalization **canonical** so admin lists, referral trees, and exports agree.

## KYC and trading switches

Two stores must remain conceptually in sync:

| Surface | Storage | Code |
|---------|---------|------|
| Owner / client preview | `localStorage` | `p2pRiskBridge.js` (`KYC_ADMIN_SWITCHES_STORAGE_KEY`) |
| Authoritative server | SQLite `platform_settings` | `p2pCoreGate.js` (`KYC_ADMIN_SWITCHES_SETTING_KEY`) |

**Rule**: Changing switches in the owner UI without persisting to the server must be understood as **preview-only** unless an API persists the merged payload.

## Referral administration

- Distribution BPS map: **`referral.p2p_distribution_bps`** in `platform_settings` (see [REFERRAL_SYSTEM.md](./REFERRAL_SYSTEM.md)).
- Admin tools that edit this JSON must:
  - Validate before save (delegate to **`validateReferralDistributionBps`** from core on the server).
  - Log or audit who changed policy (`updated_by_user_id` on `platform_settings` where applicable).

## Exchange desk policy (if enabled in UI)

- **`src/lib/exchangeAdminPolicy.js`** — separates **exchange** admin concerns from P2P; reuse this pattern when adding new product lines instead of entangling routes.

## Operational metadata

- Use **`mergeAuditPayload`** / **`mergeDomainPayload`** (`server/platform/context.js`) so admin-triggered events carry **`PLATFORM_CODE`** and **`SERVICE_LINE`** for future multi-tenant operations.

## Escrow and disputes (admin view)

- Off-chain delays and approver counts may surface from **`escrow_policy`** for UX. **On-chain** disputes remain governed by **`EscrowContract.sol`** roles — admins must not be described as overriding multisig on-chain rules unless the contract allows it.

## Mobile-first admin UX

- Tables: horizontal scroll with sticky first column or card-per-entity on narrow screens.
- Destructive actions: confirm dialogs with plain-language consequences; avoid dense tables of raw JSON unless behind “Advanced” toggles.

## When to update this document

Update when admin entry rules, stage taxonomy, KYC switch keys, or referral admin keys change — and update `MASTER_MANUAL.md` per `AGENTS.md`.

## Related documents

- [ADMIN_STRUCTURE_AUDIT.md](./ADMIN_STRUCTURE_AUDIT.md) — 관리자 라우트/탭 구조, 위험 섹션, 공통 코어 vs P2P 전용 분류, 격리 조치 기록
- [SECURITY_RULES.md](./SECURITY_RULES.md)
- [REFERRAL_SYSTEM.md](./REFERRAL_SYSTEM.md)
- [ESCROW_RULES.md](./ESCROW_RULES.md)
