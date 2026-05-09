const DEFAULT_LEVEL = "회원";

function asId(value) {
  return String(value ?? "").trim();
}

function resolveLevel(user) {
  const level = String(user?.level ?? user?.stageLabel ?? user?.stage_label ?? "").trim();
  return level || DEFAULT_LEVEL;
}

function resolveParentId(user) {
  const parentId = String(
    user?.parentId
    ?? user?.parent
    ?? user?.parent_user_ref
    ?? user?.parentUserRef
    ?? ""
  ).trim();
  return parentId;
}

function normalizeUsers(users = []) {
  return (users || []).map((user) => {
    const id = asId(user?.id);
    const level = resolveLevel(user);
    const parentId = resolveParentId(user);
    return {
      ...user,
      id,
      level,
      parentId,
      stageLabel: String(user?.stageLabel ?? level),
      stage_label: String(user?.stage_label ?? level),
    };
  });
}

export function buildReferralTree(users = []) {
  const normalizedUsers = normalizeUsers(users);
  const byId = new Map(normalizedUsers.map((user) => [user.id, user]));
  const byParent = new Map();
  const roots = [];

  for (const user of normalizedUsers) {
    if (!user.parentId || !byId.has(user.parentId)) {
      roots.push(user.id);
      continue;
    }
    const siblings = byParent.get(user.parentId) || [];
    siblings.push(user.id);
    byParent.set(user.parentId, siblings);
  }

  return { users: normalizedUsers, byId, byParent, roots };
}

export function getDirectDownlines(userId, users = []) {
  const tree = buildReferralTree(users);
  const ids = tree.byParent.get(asId(userId)) || [];
  return ids.map((id) => tree.byId.get(id)).filter(Boolean);
}

export function getAllDownlines(userId, users = []) {
  const tree = buildReferralTree(users);
  const rootId = asId(userId);
  const queue = [...(tree.byParent.get(rootId) || [])];
  const visited = new Set();
  const collected = [];
  while (queue.length) {
    const current = queue.shift();
    if (!current || visited.has(current)) continue;
    visited.add(current);
    const user = tree.byId.get(current);
    if (user) collected.push(user);
    const children = tree.byParent.get(current) || [];
    for (const child of children) queue.push(child);
  }
  return collected;
}

export function getUsersByLevel(level, users = []) {
  const lv = String(level || "").trim();
  return normalizeUsers(users).filter((user) => user.level === lv);
}

export function getLevelCounts(users = []) {
  const counts = {};
  for (const user of normalizeUsers(users)) {
    counts[user.level] = Number(counts[user.level] || 0) + 1;
  }
  return counts;
}

export function updateUserLevel(userId, newLevel, users = []) {
  const targetId = asId(userId);
  const nextLevel = String(newLevel || "").trim() || DEFAULT_LEVEL;
  return normalizeUsers(users).map((user) => {
    if (user.id !== targetId) return user;
    return {
      ...user,
      level: nextLevel,
      stageLabel: nextLevel,
      stage_label: nextLevel,
    };
  });
}

export function recalculateAdminStats(users = []) {
  const normalizedUsers = normalizeUsers(users);
  const tree = buildReferralTree(normalizedUsers);
  const levelCounts = getLevelCounts(normalizedUsers);
  const levelCountSum = Object.values(levelCounts).reduce((acc, count) => acc + Number(count || 0), 0);
  const directDownlineCounts = {};
  const allDownlineCounts = {};
  for (const user of normalizedUsers) {
    directDownlineCounts[user.id] = getDirectDownlines(user.id, normalizedUsers).length;
    allDownlineCounts[user.id] = getAllDownlines(user.id, normalizedUsers).length;
  }
  return {
    totalUsers: normalizedUsers.length,
    levelCounts,
    levelCountSum,
    levelCountMismatch: levelCountSum !== normalizedUsers.length,
    directDownlineCounts,
    allDownlineCounts,
    tree,
  };
}

export function validateTreeIntegrity(users = []) {
  const normalizedUsers = normalizeUsers(users);
  const errors = [];
  const idSet = new Set();

  for (const user of normalizedUsers) {
    if (!user.id) errors.push("empty_user_id");
    if (idSet.has(user.id)) errors.push(`duplicate_user_id:${user.id}`);
    idSet.add(user.id);
  }

  for (const user of normalizedUsers) {
    if (user.parentId && !idSet.has(user.parentId)) {
      errors.push(`missing_parent:${user.id}->${user.parentId}`);
    }
  }

  const tree = buildReferralTree(normalizedUsers);
  for (const user of normalizedUsers) {
    const visited = new Set([user.id]);
    let cursor = user.parentId;
    while (cursor) {
      if (visited.has(cursor)) {
        errors.push(`cycle_detected:${user.id}`);
        break;
      }
      visited.add(cursor);
      const next = tree.byId.get(cursor);
      cursor = next?.parentId || "";
    }
  }

  const stats = recalculateAdminStats(normalizedUsers);
  if (stats.levelCountMismatch) {
    errors.push(`level_sum_mismatch:${stats.levelCountSum}/${stats.totalUsers}`);
  }

  return {
    ok: errors.length === 0,
    errors,
    stats,
  };
}
