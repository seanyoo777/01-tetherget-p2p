import { mockAppendAuditEntry } from "../admin/adminSelfTestModel.js";

export const MEMBERSHIP_AUDIT_EVENT = Object.freeze({
  LEVEL_MOCK: "membership.level.mock",
  DISCOUNT_PREVIEW: "membership.discount.preview",
  SYNC_MOCK: "membership.sync.mock",
});

/**
 * @param {Array<{ t: string, line: string }>} trail
 * @param {string} eventType
 * @param {object} [detail]
 */
export function appendMembershipAuditEvent(trail, eventType, detail = {}) {
  const payload = JSON.stringify({ event: eventType, ...detail, _mock: true });
  return mockAppendAuditEntry(trail, payload);
}
