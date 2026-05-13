# AdminReferralPanel split plan — 01 TetherGet-P2P

**Repository**: `01-TetherGet-P2P` only.  
**Status**: Phase 20 — **`member`** 오른쪽 **하부 N명 보기 / 정보 수정** 버튼 행만 `src/admin/panels/MemberActionRowPanel.jsx`; 본인 안내·단계 확인·“등록된 하부 없음”·hidden Field 등은 **`App.jsx`** 유지.

**Companion doc**: [ADMIN_STRUCTURE_AUDIT.md](./ADMIN_STRUCTURE_AUDIT.md) (structure, boundaries, changelog).

---

## 1. Hard constraints (carry into implementation PRs)

| Rule | Rationale |
|------|-----------|
| **No big-bang `App.jsx` refactor** | Regression risk; keep diffs reviewable. |
| **One logical section per PR** | Roll back or bisect failures easily. |
| **Keep existing `AdminSectionBoundary` wrappers** | Move JSX **inside** boundaries with boundaries, or re-wrap extracted root with the same `sectionId` / `sectionLabel`. |
| **Do not move shared helpers first** | Avoid circular imports and “utils ping-pong”; leave `Box`, `Field`, local closures, and `App.jsx`-scoped hooks in place until a later “admin UI kit” pass. |
| **No routing / shell contract change** | `AdminShell` + `adminViewTab` + `adminMenuIds.js` stay the source of truth. |
| **No `false && isAdminTab(...)` removal** in split PRs | Legacy blocks stay until a dedicated cleanup (feature flag or delete PR). |
| **No new DB/API wiring** in split PRs | File moves are structural only; props pass-through from `AdminReferralPanel` caller. |

---

## 2. `adminViewTab` inventory (inner horizontal tabs)

Declared in `src/admin/adminMenuIds.js` as `ADMIN_PANEL_TAB_IDS`. Sticky tab bar in `AdminReferralPanel` switches these values.

| `adminViewTab` | User-facing label (approx.) | Notes |
|----------------|----------------------------|--------|
| `dashboard` | 대시보드 | **`DashboardPanel.jsx`** (`categories` / `briefs` / `storage` segments); **no** `AdminSectionBoundary`. |
| `member` | 회원관리 | 2열 그리드 + detail; boundary `admin-tab-member` — **`MemberGridPanel`**, **`MemberHierarchyPanel`**, **`MemberDetailPanel`**, **`MemberAssignChildPanel`**, **`MemberActionRowPanel`**, **`MemberStatsPanel`**, **`MemberDirectDownlinePanel`**; 본인 안내·단계 확인 등은 `App.jsx`. |
| `memberOps` | 회원운영 | Split JSX; boundaries `admin-tab-memberOps` ×3 — **`MemberOpsGridPanel.jsx`** / **`MemberOpsMemoPanel.jsx`** / **`MemberOpsMediaPanel.jsx`** (`App.jsx`에 각 경계 유지). |
| `security` | 보안 | Live grid in **`SecurityPanel.jsx`**; boundary **`admin-tab-security`** / **보안 관리** remains in `App.jsx`. |
| `kyc` | KYC | **`KycPanel.jsx`**; boundary `admin-tab-kyc` in `App.jsx`. |
| `dispute` | 분쟁/정산 | **`DisputePanel.jsx`**; boundary `admin-tab-dispute` in `App.jsx`. |
| `ops` | 감사/복구 | Multiple stacked cards; single boundary `admin-tab-ops`. |
| `audit` | 플랫폼로그 | Sticky header + main block; boundary `admin-tab-audit`. |
| `uteSurface` | UTE·P2P | Metrics from `/api/admin/p2p/ute-surface`; **no** section boundary yet. |

---

## 3. `adminViewTab` ↔ `AdminSectionBoundary` mapping

| `adminViewTab` | `sectionId` | `sectionLabel` | Count / notes |
|----------------|-------------|----------------|---------------|
| `audit` | `admin-tab-audit` | 플랫폼 감사 로그 · P2P 주문 모니터 | 1 wrapper around main audit tab root. |
| `ops` | `admin-tab-ops` | 감사/복구 · 운영 설정 | 1 wrapper around entire `ops` tab root block. |
| `kyc` | `admin-tab-kyc` | KYC 관리 | 1 |
| `dispute` | `admin-tab-dispute` | 분쟁 관리 | 1 |
| `member` | `admin-tab-member` | 회원 관리 | 1 wrapper; **왼쪽** `MemberGridPanel`; **오른쪽** `MemberHierarchyPanel` + `MemberDetailPanel` + `MemberAssignChildPanel` + **`MemberActionRowPanel`** + `MemberStatsPanel` + `MemberDirectDownlinePanel` + 나머지 인라인은 `App.jsx`. |
| `memberOps` | `admin-tab-memberOps` | 회원 운영 | **3** wrappers (DOM order: **grid** → memo → media); inner **`MemberOpsGridPanel.jsx`** / **`MemberOpsMemoPanel.jsx`** / **`MemberOpsMediaPanel.jsx`**; same id/label for each. |
| `security` | `admin-tab-security` | 보안 관리 | 1 |
| `dashboard` | — | — | Not wrapped at tab level. |
| `uteSurface` | — | — | Not wrapped. |

**Outside boundaries (still in panel, outer `AdminErrorBoundary` only)**:

- Sticky tab bar and shell-driven tab sync.
- `dashboard` main blocks (**`DashboardPanel`**) and `uteSurface` (**`UteSurfacePanel`**); **`security`** live grid (**`SecurityPanel`**), **`kyc`** body (**`KycPanel`**), and **`dispute`** body (**`DisputePanel`**) with boundaries still in `App.jsx`.
- **`false && isAdminTab(...)`** legacy sections (still mounted).
- **관리자 액션 로그** strip (`member` **or** `memberOps` visibility) — **`AdminActionLogStrip.jsx`** from `App.jsx`; still **no** `AdminSectionBoundary` on this strip (unchanged).

---

## 4. Section map (logical units inside `AdminReferralPanel`)

Rough top-to-bottom order in JSX (approximate; exact line numbers drift):

| Order | Logical section | `adminViewTab` / visibility | Boundary today |
|-------|-------------------|---------------------------|----------------|
| A | Sticky inner tabs + shell sync | all | no |
| B | `audit` sticky summary strip | `audit` | no (separate strip above main audit card) |
| C | `ops` sticky summary strips | `ops` | no |
| D | **Audit** main panel | `audit` | yes |
| E | **Ops** main panel | `ops` | yes |
| F | **UTE·P2P** metrics | `uteSurface` | no |
| G | **Dashboard** cards / referral summary | `dashboard` | no (`DashboardPanel.jsx`) |
| H | **Member** left (`MemberGridPanel`) + right (`MemberHierarchyPanel` + **`MemberDetailPanel`** + **`MemberAssignChildPanel`** + **`MemberActionRowPanel`** + **`MemberStatsPanel`** + **`MemberDirectDownlinePanel`** + rest) | `member` | yes |
| I | **Member ops** grid (1/3) (`MemberOpsGridPanel.jsx`) | `memberOps` | yes |
| J | **Security** grid | `security` | yes (boundary in `App.jsx`; inner **`SecurityPanel`**) |
| K | Rate validation / tree example | `memberOps` + dead | partial / dead |
| L | **Member ops** memo (2/3) (`MemberOpsMemoPanel.jsx`) | `memberOps` | yes |
| M | Dead `security` center duplicate | `false &&` | no |
| N | Dead `memberOps` cards | `false &&` | no |
| O | **KYC** (`KycPanel.jsx`) | `kyc` | yes |
| P | **Dispute** (`DisputePanel.jsx`) | `dispute` | yes |
| Q | **Member ops** media (3/3) (`MemberOpsMediaPanel.jsx`) | `memberOps` | yes |
| R | **Admin action log** (`AdminActionLogStrip.jsx`) | `member` \|\| `memberOps` | no |
| S | Dead `memberOps` action row | `false &&` | no |

---

## 5. Common admin core (extraction **candidates**) vs TetherGet-only

### 5.1 Good cross-product core candidates (later package or `src/admin/core/`)

- **Shell + gate**: `AdminShell.jsx`, `canAccessAdminSafe.js`, `AdminPlaceholder.jsx`.
- **Error isolation**: `AdminSectionBoundary.jsx`, `AdminErrorBoundary.jsx`.
- **Identity / menu ids**: `adminMenuIds.js`.
- **Generic patterns**: “user list + detail pane”, “audit table + CSV export”, “settings form sections” — **after** 01-specific field names are parameterized.

### 5.2 TetherGet P2P–specific (should stay in 01 or get product-specific props)

- **P2P order monitor**, admin cancel, timeline hooks tied to `App.jsx` state.
- **Escrow / dispute** policy UI, PIN/OTP, `escrowPolicy` shapes.
- **Company KYC** approval center, document logs, `buyerKyc` flows.
- **UTE surface** payload + `p2pLifecycleMap` / `adminPlatformMock` demo fallbacks.
- **Referral / stage** engine wiring (`adminMemberModel.js`, VD counts, inline child rates).
- **Seller deposit notice** and other strings tied to this product’s ops story.

**Rule of thumb**: If a panel imports or assumes `apiClient` routes under `/api/admin/p2p/…` or TetherGet-specific DTOs, treat it as **01-only** until a stable DTO boundary exists.

---

## 6. Suggested `src/admin/panels/*.jsx` file names (candidates only)

No files created in phase 4 (planning only). Phase 5–6 add real panel files.

| Priority band | Suggested file | Scope | Rationale |
|---------------|----------------|-------|-----------|
| **Low** | `UteSurfacePanel.jsx` ✓ | `uteSurface` block | **Phase 5 done** — metrics grid; fetch stays in `App.jsx`. |
| **Low** | `DashboardPanel.jsx` ✓ | `dashboard` blocks | **Phase 6 done** — three `segment`s preserve DOM order; `number` / `MOCK_ADMIN_BRIEFS` passed as props. |
| **Medium** | `SecurityPanel.jsx` ✓ | `security` tab (live) | **Phase 7 done** — `AdminSectionBoundary` stays in `App.jsx`; `Field` / `Admin` / `DetailBox` passed as component props. |
| **Medium** | `KycPanel.jsx` ✓ | `kyc` tab | **Phase 8 done** — bounded inner card; `AdminSectionBoundary` in `App.jsx`. |
| **Medium** | `DisputePanel.jsx` ✓ | `dispute` tab | **Phase 9 done** — policy + cases + timeline; `AdminSectionBoundary` in `App.jsx`. |
| **Medium** | `AdminActionLogStrip.jsx` ✓ | action log strip | **Phase 10 done** — shared `member` \| `memberOps`; `ref` + `visible` + `adminActionLogs` props. |
| **Medium** | `MemberOpsGridPanel.jsx` ✓ | `memberOps` 운영 그리드 (1/3) | **Phase 11 done** — first `admin-tab-memberOps` wrap; `DetailBox` prop. |
| **Medium** | `MemberOpsMemoPanel.jsx` ✓ | `memberOps` 관리 메모 (2/3) | **Phase 12 done** — second `admin-tab-memberOps`; `Field` prop. |
| **Medium** | `MemberOpsMediaPanel.jsx` ✓ | `memberOps` 미디어 모니터링 (3/3) | **Phase 13 done** — third `admin-tab-memberOps`; `isRiskyFileName` 등 props. |
| **High** | `MemberGridPanel.jsx` ✓ | `member` 왼쪽 하부 목록 (1/n) | **Phase 14 done** — inside `admin-tab-member`; 2열 래퍼·`memberTreeSectionRef`는 `App.jsx`. |
| **High** | `MemberDetailPanel.jsx` ✓ | `member` 오른쪽 **요약** DetailBox 그리드 (2/n) | **Phase 15 done** — 계층·트리 블록 **다음** DOM 슬롯. |
| **High** | `MemberDirectDownlinePanel.jsx` ✓ | `member` 직계 하부 테이블 (`directDownlineListRef`) | **Phase 16 done** — `forwardRef`; `selectedChildren.length > 0` 조건은 `App.jsx`. |
| **High** | `MemberHierarchyPanel.jsx` ✓ | `member` 계층·트리·단계·경로 (`hierarchyPathSectionRef`) | **Phase 17 done** — `forwardRef`; `ADMIN_STAGE_OPTIONS` → `adminStageOptions` props. |
| **High** | `MemberStatsPanel.jsx` ✓ | `member` 4칸 요약 스탯 | **Phase 18 done** — 단계·직계·전체 하위·관리자 지정 표시; `getEffectiveStage` 등 props. |
| **High** | `MemberAssignChildPanel.jsx` ✓ | `member` 하위 유저 지정 행 | **Phase 19 done** — `downlineTargetUserId` + `assignDownlineUser` props. |
| **High** | `MemberActionRowPanel.jsx` ✓ | `member` 하부 보기 / 정보 수정 행 | **Phase 20 done** — `directDownlineListRef` + `notify` + `selectedChildren` props. |
| **High** | `AdminPanelMember.jsx` | `member` 탭 나머지 본문 (후보) | 본인 안내·단계 확인·등록된 하부 없음·hidden Field 등; 점진 분리. |
| **High** | `AdminPanelOps.jsx` | `ops` tab | Many API surfaces in one tab. |
| **High** | `AdminPanelAudit.jsx` | `audit` tab | Largest tables + order actions. |

**Import policy for early PRs**: New panel files should receive **explicit props** from `AdminReferralPanel` (or a thin `AdminReferralPanel.jsx` wrapper in `App.jsx` first). Avoid importing half of `App.jsx` into panels.

---

## 7. Split order (recommended): low coupling → high coupling

1. ~~**`uteSurface`**~~ — **Done (phase 5)** → `src/admin/panels/UteSurfacePanel.jsx`.  
2. ~~**`dashboard`**~~ — **Done (phase 6)** → `src/admin/panels/DashboardPanel.jsx` (`segment`: `categories` \| `briefs` \| `storage`).  
3. ~~**`security`**~~ — **Done (phase 7)** → `src/admin/panels/SecurityPanel.jsx` (boundary wrapper unchanged in `App.jsx`).  
4. ~~**`kyc`**~~ — **Done (phase 8)** → `src/admin/panels/KycPanel.jsx` (boundary wrapper unchanged in `App.jsx`).  
5. ~~**`dispute`**~~ — **Done (phase 9)** → `src/admin/panels/DisputePanel.jsx` (boundary wrapper unchanged in `App.jsx`).  
6. ~~**`admin action log`**~~ — **Done (phase 10)** → `src/admin/panels/AdminActionLogStrip.jsx` (no new section boundary).  
7. ~~**`memberOps`**~~ — **Done (phase 11–13)** → `MemberOpsGridPanel.jsx` + `MemberOpsMemoPanel.jsx` + `MemberOpsMediaPanel.jsx` (each `admin-tab-memberOps` wrap still in `App.jsx`).  
8. **`member`** — **7/n (phase 14–20)** → `MemberGridPanel` + `MemberHierarchyPanel` + `MemberDetailPanel` + `MemberAssignChildPanel` + `MemberActionRowPanel` + `MemberStatsPanel` + `MemberDirectDownlinePanel`; 나머지는 `App.jsx`.  
9. **`ops`** → **`audit`** — largest blocks last; most API and table risk.

Between steps: `npm run build`, `npm run lint`, manual smoke on tab bar + shell nav.

---

## 8. Risk bands (for testing focus)

| Band | Tabs / blocks |
|------|----------------|
| **Lower** | `uteSurface`, `dashboard`, bounded `security` / `kyc` / `dispute` after move |
| **Medium** | `memberOps` (**`MemberOpsGridPanel` / `MemberOpsMemoPanel` / `MemberOpsMediaPanel`**), admin action log (**`AdminActionLogStrip.jsx`**), `member` (**`MemberGridPanel`**, **`MemberHierarchyPanel`**, **`MemberDetailPanel`**, **`MemberAssignChildPanel`**, **`MemberActionRowPanel`**, **`MemberStatsPanel`**, **`MemberDirectDownlinePanel`**) |
| **Higher** | `member` (나머지 본문), `ops`, `audit`, all `false &&` mounted dead paths |

---

## Phase 5 — `uteSurface` extracted (implemented)

- **New**: `src/admin/panels/UteSurfacePanel.jsx` — same markup as former inline block; props `theme`, `uteSurfaceMetrics`, `visible` (`isAdminTab("uteSurface")`).
- **`App.jsx`**: import + single `<UteSurfacePanel … />`; `useState` / `useEffect` for `refreshAdminPlatformSurface` + `getUteSurfaceMetrics` unchanged; **no** new `AdminSectionBoundary` on this tab (unchanged from pre-split).

---

## Phase 6 — `dashboard` extracted (implemented)

- **New**: `src/admin/panels/DashboardPanel.jsx` — same markup as three former inline blocks; **`segment`** prop (`categories` \| `briefs` \| `storage`) because the **storage** card sits **below** the `audit` `AdminSectionBoundary` in the DOM, so one insertion point cannot preserve order.
- **`categories`**: returns **`null`** when `useExternalAdminNav` (same as legacy `{!useExternalAdminNav ? … : null}`).
- **`App.jsx`**: passes `formatNumber={number}` (module helper), `adminBriefs={MOCK_ADMIN_BRIEFS}`, computed referral metrics, `lang`, `notify`; **no** new `AdminSectionBoundary` on `dashboard`.

---

## Phase 7 — `security` (live tab) extracted (implemented)

- **New**: `src/admin/panels/SecurityPanel.jsx` — same markup as the former inner grid; **`AdminSectionBoundary`** (`admin-tab-security`, **보안 관리**) remains **in `App.jsx`** wrapping `<SecurityPanel … />` (same structure as before).
- **`App.jsx`**: passes `Field`, `Admin`, `DetailBox` as **component props** (still defined in `App.jsx`); state setters `setSecurityFilter`, `setBlockReason`, `setSelectedSecurityUserId` unchanged.
- **Dead** `false && isAdminTab("security")` block: **untouched** (still in `App.jsx`).
- **Lint**: `package.json` `eslint` list includes `UteSurfacePanel.jsx`, `DashboardPanel.jsx`, `SecurityPanel.jsx`, `KycPanel.jsx`.

---

## Phase 8 — `kyc` extracted (implemented)

- **New**: `src/admin/panels/KycPanel.jsx` — same markup as the former **`kyc`** tab inner card; **`AdminSectionBoundary`** (`admin-tab-kyc`, **KYC 관리**) remains **in `App.jsx`** wrapping `<KycPanel … />`.
- **`App.jsx`**: passes `Box` as a **component prop** (still defined in `App.jsx`); passes `formatNumber={number}` for KB display; all KYC state, setters, and async helpers (`loadKycDocuments`, `createKycViewRequest`, `viewKycDocument`, etc.) unchanged — **props only**.

---

## Phase 9 — `dispute` extracted (implemented)

- **New**: `src/admin/panels/DisputePanel.jsx` — same markup as the former **`dispute`** tab inner card; **`AdminSectionBoundary`** (`admin-tab-dispute`, **분쟁 관리**) remains **in `App.jsx`** wrapping `<DisputePanel … />`.
- **`App.jsx`**: passes **`Field`** as a **component prop**; `formatNumber={number}` for 금액 표시; `escrowPolicy` / PIN·OTP 입력 / `disputeCases` / 타임라인 필터·이벤트 / `approveDisputeCase`, `loadDisputeEvents`, `finalizeDisputeByMain`, `exportTimelineCsv`, `verifyTimelineIntegrity` 등 **기존과 동일하게 props만** 전달.
- **Lint**: `package.json` `eslint` list에 **`DisputePanel.jsx`** 추가.

---

## Phase 10 — admin action log strip extracted (implemented)

- **New**: `src/admin/panels/AdminActionLogStrip.jsx` — same markup as the former shared strip; **`forwardRef`** so `ref={adminActionLogSectionRef}` keeps `moveToSection` scroll targets unchanged.
- **`App.jsx`**: passes `theme`, `visible` (`isAdminTab("member") || isAdminTab("memberOps")`), `adminActionLogs`; **no** `AdminSectionBoundary` added; **`member` / `memberOps` tab bodies untouched**.
- **Lint**: `package.json` `eslint` list에 **`AdminActionLogStrip.jsx`** 추가.

---

## Phase 11 — `memberOps` first block (grid) extracted (implemented)

- **New**: `src/admin/panels/MemberOpsGridPanel.jsx` — same markup as the former **first** `admin-tab-memberOps` inner grid (대상 목록 + 상세/단계/판매자 공지); **`AdminSectionBoundary`** (첫 번째 **회원 운영**) remains **in `App.jsx`** wrapping `<MemberOpsGridPanel … />`.
- **`App.jsx`**: passes **`DetailBox`** as a **component prop**; `authUsers`, `selectedOpsUser`, `setSelectedOpsUserId`, `updateAuthRole`, `updateAuthProfile`, `sellerDepositNotice` / setter, `setAdminViewTab`, `appendAdminAction`, etc. — **props only**. Later phases split the second·third `admin-tab-memberOps` blocks into `MemberOpsMemoPanel` / `MemberOpsMediaPanel`.
- **Lint**: `package.json` `eslint` list에 **`MemberOpsGridPanel.jsx`** 추가.

---

## Phase 12 — `memberOps` second block (memo) extracted (implemented)

- **New**: `src/admin/panels/MemberOpsMemoPanel.jsx` — same markup as the former **second** `admin-tab-memberOps` inner block (**관리 메모**); **`AdminSectionBoundary`** (두 번째 **회원 운영**) remains **in `App.jsx`** wrapping `<MemberOpsMemoPanel … />`.
- **`App.jsx`**: passes **`Field`**; `adminMemo` / `setAdminMemo`; `visible` (`isAdminTab("memberOps")`). Third `admin-tab-memberOps` (media) split in **phase 13** → `MemberOpsMediaPanel`.
- **Lint**: `package.json` `eslint` list에 **`MemberOpsMemoPanel.jsx`** 추가.

---

## Phase 13 — `memberOps` third block (media monitoring) extracted (implemented)

- **New**: `src/admin/panels/MemberOpsMediaPanel.jsx` — same markup as the former **third** `admin-tab-memberOps` inner block (**첨부/음성 메시지 모니터링**); **`AdminSectionBoundary`** (세 번째 **회원 운영**) remains **in `App.jsx`** wrapping `<MemberOpsMediaPanel … />`.
- **`App.jsx`**: passes 필터·친구 목록·집계·이벤트 배열·`appendAdminAction`·**`isRiskyFileName`** 등 **props only**.
- **Lint**: `package.json` `eslint` list에 **`MemberOpsMediaPanel.jsx`** 추가.

---

## Phase 14 — `member` first column (downline list) extracted (implemented)

- **New**: `src/admin/panels/MemberGridPanel.jsx` — same markup as the former **left column** inside the `admin-tab-member` 2-column grid (**하부 목록**·단계 필터·디버그·검색·정렬·페이지네이션); **`AdminSectionBoundary`** and **`div ref={memberTreeSectionRef}`** 2열 래퍼 remain **in `App.jsx`**.
- **`App.jsx`**: passes theme, list/sort/filter state, `pagedVisibleUsers`, `selectUser`, **`getEffectiveStage`**, **`formatNumber={number}`**, and precomputed debug counts (`debugDirectDownlineCount`, `debugAllDownlineCount`, `superPageMemberCount`) — **props only** (엔진 헬퍼 호출은 호출부에서 그대로).
- **Lint**: `package.json` `eslint` list에 **`MemberGridPanel.jsx`** 추가.

---

## Phase 15 — `member` right column: selected-user summary (DetailBox grid) extracted (implemented)

- **New**: `src/admin/panels/MemberDetailPanel.jsx` — same markup as the former **DetailBox 요약 그리드** directly **below** the hierarchy / stage / path card (now **`MemberHierarchyPanel.jsx`**, phase 17).
- **`App.jsx`**: passes **`DetailBox`**, `monitorCurrentUser`, **`getEffectiveStage`**, **`getEffectiveParent`**, **`isAdminAssignedUser`**, **`formatNumber={number}`** — **props only**.
- **Lint**: `package.json` `eslint` list에 **`MemberDetailPanel.jsx`** 추가.

---

## Phase 16 — `member` direct downline table (`directDownlineListRef`) extracted (implemented)

- **New**: `src/admin/panels/MemberDirectDownlinePanel.jsx` — same markup as the former **`directDownlineListRef`** card (선택 하부·일괄 배분·행 목록·페이지); **`forwardRef`** so `ref={directDownlineListRef}` and **“하부 N명 보기”** `scrollIntoView` behavior unchanged. **`{selectedChildren.length > 0 && (…)}`** remains **in `App.jsx`**.
- **`App.jsx`**: passes 테이블·배분 관련 state/setters·`pagedSelectedChildren`·`drillDownToUser`·`toggleChildSelection`·`appliedRate`·`saveInlineChildRate` 등 **props only**.
- **Lint**: `package.json` `eslint` list에 **`MemberDirectDownlinePanel.jsx`** 추가.

---

## Phase 17 — `member` hierarchy / tree / stage / path (`hierarchyPathSectionRef`) extracted (implemented)

- **New**: `src/admin/panels/MemberHierarchyPanel.jsx` — same markup as the former **`hierarchyPathSectionRef`** root (하부 트리 검색·회원 단계 지정·관리자 지정 ON/OFF·경로 칩); **`forwardRef`** so `ref={hierarchyPathSectionRef}` and existing `scrollIntoView` call sites unchanged.
- **`App.jsx`**: passes `adminStageOptions={ADMIN_STAGE_OPTIONS}` and tree/stage handlers (**`jumpToTreeMember`**, **`moveToHierarchyDepth`**, **`requestApplyStage`**, **`saveSelectedStage`**, **`applyMonitorAdminAssignment`**, etc.) — **props only**.
- **Lint**: `package.json` `eslint` list에 **`MemberHierarchyPanel.jsx`** 추가.

---

## Phase 18 — `member` four-tile summary stats extracted (implemented)

- **New**: `src/admin/panels/MemberStatsPanel.jsx` — same markup as the former **`mt-2 grid … md:grid-cols-4`** row (현재 단계 · 직계 하부 · 전체 하위 · 관리자 지정 ON/OFF).
- **`App.jsx`**: passes `theme`, `monitorCurrentUser`, **`getEffectiveStage`**, counts, **`isAdminAssignedUser`** — **props only**.
- **Lint**: `package.json` `eslint` list에 **`MemberStatsPanel.jsx`** 추가.

---

## Phase 19 — `member` assign-downline user row extracted (implemented)

- **New**: `src/admin/panels/MemberAssignChildPanel.jsx` — same markup as the former **`mt-2 grid … md:grid-cols-[1fr_auto]`** row (하위 유저 ID 입력 · **하위 유저 지정** 버튼).
- **`App.jsx`**: passes `theme`, `downlineTargetUserId` / **`setDownlineTargetUserId`**, `isSelfTargetMember`, **`assignDownlineUser`** — **props only**.
- **Lint**: `package.json` `eslint` list에 **`MemberAssignChildPanel.jsx`** 추가.

---

## Phase 20 — `member` action row (downline scroll + profile stub) extracted (implemented)

- **New**: `src/admin/panels/MemberActionRowPanel.jsx` — same markup as the former **`mt-2 grid … md:grid-cols-2`** row (**하부 N명 보기** · **정보 수정**).
- **`App.jsx`**: passes `theme`, **`selectedChildren`**, **`notify`**, **`directDownlineListRef`**, `monitorCurrentUser` — **props only**.
- **Lint**: `package.json` `eslint` list에 **`MemberActionRowPanel.jsx`** 추가.

---

## 21. Ongoing constraints (after phase 5–20)

- **No big-bang `App.jsx` refactor** — one logical panel per PR; `uteSurface` / `dashboard` / `security` / `kyc` / `dispute` / admin action log strip / `memberOps` (all three bounded panels) / `member` (seven extracted slices) extractions set the pattern.  
- **No new routes** / `AdminShell` menu contract changes without product sign-off.  
- **No `false &&` removal** in panel extraction PRs (dedicated cleanup PR only).  
- **No mass helper relocation** in early extractions (props pass-through from `App.jsx`).

(Phase 4 originally said “no `App.jsx` moves”; phase 5–20 supersede that **only** for the agreed panel blocks.)

---

## Related

- [ADMIN_STRUCTURE_AUDIT.md](./ADMIN_STRUCTURE_AUDIT.md)  
- [ADMIN_RULES.md](./ADMIN_RULES.md)  
- [MASTER_MANUAL.md](../MASTER_MANUAL.md)
