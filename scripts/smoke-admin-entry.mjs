/**
 * Requires: npm run dev (Vite on 5173 for 01-P2P). Local seed login (no API).
 * Usage: npm run smoke:admin
 */
import { chromium } from "playwright";

const BASE = process.env.BASE_URL || "http://127.0.0.1:5173";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1400, height: 900 });

  try {
    await page.goto(BASE, { waitUntil: "networkidle", timeout: 60_000 });
    await page.waitForSelector('[data-app="tetherget-p2p"]', { timeout: 30_000 });
  } catch (e) {
    console.error(`FAIL: ${BASE} 에 연결할 수 없습니다. 먼저 \`npm run dev\` 를 실행하세요.\n`, e.message);
    await browser.close();
    process.exit(1);
  }

  const title = await page.title();
  const appAttr = await page.locator('[data-app="tetherget-p2p"]').count();
  if (/oneai/i.test(title) || title.includes("Investment intelligence")) {
    console.error(
      `FAIL: 03-OneAI 앱이 열렸습니다 (title="${title}"). 01-TetherGet-P2P 폴더에서 npm run dev → http://localhost:5173 을 사용하세요.`
    );
    await browser.close();
    process.exit(1);
  }
  if (appAttr < 1 && !/tetherget\s*p2p/i.test(title)) {
    console.error(
      `FAIL: 01-TetherGet-P2P 앱이 아닙니다 (title="${title}", data-app 마커 없음). npm run dev(5173) 또는 BASE_URL을 확인하세요.`
    );
    await browser.close();
    process.exit(1);
  }

  await page.getByRole("button", { name: "로그인" }).first().click();
  await page.waitForSelector('input[autocomplete="username"]', { timeout: 15_000 });
  await page.fill('input[autocomplete="username"]', "admin@tetherget.local");
  await page.fill('input[autocomplete="current-password"]', "admin1234");
  await page.locator("button.w-full").filter({ hasText: /^로그인$/ }).click();

  await page.getByRole("button", { name: "로그아웃" }).first().waitFor({ state: "visible", timeout: 15_000 });
  await page.getByRole("navigation").getByRole("button", { name: "관리자" }).click();

  const ok = await page
    .getByText("회원관리", { exact: false })
    .first()
    .waitFor({ state: "visible", timeout: 20_000 })
    .then(() => true)
    .catch(() => false);

  if (!ok) {
    const denied = await page.getByText("관리자 화면을 열 수 없습니다").isVisible().catch(() => false);
    console.error(denied ? "FAIL: 관리자 권한 없음 화면(차단)." : "FAIL: 관리자 패널(회원관리) 미표시.");
    await browser.close();
    process.exit(1);
  }

  console.log("OK: 관리자 화면 진입(회원관리 노출) 확인.");
  await browser.close();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
