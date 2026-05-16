import React, { useEffect, useState } from "react";
import { refreshAdminPlatformSurface } from "../mock/adminPlatformMock";
import { MOCK_UTE_SURFACE_SNAPSHOT } from "../mock/p2pTradeFlowMock.js";
import { P2pDevDiagnosticsPanel } from "../p2p/ui/P2pDevDiagnosticsPanel.jsx";
import { P2pEscrowLifecycleLegend } from "../p2p/ui/P2pEscrowLifecycleLegend.jsx";
import { P2P_TEST_IDS } from "../p2p/p2pTestIds.js";
import { isSimpleAdminSmokePath } from "../p2p/p2pSmokeJwtFixture.js";

export { isSimpleAdminSmokePath };

const smokeTheme = {
  muted: "text-neutral-500",
  card: "rounded border border-neutral-300 bg-white p-3",
  cardSoft: "bg-neutral-50",
};

/** Playwright 전용 — mock UTE refresh + diagnostics (실제 인증 없음). */
const mockSmokeApi = {
  request: async (path) => {
    if (String(path).includes("/api/admin/p2p/ute-surface")) {
      return { ...MOCK_UTE_SURFACE_SNAPSHOT, mock_only: true };
    }
    return { ok: true, _mock: true };
  },
};

export default function SimpleAdminSmokeRoute() {
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void refreshAdminPlatformSurface(mockSmokeApi).then(() => {
      if (!cancelled) setRevision((r) => r + 1);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      data-testid={P2P_TEST_IDS.simpleAdminSmokeRoot}
      className="mx-auto max-w-3xl space-y-3 p-4"
    >
      <h1 className="text-sm font-black">SimpleAdmin smoke · P2P diagnostics (mock)</h1>
      <p className="text-xs text-neutral-500">No real auth · no server notify · route `/smoke/simple-admin`</p>
      <P2pDevDiagnosticsPanel theme={smokeTheme} showDevDiagnostics diagnosticsRevision={revision} mode="full" />
      <P2pDevDiagnosticsPanel theme={smokeTheme} showDevDiagnostics diagnosticsRevision={revision} mode="strip" />
      <P2pDevDiagnosticsPanel theme={smokeTheme} showDevDiagnostics diagnosticsRevision={revision} mode="badge-only" />
      <P2pEscrowLifecycleLegend theme={smokeTheme} compact />
    </div>
  );
}
