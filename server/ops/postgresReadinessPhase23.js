/**
 * Phase 23: Postgres/리플리카 전환 준비 — 현재 드라이버·URL 존재 여부·권장 체크리스트(비밀 미노출).
 */

/**
 * @param {NodeJS.ProcessEnv} env
 */
export function getDatabaseReadiness(env) {
  const databaseUrl = String(env.DATABASE_URL || "").trim();
  const isPostgresUrl = /^postgres(ql)?:\/\//i.test(databaseUrl);
  const replicaPath = String(env.READ_REPLICA_DATABASE_PATH || "").trim();
  return {
    active_driver: "better-sqlite3",
    database_url_configured: Boolean(databaseUrl),
    postgres_url_pattern_detected: isPostgresUrl,
    read_replica_sqlite_path_configured: Boolean(replicaPath),
    migration_notes: isPostgresUrl
      ? "DATABASE_URL 이 Postgres 형식입니다. 앱은 아직 SQLite 전용 — 마이그레이션 스크립트·연결 풀 도입 후 전환하세요."
      : "SQLite 단일 파일 운영 중. 운영 Postgres 전환 시 스키마·시퀀스·WAL 정책을 별도 검증하세요.",
  };
}
