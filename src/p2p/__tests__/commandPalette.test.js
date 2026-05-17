import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { filterCommands } from "@tetherget/global-command-palette-core";
import { buildTethergetCommandRegistry } from "../../command/commandRegistry.js";
import { runTethergetCommandPaletteSelfTests } from "../../command/commandSelfTest.js";

describe("tetherget command palette", () => {
  it("registry has required mock commands", () => {
    const registry = buildTethergetCommandRegistry();
    const ids = new Set(registry.map((c) => c.id));
    for (const id of [
      "tg-my-info",
      "tg-membership",
      "tg-p2p-trade",
      "tg-fee-preview",
      "tg-help-center",
      "tg-oneai-profile",
    ]) {
      assert.ok(ids.has(id), `missing ${id}`);
    }
    assert.ok(registry.every((c) => c.mockOnly === true));
  });

  it("filters locally without API", () => {
    const registry = buildTethergetCommandRegistry();
    const out = filterCommands(registry, "membership");
    assert.ok(out.some((c) => c.id === "tg-membership"));
  });

  it("self-test passes in Node", () => {
    const checks = runTethergetCommandPaletteSelfTests();
    assert.ok(!checks.some((c) => c.status === "FAIL"), checks.filter((c) => c.status === "FAIL").map((c) => c.message).join("; "));
  });
});
