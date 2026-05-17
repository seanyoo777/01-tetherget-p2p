/**
 * P0 admin gate browser QA (Q1–Q10). Requires: npm run dev on 5173.
 * Usage: node scripts/qa-admin-gate-p0.mjs
 */
import { chromium } from "playwright";

const BASE = process.env.BASE_URL || "http://127.0.0.1:5173";
const LS_KEY = "tg_ui_home_screen_v1";

const results = [];

function record(id, pass, note = "") {
  results.push({ id, pass, note });
  console.log(`${pass ? "PASS" : "FAIL"} ${id}${note ? `: ${note}` : ""}`);
}

async function login(page, email, password) {
  if (await page.getByRole("button", { name: /로그아웃/i }).first().isVisible().catch(() => false)) {
    await logout(page);
  }
  await page.getByRole("button", { name: "로그인" }).first().click();
  await page.waitForSelector('input[autocomplete="username"]', { timeout: 15_000 });
  await page.fill('input[autocomplete="username"]', email);
  await page.fill('input[autocomplete="current-password"]', password);
  await page.locator("button.w-full").filter({ hasText: /^로그인$/ }).click();
  await page.waitForTimeout(3500);
}

const adminNav = (page) =>
  page.getByRole("navigation").getByRole("button", { name: /관리자|Admin/i });

async function logout(page) {
  const btn = page.getByRole("button", { name: /로그아웃|logout/i }).first();
  if (await btn.isVisible().catch(() => false)) {
    await btn.click();
    await page.waitForTimeout(800);
    return;
  }
  await page.evaluate(() => {
    localStorage.removeItem("tetherget_auth_token_v1");
    localStorage.removeItem("tetherget_local_session_v1");
    localStorage.removeItem("tg_ui_home_screen_v1");
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(600);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.setViewportSize({ width: 1400, height: 900 });

  try {
    await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 30_000 });
  } catch (e) {
    console.error(`Cannot reach ${BASE}. Run npm run dev first.\n`, e.message);
    process.exit(1);
  }

  // Q1 mock admin → admin shell
  await login(page, "admin@tetherget.local", "admin1234");
  await adminNav(page).click();
  const q1 = await page.getByText("회원관리").first().isVisible().catch(() => false);
  record("Q1", q1, q1 ? "AdminShell visible" : "no member panel");
  const ls1 = await page.evaluate((k) => localStorage.getItem(k), LS_KEY);
  record("Q1-LS", ls1 === "admin", `tg_ui_home_screen_v1=${ls1}`);

  // Q5 F5 on admin
  await page.reload({ waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(2500);
  const q5 = await page.getByText("회원관리").first().isVisible().catch(() => false);
  record("Q5", q5, "refresh on admin");

  // Q7 logout
  await logout(page);
  const q7 = !(await adminNav(page).isVisible().catch(() => false));
  record("Q7", q7, "no admin tab after logout");

  // Q2 member — no admin tab
  await login(page, "member1@tetherget.test", "Test1234");
  const q2 = !(await adminNav(page).isVisible().catch(() => false));
  record("Q2", q2, "member has no admin nav");

  // Q6 LS admin-denied cold load → trade
  await page.evaluate((k) => localStorage.setItem(k, "admin-denied"), LS_KEY);
  await page.reload({ waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(2000);
  const q6Denied = await page.getByText("관리자 권한이 없습니다").isVisible().catch(() => false);
  const q6Ls = await page.evaluate((k) => localStorage.getItem(k), LS_KEY);
  const q6Trade =
    (await page.getByRole("navigation").getByRole("button", { name: /거래|Trade/i }).isVisible().catch(() => false))
    || (await page.getByText("GLOBAL OTC DESK").isVisible().catch(() => false));
  record("Q6", !q6Denied && q6Trade && q6Ls !== "admin-denied", `ls=${q6Ls}`);

  // Q8 admin LS after member session
  await page.evaluate((k) => localStorage.setItem(k, "admin"), LS_KEY);
  await logout(page);
  await login(page, "member1@tetherget.test", "Test1234");
  await page.waitForTimeout(500);
  const ls8 = await page.evaluate((k) => localStorage.getItem(k), LS_KEY);
  const q8 = ls8 !== "admin" || !(await page.getByText("회원관리").isVisible().catch(() => false));
  record("Q8", q8, `member session ls=${ls8}, no admin shell`);

  await logout(page);

  // Q3 sales account
  await login(page, "sales@tetherget.com", "sales1234");
  const q3Nav = await adminNav(page).isVisible().catch(() => false);
  if (q3Nav) {
    await adminNav(page).click();
    await page.waitForTimeout(800);
  }
  const q3Body = await page.getByText("회원관리").first().isVisible().catch(() => false);
  record("Q3", q3Nav && q3Body, "sales nav+body aligned");

  await logout(page);

  // Q4 tg_debug_admin — nav+body for member
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.setItem("tg_debug_admin", "1"));
  await login(page, "member1@tetherget.test", "Test1234");
  const q4Nav = await adminNav(page).isVisible().catch(() => false);
  if (q4Nav) await adminNav(page).click();
  await page.waitForTimeout(800);
  const q4Body = await page.getByText("회원관리").first().isVisible().catch(() => false);
  record("Q4", q4Nav && q4Body, "debug flag sync nav+body");
  await page.evaluate(() => localStorage.removeItem("tg_debug_admin"));

  await logout(page);

  // Q9 ProfileChip admin link — mock admin
  await login(page, "admin@tetherget.local", "admin1234");
  const chip = page.locator('[data-testid="profile-chip-trigger"], [data-testid="profile-chip"]').first();
  if (await chip.count()) {
    await chip.click();
    const adminLink = page.getByRole("menuitem", { name: /관리자|admin/i }).or(page.getByText("관리자").last());
    if (await adminLink.isVisible().catch(() => false)) {
      await adminLink.click();
      await page.waitForTimeout(800);
    }
  }
  const q9 = await page.getByText("회원관리").first().isVisible().catch(() => false);
  record("Q9", q9, "profile chip admin path");

  // Q10 exit to trade (AdminShell 나가기)
  await page.keyboard.press("Escape");
  await page.locator('[data-testid="profile-chip-dropdown-backdrop"]').click({ force: true, timeout: 2000 }).catch(() => {});
  const shellExit = page.getByRole("button", { name: "나가기" }).first();
  if (await shellExit.isVisible().catch(() => false)) {
    await shellExit.click();
  } else {
    await page.getByRole("navigation").getByRole("button", { name: "거래", exact: true }).click();
  }
  await page.waitForTimeout(800);
  const q10Shell = !(await page.getByText("회원관리").first().isVisible().catch(() => false));
  const q10Nav = await page.getByRole("navigation").getByRole("button", { name: "거래", exact: true }).isVisible().catch(() => false);
  const q10Ls = await page.evaluate((k) => localStorage.getItem(k), LS_KEY);
  record("Q10", q10Shell && q10Nav && q10Ls === "trade", `shell exited, ls=${q10Ls}`);

  await browser.close();

  const failed = results.filter((r) => !r.pass);
  console.log(`\n--- ${results.length - failed.length}/${results.length} passed ---`);
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
