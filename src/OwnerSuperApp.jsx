import React, { useEffect, useMemo, useState } from "react";
import {
  loadRegistry,
  addIssuedTestAccount,
  removeIssuedTestAccount,
  stripPassword,
  REGISTRY_CHANGED_EVENT,
} from "./testAccountRegistry";

/** 플랫폼 오너 전용 콘솔 — 메인 서비스(/ )와 완전 분리된 엔트리 (/owner) */
const STORAGE_KEY = "tgx_platform_owner_console_v1";

const SEED_OWNER_ACCOUNTS = [{ email: "admin@tgx.com", password: "admin1234", note: "시드(데모)" }];

function loadStore() {
  const seed = {
    version: 1,
    ownerAccounts: [...SEED_OWNER_ACCOUNTS],
    employees: [],
    audit: [],
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const accounts = Array.isArray(parsed?.ownerAccounts) ? parsed.ownerAccounts : [];
      const mergedOwners =
        accounts.length > 0
          ? accounts
          : SEED_OWNER_ACCOUNTS.map((a) => ({ ...a }));
      return {
        ...seed,
        ...parsed,
        ownerAccounts: mergedOwners,
      };
    }
  } catch {
    /* fall through to fresh seed */
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
  return seed;
}

function saveStore(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export default function OwnerSuperApp() {
  const [store, setStore] = useState(() => loadStore());
  const [sessionEmail, setSessionEmail] = useState(() => localStorage.getItem("tgx_owner_session_email_v1") || "");
  const [emailIn, setEmailIn] = useState("");
  const [passwordIn, setPasswordIn] = useState("");
  const [empEmail, setEmpEmail] = useState("");
  const [empName, setEmpName] = useState("");
  const [empRole, setEmpRole] = useState("hq_staff");
  const [issuedRows, setIssuedRows] = useState(() => loadRegistry().map(stripPassword));
  const [issueEmail, setIssueEmail] = useState("");
  const [issuePassword, setIssuePassword] = useState("");
  const [issueNickname, setIssueNickname] = useState("");
  const [issueKind, setIssueKind] = useState("sales");

  useEffect(() => {
    function syncIssued() {
      setIssuedRows(loadRegistry().map(stripPassword));
    }
    window.addEventListener(REGISTRY_CHANGED_EVENT, syncIssued);
    return () => window.removeEventListener(REGISTRY_CHANGED_EVENT, syncIssued);
  }, []);

  useEffect(() => {
    saveStore(store);
  }, [store]);

  const loggedIn = useMemo(() => {
    const em = String(sessionEmail || "").trim().toLowerCase();
    return Boolean(em && store.ownerAccounts?.some((a) => String(a.email || "").toLowerCase() === em));
  }, [sessionEmail, store.ownerAccounts]);

  function login(e) {
    e.preventDefault();
    const em = emailIn.trim().toLowerCase();
    const pw = String(passwordIn ?? "").trim();
    const acc = store.ownerAccounts?.find((a) => String(a.email || "").toLowerCase() === em);
    if (!acc || acc.password !== pw) {
      alert("이메일 또는 비밀번호가 올바르지 않습니다.");
      return;
    }
    setSessionEmail(em);
    localStorage.setItem("tgx_owner_session_email_v1", em);
    setPasswordIn("");
  }

  function logout() {
    setSessionEmail("");
    localStorage.removeItem("tgx_owner_session_email_v1");
  }

  function appendAudit(line) {
    setStore((prev) => ({
      ...prev,
      audit: [{ t: new Date().toISOString(), line }, ...(prev.audit || []).slice(0, 99)],
    }));
  }

  function addEmployee(e) {
    e.preventDefault();
    const em = empEmail.trim().toLowerCase();
    if (!em || !em.includes("@")) {
      alert("직원 이메일을 입력하세요.");
      return;
    }
    setStore((prev) => ({
      ...prev,
      employees: [...(prev.employees || []).filter((x) => String(x.email).toLowerCase() !== em), { email: em, name: empName.trim() || em, role: empRole, createdAt: new Date().toISOString() }],
    }));
    appendAudit(`직원 등록: ${em} (${empRole})`);
    setEmpEmail("");
    setEmpName("");
    notifyDone();
  }

  function removeEmployee(em) {
    const email = String(em).toLowerCase();
    setStore((prev) => ({
      ...prev,
      employees: (prev.employees || []).filter((x) => String(x.email).toLowerCase() !== email),
    }));
    appendAudit(`직원 삭제: ${email}`);
  }

  function notifyDone() {
    alert("저장되었습니다. (로컬 데모)");
  }

  if (!loggedIn) {
    return (
      <div className="min-h-screen bg-slate-950 px-4 py-16 text-white">
        <div className="mx-auto w-full max-w-md rounded-3xl border border-slate-700 bg-slate-900 p-8 shadow-xl">
          <h1 className="text-2xl font-black">플랫폼 오너 콘솔</h1>
          <p className="mt-2 text-sm text-slate-400">
            메인 서비스와 분리된 주소입니다. 직원·권한 메타 관리용 (데모는 localStorage).
          </p>
          <p className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
            시드 계정: <b>admin@tgx.com</b> / <b>admin1234</b>
          </p>
          <form onSubmit={login} className="mt-8 grid gap-4">
            <label className="grid gap-1 text-sm font-bold">
              이메일
              <input
                value={emailIn}
                onChange={(e) => setEmailIn(e.target.value)}
                className="rounded-xl border border-slate-600 bg-slate-800 px-4 py-3 outline-none"
                autoComplete="username"
              />
            </label>
            <label className="grid gap-1 text-sm font-bold">
              비밀번호
              <input
                type="password"
                value={passwordIn}
                onChange={(e) => setPasswordIn(e.target.value)}
                className="rounded-xl border border-slate-600 bg-slate-800 px-4 py-3 outline-none"
                autoComplete="current-password"
              />
            </label>
            <button type="submit" className="rounded-xl bg-white py-3 font-black text-slate-950">
              로그인
            </button>
          </form>
          <a href="/" className="mt-8 block text-center text-sm text-slate-500 underline">
            메인 서비스로 돌아가기
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-8">
      <div className="mx-auto w-full max-w-5xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-700 pb-6">
          <div>
            <div className="text-xs font-bold text-emerald-400">PLATFORM SUPER · /owner</div>
            <h1 className="text-2xl font-black">오너 전용 · 직원 / 권한</h1>
            <p className="mt-1 text-sm text-slate-400">본사 운영자(hq_ops) 계정 발급 정책은 여기서만 다룹니다. (추후 API 연동)</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-slate-600 px-3 py-1 text-xs">{sessionEmail}</span>
            <button type="button" onClick={logout} className="rounded-xl border border-slate-600 px-4 py-2 text-sm font-black">
              로그아웃
            </button>
          </div>
        </header>

        <div className="mt-8 rounded-3xl border border-amber-500/40 bg-amber-500/5 p-6">
          <h2 className="text-lg font-black text-amber-100">메인 앱 테스트 아이디 발급</h2>
          <p className="mt-1 text-xs text-slate-400">
            발급된 계정은 메인 서비스(<span className="text-white">/</span>) 로그인에서 이메일·비밀번호로 사용합니다. 서버가 없을 때는 브라우저 로컬 검증으로 로그인됩니다.
          </p>
          <form
            className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
            onSubmit={(e) => {
              e.preventDefault();
              const presets = {
                sales: { role: "영업관리자 LEVEL 1", session_role: "sales", sales_level: 1 },
                hq: { role: "슈퍼페이지 관리자", session_role: "hq_ops", sales_level: null },
                member: { role: "회원", session_role: null, sales_level: null },
              };
              try {
                addIssuedTestAccount({
                  email: issueEmail,
                  password: issuePassword,
                  nickname: issueNickname,
                  ...presets[issueKind],
                });
                appendAudit(`테스트 계정 발급: ${issueEmail.trim().toLowerCase()} (${issueKind})`);
                setIssueEmail("");
                setIssuePassword("");
                setIssueNickname("");
                notifyDone();
              } catch (err) {
                alert(err?.message || "발급 실패");
              }
            }}
          >
            <label className="grid gap-1 text-xs font-bold sm:col-span-2">
              이메일
              <input
                value={issueEmail}
                onChange={(e) => setIssueEmail(e.target.value)}
                className="rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-sm outline-none"
                placeholder="test01@company.local"
                autoComplete="off"
              />
            </label>
            <label className="grid gap-1 text-xs font-bold">
              비밀번호 (6자+)
              <input
                type="password"
                value={issuePassword}
                onChange={(e) => setIssuePassword(e.target.value)}
                className="rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-sm outline-none"
              />
            </label>
            <label className="grid gap-1 text-xs font-bold">
              닉네임
              <input
                value={issueNickname}
                onChange={(e) => setIssueNickname(e.target.value)}
                className="rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-sm outline-none"
                placeholder="표시 이름"
              />
            </label>
            <label className="grid gap-1 text-xs font-bold sm:col-span-2">
              권한 유형
              <select
                value={issueKind}
                onChange={(e) => setIssueKind(e.target.value)}
                className="rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-sm outline-none"
              >
                <option value="sales">영업 (관리자 탭)</option>
                <option value="hq">본사·슈퍼 (hq_ops)</option>
                <option value="member">일반 회원</option>
              </select>
            </label>
            <div className="flex items-end sm:col-span-2">
              <button type="submit" className="w-full rounded-xl bg-amber-500 py-2 text-sm font-black text-slate-950">
                발급 및 목록에 추가
              </button>
            </div>
          </form>
          <ul className="mt-4 space-y-2 text-sm">
            {issuedRows.length === 0 && <li className="text-slate-500">발급된 테스트 계정이 없습니다.</li>}
            {issuedRows.map((row) => (
              <li key={row.id || row.email} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-700 px-3 py-2">
                <span>
                  <b className="text-emerald-300">{row.email}</b> · {row.nickname} · <span className="text-slate-400">{row.role}</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm("이 발급 계정을 삭제할까요? (로컬만)")) {
                      removeIssuedTestAccount(row.email);
                      appendAudit(`테스트 계정 삭제: ${row.email}`);
                    }
                  }}
                  className="text-xs font-black text-red-400"
                >
                  삭제
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-2">
          <section className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
            <h2 className="text-lg font-black">직원(메타) 목록</h2>
            <p className="mt-1 text-xs text-slate-400">실제 권한 반영은 추후 백오피스 API와 동기화합니다.</p>
            <ul className="mt-4 space-y-2">
              {(store.employees || []).length === 0 && <li className="text-sm text-slate-500">등록된 직원이 없습니다.</li>}
              {(store.employees || []).map((emp) => (
                <li key={emp.email} className="flex items-center justify-between rounded-xl border border-slate-700 px-3 py-2 text-sm">
                  <span>
                    <b>{emp.name}</b> · {emp.email} · <span className="text-emerald-400">{emp.role}</span>
                  </span>
                  <button type="button" onClick={() => removeEmployee(emp.email)} className="text-xs font-black text-red-400">
                    삭제
                  </button>
                </li>
              ))}
            </ul>

            <form onSubmit={addEmployee} className="mt-6 grid gap-3 border-t border-slate-700 pt-6">
              <div className="text-sm font-black">직원 추가</div>
              <input value={empEmail} onChange={(e) => setEmpEmail(e.target.value)} placeholder="이메일" className="rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-sm outline-none" />
              <input value={empName} onChange={(e) => setEmpName(e.target.value)} placeholder="표시 이름" className="rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-sm outline-none" />
              <select value={empRole} onChange={(e) => setEmpRole(e.target.value)} className="rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-sm outline-none">
                <option value="hq_staff">본사 운영 직원 (hq_ops 후보)</option>
                <option value="readonly">조회 전용</option>
              </select>
              <button type="submit" className="rounded-xl bg-emerald-600 py-2 text-sm font-black text-white">
                추가
              </button>
            </form>
          </section>

          <section className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
            <h2 className="text-lg font-black">오너 계정 (로컬)</h2>
            <ul className="mt-4 space-y-2 text-sm">
              {(store.ownerAccounts || []).map((a) => (
                <li key={a.email} className="rounded-xl border border-slate-700 px-3 py-2">
                  {a.email}
                  {a.note ? <span className="ml-2 text-xs text-slate-500">{a.note}</span> : null}
                </li>
              ))}
            </ul>
            <h3 className="mt-8 text-sm font-black text-slate-300">최근 감사 (로컬)</h3>
            <ul className="mt-2 max-h-48 overflow-y-auto text-xs text-slate-500">
              {(store.audit || []).map((a, i) => (
                <li key={i}>
                  {a.t} — {a.line}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <p className="mt-10 text-center text-xs text-slate-600">
          메인 서비스 관리자 UI는 그대로 유지됩니다. 영업 레벨·래퍼럴 규칙은 메인 앱 sessionRoles 와 추후 통합합니다.
        </p>
        <div className="mt-4 text-center">
          <a href="/" className="text-sm text-slate-500 underline">
            메인 서비스로 이동
          </a>
        </div>
      </div>
    </div>
  );
}
