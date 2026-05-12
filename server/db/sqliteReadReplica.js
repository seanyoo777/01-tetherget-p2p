/**
 * Phase 21: 읽기 전용 SQLite 경로(복제본 파일) — 감사·대사·리포트 SELECT 에 사용.
 * READ_REPLICA_DATABASE_PATH 미설정 또는 파일 없으면 primary `db` 로 폴백.
 */

import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { db } from "./sqlite.js";

let cached = null;
let cachedPath = "";

/**
 * @returns {import("better-sqlite3").Database}
 */
export function getReadReplicaDb() {
  const p = String(process.env.READ_REPLICA_DATABASE_PATH || "").trim();
  if (!p) return db;
  const resolved = path.resolve(p);
  if (!fs.existsSync(resolved)) return db;
  if (cached && cachedPath === resolved) return cached;
  try {
    if (cached) {
      try {
        cached.close();
      } catch {
        /* ignore */
      }
      cached = null;
      cachedPath = "";
    }
    cached = new Database(resolved, { readonly: true, fileMustExist: true });
    cachedPath = resolved;
    return cached;
  } catch (e) {
    console.warn("[read-replica] open failed, using primary:", e?.message || e);
    return db;
  }
}
