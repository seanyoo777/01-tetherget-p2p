/**
 * Requires: npm run dev (Vite on 5173). Local seed login (no API).
 * Usage: npm run smoke:super-nav
 */
import { chromium } from "playwright";

const BASE = process.env.BASE_URL || "http://127.0.0.1:5173";

async function login(page, email, password) {
  await page.getByRole("button", { name: "로그인" }).first().click();
  await page.waitForSelector('input[autocomplete="username"]', { timeout: 15_000 });
  await page.fill('input[autocomplete="username"]', email);
  await page.fill('input[autocomplete="current-password"]', password);
  await page.locator("button.w-full").filter({ hasText: /^로그인$/ }).click();
  await page.waitForTimeout(1200);
}

async function logout(page) {
  const logoutBtn = page.getByRole("button", { name: /로그아웃|Logout/i }).first();
  if (await logoutBtn.isVisible().catch(() => false)) {
    await logoutBtn.click();
    await page.waitForTimeout(800);
  }
}

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
    console.error(`FAIL: tetherget-mvp 앱이 아닙니다 (title="${title}").`);
    await browser.close();
    process.exit(1);
  }

  await login(page, "sales@tetherget.com", "sales1234");
  const superForSales = await page.getByRole("navigation").getByRole("button", { name: "슈퍼페이지" }).count();
  if (superForSales !== 0) {
    console.error("FAIL: 영업 계정인데 상단에 슈퍼페이지 버튼이 보입니다.");
    await browser.close();
    process.exit(1);
  }

  await logout(page);

  await login(page, "admin@tetherget.com", "admin1234");
  const superForAdmin = await page.getByRole("navigation").getByRole("button", { name: "슈퍼페이지" }).count();
  if (superForAdmin < 1) {
    console.error("FAIL: SUPER(hq_ops) 계정인데 슈퍼페이지 버튼이 없습니다.");
    await browser.close();
    process.exit(1);
  }

  console.log("OK: 슈퍼페이지 메뉴 — 영업 숨김 · 본사 표시 확인.");
  await browser.close();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
