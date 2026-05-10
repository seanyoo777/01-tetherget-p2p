/**
 * 프론트 전용 목업 알림 (API 없이 UI/UX·관리자 흐름 점검용)
 * 이후 /api/... 연동 시 동일 shape 으로 치환 가능
 */

export const MOCK_USER_NOTIFICATIONS = [
  {
    id: "u1",
    title: "P2P 매칭 알림",
    body: "매칭된 주문의 송금 마감 시간을 확인하세요.",
    at: "방금 전",
    tone: "info",
  },
  {
    id: "u2",
    title: "출금 신청 접수",
    body: "출금 요청이 대기열에 들어갔습니다.",
    at: "1시간 전",
    tone: "neutral",
  },
  {
    id: "u3",
    title: "KYC 심사 상태",
    body: "제출 서류 검토가 진행 중입니다.",
    at: "어제",
    tone: "warn",
  },
];

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
