# TetherGet — Escrow ↔ P2P State ↔ Dispute 정합 계약

**문서 성격**: [ESCROW_RULES.md](./ESCROW_RULES.md), [TETHERGET_P2P_STATE_CONTRACT.md](./TETHERGET_P2P_STATE_CONTRACT.md), [TETHERGET_DISPUTE_AUDIT_CONTRACT.md](./TETHERGET_DISPUTE_AUDIT_CONTRACT.md) 사이의 **상태·역할·감사** 정합을 한곳에 정리한 **교차 계약**입니다.

**금지**: 본 문서는 **에스크로/스마트컨트랙트 구현**, **실제 송금·환불**, **외부 결제 API**, **자동 판결**을 포함하지 않습니다.

**원칙**

| 원칙 | 설명 |
|------|------|
| **도메인 분리** | **주문(P2P MatchState)** · **에스크로 집계(EscrowLifecycle)** · **분쟁(DisputeCase)** 는 각각 자체 상태를 가짐. **혼용·단일 enum으로 합치지 않음**. |
| **자동 vs 강제** | `AUTO_RELEASE_*` / 정책 타이머 ≠ `FORCE_*` / `ADMIN_FORCE_*` — 감사 타입으로 구분. |
| **증빙 보존** | **hidden ≠ delete**; archive·legal_hold는 [분쟁 계약](./TETHERGET_DISPUTE_AUDIT_CONTRACT.md) §4. |
| **ESCROW_RULES 단독 해석 금지** | 레이어·어댑터 규칙은 ESCROW_RULES에 두되, **상태 매핑·전이**는 본 문서 + P2P/Dispute 계약이 우선. |

**코드 참조(01)**: `shared/p2pLifecycleMap.js` (`mapP2pLifecycleToEscrowStatus`, `mergeP2pLifecycleWithDispute`), `src/tetherget/p2pStateMachine.ts`.

---

## 1. Escrow 상태 ↔ P2P MatchState 매핑

### 1.1 세 도메인 요약

| 도메인 | 문서 | 식별 단위 | Normative 상태(요약) |
|--------|------|-----------|----------------------|
| **P2P 주문** | P2P State Contract | `order_id` | `CREATED` … `RELEASED` \| `DISPUTE` \| `CANCELLED` \| `EXPIRED` |
| **Escrow 집계** | ESCROW_RULES + 본 §1 | `order_id` (+ optional `onchain_escrow_id`) | `locked` \| `release_pending` \| `released` \| `disputed` \| `cancelled` |
| **분쟁** | Dispute Audit Contract | `dispute_id` | `OPEN` … `CLOSED` |

### 1.2 P2P MatchState → EscrowLifecycle (normative)

**Escrow는 파생(read model)** 입니다. P2P 상태만 직접 쓰고, escrow는 **표시·UTE·리스크 집계**용으로 계산합니다.

| P2P MatchState (계약 UPPER) | EscrowLifecycle | 비고 |
|-----------------------------|-----------------|------|
| `CREATED` | `locked` | 예치·정책 잠금 개념(모의) |
| `WAITING_PAYMENT` | `locked` | |
| `PAYMENT_SENT` | `locked` | 입금 시도 기록; 아직 릴리스 큐 아님 |
| `PAYMENT_CONFIRMED` | `locked` | 01 canonical `paid` |
| `RELEASE_PENDING` | `release_pending` | 릴리스 대기·**delayed release** 구간(§2) |
| `RELEASED` | `released` | 터미널; 온체인과 **별도** (§11) |
| `DISPUTE` (주문 표시) | `disputed` **또는** `locked`/`release_pending` | §3 — **분쟁 활성 시 escrow는 `disputed`로 승격**; 분쟁 하위 상태는 escrow enum에 넣지 않음 |
| `CANCELLED` | `cancelled` | |
| `EXPIRED` | `cancelled` | 집계 시 `cancelled` + `reason_code=expired` 권장 |

### 1.3 01 저장소 canonical (구현 참고)

| P2P canonical (`p2pLifecycle`) | Escrow canonical | DB `p2p_orders.status` (예) |
|--------------------------------|------------------|-----------------------------|
| `created` | `locked` | `listed` |
| `waiting_payment` | `locked` | `matched` |
| `paid` | `locked` | `matched` + payment started |
| `release_pending` | `release_pending` | `payment_sent` |
| `released` | `released` | `completed` |
| `dispute` | `disputed` | + 활성 분쟁 병합 |
| `cancelled` | `cancelled` | `cancelled` |

`mapP2pLifecycleToEscrowStatus`가 단일 소스로 유지되어야 합니다. 계약과 코드가 어긋나면 **본 문서 또는 맵** 중 하나를 개정 PR로 맞춥니다.

### 1.4 혼용 금지

- **금지**: `WAITING_EVIDENCE`, `REVIEWING` 등 **분쟁 상태**를 `escrow_lifecycle` 값으로 저장.
- **금지**: `escrow_lifecycle=disputed`를 “분쟁이 해결됨”으로 해석 — 해결 여부는 **DisputeCase** 터미널(`RESOLVED`/`REJECTED`/`CLOSED`)만 봄.
- **허용**: UI 배지에 “분쟁 검토 중” + “에스크로: disputed” **두 축** 동시 표시.

---

## 2. RELEASE_PENDING / delayed release 관계

| 개념 | 소속 도메인 | 설명 |
|------|-------------|------|
| **`RELEASE_PENDING`** | P2P 주문 | 릴리스 조건 충족 후 **비즈니스 큐**에 진입 |
| **`release_pending` (escrow)** | Escrow 집계 | UTE/관리자가 “해제 대기 중”으로 집계 |
| **delayed release** | 정책·감사 | `RELEASE_PENDING` **체류**; `escrow_policy` 지연 시간·리스크 홀드([ESCROW_RULES](./ESCROW_RULES.md) § Off-chain policy) |

**정책**

- delayed release 동안 **자동 릴리스 타이머**는 P2P 계약 §2.2 `AUTO_RELEASE_*`로만 종료.
- 홀드 **연장·즉시 해제**는 `ADMIN_FORCE_*` 또는 `FORCE_EXTEND_*`(분쟁 계약) — 감사 필수.
- **분쟁 활성** 시: delayed release **일시 정지** 또는 큐 보류([분쟁 계약](./TETHERGET_DISPUTE_AUDIT_CONTRACT.md) §6).

---

## 3. DISPUTE 진입 조건

### 3.1 주문 측 `DISPUTE` 표시

다음이면 주문 UI·집계에서 `DISPUTE`로 **병합 표시** 가능(`mergeP2pLifecycleWithDispute`):

- 연결된 DisputeCase가 **활성**: `OPEN` \| `REVIEWING` \| `WAITING_EVIDENCE` \| `ESCALATED`
- 주문이 이미 터미널(`RELEASED` \| `CANCELLED` \| `EXPIRED`)이 **아님**

### 3.2 Escrow 측 `disputed`

- 위와 동일 조건에서 `escrow_lifecycle` → **`disputed`** (자금·정책 잠금 “분쟁 중” 의미).
- 터미널 주문은 escrow `disputed`로 **승격하지 않음**.

### 3.3 진입 트리거(계약)

| `transition_key` (P2P) | 전제 주문 상태(예) | 분쟁 케이스 |
|------------------------|-------------------|-------------|
| `open_dispute_payment` | `PAYMENT_SENT` … | `OPEN` 생성 |
| `open_dispute_post_confirm` | `PAYMENT_CONFIRMED` … | `OPEN` |
| `open_dispute_release` | `RELEASE_PENDING` | `OPEN` |
| `open_dispute_pre_payment` | `WAITING_PAYMENT` | 운영 예외만 |

분쟁 `OPEN` 감사 이벤트와 주문 `DISPUTE` 병합은 **동일 `correlation_id`** 권장.

---

## 4. Evidence / moderation 흐름 연결

```
[Buyer/Seller] --EVIDENCE_*--> [DisputeCase timeline]
                                      |
                                      v
[Arbitrator] --arbitrate_*--> [Dispute RESOLVED/REJECTED]
                                      |
                                      v
[Order] dispute_resolve_* / dispute_resume_release
                                      |
                                      v
[Escrow read model] released | cancelled | release_pending
```

| 흐름 | Escrow | P2P 주문 | 분쟁 |
|------|--------|----------|------|
| 증빙 업로드 | 변경 없음(여전히 `disputed` 또는 hold) | `DISPUTE` 유지 | `WAITING_EVIDENCE` ↔ `REVIEWING` |
| 중재 메모 | 없음 | 없음 | `ARBITRATION_NOTE` (ops_only) |
| GameHub/StreamHub 신고 | N/A | N/A | 동일 **Report→Case** 패턴(§10) |

**Moderation**: 채널·유저 제재는 **주문 escrow enum에 매핑하지 않음**. P2P 분쟁과 **감사 스키마만** 공유.

---

## 5. FORCE_* 와 escrow 역할 분리

| 감사/전이 계열 | 영향 Escrow | 영향 P2P 주문 | 영향 분쟁 |
|----------------|-------------|---------------|-----------|
| **`AUTO_RELEASE_*`** | → `released` (파생) | `RELEASE_PENDING` → `RELEASED` | 없음(분쟁 비활성 전제) |
| **`ADMIN_FORCE_RELEASE`** (P2P) | → `released` | 강제 `RELEASED` | 선택 연동 |
| **`FORCE_RESOLVE_RELEASE`** (분쟁) | → `released` | `dispute_resolve_release` | `RESOLVED` → `CLOSED` |
| **`FORCE_RESOLVE_CANCEL`** | → `cancelled` | `dispute_resolve_cancel` | `RESOLVED` |
| **`FORCE_HIDE_EVIDENCE`** | **없음** | 없음 | 증빙 `hidden` |
| **온체인 `confirmReceipt`** (미래) | 체인 상태 | **별도 브리지** (§11) | contract roles only |

**Escrow 레이어는 “누가 돈을 옮겼는가”를 실행하지 않음** — 상태 집계와 정책 잠금 표현만.

---

## 6. Append-only audit 연결

| 스트림 | 주요 `event_type` | `order_id` | `dispute_id` | `escrow_lifecycle` 스냅샷 |
|--------|-------------------|------------|--------------|---------------------------|
| **주문** | `ORDER_STATE_CHANGED`, `AUTO_RELEASE_*`, `ADMIN_FORCE_*` | 필수 | 선택 | 권장(파생값) |
| **분쟁** | `DISPUTE_*`, `EVIDENCE_*`, `FORCE_*` | 필수 | 필수 | 선택 |
| **플랫폼 audit 탭** | API·관리자 행위 | 선택 | 선택 | 집계용 |

- 모든 스트림 **append-only**; [P2P §9](./TETHERGET_P2P_STATE_CONTRACT.md), [Dispute §7](./TETHERGET_DISPUTE_AUDIT_CONTRACT.md) 동일.
- 주문 전이 ↔ 분쟁 전이는 **`correlation_id`** 로 묶어 사후 재현.

---

## 7. Hidden / archive 정책

| 대상 | 정책 | Escrow 영향 |
|------|------|-------------|
| **증빙 파일·메타** | `hidden` \| `archived`; 삭제 금지 | 없음 |
| **분쟁 케이스 UI** | `CLOSED` 아카이브 | escrow는 `released`/`cancelled` 등 **주문 터미널**에 따름 |
| **주문 이벤트** | void는 후속 이벤트 | escrow 파생값은 **당시 스냅샷** 유지 |

---

## 8. Feature flag 연결 가능성

| 플래그(예) | P2P | Escrow read | Dispute |
|------------|-----|-------------|---------|
| `p2p_auto_release_v2` | `AUTO_RELEASE` on/off | `release_pending` 체류 패턴 | — |
| `p2p_dispute_intake_enabled` | `DISPUTE` 진입 | `disputed` 승격 | `OPEN` |
| `onchain_escrow_panel` | 메타 `onchain_escrow_id` | UI만; enum 단독 변경 금지 | — |

전이 시 **플래그 스냅샷**을 주문·분쟁 감사에 기록([PLATFORM_DEPLOYMENT_POLICY.md](./PLATFORM_DEPLOYMENT_POLICY.md) §3).

---

## 9. 모바일 / PWA escrow 상태 표시 정책

- **2축 표시**: (1) `match_state` / 사용자 문구 (2) `escrow_lifecycle` 배지 — **한 줄로 합치지 말 것**.
- **`disputed`**: “에스크로 보류(분쟁)” + 분쟁 단계(`WAITING_EVIDENCE` 등)는 **별도 줄**.
- **`release_pending` + delayed**: 남은 홀드 시간·다음 액션(구매자/판매자) — P2P 계약 §10.
- **온체인 연동 시**(§11): “앱 주문 상태” vs “체인 escrow 상태” **불일치 가능** — 서버가 `reason_code`로 설명.

---

## 10. GameHub / StreamHub moderation 공통화

| 공통 | P2P + Escrow + Dispute | Moderation |
|------|------------------------|------------|
| Case + timeline | DisputeCase | Report case |
| `FORCE_*` + audit | §5 | ban / suspend |
| hidden not delete | Evidence §7 | 콘텐츠 숨김 |
| 이중 승인 | 릴리스·분쟁 종료 | 고위 모더 |

**Escrow enum은 P2P에만** — GameHub 매치 상태를 `escrow_lifecycle`에 넣지 않음.

---

## 11. Future smart-contract boundary (구현 없음)

**경계 메모만** — 배포·구현은 본 저장소 MVP 범위 밖.

| 주제 | Off-chain (본 계약) | On-chain ([ESCROW_RULES](./ESCROW_RULES.md)) |
|------|---------------------|-----------------------------------------------|
| **상태 권위** | `p2p_orders` + 분쟁 케이스 | `EscrowContract` escrow id 상태 |
| **Release** | `RELEASED` + `AUTO_RELEASE_*` / `ADMIN_FORCE_*` 감사 | `confirmReceipt`, resolver roles |
| **Dispute** | DisputeCase lifecycle | `disputeResolver` / `superAdmin` only |
| **브리지** | `metadata_json.onchain_escrow_id` | `onchainP2pBridge.js` 순서: **mark-paid ≠ chain release** |
| **불일치** | UI는 양쪽 표시 + “동기화 대기” | 인덱서(`escrowIndexer`) 관측만 |

**규칙**: UI에서 결제 확인만으로 **on-chain release를 암시하지 않음**. 체인 authoritative일 때 앱 역할은 **관측·상관·게이트**뿐.

---

## 문서 계층 (읽는 순서)

1. [ESCROW_RULES.md](./ESCROW_RULES.md) — 레이어·어댑터·mock·on-chain **참조**  
2. [TETHERGET_P2P_STATE_CONTRACT.md](./TETHERGET_P2P_STATE_CONTRACT.md) — 주문 MatchState  
3. [TETHERGET_DISPUTE_AUDIT_CONTRACT.md](./TETHERGET_DISPUTE_AUDIT_CONTRACT.md) — 분쟁·증빙·감사  
4. **본 문서** — 위 셋의 **매핑·금지·감사 연결**

---

## Related

- [SECURITY_RULES.md](./SECURITY_RULES.md)  
- [ADMIN_RULES.md](./ADMIN_RULES.md)  
- [WALLET_STRUCTURE.md](./WALLET_STRUCTURE.md)  
- [MASTER_MANUAL.md](../MASTER_MANUAL.md)

---

## Document history

| 단계 | 내용 |
|------|------|
| **기획 4단계** | 본 파일 최초 작성 — Escrow ↔ P2P ↔ Dispute 정합(구현·실금융·자동 판결 없음). |
