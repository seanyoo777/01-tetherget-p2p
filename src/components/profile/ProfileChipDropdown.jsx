import {
  appendProfileDropdownAudit,
  buildProfileDropdownDetailRows,
  buildProfileDropdownMetaRows,
  listProfileDropdownQuickLinks,
} from "@tetherget/global-profile-chip-core";

const PLATFORM = "tetherget";

/**
 * @param {{
 *   open: boolean;
 *   onClose: () => void;
 *   view: import("@tetherget/global-profile-chip-core").ProfileChipView;
 *   profile: import("@tetherget/global-profile-chip-core").GlobalUserProfileRow;
 *   theme?: { popover?: string; card?: string; muted?: string };
 *   onQuickLink?: (linkId: string) => void;
 *   showAdmin?: boolean;
 * }} props
 */
export function ProfileChipDropdown({ open, onClose, view, profile, theme, onQuickLink, showAdmin }) {
  if (!open) return null;

  const t = theme ?? {};
  const panel = t.popover ?? t.card ?? "border border-slate-600 bg-slate-900 text-white";
  const muted = t.muted ?? "text-slate-400";

  const detailRows = buildProfileDropdownDetailRows(PLATFORM, profile, view);
  const metaRows = buildProfileDropdownMetaRows(view);
  const links = listProfileDropdownQuickLinks(PLATFORM, { admin: !!showAdmin });

  const auditLink = (id, detail) => {
    appendProfileDropdownAudit(PLATFORM, "profile.dropdown.link_clicked", detail ?? id);
    onQuickLink?.(id);
    onClose();
  };

  const closeWith = (reason) => {
    appendProfileDropdownAudit(PLATFORM, "profile.dropdown.closed", reason);
    onClose();
  };

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[400] bg-black/50 md:bg-transparent"
        aria-label="Close profile menu"
        data-testid="profile-chip-dropdown-backdrop"
        onClick={() => closeWith("backdrop")}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Profile menu"
        data-testid="profile-chip-dropdown"
        className={`fixed inset-x-0 bottom-0 z-[401] max-h-[min(85dvh,520px)] overflow-y-auto rounded-t-2xl shadow-xl md:absolute md:inset-x-auto md:bottom-auto md:right-0 md:top-[calc(100%+0.35rem)] md:max-h-[min(70dvh,480px)] md:w-[min(20rem,92vw)] md:rounded-xl ${panel}`}
      >
        <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">{view.nickname}</p>
            <p className={`text-[10px] ${muted}`}>
              Lv.{view.oneAiLevel} · {view.platformBadge}
            </p>
          </div>
          <button
            type="button"
            data-testid="profile-chip-dropdown-close"
            className="shrink-0 rounded border border-white/20 px-2 py-0.5 text-[10px]"
            onClick={() => closeWith("close-button")}
          >
            닫기
          </button>
        </div>

        <dl className="space-y-1 px-3 py-2 text-[10px]">
          {detailRows.map((row) => (
            <div key={row.label} className="flex justify-between gap-2">
              <dt className={muted}>{row.label}</dt>
              <dd className="truncate font-medium">{row.value}</dd>
            </div>
          ))}
        </dl>

        <dl className={`space-y-1 border-t border-white/10 px-3 py-2 text-[9px] ${muted}`}>
          {metaRows.map((row) => (
            <div key={row.label} className="flex justify-between gap-2">
              <dt>{row.label}</dt>
              <dd className="truncate">{row.value}</dd>
            </div>
          ))}
        </dl>

        <nav className="flex flex-col gap-0.5 border-t border-white/10 px-2 py-2">
          {links.map((link) => (
            <button
              key={link.id}
              type="button"
              data-testid={`profile-chip-dropdown-link-${link.id}`}
              className="rounded-lg px-2 py-1.5 text-left text-[11px] font-semibold hover:bg-white/5"
              onClick={() => auditLink(link.id, link.label)}
            >
              {link.label}
            </button>
          ))}
        </nav>

        <p className={`px-3 pb-3 text-[9px] ${muted}`}>
          Read-only mock · entity global-profile-chip · no auth/KYC/wallet
        </p>
      </div>
    </>
  );
}
