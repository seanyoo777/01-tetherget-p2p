export const RISK_GUARD_AUDIT_EVENT = {
  RELEASE_BLOCKED: "risk.guard.release_blocked",
  RELEASE_ATTEMPT_DENIED_MOCK: "risk.guard.release_attempt_denied_mock",
  RELEASE_UNBLOCKED_MOCK: "risk.guard.release_unblocked_mock",
  GUARD_STATUS_CHANGED: "risk.guard.status_changed",
  RESOLVE_SYNC_MOCK: "risk.guard.resolve_sync_mock",
};

export function appendRiskGuardAudit(trail, event, detail = {}) {
  const entry = {
    id: `RG-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    event,
    detail: { ...detail, _mock: true },
    at: Date.now(),
    mockOnly: true,
  };
  return [entry, ...(Array.isArray(trail) ? trail : [])].slice(0, 200);
}
