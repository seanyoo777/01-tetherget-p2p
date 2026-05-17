import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  adaptAdminLegacySuiteToCore,
  clearLastP2pSelfTestCoreBundle,
  fromCoreVerdict,
  runP2pSelfTestDualBundle,
  runP2pSelfTestCoreBundle,
  toCoreVerdict,
  validateP2pSelfTestCoreWiring,
} from "../p2pSelfTestCoreAdapter.js";
import { runAdminSelfTestSuite } from "../../admin/adminSelfTestEngine.js";
import { ADMIN_SELF_TEST_STATUS } from "../../admin/adminSelfTestModel.js";

describe("p2pSelfTestCoreAdapter", () => {
  beforeEach(() => clearLastP2pSelfTestCoreBundle());

  it("maps legacy verdicts to core uppercase", () => {
    assert.equal(toCoreVerdict("pass"), "PASS");
    assert.equal(toCoreVerdict(ADMIN_SELF_TEST_STATUS.FAIL), "FAIL");
    assert.equal(fromCoreVerdict("WARN"), ADMIN_SELF_TEST_STATUS.WARN);
  });

  it("adaptAdminLegacySuiteToCore uses buildSelfTestResult", () => {
    const legacy = runAdminSelfTestSuite();
    const core = adaptAdminLegacySuiteToCore(legacy);
    assert.equal(core.mockOnly, true);
    assert.equal(core.suites.length, legacy.cards.length);
    assert.ok(["PASS", "WARN", "FAIL"].includes(core.overall));
    assert.equal(typeof core.issueCount, "number");
    assert.ok(core.lastCheckedAtMs > 0);
  });

  it("runP2pSelfTestDualBundle returns legacy and core", () => {
    const dual = runP2pSelfTestDualBundle();
    assert.ok(dual.legacy.cards.length >= 11);
    assert.equal(dual.core.mockOnly, true);
    assert.equal(dual.core.suites.length, dual.legacy.cards.length);
    assert.equal(dual.mockOnly, true);
  });

  it("runP2pSelfTestCoreBundle includes domain suites", () => {
    const platform = runP2pSelfTestCoreBundle();
    assert.ok(platform.core.suites.length > platform.legacyAdmin.cards.length);
    assert.equal(platform.mockOnly, true);
  });

  it("validateP2pSelfTestCoreWiring passes without network", () => {
    const wiring = validateP2pSelfTestCoreWiring();
    assert.notEqual(wiring.status, "fail");
    assert.equal(wiring._mock, true);
    assert.ok(wiring.checks.some((c) => c.message.includes("mockOnly")));
    assert.ok(wiring.checks.some((c) => c.message.includes("WebSocket")));
  });
});
