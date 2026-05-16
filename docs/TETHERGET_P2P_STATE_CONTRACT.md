# TetherGet P2P — 상태·전이·개입 계약 (공통)

**문서 성격**: 제품·서버·클라이언트가 따를 **상태 전이 중심 계약**입니다.  
**금지**: 본 문서는 **실제 에스크로/스마트컨트랙트 구현**, **실거래·외부 결제 API 연결**, **자동 송금·자금 이전 구현**을 포함하지 않습니다. 법률·컴플라이언스 판단은 별도 검토입니다.

**저장소 01 정렬**: 구현체·모의 전이는 `shared/p2pLifecycleMap.js`, `src/tetherget/p2pStateMachine.ts`, `src/tetherget/types.ts`를 참고하되, 본 계약의 **표기(UPPER_SNAKE)**와 1:1이 아닐 수 있습니다. [부록 A](#부록-a--01-저장소-canonical-매핑-참고)를 따릅니다.

---

## 1. 거래 상태 (State)

계약상 **주문(Order) 단위**의 normative 상태 집합입니다.

| State | 의미(요약) | 터미널 |
|-------|------------|--------|
| **CREATED** | 매도 등록·노출 가능; 매수자 미배정 또는 대기 | 아니오 |
| **WAITING_PAYMENT** | 매칭 완료; 구매자 법정화폐(또는 합의 결제수단) 송금 대기 | 아니오 |
| **PAYMENT_SENT** | 구매자가 송금·증빙 제출 등 “지급 시도 완료”를 시스템에 기록한 상태 | 아니오 |
| **PAYMENT_CONFIRMED** | 판매자(또는 정책상 자동 규칙)가 입금 확인; 릴리스 전제 충족 | 아니오 |
| **RELEASE_PENDING** | 에스크로/예치 해제 조건 충족 또는 진행 중; **자동 릴리스 대기** 또는 **수동 릴리스 큐** | 아니오 |
| **RELEASED** | 계약상 거래 종료(코인·권리 이전 완료로 간주되는 비즈니스 종료) | **예** |
| **DISPUTE** | 분쟁 절차 활성(주문은 분쟁 하위 상태로 위임) | 아니오 |
| **CANCELLED** | 합의·정책·관리자에 의한 취소 종료 | **예** |
| **EXPIRED** | 시간·무응답 등 비즈니스 규칙에 의한 자연 종료(취소와 구분되는 이유 코드) | **예** |

**`CLOSED` / 아카이브**: 감사·보존용 스냅샷으로만 두고 주문 UI에서는 `RELEASED` \| `CANCELLED` \| `EXPIRED` 이후로 표시하지 않을 수 있습니다(구현 선택).

---

## 2. 상태 전이 규칙

### 2.1 허용 엣지(요약)

아래는 **역할·정책 게이트를 통과한 경우에만** 허용됩니다(§3–§8). “가능”이 “필수 자동 실행”은 아님.

| From → To | 전이 키(계약용 식별자) | 주된 액터 |
|-------------|------------------------|------------|
| CREATED → WAITING_PAYMENT | `match_or_take` | 시스템·매수자 |
| CREATED → CANCELLED | `seller_withdraw_listing` | 판매자·정책 |
| CREATED → EXPIRED | `listing_ttl` | 시스템(시간) |
| WAITING_PAYMENT → PAYMENT_SENT | `buyer_mark_payment_sent` | 구매자 |
| WAITING_PAYMENT → CANCELLED | `withdraw_match` | 구매자·판매자·정책 |
| WAITING_PAYMENT → EXPIRED | `payment_window_ttl` | 시스템 |
| WAITING_PAYMENT → DISPUTE | `open_dispute_pre_payment` | 운영(예외적으로만) |
| PAYMENT_SENT → PAYMENT_CONFIRMED | `confirm_payment` | 판매자·정책(자동 확인은 §6·§8과 연동) |
| PAYMENT_SENT → DISPUTE | `open_dispute_payment` | 구매자·판매자·운영 |
| PAYMENT_SENT → CANCELLED | `cancel_payment_phase` | 정책·운영 |
| PAYMENT_CONFIRMED → RELEASE_PENDING | `enter_release_queue` | 시스템 |
| PAYMENT_CONFIRMED → DISPUTE | `open_dispute_post_confirm` | 당사자·운영 |
| RELEASE_PENDING → RELEASED | `complete_release` | **자동 릴리스 정책**(§6) **또는** 판매자·연동 규칙(구현 비포함) |
| RELEASE_PENDING → DISPUTE | `open_dispute_release` | 당사자·운영 |
| RELEASE_PENDING → CANCELLED | `admin_cancel_pre_release` | 운영(§5) |
| DISPUTE → RELEASED | `dispute_resolve_release` | 운영·정책 |
| DISPUTE → CANCELLED | `dispute_resolve_cancel` | 운영·정책 |
| DISPUTE → RELEASE_PENDING | `dispute_resume_release` | 운영(분쟁 해제 후 원래 큐 복귀) |

**금지(원칙)**: `RELEASED` \| `CANCELLED` \| `EXPIRED`에서 주문 상태로의 **무변경 재진입** 외 역전이는 하지 않는다(오류 시 **보정은 신규 감사 이벤트 + 관리자 도구**, 상태 덮어쓰기 최소화).

### 2.2 “자동 릴리즈” vs “관리자 강제 개입”

| 구분 | 의미 | 감사(§9) |
|------|------|----------|
| **자동 릴리즈** | `RELEASE_PENDING` → `RELEASED`가 **사전 정의된 시간·조건**에 의해 발생 | 이벤트 타입 `AUTO_RELEASE_*`, 정책 버전·스케줄 스냅샷 기록 |
| **관리자 강제 개입** | 동일 전이라도 **운영자 명시 행위**로 촉발(타임라인 단축·예외 승인·강제 취소 등) | 이벤트 타입 `ADMIN_FORCE_*`, 이중승인·티켓 ID 권장 |

동일한 `RELEASED` 이어도 **원인 코드**를 감사 로그에서 반드시 구분합니다.

---

## 3. Buyer / Seller 역할

| 역할 | 책임(계약) |
|------|------------|
| **Seller** | CREATED에서 유효한 매도 조건 유지; `PAYMENT_SENT` 이후 **PAYMENT_CONFIRMED**에 대한 합리적 응답; 악의적 지연 시 정책 위반으로 분쟁·패널티 경로 가능(구현 없음). |
| **Buyer** | `WAITING_PAYMENT`에서 기한 내 지급 시도; `PAYMENT_SENT` 기록의 정확성; `RELEASE_PENDING` 이후 **자동 릴리스** 조건 충족을 방해하는 행위 금지(정책). |

**대리·봇**: 주문의 법적 당사자는 계정 소유자로 두고, API·봇은 “행위 주체”가 아닌 **도구**로만 기록합니다.

---

## 4. Dispute 정책

- **진입**: `DISPUTE`는 주문 상태와 **분쟁 케이스**를 1:1 또는 1:N으로 연결; 활성 분쟁이 있으면 UI·집계에서는 주문을 분쟁 우선으로 표시할 수 있습니다(01의 `mergeP2pLifecycleWithDispute` 개념과 정합).
- **분쟁 자체의 하위 상태**: `open` → `reviewing` → `resolved` \| `rejected` 등은 **[TETHERGET_DISPUTE_AUDIT_CONTRACT.md](./TETHERGET_DISPUTE_AUDIT_CONTRACT.md)** 에서 규정(본 문서는 주문 State 중 `DISPUTE` 진입·해지만 규정).
- **종료**: 분쟁 `resolved` 결과가 **RELEASED** 또는 **CANCELLED**로 매핑될 때만 주문 터미널로 이동.
- **append-only**: 분쟁 타임라인 이벤트는 **삭제 대신 무효화 플래그** 또는 후속 “정정” 이벤트(§9).

---

## 5. 관리자 개입 정책

- **목적**: 사기 방지, 시스템 오류 보정, 규제 대응, VIP/법무 지시(내부 절차).
- **원칙**: 관리자 행위는 **항상 감사 이벤트**와 함께; 가능하면 **이중 승인**·**변경 불가 사유 코드**.
- **허용 예시**(비한목): `ADMIN_FORCE_CANCEL`, `ADMIN_FORCE_RELEASE`, `ADMIN_ATTACH_NOTE`, `ADMIN_EXTEND_TTL`.
- **금지**: 감사 없이 DB 상태만 직접 수정하는 운영(계약 위반으로 간주).

---

## 6. Delayed release 정책

- **정의**: `RELEASE_PENDING`에 진입한 뒤 **즉시** `RELEASED`가 아니라, **홀드 기간·추가 확인·리스크 스코어** 등으로 지연되는 구간.
- **자동 릴리스**: 홀드 만료·조건 충족 시 `AUTO_RELEASE` 경로로 `RELEASED`(§2.2).
- **관리자**: 홀드 연장·즉시 해제는 `ADMIN_FORCE_*`로만(감사 필수).
- **표시**: 구매자·판매자 UI에 **남은 시간 또는 단계**를 표시할 것(§10).

---

## 7. 친구 / 신뢰 레벨 예외 정책

- **목적**: 수수료·한도·홀드 시간·자동 확인 허용 범위를 **신뢰 그래프**에 따라 조정(구현 없음).
- **계약**: 동일 State라도 **전이 게이트**가 달라질 수 있음(예: 신뢰 그룹은 `PAYMENT_CONFIRMED` 자동 승인 허용, 신규 사용자는 수동만).
- **감사**: 신뢰 레벨·규칙 버전을 전이 이벤트에 **스냅샷**으로 남김(사후 “그때 규칙” 재현).

---

## 8. Feature flag 정책

- **주문 전이와 분리**: 플래그는 **UI 노출·API 가용·자동 규칙 on/off**에 쓰이며, **이미 터미널에 도달한 주문**을 뒤늦게 바꾸지 않는다.
- **예**: `p2p_auto_release_v2` OFF 시 자동 릴리스 엔진 비활성 → `RELEASE_PENDING`은 수동/레거시 경로만 허용(정책 문서화).
- **공통**: [PLATFORM_DEPLOYMENT_POLICY.md](./PLATFORM_DEPLOYMENT_POLICY.md) §3과 정합.

---

## 9. 감사 로그 (Audit) 정책

- **append-only**: 이벤트 스트림은 **삭제하지 않음**; 오타·오기입은 **후속 보정 이벤트**로만 정리.
- **최소 필드(권장)**: `event_id`, `order_id`, `from_state`, `to_state`, `transition_key`, `actor_type`(`buyer`|`seller`|`system`|`admin`), `actor_id`, `policy_version`, `feature_flags_snapshot`, `utc_timestamp`, `correlation_id`.
- **관리자 vs 자동**: §2.2의 타입 구분 필수.
- **PII**: 감사 저장소와 운영 대시보드 간 **마스킹 정책**은 보안 문서와 정합.

---

## 10. 모바일 / PWA 상태 표시 정책

- **단일 소스**: 표시 문구는 **서버가 내려준 state + reason_code**를 우선(클라 단독 추론 금지).
- **지연·홀드**: `RELEASE_PENDING` + `delayed_release` 이유 시 **남은 시간·다음 액션**(구매자/판매자 각각)을 구분 표시.
- **오프라인**: 캐시된 마지막 상태 + “동기화 중” 배지; 전이 중 로컬 낙관적 UI는 **서버 확정 전까지 터미널 표시 금지**.
- **PWA**: 백그라운드 복귀 시 **강제 리페치** 트리거 조건을 제품별로 정의(배포 정책과 연계).

---

## 11. StreamHub / GameHub / UTE와 공통화 가능한 부분

| 공통 레이어 | 설명 |
|-------------|------|
| **상태 + 전이 키** | 모든 플랫폼에서 `from`·`to`·`transition_key`·`actor_type` 패턴 통일 → 크로스 제품 대시보드·알림 파이프라인 단순화. |
| **append-only audit** | GameHub(매치)·StreamHub(세션)·P2P(주문) 동일 원칙. |
| **DISPUTE / 운영 개입** | “플레이어 신고” vs “주문 분쟁” 도메인만 다르고, **운영 타임라인·이중 승인** 패턴 공유. |
| **Feature flag 스냅샷** | 전이 시점 플래그 기록으로 사후 재현(UTE 집계·7번 저장소와 정렬). |
| **TTL / EXPIRED** | 매치 타임아웃·주문 만료 동일 개념; 수치만 제품별. |

**차이(존중)**: P2P는 **자금 인접**이라 관리자 개입·홀드·분쟁이 GameHub보다 **감사 밀도**가 높아야 함.

---

## 부록 A — 01 저장소 canonical 매핑 (참고)

| 본 계약 (UPPER) | 01 canonical (`P2P_LIFECYCLE` 등) | 비고 |
|-----------------|-----------------------------------|------|
| CREATED | `created` | DB `listed` 등 |
| WAITING_PAYMENT | `waiting_payment` | DB `matched` + 미시작 |
| PAYMENT_SENT | *(세분화)* | DB `payment_sent` → 현재 맵은 `release_pending`에 근접; 계약 세분화 시 마이그레이션 계획 별도 |
| PAYMENT_CONFIRMED | `paid` (또는 세분화 컬럼) | `buyer_payment_started_at` 등 |
| RELEASE_PENDING | `release_pending` | |
| RELEASED | `released` | DB `completed` 등 |
| DISPUTE | `dispute` | 분쟁 병합 시 표시 |
| CANCELLED | `cancelled` | |
| EXPIRED | *(신규 권장)* | `CANCELLED`와 이유 코드 분리 시 DB/맵 확장 |

본 부록은 **참고**이며, 계약과 코드가 어긋나면 **계약 개정 PR** 또는 **코드 정렬 PR**을 분리합니다.

---

## Related

- [TETHERGET_DISPUTE_AUDIT_CONTRACT.md](./TETHERGET_DISPUTE_AUDIT_CONTRACT.md) — 분쟁·증빙·중재·감사(append-only)  
- [TETHERGET_ESCROW_STATE_ALIGNMENT.md](./TETHERGET_ESCROW_STATE_ALIGNMENT.md) — escrow ↔ P2P ↔ dispute 정합  
- [PLATFORM_DEPLOYMENT_POLICY.md](./PLATFORM_DEPLOYMENT_POLICY.md) — 배포·FF·점검  
- [ESCROW_RULES.md](./ESCROW_RULES.md) — 에스크로 레이어·어댑터(정합은 alignment 문서)  
- [SECURITY_RULES.md](./SECURITY_RULES.md) — 확인 게이트  
- [MASTER_MANUAL.md](../MASTER_MANUAL.md) — UTE 타입·`ute-surface` 요지  
- `shared/p2pLifecycleMap.js`, `src/tetherget/p2pStateMachine.ts`

---

## Document history

| 단계 | 내용 |
|------|------|
| **공통 거래 기획 2단계** | 본 파일 최초 작성 — P2P 주문 상태·전이·분쟁·관리자·지연 릴리스·신뢰 예외·FF·감사·PWA·타 허브 공통화를 **계약**으로 정리(구현·실금융 없음). |
