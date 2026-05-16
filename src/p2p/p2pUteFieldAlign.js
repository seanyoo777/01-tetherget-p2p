/**
 * GET /api/admin/p2p/ute-surface 필드명 ↔ P2P UI admin mock 정렬.
 * 기존 mock 키(seller, buyer, escrow, status)는 fallback 으로 유지.
 */

/** @typedef {import('../tetherget/types').UteSurfacePayload} UteSurfacePayload */

/**
 * @param {object} row
 */
export function normalizeAdminMockTradeRow(row) {
  if (!row || typeof row !== "object") return row;
  const escrowLifecycle =
    row.escrow_lifecycle ??
    (row.escrow != null && row.escrow !== "" ? mapLegacyEscrowToLifecycle(row.escrow) : "locked");
  const dbStatus = row.db_status ?? row.status ?? "";
  const lifecycle = row.lifecycle ?? null;
  const sellerId = row.seller_user_id ?? row.seller ?? null;
  const buyerId = row.buyer_user_id ?? row.buyer ?? null;
  const disputeLinked =
    row.dispute_linked ??
    (row.dispute != null && row.dispute !== ""
      ? { lifecycle: String(row.dispute), db_status: String(row.dispute) }
      : null);

  return {
    ...row,
    escrow_lifecycle: escrowLifecycle,
    lifecycle,
    db_status: dbStatus,
    seller_user_id: sellerId,
    buyer_user_id: buyerId,
    dispute_linked: disputeLinked,
    escrow: row.escrow ?? escrowLifecycle,
    status: row.status ?? dbStatus,
    seller: row.seller ?? sellerId,
    buyer: row.buyer ?? buyerId,
    dispute:
      row.dispute ??
      disputeLinked?.lifecycle ??
      disputeLinked?.db_status ??
      null,
  };
}

/**
 * UTE surface order → admin 테이블 행 (legacy 필드 병행).
 * @param {object} order — ute-surface orders[]
 */
export function mapUteSurfaceOrderToAdminRow(order) {
  return normalizeAdminMockTradeRow({
    id: order.id,
    coin: order.coin,
    amount: order.amount,
    unit_price: order.unit_price,
    payment_method: order.payment_method,
    created_at: order.created_at,
    updated_at: order.updated_at,
    matched_at: order.matched_at,
    buyer_payment_started_at: order.buyer_payment_started_at,
    lifecycle: order.lifecycle,
    escrow_lifecycle: order.escrow_lifecycle,
    db_status: order.db_status ?? order.status,
    status: order.db_status ?? order.status,
    seller_user_id: order.seller_user_id,
    buyer_user_id: order.buyer_user_id,
    dispute_linked: order.dispute_linked ?? null,
    escrow: order.escrow_lifecycle,
    seller: order.seller_user_id,
    buyer: order.buyer_user_id,
    dispute: order.dispute_linked?.lifecycle ?? order.dispute_linked?.db_status ?? null,
  });
}

/**
 * @param {UteSurfacePayload|object|null|undefined} surface
 * @param {object[]} [fallbackRows]
 */
export function getAdminMockRowsFromUteSurface(surface, fallbackRows = []) {
  const orders = surface?.orders;
  if (Array.isArray(orders) && orders.length) {
    return orders.map((o) => mapUteSurfaceOrderToAdminRow(o));
  }
  return (Array.isArray(fallbackRows) ? fallbackRows : []).map((r) => normalizeAdminMockTradeRow(r));
}

function mapLegacyEscrowToLifecycle(escrow) {
  if (!escrow) return "locked";
  const e = String(escrow);
  if (e === "waiting_release") return "release_pending";
  if (e === "released") return "released";
  if (e === "refunded") return "cancelled";
  if (e === "disputed") return "disputed";
  return e;
}

/**
 * @param {object} row — normalized admin row
 */
export function pickAdminRowDisplayStatus(row) {
  return row?.db_status ?? row?.status ?? "—";
}

/**
 * @param {object} row
 */
export function pickAdminRowEscrowLifecycle(row) {
  return row?.escrow_lifecycle ?? row?.escrow ?? "—";
}
