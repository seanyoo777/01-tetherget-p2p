/**
 * 로컬 테스트 계정 시드 + 본사(/owner)에서 발급한 계정을 한 레지스트리로 관리합니다.
 * 비밀번호는 화면 목록(state)에는 넣지 않고, 로컬 로그인 검증에만 사용합니다.
 */

import { SESSION_ROLE, normalizeSessionRoleHint } from "./sessionRoles";

export const REGISTRY_STORAGE_KEY = "tetherget_test_registry_v1";
export const REGISTRY_CHANGED_EVENT = "tetherget-test-registry-changed";

/** 로컬 로그인용 시드 계정 10개 (API 없을 때 동일 이메일·비번으로 로그인) */
export const SEED_TEST_ACCOUNTS = [
  {
    id: "AUTH-ADMIN-001",
    email: "admin@tetherget.com",
    password: "admin1234",
    nickname: "슈퍼페이지 관리자",
    role: "슈퍼페이지 관리자",
    session_role: "hq_ops",
    sales_level: null,
    createdAt: "2026-05-01",
  },
  {
    id: "AUTH-HQ-002",
    email: "hq2@tetherget.test",
    password: "Test1234",
    nickname: "본사테스트2",
    role: "본사 관리자",
    session_role: "hq_ops",
    sales_level: null,
    createdAt: "2026-05-10",
  },
  {
    id: "AUTH-SALES-001",
    email: "sales@tetherget.com",
    password: "sales1234",
    nickname: "LEVEL1 영업관리자",
    role: "영업관리자 LEVEL 1",
    session_role: "sales",
    sales_level: 1,
    createdAt: "2026-05-02",
  },
  {
    id: "AUTH-SALES-002",
    email: "sales2@tetherget.test",
    password: "Test1234",
    nickname: "영업테스트2",
    role: "영업관리자 LEVEL 1",
    session_role: "sales",
    sales_level: 1,
    createdAt: "2026-05-10",
  },
  {
    id: "AUTH-SALES-003",
    email: "sales3@tetherget.test",
    password: "Test1234",
    nickname: "영업테스트3",
    role: "영업관리자 LEVEL 1",
    session_role: "sales",
    sales_level: 1,
    createdAt: "2026-05-10",
  },
  {
    id: "AUTH-SALES-004",
    email: "sales4@tetherget.test",
    password: "Test1234",
    nickname: "영업테스트4",
    role: "영업관리자 LEVEL 1",
    session_role: "sales",
    sales_level: 1,
    createdAt: "2026-05-10",
  },
  {
    id: "AUTH-MEM-001",
    email: "member1@tetherget.test",
    password: "Test1234",
    nickname: "일반회원1",
    role: "회원",
    session_role: null,
    sales_level: null,
    createdAt: "2026-05-10",
  },
  {
    id: "AUTH-MEM-002",
    email: "member2@tetherget.test",
    password: "Test1234",
    nickname: "일반회원2",
    role: "회원",
    session_role: null,
    sales_level: null,
    createdAt: "2026-05-10",
  },
  {
    id: "AUTH-MEM-003",
    email: "member3@tetherget.test",
    password: "Test1234",
    nickname: "일반회원3",
    role: "회원",
    session_role: null,
    sales_level: null,
    createdAt: "2026-05-10",
  },
  {
    id: "AUTH-MEM-004",
    email: "member4@tetherget.test",
    password: "Test1234",
    nickname: "일반회원4",
    role: "회원",
    session_role: null,
    sales_level: null,
    createdAt: "2026-05-10",
  },
];

export function stripPassword(user) {
  if (!user || typeof user !== "object") return user;
  const { password: _p, ...rest } = user;
  return rest;
}

export function loadRegistry() {
  try {
    const raw = localStorage.getItem(REGISTRY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveRegistryRows(rows) {
  localStorage.setItem(REGISTRY_STORAGE_KEY, JSON.stringify(rows));
  window.dispatchEvent(new Event(REGISTRY_CHANGED_EVENT));
}

/** 로그인 목록·관리자 UI용: 시드 + 발급 계정을 이메일 기준 병합 — 시드를 마지막에 넣어 발급/레지스트리가 시드 메일을 덮지 못하게 함 */
export function buildAuthUsersState() {
  const byEmail = new Map();
  for (const u of loadRegistry().map(stripPassword)) {
    byEmail.set(String(u.email || "").toLowerCase(), u);
  }
  for (const u of SEED_TEST_ACCOUNTS.map(stripPassword)) {
    byEmail.set(String(u.email || "").toLowerCase(), u);
  }
  return Array.from(byEmail.values());
}

export function mergeApiUsersWithLocal(apiUsers) {
  const local = buildAuthUsersState();
  const map = new Map(local.map((u) => [String(u.email || "").toLowerCase(), { ...u }]));
  for (const u of apiUsers || []) {
    const em = String(u.email || "").toLowerCase();
    if (!em) continue;
    const prev = map.get(em);
    const merged = { ...u };
    if (prev) {
      const apiSrNorm = normalizeSessionRoleHint(merged.session_role);
      const seedSrNorm = normalizeSessionRoleHint(prev.session_role);
      if (
        (seedSrNorm === SESSION_ROLE.SALES || seedSrNorm === SESSION_ROLE.HQ_OPS)
        && apiSrNorm === SESSION_ROLE.USER
      ) {
        merged.session_role = prev.session_role;
      }
      if (merged.session_role == null || merged.session_role === "") merged.session_role = prev.session_role ?? null;
      if (merged.sales_level == null && prev.sales_level != null) merged.sales_level = prev.sales_level;
      const roleStr = String(merged.role || "");
      if (!roleStr || roleStr === "회원") merged.role = prev.role || merged.role;
    }
    map.set(em, merged);
  }
  return Array.from(map.values());
}

/** 발급된 행 먼저 매칭 후 시드 (동일 이메일은 발급 쪽에서 등록 자체를 막음) */
export function verifyLocalEmailPassword(email, password) {
  const em = String(email || "").trim().toLowerCase();
  const pw = String(password ?? "");
  for (const u of loadRegistry()) {
    if (String(u.email || "").toLowerCase() === em && u.password === pw) return { ...u };
  }
  for (const u of SEED_TEST_ACCOUNTS) {
    if (String(u.email || "").toLowerCase() === em && u.password === pw) return { ...u };
  }
  return null;
}

/**
 * @param {{ email: string, password: string, nickname?: string, role: string, session_role?: string|null, sales_level?: number|null }} payload
 */
export function addIssuedTestAccount(payload) {
  const email = String(payload.email || "").trim().toLowerCase();
  if (!email.includes("@")) {
    throw new Error("유효한 이메일을 입력하세요.");
  }
  const password = String(payload.password || "");
  if (password.length < 6) {
    throw new Error("비밀번호는 6자 이상이어야 합니다.");
  }
  const list = loadRegistry();
  if (list.some((x) => String(x.email || "").toLowerCase() === email)) {
    throw new Error("이미 발급된 이메일입니다.");
  }
  if (SEED_TEST_ACCOUNTS.some((x) => String(x.email || "").toLowerCase() === email)) {
    throw new Error("시드 테스트 계정과 같은 이메일은 사용할 수 없습니다.");
  }
  const row = {
    id: `ISSUED-${Date.now()}`,
    email,
    password,
    nickname: String(payload.nickname || email.split("@")[0]).trim() || email.split("@")[0],
    role: String(payload.role || "회원"),
    session_role: payload.session_role ?? null,
    sales_level: payload.sales_level != null ? Number(payload.sales_level) : null,
    createdAt: new Date().toISOString().slice(0, 10),
    issuedAt: new Date().toISOString(),
    issuedNote: payload.issuedNote ? String(payload.issuedNote) : "",
  };
  list.push(row);
  saveRegistryRows(list);
  return stripPassword(row);
}

export function removeIssuedTestAccount(email) {
  const em = String(email || "").trim().toLowerCase();
  const next = loadRegistry().filter((x) => String(x.email || "").toLowerCase() !== em);
  saveRegistryRows(next);
}
