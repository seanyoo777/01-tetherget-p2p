/**
 * Admin render-loop QA — admin tab / shell tabs / F5, console depth errors.
 * Requires: npm run dev on 5173
 */
import { chromium } from "playwright";

const BASE = process.env.BASE_URL || "http://127.0.0.1:5173";
const depthErrors = [];
const pageErrors = [];

async function loginAdmin(page) {
  if (await page.getByRole("button", { name: /로그아웃/i }).first().isVisible().catch(() => false)) {
    await page.getByRole("button", { name: /로그아웃/i }).first().click();
    await page.waitForTimeout(600);
  }
  await page.getByRole("button", { name: "로그인" }).first().click();
  await page.waitForSelector('input[autocomplete="username"]');
  await page.fill('input[autocomplete="username"]', "admin@tetherget.local");
  await page.fill('input[autocomplete="current-password"]', "admin1234");
  await page.locator("button.w-full").filter({ hasText: /^로그인$/ }).click();
  await page.waitForTimeout(3500);
}

async function openAdmin(page) {
  await page.getByRole("navigation").getByRole("button", { name: /관리자|Admin/i }).click();
  await page.getByText("회원관리").first().waitFor({ state: "visible", timeout: 20_000 });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  page.on("pageerror", (e) => {
    const msg = String(e.message || e);
    pageErrors.push(msg);
    if (/maximum update depth/i.test(msg)) depthErrors.push(msg);
  });
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const t = msg.text();
    pageErrors.push(t);
    if (/maximum update depth/i.test(t)) depthErrors.push(t);
  });

  await page.goto(BASE, { waitUntil: "networkidle", timeout: 60_000 });
  await loginAdmin(page);
  await openAdmin(page);

  const shellTabs = ["대시보드", "회원관리", "레퍼럴 관리", "거래관리", "UTE·P2P"];
  for (let round = 0; round < 3; round += 1) {
    await page.getByRole("navigation").getByRole("button", { name: /관리자|Admin/i }).click();
    await page.waitForTimeout(400);
    await page.getByRole("navigation").getByRole("button", { name: "거래", exact: true }).click();
    await page.waitForTimeout(400);
  }

  await openAdmin(page);
  for (let round = 0; round < 2; round += 1) {
    for (const label of shellTabs) {
      const btn = page.getByRole("button", { name: label }).first();
      if (await btn.isVisible().catch(() => false)) {
        await btn.click();
        await page.waitForTimeout(350);
      }
    }
  }

  for (let i = 0; i < 3; i += 1) {
    await page.reload({ waitUntil: "networkidle", timeout: 60_000 });
    await page.waitForTimeout(2500);
    const ok = await page.getByText("회원관리").first().isVisible().catch(() => false);
    if (!ok) {
      await openAdmin(page);
    }
  }

  const p2pRoot = await page.locator('[data-testid="p2p-app-root"]').count();
  const white = (await page.locator("body").innerText()).trim().length < 20;

  await browser.close();

  console.log("--- Admin render-loop QA ---");
  console.log(`p2p root mounted: ${p2pRoot > 0 ? "yes" : "NO"}`);
  console.log(`white screen: ${white ? "YES (fail)" : "no"}`);
  console.log(`Maximum update depth errors: ${depthErrors.length}`);
  if (depthErrors.length) {
    depthErrors.slice(0, 3).forEach((e, i) => console.log(`  [${i + 1}] ${e.slice(0, 200)}`));
  }
  console.log(`Other page errors: ${pageErrors.length - depthErrors.length}`);

  if (depthErrors.length || white || p2pRoot < 1) process.exit(1);
  console.log("PASS: no infinite render / white screen in admin stress path");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
