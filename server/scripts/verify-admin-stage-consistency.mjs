/**
 * Admin stage consistency verifier
 *
 * Purpose:
 * - Reproduce the same stage transitions used in admin member management
 * - Assert that list/detail effective stage and stage summary stay aligned
 */

const DEFAULT_SUMMARY = { 슈퍼페이지: 0, "본사 관리자": 0, "본사 관계자": 0, "LEVEL 1": 0, "LEVEL 2": 0, "LEVEL 3": 0, 회원: 0 };

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
        stage_label: bucket.stage,
      });
    }
  }
  return users;
}

function getEffectiveStage(user, stageByUserId) {
  const override = String(stageByUserId[user.id] || "").trim();
  return override || user.stageLabel || user.stage_label || "회원";
}

function buildSummary(users, stageByUserId) {
  const summary = { ...DEFAULT_SUMMARY };
  for (const user of users) {
    const stage = String(getEffectiveStage(user, stageByUserId) || "회원");
    if (!Object.prototype.hasOwnProperty.call(summary, stage)) summary[stage] = 0;
    summary[stage] += 1;
  }
  return summary;
}

function applyStage(users, stageByUserId, userId, nextStage) {
  const nextOverrides = { ...stageByUserId, [userId]: nextStage };
  const nextUsers = users.map((u) => (
    u.id === userId ? { ...u, stageLabel: nextStage, stage_label: nextStage } : u
  ));
  return { nextUsers, nextOverrides };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function runScenario(name, users, fromStage, toStage, userId) {
  const baseSummary = buildSummary(users, {});
  assert(baseSummary[fromStage] > 0, `[${name}] fromStage count missing: ${fromStage}`);

  const { nextUsers, nextOverrides } = applyStage(users, {}, userId, toStage);
  const nextSummary = buildSummary(nextUsers, nextOverrides);

  assert(
    nextSummary[fromStage] === baseSummary[fromStage] - 1,
    `[${name}] ${fromStage} count mismatch: expected ${baseSummary[fromStage] - 1}, got ${nextSummary[fromStage]}`
  );
  assert(
    nextSummary[toStage] === baseSummary[toStage] + 1,
    `[${name}] ${toStage} count mismatch: expected ${baseSummary[toStage] + 1}, got ${nextSummary[toStage]}`
  );

  const target = nextUsers.find((u) => u.id === userId);
  assert(target, `[${name}] target user not found: ${userId}`);
  assert(
    getEffectiveStage(target, nextOverrides) === toStage,
    `[${name}] detail stage mismatch: expected ${toStage}`
  );

  return {
    name,
    before: `${fromStage}:${baseSummary[fromStage]}, ${toStage}:${baseSummary[toStage]}`,
    after: `${fromStage}:${nextSummary[fromStage]}, ${toStage}:${nextSummary[toStage]}`,
    userId,
  };
}

function main() {
  const ownerId = 1;
  const users = createVirtualDownlineUsers(ownerId, 100);

  const reports = [
    runScenario("LEVEL1->LEVEL2", users, "LEVEL 1", "LEVEL 2", "VD-012"),
    runScenario("LEVEL2->LEVEL3", users, "LEVEL 2", "LEVEL 3", "VD-030"),
    runScenario("LEVEL3->LEVEL1(역변경)", users, "LEVEL 3", "LEVEL 1", "VD-060"),
  ];

  for (const report of reports) {
    console.log(`PASS ${report.name} (${report.userId}) | ${report.before} -> ${report.after}`);
  }
  console.log("PASS admin stage consistency scenarios");
}

main();
