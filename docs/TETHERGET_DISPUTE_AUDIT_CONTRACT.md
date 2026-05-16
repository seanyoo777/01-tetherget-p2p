# TetherGet P2P — 분쟁(Dispute)·중재·감사(Audit) 계약

**문서 성격**: P2P **분쟁 케이스**와 **증빙·중재·감사 이벤트**에 대한 **append-only 계약**입니다.  
**금지**: 본 문서는 **법률 판단**, **실제 송금·환불**, **스마트컨트랙트 실행**, **외부 결제 API**, **자동 판결(무인 최종 결정)** 구현을 포함하지 않습니다.

**상위 계약**: 주문(Order) 상태·`DISPUTE` 진입·해제는 [TETHERGET_P2P_STATE_CONTRACT.md](./TETHERGET_P2P_STATE_CONTRACT.md)와 정합합니다. 본 문서는 **분쟁 도메인**과 **감사 스트림**을 규정합니다.

**저장소 01 참고**: `shared/p2pLifecycleMap.js` (`DISPUTE_LIFECYCLE`), `src/tetherget/p2pStateMachine.ts` (`canTransitionDisputeLifecycle`), 관리자 **`DisputePanel`**, 플랫폼 감사 **`audit`** 탭 — 구현은 모의·게이트 수준이며 본 계약의 normative 표기(UPPER_SNAKE)와 1:1이 아닐 수 있습니다.

---

## 1. Dispute 상태 (State)

**분쟁 케이스(DisputeCase)** 단위의 normative 상태입니다. 한 주문에 대해 활성 케이스는 **동시에 1건**을 권장(1:N 허용 시 `is_primary` 플래그로 UI·집계 우선순위 명시).

| State | 의미(요약) | 터미널 |
|-------|------------|--------|
| **OPEN** | 분쟁 접수; 당사자·시스템이 케이스 생성 | 아니오 |
| **REVIEWING** | 운영·중재자가 사실관계·정책을 검토 중 | 아니오 |
| **WAITING_EVIDENCE** | 추가 증빙·응답 기한 대기(당사자 또는 운영 요청) | 아니오 |
| **RESOLVED** | 중재 결과 확정(주문 쪽 `RELEASED` 또는 `CANCELLED` 등으로 매핑 예정) | **예**(분쟁 도메인) |
| **REJECTED** | 접수 거절·부적격(사유 코드 필수) | **예** |
| **ESCALATED** | 2차 승인·법무·고위 운영 큐로 상향 | 아니오 |
| **CLOSED** | 감사·아카이브용 종료(재오픈은 **신규 케이스** 또는 `FORCE_REOPEN` 감사 이벤트) | **예** |

**주문 연동**: 활성 분쟁(`OPEN` \| `REVIEWING` \| `WAITING_EVIDENCE` \| `ESCALATED`)이 있으면 주문 표시는 [P2P 계약](./TETHERGET_P2P_STATE_CONTRACT.md)의 **`DISPUTE`** 우선으로 병합할 수 있습니다.

---

## 2. Dispute 상태 전이 규칙

### 2.1 허용 엣지(요약)

역할·증빙·감사 게이트를 통과한 경우에만 허용합니다. **자동 판결 금지**: `RESOLVED` \| `REJECTED` \| `CLOSED`로의 전이는 **반드시 인간 중재자 또는 이중 승인된 운영 행위**에 의존합니다(시스템은 **리마인더·SLA 알림**만 가능).

| From → To | `transition_key` | 주된 액터 |
|-----------|------------------|------------|
| OPEN → REVIEWING | `assign_reviewer` | 운영·중재자 |
| OPEN → WAITING_EVIDENCE | `request_evidence` | 운영·중재자 |
| OPEN → REJECTED | `reject_intake` | 운영 |
| OPEN → ESCALATED | `escalate_tier1` | 운영 |
| REVIEWING → WAITING_EVIDENCE | `request_more_evidence` | 중재자 |
| REVIEWING → RESOLVED | `arbitrate_resolve` | 중재자(이중 승인 권장) |
| REVIEWING → REJECTED | `arbitrate_reject` | 중재자 |
| REVIEWING → ESCALATED | `escalate_tier2` | 중재자 |
| WAITING_EVIDENCE → REVIEWING | `evidence_submitted` | 당사자·시스템(접수만) |
| WAITING_EVIDENCE → REJECTED | `evidence_timeout_reject` | 정책·운영(사유 코드) |
| ESCALATED → REVIEWING | `deescalate_to_review` | 고위 운영 |
| ESCALATED → RESOLVED | `escalated_resolve` | 고위 중재(이중 승인 권장) |
| RESOLVED → CLOSED | `archive_resolved` | 시스템·운영 |
| REJECTED → CLOSED | `archive_rejected` | 시스템·운영 |

**금지**: 터미널(`RESOLVED` \| `REJECTED` \| `CLOSED`)에서 **무변경 역전이**; 오류 보정은 **후속 감사 이벤트** + `FORCE_*`(§11)만.

### 2.2 주문(Order)과의 연동 전이

| 분쟁 결과 | 주문 `transition_key` (P2P 계약) |
|-----------|--------------------------------|
| `arbitrate_resolve` → 릴리스 방향 | `dispute_resolve_release` |
| `arbitrate_resolve` → 취소·환불 방향(모의) | `dispute_resolve_cancel` |
| 분쟁 해제 후 릴리스 큐 복귀 | `dispute_resume_release` |

주문 전이는 **분쟁 감사 이벤트 ID**를 `correlation_id`로 참조합니다.

---

## 3. Buyer / Seller 증빙 흐름

### 3.1 개시

- **Buyer** 또는 **Seller**가 분쟁 개시 요청 → 케이스 `OPEN` + 감사 `DISPUTE_OPENED`.
- 개시 시 **주문 스냅샷**(상태·금액·결제수단 메타)을 감사에 동봉.

### 3.2 제출·응답

| 단계 | Buyer | Seller |
|------|-------|--------|
| 초기 서술 | `EVIDENCE_STATEMENT` (텍스트·체크리스트) | 동일 |
| 파일·이미지 | `EVIDENCE_UPLOAD` | 동일 |
| 운영 추가 요청 | `WAITING_EVIDENCE` 상태에서 **기한 내** 응답 | 동일 |
| 반박 | `EVIDENCE_REBUTTAL` (선택) | 동일 |

**원칙**: 당사자는 **자기 제출분만** 수정 요청 가능; “수정”은 **새 evidence 버전**으로 append(§4).

### 3.3 운영 가시성

- 중재자는 **양측 제출 타임라인**을 시간순으로 조회; PII는 역할·정책에 따라 마스킹.

---

## 4. Evidence 메타 정책

증빙 본문(파일)과 **메타**를 분리합니다.

| 필드(권장) | 설명 |
|------------|------|
| `evidence_id` | 불변 식별자 |
| `dispute_id` / `order_id` | 연결 |
| `submitter_type` | `buyer` \| `seller` \| `admin` \| `system` |
| `submitter_id` | 계정 ID |
| `kind` | `statement` \| `image` \| `document` \| `audio` \| `link` \| `admin_note` |
| `content_hash` | 무결성·중복 검사 |
| `mime_type` / `byte_size` | 저장 정책 |
| `visibility` | `parties` \| `ops_only` \| `legal_hold` |
| `status` | `active` \| `hidden` \| `archived` |
| `supersedes_evidence_id` | 정정 시 이전 ID 참조 |
| `utc_created_at` | 생성 시각 |

**삭제 금지(계약)**: 물리 삭제 대신 **`hidden`** 또는 **`archived`** + 사유 코드. 법무 보존은 `legal_hold`.

**자동 판결 금지**: 증빙 개수·키워드만으로 `RESOLVED`로 전이하는 규칙은 **허용하지 않음**(리스크 플래그·큐 우선순위만 가능).

---

## 5. 관리자 / 중재자 역할

| 역할 | 권한(계약) |
|------|------------|
| **Operator** | 접수·`REVIEWING` 배정·`WAITING_EVIDENCE` 요청·`REJECTED`(접수 거절) |
| **Arbitrator** | `RESOLVED` / `REJECTED`(사안 판단)·주문 연동 전이 요청 |
| **Senior / Legal** | `ESCALATED` 처리·`FORCE_*` |
| **Auditor (read-only)** | 감사 스트림·타임라인 무결성 검증; 상태 변경 없음 |

**이중 승인(권장)**: `RESOLVED`, `FORCE_RELEASE`, `FORCE_CANCEL`, `FORCE_CLOSE`는 **maker-checker** 또는 PIN/OTP 확인(모의 UI는 [ADMIN_RULES.md](./ADMIN_RULES.md) 참고).

**중재 vs 감사(audit 탭)**:  
- **분쟁 감사**: 케이스·증빙·전이 이벤트(본 문서).  
- **플랫폼 감사(`audit` 탭)**: API·관리자 행위·P2P 주문 모니터 등 **횡단 로그** — 분쟁 이벤트는 **동일 append-only 원칙**으로 수집 가능.

---

## 6. Delayed release와의 관계

- 주문이 **`RELEASE_PENDING`**(P2P 계약)인 동안 분쟁이 열리면 **자동 릴리스 타이머 일시 정지** 또는 **큐 보류**를 정책으로 정의합니다.
- 분쟁 `RESOLVED`(릴리스 방향) 후: `dispute_resume_release` 또는 `dispute_resolve_release`로 주문 종료 — **자동 릴리스**와 **관리자 FORCE 릴리스**는 P2P 계약 §2.2와 동일하게 감사 타입 분리.
- 분쟁 `RESOLVED`(취소 방향): 주문 `CANCELLED` 매핑; **실제 환불 구현 없음**(모의·내부 원장만).

---

## 7. Append-only audit 정책

### 7.1 원칙

- 모든 분쟁·증빙·전이·중재 메모는 **append-only** 스트림에 기록.
- **삭제·덮어쓰기 금지**; 정정은 `CORRECTION` 또는 `VOID_PREVIOUS` **후속 이벤트**.

### 7.2 이벤트 타입(권장, 비한목)

| 타입 | 설명 |
|------|------|
| `DISPUTE_OPENED` | 케이스 생성 |
| `DISPUTE_STATE_CHANGED` | §2 전이 |
| `EVIDENCE_ADDED` / `EVIDENCE_HIDDEN` | 증빙 |
| `ARBITRATION_NOTE` | 중재자 메모(ops_only 가능) |
| `ORDER_LINKED_TRANSITION` | 주문 전이 연동 |
| `FORCE_*` | §11 |
| `TIMELINE_INTEGRITY_CHECK` | CSV/export·해시 검증(모의) |

### 7.3 최소 필드

`event_id`, `dispute_id`, `order_id`, `event_type`, `from_dispute_state`, `to_dispute_state`, `transition_key`, `actor_type`, `actor_id`, `policy_version`, `feature_flags_snapshot`, `utc_timestamp`, `correlation_id`, `payload_ref`(증빙 ID 등).

### 7.4 무결성

- 타임라인 **해시 체인** 또는 export 시 **서명된 스냅샷**(구현 선택) — `DisputePanel`의 무결성 검증 UX와 정합 가능.

---

## 8. Feature flag 정책

| 플래그 예시 | 효과 |
|-------------|------|
| `p2p_dispute_intake_enabled` | 당사자 분쟁 개시 UI/API |
| `p2p_dispute_escalation_tier2` | `ESCALATED` 큐 사용 |
| `p2p_evidence_upload_v2` | 새 MIME·용량 정책 |

- **활성 분쟁**에 대해 플래그 OFF는 **신규 전이만** 차단; 이미 `REVIEWING`인 케이스는 **드레인** 정책 문서화.
- 전이 시점 **플래그 스냅샷**을 감사에 저장([PLATFORM_DEPLOYMENT_POLICY.md](./PLATFORM_DEPLOYMENT_POLICY.md) §3).

---

## 9. 모바일 / PWA dispute 표시 정책

- **단일 소스**: `dispute_state` + `reason_code` + `next_action_for_role`을 서버가 내려줌.
- **WAITING_EVIDENCE**: 제출 **마감 시각**·필수 항목 체크리스트 표시.
- **민감 정보**: 썸네일·계좌번호 등은 **마스킹**; 전체 보기는 앱 내 확인 절차 후.
- **오프라인**: 마지막 동기화 상태 + “제출 대기 중” 배지; **터미널 결과**는 서버 확정 전까지 낙관 표시 금지.
- **푸시(향후)**: `WAITING_EVIDENCE` 기한·`REVIEWING` 상태 변경만(구현 없음).

---

## 10. GameHub / StreamHub moderation과 공통화

| 공통 패턴 | P2P 분쟁 | GameHub / StreamHub moderation |
|-----------|-----------|--------------------------------|
| **Report → Case** | 주문 분쟁 케이스 | 플레이어/채널 신고 케이스 |
| **OPEN → REVIEWING** | `assign_reviewer` | 모더 배정 |
| **WAITING_EVIDENCE** | 증빙 요청 | 클립·로그 추가 요청 |
| **ESCALATED** | 고위 운영 | 시니어 모더 / 법무 |
| **append-only timeline** | §7 | 동일 |
| **hidden, not delete** | §4 | 동일 |
| **FORCE_*** | §11 | 밴·강제 종료·복구 |

**차이**: P2P는 **주문·delayed release**와 결합; GameHub는 **세션·매치**와 결합. **감사 스키마·actor_type·transition_key** 네이밍만 공통 레이어로 통일하면 크로스 대시보드·UTE 집계에 유리합니다.

---

## 11. 강제 FORCE_* 정책

**모든 `FORCE_*`는 감사 필수**; 가능하면 이중 승인·티켓 ID.

| `transition_key` | 의미 | 주문 영향(예) |
|------------------|------|----------------|
| `FORCE_CLOSE_DISPUTE` | 분쟁 `CLOSED`(아카이브) | 없음 또는 `CLOSED`만 |
| `FORCE_REOPEN_DISPUTE` | 터미널 케이스 재개(예외) | 주문 `DISPUTE` 재병합 |
| `FORCE_RESOLVE_RELEASE` | 중재 없이 릴리스 방향 종료(고위만) | `dispute_resolve_release` |
| `FORCE_RESOLVE_CANCEL` | 강제 취소 방향 | `dispute_resolve_cancel` |
| `FORCE_HIDE_EVIDENCE` | 증빙 `hidden` | 없음 |
| `FORCE_EXTEND_EVIDENCE_TTL` | 기한 연장 | 없음 |

**자동 판결과의 구분**: `FORCE_*`는 **명시적 운영 행위**; 스케줄러·룰 엔진이 `RESOLVED`로 보내는 것은 **계약 위반**.

---

## 부록 A — 01 저장소 canonical 매핑 (참고)

| 본 계약 (UPPER) | 01 `DisputeLifecycle` / DB | 비고 |
|-----------------|----------------------------|------|
| OPEN | `open` | DB `분쟁접수` 등 |
| REVIEWING | `reviewing` | `승인대기`, `최종승인대기` |
| WAITING_EVIDENCE | *(확장 권장)* | 별도 컬럼·서브상태 |
| RESOLVED | `resolved` | `반환완료` 등 |
| REJECTED | `rejected` | 거절 문자열 |
| ESCALATED | *(확장 권장)* | tier·큐 ID |
| CLOSED | *(아카이브)* | UI 터미널·보존 |

코드 정렬은 **계약 개정 PR** 또는 **맵 확장 PR**로 분리합니다.

---

## Related

- [TETHERGET_P2P_STATE_CONTRACT.md](./TETHERGET_P2P_STATE_CONTRACT.md) — 주문 상태·`DISPUTE`·delayed release  
- [TETHERGET_ESCROW_STATE_ALIGNMENT.md](./TETHERGET_ESCROW_STATE_ALIGNMENT.md) — escrow ↔ P2P ↔ dispute 정합  
- [PLATFORM_DEPLOYMENT_POLICY.md](./PLATFORM_DEPLOYMENT_POLICY.md) — FF·배포  
- [ESCROW_RULES.md](./ESCROW_RULES.md) — 에스크로 레이어·on-chain 경계  
- [SECURITY_RULES.md](./SECURITY_RULES.md) — 확인 게이트  
- [ADMIN_RULES.md](./ADMIN_RULES.md) — 관리자 분쟁 탭  
- `shared/p2pLifecycleMap.js`, `src/tetherget/p2pStateMachine.ts`

---

## Document history

| 단계 | 내용 |
|------|------|
| **공통 거래 기획 3단계** | 본 파일 최초 작성 — 분쟁 상태·전이·증뢰·중재·감사·FF·PWA·moderation 공통화·`FORCE_*`(구현·자동 판결·실금융 없음). |
