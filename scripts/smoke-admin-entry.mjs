/**
 * Requires: npm run dev (Vite on 5173). Local seed login (no API).
 * Usage: npm run smoke:admin
 */
import { chromium } from "playwright";

const BASE = process.env.BASE_URL || "http://127.0.0.1:5173";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1400, height: 900 });

  try {
    await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 30_000 });
  } catch (e) {
    console.error(`FAIL: ${BASE} 에 연결할 수 없습니다. 먼저 \`npm run dev\` 를 실행하세요.\n`, e.message);
    await browser.close();
    process.exit(1);
  }

  const title = await page.title();
  if (!/tetherget-mvp/i.test(title)) {
    console.error(
      `FAIL: 이 주소는 tetherget-mvp 앱이 아닙니다 (document.title="${title}"). 5173에 다른 프로젝트가 떠 있으면 중지하고 이 폴더에서 npm run dev 하거나 BASE_URL을 지정하세요.`
    );
    await browser.close();
    process.exit(1);
  }

  await page.getByRole("button", { name: "로그인" }).first().click();
  await page.waitForSelector('input[autocomplete="username"]', { timeout: 15_000 });
  await page.fill('input[autocomplete="username"]', "sales@tetherget.com");
  await page.fill('input[autocomplete="current-password"]', "sales1234");
  await page.locator("button.w-full").filter({ hasText: /^로그인$/ }).click();

  await page.waitForTimeout(1500);
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
