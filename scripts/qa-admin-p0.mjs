/**
 * P0 admin stabilization browser QA (Playwright).
 * Requires: npm run dev on 01-TetherGet-P2P (default 5173).
 */
import { chromium } from "playwright";

const BASE = process.env.BASE_URL || "http://127.0.0.1:5173";
const ADMIN = { email: "admin@tetherget.local", password: "admin1234" };
const MEMBER = { email: "member1@tetherget.test", password: "Test1234" };

const results = [];

function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}${detail ? ` — ${detail}` : ""}`);
}

async function login(page, { email, password }) {
  await page.getByRole("button", { name: "로그인" }).first().click();
  await page.waitForSelector('input[autocomplete="username"]', { timeout: 15_000 });
  await page.fill('input[autocomplete="username"]', email);
  await page.fill('input[autocomplete="current-password"]', password);
  await page.locator("button.w-full").filter({ hasText: /^로그인$/ }).click();
  await page.getByRole("button", { name: "로그아웃" }).first().waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(400);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const consoleErrors = [];
  const depthErrors = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const t = msg.text();
      consoleErrors.push(t);
      if (/maximum update depth exceeded/i.test(t)) depthErrors.push(t);
    }
  });
  page.on("pageerror", (err) => {
    consoleErrors.push(String(err));
    if (/maximum update depth exceeded/i.test(String(err))) depthErrors.push(String(err));
  });

  try {
    await page.goto(BASE, { waitUntil: "networkidle", timeout: 60_000 });
    await page.waitForSelector('[data-app="tetherget-p2p"]', { timeout: 30_000 });
  } catch (e) {
    console.error(`Cannot reach ${BASE}. Run npm run dev in 01-TetherGet-P2P.\n`, e.message);
    process.exit(1);
  }

  const appMarker = await page.locator('[data-app="tetherget-p2p"]').count();
  record("01 P2P app marker", appMarker >= 1, `count=${appMarker}`);

  // —— Admin flow ——
  await login(page, ADMIN);
  const adminNavVisible = await page
    .getByRole("navigation")
    .getByRole("button", { name: "관리자" })
    .isVisible()
    .catch(() => false);
  record("Admin nav visible for mock admin", adminNavVisible);

  await page.getByRole("navigation").getByRole("button", { name: "관리자" }).click();
  const shellOk = await page
    .getByText("회원관리", { exact: false })
    .first()
    .waitFor({ state: "visible", timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
  record("AdminShell shows after admin click", shellOk);

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  const afterReloadBlank =
    (await page.locator("body").innerText()).trim().length < 20;
  const afterReloadAdmin = await page
    .getByText("회원관리", { exact: false })
    .first()
    .isVisible()
    .catch(() => false);
  const deniedAfterReload = await page
    .getByText("관리자 화면을 열 수 없습니다", { exact: false })
    .isVisible()
    .catch(() => false);
  record(
    "Refresh: no white screen + admin or trade (not stuck denied)",
    !afterReloadBlank && (afterReloadAdmin || !deniedAfterReload),
    `blank=${afterReloadBlank} admin=${afterReloadAdmin} denied=${deniedAfterReload}`
  );

  // —— Member denied ——
  await page.getByRole("button", { name: "로그아웃" }).first().click();
  await page.waitForTimeout(800);
  await login(page, MEMBER);
  const memberAdminNav = await page
    .getByRole("navigation")
    .getByRole("button", { name: "관리자" })
    .isVisible()
    .catch(() => false);
  record("Member: admin nav hidden", !memberAdminNav);

  // Force admin route via LS if nav hidden — openPage only via chip if shown
  await page.evaluate(() => {
    localStorage.setItem("tg_ui_home_screen_v1", "admin");
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "로그아웃" }).first().waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(800);
  const memberAdminShell = await page
    .getByText("회원관리", { exact: false })
    .first()
    .isVisible()
    .catch(() => false);
  const memberDenied = await page
    .getByText("관리자 권한이 없습니다", { exact: false })
    .isVisible()
    .catch(() => false);
  const lsScreen = await page.evaluate(() => localStorage.getItem("tg_ui_home_screen_v1"));
  record(
    "Member: LS admin → trade fallback (no AdminShell)",
    !memberAdminShell && lsScreen === "trade",
    `shell=${memberAdminShell} denied=${memberDenied} ls=${lsScreen}`
  );

  // —— Logout clears admin ——
  await page.getByRole("button", { name: "로그아웃" }).first().click();
  await page.waitForTimeout(800);
  const guestAdminShell = await page
    .getByText("회원관리", { exact: false })
    .first()
    .isVisible()
    .catch(() => false);
  const lsAfterLogout = await page.evaluate(() => localStorage.getItem("tg_ui_home_screen_v1"));
  record(
    "Logout: no admin shell + LS trade",
    !guestAdminShell && lsAfterLogout === "trade",
    `shell=${guestAdminShell} ls=${lsAfterLogout}`
  );

  const redErrors = consoleErrors.filter(
    (e) => !/favicon|404|Failed to load resource|net::ERR/i.test(e)
  );
  record("No critical console errors", redErrors.length === 0, redErrors.slice(0, 3).join(" | "));
  record("No Maximum update depth exceeded", depthErrors.length === 0, depthErrors.join(" | "));

  await browser.close();

  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    console.error(`\n${failed.length}/${results.length} checks failed.`);
    process.exit(1);
  }
  console.log(`\nAll ${results.length} browser QA checks passed.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
