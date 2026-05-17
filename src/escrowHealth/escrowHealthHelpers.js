import { loadDisputeCases } from "../dispute/disputeStore.js";
import { seedDemoDisputeCasesIfEmpty } from "../dispute/disputeHelpers.js";
import { listReleaseBlockedCases } from "../risk/riskGuardHelpers.js";
import { getRiskGuardDiagnostics } from "../risk/riskGuardHelpers.js";
import { loadNotifications, loadActivityFeed } from "../notifications/notificationStore.js";
import { getP2pDevDiagnostics } from "../p2p/p2pDevDiagnostics.js";
import { getLastP2pSelfTestCoreBundle } from "../p2p/p2pSelfTestCoreAdapter.js";
import { computeAdminAuditKpi } from "../p2p/p2pAdminAuditSurface.js";
import { appendEscrowHealthAudit, ESCROW_HEALTH_AUDIT_EVENT } from "./escrowHealthAudit.js";
import { loadEscrowHealthAuditTrail, saveEscrowHealthAuditTrail } from "./escrowHealthStore.js";

const TERMINAL_STATUSES = new Set(["resolved_mock", "rejected_mock"]);

function worstLevel(levels) {
  if (levels.includes("fail")) return "fail";
  if (levels.includes("warn")) return "warn";
  return "pass";
}

function coreToLegacy(core) {
  const u = String(core || "").toUpperCase();
  if (u === "FAIL") return "fail";
  if (u === "WARN") return "warn";
  return "pass";
}

function buildDisputeTrend(cases) {
  const counts = {};
  for (const c of cases) {
    const st = c.status || "unknown";
    counts[st] = (counts[st] || 0) + 1;
  }
  return Object.entries(counts).map(([status, count]) => ({
    status,
    count,
    mockOnly: true,
  }));
}

function buildDisputePressure(cases, platformOrderCount) {
  const active = cases.filter((c) => !TERMINAL_STATUSES.has(c.status));
  const total = Math.max(platformOrderCount, cases.length, 1);
  const ratioPct = Math.round((active.length / total) * 100);
  let level = "pass";
  if (ratioPct >= 40 || active.length >= 5) level = "fail";
  else if (ratioPct >= 15 || active.length >= 2) level = "warn";
  return {
    level,
    label: level === "fail" ? "HIGH" : level === "warn" ? "ELEVATED" : "NORMAL",
    activeCount: active.length,
    totalCount: total,
    ratioPct,
    mockOnly: true,
  };
}

function buildNotificationPressure() {
  const items = loadNotifications();
  const unread = items.filter((n) => !n.read);
  const disputeRelated = items.filter(
    (n) =>
      String(n.type || "").includes("dispute") ||
      String(n.source || "") === "dispute" ||
      String(n.type || "").includes("suspicious"),
  );
  const escrowRelated = items.filter(
    (n) => String(n.type || "").includes("escrow") || String(n.source || "") === "escrow",
  );
  const feed = loadActivityFeed();
  const recentActivityCount = feed.filter((a) => Date.now() - (a.createdAt || 0) < 86_400_000).length;
  let level = "pass";
  if (unread.length >= 10 || disputeRelated.length >= 5) level = "fail";
  else if (unread.length >= 3 || disputeRelated.length >= 2) level = "warn";
  return {
    level,
    unreadCount: unread.length,
    disputeRelatedCount: disputeRelated.length,
    escrowRelatedCount: escrowRelated.length,
    recentActivityCount,
    mockOnly: true,
  };
}

function buildDiagnosticsVerdict(diag) {
  const riskStatus = coreToLegacy(diag.riskGuardStatus);
  let level = worstLevel([
    diag.validationOk ? "pass" : "fail",
    riskStatus,
    coreToLegacy(diag.selfTestCoreOverall),
  ]);
  if ((diag.issueCount ?? 0) > 2) level = worstLevel([level, "fail"]);
  else if ((diag.issueCount ?? 0) > 0) level = worstLevel([level, "warn"]);
  return {
    level,
    validationOk: Boolean(diag.validationOk),
    uteIssueCount: diag.issueCount ?? 0,
    riskGuardStatus: riskStatus,
    selfTestCoreOverall: diag.selfTestCoreOverall ?? null,
    mockOnly: true,
  };
}

function buildAdminSelfTestRef() {
  const core = getLastP2pSelfTestCoreBundle();
  const status = core ? coreToLegacy(core.overall) : "warn";
  return {
    status,
    issueCount: core?.issueCount ?? 0,
    lastChecked: core?.lastCheckedAtMs ?? null,
    coreOverall: core?.overall ?? null,
    mockOnly: true,
  };
}

/**
 * Operational escrow health aggregate (mock, localStorage sources only).
 */
export function buildEscrowHealthSnapshot() {
  seedDemoDisputeCasesIfEmpty();
  const cases = loadDisputeCases();
  const kpi = computeAdminAuditKpi();
  const platformOrders = kpi.tradeCount ?? cases.length;

  const openEscrowCount = cases.filter((c) => !TERMINAL_STATUSES.has(c.status)).length;
  const releaseBlockedCount = listReleaseBlockedCases().length;
  const riskRaw = getRiskGuardDiagnostics();
  const diag = getP2pDevDiagnostics();

  const riskGuardSummary = {
    escrowGuardStatus: riskRaw.escrowGuardStatus,
    issueCount: riskRaw.issueCount,
    blockedCaseCount: riskRaw.blockedCaseCount,
    suspiciousWarnCount: riskRaw.suspiciousWarnCount,
    suspiciousFailCount: riskRaw.suspiciousFailCount,
    lastChecked: riskRaw.lastChecked,
    mockOnly: true,
  };

  const disputePressure = buildDisputePressure(cases, platformOrders);
  const notificationPressure = buildNotificationPressure();
  const diagnosticsVerdict = buildDiagnosticsVerdict(diag);
  const adminSelfTestRef = buildAdminSelfTestRef();
  const disputeTrend = buildDisputeTrend(cases);

  const overviewVerdict = worstLevel([
    disputePressure.level,
    riskGuardSummary.escrowGuardStatus,
    notificationPressure.level,
    diagnosticsVerdict.level,
    adminSelfTestRef.status,
    releaseBlockedCount > 0 ? "warn" : "pass",
    openEscrowCount > 8 ? "warn" : "pass",
  ]);

  return {
    openEscrowCount,
    disputePressure,
    releaseBlockedCount,
    riskGuardSummary,
    notificationPressure,
    diagnosticsVerdict,
    adminSelfTestRef,
    disputeTrend,
    overviewVerdict,
    lastChecked: Date.now(),
    mockOnly: true,
  };
}

export function recordEscrowHealthOverviewView(context = "admin") {
  const snapshot = buildEscrowHealthSnapshot();
  const audit = appendEscrowHealthAudit(loadEscrowHealthAuditTrail(), ESCROW_HEALTH_AUDIT_EVENT.HEALTH_OVERVIEW_VIEW, {
    context,
    overviewVerdict: snapshot.overviewVerdict,
    openEscrowCount: snapshot.openEscrowCount,
    releaseBlockedCount: snapshot.releaseBlockedCount,
  });
  saveEscrowHealthAuditTrail(audit);
  return snapshot;
}

export function getEscrowHealthOverview() {
  return {
    snapshot: buildEscrowHealthSnapshot(),
    auditSample: loadEscrowHealthAuditTrail().slice(0, 5),
    mockOnly: true,
  };
}
