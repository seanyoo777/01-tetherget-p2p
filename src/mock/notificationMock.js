/**
 * 프론트 전용 목업 알림 (API 없이 UI/UX 점검용)
 * 이후 /api/notifications 등 연동 시 동일 shape 으로 치환 가능
 *
 * MOCK_TRADE_PUSH_NOTIFICATIONS — 거래푸시 (헤더 거래푸시 버튼)
 * MOCK_GENERAL_ALERT_NOTIFICATIONS — 일반 알림 (헤더 알림 버튼)
 * MOCK_USER_NOTIFICATIONS — 호환용 전체 합본 (기존 ID 유지)
 */

/** 거래·정산·입금 등 거래 라인 알림 */
export const MOCK_TRADE_PUSH_NOTIFICATIONS = [
  {
    id: "nc3",
    kind: "trade_request",
    typeLabel: "거래 요청",
    requestKind: "거래 요청",
    tradeRef: "#TG-2048",
    title: "USDT 매수 요청",
    body: "상대방이 거래를 요청했습니다. 제한 시간 내 응답하세요.",
    at: "5분 전",
    target: "mytrades",
  },
  {
    id: "tp_appr",
    kind: "approval_request",
    typeLabel: "승인",
    requestKind: "승인 요청",
    tradeRef: "#TG-1992",
    title: "거래 승인 대기",
    body: "상대방 승인 후 다음 단계로 진행됩니다.",
    at: "12분 전",
    target: "mytrades",
  },
  {
    id: "nc4",
    kind: "trade_status",
    typeLabel: "거래 상태",
    requestKind: "코인 릴리즈 대기",
    tradeRef: "#TG-1982",
    title: "주문 단계 이동",
    body: "릴리즈 조건을 확인해 주세요.",
    at: "32분 전",
    target: "mytrades",
  },
  {
    id: "nc5",
    kind: "deposit_confirm",
    typeLabel: "입금 확인",
    requestKind: "입금 확인 요청",
    tradeRef: "#TG-1755",
    title: "입금 증빙 검토",
    body: "구매자 입금 확인을 진행해 주세요.",
    at: "1시간 전",
    target: "mytrades",
  },
  {
    id: "tp_rel",
    kind: "release_request",
    typeLabel: "릴리즈",
    requestKind: "코인 릴리즈 요청",
    tradeRef: "#TG-1710",
    title: "릴리즈 승인 요청",
    body: "조건 충족 시 릴리즈 가능합니다.",
    at: "2시간 전",
    target: "mytrades",
  },
  {
    id: "nc7",
    kind: "dispute",
    typeLabel: "분쟁",
    requestKind: "분쟁 발생",
    tradeRef: "#TG-1600",
    title: "분쟁 처리 안내",
    body: "신청 건에 새 코멘트가 등록되었습니다.",
    at: "어제",
    target: "admin",
  },
  {
    id: "tp_settle",
    kind: "settlement_request",
    typeLabel: "정산",
    requestKind: "정산 요청",
    tradeRef: "#TG-1588",
    title: "정산 검토 요청",
    body: "정산 금액 확인이 필요합니다.",
    at: "어제",
    target: "mytrades",
  },
  {
    id: "nc9",
    kind: "trade_status",
    typeLabel: "거래 상태",
    requestKind: "거래 완료",
    tradeRef: "#TG-1401",
    title: "거래 완료",
    body: "최근 주문이 정상 종료되었습니다.",
    at: "2일 전",
    target: "mytrades",
  },
];

/** 메시지·공지·시스템·보안·등급 등 일반 알림 */
export const MOCK_GENERAL_ALERT_NOTIFICATIONS = [
  {
    id: "nc1",
    kind: "message",
    typeLabel: "메시지",
    title: "새 대화",
    body: "코인헌터님이 메시지를 보냈습니다.",
    at: "2분 전",
    target: "messenger",
  },
  {
    id: "nc2",
    kind: "message",
    typeLabel: "메시지",
    title: "읽지 않은 쪽지",
    body: "거래 파트너와의 대화를 확인하세요.",
    at: "15분 전",
    target: "messenger",
  },
  {
    id: "nc6",
    kind: "admin_notice",
    typeLabel: "공지",
    title: "플랫폼 운영 공지",
    body: "P2P 수수료 및 이용 안내가 업데이트되었습니다.",
    at: "3시간 전",
    target: "support",
  },
  {
    id: "ga_sys",
    kind: "system",
    typeLabel: "시스템",
    title: "점검 안내",
    body: "일부 기능이 제한될 수 있습니다.",
    at: "5시간 전",
    target: "support",
  },
  {
    id: "nc8",
    kind: "security",
    typeLabel: "보안",
    title: "계정 활동 알림",
    body: "미확인 로그인 시도가 감지되었습니다.",
    at: "어제",
    target: "myinfo",
  },
  {
    id: "ga_grade",
    kind: "grade_notice",
    typeLabel: "등급",
    title: "회원 등급 안내",
    body: "거래 실적에 따라 등급이 조정되었습니다.",
    at: "3일 전",
    target: "myinfo",
  },
];

/** @deprecated 분류 전 통합 목록 — MOCK_GENERAL + MOCK_TRADE 와 동일 ID 세트 유지 */
export const MOCK_USER_NOTIFICATIONS = [...MOCK_GENERAL_ALERT_NOTIFICATIONS, ...MOCK_TRADE_PUSH_NOTIFICATIONS];

export const MOCK_ADMIN_BRIEFS = [
  {
    id: "ad1",
    title: "출금 대기 요약",
    body: "승인 대기 출금 건을 검토하세요. (목업)",
    at: "09:30",
    tone: "warn",
  },
  {
    id: "ad2",
    title: "분쟁 접수",
    body: "신규 분쟁 접수가 있습니다. (목업)",
    at: "08:10",
    tone: "info",
  },
  {
    id: "ad3",
    title: "시스템",
    body: "정기 점검 일정은 플랫폼 로그에서 확인하세요. (목업)",
    at: "전일",
    tone: "neutral",
  },
];
