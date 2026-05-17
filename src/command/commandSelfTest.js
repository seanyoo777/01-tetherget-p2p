import { runCommandPaletteCoreSelfTests } from "@tetherget/global-command-palette-core";
import { buildTethergetCommandRegistry } from "./commandRegistry.js";
import { assertTethergetCommandFlagsRegistered } from "./commandFeatureFlags.js";

/**
 * @returns {import('@tetherget/global-command-palette-core').CommandSelfTestCheck[]}
 */
export function runTethergetCommandPaletteSelfTests() {
  const registry = buildTethergetCommandRegistry();
  const checks = runCommandPaletteCoreSelfTests({
    registry,
    skipBrowserChecks: typeof window === "undefined",
  });
  const flags = assertTethergetCommandFlagsRegistered();
  checks.push({
    id: "command.tetherget.flags",
    label: "TetherGet command flags",
    status: flags.ok ? "PASS" : "FAIL",
    message: flags.message,
  });
  return checks;
}
