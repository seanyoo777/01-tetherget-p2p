export const ESCROW_HEALTH_AUDIT_EVENT = {
  HEALTH_OVERVIEW_VIEW: "escrow.health_overview_view",
};

export function appendEscrowHealthAudit(trail, event, detail = {}) {
  const entry = {
    id: `EH-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    event,
    detail: { ...detail, _mock: true },
    at: Date.now(),
    mockOnly: true,
  };
  return [entry, ...(Array.isArray(trail) ? trail : [])].slice(0, 200);
}
