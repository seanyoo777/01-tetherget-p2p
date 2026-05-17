import { buildEscrowHealthSnapshot } from "../escrowHealth/escrowHealthHelpers.js";
import { getRiskGuardDiagnostics } from "../risk/riskGuardHelpers.js";
import { appendEmergencyPlaybookAudit, EMERGENCY_PLAYBOOK_AUDIT_EVENT } from "./emergencyPlaybookAudit.js";
import { EMERGENCY_MOCK_ACTIONS } from "./emergencyPlaybookConstants.js";
import {
  loadEmergencyPlaybookAuditTrail,
  loadMockEmergencyActionLog,
  saveEmergencyPlaybookAuditTrail,
  saveMockEmergencyActionLog,
} from "./emergencyPlaybookStore.js";

function worstLevel(levels) {
  if (levels.includes("fail")) return "fail";
  if (levels.includes("warn")) return "warn";
  return "pass";
}

function buildOperatorChecklist(health, risk, releaseMode) {
  const items = [
    {
      id: "verify_no_real_release",
      label: "Confirm mock-only — no real bank/on-chain release",
      required: true,
      completed: true,
    },
    {
      id: "review_open_escrow",
      label: `Review open escrow cases (${health.openEscrowCount})`,
      required: true,
      completed: health.openEscrowCount === 0,
    },
    {
      id: "check_release_blocks",
      label: `Verify release-block list (${health.releaseBlockedCount})`,
      required: true,
      completed: health.releaseBlockedCount > 0,
    },
    {
      id: "dispute_spike_triage",
      label: "Triage dispute spike queue",
      required: health.disputePressure.level !== "pass",
      completed: health.disputePressure.level === "pass",
    },
    {
      id: "risk_guard_status",
      label: `Risk guard status: ${risk.escrowGuardStatus}`,
      required: risk.escrowGuardStatus !== "pass",
      completed: risk.escrowGuardStatus === "pass",
    },
    {
      id: "emergency_block_mode",
      label: "Release-block emergency mode acknowledged",
      required: releaseMode.active,
      completed: releaseMode.active && loadMockEmergencyActionLog().some((e) => e.actionId === EMERGENCY_MOCK_ACTIONS.ENABLE_RELEASE_BLOCK_MODE.id),
    },
  ];
  return items.map((row) => ({ ...row, mockOnly: true }));
}

/**
 * Operational emergency playbook aggregate (mock, local sources only).
 */
export function buildEmergencyPlaybookSnapshot() {
  const health = buildEscrowHealthSnapshot();
  const risk = getRiskGuardDiagnostics();
  const actionLog = loadMockEmergencyActionLog();

  const escrowLevel = worstLevel([
    health.overviewVerdict,
    health.releaseBlockedCount > 3 ? "fail" : health.releaseBlockedCount > 0 ? "warn" : "pass",
  ]);

  const escrowEmergencyState = {
    level: escrowLevel,
    label: escrowLevel === "fail" ? "CRITICAL" : escrowLevel === "warn" ? "ELEVATED" : "STABLE",
    openEscrowCount: health.openEscrowCount,
    releaseBlockedCount: health.releaseBlockedCount,
    mockOnly: true,
  };

  const spikeDetected =
    health.disputePressure.level === "fail" ||
    health.disputePressure.activeCount >= 3 ||
    health.disputePressure.ratioPct >= 20;

  const disputeSpikeWarning = {
    level: health.disputePressure.level,
    activeCount: health.disputePressure.activeCount,
    ratioPct: health.disputePressure.ratioPct,
    spikeDetected,
    message: spikeDetected
      ? `Dispute spike: ${health.disputePressure.activeCount} active (${health.disputePressure.ratioPct}%)`
      : "No dispute spike detected (mock)",
    mockOnly: true,
  };

  const releaseBlockEmergencyMode = {
    active:
      health.releaseBlockedCount >= 2 ||
      risk.escrowGuardStatus === "fail" ||
      actionLog.some((e) => e.actionId === EMERGENCY_MOCK_ACTIONS.ENABLE_RELEASE_BLOCK_MODE.id),
    level: worstLevel([
      health.releaseBlockedCount >= 2 ? "fail" : health.releaseBlockedCount > 0 ? "warn" : "pass",
      risk.escrowGuardStatus,
    ]),
    blockedCaseCount: health.releaseBlockedCount,
    reason:
      health.releaseBlockedCount > 0
        ? "Mock release holds active — emergency block mode available"
        : "No active release blocks",
    mockOnly: true,
  };

  const notificationPressure = {
    level: health.notificationPressure.level,
    unreadCount: health.notificationPressure.unreadCount,
    disputeRelatedCount: health.notificationPressure.disputeRelatedCount,
    mockOnly: true,
  };

  const operatorChecklist = buildOperatorChecklist(health, risk, releaseBlockEmergencyMode);

  const escrowHealthRef = {
    overviewVerdict: health.overviewVerdict,
    openEscrowCount: health.openEscrowCount,
    mockOnly: true,
  };

  const riskGuardRef = {
    escrowGuardStatus: risk.escrowGuardStatus,
    blockedCaseCount: risk.blockedCaseCount,
    mockOnly: true,
  };

  const overviewVerdict = worstLevel([
    escrowEmergencyState.level,
    disputeSpikeWarning.level,
    releaseBlockEmergencyMode.level,
    notificationPressure.level,
    riskGuardRef.escrowGuardStatus,
    escrowHealthRef.overviewVerdict,
  ]);

  return {
    escrowEmergencyState,
    disputeSpikeWarning,
    releaseBlockEmergencyMode,
    notificationPressure,
    operatorChecklist,
    mockEmergencyActionLog: actionLog.slice(0, 20),
    escrowHealthRef,
    riskGuardRef,
    overviewVerdict,
    lastChecked: Date.now(),
    mockOnly: true,
  };
}

export function recordEmergencyPlaybookView(context = "admin") {
  const snapshot = buildEmergencyPlaybookSnapshot();
  const audit = appendEmergencyPlaybookAudit(loadEmergencyPlaybookAuditTrail(), EMERGENCY_PLAYBOOK_AUDIT_EVENT.PLAYBOOK_VIEW, {
    context,
    overviewVerdict: snapshot.overviewVerdict,
    spikeDetected: snapshot.disputeSpikeWarning.spikeDetected,
    releaseBlockEmergencyMode: snapshot.releaseBlockEmergencyMode.active,
  });
  saveEmergencyPlaybookAuditTrail(audit);
  return snapshot;
}

/**
 * Record a mock emergency operator action (no real release / no API).
 * @param {string} actionId
 * @param {string} [operatorId]
 * @param {Record<string, unknown>} [detail]
 */
export function recordMockEmergencyAction(actionId, operatorId = "operator_mock", detail = {}) {
  const actionDef = Object.values(EMERGENCY_MOCK_ACTIONS).find((a) => a.id === actionId);
  const label = actionDef?.label ?? actionId;
  const entry = {
    id: `EMA-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    actionId,
    label,
    operatorId,
    detail: { ...detail, noRealRelease: true, _mock: true },
    at: Date.now(),
    mockOnly: true,
  };
  const log = [entry, ...loadMockEmergencyActionLog()].slice(0, 100);
  saveMockEmergencyActionLog(log);

  const audit = appendEmergencyPlaybookAudit(loadEmergencyPlaybookAuditTrail(), EMERGENCY_PLAYBOOK_AUDIT_EVENT.MOCK_ACTION_RECORDED, {
    actionId,
    operatorId,
    label,
  });
  saveEmergencyPlaybookAuditTrail(audit);
  return { entry, snapshot: buildEmergencyPlaybookSnapshot() };
}

export function getEmergencyPlaybookOverview() {
  return {
    snapshot: buildEmergencyPlaybookSnapshot(),
    auditSample: loadEmergencyPlaybookAuditTrail().slice(0, 5),
    mockOnly: true,
  };
}
