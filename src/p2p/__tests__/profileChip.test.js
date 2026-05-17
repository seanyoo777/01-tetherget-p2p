import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runProfileChipSelfTests } from "@tetherget/global-profile-chip-core";

describe("profile chip (tetherget)", () => {
  it("passes self-test suite", () => {
    const result = runProfileChipSelfTests("tetherget");
    assert.equal(result.overall, "PASS", result.checks.map((c) => `${c.id}: ${c.message}`).join("; "));
  });
});
