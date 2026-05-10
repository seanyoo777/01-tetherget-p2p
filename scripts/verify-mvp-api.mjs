/**
 * 로컬에서 프론트가 바라보는 Origin에 이 레포 API(server/index.js)가 떠 있는지 확인합니다.
 * 다른 프로세스(예: tetherget-backend)가 같은 포트를 쓰면 /api/health 의 service 로 구분합니다.
 *
 * 사용:
 *   npm run verify:api-origin
 *   npm run verify:api-origin:wait   # API 기동 대기(최대 ~60초)
 * - 우선순위: 환경변수 VITE_API_BASE → 프로젝트 루트 .env 의 VITE_API_BASE → 기본 http://localhost:4000
 */

import fs from "node:fs";
import path from "node:path";

function trimBase(raw) {
  const s = typeof raw === "string" ? raw.trim().replace(/\/+$/, "") : "";
  return s || "http://localhost:4000";
}

/** dotenv 패키지 없이 프로젝트 루트 .env 에서 키 읽기 */
function readDotEnvKeys(cwd) {
  const p = path.join(cwd, ".env");
  if (!fs.existsSync(p)) return {};
  const out = {};
  const raw = fs.readFileSync(p, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"'))
      || (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

/**
 * @returns {"ok" | "wrong_service" | "legacy" | "bad_response" | "network"}
 */
async function probeOnce(base) {
  const url = `${trimBase(base)}/api/health`;
  let res;
  try {
    res = await fetch(url, { method: "GET" });
  } catch {
    return "network";
  }

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return "bad_response";
  }

  if (!data?.ok) return "bad_response";

  const svc = data.service;
  if (svc === "tetherget-mvp-api") return "ok";
  if (svc) return "wrong_service";
  return "legacy";
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const cwd = process.cwd();
const fileEnv = readDotEnvKeys(cwd);
const base = trimBase(process.env.VITE_API_BASE || fileEnv.VITE_API_BASE);
const waitMode = process.argv.includes("--wait");

async function main() {
  const maxAttempts = waitMode ? 60 : 1;
  const intervalMs = 1000;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const result = await probeOnce(base);

    if (result === "ok") {
      console.log(`[verify-mvp-api] OK — ${base} 는 tetherget-mvp-api 입니다.`);
      if (!process.env.VITE_API_BASE && fileEnv.VITE_API_BASE) {
        console.log(`[verify-mvp-api] (프로젝트 .env 의 VITE_API_BASE 사용)`);
      }
      process.exit(0);
    }

    if (result === "wrong_service") {
      console.error(`[verify-mvp-api] 잘못된 API 서비스입니다. (기대: tetherget-mvp-api)`);
      console.error(`요청: ${trimBase(base)}/api/health`);
      console.error("다른 백엔드가 이 포트를 쓰고 있을 수 있습니다. 프로세스/PORT 를 확인하세요.");
      process.exit(1);
    }

    if (result === "bad_response") {
      console.error(`[verify-mvp-api] JSON 이 아니거나 ok:true 가 아닙니다.`);
      console.error(`URL: ${trimBase(base)}/api/health`);
      process.exit(1);
    }

    if (result === "legacy") {
      console.warn(`[verify-mvp-api] 경고: /api/health 에 service 필드가 없습니다. (구버전 API일 수 있음)`);
      console.warn(`URL: ${trimBase(base)}/api/health`);
      process.exit(0);
    }

    // network — 재시도
    if (waitMode && attempt === 0) {
      console.log(`[verify-mvp-api] API 대기 중… ${base} (${maxAttempts}s)`);
    }
    if (waitMode && attempt < maxAttempts - 1) {
      await sleep(intervalMs);
      continue;
    }

    console.error(`[verify-mvp-api] 연결 실패: ${trimBase(base)}/api/health`);
    console.error("API를 먼저 띄우세요: npm run dev:api  (또는 npm run verify:api-origin:wait 로 기동 후 재시도)");
    process.exit(1);
  }
}

main();
