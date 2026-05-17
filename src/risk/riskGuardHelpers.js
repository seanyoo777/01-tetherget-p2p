import { getDisputeCaseByOrderId, isReleaseBlocked } from "../dispute/disputeHelpers.js";
import { loadDisputeCases } from "../dispute/disputeStore.js";
import { appendActivityItem, emitNotificationEvent } from "../notifications/notificationHelpers.js";
import { appendRiskGuardAudit, RISK_GUARD_AUDIT_EVENT } from "./riskGuardAudit.js";
import {
  loadRiskGuardAuditTrail,
  loadRiskGuardMeta,
  saveRiskGuardAuditTrail,
  saveRiskGuardMeta,
} from "./riskGuardStore.js";

function worstLevel(levels) {
  if (levels.includes("fail")) return "fail";
  if (levels.includes("warn")) return "warn";
  return "pass";
}

function issue(code, level, message) {
  return { code, level, message, mockOnly: true };
}

export function evaluateSuspiciousPartyRisk(disputeCase) {
  if (!disputeCase) return { buyer: "pass", seller: "pass", aggregate: "pass", issues: [] };
  const issues = [];
  let buyer = "pass";
  let seller = "pass";

  if (disputeCase.suspiciousBuyer) {
    buyer = disputeCase.priority === "critical" ? "fail" : "warn";
    issues.push(
      issue(
        "suspicious_buyer",
        buyer,
        `구매자 의심 플래그 (${buyer === "fail" ? "FAIL" : "WARN"})`,
      ),
    );
  }
  if (disputeCase.suspiciousSeller) {
    seller = disputeCase.priority === "critical" ? "fail" : "warn";
    issues.push(
      issue(
        "suspicious_seller",
        seller,
        `판매자 의심 플래그 (${seller === "fail" ? "FAIL" : "WARN"})`,
      ),
    );
  }
  if (disputeCase.priority === "critical") {
    issues.push(issue("critical_priority", "fail", "critical priority → FAIL"));
  }

  return {
    buyer,
    seller,
    aggregate: worstLevel([buyer, seller, disputeCase.priority === "critical" ? "fail" : "pass"]),
    issues,
  };
}

export function evaluateEscrowReleaseGuard(disputeCase) {
  const now = Date.now();
  if (!disputeCase) {
    return {
      status: "pass",
      releaseBlocked: false,
      canMockRelease: true,
      issues: [],
      blockReasons: [],
      lastChecked: now,
      mockOnly: true,
    };
  }

  const blocked = isReleaseBlocked(disputeCase);
  const party = evaluateSuspiciousPartyRisk(disputeCase);
  const issues = [...party.issues];
  const blockReasons = [];

  if (blocked) {
    blockReasons.push("releaseBlocked flag active (mock)");
    issues.push(issue("release_blocked", "fail", "Escrow release blocked (mock)"));
  }
  if (disputeCase.escrowStatus === "dispute_opened") {
    blockReasons.push("escrowStatus=dispute_opened");
    issues.push(issue("dispute_opened", "fail", "분쟁 진행 중 — dispute_opened"));
  }
  if (disputeCase.escrowStatus === "manual_hold") {
    blockReasons.push("escrowStatus=manual_hold");
    issues.push(issue("manual_hold", "warn", "수동 홀드 — mock release 검토 필요"));
  }
  if (blocked && disputeCase.escrowStatus !== "dispute_opened" && disputeCase.escrowStatus !== "manual_hold") {
    issues.push(issue("escrow_dispute_hold", "warn", `escrow ${disputeCase.escrowStatus} + block`));
  }

  let status = worstLevel(issues.map((i) => i.level));
  if (!blocked && status === "fail" && !party.issues.some((i) => i.level === "fail")) {
    status = party.aggregate;
  }
  if (!blocked && party.aggregate !== "pass" && status === "pass") {
    status = party.aggregate;
  }
  if (blocked && disputeCase.escrowStatus === "dispute_opened") {
    status = "fail";
  }

  const snapshot = {
    status,
    releaseBlocked: blocked,
    canMockRelease: !blocked,
    issues,
    blockReasons,
    caseId: disputeCase.caseId,
    orderId: disputeCase.orderId,
    escrowStatus: disputeCase.escrowStatus,
    lastChecked: now,
    mockOnly: true,
  };

  return snapshot;
}

/** Persist last-checked meta (event/effect paths only — not during render reads). */
export function touchRiskGuardDiagnosticsMeta(atMs = Date.now()) {
  saveRiskGuardMeta({ lastChecked: atMs });
}

export function listReleaseBlockedCases() {
  return loadDisputeCases().filter((c) => isReleaseBlocked(c));
}

export function recordReleaseBlockReason(disputeCase, reason = "dispute_opened") {
  if (!disputeCase?.caseId) return null;
  touchRiskGuardDiagnosticsMeta();
  const guard = evaluateEscrowReleaseGuard(disputeCase);
  const audit = appendRiskGuardAudit(loadRiskGuardAuditTrail(), RISK_GUARD_AUDIT_EVENT.RELEASE_BLOCKED, {
    caseId: disputeCase.caseId,
    orderId: disputeCase.orderId,
    reason,
    blockReasons: guard.blockReasons,
    status: guard.status,
  });
  saveRiskGuardAuditTrail(audit);

  const message = `릴리스 차단: ${disputeCase.orderId} (${reason}) — ${guard.blockReasons.join("; ") || "mock"}`;
  appendActivityItem({
    actor: "risk_guard",
    action: RISK_GUARD_AUDIT_EVENT.RELEASE_BLOCKED,
    targetType: "dispute",
    targetId: disputeCase.caseId,
    message,
  });
  return guard;
}

export function syncGuardAfterDisputeFinalize(disputeCase, operatorId, resolutionStatus) {
  if (!disputeCase?.caseId) return null;
  touchRiskGuardDiagnosticsMeta();
  const guard = evaluateEscrowReleaseGuard(disputeCase);
  const audit = appendRiskGuardAudit(loadRiskGuardAuditTrail(), RISK_GUARD_AUDIT_EVENT.RESOLVE_SYNC_MOCK, {
    caseId: disputeCase.caseId,
    operatorId,
    resolutionStatus,
    releaseBlocked: disputeCase.releaseBlocked,
    guardStatus: guard.status,
  });
  saveRiskGuardAuditTrail(audit);

  if (!disputeCase.releaseBlocked) {
    const unblocked = appendRiskGuardAudit(audit, RISK_GUARD_AUDIT_EVENT.RELEASE_UNBLOCKED_MOCK, {
      caseId: disputeCase.caseId,
      operatorId,
    });
    saveRiskGuardAuditTrail(unblocked);
    appendActivityItem({
      actor: operatorId || "admin",
      action: RISK_GUARD_AUDIT_EVENT.RELEASE_UNBLOCKED_MOCK,
      targetType: "dispute",
      targetId: disputeCase.caseId,
      message: `Mock release guard cleared after ${resolutionStatus}`,
    });
  }

  appendActivityItem({
    actor: operatorId || "admin",
    action: RISK_GUARD_AUDIT_EVENT.RESOLVE_SYNC_MOCK,
    targetType: "dispute",
    targetId: disputeCase.caseId,
    message: `Guard sync: ${guard.status} · releaseBlocked=${disputeCase.releaseBlocked}`,
  });

  return guard;
}

export function mockAttemptEscrowRelease(disputeCase, operatorId = "ADMIN-MOCK") {
  touchRiskGuardDiagnosticsMeta();
  const guard = evaluateEscrowReleaseGuard(disputeCase);
  if (!guard.canMockRelease) {
    const audit = appendRiskGuardAudit(loadRiskGuardAuditTrail(), RISK_GUARD_AUDIT_EVENT.RELEASE_ATTEMPT_DENIED_MOCK, {
      caseId: disputeCase?.caseId,
      orderId: disputeCase?.orderId,
      operatorId,
      status: guard.status,
      blockReasons: guard.blockReasons,
    });
    saveRiskGuardAuditTrail(audit);
    const message = `Mock release DENIED · ${disputeCase?.orderId || "—"} (${guard.blockReasons.join(", ") || "blocked"})`;
    emitNotificationEvent("escrow.release.blocked_mock", {
      orderId: disputeCase?.orderId,
      caseId: disputeCase?.caseId,
      message,
    });
    appendActivityItem({
      actor: operatorId,
      action: RISK_GUARD_AUDIT_EVENT.RELEASE_ATTEMPT_DENIED_MOCK,
      targetType: "escrow",
      targetId: disputeCase?.caseId || disputeCase?.orderId || "unknown",
      message,
    });
    return { ok: false, guard, message };
  }

  appendActivityItem({
    actor: operatorId,
    action: "escrow.release.mock_simulated",
    targetType: "escrow",
    targetId: disputeCase?.orderId || "unknown",
    message: `[MOCK] Would release escrow for ${disputeCase?.orderId} — no on-chain/bank API`,
  });
  return {
    ok: true,
    guard,
    message: "[MOCK] Release simulated only — no real transfer",
  };
}

/** Pure diagnostics read (no localStorage writes). */
export function getRiskGuardDiagnosticsSnapshot() {
  const cases = loadDisputeCases();
  const blocked = cases.filter((c) => isReleaseBlocked(c));
  let suspiciousWarnCount = 0;
  let suspiciousFailCount = 0;
  let worst = "pass";

  cases.forEach((c) => {
    const party = evaluateSuspiciousPartyRisk(c);
    if (party.buyer === "warn" || party.seller === "warn") suspiciousWarnCount += 1;
    if (party.buyer === "fail" || party.seller === "fail") suspiciousFailCount += 1;
    const g = evaluateEscrowReleaseGuard(c);
    worst = worstLevel([worst, g.status]);
  });

  const issueCount =
    blocked.length +
    suspiciousFailCount +
    (worst === "fail" ? 1 : 0);

  const meta = loadRiskGuardMeta();
  const lastChecked = meta?.lastChecked || 0;

  return {
    escrowGuardStatus: worst,
    issueCount,
    blockedCaseCount: blocked.length,
    suspiciousWarnCount,
    suspiciousFailCount,
    lastChecked,
    mockOnly: true,
  };
}

export function getRiskGuardDiagnostics() {
  return getRiskGuardDiagnosticsSnapshot();
}

/**
 * Pre-flight for seller complete / mock release buttons (no API, no on-chain).
 * @param {string} orderId
 */
export function checkMockEscrowReleaseForOrder(orderId) {
  const disputeCase = getDisputeCaseByOrderId(orderId);
  if (!disputeCase) {
    return { allowed: true, disputeCase: null, guard: null, message: null };
  }
  const guard = evaluateEscrowReleaseGuard(disputeCase);
  if (!guard.canMockRelease || disputeCase.escrowStatus === "dispute_opened") {
    return {
      allowed: false,
      disputeCase,
      guard,
      message: `[MOCK] 릴리스 차단 — ${orderId} (${guard.blockReasons.join(", ") || "dispute"})`,
    };
  }
  return { allowed: true, disputeCase, guard, message: null };
}

export function getAdminRiskGuardOverview() {
  const blocked = listReleaseBlockedCases();
  const snapshots = blocked.map((c) => evaluateEscrowReleaseGuard(c));
  const diagnostics = getRiskGuardDiagnostics();
  return {
    diagnostics,
    blockedCases: blocked,
    snapshots,
    auditSample: loadRiskGuardAuditTrail().slice(0, 5),
    mockOnly: true,
  };
}
