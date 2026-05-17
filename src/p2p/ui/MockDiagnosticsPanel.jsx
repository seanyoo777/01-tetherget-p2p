import React, { useCallback, useEffect, useSyncExternalStore } from "react";
import { P2pDevDiagnosticsPanel } from "./P2pDevDiagnosticsPanel.jsx";
import {
  getP2pDiagnosticsSnapshotRevision,
  refreshP2pDiagnosticsSnapshot,
  subscribeP2pDiagnosticsSnapshot,
} from "../p2pDiagnosticsSnapshot.js";

function subscribeRevision(onStoreChange) {
  return subscribeP2pDiagnosticsSnapshot(onStoreChange);
}

function getRevisionSnapshot() {
  return getP2pDiagnosticsSnapshotRevision();
}

/**
 * Mock diagnostics strip (render-only display; snapshot refresh in effects).
 * @alias for shared Self-Test / diagnostics naming across TetherGet platforms.
 */
export function MockDiagnosticsPanel(props) {
  const revision = useSyncExternalStore(subscribeRevision, getRevisionSnapshot, () => 0);

  const bumpRefresh = useCallback(() => {
    refreshP2pDiagnosticsSnapshot({ persist: true });
  }, []);

  useEffect(() => {
    bumpRefresh();
  }, [bumpRefresh, props.diagnosticsRevision]);

  return <P2pDevDiagnosticsPanel {...props} diagnosticsRevision={revision} />;
}

MockDiagnosticsPanel.displayName = "MockDiagnosticsPanel";
