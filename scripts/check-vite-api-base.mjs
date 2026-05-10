import { viteApiBaseIsInvalidForBuild } from "../src/lib/resolveApiBase.js";

const v = process.env.VITE_API_BASE;
if (viteApiBaseIsInvalidForBuild(v)) {
  console.error("");
  console.error("[build stopped] VITE_API_BASE is invalid — it causes requests like https://./ (ERR_NAME_NOT_RESOLVED).");
  console.error("Current value:", JSON.stringify(v));
  console.error("Fix: leave it unset for same-origin /api, or set a full URL like https://api.example.com");
  console.error("");
  console.error("[빌드 중단] VITE_API_BASE 가 잘못되어 https://./ 요청(ERR_NAME_NOT_RESOLVED)을 만듭니다.");
  console.error("해결: 같은 사이트 API면 변수를 비우고, 외부 API면 https://실제주소 로 설정하세요.");
  console.error("");
  process.exit(1);
}
