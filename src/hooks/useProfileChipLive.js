import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  appendProfileChipAudit,
  buildProfileChipSyncToken,
  createProfileChipLiveSnapshot,
  subscribeGlobalProfileSync,
} from "@tetherget/global-profile-chip-core";

/**
 * Live profile chip snapshot (storage + CustomEvent; no polling).
 * @param {"tetherget"} platform
 */
export function useProfileChipLive(platform) {
  const token = useSyncExternalStore(
    (onStore) => subscribeGlobalProfileSync(platform, onStore),
    () => buildProfileChipSyncToken(platform),
    () => "ssr",
  );

  const snapshot = createProfileChipLiveSnapshot(platform);
  const [pulse, setPulse] = useState(false);
  const lastToken = useRef("");

  useEffect(() => {
    if (!lastToken.current) {
      lastToken.current = token;
      return;
    }
    if (token === lastToken.current) return;
    lastToken.current = token;
    appendProfileChipAudit("profile.chip.synced", platform, token);
    setPulse(true);
    const timer = window.setTimeout(() => setPulse(false), 700);
    return () => window.clearTimeout(timer);
  }, [token, platform]);

  return { ...snapshot, token, pulse };
}
