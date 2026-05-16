/**
 * P2P admin UTE surface self-test (pure functions, no network).
 */
import { getAdminMockRowsFromUteSurface, mapUteSurfaceOrderToAdminRow } from "./p2pUteFieldAlign.js";

/**
 * Deterministic mock release delay (minutes) from order id.
 * @param {object} row
 */
export function mockReleaseDelayMinutes(row) {
  const id = String(row?.id ?? "");
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return 15 + (Math.abs(h) % 120);
}

/**
 * @param {object|null|undefined} surface — UteSurfacePayload-like
 * @param {{ expectOrderCount?: number }} [opts]
 */
export function validateP2pAdminSurface(surface, opts = {}) {
  const issues = [];
  if (!surface || typeof surface !== "object") {
    return { ok: false, issues: ["surface_missing"], orderCount: 0, alignedCount: 0, _mock: true };
  }

  const orders = surface.orders;
  if (!Array.isArray(orders)) {
    issues.push("orders_not_array");
    return { ok: false, issues, orderCount: 0, alignedCount: 0, _mock: true };
  }

  let alignedCount = 0;
  for (const order of orders) {
    if (!order?.id) {
      issues.push("order_missing_id");
      continue;
    }
    const mapped = mapUteSurfaceOrderToAdminRow(order);
    if (!mapped.escrow_lifecycle) issues.push(`escrow_missing:${order.id}`);
    if (!mapped.db_status && !mapped.status) issues.push(`status_missing:${order.id}`);
    if (mapped.seller_user_id == null && mapped.seller == null) {
      issues.push(`seller_missing:${order.id}`);
    }
    if (mapped.buyer_user_id == null && mapped.buyer == null) {
      issues.push(`buyer_missing:${order.id}`);
    }
    if (!issues.some((x) => String(x).endsWith(order.id))) alignedCount += 1;
  }

  const rows = getAdminMockRowsFromUteSurface(surface, []);
  if (orders.length > 0 && rows.length !== orders.length) {
    issues.push("ute_row_count_mismatch");
  }

  if (opts.expectOrderCount != null && orders.length !== opts.expectOrderCount) {
    issues.push("order_count_expected_mismatch");
  }

  const cacheOk = rows.length === orders.length || orders.length === 0;

  return {
    ok: issues.length === 0 && cacheOk,
    issues,
    orderCount: orders.length,
    alignedCount,
    cacheConsistent: cacheOk,
    _mock: true,
  };
}
