/** Shared admin member seeding + stage normalization (used by App.jsx and SimpleAdmin). */

export const ADMIN_STAGE_LABEL = Object.freeze({
  SUPER_PAGE: "슈퍼페이지",
  HQ_ADMIN: "본사 관리자",
  HQ_STAFF: "본사 관계자",
  MEMBER: "회원",
});

/** 영업 피라미드 LEVEL 1 … 12 (10+ 구간은 집계에서 `11단계+`로 묶음). */
export const SALES_LEVEL_STAGES = Object.freeze(Array.from({ length: 12 }, (_, i) => `LEVEL ${i + 1}`));

const KOR_PYRAMID_ALIASES = Object.freeze(
  Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`${i + 1}단계`, `LEVEL ${i + 1}`]))
);

const STAGE_ALIASES = Object.freeze({
  ...KOR_PYRAMID_ALIASES,
  "일반회원": ADMIN_STAGE_LABEL.MEMBER,
  "본사": ADMIN_STAGE_LABEL.SUPER_PAGE,
  "팀장": SALES_LEVEL_STAGES[2],
  "파트너": SALES_LEVEL_STAGES[1],
  "총판": SALES_LEVEL_STAGES[0],
});

export const ADMIN_STAGE_OPTIONS = Object.freeze([
  ADMIN_STAGE_LABEL.MEMBER,
  ...SALES_LEVEL_STAGES,
  ADMIN_STAGE_LABEL.HQ_STAFF,
  ADMIN_STAGE_LABEL.HQ_ADMIN,
  ADMIN_STAGE_LABEL.SUPER_PAGE,
]);

/** 관리자 목업 회원관리용 가상 하부 회원 수 */
export const VIRTUAL_DOWNLINE_MEMBER_COUNT = 300;

export function normalizeStageLabel(value) {
  const raw = String(value || "").trim();
  if (!raw) return ADMIN_STAGE_LABEL.MEMBER;
  const aliased = STAGE_ALIASES[raw];
  if (aliased) return aliased;
  const compact = raw.replace(/\s+/g, " ").trim();
  const korLevel = compact.match(/^레벨\s*(\d{1,2})$/i);
  if (korLevel) {
    const n = Number(korLevel[1]);
    if (Number.isFinite(n) && n >= 1 && n <= 20) return `LEVEL ${n}`;
  }
  const levelMatch = compact.match(/^LEVEL\s*(\d{1,2})$/i);
  if (levelMatch) {
    const n = Number(levelMatch[1]);
    if (Number.isFinite(n) && n >= 1 && n <= 20) return `LEVEL ${n}`;
  }
  return compact;
}

export function mergeAuthUserWithStageConsistency(user, patch) {
  const next = { ...user, ...patch };
  const raw = String(next.stage_label ?? next.stageLabel ?? "").trim();
  if (!raw) return next;
  const c = normalizeStageLabel(raw);
  next.stage_label = c;
  next.stageLabel = c;
  return next;
}

export function mapAuthUserToMember(user, index) {
  const numericId = Number(user?.id || index + 1);
  const safeNum = Number.isFinite(numericId) ? numericId : index + 1;
  const parentRef = String(user?.parent_user_ref || user?.parentUserRef || user?.referred_by_code || ADMIN_STAGE_LABEL.SUPER_PAGE);
  const receivedRate = 50;
  const childRate = 45;
  return {
    id: String(user?.id || `AUTH-${safeNum}`),
    nickname: String(user?.nickname || `회원${safeNum}`),
    email: String(user?.email || `member${safeNum}@tetherget.com`),
    wallet: `${String(safeNum).padStart(2, "0")}xA2...${String(9000 + safeNum).slice(-4)}`,
    parent: parentRef,
    receivedRate,
    childRate,
    marginRate: receivedRate - childRate,
    trades: 10 + safeNum * 2,
    volume: 5000 + safeNum * 1700,
    children: 0,
    status: user?.admin_assigned ? "주의" : "정상",
    phone: `010-${String(3000 + safeNum).slice(-4)}-${String(6000 + safeNum).slice(-4)}`,
    ip: `52.78.${safeNum % 255}.${(safeNum * 5) % 255}`,
    device: "Chrome / Windows",
    country: "KR",
    riskScore: user?.admin_assigned ? 72 : 34,
    reports: 0,
    blacklist: false,
    lastLogin: String(user?.created_at || "2026-05-01 09:00"),
    joined: String(user?.created_at || "2026-05-01"),
    stageLabel: String(user?.stage_label || user?.stageLabel || ""),
    adminAssigned: Boolean(user?.admin_assigned ?? user?.adminAssigned),
    role: String(user?.role || "회원"),
    session_role: user?.session_role,
    sales_level: user?.sales_level,
    referralCode: String(user?.referral_code || user?.referralCode || "")
      .trim()
      .toUpperCase() || `AUTHREF-${String(safeNum).padStart(4, "0")}`,
  };
}

/**
 * 가상 하부는 항상 `VIRTUAL_DOWNLINE_MEMBER_COUNT`(300)명.
 * 회원 **ID는 항상 `VD-001` ~ `VD-300` 고정**
 */
export function createVirtualDownlineUsers(ownerId) {
  const parentRef = String(ownerId || "AUTH-ADMIN-001");
  const targetCount = VIRTUAL_DOWNLINE_MEMBER_COUNT;
  const stageBuckets = [
    { stage: ADMIN_STAGE_LABEL.SUPER_PAGE, size: 6, receivedRate: 50, childRate: 45 },
    { stage: ADMIN_STAGE_LABEL.HQ_ADMIN, size: 9, receivedRate: 48, childRate: 44 },
    { stage: ADMIN_STAGE_LABEL.HQ_STAFF, size: 15, receivedRate: 46, childRate: 42 },
    { stage: SALES_LEVEL_STAGES[0], size: 45, receivedRate: 45, childRate: 40 },
    { stage: SALES_LEVEL_STAGES[1], size: 75, receivedRate: 40, childRate: 35 },
    { stage: SALES_LEVEL_STAGES[2], size: 150, receivedRate: 35, childRate: 30 },
  ];
  const bucketSum = stageBuckets.reduce((acc, b) => acc + b.size, 0);
  if (bucketSum !== targetCount && import.meta.env.DEV) {
    console.warn("[createVirtualDownlineUsers] stageBuckets 합이", targetCount, "이 아님:", bucketSum);
  }
  const users = [];
  let cursor = 1;
  for (const bucket of stageBuckets) {
    for (let i = 0; i < bucket.size && users.length < targetCount; i += 1) {
      const n = cursor++;
      if (n > targetCount) break;
      users.push({
        id: `VD-${String(n).padStart(3, "0")}`,
        nickname: `하부회원${String(n).padStart(3, "0")}`,
        email: `downline${n}@tetherget.com`,
        wallet: `${String(n).padStart(2, "0")}xV...${String(6000 + n).slice(-4)}`,
        parent: parentRef,
        receivedRate: bucket.receivedRate,
        childRate: bucket.childRate,
        marginRate: bucket.receivedRate - bucket.childRate,
        trades: 5 + n * 4,
        volume: 3000 + n * 1100,
        children: 0,
        status: n % 9 === 0 ? "주의" : "정상",
        phone: `010-${String(5000 + n).slice(-4)}-${String(8000 + n).slice(-4)}`,
        ip: `52.80.${n % 255}.${(n * 3) % 255}`,
        device: n % 2 ? "Chrome / Windows" : "Safari / iPhone",
        country: n % 3 === 0 ? "KR" : n % 3 === 1 ? "VN" : "US",
        riskScore: 25 + (n % 8) * 6,
        reports: n % 15 === 0 ? 1 : 0,
        blacklist: false,
        lastLogin: `2026-05-${String((n % 28) + 1).padStart(2, "0")} 10:${String(n % 60).padStart(2, "0")}`,
        joined: `2026-05-${String((n % 28) + 1).padStart(2, "0")}`,
        stageLabel: bucket.stage,
        adminAssigned: false,
        admin_assigned: false,
        role: "회원",
        referralCode: `VDREF-${String(n).padStart(3, "0")}`,
      });
    }
  }
  let fillLevel = 1;
  while (users.length < targetCount) {
    const n = cursor++;
    if (n > targetCount) break;
    const stageName = `LEVEL ${fillLevel}`;
    fillLevel = fillLevel >= 12 ? 1 : fillLevel + 1;
    const rr = 32 - (fillLevel % 5);
    const cr = Math.max(20, rr - 6);
    users.push({
      id: `VD-${String(n).padStart(3, "0")}`,
      nickname: `하부회원${String(n).padStart(3, "0")}`,
      email: `downline${n}@tetherget.com`,
      wallet: `${String(n).padStart(2, "0")}xV...${String(6000 + n).slice(-4)}`,
      parent: parentRef,
      receivedRate: rr,
      childRate: cr,
      marginRate: rr - cr,
      trades: 5 + n * 4,
      volume: 3000 + n * 1100,
      children: 0,
      status: n % 9 === 0 ? "주의" : "정상",
      phone: `010-${String(5000 + n).slice(-4)}-${String(8000 + n).slice(-4)}`,
      ip: `52.80.${n % 255}.${(n * 3) % 255}`,
      device: n % 2 ? "Chrome / Windows" : "Safari / iPhone",
      country: n % 3 === 0 ? "KR" : n % 3 === 1 ? "VN" : "US",
      riskScore: 25 + (n % 8) * 6,
      reports: n % 15 === 0 ? 1 : 0,
      blacklist: false,
      lastLogin: `2026-05-${String((n % 28) + 1).padStart(2, "0")} 10:${String(n % 60).padStart(2, "0")}`,
      joined: `2026-05-${String((n % 28) + 1).padStart(2, "0")}`,
      stageLabel: stageName,
      adminAssigned: false,
      admin_assigned: false,
      role: "회원",
      referralCode: `VDREF-${String(n).padStart(3, "0")}`,
    });
  }
  if (users.length > targetCount) {
    return users.slice(0, targetCount);
  }
  return users;
}
