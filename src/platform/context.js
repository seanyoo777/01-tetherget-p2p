const viteEnv = typeof import.meta !== "undefined" && import.meta.env ? import.meta.env : {};

/** 프론트 빌드 단위 — API `X-Platform-Code` 와 맞추면 통합 대시보드에서 구분 가능 */
export const PLATFORM_CODE = String(viteEnv.VITE_PLATFORM_CODE || "tetherget").trim() || "tetherget";

export const SERVICE_LINE = String(viteEnv.VITE_SERVICE_LINE || "p2p").trim() || "p2p";
