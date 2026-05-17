# LAST_SESSION_REPORT — 01-TetherGet-P2P

**Updated:** 2026-05-17  
**Scope:** P0 관리자 안정화 **완료** (gate 단일화 · 렌더 루프 안정화 · 자동/수동 QA)

**Monorepo status:** See root `LAST_SESSION_REPORT.md` (01 + 03 cross-app stabilization CLOSED).

---

## 1. Session summary

| Item | Status |
|------|--------|
| `resolveAdminUiAccess` + `buildAdminGateUser` | Shipped (`src/admin/resolveAdminUiAccess.js`) |
| Nav / render / `openPage` / restore / LS gate | Unified via `canEnterAdminUi` |
| `tg_ui_home_screen_v1` | `readInitialMainScreen` · `normalizeStoredMainScreen` · gate 실패 → `trade` |
| `admin-denied` | Thin wrapper 유지; cold load·LS persist 제외 |
| App.jsx render-loop stabilization (P0b) | **Complete** — no `Maximum update depth` in QA |
| Automated browser QA | `node scripts/qa-admin-p0.mjs` — **9/9 PASS** |
| `npm run smoke:admin` | **PASS** |
| lint / test / build | **PASS** |
| **Manual browser QA** | **Complete** — login · admin · F5 · logout **normal** |

---

## 2. App.jsx 관리자 렌더 루프 위험 분석

### 2.1 `setCurrentRole` (role sync) — **낮음**

**위치:** `App.jsx` ~L1804–1813 (`AdminReferralPanel` 밖, 루트 `App`)

```javascript
useEffect(() => {
  ...
  setCurrentRole((current) => {
    if (!shouldApplyAuthUserRoleSync(current, nextRole)) return current;
    return nextRole;
  });
}, [loggedIn, authUsers, currentAdminActorId]);
```

| 항목 | 평가 |
|------|------|
| `currentRole` in deps | **제거됨** — functional updater로 Maximum update depth 방지 |
| `shouldApplyAuthUserRoleSync` | elevated role ↔ `회원` ping-pong 차단 (`mockAdminAccount.js`) |
| `adminGateUser` 연쇄 | role 변경 → gate 재계산 1회; restore effect는 `activePage === "admin"`일 때만 `trade`로 1회 이동 |

**재발 조건:** `authUsers`가 매 렌더마다 새 배열로 바뀌고, `me.role`이 `current`와 매번 “동기화 필요”로 판정되는 경우. 현재 API merge는 동일 role이면 updater가 `current` 반환.

---

### 2.2 `setSelectedAdminUser` — **중간 (가드 있음)**

#### A) 선택 회원 유지 effect (~L6230–6252)

| 트리거 | 동작 | 루프? |
|--------|------|-------|
| `selectedAdminUser?.id`가 `memberUsers`에 없음 | `applyUserContext(actor)` → id 설정 | 1~2회 후 `existsInMemberPool` → early return |
| id 유효 | immediate return | 없음 |

**위험:** `visibleUsers` / `memberUsers`가 불필요하게 새 참조로 memo가 깨지면 effect가 반복 실행될 수 있음. 현재 `memberUsers`는 `[authUsers, virtualDownlineUsers, stageByUserId, userParentOverrides]`에만 의존.

#### B) `memberUsers` / `stageByUserId` 동기화 (~L6271–6288)

- `selectedAdminUser?.id`만 deps에 포함 (객체 전체 X).
- 필드 비교(`unchanged`) 후에만 `setSelectedAdminUser(fresh)`.
- **의도:** stage 변경 후 표시 객체를 최신화하되, 동일 내용이면 set 생략.

**재발 조건:** `fresh`가 매번 새 객체이고 비교 필드가 항상 달라지는 경우(예: floating volume). 현재 비교는 id·role·nickname·stage·childRate·parent.

---

### 2.3 `setStageByUserId` — **낮음~중간**

| 호출 경로 | deps / 트리거 | 루프? |
|-----------|---------------|-------|
| `currentAdminActorId` 변경 (~L5923) | actor당 1회 `stripVirtualKeys` | `stageByUserId` 변경 → (B) effect 1회 |
| `handleChangeUserLevel` | 사용자 액션·`flushSync` | 의도적 1회 |
| API 실패 rollback | 단일 targetId | 1회 |

`stageByUserId`는 (B) effect deps에 포함 → stage 변경 시 selected 행 refresh 1회. **연쇄 루프 없음** (id 동일·unchanged 가드).

---

### 2.4 `applyUserContext` — **낮음**

한 번에 `setSelectedAdminUser` + `setAdminMember` + path 등 **다중 setState**. React 18 배치로 단일 paint. effect 안에서 호출 시 위 (A) 가드로 2회 이내 수렴.

---

### 2.5 Gate / restore effects — **낮음**

| Effect | 조건 | Maximum depth |
|--------|------|----------------|
| LS persist | `activePage !== "admin-denied"` | setState 없음(LS만) |
| admin → trade | `loggedIn && linkedGoogle && activePage===admin && !canEnterAdminUi` | 최대 1회 page 변경 |

`canEnterAdminUiRef`는 diagnostics용; render loop 유발 없음.

---

### 2.6 Maximum update depth — **현재 판정**

| 시나리오 | 자동 QA | 수동 권장 |
|----------|---------|-----------|
| mock admin 로그인 → 관리자 탭 | PASS | 탭 5회 연속 클릭 |
| 관리자 화면 F5 | PASS | 회원 탭·UTE 탭 전환 후 F5 |
| 일반 회원 + LS `admin` | PASS | F5 후 거래 화면 확인 |
| 회원관리에서 다른 회원 10회 선택 | 미검 | DevTools Performance |

**권장 모니터링:** DevTools Console에서 `Maximum update depth` / `[tg-admin-open]` 반복 로그.

---

## 3. Lint 범위 확장

`package.json` `lint` 스크립트에 추가:

- `src/admin/resolveAdminUiAccess.js`
- `src/admin/canAccessAdminSafe.js`

기존 `src/admin/__tests__/resolveAdminUiAccess.test.js`는 `npm test`로 커버.

---

## 4. `sessionProfile.canAccessAdmin` 정리 (장기 후보)

### 현재 이중 경로

| 경로 | 용도 | UI gate? |
|------|------|----------|
| `deriveSessionProfile` → `canAccessAdmin` | 본사/영업 라벨·`hideTradingUi`·`allowDestructiveAdminWrite` | **아니오** (nav/admin shell은 `canEnterAdminUi`) |
| `computeSessionProfileSnapshot` JWT 보강 | JWT `session_role`로 `canAccessAdmin: true` 승격 | **아니오** |
| `buildAdminGateUser` + `resolveAdminUiAccess` | nav · AdminShell · openPage · restore · LS | **예** |

### 통합 방향 (Phase 2+, additive)

1. `buildAdminGateUser`에 `sessionProfile` 힌트를 명시적으로 넘기거나, `computeSessionProfileSnapshot`이 gate user 스냅샷을 반환하는 단일 함수로 합침.
2. `sessionRoles.canAccessAdmin` → **`canEnterAdminUi`와 동일 값**을 읽기 전용으로 노출 (deprecated alias).
3. UI에서 `sessionProfile.canAccessAdmin` 직접 참조 금지 (grep CI 규칙 또는 eslint `no-restricted-syntax` 후보).
4. `isSuperAdmin`은 `allowDestructiveAdminWrite` / `resolveAdminUiAccess` + role 토큰으로 유지 (파괴적 작업 gate).

**이번 P0에서는 코드 이동 없음** — gate는 이미 `canEnterAdminUi` 단일.

---

## 5. Automated QA (reference)

```bash
npm run dev          # http://localhost:5173
node scripts/qa-admin-p0.mjs
npm run smoke:admin
```

---

## 6. 브라우저 수동 QA 체크리스트

**2026-05-17:** 수동 QA **완료** — 로그인 · 관리자 진입 · F5 · 로그아웃 정상. 흰화면 · `Maximum update depth` 없음.

아래는 회귀 시 재확인용 체크리스트.

### 준비

- [ ] `01-TetherGet-P2P`에서 `npm run dev` → **http://localhost:5173**
- [ ] DevTools Console 열기 (Preserve log)
- [ ] Application → Local Storage에서 `tg_ui_home_screen_v1` 확인 가능

### A. Mock 관리자 (`admin@tetherget.local` / `admin1234`)

- [x] 로그인 후 헤더에 **로그아웃** 표시
- [x] nav **관리자** 버튼 보임
- [x] 관리자 클릭 → **AdminShell** (좌측 메뉴·회원관리 본문)
- [x] 관리자 탭 **5회** 연속 클릭 (거래 → 관리자 반복) — 흰 화면·멈춤 없음
- [x] AdminShell 내 메뉴 3개 이상 전환 (대시보드 / 회원 / UTE·P2P 등)
- [x] **F5** — AdminShell 또는 거래로 복귀, **흰 화면 없음**
- [x] Console — `Maximum update depth exceeded` **없음** (stabilization pass)

### B. 일반 회원 (`member1@tetherget.test` / `Test1234`)

- [ ] nav에 **관리자 없음**
- [ ] (선택) Console에서 `localStorage.setItem('tg_ui_home_screen_v1','admin')` 후 F5 → **거래** 화면, AdminShell 없음

### C. 로그아웃

- [x] 관리자 화면에서 로그아웃 → 거래/게스트 UI, AdminShell 잔류 없음
- [x] `tg_ui_home_screen_v1` === `"trade"` (또는 게스트 허용 값)

### D. admin-denied (선택)

- [ ] `tg_debug_admin` 끈 상태에서 권한 없는 계정으로 관리자 진입 시도 시 거부 UI (`admin-denied`) 표시 후 거래로 복귀 가능

**서명:** __________ **날짜:** __________

---

## 7. Modified files (this follow-up)

| File | Change |
|------|--------|
| `package.json` | lint glob + admin gate modules |
| `LAST_SESSION_REPORT.md` | 본 문서 (신규) |

---

## 8. Remaining risks

1. `AdminReferralPanel` monolith — effect 다수; 회원 선택·단계 변경 수동 QA 필수.
2. Email allowlist 외 계정 — `meAuthUser` 로드 전 gate false → admin LS 복원 시 1프레임 trade 이동 가능.
3. `sessionProfile.canAccessAdmin` vs `canEnterAdminUi` — 문서화만 완료, 런타임 단일화는 Phase 2.
4. Full-repo ESLint — `App.jsx` 본문은 여전히 lint glob 밖 (의도적).

---

*End of report — align with `MASTER_MANUAL.md`, `docs/ADMIN_STRUCTURE_AUDIT.md`, `docs/P2P_ADMIN_TEST_ACCOUNT.md`.*
