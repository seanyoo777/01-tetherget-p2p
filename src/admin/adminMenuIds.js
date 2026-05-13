/**
 * 1번 TetherGet-P2P — 관리자 셸(AdminShell) 사이드 메뉴 id.
 * `App.jsx` 의 `adminShellMenu` 상태와 1:1로 맞춘다.
 * @readonly
 */
export const ADMIN_SHELL_MENU_IDS = Object.freeze({
  DASHBOARD: "dashboard",
  MEMBER: "member",
  REFERRAL: "referral",
  STAGE: "stage",
  TRADE: "trade",
  SETTLEMENT: "settlement",
  SETTINGS: "settings",
  UTE_P2P: "ute",
});

/**
 * `AdminReferralPanel` 내부 탭 (`adminViewTab`).
 * @readonly
 */
export const ADMIN_PANEL_TAB_IDS = Object.freeze({
  DASHBOARD: "dashboard",
  MEMBER: "member",
  MEMBER_OPS: "memberOps",
  SECURITY: "security",
  KYC: "kyc",
  DISPUTE: "dispute",
  OPS: "ops",
  AUDIT: "audit",
  UTE_SURFACE: "uteSurface",
});

/** 셸 메뉴 id → 패널 탭 id (UTE 연동용 매핑과 동일 소스) */
export const ADMIN_SHELL_TO_PANEL_TAB = Object.freeze({
  [ADMIN_SHELL_MENU_IDS.DASHBOARD]: ADMIN_PANEL_TAB_IDS.DASHBOARD,
  [ADMIN_SHELL_MENU_IDS.MEMBER]: ADMIN_PANEL_TAB_IDS.MEMBER,
  [ADMIN_SHELL_MENU_IDS.REFERRAL]: ADMIN_PANEL_TAB_IDS.MEMBER_OPS,
  [ADMIN_SHELL_MENU_IDS.STAGE]: ADMIN_PANEL_TAB_IDS.MEMBER,
  [ADMIN_SHELL_MENU_IDS.TRADE]: ADMIN_PANEL_TAB_IDS.AUDIT,
  [ADMIN_SHELL_MENU_IDS.SETTLEMENT]: ADMIN_PANEL_TAB_IDS.DISPUTE,
  [ADMIN_SHELL_MENU_IDS.SETTINGS]: ADMIN_PANEL_TAB_IDS.OPS,
  [ADMIN_SHELL_MENU_IDS.UTE_P2P]: ADMIN_PANEL_TAB_IDS.UTE_SURFACE,
});

/** @type {readonly string[]} */
export const ADMIN_SHELL_MENU_ID_LIST = Object.freeze(Object.values(ADMIN_SHELL_MENU_IDS));

/** @type {readonly string[]} */
export const ADMIN_PANEL_TAB_ID_LIST = Object.freeze(Object.values(ADMIN_PANEL_TAB_IDS));
