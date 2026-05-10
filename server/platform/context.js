/**
 * 단일 통합 플랫폼으로 합칠 때를 대비한 배포 단위 식별자.
 * 여러 레포/서비스가 동일 패턴으로 환경 변수만 바꿔 재사용할 수 있게 한다.
 */
export const PLATFORM_CODE = String(process.env.PLATFORM_CODE || "tetherget").trim() || "tetherget";

/** 제품 라인: p2p | exchange | card 등 — 로그/주문 메타에 포함 */
export const SERVICE_LINE = String(process.env.SERVICE_LINE || "p2p").trim() || "p2p";

/** 감사 로그 payload에 통합 메타데이터 병합 (JSON 내부) */
export function mergeAuditPayload(payload) {
  const base = payload && typeof payload === "object" && !Array.isArray(payload) ? { ...payload } : {};
  return {
    ...base,
    _platform: PLATFORM_CODE,
    _line: SERVICE_LINE,
  };
}

/** 도메인 이벤트(p2p_order_events 등) detail_json 병합 */
export function mergeDomainPayload(detail) {
  const base = detail && typeof detail === "object" && !Array.isArray(detail) ? { ...detail } : {};
  return {
    ...base,
    _platform: PLATFORM_CODE,
    _line: SERVICE_LINE,
  };
}
