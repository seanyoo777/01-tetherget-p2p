/**
 * Admin Self-Test Center — pure validation runner (mock only, no polling).
 */
import {
  ADMIN_SHELL_MENU_IDS,
  ADMIN_SHELL_TO_PANEL_TAB,
  ADMIN_PANEL_TAB_IDS,
} from "./adminMenuIds.js";
import {
  ADMIN_SELF_TEST_STATUS,
  computeMockFeeBreakdown,
  simulateLevelTransition,
  makeCheck,
  worstStatus,
  validateTradeStatusRow,
  getMockStageReferralRates,
} from "./adminSelfTestModel.js";
import { SALES_LEVEL_STAGES } from "./adminMemberModel.js";
import {
  getP2pDevDiagnostics,
  isP2pDiagnosticsEnabled,
  runP2pAdminRefreshSelfTest,
  getLastP2pAdminRefreshValidation,
} from "../p2p/p2pDevDiagnostics.js";
import { resolveApiBase, viteApiBaseIsInvalidForBuild } from "../lib/resolveApiBase.js";
import { mockAppendAuditEntry } from "./adminSelfTestModel.js";
import { runMembershipSelfTestSuite } from "../membership/membershipSelfTest.js";
import { runDisputeSelfTestSuite } from "../dispute/disputeSelfTest.js";
import { runRiskGuardSelfTestSuite } from "../risk/riskGuardSelfTest.js";
import { runEscrowHealthSelfTestSuite } from "../escrowHealth/escrowHealthSelfTest.js";
import { runEmergencyPlaybookSelfTestSuite } from "../emergencyPlaybook/emergencyPlaybookSelfTest.js";
import { runP2pSelfTestDualBundle } from "../p2p/p2pSelfTestCoreAdapter.js";

function readPlatformCode(env = {}) {
  return String(env.VITE_PLATFORM_CODE || "tetherget").trim() || "tetherget";
}

function readServiceLine(env = {}) {
  return String(env.VITE_SERVICE_LINE || "p2p").trim() || "p2p";
}

/**
 * @param {object} card
 */
function summarizeCard(card) {
  const issueCount = card.checks.filter(
    (c) => c.status === ADMIN_SELF_TEST_STATUS.FAIL || c.status === ADMIN_SELF_TEST_STATUS.WARN,
  ).length;
  return { ...card, issueCount, status: worstStatus(card.checks) };
}

/**
 * @param {object} [ctx]
 */
export function validateMemberLevelSelfTest(ctx = {}) {
  const from = ctx.fromLevel ?? SALES_LEVEL_STAGES[2];
  const to = ctx.toLevel ?? SALES_LEVEL_STAGES[3];
  const transition = simulateLevelTransition(ctx.sampleUser ?? { id: "SELF-TEST-1" }, from, to);
  const checks = [];

  checks.push(
    makeCheck(
      transition.fromLevel !== transition.toLevel ? ADMIN_SELF_TEST_STATUS.PASS : ADMIN_SELF_TEST_STATUS.FAIL,
      `단계 변경 ${transition.fromLevel} → ${transition.toLevel}`,
      transition,
    ),
  );
  checks.push(
    makeCheck(
      transition.toBadge !== transition.fromBadge ? ADMIN_SELF_TEST_STATUS.PASS : ADMIN_SELF_TEST_STATUS.WARN,
      `배지 ${transition.fromBadge} → ${transition.toBadge}`,
    ),
  );
  checks.push(
    makeCheck(
      transition.tableAfter.receivedRate === transition.toRates.received
        ? ADMIN_SELF_TEST_STATUS.PASS
        : ADMIN_SELF_TEST_STATUS.FAIL,
      `referral rate 반영 (received ${transition.tableAfter.receivedRate}%)`,
    ),
  );
  checks.push(
    makeCheck(
      transition.tableAfter.marginRate === transition.tableAfter.receivedRate - transition.tableAfter.childRate
        ? ADMIN_SELF_TEST_STATUS.PASS
        : ADMIN_SELF_TEST_STATUS.FAIL,
      `admin table margin ${transition.tableAfter.marginRate}%`,
    ),
  );

  return summarizeCard({
    id: "member_level",
    title: "회원 단계",
    checks,
    transition,
    lastChecked: Date.now(),
    _mock: true,
  });
}

export function validateFeeStructureSelfTest() {
  const breakdown = computeMockFeeBreakdown({
    notionalUsdt: 10_000,
    receivedRate: 45,
    childRate: 38,
  });
  const checks = [];

  checks.push(makeCheck(breakdown.buyerFee > 0 ? ADMIN_SELF_TEST_STATUS.PASS : ADMIN_SELF_TEST_STATUS.FAIL, `buyer fee ${breakdown.buyerFee}`));
  checks.push(makeCheck(breakdown.sellerFee > 0 ? ADMIN_SELF_TEST_STATUS.PASS : ADMIN_SELF_TEST_STATUS.FAIL, `seller fee ${breakdown.sellerFee}`));
  checks.push(
    makeCheck(
      Math.abs(breakdown.totalFee - (breakdown.buyerFee + breakdown.sellerFee)) < 0.02
        ? ADMIN_SELF_TEST_STATUS.PASS
        : ADMIN_SELF_TEST_STATUS.FAIL,
      `total fee ${breakdown.totalFee}`,
    ),
  );
  checks.push(
    makeCheck(
      breakdown.referralShare >= 0 && breakdown.companyShare >= 0
        ? ADMIN_SELF_TEST_STATUS.PASS
        : ADMIN_SELF_TEST_STATUS.FAIL,
      `referral ${breakdown.referralShare} · company ${breakdown.companyShare}`,
    ),
  );
  checks.push(
    makeCheck(
      breakdown.marginOk ? ADMIN_SELF_TEST_STATUS.PASS : ADMIN_SELF_TEST_STATUS.FAIL,
      `상위/하위 배분율 차액 ${breakdown.spreadPct}%`,
    ),
  );

  return summarizeCard({
    id: "fee_structure",
    title: "수수료 체계",
    checks,
    breakdown,
    lastChecked: Date.now(),
    _mock: true,
  });
}

export function validateReferralSpreadSelfTest() {
  const checks = [];
  let warnSpread = 0;
  for (const stage of SALES_LEVEL_STAGES.slice(0, 6)) {
    const rates = getMockStageReferralRates(stage);
    if (rates.received < rates.child) {
      checks.push(
        makeCheck(ADMIN_SELF_TEST_STATUS.FAIL, `${stage}: received < child`, rates),
      );
    } else if (rates.received - rates.child < 3) {
      warnSpread += 1;
      checks.push(
        makeCheck(ADMIN_SELF_TEST_STATUS.WARN, `${stage}: narrow spread ${rates.received - rates.child}%`, rates),
      );
    } else {
      checks.push(
        makeCheck(ADMIN_SELF_TEST_STATUS.PASS, `${stage}: spread ${rates.received - rates.child}%`, rates),
      );
    }
  }
  if (warnSpread === 0 && checks.every((c) => c.status === ADMIN_SELF_TEST_STATUS.PASS)) {
    checks.push(makeCheck(ADMIN_SELF_TEST_STATUS.PASS, "레퍼럴 mock BPS ladder OK"));
  }

  return summarizeCard({
    id: "referral_spread",
    title: "레퍼럴 배분",
    checks,
    lastChecked: Date.now(),
    _mock: true,
  });
}

export function validateTradeStatusSelfTest() {
  const samples = [
    { status: "listed", escrow_lifecycle: "locked" },
    { status: "matched", escrow_lifecycle: "locked" },
    { status: "payment_sent", escrow_lifecycle: "release_pending" },
    { status: "completed", escrow_lifecycle: "released" },
    { status: "cancelled", escrow_lifecycle: "cancelled" },
  ];
  const checks = samples.map((row) => validateTradeStatusRow(row));
  checks.push(validateTradeStatusRow({ status: "matched" }, true));

  return summarizeCard({
    id: "trade_status",
    title: "거래상태",
    checks,
    lastChecked: Date.now(),
    _mock: true,
  });
}

export function validateEscrowStateSelfTest() {
  const pairs = [
    { canon: "locked", matrix: "matched" },
    { canon: "release_pending", matrix: "payment_confirmed" },
    { canon: "released", matrix: "completed" },
    { canon: "disputed", matrix: "disputed" },
    { canon: "cancelled", matrix: "cancelled" },
  ];
  const checks = pairs.map(({ canon, matrix }) => {
    const dbStatus =
      matrix === "payment_confirmed"
        ? "payment_sent"
        : matrix === "disputed"
          ? "matched"
          : matrix === "completed"
            ? "completed"
            : matrix === "cancelled"
              ? "cancelled"
              : "matched";
    const row = { status: dbStatus, escrow_lifecycle: canon };
    return validateTradeStatusRow(row, matrix === "disputed");
  });

  return summarizeCard({
    id: "escrow_state",
    title: "Escrow 상태",
    checks,
    lastChecked: Date.now(),
    _mock: true,
  });
}

/** @type {readonly { shellId: string, label: string, panelTab: string }[]} */
const ADMIN_MENU_SMOKE = Object.freeze([
  { shellId: ADMIN_SHELL_MENU_IDS.MEMBER, label: "회원관리", panelTab: ADMIN_PANEL_TAB_IDS.MEMBER },
  { shellId: ADMIN_SHELL_MENU_IDS.TRADE, label: "거래관리", panelTab: ADMIN_PANEL_TAB_IDS.AUDIT },
  { shellId: ADMIN_SHELL_MENU_IDS.REFERRAL, label: "레퍼럴관리", panelTab: ADMIN_PANEL_TAB_IDS.MEMBER_OPS },
  { shellId: ADMIN_SHELL_MENU_IDS.SETTLEMENT, label: "정산관리", panelTab: ADMIN_PANEL_TAB_IDS.DISPUTE },
  { shellId: ADMIN_SHELL_MENU_IDS.UTE_P2P, label: "수수료·UTE", panelTab: ADMIN_PANEL_TAB_IDS.UTE_SURFACE },
]);

export function validateAdminMenuSmokeSelfTest() {
  const checks = ADMIN_MENU_SMOKE.map((menu) => {
    const mapped = ADMIN_SHELL_TO_PANEL_TAB[menu.shellId];
    const ok = mapped === menu.panelTab;
    return makeCheck(
      ok ? ADMIN_SELF_TEST_STATUS.PASS : ADMIN_SELF_TEST_STATUS.FAIL,
      `${menu.label} → tab ${mapped || "—"}`,
      { expected: menu.panelTab, actual: mapped },
    );
  });

  return summarizeCard({
    id: "admin_menu_smoke",
    title: "관리자 메뉴",
    checks,
    menus: ADMIN_MENU_SMOKE.map((m) => ({
      ...m,
      mappedTab: ADMIN_SHELL_TO_PANEL_TAB[m.shellId],
      smoke: "mock route OK",
    })),
    lastChecked: Date.now(),
    _mock: true,
  });
}

export function validateFeatureFlagFallbackSelfTest() {
  const checks = [
    makeCheck(isP2pDiagnosticsEnabled({ DEV: true }) ? ADMIN_SELF_TEST_STATUS.PASS : ADMIN_SELF_TEST_STATUS.FAIL, "DEV → diagnostics on"),
    makeCheck(
      !isP2pDiagnosticsEnabled({ DEV: false, VITE_P2P_SHOW_DIAGNOSTICS: "0" })
        ? ADMIN_SELF_TEST_STATUS.PASS
        : ADMIN_SELF_TEST_STATUS.FAIL,
      "prod default diagnostics off",
    ),
    makeCheck(
      isP2pDiagnosticsEnabled({ DEV: false, VITE_P2P_SHOW_DIAGNOSTICS: "1" })
        ? ADMIN_SELF_TEST_STATUS.PASS
        : ADMIN_SELF_TEST_STATUS.FAIL,
      "VITE_P2P_SHOW_DIAGNOSTICS=1 staging",
    ),
    makeCheck(
      viteApiBaseIsInvalidForBuild("https://./") ? ADMIN_SELF_TEST_STATUS.PASS : ADMIN_SELF_TEST_STATUS.FAIL,
      "invalid VITE_API_BASE blocked at build",
    ),
    makeCheck(
      resolveApiBase("", true) === "http://localhost:4000" ? ADMIN_SELF_TEST_STATUS.PASS : ADMIN_SELF_TEST_STATUS.FAIL,
      "dev API base fallback localhost:4000",
    ),
    makeCheck(
      resolveApiBase("", false) === "" ? ADMIN_SELF_TEST_STATUS.PASS : ADMIN_SELF_TEST_STATUS.FAIL,
      "prod empty API base → same-origin /api",
    ),
    makeCheck(readPlatformCode().length > 0 ? ADMIN_SELF_TEST_STATUS.PASS : ADMIN_SELF_TEST_STATUS.FAIL, `PLATFORM_CODE ${readPlatformCode()}`),
    makeCheck(readServiceLine() === "p2p" ? ADMIN_SELF_TEST_STATUS.PASS : ADMIN_SELF_TEST_STATUS.WARN, `SERVICE_LINE ${readServiceLine()}`),
  ];

  return summarizeCard({
    id: "feature_flags",
    title: "Feature Flag / Fallback",
    checks,
    flags: {
      diagnosticsDev: true,
      diagnosticsStagingKey: "VITE_P2P_SHOW_DIAGNOSTICS",
      platformCode: readPlatformCode(),
      serviceLine: readServiceLine(),
    },
    lastChecked: Date.now(),
    _mock: true,
  });
}

export function validateAuditTrailMockSelfTest() {
  const trail = [];
  const t1 = mockAppendAuditEntry(trail, "member level mock change");
  const t2 = mockAppendAuditEntry(t1, "fee mock recalc");
  const validation = runP2pAdminRefreshSelfTest();
  const last = getLastP2pAdminRefreshValidation();

  const checks = [
    makeCheck(t2.length === 2 ? ADMIN_SELF_TEST_STATUS.PASS : ADMIN_SELF_TEST_STATUS.FAIL, "append-only grows trail"),
    makeCheck(t2[0].line.includes("fee") ? ADMIN_SELF_TEST_STATUS.PASS : ADMIN_SELF_TEST_STATUS.FAIL, "newest entry first"),
    makeCheck(typeof t2[0].t === "string" && t2[0].t.length > 0 ? ADMIN_SELF_TEST_STATUS.PASS : ADMIN_SELF_TEST_STATUS.FAIL, "audit entries timestamped"),
    makeCheck(
      validation != null && typeof validation.ranAt === "number" ? ADMIN_SELF_TEST_STATUS.PASS : ADMIN_SELF_TEST_STATUS.FAIL,
      "refresh self-test snapshot ranAt",
    ),
    makeCheck(
      last === validation ? ADMIN_SELF_TEST_STATUS.PASS : ADMIN_SELF_TEST_STATUS.WARN,
      "getLastP2pAdminRefreshValidation readable",
    ),
    makeCheck(Array.isArray(validation?.issues) ? ADMIN_SELF_TEST_STATUS.PASS : ADMIN_SELF_TEST_STATUS.WARN, "issues list append shape"),
  ];

  return summarizeCard({
    id: "audit_trail",
    title: "Audit Trail (mock)",
    checks,
    trailSample: t2.slice(0, 2),
    lastChecked: Date.now(),
    _mock: true,
  });
}

export function validateMembershipMvpSelfTest() {
  const suite = runMembershipSelfTestSuite();
  const checks = suite.cards.map((c) =>
    makeCheck(
      c.status !== ADMIN_SELF_TEST_STATUS.FAIL ? ADMIN_SELF_TEST_STATUS.PASS : ADMIN_SELF_TEST_STATUS.FAIL,
      `${c.title}: ${c.status} (${c.issueCount} issues)`,
    ),
  );
  checks.push(
    makeCheck(suite.status !== ADMIN_SELF_TEST_STATUS.FAIL ? ADMIN_SELF_TEST_STATUS.PASS : ADMIN_SELF_TEST_STATUS.FAIL, "membership suite aggregate"),
  );
  return summarizeCard({
    id: "membership_mvp",
    title: "Membership / Points MVP",
    checks,
    membershipSuite: suite,
    lastChecked: Date.now(),
    _mock: true,
  });
}

export function validateDisputeCenterSelfTest() {
  const suite = runDisputeSelfTestSuite();
  const checks = (suite.groups || []).map((g) =>
    makeCheck(
      !g.checks.some((c) => c.status === "fail") ? ADMIN_SELF_TEST_STATUS.PASS : ADMIN_SELF_TEST_STATUS.FAIL,
      `${g.id}: ${g.checks.filter((c) => c.status !== "pass").length} issues`,
    ),
  );
  checks.push(
    makeCheck(
      suite.status !== "fail" ? ADMIN_SELF_TEST_STATUS.PASS : ADMIN_SELF_TEST_STATUS.FAIL,
      `dispute suite aggregate (${suite.issueCount} issues)`,
    ),
  );
  return summarizeCard({
    id: "dispute_center_mvp",
    title: "P2P Dispute / Escrow Case Center",
    checks,
    disputeSuite: suite,
    lastChecked: Date.now(),
    _mock: true,
  });
}

export function validateEscrowHealthOverviewSelfTest() {
  const suite = runEscrowHealthSelfTestSuite();
  const checks = (suite.groups || []).map((g) =>
    makeCheck(
      !g.checks.some((c) => c.status === "fail") ? ADMIN_SELF_TEST_STATUS.PASS : ADMIN_SELF_TEST_STATUS.FAIL,
      `${g.id}: ${g.checks.filter((c) => c.status !== "pass").length} issues`,
    ),
  );
  checks.push(
    makeCheck(
      suite.status !== "fail" ? ADMIN_SELF_TEST_STATUS.PASS : ADMIN_SELF_TEST_STATUS.FAIL,
      `escrow health aggregate (${suite.issueCount} issues)`,
    ),
  );
  return summarizeCard({
    id: "escrow_health_overview_mvp",
    title: "Escrow Health Overview (mock)",
    checks,
    escrowHealthSuite: suite,
    lastChecked: Date.now(),
    _mock: true,
  });
}

export function validateEmergencyPlaybookSelfTest() {
  const suite = runEmergencyPlaybookSelfTestSuite();
  const checks = (suite.groups || []).map((g) =>
    makeCheck(
      !g.checks.some((c) => c.status === "fail") ? ADMIN_SELF_TEST_STATUS.PASS : ADMIN_SELF_TEST_STATUS.FAIL,
      `${g.id}: ${g.checks.filter((c) => c.status !== "pass").length} issues`,
    ),
  );
  checks.push(
    makeCheck(
      suite.status !== "fail" ? ADMIN_SELF_TEST_STATUS.PASS : ADMIN_SELF_TEST_STATUS.FAIL,
      `emergency playbook aggregate (${suite.issueCount} issues)`,
    ),
  );
  return summarizeCard({
    id: "emergency_playbook_mvp",
    title: "Emergency Response Playbook (mock)",
    checks,
    emergencyPlaybookSuite: suite,
    lastChecked: Date.now(),
    _mock: true,
  });
}

export function validateRiskGuardSelfTest() {
  const suite = runRiskGuardSelfTestSuite();
  const checks = (suite.groups || []).map((g) =>
    makeCheck(
      !g.checks.some((c) => c.status === "fail") ? ADMIN_SELF_TEST_STATUS.PASS : ADMIN_SELF_TEST_STATUS.FAIL,
      `${g.id}: ${g.checks.filter((c) => c.status !== "pass").length} issues`,
    ),
  );
  checks.push(
    makeCheck(
      suite.status !== "fail" ? ADMIN_SELF_TEST_STATUS.PASS : ADMIN_SELF_TEST_STATUS.FAIL,
      `risk guard aggregate (${suite.issueCount} issues)`,
    ),
  );
  checks.push(
    makeCheck(suite.diagnostics?.mockOnly === true ? ADMIN_SELF_TEST_STATUS.PASS : ADMIN_SELF_TEST_STATUS.WARN, "risk diagnostics mockOnly"),
  );
  return summarizeCard({
    id: "risk_guard_mvp",
    title: "Admin Risk Guard / Escrow Release",
    checks,
    riskGuardSuite: suite,
    diagnostics: suite.diagnostics,
    lastChecked: Date.now(),
    _mock: true,
  });
}

export function validateP2pDiagnosticsSelfTest() {
  const diag = getP2pDevDiagnostics();
  const checks = [
    makeCheck(diag.mockOnly ? ADMIN_SELF_TEST_STATUS.PASS : ADMIN_SELF_TEST_STATUS.WARN, "P2P diagnostics mock only"),
    makeCheck(
      typeof diag.issueCount === "number" ? ADMIN_SELF_TEST_STATUS.PASS : ADMIN_SELF_TEST_STATUS.FAIL,
      `UTE issue count ${diag.issueCount}`,
    ),
  ];

  return summarizeCard({
    id: "p2p_diagnostics",
    title: "UTE / P2P diagnostics",
    checks,
    diagnostics: { validationOk: diag.validationOk, cacheSource: diag.cacheSource },
    lastChecked: Date.now(),
    _mock: true,
  });
}

/**
 * @param {object} [ctx]
 */
export function runAdminSelfTestSuite(ctx = {}) {
  const cards = [
    validateMemberLevelSelfTest(ctx),
    validateFeeStructureSelfTest(),
    validateReferralSpreadSelfTest(),
    validateTradeStatusSelfTest(),
    validateEscrowStateSelfTest(),
    validateAdminMenuSmokeSelfTest(),
    validateFeatureFlagFallbackSelfTest(),
    validateAuditTrailMockSelfTest(),
    validateMembershipMvpSelfTest(),
    validateDisputeCenterSelfTest(),
    validateEscrowHealthOverviewSelfTest(),
    validateEmergencyPlaybookSelfTest(),
    validateRiskGuardSelfTest(),
    validateP2pDiagnosticsSelfTest(),
  ];
  const issueCount = cards.reduce((n, c) => n + c.issueCount, 0);
  const status = worstStatus(cards);

  return {
    status,
    issueCount,
    lastChecked: Date.now(),
    cards,
    levelTransition: cards.find((c) => c.id === "member_level")?.transition,
    feeBreakdown: cards.find((c) => c.id === "fee_structure")?.breakdown,
    _mock: true,
  };
}

/**
 * Admin self-test + {@link @tetherget/self-test-core} bundle (additive).
 * @param {object} [ctx]
 */
export function runAdminSelfTestSuiteWithCore(ctx = {}) {
  const dual = runP2pSelfTestDualBundle(ctx);
  return {
    ...dual.legacy,
    coreBundle: dual.core,
    core: dual.core,
    mockOnly: true,
  };
}
