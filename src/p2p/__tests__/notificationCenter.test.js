import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  emitNotificationEvent,
  getUnreadNotificationCount,
  markNotificationRead,
} from "../../notifications/notificationHelpers.js";
import { clearNotificationStorageForSelfTest, loadNotifications } from "../../notifications/notificationStore.js";
import { runNotificationSelfTestSuite } from "../../notifications/notificationSelfTest.js";

describe("notification center", () => {
  beforeEach(() => {
    clearNotificationStorageForSelfTest();
  });

  it("stores mock notifications in localStorage", () => {
    const row = emitNotificationEvent("trade.created_mock", { orderId: "ORD-1" });
    const items = loadNotifications();
    assert.equal(items.length, 1);
    assert.equal(items[0].id, row.id);
    assert.equal(items[0].mockOnly, true);
  });

  it("tracks unread count and read toggle", () => {
    emitNotificationEvent("escrow.locked_mock", { orderId: "ORD-2" });
    assert.equal(getUnreadNotificationCount(), 1);
    const id = loadNotifications()[0].id;
    markNotificationRead(id);
    assert.equal(getUnreadNotificationCount(), 0);
  });

  it("runNotificationSelfTestSuite passes core checks", () => {
    const suite = runNotificationSelfTestSuite();
    assert.ok(["pass", "warn"].includes(suite.status));
    assert.equal(suite._mock, true);
    assert.ok(suite.checks.length >= 8);
  });
});
