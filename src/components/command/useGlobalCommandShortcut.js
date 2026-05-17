import { useEffect } from "react";
import { isCommandPaletteOpen, toggleCommandPalette } from "@tetherget/global-command-palette-core";
import {
  isTethergetCommandKeyboardShortcutEnabled,
  isTethergetCommandPaletteEnabled,
} from "../../command/commandFeatureFlags.js";

export function useGlobalCommandShortcut() {
  useEffect(() => {
    if (!isTethergetCommandPaletteEnabled() || !isTethergetCommandKeyboardShortcutEnabled()) return;

    const onKey = (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.key.toLowerCase() !== "k") return;
      const tag = e.target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      e.preventDefault();
      toggleCommandPalette("tetherget");
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

export { isCommandPaletteOpen };
