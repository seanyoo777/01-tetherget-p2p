import {
  assertCommandPaletteFlagsRegistered,
  isCommandKeyboardShortcutEnabled,
  isCommandPaletteEnabled,
  isCommandRecentEnabled,
} from "@tetherget/global-command-palette-core";
import { isProfileChipEnabled } from "@tetherget/global-profile-chip-core";

export function isTethergetCommandPaletteEnabled() {
  return isCommandPaletteEnabled() && isProfileChipEnabled();
}

export function isTethergetCommandKeyboardShortcutEnabled() {
  return isTethergetCommandPaletteEnabled() && isCommandKeyboardShortcutEnabled();
}

export function isTethergetCommandRecentEnabled() {
  return isTethergetCommandPaletteEnabled() && isCommandRecentEnabled();
}

export function assertTethergetCommandFlagsRegistered() {
  return assertCommandPaletteFlagsRegistered();
}
