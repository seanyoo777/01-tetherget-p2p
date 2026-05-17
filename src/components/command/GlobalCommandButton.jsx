import { openCommandPalette } from "@tetherget/global-command-palette-core";
import { isTethergetCommandKeyboardShortcutEnabled, isTethergetCommandPaletteEnabled } from "../../command/commandFeatureFlags.js";

export function GlobalCommandButton() {
  if (!isTethergetCommandPaletteEnabled()) return null;

  const shortcutHint = isTethergetCommandKeyboardShortcutEnabled() ? "Ctrl+K" : undefined;

  return (
    <button
      type="button"
      data-testid="global-command-button"
      aria-label="Open command palette"
      title={shortcutHint ? `Quick search (${shortcutHint})` : "Quick search"}
      className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-black/20 px-2 py-1 text-[10px] font-semibold text-zinc-300 hover:border-white/25 hover:text-white"
      onClick={() => openCommandPalette("tetherget")}
    >
      <span aria-hidden>⌕</span>
      <span className="hidden sm:inline">Search</span>
      {shortcutHint ? (
        <kbd className="hidden rounded border border-white/10 px-1 text-[9px] text-zinc-500 lg:inline">{shortcutHint}</kbd>
      ) : null}
    </button>
  );
}
