# AdminReferralPanel split plan — 01 TetherGet-P2P

**Repository**: `01-TetherGet-P2P` only.  
**Status**: Phase 5 — first **`uteSurface`** panel extracted to `src/admin/panels/UteSurfacePanel.jsx`; remainder of `AdminReferralPanel` still in `App.jsx`.

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
| `dashboard` | 대시보드 | Category cards + summary blocks; **no** `AdminSectionBoundary` yet. |
| `member` | 회원관리 | Tree + detail; boundary `admin-tab-member`. |
| `memberOps` | 회원운영 | Split JSX; boundaries `admin-tab-memberOps` ×3. |
| `security` | 보안 | Live 2-column grid; boundary `admin-tab-security`. |
| `kyc` | KYC | boundary `admin-tab-kyc`. |
| `dispute` | 분쟁/정산 | boundary `admin-tab-dispute`. |
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
| `member` | `admin-tab-member` | 회원 관리 | 1 |
| `memberOps` | `admin-tab-memberOps` | 회원 운영 | **3** wrappers (DOM order: grid → memo → media); same id/label for each. |
| `security` | `admin-tab-security` | 보안 관리 | 1 |
| `dashboard` | — | — | Not wrapped at tab level. |
| `uteSurface` | — | — | Not wrapped. |

**Outside boundaries (still in panel, outer `AdminErrorBoundary` only)**:

- Sticky tab bar and shell-driven tab sync.
- `dashboard` and `uteSurface` main blocks.
- **`false && isAdminTab(...)`** legacy sections (still mounted).
- **관리자 액션 로그** block (`member` **or** `memberOps` visibility) — shared across two tabs; optional future `AdminSectionBoundary` if crashes appear.

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
| G | **Dashboard** cards / referral summary | `dashboard` | no |
| H | **Member** tree + detail | `member` | yes |
| I | **Member ops** grid | `memberOps` | yes (1/3) |
| J | **Security** grid | `security` | yes |
| K | Rate validation / tree example / memo | `memberOps` + dead | partial / dead |
| L | Dead `security` center duplicate | `false &&` | no |
| M | Dead `memberOps` cards | `false &&` | no |
| N | **KYC** | `kyc` | yes |
| O | **Dispute** | `dispute` | yes |
| P | **Member ops** media monitoring | `memberOps` | yes (3/3) |
| Q | **Admin action log** | `member` \|\| `memberOps` | no |
| R | Dead `memberOps` action row | `false &&` | no |

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

No files created in phase 4. Names are indicative; final names can differ.

| Priority band | Suggested file | Scope | Rationale |
|---------------|----------------|-------|-----------|
| **Low** | `UteSurfacePanel.jsx` ✓ | `uteSurface` block | **Phase 5 done** — metrics grid; fetch stays in `App.jsx`. |
| **Low** | `AdminPanelDashboard.jsx` | `dashboard` blocks | Mostly cards; depends on many props but little tab cross-talk. |
| **Medium** | `AdminPanelSecurity.jsx` | `security` tab | Already bounded; props surface clearer after move. |
| **Medium** | `AdminPanelKyc.jsx` | `kyc` tab | Bounded; document preview paths isolated. |
| **Medium** | `AdminPanelDispute.jsx` | `dispute` tab | Bounded; policy + timeline. |
| **Medium** | `AdminPanelAdminActionLog.jsx` | action log strip | Shared `member` \| `memberOps`; extract after tab panels stabilize. |
| **High** | `AdminPanelMember.jsx` | `member` tab | Large tree + pagination + inline rates; many refs (`memberTreeSectionRef`, etc.). |
| **High** | `AdminPanelMemberOps.jsx` | three `memberOps` chunks | Either one component returning fragment of three bounded subtrees, or three files — decide in implementation. |
| **High** | `AdminPanelOps.jsx` | `ops` tab | Many API surfaces in one tab. |
| **High** | `AdminPanelAudit.jsx` | `audit` tab | Largest tables + order actions. |

**Import policy for early PRs**: New panel files should receive **explicit props** from `AdminReferralPanel` (or a thin `AdminReferralPanel.jsx` wrapper in `App.jsx` first). Avoid importing half of `App.jsx` into panels.

---

## 7. Split order (recommended): low coupling → high coupling

1. ~~**`uteSurface`**~~ — **Done (phase 5)** → `src/admin/panels/UteSurfacePanel.jsx`.  
2. **`dashboard`** — mostly read-only UI from existing state.  
3. **`security`** — already isolated by boundary.  
4. **`kyc`** → **`dispute`** — bounded, cohesive stories.  
5. **`admin action log`** — optional; resolves shared `member` \| `memberOps` visibility in one place.  
6. **`memberOps`** (all three chunks) — keep boundaries co-located with moved JSX.  
7. **`member`** — heavy tree + selection.  
8. **`ops`** → **`audit`** — largest blocks last; most API and table risk.

Between steps: `npm run build`, `npm run lint`, manual smoke on tab bar + shell nav.

---

## 8. Risk bands (for testing focus)

| Band | Tabs / blocks |
|------|----------------|
| **Lower** | `uteSurface`, `dashboard`, bounded `security` / `kyc` / `dispute` after move |
| **Medium** | `memberOps` (split roots), admin action log |
| **Higher** | `member`, `ops`, `audit`, all `false &&` mounted dead paths |

---

## Phase 5 — `uteSurface` extracted (implemented)

- **New**: `src/admin/panels/UteSurfacePanel.jsx` — same markup as former inline block; props `theme`, `uteSurfaceMetrics`, `visible` (`isAdminTab("uteSurface")`).
- **`App.jsx`**: import + single `<UteSurfacePanel … />`; `useState` / `useEffect` for `refreshAdminPlatformSurface` + `getUteSurfaceMetrics` unchanged; **no** new `AdminSectionBoundary` on this tab (unchanged from pre-split).
- **Lint**: `package.json` `eslint` list includes `UteSurfacePanel.jsx`.

---

## 9. Ongoing constraints (after phase 5)

- **No big-bang `App.jsx` refactor** — one logical panel per PR; `uteSurface` extraction is the pattern.  
- **No new routes** / `AdminShell` menu contract changes without product sign-off.  
- **No `false &&` removal** in panel extraction PRs (dedicated cleanup PR only).  
- **No mass helper relocation** in early extractions (props pass-through from `App.jsx`).

(Phase 4 originally said “no `App.jsx` moves”; phase 5 supersedes that **only** for the agreed `uteSurface` block.)

---

## Related

- [ADMIN_STRUCTURE_AUDIT.md](./ADMIN_STRUCTURE_AUDIT.md)  
- [ADMIN_RULES.md](./ADMIN_RULES.md)  
- [MASTER_MANUAL.md](../MASTER_MANUAL.md)
