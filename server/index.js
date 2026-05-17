import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { hashMessage, recoverAddress } from "ethers";
import { OAuth2Client } from "google-auth-library";
import { db } from "./db/sqlite.js";
import { createUserRepository } from "./repositories/userRepository.js";
import { createRefreshTokenRepository } from "./repositories/refreshTokenRepository.js";
import { encryptText, decryptText, encryptBuffer, decryptBuffer } from "./security/crypto.js";
import {
  PLATFORM_CODE,
  SERVICE_LINE,
  mergeAuditPayload,
  mergeDomainPayload,
} from "./platform/context.js";
import { buildPriceSnapshot, listBuiltinPriceFeedProviders } from "./market/priceFeed.js";
import {
  MARKET_PRICE_FEED_SETTING_KEY,
  parseStoredMarketPriceFeedProvider,
  normalizeAdminPriceFeedProviderInput,
  storageJsonForPriceFeedProvider,
  resolvedPriceFeedProviderFromStored,
  envResolutionPriceFeedProviderId,
} from "./market/platformPriceFeedSettings.js";
import {
  normalizeLedgerAmount,
  minorBigIntToSqlInt,
  financialMinorToMajor,
  normalizeLedgerFromSqlMinor,
  parseLedgerPositiveAmount,
  parseLedgerNonNegativePrice,
} from "./finance/moneyAmount.js";
import { buildP2pUteSurfacePayloadFromIndex } from "./admin/p2pUteSurface.js";

const LEDGER_MINOR_MIGRATION_KEY = "ledger.integer_minor_v1";
const LEDGER_DROP_REAL_COLUMNS_KEY = "ledger.drop_real_columns_v1";

function tableHasColumn(tableName, columnName) {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all();
  return rows.some((r) => r.name === columnName);
}

const app = express();
const PORT = Number(process.env.PORT || 4000);
/** DB(`platform_settings`) 미설정 시 폴백. 운영 값은 관리자 API에서 변경. */
const DEFAULT_JWT_SECRET = "tetherget-dev-secret-change-me";
const JWT_SECRET = process.env.JWT_SECRET || DEFAULT_JWT_SECRET;
if (process.env.NODE_ENV === "production" && JWT_SECRET === DEFAULT_JWT_SECRET) {
  console.error("[tetherget-api] NODE_ENV=production 인데 JWT_SECRET 이 기본값입니다. 운영에서는 반드시 환경변수로 설정하세요.");
  process.exit(1);
}
const ADMIN_WEBHOOK_URL = process.env.ADMIN_WEBHOOK_URL || "";
const ADMIN_SAFE_MODE = String(process.env.ADMIN_SAFE_MODE || "false").trim().toLowerCase() === "true";
const GOOGLE_CLIENT_ID = String(process.env.GOOGLE_CLIENT_ID || "").trim();
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;
const userRepo = createUserRepository(db);
const refreshTokenRepo = createRefreshTokenRepository(db);

function ensureColumn(tableName, columnName, sqlDefinition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  const exists = columns.some((col) => col.name === columnName);
  if (!exists) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${sqlDefinition}`);
  }
}

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    nickname TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT '회원',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);
ensureColumn("users", "referral_code", "TEXT NOT NULL DEFAULT ''");
ensureColumn("users", "referred_by_user_id", "INTEGER");
ensureColumn("users", "referred_by_code", "TEXT NOT NULL DEFAULT ''");
ensureColumn("users", "stage_label", "TEXT NOT NULL DEFAULT ''");
ensureColumn("users", "parent_user_ref", "TEXT NOT NULL DEFAULT ''");
ensureColumn("users", "admin_assigned", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("users", "session_role", "TEXT NOT NULL DEFAULT 'user'");
ensureColumn("users", "sales_level", "INTEGER");

/** 빈 referral_code 는 UNIQUE 인덱스에서 동일 값으로 충돌하므로, 인덱스 생성 전에 한 번 채움 */
function backfillUsersEmptyReferralCodesBeforeUniqueIndex() {
  try {
    const rows = db.prepare("SELECT id FROM users WHERE IFNULL(referral_code, '') = ''").all();
    for (const row of rows) {
      const id = Number(row.id);
      let code = `TG-${String(id).padStart(6, "0")}`;
      const taken = db.prepare("SELECT id FROM users WHERE referral_code = ?").get(code);
      if (taken && Number(taken.id) !== id) {
        code = `TG-${String(id).padStart(6, "0")}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
      }
      db.prepare("UPDATE users SET referral_code = ? WHERE id = ?").run(code, id);
    }
  } catch (error) {
    console.warn("[users] referral_code empty backfill:", error?.message || error);
  }
}
backfillUsersEmptyReferralCodesBeforeUniqueIndex();

db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_referral_code_unique ON users(referral_code)");
try {
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_nickname_unique ON users(nickname COLLATE NOCASE)");
} catch (error) {
  console.warn("[users] nickname unique index skipped:", error?.message || error);
}

db.exec(`
  CREATE TABLE IF NOT EXISTS refresh_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS wallet_login_nonces (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet_provider TEXT NOT NULL,
    wallet_address TEXT NOT NULL,
    nonce TEXT NOT NULL UNIQUE,
    message TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS user_wallets (
    user_id INTEGER PRIMARY KEY,
    wallet_provider TEXT NOT NULL DEFAULT '',
    wallet_address TEXT NOT NULL DEFAULT '',
    connected_at TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);
try {
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_user_wallets_address_unique ON user_wallets(wallet_address COLLATE NOCASE) WHERE wallet_address <> ''");
} catch (error) {
  console.warn("[user_wallets] wallet address unique index skipped:", error?.message || error);
}

db.exec(`
  CREATE TABLE IF NOT EXISTS user_financial_accounts (
    user_id INTEGER PRIMARY KEY,
    available_balance_minor INTEGER NOT NULL DEFAULT 0,
    referral_earnings_total_minor INTEGER NOT NULL DEFAULT 0,
    pending_withdrawal_minor INTEGER NOT NULL DEFAULT 0,
    p2p_escrow_locked_minor INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);
ensureColumn("user_financial_accounts", "available_balance_minor", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("user_financial_accounts", "referral_earnings_total_minor", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("user_financial_accounts", "pending_withdrawal_minor", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("user_financial_accounts", "p2p_escrow_locked_minor", "INTEGER NOT NULL DEFAULT 0");

db.exec(`
  CREATE TABLE IF NOT EXISTS company_wallet (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    wallet_label TEXT NOT NULL DEFAULT 'TG-COMPANY-HQ-WALLET',
    wallet_address TEXT NOT NULL DEFAULT '0xTGCOMPANY0001',
    available_balance_minor INTEGER NOT NULL DEFAULT 100000000000000,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);
ensureColumn("company_wallet", "available_balance_minor", "INTEGER NOT NULL DEFAULT 0");

db.exec(`
  CREATE TABLE IF NOT EXISTS withdrawal_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    amount_minor INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    destination_wallet_provider TEXT NOT NULL DEFAULT '',
    destination_wallet_address TEXT NOT NULL DEFAULT '',
    request_note TEXT NOT NULL DEFAULT '',
    requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    processed_at TEXT,
    processed_by_user_id INTEGER,
    company_wallet_tx_id TEXT NOT NULL DEFAULT '',
    reject_reason TEXT NOT NULL DEFAULT '',
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);
ensureColumn("withdrawal_requests", "amount_minor", "INTEGER NOT NULL DEFAULT 0");

db.exec(`
  CREATE TABLE IF NOT EXISTS kyc_profiles (
    user_id INTEGER PRIMARY KEY,
    real_name TEXT DEFAULT '',
    id_image_uploaded INTEGER NOT NULL DEFAULT 0,
    bank_account_uploaded INTEGER NOT NULL DEFAULT 0,
    account_name_matched INTEGER NOT NULL DEFAULT 0,
    company_approval_status TEXT NOT NULL DEFAULT '미제출',
    private_storage_notice_accepted INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS escrow_policy (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    main_custody_account TEXT NOT NULL,
    required_approvals INTEGER NOT NULL,
    main_final_approver_id INTEGER NOT NULL,
    level_delay_hours_lv1 INTEGER NOT NULL DEFAULT 48,
    level_delay_hours_lv2 INTEGER NOT NULL DEFAULT 36,
    level_delay_hours_lv3 INTEGER NOT NULL DEFAULT 24,
    level_delay_hours_lv4 INTEGER NOT NULL DEFAULT 12,
    level_delay_hours_lv5 INTEGER NOT NULL DEFAULT 0
  );
`);
ensureColumn("escrow_policy", "level_delay_hours_lv1", "INTEGER NOT NULL DEFAULT 48");
ensureColumn("escrow_policy", "level_delay_hours_lv2", "INTEGER NOT NULL DEFAULT 36");
ensureColumn("escrow_policy", "level_delay_hours_lv3", "INTEGER NOT NULL DEFAULT 24");
ensureColumn("escrow_policy", "level_delay_hours_lv4", "INTEGER NOT NULL DEFAULT 12");
ensureColumn("escrow_policy", "level_delay_hours_lv5", "INTEGER NOT NULL DEFAULT 0");

db.exec(`
  CREATE TABLE IF NOT EXISTS escrow_policy_approvers (
    policy_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    PRIMARY KEY (policy_id, user_id),
    FOREIGN KEY (policy_id) REFERENCES escrow_policy(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS disputes (
    id TEXT PRIMARY KEY,
    requester_user_id INTEGER NOT NULL,
    order_seller TEXT NOT NULL,
    coin TEXT NOT NULL,
    amount REAL NOT NULL,
    sender_name TEXT NOT NULL,
    sender_account TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT '분쟁접수',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    multi_approved_at TEXT,
    approved_at TEXT,
    release_message TEXT DEFAULT '',
    FOREIGN KEY (requester_user_id) REFERENCES users(id)
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS dispute_approvals (
    dispute_id TEXT NOT NULL,
    approver_user_id INTEGER NOT NULL,
    approved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (dispute_id, approver_user_id),
    FOREIGN KEY (dispute_id) REFERENCES disputes(id),
    FOREIGN KEY (approver_user_id) REFERENCES users(id)
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS escrow_security (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    main_final_approval_pin_hash TEXT NOT NULL
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS dispute_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dispute_id TEXT NOT NULL,
    actor_user_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    detail TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    prev_hash TEXT NOT NULL DEFAULT '',
    event_hash TEXT NOT NULL DEFAULT ''
  );
`);
ensureColumn("dispute_events", "prev_hash", "TEXT NOT NULL DEFAULT ''");
ensureColumn("dispute_events", "event_hash", "TEXT NOT NULL DEFAULT ''");

db.exec(`
  CREATE TABLE IF NOT EXISTS dispute_final_otp (
    dispute_id TEXT PRIMARY KEY,
    otp_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used INTEGER NOT NULL DEFAULT 0
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS kyc_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    doc_type TEXT NOT NULL,
    file_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    file_path TEXT NOT NULL,
    iv_b64 TEXT NOT NULL,
    tag_b64 TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS kyc_document_access_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER NOT NULL,
    actor_user_id INTEGER NOT NULL,
    reason TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    prev_hash TEXT NOT NULL DEFAULT '',
    log_hash TEXT NOT NULL DEFAULT ''
  );
`);
ensureColumn("kyc_document_access_logs", "prev_hash", "TEXT NOT NULL DEFAULT ''");
ensureColumn("kyc_document_access_logs", "log_hash", "TEXT NOT NULL DEFAULT ''");

db.exec(`
  CREATE TABLE IF NOT EXISTS kyc_document_view_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER NOT NULL,
    requester_user_id INTEGER NOT NULL,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    rejected_reason TEXT NOT NULL DEFAULT '',
    rejected_by_user_id INTEGER,
    rejected_at TEXT
  );
`);
ensureColumn("kyc_document_view_requests", "rejected_reason", "TEXT NOT NULL DEFAULT ''");
ensureColumn("kyc_document_view_requests", "rejected_by_user_id", "INTEGER");
ensureColumn("kyc_document_view_requests", "rejected_at", "TEXT");

db.exec(`
  CREATE TABLE IF NOT EXISTS kyc_document_view_approvals (
    request_id INTEGER NOT NULL,
    approver_user_id INTEGER NOT NULL,
    approved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (request_id, approver_user_id)
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS platform_features (
    feature_key TEXT PRIMARY KEY,
    enabled INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS market_assets (
    asset_code TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    asset_type TEXT NOT NULL DEFAULT 'coin',
    network TEXT NOT NULL DEFAULT '',
    settlement_enabled INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS market_catalog (
    market_key TEXT PRIMARY KEY,
    market_type TEXT NOT NULL DEFAULT 'p2p',
    offered_asset_code TEXT NOT NULL,
    requested_asset_code TEXT NOT NULL,
    settlement_asset_code TEXT NOT NULL DEFAULT '',
    escrow_adapter TEXT NOT NULL DEFAULT 'coin_escrow',
    status TEXT NOT NULL DEFAULT 'active',
    metadata_json TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS market_catalog_audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_user_id INTEGER NOT NULL,
    assets_count INTEGER NOT NULL DEFAULT 0,
    markets_count INTEGER NOT NULL DEFAULT 0,
    summary_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS admin_webhook_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    status TEXT NOT NULL,
    status_code INTEGER,
    error_message TEXT DEFAULT '',
    occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS audit_report_hashes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_user_id INTEGER NOT NULL,
    report_type TEXT NOT NULL,
    from_date TEXT DEFAULT '',
    to_date TEXT DEFAULT '',
    row_count INTEGER NOT NULL DEFAULT 0,
    sha256_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS platform_audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    event_type TEXT NOT NULL,
    payload_json TEXT NOT NULL DEFAULT '{}',
    ip TEXT NOT NULL DEFAULT '',
    user_agent TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);
db.exec("CREATE INDEX IF NOT EXISTS idx_platform_audit_created ON platform_audit_logs(created_at DESC)");
db.exec("CREATE INDEX IF NOT EXISTS idx_platform_audit_user_created ON platform_audit_logs(user_id, created_at DESC)");
ensureColumn("platform_audit_logs", "platform_code", "TEXT NOT NULL DEFAULT 'tetherget'");
db.exec("CREATE INDEX IF NOT EXISTS idx_platform_audit_platform_created ON platform_audit_logs(platform_code, created_at DESC)");
db.exec(`
  CREATE TABLE IF NOT EXISTS ops_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    snapshot_type TEXT NOT NULL DEFAULT 'manual',
    label TEXT NOT NULL DEFAULT '',
    reason TEXT NOT NULL DEFAULT '',
    file_path TEXT NOT NULL,
    sha256_hash TEXT NOT NULL,
    size_bytes INTEGER NOT NULL DEFAULT 0,
    created_by_user_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS ops_runtime_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    emergency_mode INTEGER NOT NULL DEFAULT 0,
    emergency_reason TEXT NOT NULL DEFAULT '',
    emergency_eta TEXT NOT NULL DEFAULT '',
    updated_by_user_id INTEGER,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);
ensureColumn("ops_runtime_state", "emergency_eta", "TEXT NOT NULL DEFAULT ''");
db.exec(`
  CREATE TABLE IF NOT EXISTS platform_settings (
    setting_key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL DEFAULT '{}',
    updated_by_user_id INTEGER,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);
try {
  const raw = Number(process.env.P2P_MATCH_SLA_MINUTES || 30);
  const seedMin = Math.min(180, Math.max(5, Number.isFinite(raw) ? raw : 30));
  const exists = db.prepare("SELECT setting_key FROM platform_settings WHERE setting_key = ?").get("p2p.match_sla_minutes");
  if (!exists) {
    db.prepare(`
      INSERT INTO platform_settings (setting_key, value_json, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
    `).run("p2p.match_sla_minutes", JSON.stringify({ minutes: seedMin }));
  }
} catch (error) {
  console.warn("[platform_settings] seed skipped:", error?.message || error);
}
db.exec("CREATE INDEX IF NOT EXISTS idx_kyc_view_requests_doc_created ON kyc_document_view_requests(document_id, created_at DESC)");
db.exec("CREATE INDEX IF NOT EXISTS idx_kyc_access_logs_doc_created ON kyc_document_access_logs(document_id, created_at DESC)");
db.exec("CREATE INDEX IF NOT EXISTS idx_webhook_events_occurred_at ON admin_webhook_events(occurred_at DESC)");
db.exec("CREATE INDEX IF NOT EXISTS idx_dispute_approvals_dispute_approved ON dispute_approvals(dispute_id, approved_at DESC)");
db.exec("CREATE INDEX IF NOT EXISTS idx_audit_report_hashes_created ON audit_report_hashes(created_at DESC)");
db.exec("CREATE INDEX IF NOT EXISTS idx_ops_snapshots_created ON ops_snapshots(created_at DESC)");
db.exec("CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_user_requested ON withdrawal_requests(user_id, requested_at DESC)");
db.exec("CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_status_requested ON withdrawal_requests(status, requested_at DESC)");

db.exec(`
  CREATE TABLE IF NOT EXISTS p2p_orders (
    id TEXT PRIMARY KEY,
    seller_user_id INTEGER NOT NULL,
    buyer_user_id INTEGER,
    coin TEXT NOT NULL DEFAULT 'USDT',
    amount_minor INTEGER NOT NULL DEFAULT 0,
    unit_price_minor INTEGER NOT NULL DEFAULT 0,
    payment_method TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'listed',
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (seller_user_id) REFERENCES users(id),
    FOREIGN KEY (buyer_user_id) REFERENCES users(id)
  );
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS p2p_order_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT NOT NULL,
    actor_user_id INTEGER,
    action TEXT NOT NULL,
    detail_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES p2p_orders(id)
  );
`);
db.exec("CREATE INDEX IF NOT EXISTS idx_p2p_orders_status_created ON p2p_orders(status, created_at DESC)");
db.exec("CREATE INDEX IF NOT EXISTS idx_p2p_orders_seller ON p2p_orders(seller_user_id)");
db.exec("CREATE INDEX IF NOT EXISTS idx_p2p_orders_buyer ON p2p_orders(buyer_user_id)");
db.exec("CREATE INDEX IF NOT EXISTS idx_p2p_order_events_order ON p2p_order_events(order_id, id)");
ensureColumn("p2p_orders", "platform_code", "TEXT NOT NULL DEFAULT 'tetherget'");
ensureColumn("p2p_orders", "matched_at", "TEXT");
ensureColumn("p2p_orders", "buyer_payment_started_at", "TEXT");
ensureColumn("p2p_orders", "amount_minor", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("p2p_orders", "unit_price_minor", "INTEGER NOT NULL DEFAULT 0");
try {
  db.prepare(`UPDATE p2p_orders SET matched_at = updated_at WHERE status = 'matched' AND matched_at IS NULL`).run();
} catch (error) {
  console.warn("[p2p_orders] matched_at backfill skipped:", error?.message || error);
}
db.exec("CREATE INDEX IF NOT EXISTS idx_p2p_orders_platform_updated ON p2p_orders(platform_code, updated_at DESC)");

const OPS_SNAPSHOT_TABLES = [
  "users",
  "refresh_tokens",
  "user_wallets",
  "user_financial_accounts",
  "company_wallet",
  "withdrawal_requests",
  "kyc_profiles",
  "escrow_policy",
  "escrow_policy_approvers",
  "disputes",
  "dispute_approvals",
  "escrow_security",
  "dispute_events",
  "dispute_final_otp",
  "kyc_documents",
  "kyc_document_access_logs",
  "kyc_document_view_requests",
  "kyc_document_view_approvals",
  "platform_features",
  "market_assets",
  "market_catalog",
  "admin_webhook_events",
  "audit_report_hashes",
  "platform_audit_logs",
  "platform_settings",
  "p2p_orders",
  "p2p_order_events",
];

function makeSnapshotDir() {
  const dir = path.resolve(process.cwd(), "server", "backups", "ops-snapshots");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function createDbSnapshot({ actorUserId, snapshotType = "manual", label = "", reason = "" }) {
  const dir = makeSnapshotDir();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `tetherget-${snapshotType}-${actorUserId}-${stamp}.db`;
  const filePath = path.join(dir, fileName);
  const escapedPath = filePath.replace(/'/g, "''");
  db.pragma("wal_checkpoint(TRUNCATE)");
  db.exec(`VACUUM INTO '${escapedPath}'`);
  const fileBuffer = fs.readFileSync(filePath);
  const hash = crypto.createHash("sha256").update(fileBuffer).digest("hex");
  const sizeBytes = Buffer.byteLength(fileBuffer);
  const result = db.prepare(`
    INSERT INTO ops_snapshots (
      snapshot_type, label, reason, file_path, sha256_hash, size_bytes, created_by_user_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(snapshotType, label, reason, filePath, hash, sizeBytes, actorUserId);
  return {
    id: Number(result.lastInsertRowid),
    snapshotType,
    label,
    reason,
    filePath,
    sha256Hash: hash,
    sizeBytes,
  };
}

function rollbackFromSnapshot(snapshotPath) {
  const escapedPath = String(snapshotPath || "").replace(/'/g, "''");
  db.exec("PRAGMA foreign_keys = OFF");
  db.exec(`ATTACH DATABASE '${escapedPath}' AS snap`);
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const table of OPS_SNAPSHOT_TABLES) {
      db.prepare(`DELETE FROM ${table}`).run();
      db.prepare(`INSERT INTO ${table} SELECT * FROM snap.${table}`).run();
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  } finally {
    db.exec("DETACH DATABASE snap");
    db.exec("PRAGMA foreign_keys = ON");
  }
}

const adminSeedAccounts = [
  { email: "admin@tetherget.local", nickname: "본사 관리자 (mock)", role: "슈퍼페이지 관리자" },
  { email: "admin@tetherget.com", nickname: "슈퍼페이지 관리자", role: "슈퍼페이지 관리자" },
];
for (const seed of adminSeedAccounts) {
  if (!userRepo.findByEmail(seed.email)) {
    const hash = bcrypt.hashSync("admin1234", 10);
    userRepo.create({
      email: seed.email,
      passwordHash: hash,
      nickname: seed.nickname,
      role: seed.role,
      session_role: "hq_ops",
      sales_level: null,
    });
  }
}
const adminEmail = "admin@tetherget.com";
const ensuredAdmin = userRepo.findByEmail(adminEmail);
if (!ensuredAdmin) {
  console.error("[tetherget-api] 시드 관리자(admin@tetherget.com)를 찾을 수 없습니다.");
  process.exit(1);
}
db.prepare("UPDATE users SET session_role = 'hq_ops', sales_level = NULL WHERE id = ?").run(ensuredAdmin.id);

const salesSeedEmail = "sales@tetherget.com";
if (!userRepo.findByEmail(salesSeedEmail)) {
  const salesHash = bcrypt.hashSync("sales1234", 10);
  userRepo.create({
    email: salesSeedEmail,
    passwordHash: salesHash,
    nickname: "영업테스트",
    role: "영업관리자 LEVEL 1",
    session_role: "sales",
    sales_level: 1,
  });
}
const policyRow = db.prepare("SELECT id FROM escrow_policy WHERE id = 1").get();
if (!policyRow) {
  db.prepare("INSERT INTO escrow_policy (id, main_custody_account, required_approvals, main_final_approver_id) VALUES (1, ?, ?, ?)")
    .run("TG-COMPANY-CUSTODY-001", 3, ensuredAdmin.id);
}
const approverSeed = db.prepare("SELECT 1 FROM escrow_policy_approvers WHERE policy_id = 1 AND user_id = ?").get(ensuredAdmin.id);
if (!approverSeed) {
  db.prepare("INSERT INTO escrow_policy_approvers (policy_id, user_id) VALUES (1, ?)").run(ensuredAdmin.id);
}
const runtimeRow = db.prepare("SELECT id FROM ops_runtime_state WHERE id = 1").get();
if (!runtimeRow) {
  db.prepare("INSERT INTO ops_runtime_state (id, emergency_mode, emergency_reason, emergency_eta, updated_by_user_id, updated_at) VALUES (1, 0, '', '', ?, CURRENT_TIMESTAMP)")
    .run(ensuredAdmin.id);
}
const securityRow = db.prepare("SELECT id FROM escrow_security WHERE id = 1").get();
if (!securityRow) {
  const defaultPinHash = bcrypt.hashSync("123456", 10);
  db.prepare("INSERT INTO escrow_security (id, main_final_approval_pin_hash) VALUES (1, ?)").run(defaultPinHash);
}
const companyWalletRow = db.prepare("SELECT id FROM company_wallet WHERE id = 1").get();
if (!companyWalletRow) {
  db.prepare(`
    INSERT INTO company_wallet (id, wallet_label, wallet_address, available_balance_minor, updated_at)
    VALUES (1, 'TG-COMPANY-HQ-WALLET', '0xTGCOMPANY0001', 100000000000000, CURRENT_TIMESTAMP)
  `).run();
}

function runLedgerMinorMigrationOnce() {
  if (db.prepare("SELECT 1 FROM platform_settings WHERE setting_key = ?").get(LEDGER_MINOR_MIGRATION_KEY)) return;
  try {
    db.transaction(() => {
      if (tableHasColumn("user_financial_accounts", "available_balance")) {
        db.exec(`
          UPDATE user_financial_accounts SET
            available_balance_minor = CAST(ROUND(COALESCE(available_balance,0) * 100000000) AS INTEGER)
        `);
      }
      if (tableHasColumn("user_financial_accounts", "referral_earnings_total")) {
        db.exec(`
          UPDATE user_financial_accounts SET
            referral_earnings_total_minor = CAST(ROUND(COALESCE(referral_earnings_total,0) * 100000000) AS INTEGER)
        `);
      }
      if (tableHasColumn("user_financial_accounts", "pending_withdrawal")) {
        db.exec(`
          UPDATE user_financial_accounts SET
            pending_withdrawal_minor = CAST(ROUND(COALESCE(pending_withdrawal,0) * 100000000) AS INTEGER)
        `);
      }
      if (tableHasColumn("user_financial_accounts", "p2p_escrow_locked")) {
        db.exec(`
          UPDATE user_financial_accounts SET
            p2p_escrow_locked_minor = CAST(ROUND(COALESCE(p2p_escrow_locked,0) * 100000000) AS INTEGER)
        `);
      }
      if (tableHasColumn("company_wallet", "available_balance")) {
        db.exec(`
          UPDATE company_wallet SET
            available_balance_minor = CAST(ROUND(COALESCE(available_balance,0) * 100000000) AS INTEGER)
          WHERE id = 1
        `);
      }
      if (tableHasColumn("withdrawal_requests", "amount")) {
        db.exec(`
          UPDATE withdrawal_requests SET
            amount_minor = CAST(ROUND(COALESCE(amount,0) * 100000000) AS INTEGER)
        `);
      }
      if (tableHasColumn("p2p_orders", "amount")) {
        db.exec(`
          UPDATE p2p_orders SET
            amount_minor = CAST(ROUND(COALESCE(amount,0) * 100000000) AS INTEGER)
        `);
      }
      if (tableHasColumn("p2p_orders", "unit_price")) {
        db.exec(`
          UPDATE p2p_orders SET
            unit_price_minor = CAST(ROUND(COALESCE(unit_price,0) * 100000000) AS INTEGER)
        `);
      }
      db.prepare(`
        INSERT INTO platform_settings (setting_key, value_json, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
      `).run(LEDGER_MINOR_MIGRATION_KEY, JSON.stringify({ migratedAt: new Date().toISOString() }));
    })();
    console.log("[ledger] INTEGER minor migration marker set (REAL→minor backfill if columns existed)");
  } catch (error) {
    console.warn("[ledger] minor migration failed:", error?.message || error);
  }
}

function runLedgerDropRealColumnsOnce() {
  if (db.prepare("SELECT 1 FROM platform_settings WHERE setting_key = ?").get(LEDGER_DROP_REAL_COLUMNS_KEY)) return;
  try {
    db.transaction(() => {
      const dropPairs = [
        ["user_financial_accounts", "available_balance"],
        ["user_financial_accounts", "referral_earnings_total"],
        ["user_financial_accounts", "pending_withdrawal"],
        ["user_financial_accounts", "p2p_escrow_locked"],
        ["company_wallet", "available_balance"],
        ["withdrawal_requests", "amount"],
        ["p2p_orders", "amount"],
        ["p2p_orders", "unit_price"],
      ];
      for (const [tbl, col] of dropPairs) {
        if (tableHasColumn(tbl, col)) {
          db.exec(`ALTER TABLE ${tbl} DROP COLUMN ${col}`);
        }
      }
      db.prepare(`
        INSERT INTO platform_settings (setting_key, value_json, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
      `).run(LEDGER_DROP_REAL_COLUMNS_KEY, JSON.stringify({ droppedAt: new Date().toISOString() }));
    })();
    console.log("[ledger] legacy REAL ledger columns dropped where present");
  } catch (error) {
    console.warn("[ledger] DROP COLUMN migration failed (SQLite ≥ 3.35 필요):", error?.message || error);
  }
}

runLedgerMinorMigrationOnce();
runLedgerDropRealColumnsOnce();
const defaultFeatures = [
  "trade",
  "sell",
  "myinfo",
  "mytrades",
  "friends",
  "messenger",
  "p2p",
  "admin",
  "support",
  "kyc",
  "dispute",
];
for (const featureKey of defaultFeatures) {
  db.prepare("INSERT OR IGNORE INTO platform_features (feature_key, enabled) VALUES (?, 1)").run(featureKey);
}
const defaultMarketAssets = [
  { assetCode: "USDT", displayName: "Tether USD", assetType: "coin", network: "TRC20", settlementEnabled: 1, metadata: { precision: 6 } },
  { assetCode: "BTC", displayName: "Bitcoin", assetType: "coin", network: "BTC", settlementEnabled: 1, metadata: { precision: 8 } },
  { assetCode: "ETH", displayName: "Ethereum", assetType: "coin", network: "ERC20", settlementEnabled: 1, metadata: { precision: 18 } },
  { assetCode: "NFT-PLACEHOLDER", displayName: "NFT Placeholder", assetType: "nft", network: "EVM", settlementEnabled: 0, metadata: { note: "future expansion" } },
];
for (const asset of defaultMarketAssets) {
  db.prepare(`
    INSERT OR IGNORE INTO market_assets (
      asset_code, display_name, asset_type, network, settlement_enabled, is_active, metadata_json, updated_at
    ) VALUES (?, ?, ?, ?, ?, 1, ?, CURRENT_TIMESTAMP)
  `).run(
    asset.assetCode,
    asset.displayName,
    asset.assetType,
    asset.network,
    asset.settlementEnabled ? 1 : 0,
    JSON.stringify(asset.metadata || {})
  );
}
const defaultMarketCatalog = [
  {
    marketKey: "p2p-usdt-krw",
    marketType: "p2p",
    offeredAssetCode: "USDT",
    requestedAssetCode: "KRW",
    settlementAssetCode: "USDT",
    escrowAdapter: "coin_escrow",
    status: "active",
    metadata: { label: "USDT/KRW P2P", fiat: true },
  },
  {
    marketKey: "p2p-btc-usdt",
    marketType: "p2p",
    offeredAssetCode: "BTC",
    requestedAssetCode: "USDT",
    settlementAssetCode: "USDT",
    escrowAdapter: "coin_escrow",
    status: "active",
    metadata: { label: "BTC/USDT P2P", fiat: false },
  },
  {
    marketKey: "p2p-nft-usdt-preview",
    marketType: "p2p",
    offeredAssetCode: "NFT-PLACEHOLDER",
    requestedAssetCode: "USDT",
    settlementAssetCode: "USDT",
    escrowAdapter: "nft_escrow",
    status: "planned",
    metadata: { label: "NFT/USDT Preview", launchReady: false },
  },
];
for (const row of defaultMarketCatalog) {
  db.prepare(`
    INSERT OR IGNORE INTO market_catalog (
      market_key, market_type, offered_asset_code, requested_asset_code, settlement_asset_code,
      escrow_adapter, status, metadata_json, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(
    row.marketKey,
    row.marketType,
    row.offeredAssetCode,
    row.requestedAssetCode,
    row.settlementAssetCode,
    row.escrowAdapter,
    row.status,
    JSON.stringify(row.metadata || {})
  );
}

/** 로컬·루프백 Origin (Vite 등) — IPv4/IPv6·http(s)·임의 포트 */
function isLoopbackDevOrigin(origin) {
  if (!origin) return true;
  try {
    const u = new URL(origin);
    const h = u.hostname;
    if (h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h === "::1") {
      return u.protocol === "http:" || u.protocol === "https:";
    }
  } catch {
    return false;
  }
  return false;
}

const corsProdExtraOrigins = String(process.env.CORS_ORIGIN || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const isProduction = process.env.NODE_ENV === "production";

app.use(
  cors(
    isProduction
      ? {
          origin(origin, callback) {
            if (!origin) return callback(null, true);
            if (isLoopbackDevOrigin(origin)) return callback(null, true);
            if (corsProdExtraOrigins.some((o) => origin === o)) return callback(null, true);
            return callback(new Error("Not allowed by CORS"));
          },
          credentials: false,
        }
      : {
          /** 개발: 모든 Origin 허용(요청 Origin 그대로 반사) — localhost/Vite 프록시 충돌 방지 */
          origin: true,
          credentials: false,
        }
  )
);
app.use(express.json());
app.use((req, res, next) => {
  if (String(req.path || "").startsWith("/api/")) {
    res.setHeader("X-Platform-Code", PLATFORM_CODE);
    res.setHeader("X-Service-Line", SERVICE_LINE);
  }
  next();
});
app.use((req, res, next) => {
  if (!String(req.path || "").startsWith("/api/")) return next();
  const method = String(req.method || "GET").toUpperCase();
  const isMutating = ["POST", "PUT", "PATCH", "DELETE"].includes(method);
  if (!isMutating) return next();
  const opsState = getOpsRuntimeState();
  if (!opsState.emergencyMode) return next();

  if (
    req.path === "/api/auth/login"
    || req.path === "/api/auth/google"
    || req.path === "/api/auth/test-login"
    || req.path === "/api/auth/refresh"
    || req.path === "/api/auth/logout"
  ) {
    return next();
  }
  if (req.path === "/api/admin/ops/emergency-mode") {
    return next();
  }
  const raw = req.headers.authorization || "";
  const token = raw.startsWith("Bearer ") ? raw.slice(7) : "";
  if (!token) {
    return res.status(503).json({
      message: `현재 비상 점검 모드입니다. ${opsState.emergencyReason || "관리자 복구 작업 진행 중"}`,
      emergencyMode: true,
    });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (String(payload?.role || "").includes("관리자")) return next();
  } catch {
    // fall through
  }
  return res.status(503).json({
    message: `현재 비상 점검 모드입니다. ${opsState.emergencyReason || "관리자 복구 작업 진행 중"}`,
    emergencyMode: true,
  });
});
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const secureDocDir = path.resolve(process.cwd(), "server", "secure-docs");
if (!fs.existsSync(secureDocDir)) fs.mkdirSync(secureDocDir, { recursive: true });

function makeToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      nickname: user.nickname,
      session_role: user.session_role || "user",
      sales_level: user.sales_level ?? null,
    },
    JWT_SECRET,
    { expiresIn: "2h" }
  );
}

function makeRefreshToken(user) {
  return jwt.sign(
    { id: user.id, type: "refresh" },
    JWT_SECRET,
    { expiresIn: "30d" }
  );
}

function issueTokens(user) {
  const accessToken = makeToken(user);
  const refreshToken = makeRefreshToken(user);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  refreshTokenRepo.create({ userId: user.id, refreshToken, expiresAt });
  return { accessToken, refreshToken };
}

function clientIp(req) {
  const xf = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  if (xf) return xf.slice(0, 128);
  return String(req.socket?.remoteAddress || req.ip || "").slice(0, 128);
}

/** Unified audit trail (login, later: trades, admin). Never log secrets. */
function appendPlatformAuditLog(req, { userId, eventType, payload = {} }) {
  try {
    const ip = clientIp(req);
    const ua = String(req.headers["user-agent"] || "").slice(0, 500);
    const json = JSON.stringify(mergeAuditPayload(payload));
    db.prepare(`
      INSERT INTO platform_audit_logs (user_id, event_type, payload_json, ip, user_agent, platform_code, created_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(userId ?? null, String(eventType || "unknown"), json, ip, ua, PLATFORM_CODE);
  } catch (error) {
    console.warn("[platform_audit_logs]", error?.message || error);
  }
}

function appendPlatformAuditSystem({ userId = null, eventType, payload = {} }) {
  try {
    const json = JSON.stringify(mergeAuditPayload(payload));
    db.prepare(`
      INSERT INTO platform_audit_logs (user_id, event_type, payload_json, ip, user_agent, platform_code, created_at)
      VALUES (?, ?, ?, '', '', ?, CURRENT_TIMESTAMP)
    `).run(userId, String(eventType || "unknown"), json, PLATFORM_CODE);
  } catch (error) {
    console.warn("[platform_audit_logs]", error?.message || error);
  }
}

function clampPlatformSlaMinutes(n) {
  return Math.min(180, Math.max(5, Math.round(Number(n))));
}

function getEnvDefaultP2pSlaMinutes() {
  const raw = Number(process.env.P2P_MATCH_SLA_MINUTES ?? 30);
  const base = Number.isFinite(raw) ? raw : 30;
  return clampPlatformSlaMinutes(base);
}

function getP2pMatchSlaMinutes() {
  try {
    const row = db.prepare("SELECT value_json FROM platform_settings WHERE setting_key = ?").get("p2p.match_sla_minutes");
    if (!row?.value_json) return getEnvDefaultP2pSlaMinutes();
    const j = JSON.parse(row.value_json);
    const m = typeof j?.minutes === "number" ? j.minutes : Number(j?.minutes);
    if (!Number.isFinite(m)) return getEnvDefaultP2pSlaMinutes();
    return clampPlatformSlaMinutes(m);
  } catch {
    return getEnvDefaultP2pSlaMinutes();
  }
}

function getP2pMatchSlaMs() {
  return getP2pMatchSlaMinutes() * 60 * 1000;
}

function matchDeadlineIso(matchedAtStr) {
  if (!matchedAtStr) return null;
  const t = Date.parse(matchedAtStr);
  if (!Number.isFinite(t)) return null;
  return new Date(t + getP2pMatchSlaMs()).toISOString();
}

function expireStaleMatchedOrders() {
  const slaMs = getP2pMatchSlaMs();
  const slaMin = getP2pMatchSlaMinutes();
  const now = Date.now();
  const rows = db.prepare(`
    SELECT id, matched_at, seller_user_id, amount_minor FROM p2p_orders WHERE status = 'matched' AND matched_at IS NOT NULL AND matched_at != ''
  `).all();
  for (const row of rows) {
    const t = Date.parse(row.matched_at);
    if (!Number.isFinite(t)) continue;
    if (now - t < slaMs) continue;
    const orderId = row.id;
    const sellerId = Number(row.seller_user_id);
    const mi = Math.trunc(Number(row.amount_minor ?? 0));
    db.transaction(() => {
      db.prepare(`UPDATE p2p_orders SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(orderId);
      if (Number.isFinite(sellerId) && mi > 0) {
        unlockSellerP2pEscrowByMinor(sellerId, BigInt(mi));
      }
    })();
    appendP2pOrderEvent(orderId, null, "auto_cancel_match_timeout", mergeDomainPayload({
      sla_minutes: slaMin,
      note: "송금 확인(송금 완료 표시) 미처리",
    }));
    appendPlatformAuditSystem({
      userId: null,
      eventType: "p2p.order_auto_cancel_timeout",
      payload: { orderId, sla_minutes: slaMin },
    });
  }
}

function newP2pOrderId() {
  return `TG-P2P-${Date.now().toString(36)}-${crypto.randomBytes(5).toString("hex")}`;
}

function parseP2pAmount(value) {
  return parseLedgerPositiveAmount(value);
}

function parseP2pPrice(value) {
  const v = parseLedgerNonNegativePrice(value);
  if (v === null) return null;
  return v;
}

function appendP2pOrderEvent(orderId, actorUserId, action, detail = {}) {
  try {
    db.prepare(`
      INSERT INTO p2p_order_events (order_id, actor_user_id, action, detail_json, created_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(orderId, actorUserId ?? null, String(action || ""), JSON.stringify(mergeDomainPayload(detail)));
  } catch (error) {
    console.warn("[p2p_order_events]", error?.message || error);
  }
}

function mapP2pOrderRow(row, viewerUserId) {
  const sellerId = Number(row.seller_user_id);
  const buyerId = row.buyer_user_id != null ? Number(row.buyer_user_id) : null;
  const vid = viewerUserId != null ? Number(viewerUserId) : NaN;
  let my_role = null;
  if (Number.isFinite(vid)) {
    if (vid === sellerId) my_role = "seller";
    else if (buyerId != null && vid === buyerId) my_role = "buyer";
  }
  const matchedAt = row.matched_at ?? null;
  const buyerStarted = row.buyer_payment_started_at ?? null;
  return {
    id: row.id,
    seller_user_id: sellerId,
    buyer_user_id: buyerId,
    coin: row.coin,
    amount: financialMinorToMajor(row.amount_minor),
    unit_price: financialMinorToMajor(row.unit_price_minor),
    payment_method: row.payment_method,
    status: row.status,
    metadata_json: row.metadata_json,
    platform_code: row.platform_code ?? PLATFORM_CODE,
    created_at: row.created_at,
    updated_at: row.updated_at,
    matched_at: matchedAt,
    buyer_payment_started_at: buyerStarted,
    match_deadline_at: row.status === "matched" && matchedAt ? matchDeadlineIso(matchedAt) : null,
    match_sla_minutes: getP2pMatchSlaMinutes(),
    my_role,
  };
}

function authRequired(req, res, next) {
  const raw = req.headers.authorization || "";
  const token = raw.startsWith("Bearer ") ? raw.slice(7) : "";
  if (!token) return res.status(401).json({ message: "인증 토큰이 필요합니다." });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ message: "토큰이 유효하지 않습니다." });
  }
}

function superAdminRequired(req, res, next) {
  const sr = String(req.user?.session_role || "");
  const legacySuper = String(req.user?.role || "").includes("슈퍼페이지");
  if (sr === "hq_ops" || legacySuper) {
    return next();
  }
  return res.status(403).json({ message: "본사 운영(hq_ops) 또는 슈퍼페이지 권한이 필요합니다." });
}

function adminRequired(req, res, next) {
  const role = String(req.user?.role || "");
  const sr = String(req.user?.session_role || "").trim().toLowerCase();
  if (role.includes("관리자")) return next();
  if (sr === "hq_ops" || sr === "super_admin" || sr === "superadmin" || sr === "operator") return next();
  const rl = role.toLowerCase();
  if (rl.includes("admin") || rl.includes("operator") || rl === "hq" || rl.includes("hq_ops")) return next();
  return res.status(403).json({ message: "관리자 권한이 필요합니다." });
}

function canViewAllMarketAuditLogs(user) {
  const viewerSessionRole = String(user?.session_role || "");
  const viewerLegacyRole = String(user?.role || "");
  return viewerSessionRole === "hq_ops" || viewerLegacyRole.includes("슈퍼페이지");
}

function buildMarketAuditChain(rowsAsc) {
  let prevHash = "";
  let headHash = "";
  let tailHash = "";
  for (const row of rowsAsc) {
    const payload = [
      String(row?.id || ""),
      String(row?.actor_user_id || ""),
      String(row?.assets_count || ""),
      String(row?.markets_count || ""),
      String(row?.summary_json || ""),
      String(row?.created_at || ""),
      prevHash,
    ].join("|");
    const rowHash = crypto.createHash("sha256").update(payload).digest("hex");
    if (!headHash) headHash = rowHash;
    tailHash = rowHash;
    prevHash = rowHash;
  }
  return {
    total: rowsAsc.length,
    headHash,
    tailHash,
    rootHash: tailHash,
  };
}

function normalizeStageLabelForAuth(raw) {
  const value = String(raw || "").trim();
  if (!value) return "회원";
  if (value === "일반회원") return "회원";
  if (value === "총판") return "LEVEL 1";
  if (value === "파트너") return "LEVEL 2";
  if (value === "팀장") return "LEVEL 3";
  if (value === "본사") return "슈퍼페이지";
  return value;
}

function getStageRank(raw) {
  const stage = normalizeStageLabelForAuth(raw);
  if (stage === "슈퍼페이지") return 1000;
  if (stage === "본사 관리자") return 900;
  if (stage === "본사 관계자") return 800;
  if (stage === "회원") return 0;
  const levelMatch = stage.match(/^LEVEL\s+(\d{1,2})$/i);
  if (levelMatch) {
    const num = Number(levelMatch[1]);
    if (Number.isFinite(num) && num >= 1 && num <= 10) return 700 - num;
  }
  return 0;
}

function isDescendantByParentChain(targetId, ancestorId) {
  const targetKey = String(targetId || "");
  const ancestorKey = String(ancestorId || "");
  const byId = new Map(
    db.prepare("SELECT id, parent_user_ref FROM users").all().map((row) => [String(row.id), String(row.parent_user_ref || "").trim()])
  );
  const visited = new Set([targetKey]);
  let cursor = byId.get(targetKey) || "";
  while (cursor) {
    if (cursor === ancestorKey) return true;
    if (visited.has(cursor)) return false;
    visited.add(cursor);
    cursor = byId.get(cursor) || "";
  }
  return false;
}

/** 본사·슈퍼 계열은 하부 단계·상위(parent) 변경을 허용 (레거시: role/stage만 있고 session_role 미설정인 계정 포함) */
function isActorHeadOfficeAdmin(actorUser) {
  if (!actorUser) return false;
  const sr = String(actorUser.session_role || "");
  if (sr === "hq_ops") return true;
  const role = String(actorUser.role || "");
  if (role.includes("슈퍼페이지")) return true;
  const stage = normalizeStageLabelForAuth(actorUser.stage_label);
  if (stage === "슈퍼페이지") return true;
  if (stage === "본사 관리자" || stage === "본사 관계자") return true;
  return false;
}

function canActorModifyTarget(actorUser, targetUser, nextStageLabel) {
  if (isActorHeadOfficeAdmin(actorUser)) return true;
  const actorSessionRole = String(actorUser?.session_role || "");
  if (actorSessionRole !== "sales") return false;
  const actorId = String(actorUser?.id || "");
  const targetId = String(targetUser?.id || "");
  if (!actorId || !targetId || actorId === targetId) return false;
  if (!isDescendantByParentChain(targetId, actorId)) return false;
  const actorRank = getStageRank(actorUser?.stage_label);
  const targetCurrentRank = getStageRank(targetUser?.stage_label);
  const targetNextRank = getStageRank(nextStageLabel);
  return actorRank > targetCurrentRank && actorRank > targetNextRank;
}

function getEscrowPolicy() {
  const policy = db.prepare("SELECT * FROM escrow_policy WHERE id = 1").get();
  const approverRows = db
    .prepare("SELECT user_id FROM escrow_policy_approvers WHERE policy_id = 1 ORDER BY user_id ASC")
    .all();
  return {
    mainCustodyAccount: policy.main_custody_account,
    requiredApprovals: policy.required_approvals,
    mainFinalApproverId: policy.main_final_approver_id,
    approverIds: approverRows.map((r) => r.user_id),
    levelDelayHours: {
      Lv1: Number(policy.level_delay_hours_lv1 ?? 48),
      Lv2: Number(policy.level_delay_hours_lv2 ?? 36),
      Lv3: Number(policy.level_delay_hours_lv3 ?? 24),
      Lv4: Number(policy.level_delay_hours_lv4 ?? 12),
      Lv5: Number(policy.level_delay_hours_lv5 ?? 0),
    },
  };
}

function parseJsonSafe(value, fallback = {}) {
  try {
    return JSON.parse(String(value || ""));
  } catch {
    return fallback;
  }
}

function stableSortObject(value) {
  if (Array.isArray(value)) return value.map(stableSortObject);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value)
    .sort()
    .reduce((acc, key) => {
      acc[key] = stableSortObject(value[key]);
      return acc;
    }, {});
}

function buildMarketCatalogRevision(catalog) {
  const assets = (Array.isArray(catalog?.assets) ? catalog.assets : [])
    .map((asset) => ({
      assetCode: String(asset?.assetCode || "").trim().toUpperCase(),
      displayName: String(asset?.displayName || "").trim(),
      assetType: String(asset?.assetType || "").trim(),
      network: String(asset?.network || "").trim(),
      settlementEnabled: Boolean(asset?.settlementEnabled),
      isActive: asset?.isActive === false ? false : true,
      metadata: stableSortObject(asset?.metadata || {}),
    }))
    .sort((a, b) => a.assetCode.localeCompare(b.assetCode));
  const markets = (Array.isArray(catalog?.markets) ? catalog.markets : [])
    .map((market) => ({
      marketKey: String(market?.marketKey || "").trim(),
      marketType: String(market?.marketType || "").trim(),
      offeredAssetCode: String(market?.offeredAssetCode || "").trim().toUpperCase(),
      requestedAssetCode: String(market?.requestedAssetCode || "").trim().toUpperCase(),
      settlementAssetCode: String(market?.settlementAssetCode || "").trim().toUpperCase(),
      escrowAdapter: String(market?.escrowAdapter || "").trim(),
      status: String(market?.status || "").trim(),
      metadata: stableSortObject(market?.metadata || {}),
    }))
    .sort((a, b) => a.marketKey.localeCompare(b.marketKey));
  return crypto.createHash("sha256").update(JSON.stringify({ assets, markets })).digest("hex");
}

function getMarketCatalog({ includeInactive = false } = {}) {
  const assets = db
    .prepare(`
      SELECT asset_code, display_name, asset_type, network, settlement_enabled, is_active, metadata_json, updated_at
      FROM market_assets
      ${includeInactive ? "" : "WHERE is_active = 1"}
      ORDER BY asset_type ASC, asset_code ASC
    `)
    .all()
    .map((row) => ({
      assetCode: row.asset_code,
      displayName: row.display_name,
      assetType: row.asset_type,
      network: row.network,
      settlementEnabled: Boolean(row.settlement_enabled),
      isActive: Boolean(row.is_active),
      metadata: parseJsonSafe(row.metadata_json, {}),
      updatedAt: row.updated_at,
    }));
  const markets = db
    .prepare(`
      SELECT market_key, market_type, offered_asset_code, requested_asset_code, settlement_asset_code,
             escrow_adapter, status, metadata_json, updated_at
      FROM market_catalog
      ${includeInactive ? "" : "WHERE status = 'active'"}
      ORDER BY market_key ASC
    `)
    .all()
    .map((row) => ({
      marketKey: row.market_key,
      marketType: row.market_type,
      offeredAssetCode: row.offered_asset_code,
      requestedAssetCode: row.requested_asset_code,
      settlementAssetCode: row.settlement_asset_code,
      escrowAdapter: row.escrow_adapter,
      status: row.status,
      metadata: parseJsonSafe(row.metadata_json, {}),
      updatedAt: row.updated_at,
    }));
  return { assets, markets };
}

function getOpsRuntimeState() {
  const row = db.prepare("SELECT emergency_mode, emergency_reason, emergency_eta, updated_by_user_id, updated_at FROM ops_runtime_state WHERE id = 1").get();
  return {
    emergencyMode: Boolean(row?.emergency_mode),
    emergencyReason: String(row?.emergency_reason || ""),
    emergencyEta: String(row?.emergency_eta || ""),
    updatedByUserId: Number(row?.updated_by_user_id || 0),
    updatedAt: String(row?.updated_at || ""),
  };
}

function appendDisputeEvent(disputeId, actorUserId, action, detail = "") {
  const prev = db
    .prepare("SELECT event_hash FROM dispute_events WHERE dispute_id = ? ORDER BY id DESC LIMIT 1")
    .get(disputeId);
  const prevHash = prev?.event_hash || "";
  const createdAt = new Date().toISOString();
  const payload = `${disputeId}|${actorUserId}|${action}|${detail}|${createdAt}|${prevHash}`;
  const eventHash = crypto.createHash("sha256").update(payload).digest("hex");
  db.prepare(
    "INSERT INTO dispute_events (dispute_id, actor_user_id, action, detail, created_at, prev_hash, event_hash) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(disputeId, actorUserId, action, detail, createdAt, prevHash, eventHash);
}

function verifyDisputeEventChain(disputeId) {
  const events = db
    .prepare("SELECT id, dispute_id, actor_user_id, action, detail, created_at, prev_hash, event_hash FROM dispute_events WHERE dispute_id = ? ORDER BY id ASC")
    .all(disputeId);
  let expectedPrev = "";
  for (const event of events) {
    if ((event.prev_hash || "") !== expectedPrev) {
      return { valid: false, reason: `prev_hash mismatch at event ${event.id}` };
    }
    const payload = `${event.dispute_id}|${event.actor_user_id}|${event.action}|${event.detail}|${event.created_at}|${event.prev_hash || ""}`;
    const recalculated = crypto.createHash("sha256").update(payload).digest("hex");
    if (recalculated !== event.event_hash) {
      return { valid: false, reason: `event_hash mismatch at event ${event.id}` };
    }
    expectedPrev = event.event_hash;
  }
  return { valid: true, reason: `verified ${events.length} events` };
}

async function sendAdminWebhook(eventType, payload) {
  if (!ADMIN_WEBHOOK_URL) {
    db.prepare(
      "INSERT INTO admin_webhook_events (event_type, status, status_code, error_message, occurred_at) VALUES (?, 'disabled', NULL, ?, ?)"
    ).run(eventType, "ADMIN_WEBHOOK_URL not configured", new Date().toISOString());
    return;
  }
  try {
    const response = await fetch(ADMIN_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventType,
        occurredAt: new Date().toISOString(),
        payload,
      }),
    });
    db.prepare(
      "INSERT INTO admin_webhook_events (event_type, status, status_code, error_message, occurred_at) VALUES (?, ?, ?, '', ?)"
    ).run(eventType, response.ok ? "success" : "failed", Number(response.status || 0), new Date().toISOString());
  } catch (error) {
    db.prepare(
      "INSERT INTO admin_webhook_events (event_type, status, status_code, error_message, occurred_at) VALUES (?, 'failed', NULL, ?, ?)"
    ).run(eventType, String(error?.message || "Network or server error during webhook request"), new Date().toISOString());
    // Webhook failures must not block business flow.
  }
}

function getKycProfile(userId) {
  let profile = db.prepare("SELECT * FROM kyc_profiles WHERE user_id = ?").get(userId);
  if (!profile) {
    db.prepare("INSERT INTO kyc_profiles (user_id) VALUES (?)").run(userId);
    profile = db.prepare("SELECT * FROM kyc_profiles WHERE user_id = ?").get(userId);
  }
  return {
    userId: profile.user_id,
    realName: decryptText(profile.real_name),
    idVerified: Boolean(profile.id_image_uploaded && profile.bank_account_uploaded && profile.account_name_matched && profile.company_approval_status.includes("승인")),
    idImageUploaded: Boolean(profile.id_image_uploaded),
    bankAccountUploaded: Boolean(profile.bank_account_uploaded),
    accountNameMatched: Boolean(profile.account_name_matched),
    companyApprovalStatus: profile.company_approval_status,
    privateStorageNoticeAccepted: Boolean(profile.private_storage_notice_accepted),
  };
}

function normalizeReferralCode(input) {
  return String(input || "").trim().toUpperCase().replace(/\s+/g, "");
}

function normalizeNickname(input) {
  return String(input || "").trim();
}

function pickUniqueNickname(seed) {
  const base = normalizeNickname(seed) || `회원${Date.now() % 100000}`;
  if (!userRepo.findByNickname(base)) return base;
  for (let i = 1; i <= 9999; i += 1) {
    const candidate = `${base}${i}`;
    if (!userRepo.findByNickname(candidate)) return candidate;
  }
  return `${base}-${crypto.randomBytes(2).toString("hex")}`;
}

function isValidReferralCode(code) {
  return /^[A-Z0-9-]{1,20}$/.test(String(code || ""));
}

function generateDefaultReferralCode(userId) {
  return `TG-${String(userId).padStart(6, "0")}`;
}

function normalizeWalletAddress(input) {
  return String(input || "").trim();
}

function normalizeEvmAddress(input) {
  return String(input || "").trim().toLowerCase();
}

function normalizeProvider(input) {
  return String(input || "").trim();
}

function isEvmProvider(provider) {
  const normalized = String(provider || "").toLowerCase();
  return normalized.includes("metamask")
    || normalized.includes("okx")
    || normalized.includes("trust")
    || normalized.includes("coinbase");
}

function normalizeSignature(input) {
  return String(input || "").trim();
}

function buildWalletSignMessage({ provider, walletAddress, nonce }) {
  return [
    "TetherGet Wallet Login",
    `Provider: ${provider}`,
    `Address: ${walletAddress}`,
    `Nonce: ${nonce}`,
    "By signing this message, you confirm wallet ownership.",
  ].join("\n");
}

function isPlaceholderWalletEmail(email) {
  return String(email || "").includes("@wallet.tetherget.local");
}

function makeWalletPlaceholderEmail(provider, walletAddress) {
  const seed = `${normalizeProvider(provider)}:${normalizeWalletAddress(walletAddress)}`;
  const hash = crypto.createHash("sha256").update(seed).digest("hex").slice(0, 16);
  return `wallet-${hash}@wallet.tetherget.local`;
}

function findUserByWalletAddress(walletAddress, provider = "") {
  const normalized = normalizeWalletAddress(walletAddress);
  if (!normalized) return null;
  if (isEvmProvider(provider)) {
    return db.prepare(`
      SELECT u.*
      FROM user_wallets w
      JOIN users u ON u.id = w.user_id
      WHERE LOWER(w.wallet_address) = LOWER(?)
      LIMIT 1
    `).get(normalizeEvmAddress(normalized));
  }
  return db.prepare(`
    SELECT u.*
    FROM user_wallets w
    JOIN users u ON u.id = w.user_id
    WHERE w.wallet_address = ?
    LIMIT 1
  `).get(normalized);
}

function createWalletNonce({ provider, walletAddress }) {
  const nonce = crypto.randomBytes(16).toString("hex");
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const message = buildWalletSignMessage({ provider, walletAddress, nonce });
  db.prepare(`
    INSERT INTO wallet_login_nonces (wallet_provider, wallet_address, nonce, message, expires_at, used)
    VALUES (?, ?, ?, ?, ?, 0)
  `).run(provider, walletAddress, nonce, message, expiresAt);
  return { nonce, message, expiresAt };
}

function consumeWalletNonce({ provider, walletAddress, nonce }) {
  const row = db.prepare(`
    SELECT *
    FROM wallet_login_nonces
    WHERE wallet_provider = ?
      AND LOWER(wallet_address) = LOWER(?)
      AND nonce = ?
    ORDER BY id DESC
    LIMIT 1
  `).get(provider, walletAddress, nonce);
  if (!row) return { ok: false, reason: "nonce_not_found" };
  if (Number(row.used) === 1) return { ok: false, reason: "nonce_used" };
  if (new Date(row.expires_at).getTime() < Date.now()) return { ok: false, reason: "nonce_expired" };
  db.prepare("UPDATE wallet_login_nonces SET used = 1 WHERE id = ?").run(row.id);
  return { ok: true, row };
}

function verifyWalletSignature({ provider, walletAddress, signature, message }) {
  try {
    if (isEvmProvider(provider)) {
      const digest = hashMessage(message);
      const recovered = recoverAddress(digest, signature);
      return normalizeEvmAddress(recovered) === normalizeEvmAddress(walletAddress);
    }
    const publicKey = bs58.decode(walletAddress);
    const sigBytes = bs58.decode(signature);
    const msgBytes = new TextEncoder().encode(message);
    return nacl.sign.detached.verify(msgBytes, sigBytes, publicKey);
  } catch {
    return false;
  }
}

function toPublicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    nickname: user.nickname,
    role: user.role,
    session_role: user.session_role || "user",
    sales_level: user.sales_level == null ? null : Number(user.sales_level),
    referral_code: user.referral_code || "",
    referred_by_user_id: user.referred_by_user_id || null,
    referred_by_code: user.referred_by_code || "",
    stage_label: user.stage_label || "",
    parent_user_ref: user.parent_user_ref || "",
    admin_assigned: Number(user.admin_assigned || 0),
    created_at: user.created_at,
  };
}

function getOrCreateFinancialAccount(userId) {
  let row = db.prepare("SELECT * FROM user_financial_accounts WHERE user_id = ?").get(userId);
  if (!row) {
    db.prepare(`
      INSERT INTO user_financial_accounts (
        user_id,
        available_balance_minor, referral_earnings_total_minor, pending_withdrawal_minor, p2p_escrow_locked_minor,
        updated_at
      )
      VALUES (?, 0, 0, 0, 0, CURRENT_TIMESTAMP)
    `).run(userId);
    row = db.prepare("SELECT * FROM user_financial_accounts WHERE user_id = ?").get(userId);
  }
  return row;
}

function accountBalancesForApi(row) {
  return {
    availableBalance: financialMinorToMajor(row.available_balance_minor),
    referralEarningsTotal: financialMinorToMajor(row.referral_earnings_total_minor),
    pendingWithdrawal: financialMinorToMajor(row.pending_withdrawal_minor),
    p2pEscrowLocked: financialMinorToMajor(row.p2p_escrow_locked_minor),
  };
}

/** P2P 판매 호가 등록 시 출금 가능액에서 예치(동일 단위: 주문 수량). INTEGER 마이너(10^8) 원장. */
function lockSellerP2pEscrowByMinor(sellerUserId, minor) {
  let m;
  try {
    m = minorBigIntToSqlInt(minor);
  } catch {
    return false;
  }
  if (m <= 0) return false;
  getOrCreateFinancialAccount(sellerUserId);
  const info = db.prepare(`
    UPDATE user_financial_accounts
    SET available_balance_minor = available_balance_minor - ?,
        p2p_escrow_locked_minor = p2p_escrow_locked_minor + ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ? AND available_balance_minor >= ?
  `).run(m, m, sellerUserId, m);
  return info.changes === 1;
}

function lockSellerP2pEscrow(sellerUserId, amount) {
  const norm = normalizeLedgerAmount(amount);
  if (!norm.ok) return false;
  return lockSellerP2pEscrowByMinor(sellerUserId, norm.minor);
}

function unlockSellerP2pEscrowByMinor(sellerUserId, minor) {
  let m;
  try {
    m = minorBigIntToSqlInt(minor);
  } catch {
    return;
  }
  if (m <= 0) return;
  getOrCreateFinancialAccount(sellerUserId);
  const info = db.prepare(`
    UPDATE user_financial_accounts
    SET available_balance_minor = available_balance_minor + ?,
        p2p_escrow_locked_minor = p2p_escrow_locked_minor - ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ? AND p2p_escrow_locked_minor >= ?
  `).run(m, m, sellerUserId, m);
  if (info.changes !== 1) {
    console.warn("[p2p_escrow] unlock skipped (locked < amount or no row)", sellerUserId, m);
  }
}

function unlockSellerP2pEscrow(sellerUserId, amount) {
  const norm = normalizeLedgerAmount(amount);
  if (!norm.ok) return;
  unlockSellerP2pEscrowByMinor(sellerUserId, norm.minor);
}

/** 매도 확정 완료 시 매수자 출금 가능 잔고에 코인(주문) 수량 반영. */
function creditBuyerP2pSettlementByMinor(buyerUserId, minor) {
  const uid = Number(buyerUserId);
  if (!Number.isFinite(uid) || uid <= 0) return true;
  let m;
  try {
    m = minorBigIntToSqlInt(minor);
  } catch {
    return false;
  }
  if (m <= 0) return true;
  getOrCreateFinancialAccount(uid);
  const info = db.prepare(`
    UPDATE user_financial_accounts
    SET available_balance_minor = available_balance_minor + ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ?
  `).run(m, uid);
  return info.changes === 1;
}

function creditBuyerP2pSettlement(buyerUserId, amount) {
  const norm = normalizeLedgerAmount(amount, { allowZero: true });
  if (!norm.ok || norm.minor === 0n) return true;
  return creditBuyerP2pSettlementByMinor(buyerUserId, norm.minor);
}

/** 거래 완료 시 예치 락만 해제. 성공 시 true. */
function consumeSellerP2pEscrowByMinor(sellerUserId, minor) {
  let m;
  try {
    m = minorBigIntToSqlInt(minor);
  } catch {
    return false;
  }
  if (m <= 0) return true;
  getOrCreateFinancialAccount(sellerUserId);
  const info = db.prepare(`
    UPDATE user_financial_accounts
    SET p2p_escrow_locked_minor = p2p_escrow_locked_minor - ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ? AND p2p_escrow_locked_minor >= ?
  `).run(m, sellerUserId, m);
  if (info.changes !== 1) {
    console.warn("[p2p_escrow] consume failed", sellerUserId, m);
    return false;
  }
  return true;
}

function consumeSellerP2pEscrow(sellerUserId, amount) {
  const norm = normalizeLedgerAmount(amount, { allowZero: true });
  if (!norm.ok || norm.minor === 0n) return true;
  return consumeSellerP2pEscrowByMinor(sellerUserId, norm.minor);
}

function getUserWallet(userId) {
  let row = db.prepare("SELECT * FROM user_wallets WHERE user_id = ?").get(userId);
  if (!row) {
    db.prepare(`
      INSERT INTO user_wallets (user_id, wallet_provider, wallet_address, connected_at, updated_at)
      VALUES (?, '', '', NULL, CURRENT_TIMESTAMP)
    `).run(userId);
    row = db.prepare("SELECT * FROM user_wallets WHERE user_id = ?").get(userId);
  }
  return row;
}

app.get("/api/health", (_req, res) => {
  /** 다른 로컬 서버(tetherget-backend 등)와 포트만으로 구분하기 어려울 때 확인용 */
  res.json({ ok: true, service: "tetherget-mvp-api" });
});

app.get("/api/runtime-state", (_req, res) => {
  const state = getOpsRuntimeState();
  res.json({
    emergencyMode: state.emergencyMode,
    emergencyReason: state.emergencyReason,
    emergencyEta: state.emergencyEta,
    updatedAt: state.updatedAt,
  });
});

function getStoredMarketPriceFeedProviderId() {
  try {
    const row = db.prepare("SELECT value_json FROM platform_settings WHERE setting_key = ?").get(MARKET_PRICE_FEED_SETTING_KEY);
    return parseStoredMarketPriceFeedProvider(row?.value_json);
  } catch (error) {
    console.warn("[market.price_feed] read failed:", error?.message || error);
    return null;
  }
}

function getMarketPriceFeedPolicyRow() {
  try {
    return db.prepare("SELECT value_json, updated_at, updated_by_user_id FROM platform_settings WHERE setting_key = ?").get(MARKET_PRICE_FEED_SETTING_KEY) || null;
  } catch {
    return null;
  }
}

function marketPriceFeedSettingsPayload() {
  const row = getMarketPriceFeedPolicyRow();
  const stored = parseStoredMarketPriceFeedProvider(row?.value_json);
  const effective = resolvedPriceFeedProviderFromStored(stored);
  return {
    price_feed_provider: stored ?? "",
    price_feed_provider_effective: effective,
    price_feed_builtin_providers: listBuiltinPriceFeedProviders(),
    env_only_price_feed_provider: envResolutionPriceFeedProviderId(),
    price_feed_updated_at: row?.updated_at ?? null,
    price_feed_updated_by: row?.updated_by_user_id ?? null,
  };
}

const PRICE_FEED_CACHE_MS = Number(process.env.PRICE_FEED_CACHE_MS || 45000);
let priceFeedCache = { at: 0, data: null };

function clearPriceFeedCache() {
  priceFeedCache = { at: 0, data: null };
}

async function getCachedMarketPrices() {
  const now = Date.now();
  if (priceFeedCache.data && now - priceFeedCache.at < PRICE_FEED_CACHE_MS) {
    return priceFeedCache.data;
  }
  const stored = getStoredMarketPriceFeedProviderId();
  const data = await buildPriceSnapshot(stored ? { provider: stored } : {});
  priceFeedCache = { at: now, data };
  return data;
}

app.get("/api/market/prices", async (_req, res) => {
  try {
    const snap = await getCachedMarketPrices();
    res.json(snap);
  } catch (error) {
    res.status(500).json({ message: error?.message || "시세 조회에 실패했습니다." });
  }
});

app.post("/api/auth/signup", (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "").trim();
  const nickname = normalizeNickname(req.body?.nickname || "");
  const referralCodeInput = normalizeReferralCode(req.body?.referralCode || "");
  const myReferralCodeInput = normalizeReferralCode(req.body?.myReferralCode || "");
  if (!/\S+@\S+\.\S+/.test(email)) return res.status(400).json({ message: "이메일 형식이 올바르지 않습니다." });
  if (password.length < 6) return res.status(400).json({ message: "비밀번호는 6자 이상이어야 합니다." });
  if (!nickname) return res.status(400).json({ message: "닉네임을 입력하세요." });
  const exists = userRepo.findByEmail(email);
  if (exists) return res.status(409).json({ message: "이미 가입된 이메일입니다." });
  const existsNickname = userRepo.findByNickname(nickname);
  if (existsNickname) return res.status(409).json({ message: "이미 사용 중인 닉네임입니다." });
  let referredByUserId = null;
  let referredByCode = "";
  if (referralCodeInput) {
    if (!isValidReferralCode(referralCodeInput)) {
      return res.status(400).json({ message: "추천인 코드 형식이 올바르지 않습니다." });
    }
    const refOwner = userRepo.findByReferralCode(referralCodeInput);
    if (!refOwner) return res.status(400).json({ message: "유효하지 않은 추천인 코드입니다." });
    referredByUserId = refOwner.id;
    referredByCode = referralCodeInput;
  }
  if (myReferralCodeInput) {
    if (!isValidReferralCode(myReferralCodeInput)) {
      return res.status(400).json({ message: "내 추천 코드 형식이 올바르지 않습니다." });
    }
    const existingMyCode = userRepo.findByReferralCode(myReferralCodeInput);
    if (existingMyCode) return res.status(409).json({ message: "이미 사용 중인 내 추천 코드입니다." });
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const user = userRepo.create({ email, passwordHash, nickname, role: "회원", session_role: "user", sales_level: null });
  const finalMyReferralCode = myReferralCodeInput || generateDefaultReferralCode(user.id);
  db.prepare(`
    UPDATE users
    SET referral_code = ?,
        referred_by_user_id = ?,
        referred_by_code = ?
    WHERE id = ?
  `).run(finalMyReferralCode, referredByUserId, referredByCode, user.id);
  const updatedUser = userRepo.findPublicById(user.id);
  getOrCreateFinancialAccount(user.id);
  getUserWallet(user.id);
  const tokens = issueTokens(updatedUser);
  appendPlatformAuditLog(req, {
    userId: updatedUser.id,
    eventType: "auth.signup",
    payload: { method: "email" },
  });
  res.status(201).json({ ...tokens, user: updatedUser });
});

app.post("/api/auth/google", async (req, res) => {
  if (!googleClient || !GOOGLE_CLIENT_ID) {
    return res.status(503).json({ message: "Google 로그인 설정이 비어 있습니다. GOOGLE_CLIENT_ID를 설정하세요." });
  }
  const credential = String(req.body?.credential || "").trim();
  const referralCodeInput = normalizeReferralCode(req.body?.referralCode || "");
  const myReferralCodeInput = normalizeReferralCode(req.body?.myReferralCode || "");
  if (!credential) {
    return res.status(400).json({ message: "Google credential이 필요합니다." });
  }

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch {
    return res.status(401).json({ message: "Google 인증 토큰 검증에 실패했습니다." });
  }

  const email = String(payload?.email || "").trim().toLowerCase();
  const emailVerified = Boolean(payload?.email_verified);
  if (!email || !emailVerified) {
    return res.status(401).json({ message: "Google 계정 이메일 검증이 필요합니다." });
  }

  const existing = userRepo.findByEmail(email);
  if (existing) {
    const publicUser = toPublicUser(existing);
    const tokens = issueTokens(publicUser);
    appendPlatformAuditLog(req, {
      userId: publicUser.id,
      eventType: "auth.login",
      payload: { method: "google", flow: "existing_user" },
    });
    return res.json({ ...tokens, user: publicUser });
  }

  let referredByUserId = null;
  let referredByCode = "";
  if (referralCodeInput) {
    if (!isValidReferralCode(referralCodeInput)) {
      return res.status(400).json({ message: "추천인 코드 형식이 올바르지 않습니다." });
    }
    const refOwner = userRepo.findByReferralCode(referralCodeInput);
    if (!refOwner) return res.status(400).json({ message: "유효하지 않은 추천인 코드입니다." });
    referredByUserId = refOwner.id;
    referredByCode = referralCodeInput;
  }
  if (myReferralCodeInput) {
    if (!isValidReferralCode(myReferralCodeInput)) {
      return res.status(400).json({ message: "내 추천 코드 형식이 올바르지 않습니다." });
    }
    const existingMyCode = userRepo.findByReferralCode(myReferralCodeInput);
    if (existingMyCode) return res.status(409).json({ message: "이미 사용 중인 내 추천 코드입니다." });
  }

  const nameSeed = String(payload?.name || "").trim() || String(email.split("@")[0] || "회원");
  const nickname = pickUniqueNickname(nameSeed);
  const passwordHash = bcrypt.hashSync(crypto.randomBytes(24).toString("hex"), 10);
  const user = userRepo.create({
    email,
    passwordHash,
    nickname,
    role: "회원",
    session_role: "user",
    sales_level: null,
  });
  const finalMyReferralCode = myReferralCodeInput || generateDefaultReferralCode(user.id);
  db.prepare(`
    UPDATE users
    SET referral_code = ?,
        referred_by_user_id = ?,
        referred_by_code = ?
    WHERE id = ?
  `).run(finalMyReferralCode, referredByUserId, referredByCode, user.id);
  const updatedUser = userRepo.findPublicById(user.id);
  getOrCreateFinancialAccount(user.id);
  getUserWallet(user.id);
  const tokens = issueTokens(updatedUser);
  appendPlatformAuditLog(req, {
    userId: updatedUser.id,
    eventType: "auth.signup",
    payload: { method: "google" },
  });
  return res.status(201).json({ ...tokens, user: updatedUser, oauth: "google" });
});

app.post("/api/auth/login", (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "").trim();
  const user = userRepo.findByEmail(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ message: "이메일 또는 비밀번호가 올바르지 않습니다." });
  }
  const publicUser = toPublicUser(user);
  const tokens = issueTokens(publicUser);
  appendPlatformAuditLog(req, {
    userId: publicUser.id,
    eventType: "auth.login",
    payload: { method: "email" },
  });
  res.json({ ...tokens, user: publicUser });
});

app.post("/api/auth/test-login", (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  if (!/\S+@\S+\.\S+/.test(email)) {
    return res.status(400).json({ message: "테스트 로그인 이메일 형식이 올바르지 않습니다." });
  }
  const user = userRepo.findByEmail(email);
  if (!user) return res.status(404).json({ message: "테스트 로그인 대상 계정을 찾을 수 없습니다." });
  const publicUser = toPublicUser(user);
  const tokens = issueTokens(publicUser);
  appendPlatformAuditLog(req, {
    userId: publicUser.id,
    eventType: "auth.login",
    payload: { method: "test_login" },
  });
  return res.json({ ...tokens, user: publicUser, testLogin: true });
});

app.post("/api/auth/wallet/nonce", (req, res) => {
  const provider = normalizeProvider(req.body?.provider || "");
  const walletAddress = normalizeWalletAddress(req.body?.address || "");
  if (!provider) return res.status(400).json({ message: "지갑 제공자를 입력하세요." });
  if (walletAddress.length < 6) return res.status(400).json({ message: "유효한 지갑 주소를 입력하세요." });
  const challenge = createWalletNonce({ provider, walletAddress });
  return res.json(challenge);
});

app.post("/api/auth/wallet", (req, res) => {
  const provider = normalizeProvider(req.body?.provider || "");
  const walletAddress = normalizeWalletAddress(req.body?.address || "");
  const nonce = String(req.body?.nonce || "").trim();
  const signature = normalizeSignature(req.body?.signature || "");
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "").trim();
  const nickname = normalizeNickname(req.body?.nickname || "");
  const referralCodeInput = normalizeReferralCode(req.body?.referralCode || "");
  const myReferralCodeInput = normalizeReferralCode(req.body?.myReferralCode || "");

  if (!provider) return res.status(400).json({ message: "지갑 제공자를 입력하세요." });
  if (walletAddress.length < 6) return res.status(400).json({ message: "유효한 지갑 주소를 입력하세요." });
  if (!nonce) return res.status(400).json({ message: "서명 nonce가 필요합니다." });
  if (!signature) return res.status(400).json({ message: "지갑 서명이 필요합니다." });
  const nonceResult = consumeWalletNonce({ provider, walletAddress, nonce });
  if (!nonceResult.ok) {
    const reasonMap = {
      nonce_not_found: "유효하지 않은 nonce입니다. 다시 시도하세요.",
      nonce_used: "이미 사용된 nonce입니다. 다시 시도하세요.",
      nonce_expired: "nonce가 만료되었습니다. 다시 시도하세요.",
    };
    return res.status(400).json({ message: reasonMap[nonceResult.reason] || "nonce 검증에 실패했습니다." });
  }
  const validSignature = verifyWalletSignature({
    provider,
    walletAddress,
    signature,
    message: nonceResult.row.message,
  });
  if (!validSignature) {
    return res.status(401).json({ message: "지갑 서명 검증에 실패했습니다." });
  }

  const walletOwner = findUserByWalletAddress(walletAddress, provider);
  if (walletOwner) {
    const tokens = issueTokens(toPublicUser(walletOwner));
    appendPlatformAuditLog(req, {
      userId: walletOwner.id,
      eventType: "auth.login",
      payload: { method: "wallet", linkedBy: "wallet", provider },
    });
    return res.json({ ...tokens, user: toPublicUser(walletOwner), linkedBy: "wallet" });
  }

  let targetUser = null;
  let linkedBy = "wallet";
  if (email) {
    if (!/\S+@\S+\.\S+/.test(email)) return res.status(400).json({ message: "이메일 형식이 올바르지 않습니다." });
    targetUser = userRepo.findByEmail(email);
    if (targetUser) linkedBy = "email";
    if (!targetUser) {
      if (password.length < 6) return res.status(400).json({ message: "비밀번호는 6자 이상이어야 합니다." });
      if (!nickname) return res.status(400).json({ message: "닉네임을 입력하세요." });
    }
  } else {
    if (password.length < 6) return res.status(400).json({ message: "비밀번호는 6자 이상이어야 합니다." });
    if (!nickname) return res.status(400).json({ message: "닉네임을 입력하세요." });
  }

  if (!targetUser) {
    if (myReferralCodeInput) {
      if (!isValidReferralCode(myReferralCodeInput)) {
        return res.status(400).json({ message: "내 추천 코드 형식이 올바르지 않습니다." });
      }
      const existingMyCode = userRepo.findByReferralCode(myReferralCodeInput);
      if (existingMyCode) return res.status(409).json({ message: "이미 사용 중인 내 추천 코드입니다." });
    }
    if (referralCodeInput) {
      if (!isValidReferralCode(referralCodeInput)) {
        return res.status(400).json({ message: "추천인 코드 형식이 올바르지 않습니다." });
      }
      const refOwner = userRepo.findByReferralCode(referralCodeInput);
      if (!refOwner) return res.status(400).json({ message: "유효하지 않은 추천인 코드입니다." });
    }
    const existsNickname = userRepo.findByNickname(nickname);
    if (existsNickname) return res.status(409).json({ message: "이미 사용 중인 닉네임입니다." });

    const finalEmail = email || makeWalletPlaceholderEmail(provider, walletAddress);
    const exists = userRepo.findByEmail(finalEmail);
    if (exists) return res.status(409).json({ message: "이미 가입된 이메일입니다." });
    const passwordHash = bcrypt.hashSync(password, 10);
    const user = userRepo.create({ email: finalEmail, passwordHash, nickname, role: "회원", session_role: "user", sales_level: null });
    let referredByUserId = null;
    let referredByCode = "";
    if (referralCodeInput) {
      const refOwner = userRepo.findByReferralCode(referralCodeInput);
      referredByUserId = refOwner?.id || null;
      referredByCode = referralCodeInput;
    }
    const finalMyReferralCode = myReferralCodeInput || generateDefaultReferralCode(user.id);
    db.prepare(`
      UPDATE users
      SET referral_code = ?,
          referred_by_user_id = ?,
          referred_by_code = ?
      WHERE id = ?
    `).run(finalMyReferralCode, referredByUserId, referredByCode, user.id);
    targetUser = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id);
    getOrCreateFinancialAccount(user.id);
  }

  if (!targetUser) return res.status(500).json({ message: "지갑 계정을 생성할 수 없습니다." });
  db.prepare(`
    INSERT INTO user_wallets (user_id, wallet_provider, wallet_address, connected_at, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET
      wallet_provider = excluded.wallet_provider,
      wallet_address = excluded.wallet_address,
      connected_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
  `).run(targetUser.id, provider, walletAddress);
  getUserWallet(targetUser.id);
  const publicUser = toPublicUser(db.prepare("SELECT * FROM users WHERE id = ?").get(targetUser.id));
  const tokens = issueTokens(publicUser);
  appendPlatformAuditLog(req, {
    userId: publicUser.id,
    eventType: "auth.login",
    payload: { method: "wallet", linkedBy, provider },
  });
  return res.json({ ...tokens, user: publicUser, linkedBy });
});

app.post("/api/auth/refresh", (req, res) => {
  const refreshToken = String(req.body?.refreshToken || "");
  if (!refreshToken) return res.status(400).json({ message: "refresh token이 필요합니다." });
  let payload;
  try {
    payload = jwt.verify(refreshToken, JWT_SECRET);
  } catch {
    return res.status(401).json({ message: "refresh token이 유효하지 않습니다." });
  }
  if (payload?.type !== "refresh" || !payload?.id) {
    return res.status(401).json({ message: "refresh token 형식이 올바르지 않습니다." });
  }
  const matched = refreshTokenRepo.findMatchingByUser(payload.id, refreshToken);
  if (!matched) {
    // Reuse-detection hardening: valid JWT but no stored session => possible stolen/rotated token reuse.
    refreshTokenRepo.deleteByUserId(payload.id);
    return res.status(401).json({ message: "refresh token 재사용이 감지되었습니다. 다시 로그인하세요." });
  }
  if (new Date(matched.expires_at).getTime() < Date.now()) {
    refreshTokenRepo.deleteById(matched.id);
    return res.status(401).json({ message: "세션이 만료되었습니다." });
  }
  const user = userRepo.findPublicById(payload.id);
  if (!user) return res.status(404).json({ message: "사용자를 찾을 수 없습니다." });
  refreshTokenRepo.deleteById(matched.id);
  const tokens = issueTokens(user);
  res.json({ ...tokens, user });
});

app.post("/api/auth/logout", (req, res) => {
  const refreshToken = String(req.body?.refreshToken || "");
  if (!refreshToken) return res.json({ ok: true });
  const matched = refreshTokenRepo.findMatchingAny(refreshToken);
  if (matched) refreshTokenRepo.deleteById(matched.id);
  res.json({ ok: true });
});

app.get("/api/referral/me", authRequired, (req, res) => {
  const user = userRepo.findPublicById(req.user.id);
  if (!user) return res.status(404).json({ message: "사용자를 찾을 수 없습니다." });
  if (!user.referral_code) {
    const generated = generateDefaultReferralCode(user.id);
    db.prepare("UPDATE users SET referral_code = ? WHERE id = ?").run(generated, user.id);
  }
  const refreshed = userRepo.findPublicById(req.user.id);
  res.json({
    referral: {
      myReferralCode: refreshed.referral_code || "",
      referredByCode: refreshed.referred_by_code || "",
      referredByUserId: refreshed.referred_by_user_id || null,
    },
  });
});

app.put("/api/me/nickname", authRequired, (req, res) => {
  const nextNickname = normalizeNickname(req.body?.nickname || "");
  if (!nextNickname) return res.status(400).json({ message: "닉네임을 입력하세요." });
  if (nextNickname.length > 40) return res.status(400).json({ message: "닉네임은 40자 이하여야 합니다." });
  const exists = userRepo.findByNickname(nextNickname);
  if (exists && Number(exists.id) !== Number(req.user.id)) {
    return res.status(409).json({ message: "이미 사용 중인 닉네임입니다." });
  }
  const updated = userRepo.updateNickname(req.user.id, nextNickname);
  return res.json({ user: updated });
});

app.put("/api/auth/me/email-link", authRequired, (req, res) => {
  const nextEmail = String(req.body?.email || "").trim().toLowerCase();
  const nextPassword = String(req.body?.password || "").trim();
  if (!/\S+@\S+\.\S+/.test(nextEmail)) {
    return res.status(400).json({ message: "이메일 형식이 올바르지 않습니다." });
  }
  if (nextPassword.length < 6) {
    return res.status(400).json({ message: "비밀번호는 6자 이상이어야 합니다." });
  }
  const current = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
  if (!current) return res.status(404).json({ message: "사용자를 찾을 수 없습니다." });
  const exists = userRepo.findByEmail(nextEmail);
  if (exists && Number(exists.id) !== Number(req.user.id)) {
    return res.status(409).json({ message: "이미 다른 계정에 연결된 이메일입니다." });
  }
  const passwordHash = bcrypt.hashSync(nextPassword, 10);
  db.prepare("UPDATE users SET email = ?, password_hash = ? WHERE id = ?").run(nextEmail, passwordHash, req.user.id);
  const updated = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
  const publicUser = toPublicUser(updated);
  const tokens = issueTokens(publicUser);
  return res.json({
    ...tokens,
    user: publicUser,
    linked: true,
    upgradedFromWalletOnly: isPlaceholderWalletEmail(current.email),
  });
});

app.put("/api/referral/me/code", authRequired, (req, res) => {
  const nextCode = normalizeReferralCode(req.body?.myReferralCode || "");
  if (!isValidReferralCode(nextCode)) {
    return res.status(400).json({ message: "추천 코드는 영문 대문자/숫자/- 조합으로 1~20자여야 합니다." });
  }
  const exists = userRepo.findByReferralCode(nextCode);
  if (exists && Number(exists.id) !== Number(req.user.id)) {
    return res.status(409).json({ message: "이미 사용 중인 추천 코드입니다." });
  }
  userRepo.updateReferralCode(req.user.id, nextCode);
  const user = userRepo.findPublicById(req.user.id);
  res.json({
    referral: {
      myReferralCode: user.referral_code || "",
      referredByCode: user.referred_by_code || "",
      referredByUserId: user.referred_by_user_id || null,
    },
  });
});

app.get("/api/kyc/me", authRequired, (req, res) => {
  const profile = getKycProfile(req.user.id);
  res.json({ profile });
});

app.get("/api/wallet/me", authRequired, (req, res) => {
  const wallet = getUserWallet(req.user.id);
  res.json({
    wallet: {
      provider: wallet.wallet_provider || "",
      address: wallet.wallet_address || "",
      connectedAt: wallet.connected_at || "",
      updatedAt: wallet.updated_at || "",
    },
  });
});

app.put("/api/wallet/me/connect", authRequired, (req, res) => {
  const provider = String(req.body?.provider || "").trim();
  const address = normalizeWalletAddress(req.body?.address || "");
  if (!provider) return res.status(400).json({ message: "지갑 제공자를 입력하세요." });
  if (address.length < 6) return res.status(400).json({ message: "유효한 지갑 주소를 입력하세요." });
  const owner = findUserByWalletAddress(address, provider);
  if (owner && Number(owner.id) !== Number(req.user.id)) {
    return res.status(409).json({ message: "이미 다른 계정에 연결된 지갑 주소입니다." });
  }
  db.prepare(`
    INSERT INTO user_wallets (user_id, wallet_provider, wallet_address, connected_at, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET
      wallet_provider = excluded.wallet_provider,
      wallet_address = excluded.wallet_address,
      connected_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
  `).run(req.user.id, provider, address);
  const wallet = getUserWallet(req.user.id);
  res.json({
    wallet: {
      provider: wallet.wallet_provider || "",
      address: wallet.wallet_address || "",
      connectedAt: wallet.connected_at || "",
      updatedAt: wallet.updated_at || "",
    },
  });
});

app.get("/api/finance/me", authRequired, (req, res) => {
  const account = getOrCreateFinancialAccount(req.user.id);
  const wallet = getUserWallet(req.user.id);
  const recentWithdrawals = db.prepare(`
    SELECT id, amount_minor, status, destination_wallet_provider, destination_wallet_address, request_note, requested_at, processed_at, company_wallet_tx_id, reject_reason
    FROM withdrawal_requests
    WHERE user_id = ?
    ORDER BY requested_at DESC
    LIMIT 20
  `).all(req.user.id);
  res.json({
    account: {
      ...accountBalancesForApi(account),
      updatedAt: account.updated_at || "",
    },
    wallet: {
      provider: wallet.wallet_provider || "",
      address: wallet.wallet_address || "",
    },
    withdrawals: recentWithdrawals.map((w) => ({
      ...w,
      amount: financialMinorToMajor(w.amount_minor),
    })),
  });
});

app.post("/api/finance/withdrawals", authRequired, (req, res) => {
  const norm = normalizeLedgerAmount(req.body?.amount);
  const note = String(req.body?.note || "").trim();
  const account = getOrCreateFinancialAccount(req.user.id);
  const wallet = getUserWallet(req.user.id);
  if (!wallet.wallet_address) {
    return res.status(400).json({ message: "출금 전에 지갑을 먼저 연결하세요." });
  }
  if (!norm.ok) {
    return res.status(400).json({ message: norm.message || "출금 금액을 올바르게 입력하세요." });
  }
  const avail = BigInt(String(Math.trunc(Number(account.available_balance_minor ?? 0))));
  if (avail < norm.minor) {
    return res.status(400).json({ message: "출금 가능 잔고를 초과했습니다." });
  }
  const m = minorBigIntToSqlInt(norm.minor);
  try {
    const requestId = db.transaction(() => {
      const upd = db.prepare(`
        UPDATE user_financial_accounts
        SET available_balance_minor = available_balance_minor - ?,
            pending_withdrawal_minor = pending_withdrawal_minor + ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ? AND available_balance_minor >= ?
      `).run(m, m, req.user.id, m);
      if (upd.changes !== 1) {
        throw new Error("INSUFFICIENT_BALANCE");
      }
      const ins = db.prepare(`
        INSERT INTO withdrawal_requests (
          user_id, amount_minor, status, destination_wallet_provider, destination_wallet_address, request_note, requested_at
        ) VALUES (?, ?, 'pending', ?, ?, ?, CURRENT_TIMESTAMP)
      `).run(req.user.id, m, wallet.wallet_provider || "", wallet.wallet_address || "", note);
      return Number(ins.lastInsertRowid);
    })();
    const updated = getOrCreateFinancialAccount(req.user.id);
    res.status(201).json({
      requestId,
      message: "출금 신청이 접수되었습니다. 회사 지갑에서 순차 처리됩니다.",
      account: accountBalancesForApi(updated),
    });
  } catch (error) {
    if (error?.message === "INSUFFICIENT_BALANCE") {
      return res.status(400).json({ message: "출금 가능 잔고를 초과했습니다." });
    }
    throw error;
  }
});

app.post("/api/kyc/me/submit", authRequired, (req, res) => {
  const realName = String(req.body?.realName || "").trim();
  if (!realName) return res.status(400).json({ message: "실명을 입력하세요." });
  const encryptedRealName = encryptText(realName);
  db.prepare(`
    INSERT INTO kyc_profiles (
      user_id, real_name, id_image_uploaded, bank_account_uploaded, account_name_matched, company_approval_status, private_storage_notice_accepted, updated_at
    ) VALUES (?, ?, 1, 1, 0, '회사 심사대기', 1, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET
      real_name = excluded.real_name,
      id_image_uploaded = 1,
      bank_account_uploaded = 1,
      account_name_matched = 0,
      company_approval_status = '회사 심사대기',
      private_storage_notice_accepted = 1,
      updated_at = CURRENT_TIMESTAMP
  `).run(req.user.id, encryptedRealName);
  res.json({ profile: getKycProfile(req.user.id) });
});

app.post("/api/kyc/me/upload", authRequired, upload.single("file"), (req, res) => {
  const docType = String(req.body?.docType || "").trim();
  if (!docType || !["id_card", "bank_account"].includes(docType)) {
    return res.status(400).json({ message: "docType은 id_card 또는 bank_account 여야 합니다." });
  }
  if (!req.file) return res.status(400).json({ message: "업로드 파일이 필요합니다." });
  const { encrypted, iv, tag } = encryptBuffer(req.file.buffer);
  const fileKey = `kyc-${req.user.id}-${docType}-${Date.now()}.bin`;
  const filePath = path.join(secureDocDir, fileKey);
  fs.writeFileSync(filePath, encrypted);

  db.prepare(`
    INSERT INTO kyc_documents (user_id, doc_type, file_name, mime_type, file_path, iv_b64, tag_b64, size_bytes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.user.id,
    docType,
    req.file.originalname || fileKey,
    req.file.mimetype || "application/octet-stream",
    filePath,
    iv.toString("base64"),
    tag.toString("base64"),
    Number(req.file.size || encrypted.length)
  );

  if (docType === "id_card") {
    db.prepare("UPDATE kyc_profiles SET id_image_uploaded = 1, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?").run(req.user.id);
  } else {
    db.prepare("UPDATE kyc_profiles SET bank_account_uploaded = 1, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?").run(req.user.id);
  }
  res.json({ ok: true });
});

app.get("/api/admin/kyc/:userId/documents", authRequired, adminRequired, (req, res) => {
  const userId = Number(req.params.userId);
  if (!userId) return res.status(400).json({ message: "유효한 userId가 필요합니다." });
  const docs = db
    .prepare("SELECT id, user_id, doc_type, file_name, mime_type, size_bytes, created_at FROM kyc_documents WHERE user_id = ? ORDER BY id DESC")
    .all(userId);
  res.json({ documents: docs });
});

app.post("/api/admin/kyc/documents/:docId/view-requests", authRequired, adminRequired, (req, res) => {
  const docId = Number(req.params.docId);
  const reason = String(req.body?.reason || "").trim();
  if (!docId) return res.status(400).json({ message: "유효한 문서 ID가 필요합니다." });
  if (!reason || reason.length < 5) return res.status(400).json({ message: "열람 사유를 5자 이상 입력해야 합니다." });
  const doc = db.prepare("SELECT id FROM kyc_documents WHERE id = ?").get(docId);
  if (!doc) return res.status(404).json({ message: "문서를 찾을 수 없습니다." });
  const pending = db
    .prepare("SELECT id FROM kyc_document_view_requests WHERE document_id = ? AND requester_user_id = ? AND status = 'pending' ORDER BY id DESC LIMIT 1")
    .get(docId, req.user.id);
  if (pending) {
    return res.status(409).json({ message: "이미 대기중인 열람 요청이 있습니다. 기존 요청을 승인받은 뒤 진행하세요." });
  }
  const result = db
    .prepare("INSERT INTO kyc_document_view_requests (document_id, requester_user_id, reason, status) VALUES (?, ?, ?, 'pending')")
    .run(docId, req.user.id, reason);
  sendAdminWebhook("kyc_view_request_created", {
    actorUserId: req.user.id,
    requestId: Number(result.lastInsertRowid),
    documentId: docId,
    reason,
  });
  res.status(201).json({ requestId: result.lastInsertRowid });
});

app.post("/api/admin/kyc/view-requests/:requestId/approve", authRequired, adminRequired, (req, res) => {
  const requestId = Number(req.params.requestId);
  if (!requestId) return res.status(400).json({ message: "유효한 requestId가 필요합니다." });
  const request = db.prepare("SELECT * FROM kyc_document_view_requests WHERE id = ?").get(requestId);
  if (!request) return res.status(404).json({ message: "열람 요청을 찾을 수 없습니다." });
  if (String(request.status || "") === "rejected") {
    return res.status(400).json({ message: "반려된 요청은 승인할 수 없습니다." });
  }
  if (Number(request.requester_user_id) === Number(req.user.id)) {
    return res.status(403).json({ message: "요청자 본인은 자신의 요청을 승인할 수 없습니다. 다른 관리자 2인의 승인이 필요합니다." });
  }
  db.prepare("INSERT OR IGNORE INTO kyc_document_view_approvals (request_id, approver_user_id) VALUES (?, ?)")
    .run(requestId, req.user.id);
  const countRow = db.prepare("SELECT COUNT(*) as cnt FROM kyc_document_view_approvals WHERE request_id = ?").get(requestId);
  const approvals = Number(countRow?.cnt || 0);
  if (approvals >= 2) {
    db.prepare("UPDATE kyc_document_view_requests SET status = 'approved' WHERE id = ?").run(requestId);
  }
  sendAdminWebhook("kyc_view_request_approved", {
    actorUserId: req.user.id,
    requestId,
    documentId: Number(request.document_id),
    approvals,
    required: 2,
  });
  res.json({ ok: true, approvals, required: 2 });
});

app.post("/api/admin/kyc/view-requests/:requestId/reject", authRequired, adminRequired, (req, res) => {
  const requestId = Number(req.params.requestId);
  const rejectReason = String(req.body?.rejectReason || "").trim();
  if (!requestId) return res.status(400).json({ message: "유효한 requestId가 필요합니다." });
  if (!rejectReason || rejectReason.length < 5) {
    return res.status(400).json({ message: "반려 사유를 5자 이상 입력해야 합니다." });
  }
  const request = db.prepare("SELECT * FROM kyc_document_view_requests WHERE id = ?").get(requestId);
  if (!request) return res.status(404).json({ message: "열람 요청을 찾을 수 없습니다." });
  if (String(request.status || "") === "approved") {
    return res.status(400).json({ message: "이미 승인된 요청은 반려할 수 없습니다." });
  }
  if (Number(request.requester_user_id) === Number(req.user.id)) {
    return res.status(403).json({ message: "요청자 본인은 자신의 요청을 반려할 수 없습니다." });
  }
  db.prepare(`
    UPDATE kyc_document_view_requests
    SET status = 'rejected',
        rejected_reason = ?,
        rejected_by_user_id = ?,
        rejected_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(rejectReason, req.user.id, requestId);
  sendAdminWebhook("kyc_view_request_rejected", {
    actorUserId: req.user.id,
    requestId,
    documentId: Number(request.document_id),
    rejectReason,
  });
  res.json({ ok: true });
});

app.get("/api/admin/kyc/documents/:docId/view-requests", authRequired, adminRequired, (req, res) => {
  const docId = Number(req.params.docId);
  if (!docId) return res.status(400).json({ message: "유효한 문서 ID가 필요합니다." });
  const requests = db
    .prepare("SELECT id, document_id, requester_user_id, reason, status, created_at, rejected_reason, rejected_by_user_id, rejected_at FROM kyc_document_view_requests WHERE document_id = ? ORDER BY id DESC")
    .all(docId);
  const approvals = db.prepare("SELECT request_id, approver_user_id, approved_at FROM kyc_document_view_approvals").all();
  const grouped = approvals.reduce((acc, row) => {
    acc[row.request_id] = acc[row.request_id] || [];
    acc[row.request_id].push(row);
    return acc;
  }, {});
  res.json({ requests: requests.map((r) => ({ ...r, approvals: grouped[r.id] || [] })) });
});

app.post("/api/admin/kyc/documents/:docId/view", authRequired, adminRequired, (req, res) => {
  const docId = Number(req.params.docId);
  const reason = String(req.body?.reason || "").trim();
  const requestId = Number(req.body?.requestId || 0);
  if (!docId) return res.status(400).json({ message: "유효한 문서 ID가 필요합니다." });
  if (!reason || reason.length < 5) {
    return res.status(400).json({ message: "열람 사유를 5자 이상 입력해야 합니다." });
  }
  const request = db
    .prepare("SELECT * FROM kyc_document_view_requests WHERE id = ? AND document_id = ?")
    .get(requestId, docId);
  if (!request || request.status !== "approved") {
    return res.status(403).json({ message: "2인 승인 완료된 열람 요청이 필요합니다." });
  }
  const myApproval = db
    .prepare("SELECT 1 FROM kyc_document_view_approvals WHERE request_id = ? AND approver_user_id = ?")
    .get(requestId, req.user.id);
  const isRequester = Number(request.requester_user_id) === Number(req.user.id);
  if (!isRequester && !myApproval) {
    return res.status(403).json({ message: "해당 열람 요청의 요청자 또는 승인자만 문서를 열람할 수 있습니다." });
  }
  const doc = db.prepare("SELECT * FROM kyc_documents WHERE id = ?").get(docId);
  if (!doc) return res.status(404).json({ message: "문서를 찾을 수 없습니다." });
  if (!fs.existsSync(doc.file_path)) return res.status(404).json({ message: "암호화 파일이 존재하지 않습니다." });

  const encrypted = fs.readFileSync(doc.file_path);
  const iv = Buffer.from(doc.iv_b64, "base64");
  const tag = Buffer.from(doc.tag_b64, "base64");
  const decrypted = decryptBuffer(encrypted, iv, tag);

  const prev = db
    .prepare("SELECT log_hash FROM kyc_document_access_logs WHERE document_id = ? ORDER BY id DESC LIMIT 1")
    .get(docId);
  const prevHash = prev?.log_hash || "";
  const createdAt = new Date().toISOString();
  const payload = `${docId}|${req.user.id}|${reason}|${createdAt}|${prevHash}`;
  const logHash = crypto.createHash("sha256").update(payload).digest("hex");
  db.prepare(
    "INSERT INTO kyc_document_access_logs (document_id, actor_user_id, reason, created_at, prev_hash, log_hash) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(docId, req.user.id, reason, createdAt, prevHash, logHash);

  const mime = String(doc.mime_type || "");
  let previewText = "";
  let contentBase64 = "";
  if (mime.startsWith("text/")) {
    previewText = decrypted.toString("utf8").slice(0, 2000);
  } else if (mime.startsWith("image/") && decrypted.length <= 2 * 1024 * 1024) {
    contentBase64 = decrypted.toString("base64");
  } else {
    previewText = "이 파일 형식은 UI 미리보기 대신 다운로드/보안 뷰어 경로로 열람하도록 설계되어 있습니다.";
  }

  res.json({
    document: {
      id: doc.id,
      fileName: doc.file_name,
      mimeType: doc.mime_type,
      sizeBytes: doc.size_bytes,
      previewText,
      contentBase64,
      watermarkText: `CONFIDENTIAL · DOC-${doc.id} · ADMIN-${req.user.id} · ${new Date().toISOString()}`,
    },
  });
});

app.get("/api/admin/kyc/documents/:docId/access-logs", authRequired, adminRequired, (req, res) => {
  const docId = Number(req.params.docId);
  if (!docId) return res.status(400).json({ message: "유효한 문서 ID가 필요합니다." });
  const logs = db
    .prepare("SELECT id, document_id, actor_user_id, reason, created_at, prev_hash, log_hash FROM kyc_document_access_logs WHERE document_id = ? ORDER BY id DESC")
    .all(docId);
  res.json({ logs });
});

app.get("/api/admin/kyc/documents/:docId/access-logs/verify", authRequired, adminRequired, (req, res) => {
  const docId = Number(req.params.docId);
  if (!docId) return res.status(400).json({ message: "유효한 문서 ID가 필요합니다." });
  const logs = db
    .prepare("SELECT id, document_id, actor_user_id, reason, created_at, prev_hash, log_hash FROM kyc_document_access_logs WHERE document_id = ? ORDER BY id ASC")
    .all(docId);
  let expectedPrev = "";
  for (const log of logs) {
    if ((log.prev_hash || "") !== expectedPrev) {
      return res.json({ valid: false, reason: `prev_hash mismatch at log ${log.id}` });
    }
    const payload = `${log.document_id}|${log.actor_user_id}|${log.reason}|${log.created_at}|${log.prev_hash || ""}`;
    const recalculated = crypto.createHash("sha256").update(payload).digest("hex");
    if (recalculated !== log.log_hash) {
      return res.json({ valid: false, reason: `log_hash mismatch at log ${log.id}` });
    }
    expectedPrev = log.log_hash;
  }
  res.json({ valid: true, reason: `verified ${logs.length} logs` });
});

app.get("/api/admin/users", authRequired, (_req, res) => {
  const users = userRepo.listPublic();
  res.json({ users });
});

app.get("/api/admin/finance/withdrawals", authRequired, adminRequired, (req, res) => {
  const status = String(req.query?.status || "all");
  const rows = db.prepare(`
    SELECT
      wr.id,
      wr.user_id,
      wr.amount_minor,
      wr.status,
      wr.destination_wallet_provider,
      wr.destination_wallet_address,
      wr.request_note,
      wr.requested_at,
      wr.processed_at,
      wr.processed_by_user_id,
      wr.company_wallet_tx_id,
      wr.reject_reason,
      u.email AS user_email,
      u.nickname AS user_nickname
    FROM withdrawal_requests wr
    LEFT JOIN users u ON u.id = wr.user_id
    WHERE (? = 'all' OR wr.status = ?)
    ORDER BY wr.requested_at DESC
    LIMIT 100
  `).all(status, status);
  const companyWallet = db.prepare("SELECT wallet_label, wallet_address, available_balance_minor, updated_at FROM company_wallet WHERE id = 1").get();
  res.json({
    withdrawals: rows.map((w) => ({
      ...w,
      amount: financialMinorToMajor(w.amount_minor),
    })),
    companyWallet: companyWallet
      ? {
          ...companyWallet,
          available_balance: financialMinorToMajor(companyWallet.available_balance_minor),
        }
      : null,
  });
});

app.post("/api/admin/finance/withdrawals/:id/process", authRequired, adminRequired, (req, res) => {
  const requestId = Number(req.params.id);
  const approve = Boolean(req.body?.approve);
  const rejectReason = String(req.body?.rejectReason || "").trim();
  const row = db.prepare("SELECT * FROM withdrawal_requests WHERE id = ?").get(requestId);
  if (!row) return res.status(404).json({ message: "출금 신청을 찾을 수 없습니다." });
  if (row.status !== "pending") return res.status(400).json({ message: "대기중 신청만 처리할 수 있습니다." });
  const amountLm = normalizeLedgerFromSqlMinor(row.amount_minor);
  if (!amountLm.ok) {
    return res.status(400).json({ message: "저장된 출금 금액이 유효하지 않습니다. 관리자에게 문의하세요." });
  }
  const m = minorBigIntToSqlInt(amountLm.minor);

  const tx = db.transaction(() => {
    if (approve) {
      const companyWallet = db.prepare("SELECT * FROM company_wallet WHERE id = 1").get();
      const companyAvail = BigInt(String(Math.trunc(Number(companyWallet?.available_balance_minor ?? 0))));
      if (companyAvail < amountLm.minor) {
        throw new Error("회사 지갑 잔고가 부족합니다.");
      }
      const txId = `COMPANY-TX-${Date.now()}-${requestId}`;
      db.prepare(`
        UPDATE withdrawal_requests
        SET status = 'approved',
            processed_at = CURRENT_TIMESTAMP,
            processed_by_user_id = ?,
            company_wallet_tx_id = ?,
            reject_reason = ''
        WHERE id = ?
      `).run(req.user.id, txId, requestId);
      const userUpd = db.prepare(`
        UPDATE user_financial_accounts
        SET pending_withdrawal_minor = pending_withdrawal_minor - ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ? AND pending_withdrawal_minor >= ?
      `).run(m, row.user_id, m);
      if (userUpd.changes !== 1) {
        throw new Error("회원 출금 대기 잔액과 맞지 않습니다.");
      }
      const cwUpd = db.prepare(`
        UPDATE company_wallet
        SET available_balance_minor = available_balance_minor - ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = 1 AND available_balance_minor >= ?
      `).run(m, m);
      if (cwUpd.changes !== 1) {
        throw new Error("회사 지갑 잔고가 부족합니다.");
      }
      return txId;
    }
    if (!rejectReason) {
      throw new Error("반려 사유를 입력하세요.");
    }
    db.prepare(`
      UPDATE withdrawal_requests
      SET status = 'rejected',
          processed_at = CURRENT_TIMESTAMP,
          processed_by_user_id = ?,
          reject_reason = ?
      WHERE id = ?
    `).run(req.user.id, rejectReason, requestId);
    const rej = db.prepare(`
      UPDATE user_financial_accounts
      SET available_balance_minor = available_balance_minor + ?,
          pending_withdrawal_minor = pending_withdrawal_minor - ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND pending_withdrawal_minor >= ?
    `).run(m, m, row.user_id, m);
    if (rej.changes !== 1) {
      throw new Error("출금 대기 잔액과 맞지 않습니다.");
    }
    return "";
  });

  try {
    const txId = tx();
    const updated = db.prepare("SELECT * FROM withdrawal_requests WHERE id = ?").get(requestId);
    res.json({
      message: approve ? "회사 지갑에서 출금 처리를 완료했습니다." : "출금 신청이 반려되었고 잔고가 복구되었습니다.",
      withdrawal: { ...updated, amount: financialMinorToMajor(updated.amount_minor) },
      txId,
    });
  } catch (error) {
    return res.status(400).json({ message: error.message || "출금 처리에 실패했습니다." });
  }
});

app.post("/api/admin/finance/users/:userId/referral-credit", authRequired, adminRequired, (req, res) => {
  const userId = Number(req.params.userId);
  const norm = normalizeLedgerAmount(req.body?.amount);
  if (!Number.isFinite(userId) || userId <= 0) return res.status(400).json({ message: "유효한 회원 ID가 필요합니다." });
  if (!norm.ok) return res.status(400).json({ message: norm.message || "유효한 수익 금액을 입력하세요." });
  const mi = minorBigIntToSqlInt(norm.minor);
  getOrCreateFinancialAccount(userId);
  db.prepare(`
    UPDATE user_financial_accounts
    SET available_balance_minor = available_balance_minor + ?,
        referral_earnings_total_minor = referral_earnings_total_minor + ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ?
  `).run(mi, mi, userId);
  const account = getOrCreateFinancialAccount(userId);
  res.json({
    message: "레퍼럴 수익이 잔고에 반영되었습니다.",
    account: accountBalancesForApi(account),
  });
});

app.get("/api/features", authRequired, (_req, res) => {
  const features = db.prepare("SELECT feature_key, enabled FROM platform_features ORDER BY feature_key ASC").all();
  res.json({
    features: features.reduce((acc, row) => {
      acc[row.feature_key] = Boolean(row.enabled);
      return acc;
    }, {}),
  });
});

app.get("/api/markets/catalog", authRequired, (_req, res) => {
  const catalog = getMarketCatalog({ includeInactive: false });
  res.json({ ...catalog, revision: buildMarketCatalogRevision(catalog) });
});

app.get("/api/admin/features", authRequired, adminRequired, (_req, res) => {
  const features = db.prepare("SELECT feature_key, enabled, updated_at FROM platform_features ORDER BY feature_key ASC").all();
  res.json({ features });
});

app.get("/api/admin/markets/catalog", authRequired, adminRequired, (_req, res) => {
  const catalog = getMarketCatalog({ includeInactive: true });
  res.json({ ...catalog, revision: buildMarketCatalogRevision(catalog) });
});

app.get("/api/admin/markets/catalog/audit", authRequired, adminRequired, (req, res) => {
  const limit = Math.min(Math.max(Number(req.query?.limit || 20), 1), 100);
  const requestedActorUserId = Number(req.query?.actorUserId || 0);
  const beforeId = Number(req.query?.beforeId || 0);
  const q = String(req.query?.q || "").trim().toLowerCase();
  const fromDate = String(req.query?.fromDate || "").trim();
  const toDate = String(req.query?.toDate || "").trim();
  const canViewAllAuditLogs = canViewAllMarketAuditLogs(req.user);
  const actorUserId = canViewAllAuditLogs ? requestedActorUserId : Number(req.user?.id || 0);
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (fromDate && !datePattern.test(fromDate)) return res.status(400).json({ message: "fromDate 형식이 잘못되었습니다. (YYYY-MM-DD)" });
  if (toDate && !datePattern.test(toDate)) return res.status(400).json({ message: "toDate 형식이 잘못되었습니다. (YYYY-MM-DD)" });
  const params = [];
  let sql = `
      SELECT l.id, l.actor_user_id, u.nickname AS actor_name, l.assets_count, l.markets_count, l.summary_json, l.created_at
      FROM market_catalog_audit_logs l
      LEFT JOIN users u ON u.id = l.actor_user_id
  `;
  const where = [];
  if (actorUserId > 0) {
    where.push("l.actor_user_id = ?");
    params.push(actorUserId);
  }
  if (beforeId > 0) {
    where.push("l.id < ?");
    params.push(beforeId);
  }
  if (q) {
    where.push("(LOWER(COALESCE(l.summary_json, '')) LIKE ? OR LOWER(COALESCE(u.nickname, '')) LIKE ?)");
    params.push(`%${q}%`, `%${q}%`);
  }
  if (fromDate) {
    where.push("l.created_at >= ?");
    params.push(`${fromDate} 00:00:00`);
  }
  if (toDate) {
    where.push("l.created_at <= ?");
    params.push(`${toDate} 23:59:59`);
  }
  if (where.length) sql += ` WHERE ${where.join(" AND ")} `;
  sql += " ORDER BY l.id DESC LIMIT ?";
  params.push(limit + 1);
  const rows = db
    .prepare(sql)
    .all(...params)
    .map((row) => ({
      id: row.id,
      actorUserId: row.actor_user_id,
      actorName: row.actor_name || "",
      assetsCount: Number(row.assets_count || 0),
      marketsCount: Number(row.markets_count || 0),
      summary: parseJsonSafe(row.summary_json, {}),
      createdAt: row.created_at,
    }));
  const hasMore = rows.length > limit;
  const logs = hasMore ? rows.slice(0, limit) : rows;
  const nextBeforeId = logs.length ? Number(logs[logs.length - 1].id) : 0;
  res.json({ logs, hasMore, nextBeforeId, scope: canViewAllAuditLogs ? "all" : "self" });
});

app.get("/api/admin/markets/catalog/audit/verify", authRequired, adminRequired, (req, res) => {
  const requestedActorUserId = Number(req.query?.actorUserId || 0);
  const q = String(req.query?.q || "").trim().toLowerCase();
  const fromDate = String(req.query?.fromDate || "").trim();
  const toDate = String(req.query?.toDate || "").trim();
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (fromDate && !datePattern.test(fromDate)) return res.status(400).json({ message: "fromDate 형식이 잘못되었습니다. (YYYY-MM-DD)" });
  if (toDate && !datePattern.test(toDate)) return res.status(400).json({ message: "toDate 형식이 잘못되었습니다. (YYYY-MM-DD)" });
  const canViewAllAuditLogs = canViewAllMarketAuditLogs(req.user);
  const actorUserId = canViewAllAuditLogs ? requestedActorUserId : Number(req.user?.id || 0);
  const where = [];
  const params = [];
  if (actorUserId > 0) {
    where.push("l.actor_user_id = ?");
    params.push(actorUserId);
  }
  if (q) {
    where.push("(LOWER(COALESCE(l.summary_json, '')) LIKE ? OR LOWER(COALESCE(u.nickname, '')) LIKE ?)");
    params.push(`%${q}%`, `%${q}%`);
  }
  if (fromDate) {
    where.push("l.created_at >= ?");
    params.push(`${fromDate} 00:00:00`);
  }
  if (toDate) {
    where.push("l.created_at <= ?");
    params.push(`${toDate} 23:59:59`);
  }
  let sql = `
    SELECT l.id, l.actor_user_id, l.assets_count, l.markets_count, l.summary_json, l.created_at
    FROM market_catalog_audit_logs l
    LEFT JOIN users u ON u.id = l.actor_user_id
  `;
  if (where.length) sql += ` WHERE ${where.join(" AND ")} `;
  sql += " ORDER BY l.id ASC";
  const rows = db.prepare(sql).all(...params);
  const chain = buildMarketAuditChain(rows);
  const firstId = rows.length ? Number(rows[0].id) : 0;
  const lastId = rows.length ? Number(rows[rows.length - 1].id) : 0;
  const previousProof = db.prepare(`
    SELECT sha256_hash, created_at
    FROM audit_report_hashes
    WHERE report_type = 'market_catalog_audit_chain'
    ORDER BY id DESC
    LIMIT 1
  `).get();
  const previousHash = String(previousProof?.sha256_hash || "");
  const changedFromPrevious = Boolean(chain.rootHash && previousHash && chain.rootHash !== previousHash);
  if (changedFromPrevious) {
    sendAdminWebhook("market_catalog_audit_chain_changed", {
      actorUserId: req.user.id,
      scope: canViewAllAuditLogs ? "all" : "self",
      total: chain.total,
      previousHash,
      newHash: chain.rootHash,
      previousCreatedAt: String(previousProof?.created_at || ""),
    });
  }
  res.json({
    valid: true,
    scope: canViewAllAuditLogs ? "all" : "self",
    total: chain.total,
    firstId,
    lastId,
    headHash: chain.headHash,
    rootHash: chain.rootHash,
    changedFromPrevious,
    previousHash,
  });
});

app.get("/api/admin/webhook-events", authRequired, adminRequired, (req, res) => {
  const limit = Math.min(Math.max(Number(req.query?.limit || 20), 1), 100);
  const events = db
    .prepare("SELECT id, event_type, status, status_code, error_message, occurred_at FROM admin_webhook_events ORDER BY id DESC LIMIT ?")
    .all(limit);
  res.json({ events });
});

app.get("/api/admin/ops/emergency-mode", authRequired, adminRequired, (_req, res) => {
  const state = getOpsRuntimeState();
  res.json({ state });
});

app.put("/api/admin/ops/emergency-mode", authRequired, superAdminRequired, (req, res) => {
  const enabled = Boolean(req.body?.enabled);
  const reason = String(req.body?.reason || "").trim();
  const eta = String(req.body?.eta || "").trim();
  if (enabled && reason.length < 5) {
    return res.status(400).json({ message: "비상모드 활성화 사유를 5자 이상 입력하세요." });
  }
  if (enabled && eta && eta.length < 3) {
    return res.status(400).json({ message: "ETA 형식이 너무 짧습니다. 예: 2026-05-09 03:00 KST" });
  }
  db.prepare(`
    UPDATE ops_runtime_state
    SET emergency_mode = ?,
        emergency_reason = ?,
        emergency_eta = ?,
        updated_by_user_id = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = 1
  `).run(enabled ? 1 : 0, enabled ? reason : "", enabled ? eta : "", req.user.id);
  sendAdminWebhook("ops_emergency_mode_updated", {
    actorUserId: req.user.id,
    enabled,
    reason: enabled ? reason : "비상모드 해제",
    eta: enabled ? eta : "",
  });
  res.json({ ok: true, state: getOpsRuntimeState() });
});

app.get("/api/admin/ops/risk-summary", authRequired, adminRequired, (_req, res) => {
  const webhookFailed24h = db.prepare(`
    SELECT COUNT(*) as cnt
    FROM admin_webhook_events
    WHERE status = 'failed' AND datetime(occurred_at) >= datetime('now', '-1 day')
  `).get();
  const webhookDisabled24h = db.prepare(`
    SELECT COUNT(*) as cnt
    FROM admin_webhook_events
    WHERE status = 'disabled' AND datetime(occurred_at) >= datetime('now', '-1 day')
  `).get();
  const pendingKycOver12h = db.prepare(`
    SELECT COUNT(*) as cnt
    FROM kyc_document_view_requests
    WHERE status = 'pending' AND datetime(created_at) <= datetime('now', '-12 hour')
  `).get();
  const expiredOtpUnused = db.prepare(`
    SELECT COUNT(*) as cnt
    FROM dispute_final_otp
    WHERE used = 0 AND datetime(expires_at) < datetime('now')
  `).get();
  const disputeFinalPendingOver24h = db.prepare(`
    SELECT COUNT(*) as cnt
    FROM disputes
    WHERE status = '최종승인대기' AND datetime(multi_approved_at) <= datetime('now', '-1 day')
  `).get();

  const risks = [
    {
      key: "webhook_failed_24h",
      level: Number(webhookFailed24h?.cnt || 0) > 0 ? "high" : "normal",
      count: Number(webhookFailed24h?.cnt || 0),
      message: "최근 24시간 웹훅 실패 건수",
    },
    {
      key: "webhook_disabled_24h",
      level: Number(webhookDisabled24h?.cnt || 0) > 0 ? "medium" : "normal",
      count: Number(webhookDisabled24h?.cnt || 0),
      message: "최근 24시간 웹훅 비활성(disabled) 건수",
    },
    {
      key: "kyc_pending_over_12h",
      level: Number(pendingKycOver12h?.cnt || 0) > 0 ? "medium" : "normal",
      count: Number(pendingKycOver12h?.cnt || 0),
      message: "12시간 이상 대기중인 KYC 열람 요청",
    },
    {
      key: "expired_otp_unused",
      level: Number(expiredOtpUnused?.cnt || 0) > 0 ? "medium" : "normal",
      count: Number(expiredOtpUnused?.cnt || 0),
      message: "만료되었지만 미사용 상태인 OTP 건수",
    },
    {
      key: "dispute_final_pending_over_24h",
      level: Number(disputeFinalPendingOver24h?.cnt || 0) > 0 ? "high" : "normal",
      count: Number(disputeFinalPendingOver24h?.cnt || 0),
      message: "24시간 이상 최종승인대기 분쟁 건수",
    },
  ];

  const score = risks.reduce((acc, item) => {
    if (item.level === "high") return acc + 3;
    if (item.level === "medium") return acc + 1;
    return acc;
  }, 0);
  const overallLevel = score >= 6 ? "high" : score >= 2 ? "medium" : "normal";
  res.json({
    overallLevel,
    score,
    risks,
    generatedAt: new Date().toISOString(),
  });
});

app.get("/api/admin/ops/snapshots", authRequired, adminRequired, (req, res) => {
  const limit = Math.min(Math.max(Number(req.query?.limit || 20), 1), 100);
  const rows = db.prepare(`
    SELECT s.id, s.snapshot_type, s.label, s.reason, s.file_path, s.sha256_hash, s.size_bytes, s.created_by_user_id, s.created_at,
           u.nickname as created_by_name
    FROM ops_snapshots s
    LEFT JOIN users u ON u.id = s.created_by_user_id
    ORDER BY s.id DESC
    LIMIT ?
  `).all(limit);
  res.json({ snapshots: rows });
});

app.post("/api/admin/ops/snapshots", authRequired, superAdminRequired, (req, res) => {
  const label = String(req.body?.label || "").trim();
  const reason = String(req.body?.reason || "").trim();
  const snapshot = createDbSnapshot({
    actorUserId: req.user.id,
    snapshotType: "manual",
    label,
    reason,
  });
  sendAdminWebhook("ops_snapshot_created", {
    actorUserId: req.user.id,
    snapshotId: snapshot.id,
    label,
    reason,
    sha256Hash: snapshot.sha256Hash,
    sizeBytes: snapshot.sizeBytes,
  });
  res.status(201).json({ ok: true, snapshot });
});

app.post("/api/admin/ops/rollback", authRequired, superAdminRequired, (req, res) => {
  const snapshotId = Number(req.body?.snapshotId || 0);
  const reason = String(req.body?.reason || "").trim();
  const confirmText = String(req.body?.confirmText || "").trim();
  if (!snapshotId) return res.status(400).json({ message: "snapshotId가 필요합니다." });
  if (!reason || reason.length < 5) return res.status(400).json({ message: "롤백 사유를 5자 이상 입력하세요." });
  if (confirmText !== "ROLLBACK") return res.status(400).json({ message: "확인문구 ROLLBACK을 정확히 입력해야 합니다." });
  const target = db.prepare("SELECT * FROM ops_snapshots WHERE id = ?").get(snapshotId);
  if (!target) return res.status(404).json({ message: "대상 스냅샷을 찾을 수 없습니다." });
  if (!fs.existsSync(target.file_path)) return res.status(404).json({ message: "스냅샷 파일이 존재하지 않습니다." });

  const preRollbackSnapshot = createDbSnapshot({
    actorUserId: req.user.id,
    snapshotType: "pre-rollback",
    label: `before-rollback-to-${snapshotId}`,
    reason,
  });
  rollbackFromSnapshot(target.file_path);

  sendAdminWebhook("ops_rollback_executed", {
    actorUserId: req.user.id,
    targetSnapshotId: snapshotId,
    preRollbackSnapshotId: preRollbackSnapshot.id,
    reason,
  });
  res.json({
    ok: true,
    message: "롤백이 완료되었습니다.",
    rolledBackToSnapshotId: snapshotId,
    preRollbackSnapshotId: preRollbackSnapshot.id,
  });
});

app.post("/api/admin/ops/actions/cleanup-expired-otp", authRequired, adminRequired, (req, res) => {
  const result = db.prepare("UPDATE dispute_final_otp SET used = 1 WHERE used = 0 AND datetime(expires_at) < datetime('now')").run();
  appendDisputeEvent("OPS", req.user.id, "운영조치", `만료 OTP 정리 ${Number(result.changes || 0)}건`);
  res.json({ ok: true, cleaned: Number(result.changes || 0) });
});

app.post("/api/admin/ops/actions/reject-stale-kyc-requests", authRequired, adminRequired, (req, res) => {
  const autoReason = String(req.body?.reason || "장기 대기 요청 자동 반려(운영 정책)").trim();
  const staleRows = db.prepare(`
    SELECT id
    FROM kyc_document_view_requests
    WHERE status = 'pending' AND datetime(created_at) <= datetime('now', '-12 hour')
    ORDER BY id ASC
    LIMIT 200
  `).all();
  const stmt = db.prepare(`
    UPDATE kyc_document_view_requests
    SET status = 'rejected',
        rejected_reason = ?,
        rejected_by_user_id = ?,
        rejected_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status = 'pending'
  `);
  let updated = 0;
  for (const row of staleRows) {
    const r = stmt.run(autoReason, req.user.id, row.id);
    updated += Number(r.changes || 0);
  }
  res.json({ ok: true, rejected: updated });
});

app.get("/api/admin/audit/approvals", authRequired, adminRequired, (req, res) => {
  const from = String(req.query?.from || "").trim();
  const to = String(req.query?.to || "").trim();
  const limit = Math.min(Math.max(Number(req.query?.limit || 100), 1), 500);

  const users = db.prepare("SELECT id, nickname, email FROM users").all();
  const userMap = users.reduce((acc, user) => {
    acc[user.id] = user.nickname || user.email || String(user.id);
    return acc;
  }, {});

  const whereDate = "((? = '' OR substr(created_at, 1, 10) >= ?) AND (? = '' OR substr(created_at, 1, 10) <= ?))";

  const kycRequests = db.prepare(`
    SELECT id, document_id, requester_user_id, status, rejected_reason, rejected_by_user_id, created_at
    FROM kyc_document_view_requests
    WHERE ${whereDate}
    ORDER BY id DESC
    LIMIT ?
  `).all(from, from, to, to, limit);

  const kycApprovals = db.prepare(`
    SELECT request_id, approver_user_id, approved_at
    FROM kyc_document_view_approvals
    WHERE ((? = '' OR substr(approved_at, 1, 10) >= ?) AND (? = '' OR substr(approved_at, 1, 10) <= ?))
    ORDER BY approved_at DESC
    LIMIT ?
  `).all(from, from, to, to, limit);

  const kycAccessLogs = db.prepare(`
    SELECT id, document_id, actor_user_id, reason, created_at
    FROM kyc_document_access_logs
    WHERE ${whereDate}
    ORDER BY id DESC
    LIMIT ?
  `).all(from, from, to, to, limit);

  const disputeApprovals = db.prepare(`
    SELECT dispute_id, approver_user_id, approved_at
    FROM dispute_approvals
    WHERE ((? = '' OR substr(approved_at, 1, 10) >= ?) AND (? = '' OR substr(approved_at, 1, 10) <= ?))
    ORDER BY approved_at DESC
    LIMIT ?
  `).all(from, from, to, to, limit);

  const events = [
    ...kycRequests.map((row) => ({
      kind: "kyc_request",
      action: row.status === "rejected" ? "KYC 열람요청 반려" : row.status === "approved" ? "KYC 열람요청 승인완료" : "KYC 열람요청 생성",
      actorUserId: row.requester_user_id,
      actorName: userMap[row.requester_user_id] || String(row.requester_user_id),
      target: `DOC-${row.document_id}`,
      detail: row.rejected_reason ? `반려사유: ${row.rejected_reason}` : `요청 상태: ${row.status}`,
      createdAt: row.created_at,
    })),
    ...kycApprovals.map((row) => ({
      kind: "kyc_approval",
      action: "KYC 열람요청 승인",
      actorUserId: row.approver_user_id,
      actorName: userMap[row.approver_user_id] || String(row.approver_user_id),
      target: `REQ-${row.request_id}`,
      detail: "2인 승인 워크플로우 승인 수행",
      createdAt: row.approved_at,
    })),
    ...kycAccessLogs.map((row) => ({
      kind: "kyc_view",
      action: "KYC 문서 열람",
      actorUserId: row.actor_user_id,
      actorName: userMap[row.actor_user_id] || String(row.actor_user_id),
      target: `DOC-${row.document_id}`,
      detail: row.reason || "",
      createdAt: row.created_at,
    })),
    ...disputeApprovals.map((row) => ({
      kind: "dispute_approval",
      action: "분쟁 승인 결재",
      actorUserId: row.approver_user_id,
      actorName: userMap[row.approver_user_id] || String(row.approver_user_id),
      target: row.dispute_id,
      detail: "분쟁 다중승인 승인 처리",
      createdAt: row.approved_at,
    })),
  ]
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, limit);

  res.json({
    summary: {
      totalEvents: events.length,
      kycRequestCount: kycRequests.length,
      kycApprovalCount: kycApprovals.length,
      kycRejectedCount: kycRequests.filter((r) => r.status === "rejected").length,
      kycViewCount: kycAccessLogs.length,
      disputeApprovalCount: disputeApprovals.length,
    },
    events,
  });
});

app.post("/api/admin/audit/report-hashes", authRequired, adminRequired, (req, res) => {
  const reportType = String(req.body?.reportType || "").trim();
  const fromDate = String(req.body?.fromDate || "").trim();
  const toDate = String(req.body?.toDate || "").trim();
  const rowCount = Number(req.body?.rowCount || 0);
  const sha256Hash = String(req.body?.sha256Hash || "").trim().toLowerCase();
  if (!reportType) return res.status(400).json({ message: "reportType이 필요합니다." });
  if (!/^[a-f0-9]{64}$/.test(sha256Hash)) return res.status(400).json({ message: "유효한 SHA-256 해시가 필요합니다." });
  const result = db.prepare(`
    INSERT INTO audit_report_hashes (actor_user_id, report_type, from_date, to_date, row_count, sha256_hash, created_at)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(req.user.id, reportType, fromDate, toDate, Math.max(rowCount, 0), sha256Hash);
  res.status(201).json({ ok: true, id: Number(result.lastInsertRowid) });
});

app.get("/api/admin/audit/report-hashes", authRequired, adminRequired, (req, res) => {
  const limit = Math.min(Math.max(Number(req.query?.limit || 20), 1), 100);
  const reportType = String(req.query?.reportType || "").trim();
  const params = [];
  let sql = `
    SELECT h.id, h.actor_user_id, u.nickname as actor_name, h.report_type, h.from_date, h.to_date, h.row_count, h.sha256_hash, h.created_at
    FROM audit_report_hashes h
    LEFT JOIN users u ON u.id = h.actor_user_id
  `;
  if (reportType) {
    sql += " WHERE h.report_type = ? ";
    params.push(reportType);
  }
  sql += " ORDER BY h.id DESC LIMIT ? ";
  params.push(limit);
  const rows = db.prepare(sql).all(...params);
  res.json({ hashes: rows });
});

app.post("/api/admin/audit/report-hashes/verify", authRequired, adminRequired, (req, res) => {
  const sha256Hash = String(req.body?.sha256Hash || "").trim().toLowerCase();
  const reportType = String(req.body?.reportType || "").trim();
  if (!/^[a-f0-9]{64}$/.test(sha256Hash)) {
    return res.status(400).json({ message: "유효한 SHA-256 해시가 필요합니다." });
  }
  const params = [sha256Hash];
  let sql = `
    SELECT h.id, h.actor_user_id, u.nickname as actor_name, h.report_type, h.from_date, h.to_date, h.row_count, h.sha256_hash, h.created_at
    FROM audit_report_hashes h
    LEFT JOIN users u ON u.id = h.actor_user_id
    WHERE h.sha256_hash = ?
  `;
  if (reportType) {
    sql += " AND h.report_type = ? ";
    params.push(reportType);
  }
  sql += " ORDER BY h.id DESC LIMIT 1";
  const row = db.prepare(sql).get(...params);
  if (!row) {
    return res.json({ matched: false, reason: "서버 기록에서 동일 해시를 찾지 못했습니다." });
  }
  return res.json({
    matched: true,
    reason: "서버 기록과 해시가 일치합니다.",
    record: row,
  });
});

app.put("/api/admin/features", authRequired, superAdminRequired, (req, res) => {
  const updates = Array.isArray(req.body?.features) ? req.body.features : [];
  if (!updates.length) return res.status(400).json({ message: "변경할 기능 목록이 필요합니다." });
  const stmt = db.prepare("UPDATE platform_features SET enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE feature_key = ?");
  for (const item of updates) {
    const key = String(item?.feature_key || "").trim();
    const enabled = item?.enabled ? 1 : 0;
    if (!key) continue;
    stmt.run(enabled, key);
  }
  sendAdminWebhook("platform_features_updated", {
    actorUserId: req.user.id,
    updates,
  });
  const features = db.prepare("SELECT feature_key, enabled, updated_at FROM platform_features ORDER BY feature_key ASC").all();
  res.json({ features });
});

app.put("/api/admin/markets/catalog", authRequired, superAdminRequired, (req, res) => {
  const assets = Array.isArray(req.body?.assets) ? req.body.assets : [];
  const markets = Array.isArray(req.body?.markets) ? req.body.markets : [];
  const expectedRevision = String(req.body?.expectedRevision || "").trim();
  const validAssetTypes = new Set(["coin", "nft", "tokenized_asset", "point"]);
  const validMarketTypes = new Set(["p2p", "mock", "spot"]);
  const validStatuses = new Set(["active", "planned", "disabled"]);
  const currentCatalog = getMarketCatalog({ includeInactive: true });
  const currentRevision = buildMarketCatalogRevision(currentCatalog);
  if (expectedRevision && expectedRevision !== currentRevision) {
    return res.status(409).json({
      message: "catalog_revision_conflict",
      currentRevision,
    });
  }
  const beforeAssets = db
    .prepare("SELECT asset_code, display_name, asset_type, network, settlement_enabled, is_active, metadata_json FROM market_assets")
    .all();
  const beforeMarkets = db
    .prepare("SELECT market_key, market_type, offered_asset_code, requested_asset_code, settlement_asset_code, escrow_adapter, status, metadata_json FROM market_catalog")
    .all();

  try {
    db.exec("BEGIN IMMEDIATE");
    const upsertAsset = db.prepare(`
      INSERT INTO market_assets (
        asset_code, display_name, asset_type, network, settlement_enabled, is_active, metadata_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(asset_code) DO UPDATE SET
        display_name = excluded.display_name,
        asset_type = excluded.asset_type,
        network = excluded.network,
        settlement_enabled = excluded.settlement_enabled,
        is_active = excluded.is_active,
        metadata_json = excluded.metadata_json,
        updated_at = CURRENT_TIMESTAMP
    `);
    for (const asset of assets) {
      const assetCode = String(asset?.assetCode || "").trim().toUpperCase();
      const displayName = String(asset?.displayName || "").trim();
      const assetType = String(asset?.assetType || "coin").trim();
      const network = String(asset?.network || "").trim();
      const settlementEnabled = asset?.settlementEnabled ? 1 : 0;
      const isActive = asset?.isActive === false ? 0 : 1;
      if (!assetCode || !displayName) throw new Error(`invalid_asset:${assetCode || "empty"}`);
      if (!validAssetTypes.has(assetType)) throw new Error(`invalid_asset_type:${assetType}`);
      upsertAsset.run(assetCode, displayName, assetType, network, settlementEnabled, isActive, JSON.stringify(asset?.metadata || {}));
    }

    const upsertMarket = db.prepare(`
      INSERT INTO market_catalog (
        market_key, market_type, offered_asset_code, requested_asset_code, settlement_asset_code,
        escrow_adapter, status, metadata_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(market_key) DO UPDATE SET
        market_type = excluded.market_type,
        offered_asset_code = excluded.offered_asset_code,
        requested_asset_code = excluded.requested_asset_code,
        settlement_asset_code = excluded.settlement_asset_code,
        escrow_adapter = excluded.escrow_adapter,
        status = excluded.status,
        metadata_json = excluded.metadata_json,
        updated_at = CURRENT_TIMESTAMP
    `);
    for (const market of markets) {
      const marketKey = String(market?.marketKey || "").trim();
      const marketType = String(market?.marketType || "p2p").trim();
      const offeredAssetCode = String(market?.offeredAssetCode || "").trim().toUpperCase();
      const requestedAssetCode = String(market?.requestedAssetCode || "").trim().toUpperCase();
      const settlementAssetCode = String(market?.settlementAssetCode || "").trim().toUpperCase();
      const escrowAdapter = String(market?.escrowAdapter || "coin_escrow").trim();
      const status = String(market?.status || "active").trim();
      if (!marketKey || !offeredAssetCode || !requestedAssetCode) throw new Error(`invalid_market:${marketKey || "empty"}`);
      if (!validMarketTypes.has(marketType)) throw new Error(`invalid_market_type:${marketType}`);
      if (!validStatuses.has(status)) throw new Error(`invalid_market_status:${status}`);
      upsertMarket.run(
        marketKey,
        marketType,
        offeredAssetCode,
        requestedAssetCode,
        settlementAssetCode,
        escrowAdapter,
        status,
        JSON.stringify(market?.metadata || {})
      );
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    return res.status(400).json({ message: error?.message || "market_catalog_update_failed" });
  }

  sendAdminWebhook("market_catalog_updated", {
    actorUserId: req.user.id,
    assetsCount: assets.length,
    marketsCount: markets.length,
  });
  const extractMetadata = (row) => {
    const meta = row?.metadata ?? row?.metadata_json;
    if (meta && typeof meta === "object") return meta;
    return parseJsonSafe(meta, {});
  };
  const normalizeAsset = (row) =>
    JSON.stringify({
      assetCode: String((row?.assetCode ?? row?.asset_code) || "").trim().toUpperCase(),
      displayName: String((row?.displayName ?? row?.display_name) || "").trim(),
      assetType: String((row?.assetType ?? row?.asset_type) || "").trim(),
      network: String(row?.network || "").trim(),
      settlementEnabled: Boolean(row?.settlementEnabled ?? row?.settlement_enabled),
      isActive: row?.isActive === false ? false : Boolean(row?.is_active ?? true),
      metadata: extractMetadata(row),
    });
  const normalizeMarket = (row) =>
    JSON.stringify({
      marketKey: String((row?.marketKey ?? row?.market_key) || "").trim(),
      marketType: String((row?.marketType ?? row?.market_type) || "").trim(),
      offeredAssetCode: String((row?.offeredAssetCode ?? row?.offered_asset_code) || "").trim().toUpperCase(),
      requestedAssetCode: String((row?.requestedAssetCode ?? row?.requested_asset_code) || "").trim().toUpperCase(),
      settlementAssetCode: String((row?.settlementAssetCode ?? row?.settlement_asset_code) || "").trim().toUpperCase(),
      escrowAdapter: String((row?.escrowAdapter ?? row?.escrow_adapter) || "").trim(),
      status: String(row?.status || "").trim(),
      metadata: extractMetadata(row),
    });
  const beforeAssetMap = new Map(beforeAssets.map((row) => [String(row.asset_code || "").trim().toUpperCase(), normalizeAsset(row)]));
  const afterAssetMap = new Map(assets.map((row) => [String(row?.assetCode || "").trim().toUpperCase(), normalizeAsset(row)]));
  const beforeMarketMap = new Map(beforeMarkets.map((row) => [String(row.market_key || "").trim(), normalizeMarket(row)]));
  const afterMarketMap = new Map(markets.map((row) => [String(row?.marketKey || "").trim(), normalizeMarket(row)]));
  const assetAdded = [...afterAssetMap.keys()].filter((key) => key && !beforeAssetMap.has(key));
  const assetRemoved = [...beforeAssetMap.keys()].filter((key) => key && !afterAssetMap.has(key));
  const assetUpdated = [...afterAssetMap.keys()].filter((key) => key && beforeAssetMap.has(key) && beforeAssetMap.get(key) !== afterAssetMap.get(key));
  const marketAdded = [...afterMarketMap.keys()].filter((key) => key && !beforeMarketMap.has(key));
  const marketRemoved = [...beforeMarketMap.keys()].filter((key) => key && !afterMarketMap.has(key));
  const marketUpdated = [...afterMarketMap.keys()].filter((key) => key && beforeMarketMap.has(key) && beforeMarketMap.get(key) !== afterMarketMap.get(key));
  db.prepare(`
    INSERT INTO market_catalog_audit_logs (
      actor_user_id, assets_count, markets_count, summary_json, created_at
    ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(
    req.user.id,
    assets.length,
    markets.length,
    JSON.stringify({
      assetDiff: {
        added: assetAdded,
        removed: assetRemoved,
        updated: assetUpdated,
      },
      marketDiff: {
        added: marketAdded,
        removed: marketRemoved,
        updated: marketUpdated,
      },
      assetCodes: assets.map((a) => String(a?.assetCode || "").trim().toUpperCase()).filter(Boolean),
      marketKeys: markets.map((m) => String(m?.marketKey || "").trim()).filter(Boolean),
    })
  );
  const catalog = getMarketCatalog({ includeInactive: true });
  res.json({ ...catalog, revision: buildMarketCatalogRevision(catalog) });
});

app.patch("/api/admin/users/:id/role", authRequired, superAdminRequired, (req, res) => {
  const id = Number(req.params.id);
  const role = String(req.body?.role || "").trim();
  if (!id || !role) return res.status(400).json({ message: "요청값이 올바르지 않습니다." });
  const user = userRepo.updateRole(id, role);
  if (!user) return res.status(404).json({ message: "사용자를 찾을 수 없습니다." });
  res.json({ user });
});

app.patch("/api/admin/users/:id/profile", authRequired, (req, res) => {
  if (ADMIN_SAFE_MODE) {
    return res.status(503).json({ message: "관리자 안전모드가 활성화되어 변경 작업이 잠시 차단되었습니다." });
  }
  const actorId = Number(req.user?.id || 0);
  const actorUser = actorId ? db.prepare("SELECT id, role, session_role, stage_label FROM users WHERE id = ?").get(actorId) : null;
  if (!actorUser) return res.status(401).json({ message: "세션 사용자를 찾을 수 없습니다. 다시 로그인해 주세요." });
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: "유효한 사용자 ID가 필요합니다." });
  const stageLabel = normalizeStageLabelForAuth(String(req.body?.stageLabel || "").trim());
  const parentUserRef = String(req.body?.parentUserRef || "").trim();
  const adminAssigned = Boolean(req.body?.adminAssigned);
  const targetUser = db.prepare("SELECT id, stage_label FROM users WHERE id = ?").get(id);
  if (!targetUser) return res.status(404).json({ message: "사용자를 찾을 수 없습니다." });
  if (String(actorUser.id) === String(targetUser.id)) {
    return res.status(400).json({ message: "본인 계정은 관리자 단계를 변경할 수 없습니다." });
  }
  if (!canActorModifyTarget(actorUser, targetUser, stageLabel)) {
    return res.status(403).json({ message: "상위 레벨 관리자만 하위 회원의 승급/강등을 변경할 수 있습니다." });
  }

  const normalizedParent = parentUserRef ? String(Number(parentUserRef) || "").trim() : "";
  if (normalizedParent && normalizedParent === String(id)) {
    return res.status(400).json({ message: "자기 자신을 상위로 지정할 수 없습니다." });
  }
  if (normalizedParent) {
    const parentExists = db.prepare("SELECT id FROM users WHERE id = ?").get(Number(normalizedParent));
    if (!parentExists) return res.status(400).json({ message: "상위 회원 ID가 존재하지 않습니다." });
    const visited = new Set([String(id)]);
    let cursor = normalizedParent;
    while (cursor) {
      if (visited.has(cursor)) {
        return res.status(400).json({ message: "순환 참조가 발생하여 저장할 수 없습니다." });
      }
      visited.add(cursor);
      const next = db.prepare("SELECT parent_user_ref FROM users WHERE id = ?").get(Number(cursor));
      cursor = String(next?.parent_user_ref || "").trim();
    }
  }

  try {
    db.exec("BEGIN IMMEDIATE");
    db.prepare("UPDATE users SET stage_label = ?, parent_user_ref = ?, admin_assigned = ? WHERE id = ?").run(
      stageLabel,
      normalizedParent,
      adminAssigned ? 1 : 0,
      id
    );
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    return res.status(500).json({ message: `관리자 변경 저장 실패: ${error?.message || "unknown_error"}` });
  }

  const user = userRepo.findPublicById(id);
  res.json({ user });
});

app.post("/api/admin/kyc/:userId/review", authRequired, adminRequired, (req, res) => {
  const userId = Number(req.params.userId);
  const approve = Boolean(req.body?.approve);
  if (!userId) return res.status(400).json({ message: "유효한 사용자 ID가 필요합니다." });
  const status = approve ? "회사 승인 완료(비공개 보관)" : "회사 반려";
  const match = approve ? 1 : 0;
  db.prepare(`
    INSERT INTO kyc_profiles (
      user_id, company_approval_status, account_name_matched, updated_at
    ) VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET
      company_approval_status = excluded.company_approval_status,
      account_name_matched = excluded.account_name_matched,
      updated_at = CURRENT_TIMESTAMP
  `).run(userId, status, match);
  res.json({ profile: getKycProfile(userId) });
});

app.get("/api/admin/escrow-policy", authRequired, adminRequired, (_req, res) => {
  res.json({ policy: getEscrowPolicy() });
});

app.put("/api/admin/escrow-policy", authRequired, superAdminRequired, (req, res) => {
  const mainCustodyAccount = String(req.body?.mainCustodyAccount || "").trim();
  const requiredApprovals = Number(req.body?.requiredApprovals || 3);
  const mainFinalApproverId = Number(req.body?.mainFinalApproverId || 0);
  const approverIds = Array.isArray(req.body?.approverIds) ? req.body.approverIds.map((v) => Number(v)).filter(Boolean) : [];
  const levelDelayHours = req.body?.levelDelayHours || {};
  const lv1 = Math.max(0, Number(levelDelayHours?.Lv1 ?? 48));
  const lv2 = Math.max(0, Number(levelDelayHours?.Lv2 ?? 36));
  const lv3 = Math.max(0, Number(levelDelayHours?.Lv3 ?? 24));
  const lv4 = Math.max(0, Number(levelDelayHours?.Lv4 ?? 12));
  const lv5 = Math.max(0, Number(levelDelayHours?.Lv5 ?? 0));
  if (!mainCustodyAccount) return res.status(400).json({ message: "보관 계좌를 입력하세요." });
  if (requiredApprovals < 3 || requiredApprovals > 5) return res.status(400).json({ message: "승인 인원은 3~5명이어야 합니다." });
  if (!mainFinalApproverId) return res.status(400).json({ message: "메인 최종 승인자를 지정하세요." });

  db.prepare(`
    UPDATE escrow_policy
    SET
      main_custody_account = ?,
      required_approvals = ?,
      main_final_approver_id = ?,
      level_delay_hours_lv1 = ?,
      level_delay_hours_lv2 = ?,
      level_delay_hours_lv3 = ?,
      level_delay_hours_lv4 = ?,
      level_delay_hours_lv5 = ?
    WHERE id = 1
  `).run(mainCustodyAccount, requiredApprovals, mainFinalApproverId, lv1, lv2, lv3, lv4, lv5);
  db.prepare("DELETE FROM escrow_policy_approvers WHERE policy_id = 1").run();
  for (const approverId of approverIds) {
    db.prepare("INSERT INTO escrow_policy_approvers (policy_id, user_id) VALUES (1, ?)").run(approverId);
  }
  if (!approverIds.includes(mainFinalApproverId)) {
    db.prepare("INSERT OR IGNORE INTO escrow_policy_approvers (policy_id, user_id) VALUES (1, ?)").run(mainFinalApproverId);
  }
  sendAdminWebhook("escrow_policy_updated", {
    actorUserId: req.user.id,
    mainCustodyAccount,
    requiredApprovals,
    mainFinalApproverId,
    approverIds,
    levelDelayHours: { Lv1: lv1, Lv2: lv2, Lv3: lv3, Lv4: lv4, Lv5: lv5 },
  });
  res.json({ policy: getEscrowPolicy() });
});

app.put("/api/admin/escrow-policy/pin", authRequired, superAdminRequired, (req, res) => {
  const pin = String(req.body?.pin || "").trim();
  if (!/^\d{6,10}$/.test(pin)) {
    return res.status(400).json({ message: "최종승인 PIN은 숫자 6~10자리여야 합니다." });
  }
  const hash = bcrypt.hashSync(pin, 10);
  db.prepare("UPDATE escrow_security SET main_final_approval_pin_hash = ? WHERE id = 1").run(hash);
  sendAdminWebhook("escrow_pin_updated", {
    actorUserId: req.user.id,
  });
  res.json({ ok: true });
});

app.get("/api/admin/disputes", authRequired, adminRequired, (_req, res) => {
  const disputes = db.prepare("SELECT * FROM disputes ORDER BY created_at DESC").all();
  const approvals = db.prepare("SELECT dispute_id, approver_user_id FROM dispute_approvals").all();
  const grouped = approvals.reduce((acc, row) => {
    acc[row.dispute_id] = acc[row.dispute_id] || [];
    acc[row.dispute_id].push(row.approver_user_id);
    return acc;
  }, {});
  const items = disputes.map((d) => ({
    id: d.id,
    orderSeller: d.order_seller,
    coin: d.coin,
    amount: d.amount,
    senderName: d.sender_name,
    senderAccount: d.sender_account,
    status: d.status,
    approvals: grouped[d.id] || [],
    createdAt: d.created_at,
    multiApprovedAt: d.multi_approved_at || "",
    approvedAt: d.approved_at || "",
    releaseMessage: d.release_message || "",
    finalApprovedByMain: d.status === "반환완료",
  }));
  res.json({ disputes: items });
});

app.post("/api/disputes", authRequired, (req, res) => {
  const id = `DSP-${Date.now()}`;
  const orderSeller = String(req.body?.orderSeller || "-");
  const coin = String(req.body?.coin || "USDT");
  const amount = Number(req.body?.amount || 0);
  const senderName = String(req.body?.senderName || "미입력");
  const senderAccount = String(req.body?.senderAccount || "입금계좌 미입력");
  db.prepare(`
    INSERT INTO disputes (id, requester_user_id, order_seller, coin, amount, sender_name, sender_account, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, '분쟁접수', CURRENT_TIMESTAMP)
  `).run(id, req.user.id, orderSeller, coin, amount, senderName, senderAccount);
  appendDisputeEvent(id, req.user.id, "분쟁접수", `${coin} ${amount} ${senderName}`);
  res.status(201).json({ id });
});

app.post("/api/admin/disputes/:id/approve", authRequired, adminRequired, (req, res) => {
  const disputeId = String(req.params.id || "");
  const policy = getEscrowPolicy();
  if (!policy.approverIds.includes(req.user.id)) {
    return res.status(403).json({ message: "지정 승인자만 결재할 수 있습니다." });
  }
  const target = db.prepare("SELECT * FROM disputes WHERE id = ?").get(disputeId);
  if (!target) return res.status(404).json({ message: "분쟁 건을 찾을 수 없습니다." });
  if (target.status === "반환완료") return res.status(400).json({ message: "이미 반환완료된 분쟁입니다." });
  if (target.status === "최종승인대기") return res.status(400).json({ message: "메인 관리자 최종승인 대기 상태입니다." });

  db.prepare("INSERT OR IGNORE INTO dispute_approvals (dispute_id, approver_user_id) VALUES (?, ?)").run(disputeId, req.user.id);
  const countRow = db.prepare("SELECT COUNT(*) as cnt FROM dispute_approvals WHERE dispute_id = ?").get(disputeId);
  const approvalCount = Number(countRow?.cnt || 0);
  if (approvalCount >= policy.requiredApprovals) {
    db.prepare(`
      UPDATE disputes
      SET status = '최종승인대기',
          multi_approved_at = CURRENT_TIMESTAMP,
          release_message = ?
      WHERE id = ?
    `).run(`${policy.requiredApprovals}인 다중승인 완료. 메인 관리자(${policy.mainFinalApproverId}) 최종승인 대기`, disputeId);
  } else {
    db.prepare("UPDATE disputes SET status = '승인대기' WHERE id = ?").run(disputeId);
  }
  appendDisputeEvent(disputeId, req.user.id, "다중승인", `${approvalCount}/${policy.requiredApprovals}`);
  res.json({ ok: true, approvalCount, requiredApprovals: policy.requiredApprovals });
});

app.post("/api/admin/disputes/:id/finalize", authRequired, adminRequired, (req, res) => {
  const disputeId = String(req.params.id || "");
  const pin = String(req.body?.pin || "").trim();
  const otp = String(req.body?.otp || "").trim();
  const policy = getEscrowPolicy();
  if (req.user.id !== policy.mainFinalApproverId) {
    return res.status(403).json({ message: "메인 관리자 최종승인 계정만 반환 확정할 수 있습니다." });
  }
  const security = db.prepare("SELECT main_final_approval_pin_hash FROM escrow_security WHERE id = 1").get();
  if (!pin || !security || !bcrypt.compareSync(pin, security.main_final_approval_pin_hash)) {
    return res.status(403).json({ message: "최종승인 PIN이 올바르지 않습니다." });
  }
  const otpRow = db.prepare("SELECT * FROM dispute_final_otp WHERE dispute_id = ?").get(disputeId);
  if (!otpRow || otpRow.used) return res.status(403).json({ message: "OTP가 발급되지 않았거나 이미 사용되었습니다." });
  if (new Date(otpRow.expires_at).getTime() < Date.now()) return res.status(403).json({ message: "OTP가 만료되었습니다." });
  if (!otp || !bcrypt.compareSync(otp, otpRow.otp_hash)) return res.status(403).json({ message: "OTP가 올바르지 않습니다." });
  const target = db.prepare("SELECT * FROM disputes WHERE id = ?").get(disputeId);
  if (!target) return res.status(404).json({ message: "분쟁 건을 찾을 수 없습니다." });
  if (target.status !== "최종승인대기") return res.status(400).json({ message: "최종승인대기 상태가 아닙니다." });
  db.prepare(`
    UPDATE disputes
    SET status = '반환완료',
        approved_at = CURRENT_TIMESTAMP,
        release_message = ?
    WHERE id = ?
  `).run(`메인 관리자(${req.user.id}) 최종승인 완료. 보관 계좌(${policy.mainCustodyAccount}) 기준으로 입금 계좌(${target.sender_account})에 반환 처리됨`, disputeId);
  db.prepare("UPDATE dispute_final_otp SET used = 1 WHERE dispute_id = ?").run(disputeId);
  appendDisputeEvent(disputeId, req.user.id, "최종승인", `PIN 인증 완료 · ${target.sender_account}`);
  sendAdminWebhook("dispute_finalized", {
    actorUserId: req.user.id,
    disputeId,
    senderAccount: target.sender_account,
    custodyAccount: policy.mainCustodyAccount,
  });
  res.json({ ok: true });
});

app.post("/api/admin/disputes/:id/request-otp", authRequired, adminRequired, (req, res) => {
  const disputeId = String(req.params.id || "");
  const policy = getEscrowPolicy();
  if (req.user.id !== policy.mainFinalApproverId) {
    return res.status(403).json({ message: "메인 관리자만 OTP를 발급할 수 있습니다." });
  }
  const target = db.prepare("SELECT * FROM disputes WHERE id = ?").get(disputeId);
  if (!target) return res.status(404).json({ message: "분쟁 건을 찾을 수 없습니다." });
  if (target.status !== "최종승인대기") return res.status(400).json({ message: "최종승인대기 상태에서만 OTP 발급 가능합니다." });

  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const otpHash = bcrypt.hashSync(otp, 10);
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  db.prepare(`
    INSERT INTO dispute_final_otp (dispute_id, otp_hash, expires_at, used)
    VALUES (?, ?, ?, 0)
    ON CONFLICT(dispute_id) DO UPDATE SET
      otp_hash = excluded.otp_hash,
      expires_at = excluded.expires_at,
      used = 0
  `).run(disputeId, otpHash, expiresAt);
  appendDisputeEvent(disputeId, req.user.id, "OTP발급", `만료시각 ${expiresAt}`);
  sendAdminWebhook("dispute_otp_requested", {
    actorUserId: req.user.id,
    disputeId,
    expiresAt,
    secureChannel: "registered_admin_secure_channel",
  });
  res.json({
    ok: true,
    expiresAt,
    delivery: "OTP가 등록된 관리자 보안 채널로 전송되었습니다. 화면에는 표시되지 않습니다.",
  });
});

app.get("/api/admin/disputes/:id/events", authRequired, adminRequired, (req, res) => {
  const disputeId = String(req.params.id || "");
  const events = db
    .prepare("SELECT id, dispute_id, actor_user_id, action, detail, created_at FROM dispute_events WHERE dispute_id = ? ORDER BY id DESC")
    .all(disputeId);
  res.json({ events });
});

app.get("/api/admin/disputes/:id/events/verify", authRequired, adminRequired, (req, res) => {
  const disputeId = String(req.params.id || "");
  const result = verifyDisputeEventChain(disputeId);
  res.json(result);
});

app.get("/api/admin/platform-audit-logs", authRequired, adminRequired, (req, res) => {
  const limit = Math.min(200, Math.max(1, Number(req.query.limit || 80)));
  const rows = db.prepare(`
    SELECT id, user_id, event_type, payload_json, ip, user_agent, platform_code, created_at
    FROM platform_audit_logs
    ORDER BY id DESC
    LIMIT ?
  `).all(limit);
  res.json({ logs: rows });
});

app.get("/api/p2p/orders", (_req, res) => {
  const limit = Math.min(100, Math.max(1, Number(_req.query.limit || 40)));
  const rows = db.prepare(`
    SELECT * FROM p2p_orders WHERE status = 'listed' ORDER BY created_at DESC LIMIT ?
  `).all(limit);
  res.json({ orders: rows.map((row) => mapP2pOrderRow(row, null)) });
});

app.get("/api/p2p/orders/me", authRequired, (req, res) => {
  expireStaleMatchedOrders();
  const uid = req.user.id;
  const rows = db.prepare(`
    SELECT * FROM p2p_orders
    WHERE seller_user_id = ? OR buyer_user_id = ?
    ORDER BY updated_at DESC
    LIMIT 200
  `).all(uid, uid);
  res.json({ orders: rows.map((row) => mapP2pOrderRow(row, uid)) });
});

app.post("/api/p2p/orders", authRequired, (req, res) => {
  const coin = String(req.body?.coin || "USDT").trim().slice(0, 32) || "USDT";
  const amount = parseP2pAmount(req.body?.amount);
  if (amount == null) return res.status(400).json({ message: "수량이 올바르지 않습니다." });
  const unitPrice = parseP2pPrice(req.body?.unitPrice ?? req.body?.unit_price);
  if (unitPrice == null) return res.status(400).json({ message: "단가가 올바르지 않습니다." });
  const amountNorm = normalizeLedgerAmount(amount);
  const unitNorm = normalizeLedgerAmount(unitPrice, { allowZero: true });
  if (!amountNorm.ok || !unitNorm.ok) return res.status(400).json({ message: "수량 또는 단가가 올바르지 않습니다." });
  const paymentMethod = String(req.body?.paymentMethod || req.body?.payment_method || "").trim().slice(0, 64);
  const id = newP2pOrderId();
  const sellerId = req.user.id;
  const am = minorBigIntToSqlInt(amountNorm.minor);
  const um = minorBigIntToSqlInt(unitNorm.minor);
  try {
    db.transaction(() => {
      if (!lockSellerP2pEscrowByMinor(sellerId, amountNorm.minor)) {
        throw new Error("INSUFFICIENT_BALANCE");
      }
      db.prepare(`
        INSERT INTO p2p_orders (
          id, seller_user_id, buyer_user_id, coin, amount_minor, unit_price_minor,
          payment_method, status, metadata_json, platform_code, created_at, updated_at
        ) VALUES (?, ?, NULL, ?, ?, ?, ?, 'listed', '{}', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(id, sellerId, coin, am, um, paymentMethod, PLATFORM_CODE);
    })();
  } catch (e) {
    if (e?.message === "INSUFFICIENT_BALANCE") {
      return res.status(400).json({ message: "출금 가능 잔고가 부족합니다. P2P 판매 호가는 동일 수량만큼 예치됩니다." });
    }
    throw e;
  }
  appendP2pOrderEvent(id, sellerId, "listed", { coin, amount: amountNorm.value, unit_price: unitNorm.value });
  appendPlatformAuditLog(req, { userId: sellerId, eventType: "p2p.order_create", payload: { orderId: id, escrow_amount: amountNorm.value } });
  const row = db.prepare("SELECT * FROM p2p_orders WHERE id = ?").get(id);
  res.status(201).json({ order: mapP2pOrderRow(row, sellerId) });
});

app.post("/api/p2p/orders/:id/take", authRequired, (req, res) => {
  const orderId = String(req.params.id || "");
  const row = db.prepare("SELECT * FROM p2p_orders WHERE id = ?").get(orderId);
  if (!row) return res.status(404).json({ message: "주문을 찾을 수 없습니다." });
  if (row.status !== "listed") return res.status(400).json({ message: "이미 처리된 주문입니다." });
  if (Number(row.seller_user_id) === Number(req.user.id)) {
    return res.status(400).json({ message: "본인 게시 주문은 선택할 수 없습니다." });
  }
  const listedNorm = normalizeLedgerFromSqlMinor(row.amount_minor);
  if (!listedNorm.ok || listedNorm.minor <= 0n) {
    return res.status(400).json({ message: "호가 수량이 올바르지 않습니다." });
  }
  const listedAmount = listedNorm.value;
  let takeNorm;
  const rawTake = req.body?.amount ?? req.body?.takeAmount;
  if (rawTake === undefined || rawTake === null || rawTake === "") {
    takeNorm = listedNorm;
  } else {
    takeNorm = normalizeLedgerAmount(rawTake);
    if (!takeNorm.ok) return res.status(400).json({ message: "매칭 수량이 올바르지 않습니다." });
  }
  if (takeNorm.minor <= 0n || takeNorm.minor > listedNorm.minor) {
    return res.status(400).json({ message: "매칭 수량이 호가 범위를 벗어났습니다." });
  }
  const takeAmt = takeNorm.value;
  const isFullTake = takeNorm.minor === listedNorm.minor;

  if (isFullTake) {
    db.prepare(`
      UPDATE p2p_orders SET buyer_user_id = ?, status = 'matched', matched_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(req.user.id, orderId);
    appendP2pOrderEvent(orderId, req.user.id, "buyer_take", { amount: listedAmount });
    appendPlatformAuditLog(req, { userId: req.user.id, eventType: "p2p.order_take", payload: { orderId, amount: listedAmount } });
    const next = db.prepare("SELECT * FROM p2p_orders WHERE id = ?").get(orderId);
    return res.json({ order: mapP2pOrderRow(next, req.user.id) });
  }

  const remainderMi = listedNorm.minor - takeNorm.minor;
  if (remainderMi <= 0n) {
    return res.status(400).json({ message: "매칭 수량 계산 오류입니다." });
  }
  const remainder = financialMinorToMajor(remainderMi);
  const newId = newP2pOrderId();
  const sellerId = row.seller_user_id;
  const coin = row.coin;
  const paymentMethod = row.payment_method;
  const platformCode = row.platform_code ?? PLATFORM_CODE;
  const upMi = minorBigIntToSqlInt(BigInt(Math.trunc(Number(row.unit_price_minor ?? 0))));
  const takeMi = minorBigIntToSqlInt(takeNorm.minor);
  const remMi = minorBigIntToSqlInt(remainderMi);

  db.prepare(`
    INSERT INTO p2p_orders (
      id, seller_user_id, buyer_user_id, coin, amount_minor, unit_price_minor,
      payment_method, status, metadata_json, platform_code,
      matched_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'matched', '{}', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(newId, sellerId, req.user.id, coin, takeMi, upMi, paymentMethod, platformCode);

  db.prepare(`
    UPDATE p2p_orders SET amount_minor = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(remMi, orderId);

  appendP2pOrderEvent(orderId, req.user.id, "listing_partial_take", mergeDomainPayload({
    taken_amount: takeAmt,
    remainder_amount: remainder,
    matched_order_id: newId,
  }));
  appendP2pOrderEvent(newId, req.user.id, "buyer_take", mergeDomainPayload({
    from_listing_id: orderId,
    amount: takeAmt,
  }));
  appendPlatformAuditLog(req, {
    userId: req.user.id,
    eventType: "p2p.order_take_partial",
    payload: { listingOrderId: orderId, matchedOrderId: newId, takeAmount: takeAmt, remainderAmount: remainder },
  });

  const matchedRow = db.prepare("SELECT * FROM p2p_orders WHERE id = ?").get(newId);
  const listingRow = db.prepare("SELECT * FROM p2p_orders WHERE id = ?").get(orderId);
  res.json({
    order: mapP2pOrderRow(matchedRow, req.user.id),
    listingOrder: mapP2pOrderRow(listingRow, null),
  });
});

app.post("/api/p2p/orders/:id/cancel", authRequired, (req, res) => {
  const orderId = String(req.params.id || "");
  const row = db.prepare("SELECT * FROM p2p_orders WHERE id = ?").get(orderId);
  if (!row) return res.status(404).json({ message: "주문을 찾을 수 없습니다." });
  if (Number(row.seller_user_id) !== Number(req.user.id)) {
    return res.status(403).json({ message: "판매자만 취소할 수 있습니다." });
  }
  if (row.status !== "listed") return res.status(400).json({ message: "취소할 수 있는 상태가 아닙니다." });
  const listedNorm = normalizeLedgerFromSqlMinor(row.amount_minor);
  if (!listedNorm.ok) {
    return res.status(400).json({ message: "호가 수량이 올바르지 않습니다." });
  }
  db.transaction(() => {
    db.prepare(`UPDATE p2p_orders SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(orderId);
    unlockSellerP2pEscrowByMinor(Number(row.seller_user_id), listedNorm.minor);
  })();
  appendP2pOrderEvent(orderId, req.user.id, "seller_cancel", {});
  appendPlatformAuditLog(req, { userId: req.user.id, eventType: "p2p.order_cancel", payload: { orderId } });
  const next = db.prepare("SELECT * FROM p2p_orders WHERE id = ?").get(orderId);
  res.json({ order: mapP2pOrderRow(next, req.user.id) });
});

app.post("/api/p2p/orders/:id/payment-start", authRequired, (req, res) => {
  expireStaleMatchedOrders();
  const orderId = String(req.params.id || "");
  let row = db.prepare("SELECT * FROM p2p_orders WHERE id = ?").get(orderId);
  if (!row) return res.status(404).json({ message: "주문을 찾을 수 없습니다." });
  if (row.status !== "matched") {
    return res.status(400).json({ message: "매칭된 주문만 송금 신청할 수 있습니다." });
  }
  if (!row.matched_at) {
    return res.status(400).json({ message: "매칭 시각이 없습니다. 관리자에게 문의하세요." });
  }
  const mt = Date.parse(row.matched_at);
  if (!Number.isFinite(mt)) {
    return res.status(400).json({ message: "매칭 시각이 유효하지 않습니다." });
  }
  if (Date.now() - mt >= getP2pMatchSlaMs()) {
    expireStaleMatchedOrders();
    row = db.prepare("SELECT * FROM p2p_orders WHERE id = ?").get(orderId);
    if (row.status !== "matched") {
      return res.status(400).json({ message: "송금 마감 시간이 지나 주문이 종료되었습니다." });
    }
    return res.status(400).json({ message: "송금 마감 시간이 지났습니다." });
  }
  if (row.buyer_user_id == null || Number(row.buyer_user_id) !== Number(req.user.id)) {
    return res.status(403).json({ message: "매수자만 송금 신청할 수 있습니다." });
  }
  if (row.buyer_payment_started_at) {
    const next = db.prepare("SELECT * FROM p2p_orders WHERE id = ?").get(orderId);
    return res.json({ order: mapP2pOrderRow(next, req.user.id) });
  }
  db.prepare(`
    UPDATE p2p_orders SET buyer_payment_started_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(orderId);
  appendP2pOrderEvent(orderId, req.user.id, "buyer_payment_start", {});
  appendPlatformAuditLog(req, { userId: req.user.id, eventType: "p2p.order_payment_start", payload: { orderId } });
  const next = db.prepare("SELECT * FROM p2p_orders WHERE id = ?").get(orderId);
  res.json({ order: mapP2pOrderRow(next, req.user.id) });
});

app.post("/api/p2p/orders/:id/mark-paid", authRequired, (req, res) => {
  expireStaleMatchedOrders();
  const orderId = String(req.params.id || "");
  let row = db.prepare("SELECT * FROM p2p_orders WHERE id = ?").get(orderId);
  if (!row) return res.status(404).json({ message: "주문을 찾을 수 없습니다." });
  if (row.status !== "matched") return res.status(400).json({ message: "매칭된 주문만 송금 완료를 표시할 수 있습니다." });
  if (row.buyer_user_id == null || Number(row.buyer_user_id) !== Number(req.user.id)) {
    return res.status(403).json({ message: "매수자만 송금 완료를 표시할 수 있습니다." });
  }
  if (!row.buyer_payment_started_at) {
    return res.status(400).json({ message: "먼저 송금 신청을 진행해 주세요." });
  }
  if (!row.matched_at) {
    return res.status(400).json({ message: "매칭 시각이 없습니다. 관리자에게 문의하세요." });
  }
  const mt = Date.parse(row.matched_at);
  if (!Number.isFinite(mt)) {
    return res.status(400).json({ message: "매칭 시각이 유효하지 않습니다." });
  }
  if (Date.now() - mt >= getP2pMatchSlaMs()) {
    expireStaleMatchedOrders();
    row = db.prepare("SELECT * FROM p2p_orders WHERE id = ?").get(orderId);
    if (row.status !== "matched") {
      return res.status(400).json({ message: "송금 마감 시간이 지나 주문이 종료되었습니다." });
    }
    return res.status(400).json({ message: "송금 마감 시간이 지났습니다." });
  }
  db.prepare(`UPDATE p2p_orders SET status = 'payment_sent', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(orderId);
  appendP2pOrderEvent(orderId, req.user.id, "buyer_mark_paid", {});
  appendPlatformAuditLog(req, { userId: req.user.id, eventType: "p2p.order_mark_paid", payload: { orderId } });
  const next = db.prepare("SELECT * FROM p2p_orders WHERE id = ?").get(orderId);
  res.json({ order: mapP2pOrderRow(next, req.user.id) });
});

app.post("/api/p2p/orders/:id/complete", authRequired, (req, res) => {
  const orderId = String(req.params.id || "");
  const row = db.prepare("SELECT * FROM p2p_orders WHERE id = ?").get(orderId);
  if (!row) return res.status(404).json({ message: "주문을 찾을 수 없습니다." });
  if (row.status !== "payment_sent") return res.status(400).json({ message: "송금 확인 후에만 완료 처리할 수 있습니다." });
  if (Number(row.seller_user_id) !== Number(req.user.id)) {
    return res.status(403).json({ message: "판매자만 완료 처리할 수 있습니다." });
  }
  const tradeLm = normalizeLedgerFromSqlMinor(row.amount_minor);
  if (!tradeLm.ok) {
    return res.status(409).json({ message: "주문 수량이 유효하지 않습니다. 관리자에게 문의하세요." });
  }
  const tradeAmt = tradeLm.value;
  const buyerId = row.buyer_user_id != null ? Number(row.buyer_user_id) : NaN;
  const coin = String(row.coin || "USDT");
  try {
    db.transaction(() => {
      db.prepare(`UPDATE p2p_orders SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(orderId);
      if (!consumeSellerP2pEscrowByMinor(Number(row.seller_user_id), tradeLm.minor)) {
        throw new Error("ESCROW_MISMATCH");
      }
      if (Number.isFinite(buyerId) && buyerId > 0) {
        if (!creditBuyerP2pSettlementByMinor(buyerId, tradeLm.minor)) {
          throw new Error("BUYER_CREDIT_FAILED");
        }
      }
    })();
  } catch (e) {
    if (e?.message === "ESCROW_MISMATCH") {
      return res.status(409).json({ message: "예치(P2P 락)와 주문이 맞지 않습니다. 관리자에게 문의하세요." });
    }
    if (e?.message === "BUYER_CREDIT_FAILED") {
      return res.status(500).json({ message: "매수자 잔고 반영에 실패했습니다." });
    }
    throw e;
  }
  appendP2pOrderEvent(orderId, req.user.id, "seller_complete", mergeDomainPayload({ coin, amount: tradeAmt, buyer_user_id: buyerId }));
  if (Number.isFinite(buyerId) && buyerId > 0) {
    appendP2pOrderEvent(orderId, buyerId, "buyer_receive_settlement", mergeDomainPayload({ coin, amount: tradeAmt }));
  }
  appendPlatformAuditLog(req, {
    userId: req.user.id,
    eventType: "p2p.order_complete",
    payload: { orderId, coin, amount: tradeAmt, buyerUserId: Number.isFinite(buyerId) ? buyerId : null },
  });
  const next = db.prepare("SELECT * FROM p2p_orders WHERE id = ?").get(orderId);
  res.json({ order: mapP2pOrderRow(next, req.user.id) });
});

app.post("/api/p2p/orders/:id/withdraw-match", authRequired, (req, res) => {
  expireStaleMatchedOrders();
  const orderId = String(req.params.id || "");
  const row = db.prepare("SELECT * FROM p2p_orders WHERE id = ?").get(orderId);
  if (!row) return res.status(404).json({ message: "주문을 찾을 수 없습니다." });
  if (row.status !== "matched") {
    return res.status(400).json({ message: "매칭된 주문만 철회할 수 있습니다. (송금 완료 후에는 관리자 또는 거래 완료 절차를 이용하세요.)" });
  }
  const uid = req.user.id;
  const isSeller = Number(row.seller_user_id) === Number(uid);
  const isBuyer = row.buyer_user_id != null && Number(row.buyer_user_id) === Number(uid);
  if (!isSeller && !isBuyer) {
    return res.status(403).json({ message: "당사자만 매칭을 철회할 수 있습니다." });
  }
  if (isBuyer && row.buyer_payment_started_at) {
    return res.status(403).json({
      message:
        "송금 신청 후에는 매칭을 철회할 수 없습니다. 마감 전까지 송금 확인을 완료하거나, 시간 초과 시 자동 취소됩니다.",
    });
  }
  const tradeLm = normalizeLedgerFromSqlMinor(row.amount_minor);
  if (!tradeLm.ok) {
    return res.status(400).json({ message: "주문 수량이 올바르지 않습니다." });
  }
  db.transaction(() => {
    db.prepare(`UPDATE p2p_orders SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(orderId);
    unlockSellerP2pEscrowByMinor(Number(row.seller_user_id), tradeLm.minor);
  })();
  const role = isBuyer ? "buyer" : "seller";
  appendP2pOrderEvent(orderId, uid, "withdraw_match", mergeDomainPayload({ role }));
  appendPlatformAuditLog(req, { userId: uid, eventType: "p2p.order_withdraw_match", payload: { orderId, role } });
  const next = db.prepare("SELECT * FROM p2p_orders WHERE id = ?").get(orderId);
  res.json({ order: mapP2pOrderRow(next, uid) });
});

app.get("/api/p2p/orders/:id/events", authRequired, (req, res) => {
  const orderId = String(req.params.id || "");
  const row = db.prepare("SELECT * FROM p2p_orders WHERE id = ?").get(orderId);
  if (!row) return res.status(404).json({ message: "주문을 찾을 수 없습니다." });
  const uid = req.user.id;
  const isAdmin = String(req.user.role || "").includes("관리자");
  const isSeller = Number(row.seller_user_id) === Number(uid);
  const isBuyer = row.buyer_user_id != null && Number(row.buyer_user_id) === Number(uid);
  if (!isAdmin && !isSeller && !isBuyer) return res.status(403).json({ message: "접근 권한이 없습니다." });
  const events = db.prepare(`
    SELECT id, order_id, actor_user_id, action, detail_json, created_at
    FROM p2p_order_events WHERE order_id = ? ORDER BY id ASC
  `).all(orderId);
  res.json({ events });
});

app.get("/api/admin/p2p/orders", authRequired, adminRequired, (req, res) => {
  const limit = Math.min(300, Math.max(1, Number(req.query.limit || 80)));
  const statusFilter = String(req.query.status || "").trim();
  const rows = statusFilter
    ? db.prepare(`SELECT * FROM p2p_orders WHERE status = ? ORDER BY updated_at DESC LIMIT ?`).all(statusFilter, limit)
    : db.prepare(`SELECT * FROM p2p_orders ORDER BY updated_at DESC LIMIT ?`).all(limit);
  res.json({ orders: rows.map((r) => mapP2pOrderRow(r, null)) });
});

/** UTE(7번) 연동·관리자 패널용 P2P/escrow/referral/dispute/risk 스냅샷 (집계만, 실 송금·release 없음) */
app.get("/api/admin/p2p/ute-surface", authRequired, adminRequired, (_req, res) => {
  try {
    const payload = buildP2pUteSurfacePayloadFromIndex(db, mapP2pOrderRow, getP2pMatchSlaMinutes);
    res.json(payload);
  } catch (e) {
    console.warn("[ute-surface]", e?.message || e);
    res.status(500).json({ message: e?.message || "ute-surface failed" });
  }
});

app.post("/api/admin/p2p/orders/:id/cancel", authRequired, adminRequired, (req, res) => {
  const orderId = String(req.params.id || "");
  const reason = String(req.body?.reason || "").trim().slice(0, 500);
  const row = db.prepare("SELECT * FROM p2p_orders WHERE id = ?").get(orderId);
  if (!row) return res.status(404).json({ message: "주문을 찾을 수 없습니다." });
  const prev = row.status;
  if (prev !== "matched" && prev !== "payment_sent") {
    return res.status(400).json({ message: "매칭 또는 송금완료 상태만 관리자 취소할 수 있습니다." });
  }
  const tradeLm = normalizeLedgerFromSqlMinor(row.amount_minor);
  if (!tradeLm.ok) {
    return res.status(400).json({ message: "주문 수량이 올바르지 않습니다." });
  }
  db.transaction(() => {
    db.prepare(`UPDATE p2p_orders SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(orderId);
    unlockSellerP2pEscrowByMinor(Number(row.seller_user_id), tradeLm.minor);
  })();
  appendP2pOrderEvent(orderId, req.user.id, "admin_cancel", mergeDomainPayload({ reason: reason || undefined, previous_status: prev }));
  appendPlatformAuditLog(req, {
    userId: req.user.id,
    eventType: "p2p.order_admin_cancel",
    payload: { orderId, previous_status: prev, reason: reason || undefined },
  });
  const next = db.prepare("SELECT * FROM p2p_orders WHERE id = ?").get(orderId);
  res.json({ order: mapP2pOrderRow(next, null) });
});

app.get("/api/admin/platform-settings", authRequired, adminRequired, (_req, res) => {
  const minutes = getP2pMatchSlaMinutes();
  const row = db.prepare("SELECT updated_at, updated_by_user_id FROM platform_settings WHERE setting_key = ?").get("p2p.match_sla_minutes");
  res.json({
    p2p_match_sla_minutes: minutes,
    p2p_match_sla_updated_at: row?.updated_at ?? null,
    p2p_match_sla_updated_by: row?.updated_by_user_id ?? null,
    env_fallback_p2p_match_sla_minutes: getEnvDefaultP2pSlaMinutes(),
    ...marketPriceFeedSettingsPayload(),
  });
});

app.patch("/api/admin/platform-settings", authRequired, adminRequired, (req, res) => {
  const body = req.body || {};
  let priceFeedNorm = null;
  if (Object.prototype.hasOwnProperty.call(body, "price_feed_provider")) {
    priceFeedNorm = normalizeAdminPriceFeedProviderInput(body.price_feed_provider);
    if (priceFeedNorm.error) {
      return res.status(400).json({ message: priceFeedNorm.error });
    }
  }
  if (body.p2p_match_sla_minutes !== undefined && body.p2p_match_sla_minutes !== null) {
    const v = clampPlatformSlaMinutes(body.p2p_match_sla_minutes);
    db.prepare(`
      INSERT INTO platform_settings (setting_key, value_json, updated_by_user_id, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(setting_key) DO UPDATE SET
        value_json = excluded.value_json,
        updated_by_user_id = excluded.updated_by_user_id,
        updated_at = CURRENT_TIMESTAMP
    `).run("p2p.match_sla_minutes", JSON.stringify({ minutes: v }), req.user.id);
    appendPlatformAuditLog(req, {
      userId: req.user.id,
      eventType: "platform_settings.updated",
      payload: { key: "p2p.match_sla_minutes", minutes: v },
    });
  }
  if (priceFeedNorm && !priceFeedNorm.skip) {
    if (priceFeedNorm.value === "") {
      db.prepare("DELETE FROM platform_settings WHERE setting_key = ?").run(MARKET_PRICE_FEED_SETTING_KEY);
    } else {
      db.prepare(`
        INSERT INTO platform_settings (setting_key, value_json, updated_by_user_id, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(setting_key) DO UPDATE SET
          value_json = excluded.value_json,
          updated_by_user_id = excluded.updated_by_user_id,
          updated_at = CURRENT_TIMESTAMP
      `).run(MARKET_PRICE_FEED_SETTING_KEY, storageJsonForPriceFeedProvider(priceFeedNorm.value), req.user.id);
    }
    appendPlatformAuditLog(req, {
      userId: req.user.id,
      eventType: "platform_settings.updated",
      payload: { key: MARKET_PRICE_FEED_SETTING_KEY, provider: priceFeedNorm.value === "" ? "inherit_env" : priceFeedNorm.value },
    });
    clearPriceFeedCache();
  }
  const minutes = getP2pMatchSlaMinutes();
  const row = db.prepare("SELECT updated_at, updated_by_user_id FROM platform_settings WHERE setting_key = ?").get("p2p.match_sla_minutes");
  res.json({
    p2p_match_sla_minutes: minutes,
    p2p_match_sla_updated_at: row?.updated_at ?? null,
    p2p_match_sla_updated_by: row?.updated_by_user_id ?? null,
    env_fallback_p2p_match_sla_minutes: getEnvDefaultP2pSlaMinutes(),
    ...marketPriceFeedSettingsPayload(),
  });
});

expireStaleMatchedOrders();
setInterval(expireStaleMatchedOrders, 60000);

app.listen(PORT, () => {
  console.log(`[tetherget-api] running on http://localhost:${PORT}`);
});
