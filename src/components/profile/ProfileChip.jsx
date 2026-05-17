import { useEffect, useMemo, useRef, useState } from "react";
import {
  appendProfileChipAudit,
  appendProfileDropdownAudit,
  DEFAULT_ONEAI_PROFILE_HUB_PATH,
  isProfileChipDropdownEnabled,
  isProfileChipEnabled,
  isProfileCrossAppLinkEnabled,
  PROFILE_DROPDOWN_LINK_IDS,
} from "@tetherget/global-profile-chip-core";
import { useProfileChipLive } from "../../hooks/useProfileChipLive.js";
import { ProfileChipDropdown } from "./ProfileChipDropdown.jsx";

/**
 * Read-only global profile chip (mock-first, localStorage).
 * @param {{
 *   compact?: boolean;
 *   theme?: { headerControl?: string; input?: string; popover?: string; card?: string; muted?: string };
 *   onQuickLink?: (linkId: string) => void;
 *   showAdmin?: boolean;
 * }} props
 */
export function ProfileChip({ compact = false, theme, onQuickLink, showAdmin = false }) {
  const enabled = useMemo(() => isProfileChipEnabled(), []);
  const dropdownEnabled = useMemo(() => isProfileChipDropdownEnabled(), []);
  const { view, profile, pulse } = useProfileChipLive("tetherget");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const renderedRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    if (renderedRef.current) return;
    renderedRef.current = true;
    appendProfileChipAudit("profile.chip.rendered", "tetherget", `source=${view.source}`);
    if (view.isMockProfile) appendProfileChipAudit("profile.chip.fallback_used", "tetherget");
  }, [enabled, view.source, view.isMockProfile]);

  useEffect(() => {
    if (!dropdownOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        appendProfileDropdownAudit("tetherget", "profile.dropdown.closed", "escape");
        setDropdownOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dropdownOpen]);

  if (!enabled) return null;

  const control = theme?.headerControl ?? theme?.input ?? "border border-slate-600 bg-slate-800";

  const chipBody = (
    <>
      <span
        className="shrink-0 rounded-full"
        style={{ width: compact ? 8 : 10, height: compact ? 8 : 10, background: view.avatarColor }}
        aria-hidden
      />
      {!compact ? (
        <span className="min-w-0 text-left">
          <span className="block truncate">{view.nickname}</span>
          <span className="block truncate text-[8px] font-medium opacity-80">
            Lv.{view.oneAiLevel} · {view.platformBadge}
          </span>
        </span>
      ) : (
        <span className="truncate">{view.nickname}</span>
      )}
      {view.isMockProfile ? (
        <span className="shrink-0 rounded border border-amber-500/60 px-0.5 text-[7px] font-black text-amber-400">
          mock
        </span>
      ) : null}
    </>
  );

  const chipClass = `inline-flex max-w-full items-center gap-1 rounded-lg border font-semibold leading-none ${control} ${
    compact ? "h-7 px-1.5 text-[9px]" : "h-8 max-w-[11rem] px-2 py-1 text-[10px] sm:max-w-[14rem] sm:text-[11px]"
  }${pulse ? " profile-chip-sync-pulse" : ""}`;

  if (dropdownEnabled) {
    const toggle = () => {
      setDropdownOpen((prev) => {
        const next = !prev;
        appendProfileDropdownAudit(
          "tetherget",
          next ? "profile.dropdown.opened" : "profile.dropdown.closed",
          next ? "chip-click" : "chip-click-toggle-off",
        );
        return next;
      });
    };

    return (
      <div className="relative shrink-0">
        <button
          type="button"
          data-testid={compact ? "profile-chip-compact" : "profile-chip"}
          data-profile-chip-variant="dropdown"
          aria-expanded={dropdownOpen}
          aria-haspopup="dialog"
          aria-label={`Profile ${view.nickname}`}
          className={chipClass}
          onClick={toggle}
        >
          {chipBody}
        </button>
        <ProfileChipDropdown
          open={dropdownOpen}
          onClose={() => setDropdownOpen(false)}
          view={view}
          profile={profile}
          theme={theme}
          onQuickLink={onQuickLink}
          showAdmin={showAdmin}
        />
      </div>
    );
  }

  const onLegacyClick = () => {
    appendProfileChipAudit("profile.chip.link_clicked", "tetherget");
    if (isProfileCrossAppLinkEnabled()) {
      const hub = import.meta.env?.VITE_ONEAI_PROFILE_HUB_URL ?? DEFAULT_ONEAI_PROFILE_HUB_PATH;
      if (typeof hub === "string" && hub.startsWith("http")) {
        window.open(hub, "_blank", "noopener,noreferrer");
      }
    }
  };

  return (
    <button
      type="button"
      data-testid={compact ? "profile-chip-compact" : "profile-chip"}
      data-profile-chip-variant="link"
      aria-label={`Profile ${view.nickname}`}
      onClick={onLegacyClick}
      className={chipClass}
    >
      {chipBody}
    </button>
  );
}

export { PROFILE_DROPDOWN_LINK_IDS };
