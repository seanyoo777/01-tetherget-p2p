# Release Checklist (Deployment Gate)

이 문서는 배포 전 필수 점검 기준입니다.  
아래 항목 중 하나라도 FAIL이면 배포를 중단합니다.

## 0) Core Rule

- One FAIL => **NO DEPLOY**
- 수정 후 동일 순서로 처음부터 재검증
- 임시 우회 배포 금지

## 1) Automated Checks

한 번에 실행: `npm run release:check` (서버 문법 + 아래 1.1 + 1.2와 동일).

### 1.0 Server syntax

- Command: `npm run syntax:server` (`node --check server/index.js`)
- PASS: 문법 오류 0건

### 1.1 Build

- Command: `npm run build`
- PASS: build 에러 0건
- FAIL 조건:
  - 번들 실패
  - 타입/문법 에러
  - 빌드 산출물 생성 실패

### 1.2 Admin Smoke

- Command: `npm run verify:admin-smoke`
- PASS: 모든 시나리오 PASS
- FAIL 조건:
  - stage/downline/referral tree 검증 중 1건 이상 실패

## 2) Admin Manual QA (10 minutes)

## 2.1 Catalog Save / Conflict

- 마켓 카탈로그 저장 정상 동작
- 동시 수정 충돌 시 revision conflict 안내 확인
- 충돌 후 최신 데이터 재조회 동작 확인

## 2.2 Audit History

- 이력 조회: 작업자/키워드/기간 필터 동작
- 페이지네이션(더보기) 정상 동작
- CSV 내보내기 동작

## 2.3 Chain Integrity

- 무결성 검증 버튼 정상 동작
- root hash 생성 확인
- chain proof 저장(서버 hash 이력) 확인
- chain compare 상태 변경 감지 확인

## 2.4 Chain Alert Monitoring

- CHAIN ALERT 배지 표시 확인
- CHAIN ALERT만 필터 정상 동작
- 미확인 경보 카운트 증가/확인처리 동작
- webhook 이벤트에서 `market_catalog_audit_chain_changed` 강조 배지 확인

## 3) Security / Data Safety Gate

- 관리자 권한 우회 재현 0건
- 민감 정보 노출(로그/응답) 0건
- 데이터 손실/덮어쓰기 0건

## 4) Operations Gate

- webhook 전송 이력 확인 가능
- 장애/경보 추적 가능
- 스냅샷/롤백 화면 정상 동작

## 5) Final Decision

- ALL PASS => commit/push/deploy 허용
- ANY FAIL => 배포 금지, 수정 후 재검증

## 6) Quick Run Command

```bash
npm run release:check
```

Equivalent to `npm run syntax:server && npm run build && npm run verify:admin-smoke`.

## 7) Release Record Template

- Date:
- Branch / Commit:
- Build: PASS/FAIL
- Admin Smoke: PASS/FAIL
- Manual QA: PASS/FAIL
- Security Gate: PASS/FAIL
- Operations Gate: PASS/FAIL
- Final: DEPLOY / NO DEPLOY
- Notes:
