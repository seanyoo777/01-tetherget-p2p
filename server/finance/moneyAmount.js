/**
 * 원장 금액 처리 (MVP)
 *
 * - 사용자 입력은 최대 8소수(HALF_UP)로 맞춘 뒤 **INTEGER 마이너 단위(10^8)** 로 DB에 저장합니다.
 * - 구버전 REAL 원장 컬럼은 시작 시 1회 마이그레이션 후 DROP 됩니다.
 * - 단일 코인/단위 원장 전제.
 */

export const LEDGER_DECIMAL_PLACES = 8;
export const MULTIPLIER_BIGINT = 10n ** 8n;

/** Math.round(n * 1e8) 이 안전하게 들어가는 상한 (Number.MAX_SAFE_INTEGER 내 minor 보장) */
export const MAX_LEDGER_MAJOR = 90_000_000;

/** REAL 비교 시 허용 오차: 최소 단위 10^-8 의 절반 (레거시 REAL 경로 전용) */
export const LEDGER_SQL_TOLERANCE = 5e-9;

export function ledgerSqlTolerance() {
  return LEDGER_SQL_TOLERANCE;
}

/** SQLite INTEGER 컬럼 바인딩용 (정확히 마이너 정수) */
export function minorBigIntToSqlInt(minor) {
  const m = typeof minor === "bigint" ? minor : BigInt(String(minor));
  if (m < 0n) throw new Error("negative ledger minor");
  if (m > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("ledger minor exceeds JS safe integer");
  return Number(m);
}

/** DB INTEGER 마이너 → 표시용 major 숫자 */
export function financialMinorToMajor(sqlInteger) {
  if (sqlInteger == null || sqlInteger === "") return 0;
  try {
    const bi = BigInt(String(Math.trunc(Number(sqlInteger))));
    return minorToNumberLossless(bi) ?? 0;
  } catch {
    return 0;
  }
}

/** INTEGER 마이너 행에서 normalizeLedgerAmount 와 동일 형태 */
export function normalizeLedgerFromSqlMinor(sqlMinor) {
  const mi = sqlMinor == null ? 0 : Math.trunc(Number(sqlMinor));
  if (!Number.isFinite(mi) || mi < 0) return { ok: false, message: "저장된 금액이 유효하지 않습니다." };
  const minor = BigInt(mi);
  const value = minorToNumberLossless(minor);
  if (value === null && minor !== 0n) return { ok: false, message: "저장된 금액이 유효하지 않습니다." };
  return { ok: true, value: value ?? 0, minor };
}

/**
 * @param {unknown} input
 * @param {{ allowZero?: boolean }} [opts]
 * @returns {{ ok: true, value: number, minor: bigint } | { ok: false, message: string }}
 */
export function normalizeLedgerAmount(input, opts = {}) {
  const allowZero = Boolean(opts.allowZero);
  const fromNum = numberToMinorHalfUp(input);
  if (!fromNum.ok) return fromNum;
  const { minor, negative } = fromNum;
  if (negative) return { ok: false, message: "금액은 음수일 수 없습니다." };
  if (minor === 0n && !allowZero) return { ok: false, message: "금액은 0보다 커야 합니다." };
  if (minor > BigInt(MAX_LEDGER_MAJOR) * MULTIPLIER_BIGINT) {
    return { ok: false, message: "금액이 허용 범위를 벗어났습니다." };
  }
  const value = minorToNumberLossless(minor);
  if (value === null) return { ok: false, message: "금액이 허용 범위를 벗어났습니다." };
  return { ok: true, value, minor };
}

/** @returns {number | null} */
export function minorToNumberLossless(minor) {
  if (typeof minor !== "bigint") return null;
  if (minor < 0n) return null;
  if (minor > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(minor) / Number(MULTIPLIER_BIGINT);
}

/**
 * @returns {{ ok: true, minor: bigint, negative: boolean } | { ok: false, message: string }}
 */
function numberToMinorHalfUp(input) {
  if (input === null || input === undefined || input === "") {
    return { ok: false, message: "금액이 필요합니다." };
  }
  if (typeof input === "string") {
    return decimalStringToMinorHalfUp(input.trim());
  }
  const n = Number(input);
  if (!Number.isFinite(n)) return { ok: false, message: "금액이 유효하지 않습니다." };
  if (n === 0) return { ok: true, minor: 0n, negative: false };
  const negative = n < 0;
  const abs = Math.abs(n);
  if (abs > MAX_LEDGER_MAJOR) return { ok: false, message: "금액이 허용 범위를 벗어났습니다." };
  const scaled = Math.round(abs * 1e8);
  if (!Number.isFinite(scaled) || scaled < 0 || scaled > Number.MAX_SAFE_INTEGER) {
    return { ok: false, message: "금액이 유효하지 않습니다." };
  }
  return { ok: true, minor: BigInt(scaled), negative };
}

/**
 * @returns {{ ok: true, minor: bigint, negative: boolean } | { ok: false, message: string }}
 */
function decimalStringToMinorHalfUp(raw) {
  let s = String(raw).replace(/,/g, "").trim();
  if (!s) return { ok: false, message: "금액이 필요합니다." };
  let neg = false;
  if (s.startsWith("-")) {
    neg = true;
    s = s.slice(1).trim();
  } else if (s.startsWith("+")) {
    s = s.slice(1).trim();
  }
  if (!/^\d*\.?\d*$/.test(s)) return { ok: false, message: "금액 형식이 올바르지 않습니다." };
  const [intRaw, fracRaw = ""] = s.split(".");
  const intPart = intRaw === "" ? "0" : intRaw.replace(/^0+(?=\d)/, "");
  if (!/^\d+$/.test(intPart)) return { ok: false, message: "금액 형식이 올바르지 않습니다." };
  if (!/^\d*$/.test(fracRaw)) return { ok: false, message: "금액 형식이 올바르지 않습니다." };
  if (BigInt(intPart) > BigInt(MAX_LEDGER_MAJOR)) {
    return { ok: false, message: "금액이 허용 범위를 벗어났습니다." };
  }

  const pad = `${fracRaw}000000000`;
  const head = pad.slice(0, LEDGER_DECIMAL_PLACES);
  const ninth = pad.charAt(LEDGER_DECIMAL_PLACES) || "0";
  let fracMinor = BigInt(head.padEnd(LEDGER_DECIMAL_PLACES, "0"));
  if (ninth >= "5" && ninth <= "9") {
    fracMinor += 1n;
  }
  const carry = fracMinor / MULTIPLIER_BIGINT;
  const fracRem = fracMinor % MULTIPLIER_BIGINT;
  const minor = (BigInt(intPart) + carry) * MULTIPLIER_BIGINT + fracRem;
  if (minor > BigInt(MAX_LEDGER_MAJOR) * MULTIPLIER_BIGINT) {
    return { ok: false, message: "금액이 허용 범위를 벗어났습니다." };
  }
  return { ok: true, minor, negative: neg };
}

/** DB REAL 또는 계산 결과를 minor 로 스냅 (비교·차감용, 재입력 아님) */
export function dbMoneyToMinor(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  if (n > MAX_LEDGER_MAJOR) return null;
  const scaled = Math.round(n * 1e8);
  if (!Number.isFinite(scaled) || scaled < 0 || scaled > Number.MAX_SAFE_INTEGER) return null;
  return BigInt(scaled);
}

/** take 가 (0, listed] 인지 minor 기준 */
export function ledgerTakeFitsListed(listedDb, takeNormalizedNumber) {
  const L = dbMoneyToMinor(listedDb);
  const T = dbMoneyToMinor(takeNormalizedNumber);
  if (L === null || T === null) return false;
  return T > 0n && T <= L;
}

/** 부분 체결 후 남은 수량 (양자화된 number) */
export function ledgerListedMinusTake(listedDb, takeNormalizedNumber) {
  const L = dbMoneyToMinor(listedDb);
  const T = dbMoneyToMinor(takeNormalizedNumber);
  if (L === null || T === null || T > L) return null;
  return minorToNumberLossless(L - T);
}

/** listed 와 동일 minor 이면 전량 매칭으로 간주 */
export function ledgerIsFullTake(listedDb, takeNormalizedNumber) {
  const L = dbMoneyToMinor(listedDb);
  const T = dbMoneyToMinor(takeNormalizedNumber);
  if (L === null || T === null) return false;
  return T >= L;
}

export function parseLedgerPositiveAmount(value) {
  const r = normalizeLedgerAmount(value);
  return r.ok ? r.value : null;
}

/** 단가·수수료 등 0 허용; 비어 있으면 0; 잘못된 입력은 null */
export function parseLedgerNonNegativePrice(value) {
  if (value === undefined || value === null || value === "") return 0;
  const r = normalizeLedgerAmount(value, { allowZero: true });
  return r.ok ? r.value : null;
}
