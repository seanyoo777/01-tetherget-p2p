# Admin structure audit — 01 TetherGet-P2P (stabilization pass)

**Scope**: Repository **01-TetherGet-P2P** only. No TGX-CEX (2), MockInvest (4), UTE (7), 테더식당 (8), or other product code paths are merged here.

**Principles applied**: Existing features preserved; no full admin UI rewrite; mock-first; no new real trading / wallet / smart-contract integrations; no large refactors. This document records **structure** and **risk isolation** only.

---

## 1. Current admin structure (summary)

| Layer | Role | Files |
|-------|------|--------|
| **Gate** | Who may open admin | `src/admin/canAccessAdminSafe.js`, `App.jsx` (`adminGateAllowed`, `sessionProfile.canAccessAdmin`) |
| **Shell** | Left nav + header + single `children` slot | `src/admin/AdminShell.jsx` (menu ids: `dashboard`, `member`, `referral`, `stage`, `trade`, `settlement`, `settings`, `ute`) |
| **Panel** | All functional admin UI in one large component | `App.jsx` → `function AdminReferralPanel` (~5k+ lines); shared **관리자 액션 로그** strip → `AdminActionLogStrip.jsx`; **`memberOps`** 세 경계 블록 → `MemberOpsGridPanel.jsx` / `MemberOpsMemoPanel.jsx` / `MemberOpsMediaPanel.jsx`; **`member`** → `MemberGridPanel.jsx` + `MemberHierarchyPanel.jsx` + `MemberDetailPanel.jsx` + `MemberAssignChildPanel.jsx` + `MemberActionRowPanel.jsx` + `MemberStatsPanel.jsx` + `MemberDirectDownlinePanel.jsx` + 나머지는 `App.jsx` |
| **Tabs** | Inner horizontal tabs (`adminViewTab`) | Same panel: `dashboard`, `member`, `memberOps`, `security`, `kyc`, `dispute`, `ops`, `audit`, `uteSurface` |
| **Shell → tab map** | Sidebar selection sets inner tab | `App.jsx` `adminShellLegacyTab` useMemo — constants in `src/admin/adminMenuIds.js` (`ADMIN_SHELL_TO_PANEL_TAB`) |
| **Top error boundary** | Catches uncaught errors in entire panel | `AdminShell` wraps `<main>` with `AdminErrorBoundary` |
| **Section boundaries** | Isolates heavy tabs so one throw does not blank the whole panel | `src/admin/AdminSectionBoundary.jsx` — **`audit`**, **`ops`**, **`kyc`**, **`dispute`**, **`member`** (2열 루트 + 인라인 액션; **`MemberGridPanel`** / **`MemberHierarchyPanel`** / **`MemberDetailPanel`** / **`MemberAssignChildPanel`** / **`MemberActionRowPanel`** / **`MemberStatsPanel`** / **`MemberDirectDownlinePanel`**), **`memberOps`**, **`security`** |
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
| **`member` tab** | Large tree, pagination, inline rates | **`AdminSectionBoundary`** (`admin-tab-member`); **`MemberGridPanel`**, **`MemberHierarchyPanel`**, **`MemberDetailPanel`**, **`MemberAssignChildPanel`**, **`MemberActionRowPanel`**, **`MemberStatsPanel`**, **`MemberDirectDownlinePanel`**; 본인 안내·단계 확인·등록된 하부 없음·hidden Field 등은 `App.jsx` |
| **`memberOps` tab** | Ops grid, memo, media monitor — JSX split by `security` and dispute blocks | Three **`AdminSectionBoundary`** wraps (`admin-tab-memberOps`, label **회원 운영**): **운영 그리드** (`MemberOpsGridPanel.jsx`), **관리 메모** (`MemberOpsMemoPanel.jsx`), **첨부/음성 모니터링** (`MemberOpsMediaPanel.jsx`) |
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

### Phase 6 (`dashboard` panel split)

- **`src/admin/panels/DashboardPanel.jsx`**: `dashboard` tab UI in **three** mount points (`segment`: `categories` \| `briefs` \| `storage`) to preserve DOM order (storage block remains after `audit` boundary). No new `AdminSectionBoundary`. See [ADMIN_PANEL_SPLIT_PLAN.md](./ADMIN_PANEL_SPLIT_PLAN.md) Phase 6.

### Phase 7 (`security` panel split)

- **`src/admin/panels/SecurityPanel.jsx`**: live **`security`** tab grid only; **`App.jsx`** keeps `AdminSectionBoundary` (`admin-tab-security`) outside. Passes `Field` / `Admin` / `DetailBox` as component props. See [ADMIN_PANEL_SPLIT_PLAN.md](./ADMIN_PANEL_SPLIT_PLAN.md) Phase 7.

### Phase 8 (`kyc` panel split)

- **`src/admin/panels/KycPanel.jsx`**: **`kyc`** tab inner card only; **`App.jsx`** keeps `AdminSectionBoundary` (`admin-tab-kyc`) outside. Passes `Box`, `formatNumber` (`number` helper), KYC state, and async helpers as props. See [ADMIN_PANEL_SPLIT_PLAN.md](./ADMIN_PANEL_SPLIT_PLAN.md) Phase 8.

### Phase 9 (`dispute` panel split)

- **`src/admin/panels/DisputePanel.jsx`**: **`dispute`** tab inner card only; **`App.jsx`** keeps `AdminSectionBoundary` (`admin-tab-dispute`) outside. Passes `Field`, `formatNumber` (`number`), escrow/dispute/timeline state and handlers as props. See [ADMIN_PANEL_SPLIT_PLAN.md](./ADMIN_PANEL_SPLIT_PLAN.md) Phase 9.

### Phase 10 (admin action log strip)

- **`src/admin/panels/AdminActionLogStrip.jsx`**: **`member` \| `memberOps`** shared action log card only; **`forwardRef`** preserves `adminActionLogSectionRef` for `moveToSection`. See [ADMIN_PANEL_SPLIT_PLAN.md](./ADMIN_PANEL_SPLIT_PLAN.md) Phase 10.

### Phase 11 (`memberOps` grid 1/3)

- **`src/admin/panels/MemberOpsGridPanel.jsx`**: first **`admin-tab-memberOps`** block (member list + ops detail); boundary stays in **`App.jsx`**. See [ADMIN_PANEL_SPLIT_PLAN.md](./ADMIN_PANEL_SPLIT_PLAN.md) Phase 11.

### Phase 12 (`memberOps` memo 2/3)

- **`src/admin/panels/MemberOpsMemoPanel.jsx`**: second **`admin-tab-memberOps`** block (**관리 메모**); boundary stays in **`App.jsx`**. See [ADMIN_PANEL_SPLIT_PLAN.md](./ADMIN_PANEL_SPLIT_PLAN.md) Phase 12.

### Phase 13 (`memberOps` media 3/3)

- **`src/admin/panels/MemberOpsMediaPanel.jsx`**: third **`admin-tab-memberOps`** block (**첨부/음성 메시지 모니터링**); boundary stays in **`App.jsx`**. Passes filters, friend list, counts, `filteredMediaEvents`, `appendAdminAction`, and **`isRiskyFileName`** as props. See [ADMIN_PANEL_SPLIT_PLAN.md](./ADMIN_PANEL_SPLIT_PLAN.md) Phase 13.

### Phase 14 (`member` left column — downline list)

- **`src/admin/panels/MemberGridPanel.jsx`**: first major block inside **`admin-tab-member`** — former left column (stage filters, debug panel, search/sort, paged member list); **`memberTreeSectionRef`** 2-column grid wrapper stays in **`App.jsx`**. See [ADMIN_PANEL_SPLIT_PLAN.md](./ADMIN_PANEL_SPLIT_PLAN.md) Phase 14.

### Phase 15 (`member` right column — selected user summary DetailBoxes)

- **`src/admin/panels/MemberDetailPanel.jsx`**: DetailBox grid under selected user, **after** **`MemberHierarchyPanel`** (phase 17; previously inline `hierarchyPathSectionRef`). Passes **`DetailBox`**, `monitorCurrentUser`, and stage/parent helpers as props. See [ADMIN_PANEL_SPLIT_PLAN.md](./ADMIN_PANEL_SPLIT_PLAN.md) Phase 15.

### Phase 16 (`member` — direct downline table)

- **`src/admin/panels/MemberDirectDownlinePanel.jsx`**: 직접 하부 테이블 + 배분 일괄 UI; **`forwardRef`** for `directDownlineListRef`; mount guard `selectedChildren.length > 0` stays in **`App.jsx`**. See [ADMIN_PANEL_SPLIT_PLAN.md](./ADMIN_PANEL_SPLIT_PLAN.md) Phase 16.

### Phase 17 (`member` — hierarchy / tree / stage / path)

- **`src/admin/panels/MemberHierarchyPanel.jsx`**: `hierarchyPathSectionRef` 블록(트리 검색·단계·관리자 지정·경로); **`forwardRef`**. See [ADMIN_PANEL_SPLIT_PLAN.md](./ADMIN_PANEL_SPLIT_PLAN.md) Phase 17.

### Phase 18 (`member` — four-tile summary stats)

- **`src/admin/panels/MemberStatsPanel.jsx`**: 4칸 요약(현재 단계·직계·전체 하위·관리자 지정). See [ADMIN_PANEL_SPLIT_PLAN.md](./ADMIN_PANEL_SPLIT_PLAN.md) Phase 18.

### Phase 19 (`member` — assign downline user row)

- **`src/admin/panels/MemberAssignChildPanel.jsx`**: 하위 유저 ID 입력 + 지정 버튼 한 행. See [ADMIN_PANEL_SPLIT_PLAN.md](./ADMIN_PANEL_SPLIT_PLAN.md) Phase 19.

### Phase 20 (`member` — 하부 보기 / 정보 수정 action row)

- **`src/admin/panels/MemberActionRowPanel.jsx`**: 두 버튼 행; `directDownlineListRef` 스크롤·`notify`는 props. See [ADMIN_PANEL_SPLIT_PLAN.md](./ADMIN_PANEL_SPLIT_PLAN.md) Phase 20.

---

## 8. Recommended next steps (not done here)

1. Continue **`ADMIN_PANEL_SPLIT_PLAN.md`** — **`member`** tab remaining inline (본인 안내, **단계 변경 확인** / 대기, **등록된 하부 없음** 문구, hidden **`Field`** 묶음 등) one PR at a time; keep boundaries; no mass helper moves.  
2. Optional **section boundary** for **`uteSurface`** or the action log strip if crashes appear (strip is now isolated as a component file but still **without** `AdminSectionBoundary`).  
3. Replace `false && isAdminTab` blocks with real removal behind a feature flag (separate PR).  
4. Extend `npm run lint` to more of `App.jsx` after extraction reduces file size.

---

## Related

- [ADMIN_RULES.md](./ADMIN_RULES.md)  
- [ADMIN_PANEL_SPLIT_PLAN.md](./ADMIN_PANEL_SPLIT_PLAN.md)  
- [MASTER_MANUAL.md](../MASTER_MANUAL.md)  
- [SECURITY_RULES.md](./SECURITY_RULES.md)
