# Admin structure audit — 01 TetherGet-P2P (stabilization pass)

**Scope**: Repository **01-TetherGet-P2P** only. No TGX-CEX (2), MockInvest (4), UTE (7), 테더식당 (8), or other product code paths are merged here.

**Principles applied**: Existing features preserved; no full admin UI rewrite; mock-first; no new real trading / wallet / smart-contract integrations; no large refactors. This document records **structure** and **risk isolation** only.

---

## 1. Current admin structure (summary)

| Layer | Role | Files |
|-------|------|--------|
| **Gate** | Who may open admin | `src/admin/canAccessAdminSafe.js`, `App.jsx` (`adminGateAllowed`, `sessionProfile.canAccessAdmin`) |
| **Shell** | Left nav + header + single `children` slot | `src/admin/AdminShell.jsx` (menu ids: `dashboard`, `member`, `referral`, `stage`, `trade`, `settlement`, `settings`, `ute`) |
| **Panel** | All functional admin UI in one large component | `App.jsx` → `function AdminReferralPanel` (~5k+ lines) |
| **Tabs** | Inner horizontal tabs (`adminViewTab`) | Same panel: `dashboard`, `member`, `memberOps`, `security`, `kyc`, `dispute`, `ops`, `audit`, `uteSurface` |
| **Shell → tab map** | Sidebar selection sets inner tab | `App.jsx` `adminShellLegacyTab` useMemo — constants in `src/admin/adminMenuIds.js` (`ADMIN_SHELL_TO_PANEL_TAB`) |
| **Top error boundary** | Catches uncaught errors in entire panel | `AdminShell` wraps `<main>` with `AdminErrorBoundary` |
| **Section boundaries** | Isolates heavy tabs so one throw does not blank the whole panel | `src/admin/AdminSectionBoundary.jsx` — **`audit`**, **`ops`**, **`kyc`**, **`dispute`**, **`member`**, **`memberOps`** (split roots), **`security`** in `AdminReferralPanel` (`App.jsx`) |
| **Placeholder** | Reserved for empty shell routes | `src/admin/AdminPlaceholder.jsx` (not wired to every menu item) |

**UTE read-only strip**: `uteSurface` tab + `/api/admin/p2p/ute-surface` (see `MASTER_MANUAL.md`). Not mixed with CEX/UTE product repos.

---

## 2. Sections with higher runtime error risk (watch list)

| Id / area | Why risk | Mitigation (this pass) |
|-----------|----------|-------------------------|
| **`audit` tab** | Large tables, `platformAuditLogs` + `adminP2pOrders` + timeline JSON, many optional fields | Wrapped in **`AdminSectionBoundary`** (`admin-tab-audit`) |
| **`ops` tab** | Platform settings, market catalog, webhooks, snapshots, emergency mode, audit CSV/PDF — many API calls and state | Wrapped in **`AdminSectionBoundary`** (`admin-tab-ops`) |
| **`kyc` tab** | Document preview, view requests, multipart flows | Wrapped in **`AdminSectionBoundary`** (`admin-tab-kyc`, label **KYC 관리**) |
| **`dispute` tab** | PIN/OTP, policy rows, timeline chain | Wrapped in **`AdminSectionBoundary`** (`admin-tab-dispute`, label **분쟁 관리**) |
| **`member` tab** | Large tree, pagination, inline rates | Wrapped in **`AdminSectionBoundary`** (`admin-tab-member`, label **회원 관리**) |
| **`memberOps` tab** | Ops grid, memo, media monitor — JSX split by `security` and dispute blocks | Three **`AdminSectionBoundary`** wraps (`admin-tab-memberOps`, label **회원 운영**): 운영 그리드, 관리 메모, 첨부/음성 모니터링 |
| **`security` tab** | Risk list + detail panel | Wrapped in **`AdminSectionBoundary`** (`admin-tab-security`, label **보안 관리**) |
| **`false && isAdminTab(...)` blocks** | Dead UI paths still mounted | Still **outside** tab section boundaries; low crash risk but confusing |
| **`uteSurface` tab** | Fetches `ute-surface`; falls back to demo payload in client mock | Isolated fetch in `useEffect`; errors unlikely to break whole panel |

**Known code smells (not “fixed” in this pass per no large refactor)**:

- `AdminReferralPanel` monolith in `App.jsx` — hard to test and easy to regress.
- Some blocks use `false && isAdminTab(...)` — dead UI paths still mounted.

---

## 3. Sections expected to behave normally (under typical mock admin use)

- **Dashboard** cards and MOCK admin briefs (no network required for display).
- **UTE·P2P** metrics grid when API returns 401/403 — client mock falls back to `DEMO_SURFACE` (`adminPlatformMock.ts`).
- **Member tree** when `authUsers` and selection state are consistent.
- **Sticky tab bar** and shell navigation (pure state toggles).

---

## 4. Items suitable for a future **common admin core** (cross-product)

Aligned with your list — **conceptual** only for 01; extraction is a later phase:

- **users** — `authUsers`, `userRepo`-backed APIs  
- **roles** — JWT `role` / `session_role`, `canAccessAdminSafe` (to be replaced in prod)  
- **admin** — shell, section boundaries, audit logging patterns  
- **referral** — tree engine, stage model (`adminMemberModel.js`)  
- **wallet** — linked wallet display, withdrawal list (mock)  
- **ledger** — `user_financial_accounts` minor units  
- **notification** — `notificationMock`, push stubs  
- **audit** — `platform_audit_logs`, approval audit reports  
- **settlement** — dispute / escrow policy UI (mock policy)

**Do not** copy TGX / MockInvest / UTE repos into 01 to “share” code — integrate later via packages or shared npm scope when product owners align.

---

## 5. TetherGet **P2P-only** admin concerns (stay in 01)

Map from your product list to current UI (approximate):

| P2P-specific topic | Where it surfaces today |
|--------------------|-------------------------|
| P2P trade management | `audit` tab — P2P 주문 모니터, admin cancel |
| Escrow state (off-chain ledger) | Order status + `uteSurface` metrics (`p2p_escrow_locked_minor_total`) |
| Buyer payment / proof | Main P2P app flows (`App.jsx` P2P section), not a dedicated admin sub-route |
| Seller listing | Same — main app |
| Coin release | Documented mock / optional on-chain elsewhere — **no new contract wiring in this pass** |
| Disputes / incident | `dispute` tab |
| Bank account / wallet address | KYC / MyInfo / member views |
| Level-based delayed transfer | Escrow policy delays + member level UX |
| FX / currency settings | `ops` — price feed provider, platform settings |
| Fee rates | Policy / memberOps rate controls (spread across panels) |

---

## 6. Menu / route ID preparation (implemented)

- **`src/admin/adminMenuIds.js`** — `ADMIN_SHELL_MENU_IDS`, `ADMIN_PANEL_TAB_IDS`, `ADMIN_SHELL_TO_PANEL_TAB`, list exports for future TypeScript or JSON schema.

---

## 7. Stabilization changelog

### Phase 1 (audit / ops)

- `AdminErrorBoundary`: optional `sectionLabel` for clearer failure cards + scoped dev logging.
- `AdminSectionBoundary`: thin wrapper for tab-level isolation.
- `App.jsx`: **`audit`** and **`ops`** tab roots wrapped; `adminShellLegacyTab` reads `ADMIN_SHELL_TO_PANEL_TAB`.

### Phase 2 (kyc / dispute)

- `App.jsx`: **`kyc`** and **`dispute`** tab roots wrapped with `AdminSectionBoundary` (`sectionLabel`: **KYC 관리**, **분쟁 관리**). Runtime errors in either tab show the existing per-section fallback UI (“다시 시도”) without taking down other tabs.

### Phase 4 (split plan — docs only)

- Added **[ADMIN_PANEL_SPLIT_PLAN.md](./ADMIN_PANEL_SPLIT_PLAN.md)**: `adminViewTab` ↔ `AdminSectionBoundary` map, logical section order, `src/admin/panels/*.jsx` **name candidates only**, common-core vs TetherGet-only split, recommended **low→high risk** extraction order. **No** `App.jsx` moves in this phase.

### Phase 5 (`uteSurface` panel split)

- **`src/admin/panels/UteSurfacePanel.jsx`**: `uteSurface` tab UI only; **`App.jsx`** keeps `uteSurfaceMetrics` state and `useEffect` fetch. Props: `theme`, `uteSurfaceMetrics`, `visible`. No `AdminSectionBoundary` added on this tab (same as before). See [ADMIN_PANEL_SPLIT_PLAN.md](./ADMIN_PANEL_SPLIT_PLAN.md) Phase 5.

---

## 8. Recommended next steps (not done here)

1. Continue **`ADMIN_PANEL_SPLIT_PLAN.md`** one panel at a time (**`dashboard`** next); keep boundaries; no helper moves in early PRs.  
2. Optional **section boundary** for **`uteSurface`** or shared blocks (e.g. 관리자 액션 로그) if crashes appear.  
3. Replace `false && isAdminTab` blocks with real removal behind a feature flag (separate PR).  
4. Extend `npm run lint` to more of `App.jsx` after extraction reduces file size.

---

## Related

- [ADMIN_RULES.md](./ADMIN_RULES.md)  
- [ADMIN_PANEL_SPLIT_PLAN.md](./ADMIN_PANEL_SPLIT_PLAN.md)  
- [MASTER_MANUAL.md](../MASTER_MANUAL.md)  
- [SECURITY_RULES.md](./SECURITY_RULES.md)
