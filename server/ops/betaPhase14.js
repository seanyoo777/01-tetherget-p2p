/**
 * Phase 14: 베타 공개 프로그램, 한도, SLO 평가 (소규모 베타 운영).
 */

const KEY_PROGRAM = "p2p.beta_program";
const KEY_LIMITS = "p2p.beta_limits";

function readSettingJson(db, key) {
  const row = db.prepare(`SELECT value_json FROM platform_settings WHERE setting_key = ?`).get(key);
  if (!row?.value_json) return {};
  try {
    return JSON.parse(String(row.value_json));
  } catch {
    return {};
  }
}

function num(...candidates) {
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  }
  return 0;
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {NodeJS.ProcessEnv} env
 */
export function resolveBetaLimits(db, env) {
  const j = readSettingJson(db, KEY_LIMITS);
  const maxListed = num(env.BETA_MAX_LISTED_ORDERS_PER_USER, j.max_listed_orders_per_user, 0);
  const maxActive = num(env.BETA_MAX_ACTIVE_TRADES_PER_USER, j.max_active_trades_per_user, 0);
  const maxDaily = num(env.BETA_MAX_NEW_LISTINGS_PER_USER_PER_DAY, j.max_new_listings_per_user_per_day, 0);
  const enforced = maxListed > 0 || maxActive > 0 || maxDaily > 0;
  return { maxListed, maxActive, maxDaily, enforced };
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {number} userId
 * @param {{ maxListed: number; maxActive: number; maxDaily: number; enforced: boolean }} limits
 */
export function assertBetaP2pListingAllowed(db, userId, limits) {
  if (!limits.enforced) return { ok: true };
  if (limits.maxListed > 0) {
    const r = db
      .prepare(`SELECT COUNT(*) as c FROM p2p_orders WHERE seller_user_id = ? AND status = 'listed'`)
      .get(userId);
    const c = Number(r?.c ?? 0);
    if (c >= limits.maxListed) {
      return { ok: false, message: `베타 한도: 게시 중인 호가는 최대 ${limits.maxListed}건입니다.` };
    }
  }
  if (limits.maxDaily > 0) {
    const r = db
      .prepare(
        `SELECT COUNT(*) as c FROM p2p_orders WHERE seller_user_id = ? AND date(created_at) = date('now')`,
      )
      .get(userId);
    const c = Number(r?.c ?? 0);
    if (c >= limits.maxDaily) {
      return { ok: false, message: `베타 한도: 오늘 생성한 P2P 주문은 최대 ${limits.maxDaily}건입니다.` };
    }
  }
  return { ok: true };
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {number} userId
 * @param {{ maxActive: number; enforced: boolean }} limits
 */
export function assertBetaP2pTakeAllowed(db, userId, limits) {
  if (!limits.enforced || limits.maxActive <= 0) return { ok: true };
  const r = db
    .prepare(
      `SELECT COUNT(*) as c FROM p2p_orders
       WHERE (buyer_user_id = ? OR seller_user_id = ?)
         AND status IN ('matched','payment_sent')`,
    )
    .get(userId, userId);
  const c = Number(r?.c ?? 0);
  if (c >= limits.maxActive) {
    return { ok: false, message: `베타 한도: 진행 중 거래(매칭·송금 단계)는 최대 ${limits.maxActive}건입니다.` };
  }
  return { ok: true };
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {NodeJS.ProcessEnv} env
 */
export function getBetaProgramPublic(db, env) {
  const j = readSettingJson(db, KEY_PROGRAM);
  const supportUrl = String(env.BETA_PUBLIC_SUPPORT_URL || j.support_url || "").trim().slice(0, 500);
  const onboardingUrl = String(env.BETA_PUBLIC_ONBOARDING_URL || j.onboarding_url || "").trim().slice(0, 500);
  const docsUrl = String(env.BETA_PUBLIC_DOCS_URL || j.docs_url || "").trim().slice(0, 500);
  const incidentUrl = String(env.BETA_INCIDENT_PLAYBOOK_URL || j.incident_playbook_url || "").trim().slice(0, 500);
  const cohortName = String(env.BETA_COHORT_NAME || j.cohort_name || "").trim().slice(0, 120);
  const announcement = String(j.announcement || env.BETA_PUBLIC_ANNOUNCEMENT || "").trim().slice(0, 2000);
  const onboardingSteps = Array.isArray(j.onboarding_steps) ? j.onboarding_steps.slice(0, 20) : [];
  const statuspagePublic = String(env.STATUSPAGE_PUBLIC_URL || j.statuspage_public_url || "").trim().slice(0, 500);
  const recoveryDocs = String(env.RECOVERY_DOCS_URL || j.recovery_docs_url || "").trim().slice(0, 500);
  const limits = resolveBetaLimits(db, env);
  return {
    cohort_name: cohortName || null,
    announcement: announcement || null,
    links: {
      support_url: supportUrl || null,
      onboarding_url: onboardingUrl || null,
      docs_url: docsUrl || null,
      incident_playbook_url: incidentUrl || null,
      statuspage_public_url: statuspagePublic || null,
      recovery_docs_url: recoveryDocs || null,
    },
    onboarding_steps: onboardingSteps,
    limits: {
      max_listed_orders_per_user: limits.maxListed || null,
      max_active_trades_per_user: limits.maxActive || null,
      max_new_listings_per_user_per_day: limits.maxDaily || null,
      enforced: limits.enforced,
    },
  };
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {NodeJS.ProcessEnv} env
 */
export function computeBetaSloSnapshot(db, env) {
  const lagMax = Math.max(1, num(env.SLO_INDEXER_LAG_MAX_BLOCKS, 200));
  const pushFailedMax = Math.max(0, num(env.SLO_PUSH_FAILED_MAX, 50));
  const staleSec = Math.max(30, num(env.SLO_INDEXER_STALE_SECONDS, 600));

  const idxRow = db.prepare(`SELECT value_json, updated_at FROM platform_settings WHERE setting_key = 'p2p.escrow_indexer'`).get();
  let indexer = {};
  try {
    if (idxRow?.value_json) indexer = JSON.parse(String(idxRow.value_json));
  } catch {
    indexer = {};
  }
  const lastBlock = Number(indexer.last_block ?? 0);
  const lastLatest = Number(indexer.last_rpc_latest ?? 0);
  const lag = lastLatest > 0 && lastBlock > 0 ? Math.max(0, lastLatest - lastBlock) : null;

  const tickAt = indexer.last_tick_at ? Date.parse(String(indexer.last_tick_at)) : NaN;
  const now = Date.now();
  const stale = Number.isFinite(tickAt) ? (now - tickAt) / 1000 > staleSec : true;

  const pushFailed = db.prepare(`SELECT COUNT(*) as c FROM push_notification_outbound WHERE status = 'failed'`).get();
  const failedN = Number(pushFailed?.c ?? 0);

  const lagOk = lag == null ? true : lag <= lagMax;
  const pushOk = failedN <= pushFailedMax;
  const indexerFreshOk = !stale || lag == null;

  return {
    captured_at: new Date().toISOString(),
    thresholds: {
      indexer_lag_max_blocks: lagMax,
      push_failed_max: pushFailedMax,
      indexer_stale_seconds: staleSec,
    },
    signals: {
      escrow_indexer_block_lag: lag,
      escrow_indexer_last_block: lastBlock,
      escrow_indexer_last_rpc_latest: lastLatest,
      escrow_indexer_last_tick_at: indexer.last_tick_at ?? null,
      push_outbound_failed: failedN,
    },
    slo: {
      indexer_lag_ok: lagOk,
      push_failed_ok: pushOk,
      indexer_fresh_ok: indexerFreshOk,
      all_ok: lagOk && pushOk && indexerFreshOk,
    },
  };
}

const PROGRAM_PATCH_KEYS = new Set([
  "support_url",
  "onboarding_url",
  "docs_url",
  "incident_playbook_url",
  "cohort_name",
  "announcement",
  "onboarding_steps",
  "statuspage_public_url",
  "recovery_docs_url",
]);

const LIMITS_PATCH_KEYS = new Set([
  "max_listed_orders_per_user",
  "max_active_trades_per_user",
  "max_new_listings_per_user_per_day",
]);

/**
 * @param {import("better-sqlite3").Database} db
 * @param {object} body
 */
export function mergeBetaProgramPatch(db, body) {
  const prev = readSettingJson(db, KEY_PROGRAM);
  const next = { ...prev };
  if (body && typeof body === "object") {
    for (const [k, v] of Object.entries(body)) {
      if (!PROGRAM_PATCH_KEYS.has(k)) continue;
      if (k === "onboarding_steps") {
        if (Array.isArray(v)) next.onboarding_steps = v.map((s) => String(s).slice(0, 400)).slice(0, 20);
      } else if (typeof v === "string") {
        next[k] = v.slice(0, 2000);
      } else if (v == null) {
        delete next[k];
      }
    }
  }
  db.prepare(`
    INSERT INTO platform_settings (setting_key, value_json, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(setting_key) DO UPDATE SET value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP
  `).run(KEY_PROGRAM, JSON.stringify(next));
  return next;
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {object} body
 */
export function mergeBetaLimitsPatch(db, body) {
  const prev = readSettingJson(db, KEY_LIMITS);
  const next = { ...prev };
  if (body && typeof body === "object") {
    for (const [k, v] of Object.entries(body)) {
      if (!LIMITS_PATCH_KEYS.has(k)) continue;
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) continue;
      next[k] = Math.floor(n);
    }
  }
  db.prepare(`
    INSERT INTO platform_settings (setting_key, value_json, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(setting_key) DO UPDATE SET value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP
  `).run(KEY_LIMITS, JSON.stringify(next));
  return next;
}
