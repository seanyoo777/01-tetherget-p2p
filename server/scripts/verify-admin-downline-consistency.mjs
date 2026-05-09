/**
 * Admin downline (parent override) consistency verifier
 *
 * Mirrors getEffectiveParent + direct children filtering used in AdminReferralPanel.
 */

function createVirtualDownlineUsers(ownerId, count = 100) {
  const stageBuckets = [
    { stage: "슈퍼페이지", size: 2 },
    { stage: "본사 관리자", size: 3 },
    { stage: "본사 관계자", size: 5 },
    { stage: "LEVEL 1", size: 15 },
    { stage: "LEVEL 2", size: 30 },
    { stage: "LEVEL 3", size: 45 },
  ];
  const users = [];
  let cursor = 1;
  for (const bucket of stageBuckets) {
    for (let i = 0; i < bucket.size && users.length < count; i += 1) {
      const n = cursor++;
      users.push({
        id: `VD-${String(n).padStart(3, "0")}`,
        nickname: `하부회원${String(n).padStart(3, "0")}`,
        parent: String(ownerId),
        stageLabel: bucket.stage,
      });
    }
  }
  return users;
}

function getEffectiveParent(user, overrides) {
  if (Object.prototype.hasOwnProperty.call(overrides, user.id)) {
    return overrides[user.id];
  }
  return user.parent;
}

function directChildren(users, overrides, parentId) {
  return users.filter((u) => String(getEffectiveParent(u, overrides)) === String(parentId));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function main() {
  const ownerId = "ADMIN-ACTOR-1";
  const users = createVirtualDownlineUsers(ownerId, 100);

  let overrides = {};
  assert(directChildren(users, overrides, "VD-005").length === 0, "VD-005 should start with 0 direct children (flat mock)");

  overrides = { ...overrides, "VD-010": "VD-005" };
  const afterAttach = directChildren(users, overrides, "VD-005");
  assert(afterAttach.length === 1, `Expected 1 child under VD-005, got ${afterAttach.length}`);
  assert(afterAttach[0].id === "VD-010", "VD-010 should be direct child of VD-005");
  assert(String(getEffectiveParent(users.find((u) => u.id === "VD-010"), overrides)) === "VD-005", "effective parent of VD-010");

  overrides = { ...overrides, "VD-010": ownerId };
  assert(directChildren(users, overrides, "VD-005").length === 0, "after moving VD-010 back to owner, VD-005 has 0 children");
  assert(directChildren(users, overrides, ownerId).length === 100, "owner still has all 100 under flat tree");

  console.log("PASS admin downline parent override scenarios");
}

main();
