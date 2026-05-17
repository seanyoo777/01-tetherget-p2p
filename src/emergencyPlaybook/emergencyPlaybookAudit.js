export const EMERGENCY_PLAYBOOK_AUDIT_EVENT = {
  PLAYBOOK_VIEW: "emergency.playbook_view",
  MOCK_ACTION_RECORDED: "emergency.mock_action_recorded",
};

export function appendEmergencyPlaybookAudit(trail, event, detail = {}) {
  const entry = {
    id: `EP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    event,
    detail: { ...detail, _mock: true },
    at: Date.now(),
    mockOnly: true,
  };
  return [entry, ...(Array.isArray(trail) ? trail : [])].slice(0, 200);
}
