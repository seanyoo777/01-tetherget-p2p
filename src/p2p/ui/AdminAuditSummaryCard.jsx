import React from "react";
import { P2pAdminAuditKpiCards } from "./P2pAdminAuditKpiCards.jsx";

/**
 * Render-only admin audit KPI summary (no store subscriptions).
 * @param {{ theme: object, kpi: object|null|undefined }} props
 */
export function AdminAuditSummaryCard({ theme, kpi }) {
  return <P2pAdminAuditKpiCards theme={theme} kpi={kpi} />;
}

AdminAuditSummaryCard.displayName = "AdminAuditSummaryCard";
