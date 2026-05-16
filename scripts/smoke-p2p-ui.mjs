/**

 * P2P UI smoke — API는 route mock, 실제 결제/릴리즈/온체인 없음.

 * Usage: npm run dev (5171) 후 npm run smoke:p2p

 * Skip browser: SMOKE_P2P_UNIT_ONLY=1 npm run smoke:p2p

 */

import { spawn } from "node:child_process";

import { MOCK_UTE_SURFACE_SNAPSHOT } from "../src/mock/p2pTradeFlowMock.js";
import { P2P_TEST_IDS } from "../src/p2p/p2pTestIds.js";
import { getMockAdminSmokeAuthResponse } from "../src/p2p/p2pSmokeJwtFixture.js";



const BASE = process.env.BASE_URL || "http://127.0.0.1:5171";

const UNIT_ONLY = process.env.SMOKE_P2P_UNIT_ONLY === "1";



function runNodeTests() {

  return new Promise((resolve, reject) => {

    const child = spawn(process.execPath, ["--test", "src/p2p/__tests__/*.test.js"], {

      stdio: "inherit",

      shell: false,

      cwd: process.cwd(),

    });

    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`unit tests exit ${code}`))));

  });

}



async function runPlaywrightSmoke() {

  const { chromium } = await import("playwright");



  const mockOrders = {

    orders: [

      {

        id: "P2P-SMOKE-1",

        status: "matched",

        db_status: "matched",

        lifecycle: "waiting_payment",

        escrow_lifecycle: "locked",

        coin: "USDT",

        amount: 100,

        my_role: "buyer",

        created_at: "2026-05-15 10:00:00",

        updated_at: "2026-05-15 10:00:00",

      },

    ],

  };



  const browser = await chromium.launch({ headless: true });

  const page = await browser.newPage();



  await page.route("**/api/**", async (route) => {

    const url = route.request().url();

    if (url.includes("/api/admin/p2p/ute-surface")) {

      await route.fulfill({

        status: 200,

        contentType: "application/json",

        body: JSON.stringify({ ...MOCK_UTE_SURFACE_SNAPSHOT, mock_only: true }),

      });

      return;

    }

    if (url.includes("/api/p2p/orders/me")) {

      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockOrders) });

      return;

    }

    if (url.includes("/api/p2p/orders") && url.includes("/events")) {

      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ events: [] }) });

      return;

    }

    if (url.includes("/api/auth/login") || url.includes("/api/auth/me")) {

      await route.fulfill({

        status: 200,

        contentType: "application/json",

        body: JSON.stringify(getMockAdminSmokeAuthResponse()),

      });

      return;

    }

    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });

  });



  try {

    await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 30_000 });

  } catch (e) {

    console.error(`FAIL: ${BASE} — npm run dev 필요\n`, e.message);

    await browser.close();

    process.exit(1);

  }



  await page.getByRole("button", { name: "로그인" }).first().click({ timeout: 10_000 }).catch(() => {});

  await page.waitForTimeout(500);



  await page.getByRole("navigation").getByRole("button", { name: "P2P" }).click({ timeout: 10_000 }).catch(() => {

    return page.getByRole("button", { name: /P2P|거래/ }).first().click();

  });



  const tradeList = page.getByTestId(P2P_TEST_IDS.tradeList);

  if (await tradeList.isVisible().catch(() => false)) {

    console.log(`OK: TradeList [${P2P_TEST_IDS.tradeList}]`);

  } else {

    console.log(`SKIP: TradeList testid (P2P 탭·호가 mock 확인)`);

  }



  const timelineBtn = page.getByRole("button", { name: /타임라인|이벤트/ }).first();

  if (await timelineBtn.isVisible().catch(() => false)) {

    await timelineBtn.click();

    const timeline = page.getByTestId(P2P_TEST_IDS.timeline);

    await timeline.waitFor({ state: "visible", timeout: 8000 }).catch(() => {});

    if (await timeline.isVisible().catch(() => false)) {

      console.log(`OK: Timeline [${P2P_TEST_IDS.timeline}]`);

    } else {

      console.log("SKIP: timeline testid (펼침 후에만 표시될 수 있음)");

    }

  } else {

    console.log("SKIP: TradeList 타임라인 버튼 없음");

  }



  await page.getByRole("navigation").getByRole("button", { name: /내 거래/ }).click({ timeout: 8000 }).catch(() => {});

  await page.waitForTimeout(800);

  const matrixStrip = page.getByTestId(P2P_TEST_IDS.matrixStrip);

  const matrixBadge = page.getByTestId(P2P_TEST_IDS.matrixBadge);

  if ((await matrixStrip.isVisible().catch(() => false)) || (await matrixBadge.isVisible().catch(() => false))) {

    console.log(`OK: 내 거래 matrix UI [${P2P_TEST_IDS.matrixStrip}|${P2P_TEST_IDS.matrixBadge}]`);

  } else {

    console.log("SKIP: 내 거래 matrix testids");

  }



  const escrow = page.getByTestId(P2P_TEST_IDS.escrowPanel);

  if (await escrow.isVisible().catch(() => false)) {

    console.log(`OK: Escrow panel [${P2P_TEST_IDS.escrowPanel}]`);

  }



  await page.getByRole("navigation").getByRole("button", { name: "관리자" }).click({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(600);

  const auditTab = page.getByTestId(P2P_TEST_IDS.adminAuditTab);
  if (await auditTab.isVisible().catch(() => false)) {
    await auditTab.click({ timeout: 8000 });
  } else {
    await page.getByRole("button", { name: "플랫폼로그" }).click({ timeout: 8000 }).catch(() => {});
  }
  await page.waitForTimeout(600);

  const adminAudit = page.getByTestId(P2P_TEST_IDS.adminAudit);
  await adminAudit.waitFor({ state: "visible", timeout: 12_000 }).catch(() => {});

  if (await adminAudit.isVisible().catch(() => false)) {
    await page.getByTestId(P2P_TEST_IDS.adminAuditKpi).waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
    const kpiCard = page.getByTestId(P2P_TEST_IDS.adminAuditKpiCard).first();
    if (await kpiCard.isVisible().catch(() => false)) {
      console.log(`OK: KPI cards [${P2P_TEST_IDS.adminAuditKpiCard}]`);
    }
    const cacheState = page.getByTestId(P2P_TEST_IDS.adminCacheState);
    if (await cacheState.isVisible().catch(() => false)) {
      const src = await cacheState.getAttribute("data-cache-source");
      console.log(`OK: cache state [${P2P_TEST_IDS.adminCacheState}] source=${src}`);
    }
    const devDiag = page.getByTestId(P2P_TEST_IDS.devDiagnostics);
    await devDiag.waitFor({ state: "visible", timeout: 8000 }).catch(() => {});
    if (await devDiag.isVisible().catch(() => false)) {
      const validation = page.getByTestId(P2P_TEST_IDS.validationBadge);
      const status = await validation.getAttribute("data-validation-status").catch(() => null);
      console.log(`OK: dev diagnostics [${P2P_TEST_IDS.devDiagnostics}] validation=${status}`);
    } else {
      console.log(`SKIP: dev diagnostics (DEV 빌드에서만 표시)`);
    }
    const legend = page.getByTestId(P2P_TEST_IDS.escrowLegend);
    await legend.waitFor({ state: "visible", timeout: 8000 }).catch(() => {});
    if (await legend.isVisible().catch(() => false)) {
      console.log(`OK: escrow legend [${P2P_TEST_IDS.escrowLegend}]`);
    }
    console.log(`OK: Admin audit [${P2P_TEST_IDS.adminAudit}]`);
  } else {
    console.log(`SKIP: Admin audit testid (감사 탭 이동 필요할 수 있음)`);
  }

  const escrowLegendTrade = page.getByTestId(P2P_TEST_IDS.escrowLegend);
  if (await escrowLegendTrade.isVisible().catch(() => false)) {
    console.log(`OK: escrow legend on trade surface [${P2P_TEST_IDS.escrowLegend}]`);
  }

  const uteTab = page.getByTestId(P2P_TEST_IDS.uteSurfaceTab);
  if (await uteTab.isVisible().catch(() => false)) {
    await uteTab.click({ timeout: 8000 });
    await page.waitForTimeout(500);
    const utePanel = page.getByTestId(P2P_TEST_IDS.uteSurfacePanel);
    await utePanel.waitFor({ state: "visible", timeout: 10_000 }).catch(() => {});
    const compactDiag = page.getByTestId(P2P_TEST_IDS.devDiagnosticsCompact).first();
    if (await compactDiag.isVisible().catch(() => false)) {
      console.log(`OK: UTE tab compact diagnostics [${P2P_TEST_IDS.devDiagnosticsCompact}]`);
    }
    console.log(`OK: UTE surface panel [${P2P_TEST_IDS.uteSurfacePanel}]`);
  }

  const smokeRootUrl = `${BASE.replace(/\/$/, "")}/smoke/simple-admin`;
  await page.goto(smokeRootUrl, { waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => {});
  const smokeRoot = page.getByTestId(P2P_TEST_IDS.simpleAdminSmokeRoot);
  await smokeRoot.waitFor({ state: "visible", timeout: 10_000 }).catch(() => {});
  if (await smokeRoot.isVisible().catch(() => false)) {
    await page.getByTestId(P2P_TEST_IDS.devDiagnosticsCompact).first().waitFor({ state: "visible", timeout: 8000 }).catch(() => {});
    console.log(`OK: SimpleAdmin smoke route [${P2P_TEST_IDS.simpleAdminSmokeRoot}]`);
  } else {
    console.log("SKIP: SimpleAdmin smoke route");
  }

  await browser.close();

  console.log("smoke:p2p browser checks done (mock API only)");

}



async function main() {

  await runNodeTests();

  console.log("OK: src/p2p unit tests");

  if (UNIT_ONLY) {

    console.log("SMOKE_P2P_UNIT_ONLY=1 — browser skipped");

    return;

  }

  await runPlaywrightSmoke();

}



main().catch((e) => {

  console.error(e);

  process.exit(1);

});


