/**
 * Thin adapter: legacy P2P self-test shapes → @tetherget/self-test-core {@link buildSelfTestResult}.
 * Additive only — no UI/network/WebSocket.
 */
import {
  buildSelfTestResult,
  resolveSuiteStatusFromIssues,
} from "@tetherget/self-test-core";
import { ADMIN_SELF_TEST_STATUS } from "../admin/adminSelfTestModel.js";
import { runAdminSelfTestSuite } from "../admin/adminSelfTestEngine.js";
import { runDisputeSelfTestSuite } from "../dispute/disputeSelfTest.js";
import { runRiskGuardSelfTestSuite } from "../risk/riskGuardSelfTest.js";
import { runNotificationSelfTestSuite } from "../notifications/notificationSelfTest.js";
import { runMembershipSelfTestSuite } from "../membership/membershipSelfTest.js";

/** @type {import('@tetherget/self-test-core').SelfTestResult|null} */
let lastCoreBundle = null;

const LEGACY_TO_CORE = {
  [ADMIN_SELF_TEST_STATUS.PASS]: "PASS",
  [ADMIN_SELF_TEST_STATUS.WARN]: "WARN",
  [ADMIN_SELF_TEST_STATUS.FAIL]: "FAIL",
  pass: "PASS",
  warn: "WARN",
  fail: "FAIL",
};

const CORE_TO_LEGACY = {
  PASS: ADMIN_SELF_TEST_STATUS.PASS,
  WARN: ADMIN_SELF_TEST_STATUS.WARN,
  FAIL: ADMIN_SELF_TEST_STATUS.FAIL,
};

export function toCoreVerdict(legacyStatus) {
  return LEGACY_TO_CORE[String(legacyStatus || "").toLowerCase()] || LEGACY_TO_CORE[legacyStatus] || "PASS";
}

export function fromCoreVerdict(coreStatus) {
  return CORE_TO_LEGACY[coreStatus] || ADMIN_SELF_TEST_STATUS.PASS;
}

/**
 * @param {Array<{ status: string, message: string }>} checks
 * @param {string} suiteId
 */
export function legacyChecksToIssues(checks, suiteId) {
  return (checks || []).map((check, index) => ({
    id: `${suiteId}-${index}`,
    message: check.message || String(check.status),
    status: toCoreVerdict(check.status),
    suiteId,
  }));
}

/**
 * @param {{ id: string, title?: string, checks?: Array<{ status: string, message: string }>, status?: string }} card
 */
export function legacyAdminCardToSuite(card) {
  const issues = legacyChecksToIssues(card.checks || [], card.id);
  const status = resolveSuiteStatusFromIssues(issues);
  return {
    id: card.id,
    label: card.title || card.id,
    status,
    issues,
    passCount: issues.filter((i) => i.status === "PASS").length,
    warnCount: issues.filter((i) => i.status === "WARN").length,
    failCount: issues.filter((i) => i.status === "FAIL").length,
  };
}

/**
 * @param {{ id: string, checks?: Array<{ status: string, message: string }> }} group
 * @param {string} label
 */
export function legacyGroupToSuite(group, label) {
  const issues = legacyChecksToIssues(group.checks || [], group.id);
  const status = resolveSuiteStatusFromIssues(issues);
  return {
    id: group.id,
    label: label || group.id,
    status,
    issues,
    passCount: issues.filter((i) => i.status === "PASS").length,
    warnCount: issues.filter((i) => i.status === "WARN").length,
    failCount: issues.filter((i) => i.status === "FAIL").length,
  };
}

/**
 * @param {object} legacyAdminSuite — return value of runAdminSelfTestSuite
 */
export function adaptAdminLegacySuiteToCore(legacyAdminSuite) {
  const suites = (legacyAdminSuite?.cards || []).map((card) => legacyAdminCardToSuite(card));
  const lastCheckedAtMs = legacyAdminSuite?.lastChecked ?? Date.now();
  return buildSelfTestResult({
    suites,
    mockOnly: true,
    lastCheckedAtMs,
  });
}

/**
 * Extended platform bundle: admin cards + domain MVP suites (dispute, risk, notification, membership).
 * @param {object} [ctx]
 */
export function buildP2pPlatformCoreSuites(ctx = {}) {
  const legacyAdmin = runAdminSelfTestSuite(ctx);
  const suites = (legacyAdmin.cards || []).map((card) => legacyAdminCardToSuite(card));

  const dispute = runDisputeSelfTestSuite();
  (dispute.groups || []).forEach((g) => {
    suites.push(legacyGroupToSuite({ id: `dispute_${g.id}`, checks: g.checks }, `Dispute · ${g.id}`));
  });

  const risk = runRiskGuardSelfTestSuite();
  (risk.groups || []).forEach((g) => {
    suites.push(legacyGroupToSuite({ id: `risk_${g.id}`, checks: g.checks }, `Risk Guard · ${g.id}`));
  });

  const notification = runNotificationSelfTestSuite();
  suites.push(
    legacyGroupToSuite(
      { id: "notification_mvp", checks: notification.checks || [] },
      "Notification Center",
    ),
  );

  const membership = runMembershipSelfTestSuite();
  (membership.cards || []).forEach((c) => {
    suites.push(legacyAdminCardToSuite({ id: `membership_${c.id}`, title: c.title, checks: c.checks }));
  });

  return { legacyAdmin, suites, lastCheckedAtMs: legacyAdmin.lastChecked ?? Date.now() };
}

/**
 * @param {object} [ctx]
 */
export function runP2pSelfTestCoreBundle(ctx = {}) {
  const { suites, lastCheckedAtMs, legacyAdmin } = buildP2pPlatformCoreSuites(ctx);
  const core = buildSelfTestResult({
    suites,
    mockOnly: true,
    lastCheckedAtMs,
  });
  lastCoreBundle = core;
  return {
    core,
    legacyAdmin,
    mockOnly: true,
    adapterVersion: 1,
  };
}

/**
 * Legacy admin suite + core {@link buildSelfTestResult} (admin cards only — fast path for UI).
 * @param {object} [ctx]
 */
export function runP2pSelfTestDualBundle(ctx = {}) {
  const legacy = runAdminSelfTestSuite(ctx);
  const core = adaptAdminLegacySuiteToCore(legacy);
  lastCoreBundle = core;
  return {
    legacy,
    core,
    mockOnly: true,
    adapterVersion: 1,
  };
}

export function getLastP2pSelfTestCoreBundle() {
  return lastCoreBundle;
}

export function clearLastP2pSelfTestCoreBundle() {
  lastCoreBundle = null;
}

/** Cheap wiring check — no network, no WebSocket. */
export function validateP2pSelfTestCoreWiring() {
  const checks = [];
  const push = (status, message) => checks.push({ status, message });

  try {
    const sample = buildSelfTestResult({
      suites: [
        {
          id: "wiring_probe",
          label: "wiring",
          status: "PASS",
          issues: [{ id: "w0", message: "probe", status: "PASS", suiteId: "wiring_probe" }],
          passCount: 1,
          warnCount: 0,
          failCount: 0,
        },
      ],
      mockOnly: true,
    });
    push(sample.mockOnly === true ? "pass" : "fail", "buildSelfTestResult.mockOnly");
    push(sample.overall === "PASS" ? "pass" : "fail", "core overall PASS");
    push(typeof sample.issueCount === "number" ? "pass" : "fail", "core issueCount field");
  } catch (err) {
    push("fail", `buildSelfTestResult: ${err?.message || err}`);
  }

  push(typeof WebSocket === "undefined" ? "pass" : "warn", "no WebSocket in Node wiring test");

  const dual = runP2pSelfTestDualBundle();
  push(dual.legacy?.cards?.length >= 10 ? "pass" : "fail", "dual legacy admin cards");
  push(dual.core?.suites?.length === dual.legacy?.cards?.length ? "pass" : "warn", "dual core suite count");
  push(dual.core?.mockOnly === true ? "pass" : "fail", "dual core mockOnly");

  const platform = runP2pSelfTestCoreBundle();
  push(platform.core.suites.length > dual.core.suites.length ? "pass" : "warn", "platform suites include domain MVPs");

  const status = checks.some((c) => c.status === "fail") ? "fail" : checks.some((c) => c.status === "warn") ? "warn" : "pass";
  return {
    status,
    issueCount: checks.filter((c) => c.status !== "pass").length,
    checks,
    lastChecked: Date.now(),
    _mock: true,
  };
}
