# AdminReferralPanel split plan — 01 TetherGet-P2P

**Repository**: `01-TetherGet-P2P` only.  
**Status**: Phase 45 — **`member` M4 미선택 안내** → **`MemberEmptySelectionPanel.jsx`** (얇은 분리만; M0/M1/M3·handler·`ref` 비변경).

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
| `member` | 회원관리 | 2열 그리드 + detail; boundary `admin-tab-member` — **`MemberGridPanel`**, **`MemberHierarchyPanel`**, **`MemberDetailPanel`**, **`MemberSelfNoticePanel`**, **`MemberStageConfirmPanel`**, **`MemberPendingStagePanel`**, **`MemberAssignChildPanel`**, **`MemberActionRowPanel`**, **`MemberEmptyDownlinePanel`**, **`MemberStatsPanel`**, **`MemberDirectDownlinePanel`**, **`MemberHiddenFieldsPanel`**, **`MemberEmptySelectionPanel`**; **잔여 인라인**(2열 `ref` 루트·오른쪽 레이아웃·선택 영역 제목·`MemberStageConfirmPanel` 취소 클로저 등)은 [Phase 44](#phase-44--member-tab-inline-jsx-inventory-docs-only) 인벤토리 + [Phase 45](#phase-45--member-m4-empty-selection-panel); 2열 래퍼·`monitorCurrentUser ? … : …` 분기는 `App.jsx`. |
| `memberOps` | 회원운영 | Split JSX; boundaries `admin-tab-memberOps` ×3 — **`MemberOpsGridPanel.jsx`** / **`MemberOpsMemoPanel.jsx`** / **`MemberOpsMediaPanel.jsx`** (`App.jsx`에 각 경계 유지). |
| `security` | 보안 | Live grid in **`SecurityPanel.jsx`**; boundary **`admin-tab-security`** / **보안 관리** remains in `App.jsx`. |
| `kyc` | KYC | **`KycPanel.jsx`**; boundary `admin-tab-kyc` in `App.jsx`. |
| `dispute` | 분쟁/정산 | **`DisputePanel.jsx`**; boundary `admin-tab-dispute` in `App.jsx`. |
| `ops` | 감사/복구 | Stacked cards; boundary `admin-tab-ops` — **`OpsOverviewPanel`**, **`OpsMaintenancePanel`**, **`OpsMarketAuditPanel`**, **`OpsRiskCenterPanel`**, **`OpsExtendedMarketCatalogPanel`**, **`OpsSnapshotRollbackPanel`**, **`OpsReportHashPanel`**, **`OpsWebhookStatusPanel`**, **`OpsPermissionAuditPanel`** (phase 27–35); 추가 인라인 카드 없음. |
| `audit` | 플랫폼로그 | Sticky header + main block; boundary `admin-tab-audit` — **`AuditOverviewPanel`** + **`AuditP2pOrderMonitorPanel`**; 공유 카드 루트는 `App.jsx`. |
| `uteSurface` | UTE·P2P | Metrics from `/api/admin/p2p/ute-surface`; **no** section boundary yet. |

---

## 3. `adminViewTab` ↔ `AdminSectionBoundary` mapping

| `adminViewTab` | `sectionId` | `sectionLabel` | Count / notes |
|----------------|-------------|----------------|---------------|
| `audit` | `admin-tab-audit` | 플랫폼 감사 로그 · P2P 주문 모니터 | 1 wrapper; inner **`AuditOverviewPanel`** + **`AuditP2pOrderMonitorPanel`**; 공유 카드 루트 `div`는 `App.jsx`. |
| `ops` | `admin-tab-ops` | 감사/복구 · 운영 설정 | 1 wrapper; inner **`OpsOverviewPanel`** + **`OpsMaintenancePanel`** + **`OpsMarketAuditPanel`** + **`OpsRiskCenterPanel`** + **`OpsExtendedMarketCatalogPanel`** + **`OpsSnapshotRollbackPanel`** + **`OpsReportHashPanel`** + **`OpsWebhookStatusPanel`** + **`OpsPermissionAuditPanel`** (phase 27–35); 인라인 카드 없음. |
| `kyc` | `admin-tab-kyc` | KYC 관리 | 1 |
| `dispute` | `admin-tab-dispute` | 분쟁 관리 | 1 |
| `member` | `admin-tab-member` | 회원 관리 | 1 wrapper; **왼쪽** `MemberGridPanel`; **오른쪽** `MemberHierarchyPanel` + `MemberDetailPanel` + **`MemberSelfNoticePanel`** + **`MemberStageConfirmPanel`** + **`MemberPendingStagePanel`** + `MemberAssignChildPanel` + **`MemberActionRowPanel`** + **`MemberEmptyDownlinePanel`** + `MemberStatsPanel` + `MemberDirectDownlinePanel` + **`MemberHiddenFieldsPanel`** + 나머지 인라인은 `App.jsx`. |
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
| D | **Audit** main panel (`AuditOverviewPanel` + `AuditP2pOrderMonitorPanel` + shared card root) | `audit` | yes |
| E | **Ops** main panel (`OpsOverviewPanel` + `OpsMaintenancePanel` + `OpsMarketAuditPanel` + `OpsRiskCenterPanel` + `OpsExtendedMarketCatalogPanel` + `OpsSnapshotRollbackPanel` + `OpsReportHashPanel` + `OpsWebhookStatusPanel` + `OpsPermissionAuditPanel`) | `ops` | yes |
| F | **UTE·P2P** metrics | `uteSurface` | no |
| G | **Dashboard** cards / referral summary | `dashboard` | no (`DashboardPanel.jsx`) |
| H | **Member** left (`MemberGridPanel`) + right (`MemberHierarchyPanel` + **`MemberDetailPanel`** + **`MemberSelfNoticePanel`** + **`MemberStageConfirmPanel`** + **`MemberPendingStagePanel`** + **`MemberAssignChildPanel`** + **`MemberActionRowPanel`** + **`MemberEmptyDownlinePanel`** + **`MemberStatsPanel`** + **`MemberDirectDownlinePanel`** + **`MemberHiddenFieldsPanel`** + rest) | `member` | yes |
| I | **Member ops** grid (1/3) (`MemberOpsGridPanel.jsx`) | `memberOps` | yes |
| J | **Security** grid | `security` | yes (boundary in `App.jsx`; inner **`SecurityPanel`**) |
| K | Rate validation (dead) / ~~tree example~~ | `memberOps` + dead | **L2** tree demo **removed phase 42**; L1 rate box still dead |
| L | **Member ops** memo (2/3) (`MemberOpsMemoPanel.jsx`) | `memberOps` | yes |
| M | ~~Dead `security` center duplicate~~ | ~~`false &&`~~ | **Removed phase 40** — live path: `SecurityPanel` under `admin-tab-security` |
| N | Dead `memberOps` cards (`false &&`) | `false &&` | partial — **L5** 판매자 공지 중복 **removed phase 41**; **L4** 실계정 권한 등 잔여 |
| O | **KYC** (`KycPanel.jsx`) | `kyc` | yes |
| P | **Dispute** (`DisputePanel.jsx`) | `dispute` | yes |
| Q | **Member ops** media (3/3) (`MemberOpsMediaPanel.jsx`) | `memberOps` | yes |
| R | **Admin action log** (`AdminActionLogStrip.jsx`) | `member` \|\| `memberOps` | no |
| S | Dead `memberOps` action row + ~~L7 권한 한 줄~~ | `false &&` | **L7 removed phase 43**; L6 3-button dead grid remains |

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
| **High** | `MemberEmptyDownlinePanel.jsx` ✓ | `member` 직계 하부 없음 안내 | **Phase 21 done** — `selectedChildren.length === 0` 조건은 `App.jsx`; `theme` props only. |
| **High** | `MemberSelfNoticePanel.jsx` ✓ | `member` 본인 계정 선택 안내 | **Phase 22 done** — `isSelfTargetMember` 조건은 `App.jsx`; `theme` props only. |
| **High** | `MemberStageConfirmPanel.jsx` ✓ | `member` 단계 변경 확인 카드 | **Phase 23 done** — `stageConfirmOpen && monitorCurrentUser` 조건은 `App.jsx`; `adminStageDisplayName`·`onCancel`·`onConfirm` 등 props. |
| **High** | `MemberPendingStagePanel.jsx` ✓ | `member` 단계 변경 대기 한 줄 | **Phase 24 done** — `!!pendingStageValue` 조건은 `App.jsx`; `pendingStageFrom`·`getEffectiveStage` 등 props. |
| **High** | `MemberHiddenFieldsPanel.jsx` ✓ | `member` 숨김 Field 4개 묶음 | **Phase 25 done** — `Field` + `adminMember` / `adminParent` / rate state·setter props (`App.jsx` `Field` 정의 유지). |
| **High** | `OpsOverviewPanel.jsx` ✓ | `ops` 본사 운영 설정 (첫 카드) | **Phase 27 done** — `visible={isAdminTab("ops")}`; `loadPlatformSettings` / `savePlatformSettings` 등 props; 경계는 `App.jsx`. |
| **High** | `OpsMaintenancePanel.jsx` ✓ | `ops` 비상 점검 모드 카드 | **Phase 28 done** — `emergencyState`·`updateEmergencyMode`·`loadEmergencyState` 등 props; 경계는 `App.jsx`. |
| **High** | `OpsMarketAuditPanel.jsx` ✓ | `ops` 마켓 카탈로그 변경 이력 카드 | **Phase 29 done** — `loadMarketCatalogAudit`·`marketCatalogLogs`·필터 state 등 props; 경계는 `App.jsx`. |
| **High** | `OpsRiskCenterPanel.jsx` ✓ | `ops` 운영 리스크 센터 카드 | **Phase 30 done** — `loadOpsRiskSummary`·`opsRiskSummary`·`runOpsAction` 등 props; 경계는 `App.jsx`. |
| **High** | `OpsExtendedMarketCatalogPanel.jsx` ✓ | `ops` 확장형 마켓 카탈로그 카드 | **Phase 31 done** — `loadMarketCatalog`·`filteredMarketAssets`·`marketCatalogDiff`·저장 확인 등 props; 경계는 `App.jsx`. |
| **High** | `OpsSnapshotRollbackPanel.jsx` ✓ | `ops` 복구 스냅샷 · 롤백 센터 카드 | **Phase 32 done** — `loadOpsSnapshots`·`createOpsSnapshot`·`executeRollback`·`formatNumber` 등 props; 경계는 `App.jsx`. |
| **High** | `OpsReportHashPanel.jsx` ✓ | `ops` 리포트 해시 서버 기록 카드 | **Phase 33 done** — `loadRecentReportHashes`·`recentReportHashes`·`verifyReportHash`·해시 대조 UI 등 props; 경계는 `App.jsx`. |
| **High** | `OpsWebhookStatusPanel.jsx` ✓ | `ops` Webhook 전송 상태 카드 | **Phase 34 done** — `loadWebhookEvents`·`filteredWebhookEvents`·CHAIN ALERT UI 등 props; 경계는 `App.jsx`. |
| **High** | `OpsPermissionAuditPanel.jsx` ✓ | `ops` 권한 감사 리포트 카드 | **Phase 35 done** — `loadApprovalAuditReport`·`approvalAuditEvents`·CSV/PDF 등 props; 경계는 `App.jsx`. |
| **High** | `AuditOverviewPanel.jsx` ✓ | `audit` 플랫폼 감사 로그(첫 블록) | **Phase 36 done** — `loadPlatformAuditLogs`·`platformAuditLogs`·새로고침(연동 `loadAdminP2pOrders`) 등 props; 경계·공유 카드 루트는 `App.jsx`. |
| **High** | `AuditP2pOrderMonitorPanel.jsx` ✓ | `audit` P2P 주문 모니터(`mt-8 border-t` 블록) | **Phase 37 done** — `adminP2pOrders`·`toggleAdminP2pTimeline`·`adminCancelP2pOrder` 등 props; 경계·공유 카드 루트는 `App.jsx`. |
| **High** | `AdminPanelMember.jsx` | `member` 탭 통합 후보 (선택) | 오른쪽 주요 slice는 phase 14–25 완료; 2열 shell 등만 `App.jsx`면 통합 파일은 선택. |
| **High** | `AdminPanelOps.jsx` | `ops` 탭 통합 후보 (선택) | 카드 phase 27–35 분리 완료; 경계·state는 `App.jsx`면 통합 파일은 선택. |
| **High** | `AdminPanelAudit.jsx` | `audit` 탭 통합 후보 (선택) | 공유 카드 루트·props만 `App.jsx`면 통합 파일은 선택. |

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
8. **`member`** — **12/n (phase 14–25)** → `MemberGridPanel` + `MemberHierarchyPanel` + `MemberDetailPanel` + `MemberSelfNoticePanel` + `MemberStageConfirmPanel` + `MemberPendingStagePanel` + `MemberAssignChildPanel` + `MemberActionRowPanel` + `MemberEmptyDownlinePanel` + `MemberStatsPanel` + `MemberDirectDownlinePanel` + `MemberHiddenFieldsPanel`; 나머지는 `App.jsx`.  
9. **`ops`** — **9/n (phase 27–35)** → **`OpsOverviewPanel`** + **`OpsMaintenancePanel`** + **`OpsMarketAuditPanel`** + **`OpsRiskCenterPanel`** + **`OpsExtendedMarketCatalogPanel`** + **`OpsSnapshotRollbackPanel`** + **`OpsReportHashPanel`** + **`OpsWebhookStatusPanel`** + **`OpsPermissionAuditPanel`** (`App.jsx`에 인라인 카드 없음).  
10. **`audit`** — **2/n (phase 36–37)** → **`AuditOverviewPanel`** + **`AuditP2pOrderMonitorPanel`**; 공유 카드 루트는 `App.jsx`.  

Between steps: `npm run build`, `npm run lint`, manual smoke on tab bar + shell nav. **Phase 38**: repo-wide static smoke (Phase 38 시점 **32**개 패널 ↔ `App.jsx` ↔ lint 목록). **Phase 39**: `false && isAdminTab` 레거시 루트 목록·후보 분류(삭제 미실행). **Phase 40–42**: L3/L5/L2 데드만 각각 제거. **Phase 43**: L7 권한 한 줄 데드만 제거. **Phase 44**: `member` 탭 잔여 인라인 인벤토리(문서만). **Phase 45**: M4 미선택 안내 → `MemberEmptySelectionPanel.jsx` (**33**번째 패널 파일). Phase 39–45 sections below.

---

## 8. Risk bands (for testing focus)

| Band | Tabs / blocks |
|------|----------------|
| **Lower** | `uteSurface`, `dashboard`, bounded `security` / `kyc` / `dispute` after move |
| **Medium** | `memberOps` (**`MemberOpsGridPanel` / `MemberOpsMemoPanel` / `MemberOpsMediaPanel`**), admin action log (**`AdminActionLogStrip.jsx`**), `member` (**`MemberGridPanel`**, **`MemberHierarchyPanel`**, **`MemberDetailPanel`**, **`MemberSelfNoticePanel`**, **`MemberStageConfirmPanel`**, **`MemberPendingStagePanel`**, **`MemberAssignChildPanel`**, **`MemberActionRowPanel`**, **`MemberEmptyDownlinePanel`**, **`MemberStatsPanel`**, **`MemberDirectDownlinePanel`**, **`MemberHiddenFieldsPanel`**), `ops` (**`OpsOverviewPanel`**, **`OpsMaintenancePanel`**, **`OpsMarketAuditPanel`**, **`OpsRiskCenterPanel`**, **`OpsExtendedMarketCatalogPanel`**, **`OpsSnapshotRollbackPanel`**, **`OpsReportHashPanel`**, **`OpsWebhookStatusPanel`**, **`OpsPermissionAuditPanel`**), `audit` (**`AuditOverviewPanel`**, **`AuditP2pOrderMonitorPanel`**) |
| **Higher** | `member` (2열 래퍼·선택 안내 등 소량 `App.jsx`), `ops` (탭 경계·상태·props 배선만 `App.jsx`), `audit` (공유 카드 루트·`space-y-4` 래퍼 등만 `App.jsx`), all `false &&` mounted dead paths |

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
- **Dead** `false && isAdminTab("security")` duplicate block: **removed in Phase 40** (was always hidden; functionality covered by **`SecurityPanel.jsx`** on the live **`security`** tab).
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

## Phase 21 — `member` empty direct-downline notice extracted (implemented)

- **New**: `src/admin/panels/MemberEmptyDownlinePanel.jsx` — same markup as the former **`mt-1 rounded-xl border …`** block (**등록된 하부가 없습니다.**).
- **`App.jsx`**: **`{selectedChildren.length === 0 && <MemberEmptyDownlinePanel … />}`** — 조건은 그대로; **`theme`** — **props only**.
- **Lint**: `package.json` `eslint` list에 **`MemberEmptyDownlinePanel.jsx`** 추가.

---

## Phase 22 — `member` self-account notice extracted (implemented)

- **New**: `src/admin/panels/MemberSelfNoticePanel.jsx` — same markup as the former **`mt-1 rounded-xl border …`** block (**본인 계정** 안내 문구).
- **`App.jsx`**: **`{isSelfTargetMember && <MemberSelfNoticePanel … />}`** — 조건은 그대로; **`theme`** — **props only**.
- **Lint**: `package.json` `eslint` list에 **`MemberSelfNoticePanel.jsx`** 추가.

---

## Phase 23 — `member` stage-change confirm card extracted (implemented)

- **New**: `src/admin/panels/MemberStageConfirmPanel.jsx` — same markup as the former **`mt-2 rounded-2xl border border-amber-500/40 …`** block (**단계 변경 확인** + 취소/확인).
- **`App.jsx`**: **`{stageConfirmOpen && monitorCurrentUser ? <MemberStageConfirmPanel … /> : null}`** — 조건은 그대로; **`theme`**, **`monitorCurrentUser`**, **`stageConfirmFromStage`**, **`stageConfirmTarget`**, **`adminStageDisplayName`**, **`onCancel`**, **`onConfirm`** — **props only** (`onCancel` / `onConfirm`는 기존 setter·`confirmApplySelectedStage`와 동일 동작).
- **Lint**: `package.json` `eslint` list에 **`MemberStageConfirmPanel.jsx`** 추가.

---

## Phase 24 — `member` pending stage line extracted (implemented)

- **New**: `src/admin/panels/MemberPendingStagePanel.jsx` — same markup as the former **`mt-1 rounded-xl border border-amber-500/40 …`** line (**변경 대기:** … **`->`** …).
- **`App.jsx`**: **`{!!pendingStageValue && <MemberPendingStagePanel … />}`** — 조건은 그대로; **`pendingStageFrom`**, **`pendingStageValue`**, **`monitorCurrentUser`**, **`getEffectiveStage`** — **props only**.
- **Lint**: `package.json` `eslint` list에 **`MemberPendingStagePanel.jsx`** 추가.

---

## Phase 25 — `member` hidden Field bundle extracted (implemented)

- **New**: `src/admin/panels/MemberHiddenFieldsPanel.jsx` — same markup as the former **`div.hidden`** 안의 네 **`Field`** + **`input`** (대상 회원 / 상위 / 배분율 ×2).
- **`App.jsx`**: **`<MemberHiddenFieldsPanel Field={Field} theme={theme} … />`** — **`Field`** 및 `adminMember` / `adminParent` / `adminReceivedRate` / `adminRate` state·setter는 **props only** (`Field` 컴포넌트 정의는 `App.jsx` 유지).
- **Lint**: `package.json` `eslint` list에 **`MemberHiddenFieldsPanel.jsx`** 추가.

---

## Phase 26 — `member` tab smoke checklist (static verification, no code change)

**When**: After phase 14–25 panel extractions. **How**: `App.jsx` `AdminReferralPanel` **9192–9370** 줄대 `props`·조건부·경계 JSX 대조 (브라우저 E2E는 본 단계에서 미실행).

| # | Check | Result |
|---|--------|--------|
| 1 | 회원 목록 선택: `MemberGridPanel` → `selectUser` / `selectedAdminUser` / `pagedVisibleUsers` 등 전달 | **OK** (그리드에 동일 props) |
| 2 | 선택 후 우측: `monitorCurrentUser` 분기 안에 `MemberDetailPanel` + 상위 패널 DOM 순서 유지 | **OK** |
| 3 | `MemberHierarchyPanel`: 검색·경로·단계 관련 props (`setAdminUserSearch`, `jumpToTreeMember`, `monitorPath`, `moveToHierarchyDepth` 등) | **OK** |
| 4 | `MemberStageConfirmPanel`: `stageConfirmOpen && monitorCurrentUser`; `onCancel` 3-state 리셋; `onConfirm={confirmApplySelectedStage}` | **OK** |
| 5 | `MemberPendingStagePanel`: `!!pendingStageValue &&`; `pendingStageFrom` / `getEffectiveStage` / `monitorCurrentUser` | **OK** |
| 6 | `MemberAssignChildPanel`: `downlineTargetUserId`, `assignDownlineUser`, `isSelfTargetMember` | **OK** |
| 7 | `MemberActionRowPanel`: `selectedChildren`, `notify`, `directDownlineListRef`, `monitorCurrentUser` | **OK** |
| 8 | `MemberDirectDownlinePanel`: `selectedChildren.length > 0` 가드 유지; 페이지·선택·저장 관련 props 일괄 전달 | **OK** |
| 9 | `MemberHiddenFieldsPanel`: `adminMember` 등 state·setter + `Field={Field}`; `selectUser` 경로에서 `setAdminMember` 동기화(6139대) 기존 유지 | **OK** |
| 10 | `AdminSectionBoundary` `admin-tab-member` / **회원 관리**가 2열 그리드 루트를 그대로 감쌈 | **OK** |

**Issues found**: 없음 (런타임 스모크는 운영자 수동 권장).

---

## Phase 27 — `ops` first card (platform HQ settings) extracted (implemented)

- **New**: `src/admin/panels/OpsOverviewPanel.jsx` — same markup as the former first **`mb-5 rounded-3xl …`** card under **`admin-tab-ops`** (**본사 운영 설정** · P2P SLA · 시세 출처 · 저장/새로고침).
- **`App.jsx`**: **`AdminSectionBoundary`** (`admin-tab-ops`) **바깥 유지**; **`visible={isAdminTab("ops")}`** 및 `loadPlatformSettings` / `savePlatformSettings` / SLA·시세 state·`envFallbackSla` 등 **props only**.
- **Lint**: `package.json` `eslint` list에 **`OpsOverviewPanel.jsx`** 추가.

---

## Phase 28 — `ops` emergency maintenance card extracted (implemented)

- **New**: `src/admin/panels/OpsMaintenancePanel.jsx` — same markup as the former second **`mb-5 rounded-3xl …`** card (**비상 점검 모드 (원클릭)** · ON/OFF · 사유/ETA 입력 · 상태 줄).
- **`App.jsx`**: **`AdminSectionBoundary`** (`admin-tab-ops`) **바깥 유지**; **`visible={isAdminTab("ops")}`** 및 `emergencyState` / `updateEmergencyMode` / `loadEmergencyState` 등 **props only**.
- **Lint**: `package.json` `eslint` list에 **`OpsMaintenancePanel.jsx`** 추가.

---

## Phase 29 — `ops` market catalog audit card extracted (implemented)

- **New**: `src/admin/panels/OpsMarketAuditPanel.jsx` — same markup as the former third **`mb-5 rounded-3xl …`** card (**마켓 카탈로그 변경 이력** · 필터 · 로그 리스트 · 더보기 · 감사 알림 로그).
- **`App.jsx`**: **`AdminSectionBoundary`** (`admin-tab-ops`) **바깥 유지**; **`visible={isAdminTab("ops")}`** 및 `loadMarketCatalogAudit` / `marketCatalogLogs` / 필터·체인 관련 state 등 **props only**.
- **Lint**: `package.json` `eslint` list에 **`OpsMarketAuditPanel.jsx`** 추가.

---

## Phase 30 — `ops` operations risk center card extracted (implemented)

- **New**: `src/admin/panels/OpsRiskCenterPanel.jsx` — same markup as the former fourth **`mb-5 rounded-3xl …`** card (**운영 리스크 센터** · 리스크 점검 · overall/score · risk tiles · 즉시 조치).
- **`App.jsx`**: **`AdminSectionBoundary`** (`admin-tab-ops`) **바깥 유지**; **`visible={isAdminTab("ops")}`** 및 `loadOpsRiskSummary` / `opsRiskSummary` / `runOpsAction` 등 **props only**.
- **Lint**: `package.json` `eslint` list에 **`OpsRiskCenterPanel.jsx`** 추가.

---

## Phase 31 — `ops` extended market catalog card extracted (implemented)

- **New**: `src/admin/panels/OpsExtendedMarketCatalogPanel.jsx` — same markup as the former fifth **`mb-5 rounded-3xl …`** card (**확장형 마켓 카탈로그 (코인/NFT)** · Assets/Markets 그리드 · 변경 요약 · 저장 확인 모달).
- **`App.jsx`**: **`AdminSectionBoundary`** (`admin-tab-ops`) **바깥 유지**; **`visible={isAdminTab("ops")}`** 및 `loadMarketCatalog` / `filteredMarketAssets` / `marketCatalogDiff` / `saveMarketCatalog` 등 **props only**.
- **Lint**: `package.json` `eslint` list에 **`OpsExtendedMarketCatalogPanel.jsx`** 추가.

---

## Phase 32 — `ops` snapshot rollback center card extracted (implemented)

- **New**: `src/admin/panels/OpsSnapshotRollbackPanel.jsx` — same markup as the former sixth **`mb-5 rounded-3xl …`** card (**복구 스냅샷 · 롤백 센터** · 스냅샷 목록 · 롤백 폼).
- **`App.jsx`**: **`AdminSectionBoundary`** (`admin-tab-ops`) **바깥 유지**; **`visible={isAdminTab("ops")}`** 및 `loadOpsSnapshots` / `createOpsSnapshot` / `executeRollback` / **`formatNumber={number}`** 등 **props only**.
- **Lint**: `package.json` `eslint` list에 **`OpsSnapshotRollbackPanel.jsx`** 추가.

---

## Phase 33 — `ops` report hash server log card extracted (implemented)

- **New**: `src/admin/panels/OpsReportHashPanel.jsx` — same markup as the former seventh **`mb-5 rounded-3xl …`** card (**리포트 해시 서버 기록** · 이력 리스트 · 해시 대조 검증).
- **`App.jsx`**: **`AdminSectionBoundary`** (`admin-tab-ops`) **바깥 유지**; **`visible={isAdminTab("ops")}`** 및 `loadRecentReportHashes` / `recentReportHashes` / `verifyReportHash` / `verifyHashType`·`verifyHashInput`·`verifyHashResult` 등 **props only**.
- **Lint**: `package.json` `eslint` list에 **`OpsReportHashPanel.jsx`** 추가.

---

## Phase 34 — `ops` webhook delivery status card extracted (implemented)

- **New**: `src/admin/panels/OpsWebhookStatusPanel.jsx` — same markup as the former eighth **`mb-5 rounded-3xl …`** card (**Webhook 전송 상태** · 필터·자동 감시·이벤트 리스트).
- **`App.jsx`**: **`AdminSectionBoundary`** (`admin-tab-ops`) **바깥 유지**; **`visible={isAdminTab("ops")}`** 및 `loadWebhookEvents` / `filteredWebhookEvents` / `acknowledgeWebhookChainAlerts` 등 **props only**.
- **Lint**: `package.json` `eslint` list에 **`OpsWebhookStatusPanel.jsx`** 추가.

---

## Phase 35 — `ops` permission audit report card extracted (implemented)

- **New**: `src/admin/panels/OpsPermissionAuditPanel.jsx` — same markup as the former ninth **`mb-5 rounded-3xl …`** card (**권한 감사 리포트** · 기간·조회·CSV/PDF · 요약 6칸 · 이벤트 리스트). CSV 버튼 라벨은 `App.jsx`와 동일한 유니코드 시퀀스를 JSX 문자열 이스케이프로 표현해 픽셀·문자 동일 유지.
- **`App.jsx`**: **`AdminSectionBoundary`** (`admin-tab-ops`) **바깥 유지**; **`visible={isAdminTab("ops")}`** 및 `loadApprovalAuditReport` / `approvalAuditEvents` / `exportApprovalAuditCsv` 등 **props only**.
- **Lint**: `package.json` `eslint` list에 **`OpsPermissionAuditPanel.jsx`** 추가.

---

## Phase 36 — `audit` platform audit log (first block) extracted (implemented)

- **New**: `src/admin/panels/AuditOverviewPanel.jsx` — same markup as the former first slice inside the shared **`mb-5 rounded-3xl …`** audit card (**플랫폼 감사 로그** · 새로고침 · 테이블 · 빈 안내). **`mt-8 border-t`** 로 이어지는 **P2P 주문 모니터** 블록은 phase 37에서 `AuditP2pOrderMonitorPanel.jsx`로 분리.
- **`App.jsx`**: **`AdminSectionBoundary`** (`admin-tab-audit`) **바깥 유지**; 공유 카드 루트 `div` 안에 **`AuditOverviewPanel`** + **`AuditP2pOrderMonitorPanel`**; **`loadPlatformAuditLogs` / `loadAdminP2pOrders`** 등 **props only**.
- **Lint**: `package.json` `eslint` list에 **`AuditOverviewPanel.jsx`** 추가.

---

## Phase 37 — `audit` P2P order monitor block extracted (implemented)

- **New**: `src/admin/panels/AuditP2pOrderMonitorPanel.jsx` — same markup as the former **`mt-8 border-t … pt-6`** slice (**P2P 주문 모니터** · 테이블 · 타임라인 패널 · 빈 안내).
- **`App.jsx`**: **`AdminSectionBoundary`** (`admin-tab-audit`) **바깥 유지**; 공유 카드 루트 안 **`AuditP2pOrderMonitorPanel`**; `adminP2pOrders` / `toggleAdminP2pTimeline` / `adminCancelP2pOrder` 등 **props only**.
- **Lint**: `package.json` `eslint` list에 **`AuditP2pOrderMonitorPanel.jsx`** 추가.

---

## Phase 38 — Admin panels split smoke checklist (docs only; no code change)

- **Scope**: `src/admin/panels` **32**개 `*.jsx` 전부 — `App.jsx`에서 **동일 32**개 import·사용; **추가 고아 패널 파일 없음**.  
- **`package.json` `lint`**: 위 32개 패널 경로 + `AdminSectionBoundary` / `AdminErrorBoundary` / `adminMenuIds.js` 등 기존 목록과 **일치**(누락 없음).  
- **`AdminSectionBoundary`**: `admin-tab-audit` / `ops` / `member` / `memberOps`(×3) / `security` / `kyc` / `dispute` 유지; **`audit`** 메인 카드는 **`isAdminTab("audit")` → 루트 `div`에 `hidden`** 패턴(기존과 동일); **`ops`** 스택은 각 패널에 **`visible={isAdminTab("ops")}`**.  
- **`visible` / 탭 조건**: `UteSurfacePanel` `visible={isAdminTab("uteSurface")}`; `DashboardPanel`·`SecurityPanel` 등 기존 분기 유지; **`AdminActionLogStrip`** `visible={isAdminTab("member") || isAdminTab("memberOps")}`; **`false && isAdminTab(...)`** 잔여 **3**개 루트(Phase 39 시점 7개 중 **L3·40**, **L5·41**, **L2·42**, **L7·43** 제거); 인덱스·후보 표는 [Phase 39](#phase-39--false--isadmintab-legacy-blocks-pre-delete-audit-docs-only) + [Phase 40](#phase-40--l3-dead-security-duplicate-removed-implemented) + [Phase 41](#phase-41--l5-dead-seller-deposit-notice-duplicate-removed-implemented) + [Phase 42](#phase-42--l2-dead-tree-example-demo-removed-implemented) + [Phase 43](#phase-43--l7-dead-permission-line-removed-implemented).  
- **`ref`**: **`MemberHierarchyPanel`** `ref={hierarchyPathSectionRef}`; **`MemberDirectDownlinePanel`** `ref={directDownlineListRef}`; **`AdminActionLogStrip`** `ref={adminActionLogSectionRef}`; 2열 그리드 **`memberTreeSectionRef`**는 `App.jsx` 래퍼 유지.  
- **Props**: 정적 리뷰 기준 누락·미연결 징후 없음(빌드·lint 통과).  
- **검증**: `npm run build` · `npm run lint` 성공(Phase 38 작업 시점).  
- **문서 정합**: 본 파일 Phase 5–37·§2–§8 및 [ADMIN_STRUCTURE_AUDIT.md](./ADMIN_STRUCTURE_AUDIT.md) Phase 5–37과 실제 패널 목록 **일치**.

---

## Phase 39 — `false && isAdminTab` legacy blocks (pre-delete audit; docs only)

**규칙**: Phase 39에서는 **삭제·리팩터 없음**. 아래는 `src/App.jsx` 정적 검색(`false &&` + `isAdminTab`) 기준이며, 줄 번호는 리포지토리 현재 기준(드리프트 가능).

### 39.1 인덱스 (Phase 39 시점 루트 **7**개 → **L3·40**·**L5·41**·**L2·42**·**L7·43** 제거 후 잔여 **3**개)

모두 클래스 분기가 `${false && isAdminTab("…") ? "" : "hidden "}` 형태라 **항상 `hidden`** — 사용자에게는 보이지 않음. 마운트는 유지됨 (**L3·L5·L2·L7 제거 후** 해당 블록은 DOM에 없음).

| # | 대략 줄 | 가드 | 내용 요약 |
|---|--------|------|-----------|
| L1 | ~8642–8649 | `memberOps` | 배분율 요약 박스; **`ref={rateValidationSectionRef}`** |
| ~~L2~~ | ~~(드리프트)~~ | ~~`memberOps`~~ | ~~**하부트리 예시** 텍스트 데모~~ → **Phase 42 제거** |
| ~~L3~~ | ~~8671–8765~~ | ~~`security`~~ | ~~구 **보안 센터** 대형 블록~~ → **Phase 40 제거** |
| L4 | (드리프트) | `memberOps` | **실계정 권한 관리** — `authUsers` 전체 행 + `updateAuthRole` |
| ~~L5~~ | ~~(드리프트)~~ | ~~`memberOps`~~ | ~~**판매자 입금자명 확인 공지** — `sellerDepositNotice` textarea + 저장~~ → **Phase 41 제거** |
| L6 | (드리프트) | `memberOps` | **하부 연결 저장 / 하부 트리 조회 / 차액 수익 검증** 3칸 그리드 + IIFE |
| ~~L7~~ | ~~(드리프트)~~ | ~~`memberOps`~~ | ~~**권한 레벨** 한 줄 텍스트~~ → **Phase 43 제거** |

### 39.2 호출·사용 여부

- **`moveToSection(rateValidationSectionRef)`**: L6 블록 **내부** 버튼 핸들러에서만 호출됨. L6·L1 모두 항상 `hidden`이므로 런타임에서 해당 스크롤 타깃으로는 **도달 불가**(데드 경로).
- **`SecurityPanel`**: L3 블록과 **역할 중복** — 라이브 탭은 `SecurityPanel` + `admin-tab-security` 경계(위쪽 JSX)가 담당.
- **`MemberOpsGridPanel`**: ~~L5(판매자 공지)~~는 패널 내 **동일 state·동작**으로 이미 제공 → **Phase 41에서 L5 데드 JSX 제거**. L4(전체 `authUsers` 권한 테이블)는 패널이 **선택 1명(`selectedOpsUser`)** 중심 편집이라 **UI·정보 밀도가 다름** — “완전 동일 대체”는 아님.
- **~~L2~~·~~L7~~**: ~~L2~~·~~L7~~ 모두 순 데모/부가 텍스트 → **Phase 42·43 제거**.

### 39.3 삭제 가능 후보 vs 보류 후보 (다음 전용 PR에서만 검토)

| 구분 | 블록 | 근거 |
|------|------|------|
| ~~**삭제 가능 후보**~~ | ~~**L3** (구 보안 센터)~~ | ~~**`SecurityPanel.jsx`**가 라이브 경로에서 동일 역할.~~ → **Phase 40 제거 완료** |
| ~~**삭제 가능 후보**~~ | ~~**L5** (판매자 입금자명 카드)~~ | ~~**`MemberOpsGridPanel.jsx`**에 동일 `sellerDepositNotice` / `appendAdminAction` / 알림 흐름.~~ → **Phase 41 제거 완료** |
| ~~**삭제 가능 후보(낮은 우선·검증 후)**~~ | ~~**L2**, **L7**~~ | ~~가시 UI 없음·데모/부가 텍스트만.~~ → **L2·Phase 42**, **L7·Phase 43 제거 완료** |
| **보류** | **L1** | `rateValidationSectionRef` 및 배분율 요약 UI가 패널로 이전되지 않음; 삭제 시 **ref·스크롤 계약** 정리 필요. |
| **보류** | **L4** | “전체 목록 한 화면” vs **`MemberOpsGridPanel`** 단일 선택 편집 — 제품 의도 확인 전 유지 권장. |
| **보류** | **L6** | 라이브에 동일 버튼 행 없음; `하부 연결 저장` 등 비즈니스 의도·향후 복구 가능성 불명. |

**Phase 39**에서는 위 후보 어떤 것도 삭제하지 않았음. **L3**는 [Phase 40](#phase-40--l3-dead-security-duplicate-removed-implemented)에서, **L5**는 [Phase 41](#phase-41--l5-dead-seller-deposit-notice-duplicate-removed-implemented)에서, **L2**는 [Phase 42](#phase-42--l2-dead-tree-example-demo-removed-implemented)에서, **L7**은 [Phase 43](#phase-43--l7-dead-permission-line-removed-implemented)에서 제거.

---

## Phase 40 — L3 dead `security` duplicate removed (implemented)

- **`App.jsx`**: `false && isAdminTab("security")` 로 감싼 **구 보안 센터** 대형 JSX(필터·4타일·`securityUsers` 풀스크롤 리스트·정책 체크리스트·차단 메모·저장 버튼) **전체 삭제** — 블록 내 **`ref` 없음**; `moveToSection` 등 외부 핸들러와 **연결 없음**.
- **라이브 UI**: 변경 없음 — 해당 JSX는 원래 항상 `hidden`이었고, **`admin-tab-security`** + **`SecurityPanel`** 이 동일 state(`securityFilter`, `securityUsers`, `blockReason`, …)로 보안 탭을 담당.
- **중복 검증**: `SecurityPanel.jsx`가 리스트+상세 2열 구조로 재구성되어 마크업은 구 블록과 다르지만, **필터·회원 위험 정보·액션 버튼·차단 메모** 동일 역할(Phase 7 분리본).
- **Lint / 빌드**: `SecurityPanel.jsx` 변경 없음; `npm run build` · `npm run lint` 통과(Phase 40 작업 시점).
- **스모크**: `npm run smoke:admin` (Playwright, dev `127.0.0.1:5171`) — 관리자 진입·「회원관리」노출 **OK**.

---

## Phase 41 — L5 dead seller deposit notice duplicate removed (implemented)

- **`App.jsx`**: `false && isAdminTab("memberOps")` 로 감싼 **판매자 입금자명 확인 공지 관리** 카드(헤더·`sellerDepositNotice` textarea·「공지 저장」만; **로그 보기 버튼 없음**) **전체 삭제** — 블록 내 **`ref` 없음**.
- **라이브 UI**: 변경 없음 — 해당 JSX는 원래 항상 `hidden`이었고, **`MemberOpsGridPanel`**(회원 운영 그리드)이 동일 `sellerDepositNotice` / `setSellerDepositNotice` / `appendAdminAction` / `notify` 및 **「공지 저장」+「로그 보기」**를 제공(Phase 11).
- **중복 검증**: 데드 카드는 라이브 패널의 부분집합(저장 한 버튼만); 패널 쪽이 **기능 상위집합**.
- **Lint / 빌드**: `MemberOpsGridPanel.jsx` 변경 없음; `npm run build` · `npm run lint` 통과(Phase 41 작업 시점).
- **스모크**: `npm run smoke:admin` — **OK**(Phase 41 작업 시점).

---

## Phase 42 — L2 dead tree example demo removed (implemented)

- **`App.jsx`**: `false && isAdminTab("memberOps")` 로 감싼 **하부트리 예시** 카드(본사/상위/하위 배분율 안내용 **정적 데모** 4줄) **전체 삭제** — **`ref` 없음**, 버튼·`onClick`·API·`moveToSection` **없음**; `adminMember` / `adminParent` / `received` / `childRate` / `marginRate` / `invalidRate`는 **표시만**이었고 라이브 폼 state와의 **쓰기 연결 없음**.
- **라이브 UI**: 변경 없음 — 블록은 원래 항상 `hidden`.
- **Lint / 빌드**: `npm run build` · `npm run lint` 통과(Phase 42 작업 시점).
- **스모크**: `npm run smoke:admin` — **OK**(Phase 42 작업 시점).

---

## Phase 43 — L7 dead permission line removed (implemented)

- **`App.jsx`**: `false && isAdminTab("memberOps")` 로 감싼 **권한 레벨:** 한 줄(`isSuperAdmin` ? 슈퍼/일반 관리자 문구) **전체 삭제** — **`ref` 없음**, 이벤트·API **없음**; 라이브 헤더/탭과 **중복 아님**(별도 데모 박스만 제거).
- **라이브 UI**: 변경 없음 — 블록은 원래 항상 `hidden`.
- **Lint / 빌드**: `npm run build` · `npm run lint` 통과(Phase 43 작업 시점).
- **스모크**: `npm run smoke:admin` — **OK**(Phase 43 작업 시점).

---

## Phase 44 — `member` tab inline JSX inventory (docs only)

**규칙**: Phase 44에서는 **`App.jsx` 이동·삭제·신규 패널 파일 없음** — `sectionId="admin-tab-member"` 내부만 정적 인벤토리. 줄 번호는 드리프트 가능(현재 기준 ~8422–8600).

### 44.1 이미 분리된 패널(본 경계 안, 변경 없음)

`MemberGridPanel` → `MemberHierarchyPanel` → `MemberDetailPanel` → 조건부 `MemberSelfNoticePanel` / `MemberStageConfirmPanel` / `MemberPendingStagePanel` → `MemberAssignChildPanel` → `MemberActionRowPanel` → 조건부 `MemberEmptyDownlinePanel` → `MemberStatsPanel` → 조건부 `MemberDirectDownlinePanel` → `MemberHiddenFieldsPanel` (Phase 14–25와 [§2](#2-adminviewtab-inventory-inner-horizontal-tabs) 동일). **Phase 45**: 미선택 안내 → **`MemberEmptySelectionPanel`** (삼항 `else` 가지).

### 44.2 잔여 인라인 JSX (패널이 아닌 DOM·조건) — **5**개 구조 단위 + **1**곳 경미 handler

**(Phase 45 업데이트)**: 아래 **M4** 행은 Phase 44 시점 스냅샷; 실제 코드에서는 **`MemberEmptySelectionPanel`** 로 분리됨([Phase 45](#phase-45--member-m4-empty-selection-panel)).

| Id | 내용 요약 | 분류 |
|----|-------------|------|
| **M0** | 2열 루트 `div`: `ref={memberTreeSectionRef}`, `isAdminTab("member")`일 때만 표시용 `hidden` 해제 | **ref 의존**, **조건 분기**, 레이아웃 |
| **M1** | 오른쪽 열 `div` `grid h-full gap-2 overflow-hidden` | 레이아웃 shell |
| **M2** | 선택 영역 카드 `div` + `{lang.selectedUser}` 제목 행 | **단순 표시** + shell |
| **M3** | `monitorCurrentUser ? <Fragment+패널들> : …` 삼항 | **조건 분기** (패널 오케스트레이션) |
| **M4** | 미선택 시 «왼쪽에서 하부 회원을 선택하세요.» `div` | **단순 표시** |
| **H1** | `MemberStageConfirmPanel`의 `onCancel` 인라인 함수(상태 3개 `set…`) | **handler** (소량; 취소 시퀀스) |

- **hidden/debug**: 탭 가시성은 **M0**의 `member` 조건; **디버그 토글**(`showAdminDebug` 등)은 **`MemberGridPanel` props**로만 전달(인라인 아님).

### 44.3 패널화 가능 후보 vs `App.jsx` 유지 권장

| 구분 | 대상 | 비고 |
|------|------|------|
| **패널화 가능(낮음)** | ~~**M4** 미선택 안내 한 블록~~ | **Phase 45**에서 **`MemberEmptySelectionPanel`** 로 분리 완료 |
| **패널화 가능(중·선택)** | **M2+M3** 오른쪽 “선택 사용자” 열 전체 래퍼 | `MemberSelectedColumnPanel` 식은 **props 대량**·회귀 위험 — 별도 PR·동의 후 |
| **유지 권장** | **M0** | split plan·Phase 14 이후 **2열 `ref` 루트는 `App.jsx`** 고정 정책 |
| **유지 권장** | **M1** | 순수 레이아웃; 분리 이득 작음 |
| **유지 권장** | **M3** 내 패널 순서·조건 | `stageConfirmOpen`·`pendingStageValue`·`selectedChildren` 등과 결합 — **오케스트레이션** |
| **유지 권장** | **H1** (또는 콜백 props 승격) | 이번 Phase 범위 밖; 필요 시 소형 props만 |

### 44.4 `AdminSectionBoundary` 충돌

- 없음: 인라인·패널 모두 **단일** `admin-tab-member` 래퍼 안; 다른 `sectionId`와 겹치지 않음.

### 44.5 검증

- **코드 변경 없음**; `npm run build` · `npm run lint` 통과(Phase 44 작업 시점).

---

## Phase 45 — `member` M4 empty selection panel

**목표**: Phase 44 **M4**(미선택 안내 `div` 한 블록)만 **`MemberEmptySelectionPanel.jsx`**로 분리. **M0/M1/M3**·`ref`·handler·삼항 분기 위치 **비변경**; 문구·`className`·DOM 깊이(선택 카드 내부 `else` 가지) 동일.

### 45.1 코드

- **`src/admin/panels/MemberEmptySelectionPanel.jsx`**: `theme`, `lang`만 수신; `lang.memberEmptySelectionHint` 표시(기존과 동일 한국어 문자열 — 모든 로케일에 동일 부여로 화면 변화 없음).
- **`App.jsx`**: `import` + 삼항 `else` 가지에서 인라인 `div` → `<MemberEmptySelectionPanel theme={theme} lang={lang} />`; `translations` 5개 로케일에 `memberEmptySelectionHint` 추가.
- **`package.json`**: `lint` 목록에 패널 경로 추가. `src/admin/panels` 총 **33**개 `*.jsx`(Phase 38 이후 +1).

### 45.2 검증

- **`npm run build`** · **`npm run lint`** 통과(Phase 45 작업 시점).

---

## 46. Ongoing constraints (after phase 5–45)

- **No big-bang `App.jsx` refactor** — one logical panel per PR; `uteSurface` / `dashboard` / `security` / `kyc` / `dispute` / admin action log strip / `memberOps` (all three bounded panels) / `member` (thirteen extracted slices) / `ops` (nine stacked cards: HQ + emergency + market audit + risk + extended catalog + snapshot rollback + report hash + webhook + permission audit) / `audit` (**`AuditOverviewPanel`** + **`AuditP2pOrderMonitorPanel`** + shared card root in `App.jsx`) extractions set the pattern.  
- **No new routes** / `AdminShell` menu contract changes without product sign-off.  
- **No `false &&` removal** in panel extraction PRs (dedicated cleanup PR only).  
- **No mass helper relocation** in early extractions (props pass-through from `App.jsx`).

(Phase 4 originally said “no `App.jsx` moves”; phase 5–45 supersede that **only** for the agreed panel blocks.)

---

## Related

- [ADMIN_STRUCTURE_AUDIT.md](./ADMIN_STRUCTURE_AUDIT.md)  
- [ADMIN_RULES.md](./ADMIN_RULES.md)  
- [MASTER_MANUAL.md](../MASTER_MANUAL.md)
