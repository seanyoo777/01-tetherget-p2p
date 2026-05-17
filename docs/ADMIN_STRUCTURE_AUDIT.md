# Admin structure audit — 01 TetherGet-P2P (stabilization pass)

**Scope**: Repository **01-TetherGet-P2P** only. No TGX-CEX (2), MockInvest (4), UTE (7), 테더식당 (8), or other product code paths are merged here.

**Principles applied**: Existing features preserved; no full admin UI rewrite; mock-first; no new real trading / wallet / smart-contract integrations; no large refactors. This document records **structure** and **risk isolation** only.

---

## 1. Current admin structure (summary)

| Layer | Role | Files |
|-------|------|--------|
| **Gate** | Who may open admin | `src/admin/canAccessAdminSafe.js`, **`src/admin/resolveAdminUiAccess.js`** (`buildAdminGateUser`, `resolveAdminUiAccess` → `canEnterAdminUi` in `App.jsx`; nav/본문/openPage/restore/LS 동일; `admin-denied` 유지·LS 미저장) |
| **Shell** | Left nav + header + single `children` slot | `src/admin/AdminShell.jsx` (menu ids: `dashboard`, `member`, `referral`, `stage`, `trade`, `settlement`, `settings`, `ute`) |
| **Panel** | All functional admin UI in one large component | `App.jsx` → `function AdminReferralPanel` (~5k+ lines); shared **관리자 액션 로그** strip → `AdminActionLogStrip.jsx`; **`memberOps`** 세 경계 블록 → `MemberOpsGridPanel.jsx` / `MemberOpsMemoPanel.jsx` / `MemberOpsMediaPanel.jsx`; **`member`** → `MemberGridPanel.jsx` + `MemberHierarchyPanel.jsx` + `MemberDetailPanel.jsx` + `MemberSelfNoticePanel.jsx` + `MemberStageConfirmPanel.jsx` + `MemberPendingStagePanel.jsx` + `MemberAssignChildPanel.jsx` + `MemberActionRowPanel.jsx` + `MemberEmptyDownlinePanel.jsx` + `MemberStatsPanel.jsx` + `MemberDirectDownlinePanel.jsx` + `MemberHiddenFieldsPanel.jsx` + `MemberEmptySelectionPanel.jsx` + **잔여 인라인**(2열 `ref`·레이아웃·선택 제목·취소 클로저 등 — [ADMIN_PANEL_SPLIT_PLAN.md](./ADMIN_PANEL_SPLIT_PLAN.md) **Phase 44**·**Phase 45**) + 나머지는 `App.jsx`; **`ops`** → `OpsOverviewPanel.jsx` + `OpsMaintenancePanel.jsx` + `OpsMarketAuditPanel.jsx` + `OpsRiskCenterPanel.jsx` + `OpsExtendedMarketCatalogPanel.jsx` + `OpsSnapshotRollbackPanel.jsx` + `OpsReportHashPanel.jsx` + `OpsWebhookStatusPanel.jsx` + `OpsPermissionAuditPanel.jsx` (인라인 카드 없음; 경계·state는 `App.jsx`); **`audit`** → `AuditOverviewPanel.jsx` + `AuditP2pOrderMonitorPanel.jsx` + 공유 카드 루트는 `App.jsx` |
| **Tabs** | Inner horizontal tabs (`adminViewTab`) | Same panel: `dashboard`, `member`, `memberOps`, `security`, `kyc`, `dispute`, `ops`, `audit`, `uteSurface` |
| **Shell → tab map** | Sidebar selection sets inner tab | `App.jsx` `adminShellLegacyTab` useMemo — constants in `src/admin/adminMenuIds.js` (`ADMIN_SHELL_TO_PANEL_TAB`) |
| **Top error boundary** | Catches uncaught errors in entire panel | `AdminShell` wraps `<main>` with `AdminErrorBoundary` |
| **Section boundaries** | Isolates heavy tabs so one throw does not blank the whole panel | `src/admin/AdminSectionBoundary.jsx` — **`audit`** (내부 **`AuditOverviewPanel`** + **`AuditP2pOrderMonitorPanel`** + 공유 카드 루트), **`ops`** (내부 **`OpsOverviewPanel`** + **`OpsMaintenancePanel`** + **`OpsMarketAuditPanel`** + **`OpsRiskCenterPanel`** + **`OpsExtendedMarketCatalogPanel`** + **`OpsSnapshotRollbackPanel`** + **`OpsReportHashPanel`** + **`OpsWebhookStatusPanel`** + **`OpsPermissionAuditPanel`**; 인라인 카드 없음), **`kyc`**, **`dispute`**, **`member`** (2열 루트 + 인라인 액션; **`MemberGridPanel`** / **`MemberHierarchyPanel`** / **`MemberDetailPanel`** / **`MemberSelfNoticePanel`** / **`MemberStageConfirmPanel`** / **`MemberPendingStagePanel`** / **`MemberAssignChildPanel`** / **`MemberActionRowPanel`** / **`MemberEmptyDownlinePanel`** / **`MemberStatsPanel`** / **`MemberDirectDownlinePanel`** / **`MemberHiddenFieldsPanel`** / **`MemberEmptySelectionPanel`**), **`memberOps`**, **`security`** |
| **Placeholder** | Reserved for empty shell routes | `src/admin/AdminPlaceholder.jsx` (not wired to every menu item) |

**UTE read-only strip**: `uteSurface` tab + `/api/admin/p2p/ute-surface` (see `MASTER_MANUAL.md`). Not mixed with CEX/UTE product repos.

---

## 2. Sections with higher runtime error risk (watch list)

| Id / area | Why risk | Mitigation (this pass) |
|-----------|----------|-------------------------|
| **`audit` tab** | Large tables, `platformAuditLogs` + `adminP2pOrders` + timeline JSON, many optional fields | Wrapped in **`AdminSectionBoundary`** (`admin-tab-audit`); **`AuditOverviewPanel`**, **`AuditP2pOrderMonitorPanel`**, 공유 카드 루트는 `App.jsx` |
| **`ops` tab** | Platform settings, market catalog, webhooks, snapshots, emergency mode, audit CSV/PDF — many API calls and state | Wrapped in **`AdminSectionBoundary`** (`admin-tab-ops`); **`OpsOverviewPanel`**, **`OpsMaintenancePanel`**, **`OpsMarketAuditPanel`**, **`OpsRiskCenterPanel`**, **`OpsExtendedMarketCatalogPanel`**, **`OpsSnapshotRollbackPanel`**, **`OpsReportHashPanel`**, **`OpsWebhookStatusPanel`**, **`OpsPermissionAuditPanel`** (phase 27–35; 추가 인라인 카드 없음) |
| **`kyc` tab** | Document preview, view requests, multipart flows | Wrapped in **`AdminSectionBoundary`** (`admin-tab-kyc`, label **KYC 관리**) |
| **`dispute` tab** | PIN/OTP, policy rows, timeline chain | Wrapped in **`AdminSectionBoundary`** (`admin-tab-dispute`, label **분쟁 관리**) |
| **`member` tab** | Large tree, pagination, inline rates | **`AdminSectionBoundary`** (`admin-tab-member`); **`MemberGridPanel`**, **`MemberHierarchyPanel`**, **`MemberDetailPanel`**, **`MemberSelfNoticePanel`**, **`MemberStageConfirmPanel`**, **`MemberPendingStagePanel`**, **`MemberAssignChildPanel`**, **`MemberActionRowPanel`**, **`MemberEmptyDownlinePanel`**, **`MemberStatsPanel`**, **`MemberDirectDownlinePanel`**, **`MemberHiddenFieldsPanel`**, **`MemberEmptySelectionPanel`**; 2열 래퍼·선택 영역 제목·삼항 분기 등은 `App.jsx` |
| **`memberOps` tab** | Ops grid, memo, media monitor — JSX split by `security` and dispute blocks | Three **`AdminSectionBoundary`** wraps (`admin-tab-memberOps`, label **회원 운영**): **운영 그리드** (`MemberOpsGridPanel.jsx`), **관리 메모** (`MemberOpsMemoPanel.jsx`), **첨부/음성 모니터링** (`MemberOpsMediaPanel.jsx`) |
| **`security` tab** | Risk list + detail panel | Wrapped in **`AdminSectionBoundary`** (`admin-tab-security`, label **보안 관리**) |
| **`false && isAdminTab(...)` blocks** | Dead UI paths still mounted | Still **outside** tab section boundaries; low crash risk — **Phase 39** 인덱스 후 **3**개 루트 잔존(**L3·40**, **L5·41**, **L2·42**, **L7·43** 제거); [ADMIN_PANEL_SPLIT_PLAN.md](./ADMIN_PANEL_SPLIT_PLAN.md) Phase 39–43 |
| **`uteSurface` tab** | Fetches `ute-surface`; falls back to demo payload in client mock | Isolated fetch in `useEffect`; errors unlikely to break whole panel |

**Known code smells (not “fixed” in this pass per no large refactor)**:

- `AdminReferralPanel` monolith in `App.jsx` — hard to test and easy to regress.
- Some blocks use `false && isAdminTab(...)` — dead UI paths still mounted (**`App.jsx` 잔여 ~3개 루트**, Phase 40–43에서 L3/L5/L2/L7 제거; Phase 39 인덱스 — [ADMIN_PANEL_SPLIT_PLAN.md](./ADMIN_PANEL_SPLIT_PLAN.md) Phase 39–43).

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

### Phase P0 (admin gate single source — 2026-05)

- **`src/admin/resolveAdminUiAccess.js`**: `buildAdminGateUser`, `resolveAdminUiAccess`, `normalizeStoredMainScreen`, `readInitialMainScreen`, `readDebugAdminFlag`.
- **`App.jsx`**: `canEnterAdminUi` replaces `showAdminNav` / `adminGateAllowed` split; restore effect runs only when `loggedIn` + `linkedGoogle` and `activePage === "admin"` without gate (→ `trade`); `admin-denied` not persisted to LS; cold load never restores `admin-denied`.
- **Tests:** `src/admin/__tests__/resolveAdminUiAccess.test.js`.

### Phase P0b (admin render-loop stabilization — 2026-05)

- **`AdminReferralPanel` in `App.jsx`**: `setStageByUserId` / `setUserAdminAssignments` — 변경 없으면 `prev` 반환; `setSelectedAdminUser` — `adminMemberRowSyncEqual` + functional update; role sync — `setCurrentRole` functional, `currentRole` deps 제거.
- **QA:** `scripts/qa-admin-render-loop.mjs` (admin 탭·shell 탭·F5, Maximum update depth 감시).

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

### Phase 21 (`member` — empty direct-downline notice)

- **`src/admin/panels/MemberEmptyDownlinePanel.jsx`**: **등록된 하부가 없습니다** 빈 안내 박스; `selectedChildren.length === 0`는 `App.jsx`에서 유지. See [ADMIN_PANEL_SPLIT_PLAN.md](./ADMIN_PANEL_SPLIT_PLAN.md) Phase 21.

### Phase 22 (`member` — self-account notice)

- **`src/admin/panels/MemberSelfNoticePanel.jsx`**: 본인 계정 선택 시 안내 박스; `isSelfTargetMember`는 `App.jsx`에서 유지. See [ADMIN_PANEL_SPLIT_PLAN.md](./ADMIN_PANEL_SPLIT_PLAN.md) Phase 22.

### Phase 23 (`member` — stage-change confirm card)

- **`src/admin/panels/MemberStageConfirmPanel.jsx`**: **단계 변경 확인** 모달형 카드(취소/확인); `stageConfirmOpen && monitorCurrentUser`는 `App.jsx`에서 유지. See [ADMIN_PANEL_SPLIT_PLAN.md](./ADMIN_PANEL_SPLIT_PLAN.md) Phase 23.

### Phase 24 (`member` — pending stage line)

- **`src/admin/panels/MemberPendingStagePanel.jsx`**: **변경 대기:** 한 줄; `!!pendingStageValue`는 `App.jsx`에서 유지. See [ADMIN_PANEL_SPLIT_PLAN.md](./ADMIN_PANEL_SPLIT_PLAN.md) Phase 24.

### Phase 25 (`member` — hidden Field bundle)

- **`src/admin/panels/MemberHiddenFieldsPanel.jsx`**: `hidden` 래퍼 안 네 **`Field`** + 배분/회원 입력; **`Field`**는 `App.jsx`에서 props로 전달. See [ADMIN_PANEL_SPLIT_PLAN.md](./ADMIN_PANEL_SPLIT_PLAN.md) Phase 25.

### Phase 26 (`member` — smoke checklist)

- **문서만**: [ADMIN_PANEL_SPLIT_PLAN.md](./ADMIN_PANEL_SPLIT_PLAN.md) Phase 26 — `App.jsx` 9192–9370 정적 연결 점검(그리드 선택 → 상세·계층·단계 확인/대기·하부·숨김 필드·경계). 런타임 E2E는 미실행; 이슈 없음.

### Phase 27 (`ops` — first card: HQ settings)

- **`src/admin/panels/OpsOverviewPanel.jsx`**: **`admin-tab-ops`** 안 첫 **`mb-5 …`** 카드(**본사 운영 설정**); 경계는 `App.jsx`에 유지. See [ADMIN_PANEL_SPLIT_PLAN.md](./ADMIN_PANEL_SPLIT_PLAN.md) Phase 27.

### Phase 28 (`ops` — emergency maintenance card)

- **`src/admin/panels/OpsMaintenancePanel.jsx`**: **비상 점검 모드** 카드; `emergencyState`·`updateEmergencyMode` 등 props. See [ADMIN_PANEL_SPLIT_PLAN.md](./ADMIN_PANEL_SPLIT_PLAN.md) Phase 28.

### Phase 29 (`ops` — market catalog audit card)

- **`src/admin/panels/OpsMarketAuditPanel.jsx`**: **마켓 카탈로그 변경 이력** 카드(필터·로그·감사 알림); `loadMarketCatalogAudit` 등 props. See [ADMIN_PANEL_SPLIT_PLAN.md](./ADMIN_PANEL_SPLIT_PLAN.md) Phase 29.

### Phase 30 (`ops` — operations risk center card)

- **`src/admin/panels/OpsRiskCenterPanel.jsx`**: **운영 리스크 센터** 카드; `loadOpsRiskSummary`·`opsRiskSummary`·`runOpsAction` 등 props. See [ADMIN_PANEL_SPLIT_PLAN.md](./ADMIN_PANEL_SPLIT_PLAN.md) Phase 30.

### Phase 31 (`ops` — extended market catalog card)

- **`src/admin/panels/OpsExtendedMarketCatalogPanel.jsx`**: **확장형 마켓 카탈로그 (코인/NFT)** 카드; `loadMarketCatalog`·`filteredMarketAssets`·`marketCatalogDiff`·`saveMarketCatalog` 등 props. See [ADMIN_PANEL_SPLIT_PLAN.md](./ADMIN_PANEL_SPLIT_PLAN.md) Phase 31.

### Phase 32 (`ops` — snapshot rollback center card)

- **`src/admin/panels/OpsSnapshotRollbackPanel.jsx`**: **복구 스냅샷 · 롤백 센터** 카드; `loadOpsSnapshots`·`createOpsSnapshot`·`executeRollback`·`formatNumber` 등 props. See [ADMIN_PANEL_SPLIT_PLAN.md](./ADMIN_PANEL_SPLIT_PLAN.md) Phase 32.

### Phase 33 (`ops` — report hash server log card)

- **`src/admin/panels/OpsReportHashPanel.jsx`**: **리포트 해시 서버 기록** 카드; `loadRecentReportHashes`·`recentReportHashes`·`verifyReportHash`·해시 대조 state 등 props. See [ADMIN_PANEL_SPLIT_PLAN.md](./ADMIN_PANEL_SPLIT_PLAN.md) Phase 33.

### Phase 34 (`ops` — webhook delivery status card)

- **`src/admin/panels/OpsWebhookStatusPanel.jsx`**: **Webhook 전송 상태** 카드; `loadWebhookEvents`·`filteredWebhookEvents`·CHAIN ALERT UI 등 props. See [ADMIN_PANEL_SPLIT_PLAN.md](./ADMIN_PANEL_SPLIT_PLAN.md) Phase 34.

### Phase 35 (`ops` — permission audit report card)

- **`src/admin/panels/OpsPermissionAuditPanel.jsx`**: **권한 감사 리포트** 카드; `loadApprovalAuditReport`·`approvalAuditEvents`·CSV/PDF 등 props. See [ADMIN_PANEL_SPLIT_PLAN.md](./ADMIN_PANEL_SPLIT_PLAN.md) Phase 35.

### Phase 36 (`audit` — platform audit log first block)

- **`src/admin/panels/AuditOverviewPanel.jsx`**: **플랫폼 감사 로그** 첫 블록; `loadPlatformAuditLogs`·`platformAuditLogs` 등 props. See [ADMIN_PANEL_SPLIT_PLAN.md](./ADMIN_PANEL_SPLIT_PLAN.md) Phase 36.

### Phase 37 (`audit` — P2P order monitor block)

- **`src/admin/panels/AuditP2pOrderMonitorPanel.jsx`**: **P2P 주문 모니터**(`mt-8 border-t` 블록); `adminP2pOrders`·타임라인·취소 등 props. See [ADMIN_PANEL_SPLIT_PLAN.md](./ADMIN_PANEL_SPLIT_PLAN.md) Phase 37.

### Phase 38 (admin panels split — full smoke checklist)

- **문서·정적 점검만**: `src/admin/panels` **32**개 파일 ↔ `App.jsx` import·호출·`package.json` lint 목록 **일치**; `AdminSectionBoundary`·`audit` 카드 `hidden`·`ops` `visible`·`forwardRef` 3종(`MemberHierarchyPanel`, `MemberDirectDownlinePanel`, `AdminActionLogStrip`)·`false &&` 미제거 확인. `npm run build` / `npm run lint` 통과. See [ADMIN_PANEL_SPLIT_PLAN.md](./ADMIN_PANEL_SPLIT_PLAN.md) Phase 38.

### Phase 39 (`false && isAdminTab` — pre-delete audit)

- **문서만**: `App.jsx` 내 **`false && isAdminTab`** 기반 **7**개 루트 래퍼 목록·패널 중복 여부·`rateValidationSectionRef`/데드 `moveToSection` 경로·**삭제 가능 후보** vs **보류** 표. **코드 삭제 없음**. See [ADMIN_PANEL_SPLIT_PLAN.md](./ADMIN_PANEL_SPLIT_PLAN.md) Phase 39.

### Phase 40 (L3 dead `security` duplicate removed)

- **`App.jsx`**: Phase 39 **L3** — `false && isAdminTab("security")` 구 보안 센터 JSX **삭제**(항상 hidden이었음). 라이브 **`SecurityPanel`** + `admin-tab-security` 유지. `npm run smoke:admin` OK. See [ADMIN_PANEL_SPLIT_PLAN.md](./ADMIN_PANEL_SPLIT_PLAN.md) Phase 40.

### Phase 41 (L5 dead seller deposit notice duplicate removed)

- **`App.jsx`**: Phase 39 **L5** — `false && isAdminTab("memberOps")` **판매자 입금자명 확인 공지** 데드 카드 제거. 라이브 **`MemberOpsGridPanel`** 유지. `npm run smoke:admin` OK. See [ADMIN_PANEL_SPLIT_PLAN.md](./ADMIN_PANEL_SPLIT_PLAN.md) Phase 41.

### Phase 42 (L2 dead tree example demo removed)

- **`App.jsx`**: Phase 39 **L2** — **하부트리 예시** 데모 `false &&` 블록 제거. 라이브 경로·`ref` 무연결. `npm run smoke:admin` OK. See [ADMIN_PANEL_SPLIT_PLAN.md](./ADMIN_PANEL_SPLIT_PLAN.md) Phase 42.

### Phase 43 (L7 dead permission line removed)

- **`App.jsx`**: Phase 39 **L7** — **권한 레벨** 한 줄 `false &&` 블록 제거. 라이브 경로·`ref` 무연결. `npm run smoke:admin` OK. See [ADMIN_PANEL_SPLIT_PLAN.md](./ADMIN_PANEL_SPLIT_PLAN.md) Phase 43.

### Phase 44 (`member` — remaining inline JSX inventory, docs only)

- **문서만**: `admin-tab-member` 구간 잔여 인라인 JSX **5**개 구조 단위(**M0**–**M4**) + **1**곳 경미 handler(**H1**) 인벤토리·분류. **`App.jsx` JSX 이동·삭제·신규 패널·UI 변경 없음**. See [ADMIN_PANEL_SPLIT_PLAN.md](./ADMIN_PANEL_SPLIT_PLAN.md) Phase 44.

### Phase 45 (`member` — M4 empty selection notice extracted)

- **`src/admin/panels/MemberEmptySelectionPanel.jsx`**: 미선택 시 안내 문구 한 블록(Phase 44 **M4**). `App.jsx` 삼항 `else`만 치환; M0/M1/M3·`ref`·handler 비변경. See [ADMIN_PANEL_SPLIT_PLAN.md](./ADMIN_PANEL_SPLIT_PLAN.md) Phase 45.

---

## 8. Recommended next steps (not done here)

1. **`audit`** 탭: 공유 카드 루트·`space-y-4` 등 **얇은 래퍼만** 남음; 필요 시 **`AdminPanelAudit.jsx`** 통합은 선택. Phase 38 스모크·Phase 39 인덱스·**Phase 40–43** 데드 제거 완료. **`member`**: **Phase 44** 인벤토리·**Phase 45** **M4**(`MemberEmptySelectionPanel`) 분리 완료; 잔여 인라인은 **M0/M1/M2/M3**·**H1** 등(계획서 Phase 44). 다음으로 **`false &&` 보류(L1/L4/L6)** 전용 PR, 또는 **M2+M3** 래퍼·**H1** 등 별도 소규모 PR. boundaries 유지.  
2. Optional **section boundary** for **`uteSurface`** or the action log strip if crashes appear (strip is now isolated as a component file but still **without** `AdminSectionBoundary`).  
3. Replace `false && isAdminTab` blocks with real removal behind a feature flag (separate PR).  
4. Extend `npm run lint` to more of `App.jsx` after extraction reduces file size.

---

## Related

- [ADMIN_RULES.md](./ADMIN_RULES.md)  
- [ADMIN_PANEL_SPLIT_PLAN.md](./ADMIN_PANEL_SPLIT_PLAN.md)  
- [MASTER_MANUAL.md](../MASTER_MANUAL.md)  
- [SECURITY_RULES.md](./SECURITY_RULES.md)
