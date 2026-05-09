import {
  updateUserLevel,
  getUsersByLevel,
  getLevelCounts,
  getDirectDownlines,
  getAllDownlines,
  recalculateAdminStats,
  validateTreeIntegrity,
} from "../../src/utils/referralTreeEngine.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function makeUsers() {
  return [
    { id: "U1", level: "1", parentId: "" },
    { id: "U2", level: "2", parentId: "U1" },
    { id: "U3", level: "2", parentId: "U2" },
  ];
}

function scenarioMove2to1() {
  const users = makeUsers();
  const nextUsers = updateUserLevel("U2", "1", users);
  const counts = getLevelCounts(nextUsers);
  const total = nextUsers.length;
  assert((counts["1"] || 0) === 2, `expected level1=2, got ${counts["1"] || 0}`);
  assert((counts["2"] || 0) === 1, `expected level2=1, got ${counts["2"] || 0}`);
  assert(total === 3, `expected total=3, got ${total}`);
}

function scenarioMove1to3() {
  const users = makeUsers();
  const once = updateUserLevel("U2", "1", users);
  const nextUsers = updateUserLevel("U1", "3", once);
  const counts = getLevelCounts(nextUsers);
  const total = nextUsers.length;
  assert((counts["1"] || 0) === 1, `expected level1=1, got ${counts["1"] || 0}`);
  assert((counts["2"] || 0) === 1, `expected level2=1, got ${counts["2"] || 0}`);
  assert((counts["3"] || 0) === 1, `expected level3=1, got ${counts["3"] || 0}`);
  assert(total === 3, `expected total=3, got ${total}`);
}

function scenarioTreeConsistency() {
  const users = makeUsers();
  const direct = getDirectDownlines("U1", users);
  const all = getAllDownlines("U1", users);
  assert(direct.length === 1, `expected U1 direct downlines=1, got ${direct.length}`);
  assert(all.length === 2, `expected U1 all downlines=2, got ${all.length}`);

  const stats = recalculateAdminStats(users);
  assert(stats.levelCountSum === users.length, "level count sum should equal users length");

  const integrity = validateTreeIntegrity(users);
  assert(integrity.ok, `tree integrity should pass, errors=${integrity.errors.join(",")}`);
}

function scenarioLevelSelectors() {
  const users = makeUsers();
  const lv2 = getUsersByLevel("2", users);
  assert(lv2.length === 2, `expected level2 users=2, got ${lv2.length}`);
}

function main() {
  scenarioMove2to1();
  scenarioMove1to3();
  scenarioTreeConsistency();
  scenarioLevelSelectors();
  console.log("PASS referral tree engine scenarios");
}

main();
