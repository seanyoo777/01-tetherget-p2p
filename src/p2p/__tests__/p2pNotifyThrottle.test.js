import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  buildP2pValidationNotifyFingerprint,
  shouldThrottleP2pRefreshNotify,
  notifyP2pRefreshValidation,
  clearP2pRefreshNotifyThrottle,
  isP2pDiagnosticsEnabled,
  resolveShowP2pDevDiagnostics,
} from "../p2pDevDiagnostics.js";

const okValidation = {
  ok: true,
  issueCount: 0,
  orderCount: 2,
  alignedCount: 2,
  issues: [],
};

describe("notify throttle", () => {
  beforeEach(() => clearP2pRefreshNotifyThrottle());

  it("blocks duplicate validation toast within throttle window", () => {
    const first = shouldThrottleP2pRefreshNotify(okValidation);
    assert.equal(first.emit, true);
    notifyP2pRefreshValidation(okValidation, () => {});

    const second = shouldThrottleP2pRefreshNotify(okValidation);
    assert.equal(second.emit, false);
    assert.equal(second.throttled, true);
  });

  it("emits again when validation fingerprint changes", () => {
    notifyP2pRefreshValidation(okValidation, () => {});
    const changed = shouldThrottleP2pRefreshNotify({ ...okValidation, issueCount: 1, ok: false });
    assert.equal(changed.emit, true);
  });

  it("force bypasses throttle for manual refresh", () => {
    notifyP2pRefreshValidation(okValidation, () => {});
    const forced = shouldThrottleP2pRefreshNotify(okValidation, { force: true });
    assert.equal(forced.emit, true);
    assert.equal(forced.throttled, false);
  });

  it("notifyP2pRefreshValidation only calls fn when emit", () => {
    let count = 0;
    notifyP2pRefreshValidation(okValidation, () => {
      count += 1;
    });
    notifyP2pRefreshValidation(okValidation, () => {
      count += 1;
    });
    assert.equal(count, 1);
  });

  it("fingerprint is stable for same validation", () => {
    const a = buildP2pValidationNotifyFingerprint(okValidation);
    const b = buildP2pValidationNotifyFingerprint({ ...okValidation });
    assert.equal(a, b);
  });
});

describe("staging diagnostics flag", () => {
  it("enabled in DEV", () => {
    assert.equal(isP2pDiagnosticsEnabled({ DEV: true }), true);
  });

  it("enabled when VITE_P2P_SHOW_DIAGNOSTICS=1", () => {
    assert.equal(isP2pDiagnosticsEnabled({ DEV: false, VITE_P2P_SHOW_DIAGNOSTICS: "1" }), true);
  });

  it("hidden in production without flag", () => {
    assert.equal(isP2pDiagnosticsEnabled({ DEV: false, VITE_P2P_SHOW_DIAGNOSTICS: "0" }), false);
    assert.equal(isP2pDiagnosticsEnabled({ PROD: true, DEV: false }), false);
  });

  it("resolveShowP2pDevDiagnostics respects explicit false", () => {
    assert.equal(resolveShowP2pDevDiagnostics(false, { DEV: true }), false);
    assert.equal(resolveShowP2pDevDiagnostics(undefined, { VITE_P2P_SHOW_DIAGNOSTICS: "1" }), true);
  });
});
