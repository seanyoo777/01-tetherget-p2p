import React, { useEffect, useLayoutEffect, useMemo, useRef, useState, createContext, useContext } from "react";
import { flushSync } from "react-dom";
import { createApiClient } from "./lib/apiClient";
import { resolveApiBase } from "./lib/resolveApiBase";
import { deriveSessionProfile, SESSION_ROLE, normalizeSessionRoleHint } from "./sessionRoles";
import {
  buildAuthUsersState,
  verifyLocalEmailPassword,
  mergeApiUsersWithLocal,
  REGISTRY_CHANGED_EVENT,
} from "./testAccountRegistry";
import { canAccessAdminSafe } from "./admin/canAccessAdminSafe.js";
import { AdminShell } from "./admin/AdminShell.jsx";
import {
  updateUserLevel,
  buildReferralTree,
  getDirectDownlines,
  getAllDownlines,
  getUsersByLevel,
  recalculateAdminStats,
  validateTreeIntegrity,
} from "./utils/referralTreeEngine";
import { MOCK_TRADE_PUSH_NOTIFICATIONS, MOCK_GENERAL_ALERT_NOTIFICATIONS, MOCK_ADMIN_BRIEFS } from "./mock/notificationMock.js";
import { MOCK_P2P_LISTED_ORDERS } from "./mock/p2pListedOrdersMock.js";
import {
  getListingUiMeta,
  formatCompactVol,
  estimateListingNotional,
  buildP2pTickerEntries,
} from "./utils/p2pListingUiMeta.js";

const ADMIN_STAGE_LABEL = Object.freeze({
  SUPER_PAGE: "슈퍼페이지",
  HQ_ADMIN: "본사 관리자",
  HQ_STAFF: "본사 관계자",
  MEMBER: "회원",
});

const SALES_LEVEL_STAGES = Object.freeze(Array.from({ length: 10 }, (_, i) => `LEVEL ${i + 1}`));

const STAGE_ALIASES = Object.freeze({
  "일반회원": ADMIN_STAGE_LABEL.MEMBER,
  "본사": ADMIN_STAGE_LABEL.SUPER_PAGE,
  "팀장": SALES_LEVEL_STAGES[2],
  "파트너": SALES_LEVEL_STAGES[1],
  "총판": SALES_LEVEL_STAGES[0],
});

const ADMIN_STAGE_OPTIONS = Object.freeze([
  ADMIN_STAGE_LABEL.MEMBER,
  ...SALES_LEVEL_STAGES,
  ADMIN_STAGE_LABEL.HQ_STAFF,
  ADMIN_STAGE_LABEL.HQ_ADMIN,
  ADMIN_STAGE_LABEL.SUPER_PAGE,
]);

function normalizeStageLabel(value) {
  const raw = String(value || "").trim();
  if (!raw) return ADMIN_STAGE_LABEL.MEMBER;
  const aliased = STAGE_ALIASES[raw];
  if (aliased) return aliased;
  const compact = raw.replace(/\s+/g, " ").trim();
  const levelMatch = compact.match(/^LEVEL\s*(\d{1,2})$/i);
  if (levelMatch) {
    const n = Number(levelMatch[1]);
    if (Number.isFinite(n) && n >= 1 && n <= 10) return `LEVEL ${n}`;
  }
  return compact;
}

function defaultStageLabelFromRole(user) {
  if (!user) return ADMIN_STAGE_LABEL.MEMBER;
  const roleText = String(user?.role || "");
  if (roleText.includes("슈퍼관리자")) return ADMIN_STAGE_LABEL.SUPER_PAGE;
  if (roleText.includes("운영관리자") || roleText.includes("관리자")) return ADMIN_STAGE_LABEL.HQ_ADMIN;
  return ADMIN_STAGE_LABEL.MEMBER;
}

/** 단계 확인 팝업·안내용 짧은 표기 */
function adminStageDisplayName(stage) {
  const n = normalizeStageLabel(String(stage || ""));
  if (n === ADMIN_STAGE_LABEL.SUPER_PAGE) return "본사";
  if (n === ADMIN_STAGE_LABEL.HQ_ADMIN) return "본사 관리자";
  if (n === ADMIN_STAGE_LABEL.HQ_STAFF) return "본사 관계자";
  return n;
}

const orders = [
  { id: 1, seller: "TG-Seller01", coin: "USDT", price: 1392, amount: 1200, limit: "100 ~ 1,200 USDT", method: "KRW", release: "구매확인 후 자동 릴리즈", level: "Lv.4", trust: 96, trades: 1280, featured: true, category: "코인↔통화" },
  { id: 2, seller: "SafeTrade88", coin: "USDT", price: 1395, amount: 5200, limit: "500 ~ 5,200 USDT", method: "USD", release: "24시간 지연 릴리즈", level: "Lv.3", trust: 91, trades: 760, featured: true, category: "코인↔통화" },
  { id: 3, seller: "KoreaDesk", coin: "SOL", price: 238000, amount: 340, limit: "1 ~ 340 SOL", method: "VND", release: "친구등록 즉시 릴리즈", level: "Lv.5", trust: 99, trades: 2380, featured: true, category: "코인↔통화" },
  { id: 4, seller: "GlobalUSDT", coin: "USDT", price: 1390, amount: 9800, limit: "1,000 ~ 9,800 USDT", method: "KRW", release: "24시간 지연 릴리즈", level: "Lv.4", trust: 94, trades: 1560, featured: false, category: "코인↔통화" },
  { id: 5, seller: "VNDesk", coin: "USDT", price: 26000, amount: 3000, limit: "100 ~ 3,000 USDT", method: "VND", release: "구매확인 후 자동 릴리즈", level: "Lv.3", trust: 89, trades: 430, featured: false, category: "코인↔통화" },
  { id: 6, seller: "SwapMaster", coin: "BTC", price: 90000000, amount: 2, limit: "0.01 ~ 2 BTC", method: "USDT", release: "코인 교환", level: "Lv.5", trust: 98, trades: 980, featured: false, category: "코인↔코인" },
  { id: 7, seller: "EthDesk", coin: "ETH", price: 4300000, amount: 40, limit: "0.5 ~ 40 ETH", method: "KRW", release: "구매확인 후 자동 릴리즈", level: "Lv.4", trust: 93, trades: 610, featured: false, category: "코인↔통화" },
  { id: 8, seller: "JapanDesk", coin: "USDT", price: 156, amount: 7000, limit: "500 ~ 7,000 USDT", method: "JPY", release: "24시간 지연 릴리즈", level: "Lv.3", trust: 88, trades: 350, featured: false, category: "코인↔통화" },
];

const fakeUsers = Array.from({ length: 100 }, (_, i) => {
  const n = i + 1;
  const parentNo = Math.max(1, Math.ceil(n / 7));
  const receivedRate = n <= 10 ? 50 : n <= 35 ? 45 : n <= 70 ? 40 : 35;
  const childRate = Math.max(10, receivedRate - ((n % 5) + 1));
  return {
    id: `TG-MEMBER-${String(n).padStart(3, "0")}`,
    nickname: `TG유저${String(n).padStart(3, "0")}`,
    email: `user${n}@tetherget.com`,
    wallet: `${String(n).padStart(2, "0")}xA2...${String(9000 + n).slice(-4)}`,
    parent: n <= 7 ? "본사" : `TG-MEMBER-${String(parentNo).padStart(3, "0")}`,
    receivedRate,
    childRate,
    marginRate: receivedRate - childRate,
    trades: 12 + n * 3,
    volume: 10000 + n * 3700,
    children: Math.max(0, 7 - (n % 8)),
    status: n % 9 === 0 ? "주의" : "정상",
    phone: `010-${String(2000 + n).slice(-4)}-${String(7000 + n).slice(-4)}`,
    ip: `52.78.${n % 255}.${(n * 7) % 255}`,
    device: n % 3 === 0 ? "Chrome / Windows" : n % 3 === 1 ? "Safari / iPhone" : "Chrome / Android",
    country: n % 4 === 0 ? "KR" : n % 4 === 1 ? "VN" : n % 4 === 2 ? "US" : "JP",
    riskScore: Math.min(99, 20 + (n % 10) * 7),
    reports: n % 11 === 0 ? 2 : n % 7 === 0 ? 1 : 0,
    blacklist: n % 17 === 0,
    lastLogin: `2026-05-${String((n % 28) + 1).padStart(2, "0")} 14:${String(n % 60).padStart(2, "0")}`,
    joined: `2026-05-${String((n % 28) + 1).padStart(2, "0")}`,
  };
});

const currentAdminProfile = {
  id: "HQ-ADMIN-001",
  nickname: "슈퍼페이지 관리자",
  role: "슈퍼페이지 관리자",
  email: "hq@tetherget.com",
  wallet: "HQxA2...0001",
  permission: "전체 회원 · 전체 거래 · 전체 정산 · 전체 하부트리",
  managedRoot: "본사 전체 트리",
  receivedRate: 100,
  canCreateAdmin: true,
};

const countryFilters = [
  { flag: "🇰🇷", label: "한국", currency: "KRW" },
  { flag: "🇺🇸", label: "미국", currency: "USD" },
  { flag: "🇻🇳", label: "베트남", currency: "VND" },
  { flag: "🇯🇵", label: "일본", currency: "JPY" },
  { flag: "🇨🇳", label: "중국", currency: "CNY" },
];

const languages = [
  { code: "KR", label: "한국어", flag: "🇰🇷" },
  { code: "EN", label: "English", flag: "🇺🇸" },
  { code: "VN", label: "Tiếng Việt", flag: "🇻🇳" },
  { code: "JP", label: "日本語", flag: "🇯🇵" },
  { code: "CN", label: "中文", flag: "🇨🇳" },
];

const translations = {
  KR: {
    menuTrade: "거래", sellRegister: "판매등록", myInfo: "내정보", myTrades: "내 거래", p2p: "P2P", admin: "관리자", support: "고객센터",
    login: "로그인", signup: "회원가입", logout: "로그아웃", connectWallet: "지갑 연결", dashboard: "거래 대시보드", onlyNeeded: "필요한 거래 기능만 표시됩니다.",
    currentLogin: "현재 로그인", role: "권한", manageRoot: "관리 기준", ratePermission: "배분 권한", accountStatus: "계정 상태",
    heroTitle: "위험한 개인거래를\n안전한 시스템으로.", heroBadge: "스마트컨트랙트 에스크로 기반 P2P 거래", heroDesc: "TetherGet은 판매자 코인을 스마트컨트랙트에 예치하고, 구매자 입금 확인 후 자동 릴리즈하는 탈중앙화 P2P 거래 플랫폼입니다.",
    loginJoin: "로그인 / 가입하기", startWallet: "지갑으로 시작하기", beforeTrade: "거래 전 핵심 절차",
    adminTitle: "관리자 하부트리 / 수수료 배분", adminDesc: "상위 회원이 본인 하부를 누르면 가입일, 이메일, 지갑, 거래정보, 하부 리스트를 확인할 수 있습니다.",
    adminStorage: "본인 관리자 저장소", totalVolume: "총 거래량", referralProfit: "총 레퍼럴 수익", withdrawable: "출금 가능액", pendingSettlement: "정산 대기", weeklyProfit: "이번 주 수익", monthlyProfit: "이번 달 수익", managedChildren: "관리 하부 수", withdrawRequest: "출금 신청",
    childList: "내 하부 가입자 리스트", selectedUser: "선택 회원 상세", securityCenter: "본사 보안 / 검증 센터", riskMonitor: "위험 회원 모니터링", blockPolicy: "본사 차단 정책",
    tradeStart: "거래 시작", tradeDetail: "거래 상세 / 신청", tradeRequest: "거래 요청", confirmButton: "확인 버튼", proofUpload: "입금증빙 업로드", close: "닫기",
    seller: "판매자", trust: "신뢰도", availableAmount: "거래 가능 수량", finalReceive: "구매자 최종 수령", buyerFee: "구매자 수수료 1%", expectedPay: "예상 송금액"
  },
  EN: {
    menuTrade: "Trade", sellRegister: "Register Sale", myInfo: "My Info", myTrades: "My Trades", p2p: "P2P", admin: "Admin", support: "Support",
    login: "Login", signup: "Sign up", logout: "Logout", connectWallet: "Connect Wallet", dashboard: "Trading Dashboard", onlyNeeded: "Only essential trading features are shown.",
    currentLogin: "Current Login", role: "Role", manageRoot: "Management Scope", ratePermission: "Rate Permission", accountStatus: "Account Status",
    heroTitle: "Turn risky P2P trades\ninto a safe system.", heroBadge: "Smart-contract escrow based P2P trading", heroDesc: "TetherGet is a decentralized P2P platform where sellers escrow crypto and buyers complete payment verification before release.",
    loginJoin: "Login / Sign up", startWallet: "Start with Wallet", beforeTrade: "Before Trading",
    adminTitle: "Admin Downline / Fee Distribution", adminDesc: "Click a downline member to view join date, email, wallet, trading data, and their own downline list.",
    adminStorage: "Admin Personal Vault", totalVolume: "Total Volume", referralProfit: "Total Referral Profit", withdrawable: "Withdrawable", pendingSettlement: "Pending", weeklyProfit: "Weekly Profit", monthlyProfit: "Monthly Profit", managedChildren: "Managed Downline", withdrawRequest: "Request Withdrawal",
    childList: "My Downline Members", selectedUser: "Selected Member Detail", securityCenter: "HQ Security / Verification Center", riskMonitor: "Risk Monitoring", blockPolicy: "HQ Blocking Policy",
    tradeStart: "Start Trade", tradeDetail: "Trade Detail / Request", tradeRequest: "Request Trade", confirmButton: "Confirm", proofUpload: "Upload Proof", close: "Close",
    seller: "Seller", trust: "Trust", availableAmount: "Available Amount", finalReceive: "Buyer Final Receive", buyerFee: "Buyer Fee 1%", expectedPay: "Expected Payment"
  },
  VN: {
    menuTrade: "Giao dịch", sellRegister: "Đăng bán", myInfo: "Thông tin", myTrades: "GD của tôi", p2p: "P2P", admin: "Quản trị", support: "Hỗ trợ",
    login: "Đăng nhập", signup: "Đăng ký", logout: "Đăng xuất", connectWallet: "Kết nối ví", dashboard: "Bảng giao dịch", onlyNeeded: "Chỉ hiển thị các chức năng cần thiết.",
    currentLogin: "Đang đăng nhập", role: "Quyền", manageRoot: "Phạm vi quản lý", ratePermission: "Quyền chia %", accountStatus: "Trạng thái tài khoản",
    heroTitle: "Biến giao dịch cá nhân rủi ro\nthành hệ thống an toàn.", heroBadge: "Giao dịch P2P escrow bằng smart contract", heroDesc: "TetherGet là nền tảng P2P phi tập trung, người bán ký quỹ crypto và người mua xác nhận thanh toán trước khi giải ngân.",
    loginJoin: "Đăng nhập / Đăng ký", startWallet: "Bắt đầu bằng ví", beforeTrade: "Quy trình trước giao dịch",
    adminTitle: "Quản lý tuyến dưới / Chia phí", adminDesc: "Bấm vào tuyến dưới để xem ngày tham gia, email, ví, dữ liệu giao dịch và danh sách tuyến dưới.",
    adminStorage: "Kho quản trị cá nhân", totalVolume: "Tổng khối lượng", referralProfit: "Lợi nhuận giới thiệu", withdrawable: "Có thể rút", pendingSettlement: "Đang chờ", weeklyProfit: "Lãi tuần", monthlyProfit: "Lãi tháng", managedChildren: "Tuyến dưới", withdrawRequest: "Yêu cầu rút",
    childList: "Danh sách tuyến dưới", selectedUser: "Chi tiết thành viên", securityCenter: "Trung tâm bảo mật HQ", riskMonitor: "Theo dõi rủi ro", blockPolicy: "Chính sách chặn HQ",
    tradeStart: "Bắt đầu", tradeDetail: "Chi tiết / Yêu cầu", tradeRequest: "Yêu cầu GD", confirmButton: "Xác nhận", proofUpload: "Tải bằng chứng", close: "Đóng",
    seller: "Người bán", trust: "Tin cậy", availableAmount: "Số lượng khả dụng", finalReceive: "Người mua nhận", buyerFee: "Phí người mua 1%", expectedPay: "Số tiền chuyển"
  },
  JP: {
    menuTrade: "取引", sellRegister: "販売登録", myInfo: "マイ情報", myTrades: "取引履歴", p2p: "P2P", admin: "管理者", support: "サポート",
    login: "ログイン", signup: "新規登録", logout: "ログアウト", connectWallet: "ウォレット接続", dashboard: "取引ダッシュボード", onlyNeeded: "必要な取引機能のみ表示されます。",
    currentLogin: "現在ログイン", role: "権限", manageRoot: "管理範囲", ratePermission: "配分権限", accountStatus: "アカウント状態",
    heroTitle: "危険な個人取引を\n安全なシステムへ。", heroBadge: "スマートコントラクトエスクロー型P2P取引", heroDesc: "TetherGetは、販売者が暗号資産を預託し、購入者の支払い確認後にリリースする分散型P2P取引プラットフォームです。",
    loginJoin: "ログイン / 登録", startWallet: "ウォレットで開始", beforeTrade: "取引前の流れ",
    adminTitle: "管理者下部ツリー / 手数料配分", adminDesc: "下部会員をクリックすると、加入日、メール、ウォレット、取引情報、下部リストを確認できます。",
    adminStorage: "管理者マイ保管庫", totalVolume: "総取引量", referralProfit: "紹介収益", withdrawable: "出金可能額", pendingSettlement: "精算待ち", weeklyProfit: "週間収益", monthlyProfit: "月間収益", managedChildren: "管理下部数", withdrawRequest: "出金申請",
    childList: "下部会員リスト", selectedUser: "選択会員詳細", securityCenter: "本社セキュリティセンター", riskMonitor: "リスク監視", blockPolicy: "本社遮断ポリシー",
    tradeStart: "取引開始", tradeDetail: "取引詳細 / 申請", tradeRequest: "取引申請", confirmButton: "確認", proofUpload: "証憑アップロード", close: "閉じる",
    seller: "販売者", trust: "信頼度", availableAmount: "取引可能数量", finalReceive: "購入者最終受取", buyerFee: "購入者手数料1%", expectedPay: "予想送金額"
  },
  CN: {
    menuTrade: "交易", sellRegister: "发布出售", myInfo: "我的信息", myTrades: "我的交易", p2p: "P2P", admin: "管理员", support: "客服",
    login: "登录", signup: "注册", logout: "退出", connectWallet: "连接钱包", dashboard: "交易仪表盘", onlyNeeded: "仅显示必要交易功能。",
    currentLogin: "当前登录", role: "权限", manageRoot: "管理范围", ratePermission: "分配权限", accountStatus: "账户状态",
    heroTitle: "把高风险个人交易\n变成安全系统。", heroBadge: "基于智能合约托管的P2P交易", heroDesc: "TetherGet 是去中心化P2P平台，卖家托管加密资产，买家完成付款验证后释放资产。",
    loginJoin: "登录 / 注册", startWallet: "用钱包开始", beforeTrade: "交易前流程",
    adminTitle: "管理员下级树 / 手续费分配", adminDesc: "点击下级会员可查看加入日期、邮箱、钱包、交易数据和下级列表。",
    adminStorage: "管理员个人仓库", totalVolume: "总交易量", referralProfit: "推荐收益", withdrawable: "可提现", pendingSettlement: "待结算", weeklyProfit: "本周收益", monthlyProfit: "本月收益", managedChildren: "管理下级", withdrawRequest: "申请提现",
    childList: "我的下级会员", selectedUser: "会员详情", securityCenter: "总部安全 / 验证中心", riskMonitor: "风险监控", blockPolicy: "总部封禁策略",
    tradeStart: "开始交易", tradeDetail: "交易详情 / 申请", tradeRequest: "申请交易", confirmButton: "确认", proofUpload: "上传凭证", close: "关闭",
    seller: "卖家", trust: "信任度", availableAmount: "可交易数量", finalReceive: "买家最终收到", buyerFee: "买家手续费1%", expectedPay: "预计付款"
  }
};

const I18N_BASE_LOCALE = "KR";
const I18N_REQUIRED_LOCALES = ["EN", "VN", "JP", "CN"];

function getMissingTranslationKeys(baseMap, targetMap) {
  const baseKeys = Object.keys(baseMap || {});
  return baseKeys.filter((key) => typeof targetMap?.[key] !== "string" || !targetMap[key].trim());
}

function validateTranslations() {
  const baseMap = translations[I18N_BASE_LOCALE] || {};
  const reports = I18N_REQUIRED_LOCALES.map((locale) => ({
    locale,
    missing: getMissingTranslationKeys(baseMap, translations[locale]),
  })).filter((item) => item.missing.length > 0);

  if (!reports.length) return;
  const reportText = reports
    .map((item) => `${item.locale}: ${item.missing.length} keys missing`)
    .join(" | ");
  console.warn(`[i18n] Missing translation keys detected -> ${reportText}`);
}

if (typeof window !== "undefined" && import.meta.env.DEV) {
  validateTranslations();
}

const LangContext = createContext(translations.KR);
const LanguageCodeContext = createContext("KR");
function useLang() { return useContext(LangContext); }
function useLanguageCode() { return useContext(LanguageCodeContext); }

const KO_TO_EN_MAP = {
  "거래": "Trade",
  "구매": "Buy",
  "판매": "Sell",
  "신뢰도": "Trust",
  "수수료": "Fee",
  "회원": "Member",
  "계정": "Account",
  "보안": "Security",
  "인증": "Verification",
  "출금": "Withdrawal",
  "정산": "Settlement",
  "하부": "Downline",
  "본사": "HQ",
  "정책": "Policy",
  "승인": "Approved",
  "미승인": "Not approved",
  "대기": "Pending",
  "완료": "Completed",
  "요청": "Request",
  "저장": "Save",
  "조회": "View",
  "검색": "Search",
  "설정": "Settings",
  "로그인": "Login",
  "로그아웃": "Logout",
  "가입": "Sign up",
  "지갑": "Wallet",
  "레퍼럴": "Referral",
  "친구": "Friend",
  "메시지": "Message",
  "알림": "Notice",
  "분쟁": "Dispute",
  "사고": "Incident",
  "신고": "Report",
  "중단": "Stop",
  "확인": "Confirm",
  "증빙": "Proof",
  "입금": "Deposit",
  "예치": "Escrow",
  "릴리즈": "Release",
  "지연": "Delay",
  "즉시": "Instant",
  "기본": "Basic",
  "상세": "Detail",
  "현재": "Current",
  "단계": "Stage",
  "정보": "Info",
  "이전": "Prev",
  "다음": "Next",
  "닫기": "Close",
  "전체": "All",
  "주의": "Caution",
  "정상": "Normal",
  "완전매칭": "Fully matched",
  "거래매칭": "Trade matched",
  "친구요청": "Friend request",
  "입금대기": "Awaiting deposit",
  "증빙확인": "Proof checking",
  "비로그인": "Logged out",
  "슈퍼관리자": "Super Page Admin",
  "본사 슈퍼관리자": "Super Page Admin",
  "아직 연결된 계정 없음": "No linked account yet",
  "거래 대시보드": "Trading Dashboard",
  "판매등록": "Register Sale",
  "내정보": "My Info",
  "내 거래": "My Trades",
  "고객센터": "Support",
  "미연결": "Not connected",
  "미지정": "Not set",
  "미등록": "Not registered",
  "등록 완료": "Registered",
  "등록됨": "Registered",
  "미입력": "Not entered",
  "미제출": "Not submitted",
  "처리중...": "Processing...",
  "조회중...": "Loading...",
  "저장중...": "Saving...",
  "점검중...": "Checking...",
  "동기화중...": "Syncing...",
  "조치중...": "Applying...",
  "새로고침": "Refresh",
  "리포트 조회": "Load Report",
  "기간조회": "Date Range",
  "로그 보기": "View Logs",
  "오류": "Error",
  "안전거래 회원": "Safe-trade member",
  "일반회원": "Member",
  "이메일 계정": "Email account",
  "구글 계정": "Google account",
  "팬텀 지갑": "Phantom wallet",
  "지갑 미연결": "Wallet not connected",
  "출력": "Export",
  "운영": "Operations",
  "복구": "Recovery",
  "감사": "Audit",
  "롤백": "Rollback",
  "비상모드": "Emergency mode",
  "활성화": "Enabled",
  "해제": "Disabled",
  "로그인이 필요합니다.": "Login is required.",
  "유효한 이메일을 입력하세요.": "Enter a valid email.",
  "비밀번호는 6자 이상이어야 합니다.": "Password must be at least 6 characters.",
  "닉네임을 입력하세요.": "Enter a nickname.",
  "비밀번호 확인이 일치하지 않습니다.": "Password confirmation does not match.",
  "회원가입 및 로그인 완료": "Signup and login completed.",
  "로그인 완료": "Login completed.",
  "지갑 연결이 완료되었습니다.": "Wallet connected successfully.",
  "출금 금액을 입력하세요.": "Enter withdrawal amount.",
  "출금 신청이 접수되었습니다. 회사 지갑에서 처리됩니다.": "Withdrawal request submitted. It will be processed from the company wallet.",
  "거래할 수량을 입력하세요.": "Enter trading amount.",
  "삭제된 메시지입니다.": "This message was deleted.",
  "대화 없음": "No conversation",
  "판매중": "Selling",
  "판매 대기": "Sale pending",
  "즉시송금 가능": "Instant transfer available",
  "지연 릴리즈 적용": "Delayed release applied",
  "거래 가능 수량을 초과했습니다.": "Exceeds available trading amount.",
  "구매 수량을 입력하세요.": "Enter purchase amount.",
  "회사 KYC 승인(비공개 보관) 완료 후 거래할 수 있습니다.": "Trading is available after company KYC approval (private storage).",
  "입금자 이름을 입력하세요.": "Enter depositor name.",
  "레벨별 지연시간 및 취소 불가 정책 동의가 필요합니다.": "Agreement to level-based delay and non-cancellation policy is required.",
  "거래 요청 전 확인이 필요합니다.": "Confirmation is required before requesting trade.",
  "먼저 거래 요청을 눌러주세요.": "Please click trade request first.",
  "수량을 다시 확인하세요.": "Please recheck the amount.",
  "판매자 입금자명 일치 확인이 필요합니다.": "Seller depositor-name match confirmation is required.",
  "최종 구매 확인 버튼을 눌러주세요.": "Please click final purchase confirmation.",
  "거래 신청이 최종 확인되었습니다.": "Trade request has been finally confirmed.",
  "입금증빙 업로드 완료": "Deposit proof uploaded.",
  "전체 거래 리스트": "Full trade list",
  "은행계좌 등록 완료": "Bank account registration completed.",
  "은행계좌 등록됨": "Bank account registered",
  "은행계좌 등록": "Register bank account",
  "추천인 코드 형식이 올바르지 않습니다.": "Referral code format is invalid.",
  "내 추천인 코드가 저장되었습니다.": "My referral code has been saved.",
  "추천인 코드가 복사되었습니다.": "Referral code copied.",
  "추천 링크가 복사되었습니다.": "Referral link copied.",
  "복사에 실패했습니다.": "Copy failed.",
  "링크 복사에 실패했습니다.": "Failed to copy link.",
  "카테고리를 선택하세요.": "Select a category.",
  "하부 열기": "Open downline",
  "권한 변경": "Change role",
  "거래정지": "Suspend trading",
  "KYC 승인": "Approve KYC",
  "분쟁 새로고침": "Refresh disputes",
  "리스크 점검": "Risk check",
  "카테고리 열기": "Open category",
  "처리 완료": "Completed",
  "점검 완료": "Check completed",
  "관리자 권한이 필요합니다.": "Admin permission is required.",
  "지정 승인자만 결재할 수 있습니다.": "Only designated approvers can approve.",
  "메인 관리자 최종승인 계정만 반환 확정할 수 있습니다.": "Only the main admin final-approval account can confirm return.",
  "구글 로그인 완료": "Google login completed.",
  "구글 계정에 지갑 추가 완료": "Wallet added to Google account.",
  "지갑 로그인 완료": "Wallet login completed.",
  "팬텀 계정에 지메일 추가 완료": "Gmail added to Phantom account.",
  "지갑이 연결되어 있습니다.": "Wallet is connected.",
  "다른 P2P 거래 카테고리는 상단 리스트로 확장 예정입니다.": "Additional P2P trade categories will be expanded in the top list.",
  "기간조회 기능 실행": "Running date-range query.",
  "지메일 추가 연결 완료": "Additional Gmail link completed.",
  "팬텀 지갑 추가 연결 완료": "Additional Phantom wallet link completed.",
  "신분증 파일과 계좌증빙 파일을 모두 선택하세요.": "Select both ID file and bank proof file.",
  "KYC 서류 제출 완료 · 회사 심사대기": "KYC document submitted · waiting for company review.",
  "기간 필터를 초기화했습니다.": "Date filter has been reset.",
  "슈퍼관리자 권한이 필요합니다.": "Super Page permission is required.",
  "유효한 배분율을 입력하세요.": "Enter a valid distribution rate.",
  "인증 토큰이 없습니다. 다시 로그인하세요.": "No auth token found. Please log in again.",
  "열람 사유를 5자 이상 입력하세요.": "Enter a viewing reason of at least 5 characters.",
  "열람 요청이 생성되었습니다. 관리자 2인 승인 후 열람 가능합니다.": "View request created. Available after approval by 2 admins.",
  "열람 요청 승인 처리되었습니다.": "View request approved.",
  "열람 요청이 반려 처리되었습니다.": "View request rejected.",
  "내보낼 타임라인 데이터가 없습니다.": "No timeline data to export.",
  "타임라인 CSV를 내보냈습니다.": "Timeline CSV exported.",
  "스냅샷 사유를 5자 이상 입력하세요.": "Enter a snapshot reason of at least 5 characters.",
  "운영 스냅샷이 생성되었습니다.": "Operations snapshot created.",
  "롤백할 스냅샷을 선택하세요.": "Select a snapshot to roll back.",
  "롤백 사유를 5자 이상 입력하세요.": "Enter a rollback reason of at least 5 characters.",
  "확인문구 ROLLBACK을 정확히 입력해야 실행됩니다.": "Execution requires exact input of confirmation phrase ROLLBACK.",
  "롤백 실행이 완료되었습니다.": "Rollback completed.",
  "분쟁 목록을 새로고침했습니다.": "Dispute list refreshed.",
  "운영 리스크를 점검합니다.": "Checking operational risks.",
  "관리자": "Admin",
  "고객센터 / 사고신고": "Support / Incident Report",
  "피싱, 사기, 송금오류, 증빙문제 발생 시 신고 접수 후 필요한 범위의 정보를 제공합니다.": "Report phishing, fraud, transfer errors, or proof issues. We provide information within the required scope after filing.",
  "신고 내용 입력": "Enter report details",
  "사고신고 접수": "Submit Incident Report",
  "사고신고가 접수되었습니다.": "Incident report submitted.",
  "거래한도": "Trade limit",
  "방식": "Method",
  "코인↔통화": "Coin↔Fiat",
  "코인↔코인": "Coin↔Coin",
  "구매확인 후 자동 릴리즈": "Auto release after buy confirmation",
  "24시간 지연 릴리즈": "24-hour delayed release",
  "친구등록 즉시 릴리즈": "Instant release after friend registration",
  "코인 교환": "Coin swap",
  "판매자 확인 공지": "Seller confirmation notice",
  "구매자 인증 상태": "Buyer verification status",
  "레벨별 지연시간 및 취소 정책": "Level-based delay and cancellation policy",
  "현재 등급": "Current level",
  "지연시간": "Delay time",
  "즉시 처리": "Immediate",
  "시간": "hours",
  "구매 요청 후 위 지연시간이 종료되기 전에는 취소할 수 없습니다. (분쟁 신고 절차 제외)": "After requesting purchase, cancellation is not allowed until the delay time ends. (Except dispute reporting process)",
  "지연시간 및 취소 불가 안내를 확인했습니다.": "I have reviewed the delay-time and non-cancellable policy.",
  "입금자 이름과 예금주가 일치함을 확인했을 때만 확인 버튼을 누르겠습니다.": "I will click confirm only after verifying the depositor name matches the account holder.",
  "코인 판매자는 구매자의 입금자 이름을 사전에 확인하고, 실제 입금 내역의 예금주와 일치할 때만 송금 확인 버튼을 눌러야 합니다. 이름 불일치 상태에서 확인 시 사고 책임이 발생할 수 있습니다.": "Coin sellers must verify the buyer's depositor name in advance and click transfer confirmation only when it matches the actual account holder in the deposit record. Confirming with mismatched names may result in liability.",
  "판매자는 반드시 실제 입금 여부를 직접 확인한 후 확인 버튼을 눌러야 하며, 잘못된 확인·사기·피싱·계정 탈취·제3자 사칭 등으로 인한 손실에 대해 플랫폼은 관련 법령상 책임 범위를 제외하고 책임지지 않습니다.": "The seller must verify the actual deposit before clicking confirm. The platform is not liable for losses caused by incorrect confirmation, fraud, phishing, account takeover, or third-party impersonation, except where required by law.",
  "구매 수량 입력": "Purchase amount",
  "입금자 이름 (예금주)": "Depositor name (account holder)",
  "실제 송금 예금주명을 입력하세요": "Enter the actual account holder name for transfer",
  "중단/분쟁 신고": "Stop/Report dispute",
  "최종적으로 구매하시겠습니까?": "Do you want to finalize this purchase?",
  "최종 구매": "Finalize Purchase",
};

const KO_TO_VN_MAP = {
  "거래": "Giao dịch",
  "구매": "Mua",
  "판매": "Bán",
  "관리자": "Quản trị",
  "회원": "Thành viên",
  "보안": "Bảo mật",
  "출금": "Rút tiền",
  "지갑": "Ví",
  "레퍼럴": "Giới thiệu",
  "친구": "Bạn bè",
  "메시지": "Tin nhắn",
  "분쟁": "Tranh chấp",
  "신고": "Báo cáo",
  "확인": "Xác nhận",
  "입금": "Chuyển tiền",
  "예치": "Ký quỹ",
  "릴리즈": "Giải ngân",
  "지연": "Trì hoãn",
  "즉시": "Ngay",
  "현재": "Hiện tại",
  "정보": "Thông tin",
  "이전": "Trước",
  "다음": "Sau",
  "닫기": "Đóng",
  "전체": "Tất cả",
  "주의": "Cảnh báo",
  "정상": "Bình thường",
  "완전매칭": "Ghép hoàn toàn",
  "거래매칭": "Ghép giao dịch",
  "친구요청": "Yêu cầu kết bạn",
  "입금대기": "Chờ nạp tiền",
  "증빙확인": "Đang kiểm tra chứng từ",
  "비로그인": "Chưa đăng nhập",
  "슈퍼관리자": "Siêu quản trị",
  "미연결": "Chưa kết nối",
  "미등록": "Chưa đăng ký",
  "미입력": "Chưa nhập",
  "미제출": "Chưa nộp",
  "조회중...": "Đang tải...",
  "처리중...": "Đang xử lý...",
  "새로고침": "Làm mới",
  "기간조회": "Tra cứu theo kỳ",
  "오류": "Lỗi",
};

const KO_TO_JP_MAP = {
  "거래": "取引",
  "구매": "購入",
  "판매": "販売",
  "관리자": "管理者",
  "회원": "会員",
  "보안": "セキュリティ",
  "출금": "出金",
  "지갑": "ウォレット",
  "레퍼럴": "紹介",
  "친구": "友だち",
  "메시지": "メッセージ",
  "분쟁": "紛争",
  "신고": "通報",
  "확인": "確認",
  "입금": "入金",
  "예치": "預託",
  "릴리즈": "リリース",
  "지연": "遅延",
  "즉시": "即時",
  "현재": "現在",
  "정보": "情報",
  "이전": "前へ",
  "다음": "次へ",
  "닫기": "閉じる",
  "전체": "全体",
  "주의": "注意",
  "정상": "正常",
  "완전매칭": "完全マッチ",
  "거래매칭": "取引マッチ",
  "친구요청": "友だち申請",
  "입금대기": "入金待ち",
  "증빙확인": "証憑確認中",
  "비로그인": "未ログイン",
  "슈퍼관리자": "スーパー管理者",
  "미연결": "未接続",
  "미등록": "未登録",
  "미입력": "未入力",
  "미제출": "未提出",
  "조회중...": "読み込み中...",
  "처리중...": "処理中...",
  "새로고침": "更新",
  "기간조회": "期間照会",
  "오류": "エラー",
};

const KO_TO_CN_MAP = {
  "거래": "交易",
  "구매": "购买",
  "판매": "出售",
  "관리자": "管理员",
  "회원": "会员",
  "보안": "安全",
  "출금": "提现",
  "지갑": "钱包",
  "레퍼럴": "推荐",
  "친구": "好友",
  "메시지": "消息",
  "분쟁": "争议",
  "신고": "举报",
  "확인": "确认",
  "입금": "入金",
  "예치": "托管",
  "릴리즈": "释放",
  "지연": "延迟",
  "즉시": "即时",
  "현재": "当前",
  "정보": "信息",
  "이전": "上一个",
  "다음": "下一个",
  "닫기": "关闭",
  "전체": "全部",
  "주의": "警告",
  "정상": "正常",
  "완전매칭": "完全匹配",
  "거래매칭": "交易匹配",
  "친구요청": "好友请求",
  "입금대기": "等待入金",
  "증빙확인": "凭证确认中",
  "비로그인": "未登录",
  "슈퍼관리자": "超级管理员",
  "미연결": "未连接",
  "미등록": "未注册",
  "미입력": "未输入",
  "미제출": "未提交",
  "조회중...": "加载中...",
  "처리중...": "处理中...",
  "새로고침": "刷新",
  "기간조회": "按期间查询",
  "오류": "错误",
};

const KO_TO_LOCALE_MAPS = {
  EN: KO_TO_EN_MAP,
  VN: { ...KO_TO_EN_MAP, ...KO_TO_VN_MAP },
  JP: { ...KO_TO_EN_MAP, ...KO_TO_JP_MAP },
  CN: { ...KO_TO_EN_MAP, ...KO_TO_CN_MAP },
};

function buildLocalePhraseMap(language) {
  if (language === "KR") return {};
  const kr = translations.KR || {};
  const target = translations[language] || {};
  return Object.keys(kr).reduce((acc, key) => {
    const koText = kr[key];
    const targetText = target[key];
    if (typeof koText === "string" && typeof targetText === "string" && koText.trim() && targetText.trim()) {
      acc[koText] = targetText;
    }
    return acc;
  }, {});
}

function localizeLoose(text, language) {
  if (typeof text !== "string" || language === "KR") return text;
  const originalText = text;
  const localeMap = {
    ...KO_TO_LOCALE_MAPS[language],
    ...buildLocalePhraseMap(language),
  };
  let output = text;
  const sortedEntries = Object.entries(localeMap).sort((a, b) => b[0].length - a[0].length);
  for (const [ko, en] of sortedEntries) {
    output = output.split(ko).join(en);
  }
  // Hard guard: for non-KR UI, do not allow remaining Hangul glyphs.
  output = output.replace(/[ㄱ-ㅎㅏ-ㅣ가-힣]+/g, " ").replace(/\s{2,}/g, " ").trim();
  if (!output && /[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(originalText)) {
    if (language === "JP") return "未翻訳";
    if (language === "CN") return "未翻译";
    if (language === "VN") return "Chua dich";
    return "Untranslated";
  }
  return sanitizeBrokenText(output, language);
}

function sanitizeBrokenText(input, language) {
  let cleaned = String(input || "");
  // remove mojibake replacement glyphs and control chars except newline/tab
  cleaned = cleaned.replace(/\uFFFD+/g, " ").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ");
  cleaned = cleaned.normalize("NFC").replace(/\s{2,}/g, " ").trim();
  if (!cleaned) {
    if (language === "JP") return "未翻訳";
    if (language === "CN") return "未翻译";
    if (language === "VN") return "Chua dich";
    if (language === "EN") return "Untranslated";
  }
  return cleaned;
}

function applyDomLocalization(root, language, originalTextMap) {
  if (!root || typeof document === "undefined") return;
  const shouldTranslate = language !== "KR";
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current;
  while ((current = walker.nextNode())) {
    const nodeValue = current.nodeValue || "";
    if (!nodeValue.trim()) continue;
    const parentTag = current.parentElement?.tagName;
    if (parentTag === "SCRIPT" || parentTag === "STYLE") continue;
    if (!originalTextMap.has(current)) {
      originalTextMap.set(current, nodeValue);
    }
    const source = originalTextMap.get(current) || nodeValue;
    current.nodeValue = shouldTranslate ? localizeLoose(source, language) : source;
  }

  const attrTargets = root.querySelectorAll("[placeholder], [title], [aria-label]");
  attrTargets.forEach((el) => {
    const attrs = ["placeholder", "title", "aria-label"];
    attrs.forEach((attr) => {
      const value = el.getAttribute(attr);
      if (value == null || !value.trim()) return;
      const key = `data-i18n-original-${attr}`;
      if (!el.getAttribute(key)) {
        el.setAttribute(key, value);
      }
      const source = el.getAttribute(key) || value;
      el.setAttribute(attr, shouldTranslate ? localizeLoose(source, language) : source);
    });
  });
}

const trades = [
  { id: "TG-24001", type: "구매", coin: "USDT", amount: 500, status: "입금대기", time: "2026-05-07 08:20" },
  { id: "TG-23998", type: "판매", coin: "USDT", amount: 1200, status: "증빙확인", time: "2026-05-06 22:14" },
  { id: "TG-23991", type: "구매", coin: "SOL", amount: 12, status: "완료", time: "2026-05-06 19:02" },
];

const instantReleasePolicyText =
  "판매자는 반드시 실제 입금 여부를 직접 확인한 후 확인 버튼을 눌러야 하며, 잘못된 확인·사기·피싱·계정 탈취·제3자 사칭 등으로 인한 손실에 대해 플랫폼은 관련 법령상 책임 범위를 제외하고 책임지지 않습니다.";
const defaultSellerDepositNotice =
  "코인 판매자는 구매자의 입금자 이름을 사전에 확인하고, 실제 입금 내역의 예금주와 일치할 때만 송금 확인 버튼을 눌러야 합니다. 이름 불일치 상태에서 확인 시 사고 책임이 발생할 수 있습니다.";

const initialFriends = [
  {
    id: "FR-001",
    nickname: "코인헌터",
    level: "Lv.5",
    status: "완전매칭",
    online: true,
    unread: 2,
    instantRelease: true,
    delayedRelease: false,
    selling: true,
    sellAmount: 1200,
    sellCoin: "USDT",
    sellPrice: 1392,
    sellCurrency: "KRW",
  },
  {
    id: "FR-002",
    nickname: "SafePartner",
    level: "Lv.4",
    status: "거래매칭",
    online: true,
    unread: 1,
    instantRelease: true,
    delayedRelease: false,
    selling: true,
    sellAmount: 800,
    sellCoin: "USDT",
    sellPrice: 1394,
    sellCurrency: "KRW",
  },
  {
    id: "FR-003",
    nickname: "신규요청회원",
    level: "Lv.2",
    status: "친구요청",
    online: false,
    unread: 0,
    instantRelease: false,
    delayedRelease: true,
    selling: false,
    sellAmount: 0,
    sellCoin: "USDT",
    sellPrice: 0,
    sellCurrency: "KRW",
  },
  {
    id: "FR-004",
    nickname: "USDT마스터",
    level: "Lv.3",
    status: "거래매칭",
    online: true,
    unread: 3,
    instantRelease: true,
    delayedRelease: false,
    selling: true,
    sellAmount: 650,
    sellCoin: "USDT",
    sellPrice: 1391,
    sellCurrency: "KRW",
  },
  {
    id: "FR-005",
    nickname: "KRW데스크",
    level: "Lv.4",
    status: "완전매칭",
    online: false,
    unread: 0,
    instantRelease: true,
    delayedRelease: false,
    selling: true,
    sellAmount: 2000,
    sellCoin: "USDT",
    sellPrice: 1390,
    sellCurrency: "KRW",
  },
  {
    id: "FR-006",
    nickname: "베트남파트너",
    level: "Lv.2",
    status: "친구요청",
    online: true,
    unread: 1,
    instantRelease: false,
    delayedRelease: true,
    selling: false,
    sellAmount: 0,
    sellCoin: "USDT",
    sellPrice: 0,
    sellCurrency: "VND",
  },
  {
    id: "FR-007",
    nickname: "BTC브로커",
    level: "Lv.5",
    status: "완전매칭",
    online: true,
    unread: 4,
    instantRelease: true,
    delayedRelease: false,
    selling: true,
    sellAmount: 2,
    sellCoin: "BTC",
    sellPrice: 90000000,
    sellCurrency: "KRW",
  },
  {
    id: "FR-008",
    nickname: "ETH센터",
    level: "Lv.3",
    status: "거래매칭",
    online: false,
    unread: 0,
    instantRelease: true,
    delayedRelease: false,
    selling: true,
    sellAmount: 25,
    sellCoin: "ETH",
    sellPrice: 4300000,
    sellCurrency: "KRW",
  },
  {
    id: "FR-009",
    nickname: "솔라파트너",
    level: "Lv.4",
    status: "거래매칭",
    online: true,
    unread: 2,
    instantRelease: true,
    delayedRelease: false,
    selling: true,
    sellAmount: 120,
    sellCoin: "SOL",
    sellPrice: 238000,
    sellCurrency: "KRW",
  },
  {
    id: "FR-010",
    nickname: "신규거래회원",
    level: "Lv.1",
    status: "친구요청",
    online: false,
    unread: 0,
    instantRelease: false,
    delayedRelease: true,
    selling: false,
    sellAmount: 0,
    sellCoin: "USDT",
    sellPrice: 0,
    sellCurrency: "KRW",
  },
];

const initialChatRooms = {
  "FR-001": [
    { id: "FR-001-MSG-1", sender: "friend", text: "입금 확인되면 바로 진행해드릴게요.", deleted: false, createdAt: "19:40" },
    { id: "FR-001-MSG-2", sender: "me", text: "네, 지금 송금 중입니다.", deleted: false, createdAt: "19:42" },
  ],
  "FR-002": [
    { id: "FR-002-MSG-1", sender: "friend", text: "오늘 KRW 환율 좋습니다.", deleted: false, createdAt: "18:05" },
    { id: "FR-002-MSG-2", sender: "me", text: "좋아요. 500 USDT 거래할게요.", deleted: false, createdAt: "18:09" },
  ],
  "FR-003": [
    { id: "FR-003-MSG-1", sender: "friend", text: "친구 승인 부탁드립니다.", deleted: false, createdAt: "17:28" },
  ],
  "FR-004": [
    { id: "FR-004-MSG-1", sender: "friend", text: "빠른 거래 가능합니다.", deleted: false, createdAt: "16:22" },
  ],
  "FR-005": [
    { id: "FR-005-MSG-1", sender: "friend", text: "대량 거래도 처리 가능합니다.", deleted: false, createdAt: "15:11" },
  ],
  "FR-006": [
    { id: "FR-006-MSG-1", sender: "friend", text: "친구 승인 대기 중입니다.", deleted: false, createdAt: "14:05" },
  ],
  "FR-007": [
    { id: "FR-007-MSG-1", sender: "friend", text: "BTC 오늘 변동성 큽니다.", deleted: false, createdAt: "13:40" },
  ],
  "FR-008": [
    { id: "FR-008-MSG-1", sender: "friend", text: "ETH 매도 가능 수량 있습니다.", deleted: false, createdAt: "12:58" },
  ],
  "FR-009": [
    { id: "FR-009-MSG-1", sender: "friend", text: "SOL 즉시 체결 가능해요.", deleted: false, createdAt: "11:24" },
  ],
  "FR-010": [
    { id: "FR-010-MSG-1", sender: "friend", text: "먼저 친구 요청 확인 부탁드립니다.", deleted: false, createdAt: "10:09" },
  ],
};

const AUTH_TOKEN_KEY = "tetherget_auth_token_v1";
const AUTH_REFRESH_TOKEN_KEY = "tetherget_refresh_token_v1";
const MY_REFERRAL_CODE_KEY = "tetherget_my_referral_code_v1";
const LOGIN_RECENT_IDS_KEY = "tetherget_login_recent_ids_v1";
/** API 토큰 없이 로컬 테스트로 로그인한 세션 (새로고침 유지). JWT 로그인 시 삭제 */
const LOCAL_SESSION_KEY = "tetherget_local_session_v1";
/** 초기 화면(홈) 상태 저장 — 화면 1 = 거래 메인 */
const TG_MAIN_SCREEN_KEY = "tg_ui_home_screen_v1";
/** 데모 기록 초기화 시 Admin 목업·가상 하부 데이터 동기화 (`REGISTRY_STORAGE_KEY`는 건드리지 않음) */
const TG_DEMO_RECORDS_RESET_EVENT = "tetherget-demo-records-reset";
/** 로그인 이메일 자동저장 기록 (비밀번호는 저장하지 않음) */
const TG_LOGIN_EMAIL_HISTORY_KEY = "tg_login_email_history_v1";
const TG_LOGIN_REMEMBER_EMAIL_KEY = "tg_login_remember_email_v1";
/** 관리자 목업 회원관리용 가상 하부 회원 수 */
const VIRTUAL_DOWNLINE_MEMBER_COUNT = 300;

function readLoginEmailHistory() {
  try {
    const raw = localStorage.getItem(TG_LOGIN_EMAIL_HISTORY_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((e) => typeof e === "string" && e.includes("@")) : [];
  } catch {
    return [];
  }
}

function readLoginRememberEmailPref() {
  return localStorage.getItem(TG_LOGIN_REMEMBER_EMAIL_KEY) === "1";
}

function decodeJwtPayload(token) {
  if (!token || typeof token !== "string") return null;
  try {
    const body = token.split(".")[1];
    if (!body) return null;
    const json = atob(body.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

const API_BASE = resolveApiBase(import.meta.env.VITE_API_BASE, import.meta.env.DEV);
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

function mapAuthUserToMember(user, index) {
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
  };
}

/**
 * 가상 하부는 항상 `VIRTUAL_DOWNLINE_MEMBER_COUNT`(300)명.
 * 회원 **ID는 항상 `VD-001` ~ `VD-300` 고정** — 초기화·상위(owner)만 바뀌고 번호 체계는 유지.
 * (stageBuckets size 합 = 300이어야 하며, 합이 300 미만이면 루프로 보충, 초과 시 잘라냄)
 */
function createVirtualDownlineUsers(ownerId) {
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
      });
    }
  }
  let fillLevel = 3;
  while (users.length < targetCount) {
    const n = cursor++;
    if (n > targetCount) break;
    const stageName = `LEVEL ${fillLevel}`;
    fillLevel = fillLevel >= 10 ? 3 : fillLevel + 1;
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
    });
  }
  if (users.length > targetCount) {
    return users.slice(0, targetCount);
  }
  return users;
}

/** 화면 바탕은 다크 / 라이트(백진주) 두 가지만 제공 */
const themeMap = {
  dark: {
    name: "다크",
    page: "bg-slate-950",
    header: "bg-slate-950 border-slate-800 text-white",
    card: "bg-slate-900 border-slate-800 text-white",
    cardSoft: "bg-slate-800 text-white",
    headerControl: "bg-slate-800 border-slate-700 text-white",
    popover: "bg-slate-900 border-slate-700 text-white",
    input: "bg-slate-800 border-slate-700 text-white placeholder:text-slate-400",
    main: "bg-white text-slate-950",
    /** 보조 텍스트가 theme.main(흰색 버튼 등) 위에 올 때 */
    mutedOnMain: "text-slate-600",
    /** 카드 내 강조 숫자·본문 */
    statValue: "text-white",
    subtext: "text-slate-300",
    muted: "text-slate-400",
  },
  light: {
    name: "백진주",
    page: "bg-[#eceae6]",
    header: "bg-[#f3f0ea] border-stone-300 text-slate-950",
    card: "bg-[#f3f0ea] border-stone-300 text-slate-950",
    cardSoft: "bg-stone-50 text-slate-950",
    headerControl: "bg-[#ebe8e2] border-stone-300 text-slate-950",
    popover: "bg-white border-slate-200 text-slate-950",
    input: "bg-white border-slate-300 text-slate-950 placeholder:text-slate-500",
    main: "bg-blue-600 text-white",
    mutedOnMain: "text-blue-100",
    statValue: "text-slate-950",
    subtext: "text-slate-800",
    muted: "text-slate-600",
  },
};

function number(v) {
  return new Intl.NumberFormat("ko-KR").format(Math.round(v || 0));
}

/** 서버 미연동·오류 시 사용하는 내장 시세 (server/market/priceFeedCore.js 폴백과 동일 수치). */
const STATIC_MARKET_PRICES = {
  fiatRates: {
    USDT: { KRW: 1392, USD: 1, VND: 26000, JPY: 156 },
    SOL: { KRW: 238000, USD: 171, VND: 4446000, JPY: 26600 },
    BTC: { KRW: 90000000, USD: 64700, VND: 1682200000, JPY: 10090000 },
    ETH: { KRW: 4300000, USD: 3090, VND: 80340000, JPY: 482000 },
  },
  coinRates: {
    USDT: { USDT: 1, SOL: 0.0058, BTC: 0.000015, ETH: 0.00032 },
    SOL: { USDT: 171, SOL: 1, BTC: 0.0026, ETH: 0.055 },
    BTC: { USDT: 64700, SOL: 378, BTC: 1, ETH: 20.9 },
    ETH: { USDT: 3090, SOL: 18, BTC: 0.048, ETH: 1 },
  },
};

function getMarketRate(sellAsset, receiveAsset, receiveType, snapshot) {
  const fiatRates = snapshot?.fiatRates ?? STATIC_MARKET_PRICES.fiatRates;
  const coinRates = snapshot?.coinRates ?? STATIC_MARKET_PRICES.coinRates;
  if (receiveType === "통화") return fiatRates[sellAsset]?.[receiveAsset] || 0;
  return coinRates[sellAsset]?.[receiveAsset] || 0;
}

function rateText(value, receiveAsset, receiveType) {
  if (receiveType === "통화") return `${number(value)} ${receiveAsset}`;
  return `${value} ${receiveAsset}`;
}

function notificationTypeBadgeClass(kind) {
  switch (kind) {
    case "message":
      return "bg-emerald-500/15 text-emerald-200";
    case "trade_request":
    case "trade_status":
    case "approval_request":
    case "release_request":
      return "bg-sky-500/15 text-sky-200";
    case "deposit_confirm":
      return "bg-amber-500/15 text-amber-200";
    case "admin_notice":
      return "bg-violet-500/15 text-violet-200";
    case "dispute":
    case "settlement_request":
      return "bg-rose-500/15 text-rose-200";
    case "security":
      return "bg-red-500/15 text-red-200";
    case "system":
      return "bg-cyan-500/15 text-cyan-200";
    case "grade_notice":
      return "bg-fuchsia-500/15 text-fuchsia-200";
    default:
      return "bg-white/10 text-white/70";
  }
}

/** 헤더 거래푸시 드롭다운 */
function TradePushPanel({ theme: t, items, readIds, setReadIds, onNavigateToTarget }) {
  function markAllTradeRead() {
    setReadIds((prev) => [...new Set([...prev, ...items.map((x) => x.id)])]);
  }
  return (
    <>
      <div className="mb-2 flex items-center justify-between gap-2 border-b border-white/10 pb-2">
        <div className="min-w-0">
          <div className="truncate text-xs font-black tracking-tight">거래 푸시</div>
          <div className={`truncate text-[10px] ${t.muted}`}>요청·승인·입금·릴리즈·분쟁·정산</div>
        </div>
        <button
          type="button"
          className={`shrink-0 rounded-lg px-2 py-1 text-[10px] font-bold ${t.muted} hover:bg-white/5`}
          onClick={markAllTradeRead}
        >
          모두 읽음
        </button>
      </div>
      <ul className="max-h-[min(70vh,19rem)] space-y-1 overflow-auto pr-0.5">
        {items.length === 0 ? (
          <li className={`rounded-lg border border-dashed px-3 py-6 text-center text-[11px] ${t.muted}`}>거래 알림이 없습니다.</li>
        ) : (
          items.map((item) => {
            const read = readIds.includes(item.id);
            return (
              <li
                key={item.id}
                className={`rounded-lg border px-2.5 py-2 ${
                  read ? `border-white/5 opacity-75 ${t.muted}` : `border-sky-500/25 bg-sky-500/[0.06] ${t.input}`
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="truncate font-mono text-[10px] font-bold text-white/90">{item.tradeRef}</span>
                  <span className={`shrink-0 text-[10px] tabular-nums ${t.muted}`}>{item.at}</span>
                </div>
                <div className="mt-1">
                  <span className={`inline-flex rounded px-1.5 py-0.5 text-[9px] font-black ${notificationTypeBadgeClass(item.kind)}`}>
                    {item.requestKind || item.typeLabel}
                  </span>
                </div>
                <div className="mt-1 text-[11px] font-black leading-snug">{item.title}</div>
                <div className={`mt-0.5 line-clamp-2 text-[10px] leading-snug ${read ? t.muted : t.subtext}`}>{item.body}</div>
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    className="rounded-md bg-emerald-600/90 px-2.5 py-1 text-[10px] font-black text-white hover:bg-emerald-600"
                    onClick={() => {
                      setReadIds((prev) => (prev.includes(item.id) ? prev : [...prev, item.id]));
                      onNavigateToTarget(item.target);
                    }}
                  >
                    바로가기
                  </button>
                </div>
              </li>
            );
          })
        )}
      </ul>
    </>
  );
}

/** 헤더 일반 알림 드롭다운 (메시지·공지·시스템 등) */
function GeneralAlertPanel({ theme: t, notifications, readIds, setReadIds, onNavigateToTarget }) {
  function markAllGeneralRead() {
    setReadIds((prev) => [...new Set([...prev, ...notifications.map((x) => x.id)])]);
  }
  return (
    <>
      <div className="mb-2 flex items-center justify-between gap-2 border-b border-white/10 pb-2">
        <div className="min-w-0">
          <div className="truncate text-xs font-black tracking-tight">알림</div>
          <div className={`truncate text-[10px] ${t.muted}`}>메시지·공지·시스템·보안·등급</div>
        </div>
        <button
          type="button"
          className={`shrink-0 rounded-lg px-2 py-1 text-[10px] font-bold ${t.muted} hover:bg-white/5`}
          onClick={markAllGeneralRead}
        >
          모두 읽음
        </button>
      </div>
      <ul className="max-h-[min(70vh,19rem)] space-y-1 overflow-auto pr-0.5">
        {notifications.length === 0 ? (
          <li className={`rounded-lg border border-dashed px-3 py-6 text-center text-[11px] ${t.muted}`}>알림이 없습니다.</li>
        ) : (
          notifications.map((item) => {
            const read = readIds.includes(item.id);
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => {
                    setReadIds((prev) => (prev.includes(item.id) ? prev : [...prev, item.id]));
                    onNavigateToTarget(item.target);
                  }}
                  className={`w-full rounded-lg border px-2.5 py-2 text-left transition ${
                    read
                      ? `border-white/5 opacity-70 ${t.muted}`
                      : `border-emerald-500/25 bg-emerald-500/[0.06] ring-1 ring-emerald-500/20 ${t.input}`
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className={`inline-flex shrink-0 rounded px-1.5 py-0.5 text-[9px] font-black ${notificationTypeBadgeClass(item.kind)}`}>
                      {item.typeLabel}
                    </span>
                    <span className={`shrink-0 text-[10px] tabular-nums ${t.muted}`}>{item.at}</span>
                  </div>
                  <div className="mt-1 text-[11px] font-black leading-snug">{item.title}</div>
                  <div className={`mt-0.5 line-clamp-2 text-[10px] leading-snug ${read ? t.muted : t.subtext}`}>{item.body}</div>
                </button>
              </li>
            );
          })
        )}
      </ul>
    </>
  );
}

/** JWT/API가 비어 role(Member/user)·영문 값만 줄어도 시드 병합·JWT 덮어쓰기 적용되도록 */
function isPlainMemberLegacyRole(role) {
  const r = String(role ?? "").trim();
  if (!r) return true;
  if (r === "회원") return true;
  const lower = r.toLowerCase();
  if (lower === "member" || lower === "members") return true;
  if (lower === "user" || lower === "users") return true;
  if (lower === "customer") return true;
  return false;
}

/**
 * 로컬 세션 병합 포함 — 세션 프로필 단일 진실 원천 (헤더 네비 표시와 관리자 진입 판별을 동일하게).
 */
function computeSessionProfileSnapshot(loggedIn, currentRole, linkedGoogle, meAuthUser, authToken) {
  let legacyRole = currentRole;
  let sessionRoleHint = null;
  let salesLevel = null;
  if (loggedIn && linkedGoogle) {
    try {
      const raw = localStorage.getItem(LOCAL_SESSION_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        const em = String(s.email || "").trim().toLowerCase();
        const lg = String(linkedGoogle || "").trim().toLowerCase();
        if (em && lg && em === lg) {
          sessionRoleHint = s.session_role ?? null;
          if (s.sales_level != null && Number.isFinite(Number(s.sales_level))) {
            salesLevel = Number(s.sales_level);
          }
          const savedRole = String(s.role || "").trim();
          if (savedRole && isPlainMemberLegacyRole(legacyRole)) legacyRole = savedRole;
        }
      }
    } catch {
      /* ignore */
    }
  }
  /** 서버 발급 JWT — 로컬 세션 삭제 후에도 session_role·role 반영 (관리자 진입 판정) */
  if (loggedIn && linkedGoogle && authToken) {
    try {
      const payload = decodeJwtPayload(authToken);
      const pe = String(payload?.email || "").trim().toLowerCase();
      const lg = String(linkedGoogle || "").trim().toLowerCase();
      if (payload && pe && lg && pe === lg) {
        const jwtNorm = normalizeSessionRoleHint(payload.session_role);
        if (jwtNorm === SESSION_ROLE.SALES || jwtNorm === SESSION_ROLE.HQ_OPS) {
          const prevNorm = normalizeSessionRoleHint(sessionRoleHint);
          if (
            prevNorm == null
            || prevNorm === SESSION_ROLE.USER
            || (prevNorm !== SESSION_ROLE.SALES && prevNorm !== SESSION_ROLE.HQ_OPS)
          ) {
            sessionRoleHint = payload.session_role ?? null;
          }
        }
        const pr = String(payload.role || "").trim();
        if (pr && isPlainMemberLegacyRole(legacyRole)) legacyRole = pr;
        if (
          payload.sales_level != null
          && Number.isFinite(Number(payload.sales_level))
          && (salesLevel == null || !Number.isFinite(salesLevel))
        ) {
          salesLevel = Number(payload.sales_level);
        }
      }
    } catch {
      /* ignore */
    }
  }
  if ((sessionRoleHint == null || sessionRoleHint === "") && meAuthUser) {
    sessionRoleHint = meAuthUser.session_role ?? null;
  }
  if (
    (salesLevel == null || !Number.isFinite(salesLevel))
    && meAuthUser?.sales_level != null
    && Number.isFinite(Number(meAuthUser.sales_level))
  ) {
    salesLevel = Number(meAuthUser.sales_level);
  }
  /** JWT·상태의 role이 \"회원\"으로만 남아 있는데 authUsers 행에는 영업·관리자 문자열이 있는 경우 */
  if (meAuthUser) {
    const ur = String(meAuthUser.role || "").trim();
    if (ur && isPlainMemberLegacyRole(legacyRole)) legacyRole = ur;
  }
  /** 시드·레지스트리 원본(이메일 일치) — API 병합 행이 얇아도 관리자 탭·진입 판정 유지 */
  if (loggedIn && linkedGoogle) {
    const em = String(linkedGoogle).trim().toLowerCase();
    const seed = buildAuthUsersState().find((u) => String(u.email || "").trim().toLowerCase() === em);
    if (seed) {
      const sr = String(seed.role || "").trim();
      if (sr && isPlainMemberLegacyRole(legacyRole)) legacyRole = sr;
      const seedNorm = normalizeSessionRoleHint(seed.session_role);
      const hintNorm = normalizeSessionRoleHint(sessionRoleHint);
      if (seedNorm === SESSION_ROLE.SALES || seedNorm === SESSION_ROLE.HQ_OPS) {
        if (hintNorm !== SESSION_ROLE.SALES && hintNorm !== SESSION_ROLE.HQ_OPS) {
          sessionRoleHint = seed.session_role ?? null;
        }
      }
      if ((salesLevel == null || !Number.isFinite(salesLevel)) && seed.sales_level != null && Number.isFinite(Number(seed.sales_level))) {
        salesLevel = Number(seed.sales_level);
      }
    }
  }
  const profile = deriveSessionProfile({
    legacyRole,
    email: linkedGoogle,
    sessionRoleHint,
    salesLevel,
  });
  let out = profile;
  /** derive가 USER로만 남아도 JWT에 본사/영업이 있고 이메일이 일치하면 관리자 진입 허용 */
  if (!out.canAccessAdmin && loggedIn && linkedGoogle && authToken) {
    try {
      const payload = decodeJwtPayload(authToken);
      const pe = String(payload?.email || "").trim().toLowerCase();
      const lg = String(linkedGoogle || "").trim().toLowerCase();
      if (payload && pe && lg && pe === lg) {
        const j = normalizeSessionRoleHint(payload.session_role);
        if (j === SESSION_ROLE.HQ_OPS) {
          out = {
            ...out,
            sessionRole: SESSION_ROLE.HQ_OPS,
            salesLevel: null,
            canAccessAdmin: true,
            allowDestructiveAdminWrite: true,
            hideTradingUi: true,
            displayLabel: "본사 운영",
          };
        } else if (j === SESSION_ROLE.SALES) {
          const sl =
            payload.sales_level != null && Number.isFinite(Number(payload.sales_level))
              ? Number(payload.sales_level)
              : out.salesLevel ?? 1;
          out = {
            ...out,
            sessionRole: SESSION_ROLE.SALES,
            salesLevel: sl,
            canAccessAdmin: true,
            allowDestructiveAdminWrite: false,
            hideTradingUi: false,
            displayLabel: `영업 L${sl}`,
          };
        }
      }
    } catch {
      /* ignore */
    }
  }
  try {
    if (typeof localStorage !== "undefined" && localStorage.getItem("tg_debug_admin") === "1") {
      return { ...out, canAccessAdmin: true };
    }
  } catch {
    /* ignore */
  }
  return out;
}

export default function App() {
  const [theme, setTheme] = useState(() => {
    try {
      const v = localStorage.getItem("tg_ui_theme_v1");
      if (v === "dark" || v === "light") return v;
    } catch {
      /* ignore */
    }
    return "dark";
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const [tradePushOpen, setTradePushOpen] = useState(false);
  const [generalNotifOpen, setGeneralNotifOpen] = useState(false);
  const notifClusterDesktopRef = useRef(null);
  const notifClusterMobileRef = useRef(null);
  const [mockNotifReadIds, setMockNotifReadIds] = useState(() => {
    try {
      const raw = localStorage.getItem("tg_mock_notif_read");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [loggedIn, setLoggedIn] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [sellOpen, setSellOpen] = useState(false);
  const [activePage, setActivePage] = useState(() => {
    try {
      const v = localStorage.getItem(TG_MAIN_SCREEN_KEY);
      const ok = ["trade", "myinfo", "mytrades", "friends", "messenger", "p2p", "admin", "admin-denied", "support"];
      if (v && ok.includes(v)) return v;
    } catch {
      /* ignore */
    }
    return "trade";
  });
  const [toast, setToast] = useState("");
  const [coin, setCoin] = useState("USDT");
  const [amount, setAmount] = useState(1000);
  const [nickname, setNickname] = useState("TetherKing");
  const [bankRegistered, setBankRegistered] = useState(false);
  const [buyerKyc, setBuyerKyc] = useState({
    realName: "",
    idVerified: false,
    idImageUploaded: false,
    bankAccountUploaded: false,
    accountNameMatched: false,
    companyApprovalStatus: "미제출",
    privateStorageNoticeAccepted: false,
  });
  const [myInfoTab, setMyInfoTab] = useState("기본정보");
  const [showReferral, setShowReferral] = useState(false);
  const [sellAsset, setSellAsset] = useState("USDT");
  const [receiveType, setReceiveType] = useState("통화");
  const [receiveAsset, setReceiveAsset] = useState("KRW");
  const [sellAmount, setSellAmount] = useState("");
  const [sellRate, setSellRate] = useState("");
  const [adminMember, setAdminMember] = useState("TG-MEMBER-001");
  const [adminParent, setAdminParent] = useState("TG777");
  const [adminReceivedRate, setAdminReceivedRate] = useState("50");
  const [adminRate, setAdminRate] = useState("45");
  const [adminMemo, setAdminMemo] = useState("슈퍼페이지 → 본사 관리자/관계자 → LEVEL 1~10 구조");
  const [adminUserSearch, setAdminUserSearch] = useState("");
  const [selectedAdminUser, setSelectedAdminUser] = useState(null);
  const [selectedChildUser, setSelectedChildUser] = useState(null);
  const [securityFilter, setSecurityFilter] = useState("전체");
  const [blockReason, setBlockReason] = useState("사기 의심 / 다중 계정 / 비정상 거래 패턴");
  const [loginMode, setLoginMode] = useState("google");
  const [googleEmail, setGoogleEmail] = useState("demo@gmail.com");
  const [walletProvider, setWalletProvider] = useState("Phantom");
  const [phantomWallet, setPhantomWallet] = useState("8xA2...9QpL");
  const [walletNicknameInput, setWalletNicknameInput] = useState("");
  const [walletPasswordInput, setWalletPasswordInput] = useState("");
  const [walletEmailInput, setWalletEmailInput] = useState("");
  const [walletEmailPasswordInput, setWalletEmailPasswordInput] = useState("");
  const [walletAuthStatus, setWalletAuthStatus] = useState("idle");
  const [walletAuthError, setWalletAuthError] = useState("");
  const [referralInput, setReferralInput] = useState("TG777");
  const [myReferralCode, setMyReferralCode] = useState(() => {
    const saved = localStorage.getItem(MY_REFERRAL_CODE_KEY);
    if (saved) return saved;
    const seed = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `TG-${seed}`;
  });
  const [accountType, setAccountType] = useState("비로그인");
  const [linkedGoogle, setLinkedGoogle] = useState("");
  const [linkedWallet, setLinkedWallet] = useState("");
  const [linkedReferral, setLinkedReferral] = useState("");
  const [mergeStatus, setMergeStatus] = useState("아직 연결된 계정 없음");
  const [currentRole, setCurrentRole] = useState("회원");
  const [language, setLanguage] = useState("KR");
  const [friends, setFriends] = useState(initialFriends);
  const [selectedFriendId, setSelectedFriendId] = useState(initialFriends[0].id);
  const [chatRooms, setChatRooms] = useState(initialChatRooms);
  const [chatInput, setChatInput] = useState("");
  const [friendTradePopup, setFriendTradePopup] = useState(false);
  const [tradeTargetFriendId, setTradeTargetFriendId] = useState(initialFriends[0].id);
  const [friendTradeAmount, setFriendTradeAmount] = useState("");
  const [friendTradeFinalStep, setFriendTradeFinalStep] = useState(false);
  const [authUsers, setAuthUsers] = useState(() => buildAuthUsersState());
  const [authToken, setAuthToken] = useState(() => localStorage.getItem(AUTH_TOKEN_KEY) || "");
  const [authRefreshToken, setAuthRefreshToken] = useState(() => localStorage.getItem(AUTH_REFRESH_TOKEN_KEY) || "");
  const [authTab, setAuthTab] = useState("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authPasswordConfirm, setAuthPasswordConfirm] = useState("");
  const [authNickname, setAuthNickname] = useState("");
  const [loginRecentIds, setLoginRecentIds] = useState(() => {
    try {
      const raw = localStorage.getItem(LOGIN_RECENT_IDS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [loginRememberEmail, setLoginRememberEmail] = useState(readLoginRememberEmailPref);
  const [savedLoginEmails, setSavedLoginEmails] = useState(readLoginEmailHistory);
  const [friendSearch, setFriendSearch] = useState("");
  const [pinnedFriendIds, setPinnedFriendIds] = useState(["FR-001"]);
  const [mutedFriendIds, setMutedFriendIds] = useState([]);
  const [adminMediaTypeFilter, setAdminMediaTypeFilter] = useState("전체");
  const [adminMediaFriendFilter, setAdminMediaFriendFilter] = useState("전체");
  const [adminActionLogs, setAdminActionLogs] = useState([]);
  const [sellerDepositNotice, setSellerDepositNotice] = useState(defaultSellerDepositNotice);
  const [walletAccount, setWalletAccount] = useState({ provider: "", address: "", connectedAt: "", updatedAt: "" });
  const [financeAccount, setFinanceAccount] = useState({
    availableBalance: 0,
    referralEarningsTotal: 0,
    pendingWithdrawal: 0,
    p2pEscrowLocked: 0,
    updatedAt: "",
  });
  const [withdrawRequests, setWithdrawRequests] = useState([]);
  const [withdrawAmountInput, setWithdrawAmountInput] = useState("");
  const [withdrawNoteInput, setWithdrawNoteInput] = useState("");
  const [isSavingNickname, setIsSavingNickname] = useState(false);
  const [escrowPolicy, setEscrowPolicy] = useState({
    mainCustodyAccount: "TG-COMPANY-CUSTODY-001",
    requiredApprovals: 3,
    approverIds: [],
    mainFinalApproverId: 1,
    levelDelayHours: { Lv1: 48, Lv2: 36, Lv3: 24, Lv4: 12, Lv5: 0 },
  });
  const [disputeCases, setDisputeCases] = useState([]);
  const [finalApprovalPinInput, setFinalApprovalPinInput] = useState("");
  const [newPolicyPinInput, setNewPolicyPinInput] = useState("");
  const [selectedDisputeIdForTimeline, setSelectedDisputeIdForTimeline] = useState("");
  const [selectedDisputeEvents, setSelectedDisputeEvents] = useState([]);
  const [timelineActionFilter, setTimelineActionFilter] = useState("전체");
  const [timelineFromDate, setTimelineFromDate] = useState("");
  const [timelineToDate, setTimelineToDate] = useState("");
  const [finalApprovalOtpInput, setFinalApprovalOtpInput] = useState("");
  const [runtimeEmergencyState, setRuntimeEmergencyState] = useState({
    emergencyMode: false,
    emergencyReason: "",
    emergencyEta: "",
    updatedAt: "",
  });
  const [marketPrices, setMarketPrices] = useState(null);
  const domI18nOriginalTextMapRef = useRef(new WeakMap());

  const t = themeMap[theme] ?? themeMap.dark;

  useEffect(() => {
    if (!themeMap[theme]) setTheme("dark");
  }, [theme]);

  useEffect(() => {
    try {
      if (theme === "dark" || theme === "light") localStorage.setItem("tg_ui_theme_v1", theme);
    } catch {
      /* ignore */
    }
  }, [theme]);
  const lang = translations[language] || translations.KR;
  const fiatForFee = marketPrices?.fiatRates;
  const rate =
    coin === "USDT"
      ? fiatForFee?.USDT?.KRW ?? STATIC_MARKET_PRICES.fiatRates.USDT.KRW
      : coin === "SOL"
        ? fiatForFee?.SOL?.KRW ?? STATIC_MARKET_PRICES.fiatRates.SOL.KRW
        : coin === "ETH"
          ? fiatForFee?.ETH?.KRW ?? STATIC_MARKET_PRICES.fiatRates.ETH.KRW
          : fiatForFee?.BTC?.KRW ?? STATIC_MARKET_PRICES.fiatRates.BTC.KRW;
  const fee = amount * rate * 0.01;
  const total = amount * rate + fee;
  const marketRate = getMarketRate(sellAsset, receiveAsset, receiveType, marketPrices);
  const marketRateMinus = receiveType === "통화" ? Math.round(marketRate * 0.99) : Number((marketRate * 0.99).toFixed(8));
  const marketRatePlus = receiveType === "통화" ? Math.round(marketRate * 1.01) : Number((marketRate * 1.01).toFixed(8));
  const selectedFriend = useMemo(() => friends.find((friend) => friend.id === selectedFriendId), [friends, selectedFriendId]);
  const selectedFriendMessages = chatRooms[selectedFriendId] || [];
  const friendLastMessages = useMemo(
    () =>
      friends.reduce((acc, friend) => {
        const roomMessages = chatRooms[friend.id] || [];
        const latest = roomMessages[roomMessages.length - 1];
        acc[friend.id] = latest?.deleted ? "삭제된 메시지입니다." : latest?.text || "대화 없음";
        return acc;
      }, {}),
    [friends, chatRooms]
  );
  const tradeTargetFriend = friends.find((friend) => friend.id === tradeTargetFriendId);
  const referralJoinLink = useMemo(() => {
    const base = typeof window !== "undefined" ? window.location.origin : "";
    return `${base}/?ref=${encodeURIComponent(myReferralCode || "")}`;
  }, [myReferralCode]);
  const referralStats = useMemo(() => {
    const myCode = String(myReferralCode || "").trim().toUpperCase();
    const now = Date.now();
    const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const downlines = (authUsers || []).filter((user) => String(user?.referred_by_code || "").toUpperCase() === myCode);
    const weeklyNew = downlines.filter((user) => {
      const ts = Date.parse(String(user?.created_at || ""));
      return Number.isFinite(ts) && ts >= oneWeekAgo;
    }).length;
    const activeDownlines = downlines.filter((user) => {
      const idNum = Number(user?.id || 0);
      return Number.isFinite(idNum) && idNum % 2 === 0;
    }).length;
    return {
      totalDownlines: downlines.length,
      activeDownlines,
      weeklyNew,
    };
  }, [authUsers, myReferralCode]);
  const meAuthUser = useMemo(() => {
    if (!loggedIn || !linkedGoogle) return null;
    const em = String(linkedGoogle).trim().toLowerCase();
    return authUsers.find((user) => String(user.email || "").trim().toLowerCase() === em) || null;
  }, [loggedIn, authUsers, linkedGoogle]);

  const sessionProfile = useMemo(
    () => computeSessionProfileSnapshot(loggedIn, currentRole, linkedGoogle, meAuthUser, authToken),
    [loggedIn, currentRole, linkedGoogle, meAuthUser, authToken]
  );

  /** 영업(sales)·본사(hq_ops) 등 sessionRoles.canAccessAdmin 과 동일 — 등급에 맞으면 관리자 탭 표시 */
  const canAccessAdmin = Boolean(sessionProfile.canAccessAdmin);
  const isSuperAdmin = sessionProfile.allowDestructiveAdminWrite || sessionProfile.sessionRole === SESSION_ROLE.HQ_OPS;
  const adminGateUser = useMemo(() => {
    let jwtRole = "";
    let jwtSessionRole = "";
    try {
      if (authToken && linkedGoogle) {
        const p = decodeJwtPayload(authToken);
        const pe = String(p?.email || "").trim().toLowerCase();
        const em = String(linkedGoogle || "").trim().toLowerCase();
        if (pe && em && pe === em) {
          jwtRole = String(p.role || "");
          jwtSessionRole = String(p.session_role || "");
        }
      }
    } catch {
      /* ignore */
    }
    return {
      email: String(linkedGoogle || "").trim().toLowerCase(),
      role: String(meAuthUser?.role || currentRole || jwtRole || "").trim(),
      session_role: meAuthUser?.session_role != null && meAuthUser.session_role !== "" ? meAuthUser.session_role : jwtSessionRole || null,
      isSuperAdmin,
    };
  }, [linkedGoogle, currentRole, meAuthUser, isSuperAdmin, authToken]);
  const adminGateAllowed = useMemo(() => canAccessAdminSafe(adminGateUser), [adminGateUser]);
  const [adminShellMenu, setAdminShellMenu] = useState("dashboard");
  const adminShellLegacyTab = useMemo(() => {
    const map = {
      dashboard: "dashboard",
      member: "member",
      referral: "memberOps",
      stage: "member",
      trade: "audit",
      settlement: "dispute",
      settings: "ops",
    };
    return map[adminShellMenu] || "dashboard";
  }, [adminShellMenu]);
  const showAdminNav = Boolean(adminGateAllowed || sessionProfile.canAccessAdmin);
  /** 이메일 일치 행만 사용 — 첫 번째 유저 폴백 시 타인 role 로 세션·관리자 판정이 깨짐 */
  const currentAdminActorId = useMemo(() => {
    const lg = String(linkedGoogle || "").trim().toLowerCase();
    if (!lg) return null;
    const matched = authUsers.find((user) => String(user.email || "").trim().toLowerCase() === lg);
    return matched?.id ?? null;
  }, [authUsers, linkedGoogle]);
  useEffect(() => {
    if (!loggedIn || currentAdminActorId == null) return;
    const me = authUsers.find((user) => String(user.id) === String(currentAdminActorId));
    if (!me) return;
    const nextRole = String(me.role || "");
    if (!nextRole || nextRole === currentRole) return;
    const looksElevated = (r) => {
      const s = String(r || "");
      return (
        s.includes("관리자")
        || s.includes("영업")
        || s.includes("본사")
        || s.includes("슈퍼")
        || s.includes("운영")
      );
    };
    /** API가 회원만 주고 시드·JWT가 관리자인 경우 덮어쓰지 않음 */
    if (nextRole === "회원" && looksElevated(currentRole)) return;
    if (looksElevated(currentRole) && !looksElevated(nextRole)) return;
    setCurrentRole(nextRole);
  }, [loggedIn, authUsers, currentAdminActorId, currentRole]);

  /** 관리자 패널 액터 ID — authUsers 매칭 없을 때 시드 행으로 보강 */
  const adminPanelActorId = useMemo(() => {
    if (currentAdminActorId != null) return currentAdminActorId;
    if (meAuthUser?.id != null) return meAuthUser.id;
    const em = String(linkedGoogle || "").trim().toLowerCase();
    if (!em) return null;
    const seed = buildAuthUsersState().find((u) => String(u.email || "").trim().toLowerCase() === em);
    return seed?.id ?? null;
  }, [currentAdminActorId, meAuthUser, linkedGoogle]);

  /** 비로그인: 거래 · 판매등록 · 고객센터만 */
  const primaryNavItems = useMemo(() => {
    const guest = [
      { key: "trade", label: lang.menuTrade },
      { key: "sell", label: lang.sellRegister },
      { key: "support", label: lang.support },
    ];
    if (!loggedIn) return guest;
    const items = [
      { key: "trade", label: lang.menuTrade },
      { key: "sell", label: lang.sellRegister },
      { key: "myinfo", label: lang.myInfo },
      { key: "mytrades", label: lang.myTrades },
      { key: "friends", label: "친구" },
      { key: "messenger", label: "메신저" },
    ];
    if (showAdminNav) items.push({ key: "admin", label: lang.admin });
    items.push({ key: "support", label: lang.support });
    return items;
  }, [lang, loggedIn, showAdminNav]);

  const pageForMain = useMemo(() => {
    if (loggedIn) return activePage;
    return activePage === "support" ? "support" : "trade";
  }, [loggedIn, activePage]);

  const navActiveKey = useMemo(() => {
    if (!loggedIn) return pageForMain === "support" ? "support" : "trade";
    if (activePage === "admin-denied") return "admin";
    return activePage;
  }, [loggedIn, activePage, pageForMain]);

  useEffect(() => {
    if (loggedIn) return;
    if (activePage !== "trade" && activePage !== "support") {
      setActivePage("trade");
    }
  }, [loggedIn, activePage]);

  const mockTradeUnread = useMemo(
    () => MOCK_TRADE_PUSH_NOTIFICATIONS.filter((n) => !mockNotifReadIds.includes(n.id)).length,
    [mockNotifReadIds]
  );
  const mockGeneralUnread = useMemo(
    () => MOCK_GENERAL_ALERT_NOTIFICATIONS.filter((n) => !mockNotifReadIds.includes(n.id)).length,
    [mockNotifReadIds]
  );

  const apiClient = useMemo(
    () =>
      createApiClient({
        baseUrl: API_BASE,
        getAccessToken: () => authToken,
        getRefreshToken: () => authRefreshToken,
        setAccessToken: setAuthToken,
        setRefreshToken: setAuthRefreshToken,
        onAuthFailure: () => {
          setLoggedIn(false);
          setAuthToken("");
          setAuthRefreshToken("");
          localStorage.removeItem(LOCAL_SESSION_KEY);
        },
      }),
    [authToken, authRefreshToken]
  );

  useEffect(() => {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (token) {
      const payload = decodeJwtPayload(token);
      if (payload?.email) {
        setLoggedIn(true);
        setLinkedGoogle(String(payload.email).trim().toLowerCase());
        setNickname(String(payload.nickname || "회원"));
        setCurrentRole(String(payload.role || "회원"));
        setAccountType("이메일 계정");
        setMergeStatus("세션 복구 (JWT)");
        return;
      }
    }
    try {
      const raw = localStorage.getItem(LOCAL_SESSION_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        const em = String(s.email || "").trim().toLowerCase();
        if (em) {
          setLoggedIn(true);
          setLinkedGoogle(em);
          setNickname(String(s.nickname || "회원"));
          setCurrentRole(String(s.role || "회원"));
          setAccountType(String(s.accountType || "테스트 계정"));
          setMergeStatus(String(s.mergeStatus || "세션 복구 (로컬 테스트)"));
          if (s.linkedReferral != null) setLinkedReferral(String(s.linkedReferral));
          if (s.myReferralCode) setMyReferralCode(String(s.myReferralCode));
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (authToken) localStorage.setItem(AUTH_TOKEN_KEY, authToken);
    else localStorage.removeItem(AUTH_TOKEN_KEY);
  }, [authToken]);

  useEffect(() => {
    if (authRefreshToken) localStorage.setItem(AUTH_REFRESH_TOKEN_KEY, authRefreshToken);
    else localStorage.removeItem(AUTH_REFRESH_TOKEN_KEY);
  }, [authRefreshToken]);
  useEffect(() => {
    localStorage.setItem(LOGIN_RECENT_IDS_KEY, JSON.stringify(loginRecentIds.slice(0, 12)));
  }, [loginRecentIds]);

  useEffect(() => {
    try {
      localStorage.setItem("tg_mock_notif_read", JSON.stringify(mockNotifReadIds));
    } catch {
      /* ignore */
    }
  }, [mockNotifReadIds]);

  useEffect(() => {
    if (!tradePushOpen && !generalNotifOpen) return undefined;
    function onDocMouseDown(e) {
      const inDesktop = notifClusterDesktopRef.current?.contains(e.target);
      const inMobile = notifClusterMobileRef.current?.contains(e.target);
      if (!inDesktop && !inMobile) {
        setTradePushOpen(false);
        setGeneralNotifOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [tradePushOpen, generalNotifOpen]);

  useEffect(() => {
    if (myReferralCode) localStorage.setItem(MY_REFERRAL_CODE_KEY, myReferralCode);
  }, [myReferralCode]);

  useEffect(() => {
    if (!loggedIn) return;
    try {
      localStorage.setItem(TG_MAIN_SCREEN_KEY, activePage);
    } catch {
      /* ignore */
    }
  }, [activePage, loggedIn]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search || "");
    const incomingReferral = String(params.get("ref") || params.get("referral") || "").trim();
    if (!incomingReferral) return;
    setReferralInput(incomingReferral);
  }, []);

  useEffect(() => {
    if (!authToken) return;
    apiClient.request("/api/admin/users", { auth: true })
      .then((data) => {
        const api = Array.isArray(data.users) ? data.users : [];
        setAuthUsers(mergeApiUsersWithLocal(api));
      })
      .catch(() => {});
  }, [authToken, apiClient]);

  useEffect(() => {
    function refreshUsersAfterRegistry() {
      if (!authToken) {
        setAuthUsers(buildAuthUsersState());
        return;
      }
      apiClient.request("/api/admin/users", { auth: true })
        .then((data) => {
          const api = Array.isArray(data.users) ? data.users : [];
          setAuthUsers(mergeApiUsersWithLocal(api));
        })
        .catch(() => {});
    }
    window.addEventListener(REGISTRY_CHANGED_EVENT, refreshUsersAfterRegistry);
    return () => window.removeEventListener(REGISTRY_CHANGED_EVENT, refreshUsersAfterRegistry);
  }, [authToken, apiClient]);

  useEffect(() => {
    if (!authToken || !(canAccessAdmin || adminGateAllowed)) return;
    apiClient.request("/api/admin/escrow-policy", { auth: true })
      .then((data) => {
        if (data?.policy) setEscrowPolicy(data.policy);
      })
      .catch(() => {});
    apiClient.request("/api/admin/disputes", { auth: true })
      .then((data) => setDisputeCases(Array.isArray(data.disputes) ? data.disputes : []))
      .catch(() => {});
  }, [authToken, canAccessAdmin, adminGateAllowed, apiClient]);

  useEffect(() => {
    if (!authToken) return;
    apiClient.request("/api/kyc/me", { auth: true })
      .then((data) => {
        if (data?.profile) setBuyerKyc(data.profile);
      })
      .catch(() => {});
  }, [authToken, apiClient]);

  useEffect(() => {
    if (!authToken) return;
    apiClient.request("/api/referral/me", { auth: true })
      .then((data) => {
        const ref = data?.referral || {};
        if (ref.myReferralCode) setMyReferralCode(ref.myReferralCode);
        setLinkedReferral(ref.referredByCode || "");
      })
      .catch(() => {});
  }, [authToken, apiClient]);

  useEffect(() => {
    if (!authToken) return;
    apiClient.request("/api/wallet/me", { auth: true })
      .then((data) => {
        if (data?.wallet) setWalletAccount(data.wallet);
      })
      .catch(() => {});
    apiClient.request("/api/finance/me", { auth: true })
      .then((data) => {
        if (data?.account) {
          setFinanceAccount({
            availableBalance: Number(data.account.availableBalance ?? 0),
            referralEarningsTotal: Number(data.account.referralEarningsTotal ?? 0),
            pendingWithdrawal: Number(data.account.pendingWithdrawal ?? 0),
            p2pEscrowLocked: Number(data.account.p2pEscrowLocked ?? 0),
            updatedAt: String(data.account.updatedAt || ""),
          });
        }
        if (Array.isArray(data?.withdrawals)) setWithdrawRequests(data.withdrawals);
        if (data?.wallet?.address) {
          setLinkedWallet(data.wallet.address);
          setWalletAccount((prev) => ({ ...prev, ...data.wallet }));
        }
      })
      .catch(() => {});
  }, [authToken, apiClient, setLinkedWallet]);

  useEffect(() => {
    let mounted = true;
    async function loadRuntimeState() {
      try {
        const data = await apiClient.request("/api/runtime-state");
        if (!mounted) return;
        setRuntimeEmergencyState({
          emergencyMode: Boolean(data?.emergencyMode),
          emergencyReason: String(data?.emergencyReason || ""),
          emergencyEta: String(data?.emergencyEta || ""),
          updatedAt: String(data?.updatedAt || ""),
        });
      } catch {
        // ignore runtime-state polling errors for UX stability
      }
    }
    loadRuntimeState();
    const timer = setInterval(loadRuntimeState, 15000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [apiClient]);

  useEffect(() => {
    let mounted = true;
    async function loadMarketPrices() {
      try {
        const data = await apiClient.request("/api/market/prices");
        if (!mounted || !data?.fiatRates || !data?.coinRates) return;
        setMarketPrices({ fiatRates: data.fiatRates, coinRates: data.coinRates });
      } catch {
        /* 서버 다운 시 내장 STATIC_MARKET_PRICES 유지 */
      }
    }
    loadMarketPrices();
    const timer = setInterval(loadMarketPrices, 60000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [apiClient]);

  function notify(message) {
    setToast(localizeLoose(message, language));
    setTimeout(() => setToast(""), 1800);
  }

  function rememberLoginEmailIfEnabled(email) {
    if (!loginRememberEmail) return;
    const e = String(email || "")
      .trim()
      .toLowerCase();
    if (!e.includes("@")) return;
    try {
      const prev = readLoginEmailHistory();
      const next = [e, ...prev.filter((x) => x !== e)].slice(0, 10);
      localStorage.setItem(TG_LOGIN_EMAIL_HISTORY_KEY, JSON.stringify(next));
      setSavedLoginEmails(next);
    } catch {
      /* ignore */
    }
  }

  function clearLoginEmailHistory() {
    try {
      localStorage.removeItem(TG_LOGIN_EMAIL_HISTORY_KEY);
      setSavedLoginEmails([]);
      notify("저장된 이메일 기록을 지웠습니다.");
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    if (loginRememberEmail) localStorage.setItem(TG_LOGIN_REMEMBER_EMAIL_KEY, "1");
    else localStorage.removeItem(TG_LOGIN_REMEMBER_EMAIL_KEY);
  }, [loginRememberEmail]);

  useEffect(() => {
    if (!loginOpen || authTab !== "login") return;
    if (!loginRememberEmail || savedLoginEmails.length === 0) return;
    setAuthEmail((prev) => (prev.trim() ? prev : savedLoginEmails[0]));
  }, [loginOpen, authTab, loginRememberEmail, savedLoginEmails]);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const originalTextMap = domI18nOriginalTextMapRef.current;
    const runLocalization = (root) => {
      applyDomLocalization(root, language, originalTextMap);
    };
    runLocalization(document.body);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.TEXT_NODE && node.parentElement) {
            runLocalization(node.parentElement);
            return;
          }
          if (node.nodeType === Node.ELEMENT_NODE) {
            runLocalization(node);
          }
        });
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [language, activePage, loginOpen, toast]);

  function requireLogin(action) {
    if (!loggedIn) {
      setLoginOpen(true);
      notify("로그인이 필요합니다.");
      return;
    }
    action?.();
  }

  function isValidEmail(email) {
    return /\S+@\S+\.\S+/.test(email);
  }

  async function loadGoogleIdentityScript() {
    if (typeof window === "undefined") throw new Error("브라우저 환경이 필요합니다.");
    if (window.google?.accounts?.id) return window.google;
    await new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-google-identity="true"]');
      if (existing) {
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", reject, { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.dataset.googleIdentity = "true";
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
    if (!window.google?.accounts?.id) throw new Error("Google SDK 로드에 실패했습니다.");
    return window.google;
  }

  async function handleGoogleClickLogin() {
    if (!GOOGLE_CLIENT_ID) {
      notify("Google 로그인 설정이 비어 있습니다. VITE_GOOGLE_CLIENT_ID를 설정하세요.");
      return;
    }
    try {
      const google = await loadGoogleIdentityScript();
      const credential = await new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => reject(new Error("Google 로그인 응답 시간 초과")), 20000);
        google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (response) => {
            clearTimeout(timeoutId);
            if (response?.credential) resolve(response.credential);
            else reject(new Error("Google credential 응답이 없습니다."));
          },
        });
        google.accounts.id.prompt((notification) => {
          const n = notification;
          if (
            n?.isNotDisplayed?.()
            || n?.isSkippedMoment?.()
            || n?.isDismissedMoment?.()
          ) {
            clearTimeout(timeoutId);
            reject(new Error("Google 로그인 창이 닫혔거나 표시되지 않았습니다."));
          }
        });
      });
      const authData = await apiClient.request("/api/auth/google", {
        method: "POST",
        body: JSON.stringify({
          credential,
          referralCode: referralInput,
          myReferralCode,
        }),
      });
      const user = applyAuthSuccess(authData, "");
      if (!user) return;
      setAccountType("구글 계정");
      notify("구글 로그인 완료");
    } catch (error) {
      notify(error.message || "Google 로그인에 실패했습니다.");
    }
  }

  async function attemptUnifiedLogin() {
    const email = authEmail.trim().toLowerCase();
    const password = authPassword.trim();
    if (!isValidEmail(email)) {
      notify("유효한 이메일을 입력하세요.");
      return;
    }
    if (password.length < 6) {
      notify("비밀번호는 6자 이상이어야 합니다.");
      return;
    }
    try {
      const loginData = await apiClient.request("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      applyEmailAuthSession(loginData, email);
      rememberLoginEmailIfEnabled(email);
      notify("로그인 완료");
    } catch (apiErr) {
      const localUser = verifyLocalEmailPassword(email, password);
      if (localUser) {
        const userId = String(localUser.id || "");
        setAuthToken("");
        setAuthRefreshToken("");
        setLoggedIn(true);
        setAccountType("테스트 계정");
        setCurrentRole(localUser.role || "회원");
        setNickname(localUser.nickname || "회원");
        setLinkedGoogle(String(localUser.email || email).trim().toLowerCase());
        setLinkedReferral(localUser.referred_by_code || "");
        setMyReferralCode(localUser.referral_code || myReferralCode);
        setMergeStatus("테스트 계정 로그인 (로컬)");
        try {
          localStorage.setItem(
            LOCAL_SESSION_KEY,
            JSON.stringify({
              email: String(localUser.email || email).trim().toLowerCase(),
              nickname: localUser.nickname || "",
              role: localUser.role || "회원",
              session_role: localUser.session_role ?? null,
              sales_level: localUser.sales_level ?? null,
              accountType: "테스트 계정",
              mergeStatus: "테스트 계정 로그인 (로컬)",
              linkedReferral: localUser.referred_by_code || "",
              myReferralCode: localUser.referral_code || myReferralCode,
            })
          );
        } catch {
          /* ignore */
        }
        setLoginRecentIds((prev) => {
          const filtered = prev.filter((id) => String(id) !== userId);
          return [userId, ...filtered].slice(0, 12);
        });
        rememberLoginEmailIfEnabled(email);
        setLoginOpen(false);
        setAuthPassword("");
        notify("테스트 계정으로 로그인했습니다. (서버 미연결 또는 발급 계정)");
        return;
      }
      notify(apiErr?.message || "이메일 또는 비밀번호를 확인하세요.");
    }
  }

  function applyEmailAuthSession(loginData, fallbackEmail = "") {
    const user = loginData?.user || {};
    localStorage.removeItem(LOCAL_SESSION_KEY);
    setAuthToken(loginData?.accessToken || loginData?.token || "");
    setAuthRefreshToken(loginData?.refreshToken || "");
    setLoggedIn(true);
    setAccountType("이메일 계정");
    setCurrentRole(user.role || "회원");
    setNickname(user.nickname || "회원");
    setLinkedGoogle(String(user.email || fallbackEmail || "").trim().toLowerCase());
    setLinkedReferral(user.referred_by_code || "");
    setMyReferralCode(user.referral_code || myReferralCode);
    setMergeStatus("DB 로그인 완료");
    setLoginRecentIds((prev) => {
      const nextId = String(user.id || "");
      const filtered = prev.filter((id) => String(id) !== nextId);
      return [nextId, ...filtered].slice(0, 12);
    });
    setLoginOpen(false);
    return user;
  }

  async function handleAuthSubmit() {
    const email = authEmail.trim().toLowerCase();
    const password = authPassword.trim();
    const nicknameInput = authNickname.trim();
    if (!isValidEmail(email)) {
      notify("유효한 이메일을 입력하세요.");
      return;
    }
    if (password.length < 6) {
      notify("비밀번호는 6자 이상이어야 합니다.");
      return;
    }

    try {
      if (authTab === "signup") {
        if (!nicknameInput) {
          notify("닉네임을 입력하세요.");
          return;
        }
        if (password !== authPasswordConfirm.trim()) {
          notify("비밀번호 확인이 일치하지 않습니다.");
          return;
        }
        const signupData = await apiClient.request("/api/auth/signup", {
          method: "POST",
          body: JSON.stringify({ email, password, nickname: nicknameInput, referralCode: referralInput, myReferralCode }),
        });
        localStorage.removeItem(LOCAL_SESSION_KEY);
        const user = signupData.user || {};
        setAuthToken(signupData.accessToken || signupData.token || "");
        setAuthRefreshToken(signupData.refreshToken || "");
        setLoggedIn(true);
        setAccountType("이메일 계정");
        setCurrentRole(user.role || "회원");
        setNickname(user.nickname || "회원");
        setLinkedGoogle(String(user.email || email).trim().toLowerCase());
        setLinkedReferral(user.referred_by_code || referralInput || "");
        setMyReferralCode(user.referral_code || myReferralCode);
        setMergeStatus("DB 계정으로 가입됨");
        rememberLoginEmailIfEnabled(email);
        setLoginOpen(false);
        notify("회원가입 및 로그인 완료");
        return;
      }

      await attemptUnifiedLogin();
    } catch (error) {
      notify(error.message || "인증 서버 연결에 실패했습니다. API 서버를 실행하세요.");
    }
  }

  function applyAuthSuccess(authData, fallbackEmail = "") {
    const user = authData?.user || {};
    localStorage.removeItem(LOCAL_SESSION_KEY);
    setAuthToken(authData?.accessToken || authData?.token || "");
    setAuthRefreshToken(authData?.refreshToken || "");
    setLoggedIn(true);
    setCurrentRole(user.role || "회원");
    setNickname(user.nickname || "회원");
    setLinkedGoogle(String(user.email || fallbackEmail || "").trim().toLowerCase());
    setLinkedReferral(user.referred_by_code || referralInput || "");
    setMyReferralCode(user.referral_code || myReferralCode);
    setLoginOpen(false);
    return user;
  }

  async function handleWalletAuthSubmit() {
    const provider = walletProvider.trim();
    const address = phantomWallet.trim();
    const password = walletPasswordInput.trim();
    const walletNickname = walletNicknameInput.trim();
    const walletEmail = walletEmailInput.trim().toLowerCase();
    if (!provider) {
      notify("지갑 제공자를 선택하세요.");
      return;
    }
    if (address.length < 6) {
      notify("유효한 지갑 주소를 입력하세요.");
      return;
    }
    try {
      setWalletAuthError("");
      setWalletAuthStatus("nonce");
      const nonceData = await apiClient.request("/api/auth/wallet/nonce", {
        method: "POST",
        body: JSON.stringify({ provider, address }),
      });
      const nonce = String(nonceData?.nonce || "");
      const message = String(nonceData?.message || "");
      if (!nonce || !message) {
        setWalletAuthStatus("error");
        setWalletAuthError("nonce 발급 실패");
        notify("지갑 인증 nonce를 가져오지 못했습니다.");
        return;
      }
      setWalletAuthStatus("signing");
      const signature = await signWalletLoginMessage(provider, address, message);
      if (!signature) {
        setWalletAuthStatus("error");
        setWalletAuthError("서명 취소/실패");
        return;
      }
      setWalletAuthStatus("verifying");
      const data = await apiClient.request("/api/auth/wallet", {
        method: "POST",
        body: JSON.stringify({
          provider,
          address,
          nonce,
          signature,
          email: walletEmail,
          password,
          nickname: walletNickname,
          referralCode: referralInput,
          myReferralCode,
        }),
      });
      const user = applyAuthSuccess(data, walletEmail);
      setAccountType(`${provider} 지갑`);
      setLinkedWallet(address);
      setWalletAccount((prev) => ({ ...prev, provider, address }));
      setMergeStatus(data?.linkedBy === "email" ? "이메일 계정에 지갑 연동 완료" : "지갑 기준 계정 로그인 완료");
      setWalletAuthStatus("success");
      setTimeout(() => {
        setWalletAuthStatus("idle");
        setWalletAuthError("");
      }, 2000);
      notify(user?.email?.includes("@wallet.tetherget.local") ? "지갑 가입 완료: 다음 단계에서 지메일을 연결하세요." : "지갑 로그인 완료");
    } catch (error) {
      setWalletAuthStatus("error");
      setWalletAuthError(error.message || "검증 실패");
      setTimeout(() => {
        setWalletAuthStatus("idle");
        setWalletAuthError("");
      }, 3000);
      notify(error.message || "지갑 가입/로그인에 실패했습니다.");
    }
  }

  async function signWalletLoginMessage(provider, address, message) {
    try {
      const providerLower = String(provider || "").toLowerCase();
      const isEvm = providerLower.includes("metamask")
        || providerLower.includes("okx")
        || providerLower.includes("trust")
        || providerLower.includes("coinbase");
      if (isEvm) {
        const ethereum = window?.ethereum;
        if (!ethereum?.request) {
          notify("EVM 지갑 확장(예: MetaMask)을 찾을 수 없습니다.");
          return "";
        }
        const accounts = await ethereum.request({ method: "eth_requestAccounts" });
        const activeAddress = String(accounts?.[0] || "").toLowerCase();
        if (!activeAddress || activeAddress !== String(address || "").toLowerCase()) {
          notify("입력한 지갑 주소와 현재 연결된 EVM 주소가 다릅니다.");
          return "";
        }
        const signature = await ethereum.request({
          method: "personal_sign",
          params: [message, activeAddress],
        });
        return String(signature || "");
      }
      const solana = window?.solana;
      if (!solana?.isPhantom && !solana?.isSolflare && !solana?.signMessage) {
        notify("Solana 지갑(Phantom/Solflare)의 signMessage를 사용할 수 없습니다.");
        return "";
      }
      if (!solana?.publicKey) {
        await solana.connect();
      }
      const connectedAddress = String(solana?.publicKey?.toString?.() || "");
      if (!connectedAddress || connectedAddress !== String(address || "")) {
        notify("입력한 지갑 주소와 현재 연결된 Solana 주소가 다릅니다.");
        return "";
      }
      const encodedMessage = new TextEncoder().encode(message);
      const signed = await solana.signMessage(encodedMessage, "utf8");
      const signatureBytes = signed?.signature || signed;
      if (!signatureBytes) {
        notify("지갑 서명값을 가져오지 못했습니다.");
        return "";
      }
      const bytes = signatureBytes instanceof Uint8Array ? signatureBytes : new Uint8Array(signatureBytes);
      const signature = btoa(String.fromCharCode(...bytes));
      return signature ? bs58EncodeFromBase64(signature) : "";
    } catch (error) {
      notify(error?.message || "지갑 서명 요청이 취소되었거나 실패했습니다.");
      return "";
    }
  }

  function bs58EncodeFromBase64(base64Value) {
    const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    const bytes = Uint8Array.from(atob(base64Value), (c) => c.charCodeAt(0));
    if (!bytes.length) return "";
    let digits = [0];
    for (let i = 0; i < bytes.length; i += 1) {
      let carry = bytes[i];
      for (let j = 0; j < digits.length; j += 1) {
        const x = digits[j] * 256 + carry;
        digits[j] = x % 58;
        carry = Math.floor(x / 58);
      }
      while (carry) {
        digits.push(carry % 58);
        carry = Math.floor(carry / 58);
      }
    }
    let prefix = "";
    for (let i = 0; i < bytes.length && bytes[i] === 0; i += 1) prefix += "1";
    return prefix + digits.reverse().map((d) => alphabet[d]).join("");
  }

  async function handleLinkEmailToWalletAccount() {
    if (!authToken) {
      notify("먼저 지갑 계정으로 로그인하세요.");
      return;
    }
    const email = walletEmailInput.trim().toLowerCase();
    const password = walletEmailPasswordInput.trim();
    if (!isValidEmail(email)) {
      notify("유효한 지메일을 입력하세요.");
      return;
    }
    if (password.length < 6) {
      notify("이메일 로그인 비밀번호는 6자 이상이어야 합니다.");
      return;
    }
    try {
      const data = await apiClient.request("/api/auth/me/email-link", {
        method: "PUT",
        auth: true,
        body: JSON.stringify({ email, password }),
      });
      applyAuthSuccess(data, email);
      setAccountType("이메일 + 지갑 통합 계정");
      setLinkedGoogle(String(email).trim().toLowerCase());
      setMergeStatus("지갑 계정에 지메일 통합 완료");
      notify("지메일 연결 완료: 이메일/지갑 로그인 모두 같은 계정으로 인식됩니다.");
    } catch (error) {
      notify(error.message || "지메일 연결에 실패했습니다.");
    }
  }

  async function connectMyWallet(provider, address) {
    if (!authToken) {
      notify("로그인이 필요합니다.");
      return;
    }
    try {
      const data = await apiClient.request("/api/wallet/me/connect", {
        method: "PUT",
        auth: true,
        body: JSON.stringify({ provider, address }),
      });
      if (data?.wallet) {
        setWalletAccount(data.wallet);
        setLinkedWallet(data.wallet.address || "");
      }
      notify("지갑 연결이 완료되었습니다.");
    } catch (error) {
      notify(error.message || "지갑 연결에 실패했습니다.");
    }
  }

  async function requestWithdrawal() {
    if (!authToken) {
      notify("로그인이 필요합니다.");
      return;
    }
    const amount = Number(withdrawAmountInput || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      notify("출금 금액을 입력하세요.");
      return;
    }
    try {
      await apiClient.request("/api/finance/withdrawals", {
        method: "POST",
        auth: true,
        body: JSON.stringify({ amount, note: withdrawNoteInput }),
      });
      const financeData = await apiClient.request("/api/finance/me", { auth: true });
      if (financeData?.account) {
        const a = financeData.account;
        setFinanceAccount({
          availableBalance: Number(a.availableBalance ?? 0),
          referralEarningsTotal: Number(a.referralEarningsTotal ?? 0),
          pendingWithdrawal: Number(a.pendingWithdrawal ?? 0),
          p2pEscrowLocked: Number(a.p2pEscrowLocked ?? 0),
          updatedAt: String(a.updatedAt || ""),
        });
      }
      if (Array.isArray(financeData?.withdrawals)) setWithdrawRequests(financeData.withdrawals);
      setWithdrawAmountInput("");
      setWithdrawNoteInput("");
      notify("출금 신청이 접수되었습니다. 회사 지갑에서 처리됩니다.");
    } catch (error) {
      notify(error.message || "출금 신청에 실패했습니다.");
    }
  }

  async function saveMyNickname() {
    if (!authToken) {
      notify("로그인이 필요합니다.");
      return;
    }
    const trimmed = String(nickname || "").trim();
    if (!trimmed) {
      notify("닉네임을 입력하세요.");
      return;
    }
    try {
      setIsSavingNickname(true);
      const data = await apiClient.request("/api/me/nickname", {
        method: "PUT",
        auth: true,
        body: JSON.stringify({ nickname: trimmed }),
      });
      const savedNickname = data?.user?.nickname || trimmed;
      setNickname(savedNickname);
      notify("닉네임이 저장되었습니다.");
    } catch (error) {
      notify(error.message || "닉네임 저장에 실패했습니다.");
    } finally {
      setIsSavingNickname(false);
    }
  }

  function openPage(key) {
    const guestAllowed = key === "trade" || key === "support" || key === "sell";
    if (!loggedIn && !guestAllowed) {
      notify("로그인 후 이용할 수 있습니다.");
      return;
    }
    if (key === "sell") {
      requireLogin(() => setSellOpen(true));
      return;
    }
    if (key === "admin") {
      if (!loggedIn) {
        setLoginOpen(true);
        notify("로그인이 필요합니다.");
        return;
      }
      const allowed = canAccessAdminSafe(adminGateUser);
      if (import.meta.env.DEV) {
        console.log("[tg-admin-open]", {
          allowed,
          email: adminGateUser?.email,
          role: adminGateUser?.role,
          session_role: adminGateUser?.session_role,
          isSuperAdmin: adminGateUser?.isSuperAdmin,
          nextPage: allowed ? "admin" : "admin-denied",
        });
      }
      flushSync(() => {
        setMenuOpen(false);
        setTradePushOpen(false);
        setGeneralNotifOpen(false);
        setActivePage(allowed ? "admin" : "admin-denied");
      });
      return;
    }
    setActivePage(key);
  }

  function navigateFromNotification(target) {
    setTradePushOpen(false);
    setGeneralNotifOpen(false);
    const dest = String(target || "trade");
    if (dest === "messenger") {
      setActivePage("messenger");
      return;
    }
    if (dest === "mytrades") {
      setActivePage("mytrades");
      return;
    }
    if (dest === "trade") {
      setActivePage("trade");
      return;
    }
    if (dest === "support") {
      setActivePage("support");
      return;
    }
    if (dest === "myinfo") {
      setActivePage("myinfo");
      return;
    }
    if (dest === "admin") {
      const allowed = canAccessAdminSafe(adminGateUser);
      setActivePage(allowed ? "admin" : "admin-denied");
      return;
    }
    setActivePage("trade");
  }

  function appendAdminAction(action) {
    setAdminActionLogs((prev) => [
      { id: `ADMIN-ACTION-${Date.now()}`, action, role: currentRole, time: new Date().toLocaleTimeString("ko-KR", { hour12: false }) },
      ...prev.slice(0, 49),
    ]);
  }

  async function registerDisputeCase(payload) {
    try {
      const created = await apiClient.request("/api/disputes", {
        method: "POST",
        auth: true,
        body: JSON.stringify(payload),
      });
      appendAdminAction(`분쟁 접수: ${created.id || "신규"}`);
      const data = await apiClient.request("/api/admin/disputes", { auth: true });
      setDisputeCases(Array.isArray(data.disputes) ? data.disputes : []);
      notify(`분쟁이 접수되었습니다. ${escrowPolicy.requiredApprovals}인 승인 후 메인 관리자 최종승인이 필요합니다.`);
    } catch (error) {
      notify(error.message || "분쟁 접수에 실패했습니다.");
    }
  }

  async function approveDisputeCase(caseId, approverId) {
    if (!approverId) return;
    if (!escrowPolicy.approverIds.includes(approverId)) {
      notify("지정 승인자만 결재할 수 있습니다.");
      return;
    }
    try {
      await apiClient.request(`/api/admin/disputes/${caseId}/approve`, {
        method: "POST",
        auth: true,
        body: JSON.stringify({}),
      });
      const data = await apiClient.request("/api/admin/disputes", { auth: true });
      setDisputeCases(Array.isArray(data.disputes) ? data.disputes : []);
    } catch (error) {
      notify(error.message || "승인 처리에 실패했습니다.");
    }
  }

  async function finalizeDisputeByMain(caseId, actorId, pin, otp) {
    if (actorId !== escrowPolicy.mainFinalApproverId) {
      notify("메인 관리자 최종승인 계정만 반환 확정할 수 있습니다.");
      return;
    }
    try {
      await apiClient.request(`/api/admin/disputes/${caseId}/finalize`, {
        method: "POST",
        auth: true,
        body: JSON.stringify({ pin, otp }),
      });
      appendAdminAction(`메인 관리자 최종승인 완료: ${caseId}`);
      const data = await apiClient.request("/api/admin/disputes", { auth: true });
      setDisputeCases(Array.isArray(data.disputes) ? data.disputes : []);
      setFinalApprovalPinInput("");
      setFinalApprovalOtpInput("");
    } catch (error) {
      notify(error.message || "최종승인 처리에 실패했습니다.");
    }
  }

  function isInstantReleaseAvailable(friend) {
    if (!friend) return false;
    const matchStatus = friend.status === "완전매칭" || friend.status === "거래매칭";
    return matchStatus && friend.instantRelease;
  }

  function formatChatTime() {
    return new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
  }

  function openFriendChat(friendId) {
    if (!friendId) return;
    setSelectedFriendId(friendId);
    setActivePage("messenger");
    setFriends((prev) => prev.map((friend) => (friend.id === friendId ? { ...friend, unread: 0 } : friend)));
  }

  function openFriendTrade(friendId) {
    if (!friendId) return;
    setTradeTargetFriendId(friendId);
    setFriendTradeAmount("");
    setFriendTradeFinalStep(false);
    setFriendTradePopup(true);
  }

  function proceedFriendTrade(friend) {
    if (!friend) return;
    const requestedAmount = Number(friendTradeAmount || 0);
    const maxAmount = Number(friend.sellAmount || 0);
    if (!requestedAmount || requestedAmount <= 0) {
      notify("거래할 수량을 입력하세요.");
      return;
    }
    if (requestedAmount > maxAmount) {
      notify(`최대 ${number(maxAmount)} ${friend.sellCoin}까지 거래 가능합니다.`);
      return;
    }
    setFriendTradeFinalStep(true);
  }

  function startFriendTrade(friend) {
    if (!friend) return;
    const requestedAmount = Number(friendTradeAmount || 0);
    setFriendTradePopup(false);
    setFriendTradeFinalStep(false);
    setActivePage("trade");
    setCoin(friend.sellCoin || "USDT");
    setAmount(requestedAmount);
    notify(`${friend.nickname}와 ${number(requestedAmount)} ${friend.sellCoin} 부분 거래를 시작합니다.`);
  }

  function selectFriend(friendId) {
    if (!friendId) return;
    setSelectedFriendId(friendId);
    setFriends((prev) => prev.map((friend) => (friend.id === friendId ? { ...friend, unread: 0 } : friend)));
  }

  function sendFriendMessage() {
    const trimmed = chatInput.trim();
    if (!selectedFriendId || !trimmed) return;
    const nextMessage = {
      id: `${selectedFriendId}-${Date.now()}`,
      sender: "me",
      text: trimmed,
      deleted: false,
      createdAt: formatChatTime(),
    };
    setChatRooms((prev) => ({
      ...prev,
      [selectedFriendId]: [...(prev[selectedFriendId] || []), nextMessage],
    }));
    setChatInput("");
  }

  function sendFriendAttachment(file) {
    if (!selectedFriendId || !file) return;
    const isImage = file.type.startsWith("image/");
    const isAudio = file.type.startsWith("audio/");
    const nextMessage = {
      id: `${selectedFriendId}-FILE-${Date.now()}`,
      sender: "me",
      text: isImage ? "이미지를 전송했습니다." : isAudio ? "음성 메시지를 전송했습니다." : `${file.name} 파일을 전송했습니다.`,
      deleted: false,
      createdAt: formatChatTime(),
      attachment: {
        name: file.name,
        type: file.type || "application/octet-stream",
        size: file.size || 0,
        previewUrl: isImage ? URL.createObjectURL(file) : "",
        audioUrl: isAudio ? URL.createObjectURL(file) : "",
      },
    };
    setChatRooms((prev) => ({
      ...prev,
      [selectedFriendId]: [...(prev[selectedFriendId] || []), nextMessage],
    }));
  }

  function deleteFriendMessage(friendId, messageId) {
    if (!friendId || !messageId) return;
    setChatRooms((prev) => ({
      ...prev,
      [friendId]: (prev[friendId] || []).map((message) =>
        message.id === messageId ? { ...message, deleted: true, text: "삭제된 메시지입니다." } : message
      ),
    }));
  }

  function clearFriendMessages(friendId) {
    if (!friendId) return;
    setChatRooms((prev) => ({ ...prev, [friendId]: [] }));
  }

  const walletAuthStatusMeta = {
    idle: { label: "대기중", className: theme === "dark" ? "bg-slate-600 text-white" : "bg-slate-300 text-slate-800" },
    nonce: { label: "1/3 nonce 발급중", className: "bg-amber-500 text-white" },
    signing: { label: "2/3 지갑 서명 대기중", className: "bg-blue-600 text-white" },
    verifying: { label: "3/3 서명 검증중", className: "bg-indigo-600 text-white" },
    success: { label: "인증 완료", className: "bg-emerald-600 text-white" },
    error: { label: "인증 실패", className: "bg-red-600 text-white" },
  };
  const walletStatus = walletAuthStatusMeta[walletAuthStatus] || walletAuthStatusMeta.idle;
  const walletAuthBusy = walletAuthStatus === "nonce" || walletAuthStatus === "signing" || walletAuthStatus === "verifying";

  return (
    <LanguageCodeContext.Provider value={language}>
    <LangContext.Provider value={lang}>
    <div className={`min-h-screen ${t.page}`}>
      {toast && <div className="fixed left-1/2 top-5 z-[520] -translate-x-1/2 rounded-2xl bg-black px-5 py-3 text-sm font-black text-white shadow-xl">{toast}</div>}
      {runtimeEmergencyState.emergencyMode && (
        <div className="sticky top-0 z-[95] border-b border-red-400/40 bg-red-600/95 px-4 py-2 text-center text-xs font-black text-white">
          비상 점검 모드 활성화: {runtimeEmergencyState.emergencyReason || "관리자 복구 작업 진행 중"}
          {runtimeEmergencyState.emergencyEta ? ` · ETA ${runtimeEmergencyState.emergencyEta}` : ""}
          {" · "}
          {runtimeEmergencyState.updatedAt || ""}
        </div>
      )}

      {loginOpen && (
        <Modal
          title="로그인"
          desc="이메일·비밀번호 하나로 통합 로그인합니다. 서버가 꺼져 있어도 본사(/owner)에서 발급한 테스트 계정·시드 계정은 로컬로 로그인됩니다. 실제 지메일 가입은 아래 ‘실제 서비스 가입’에서 진행하세요."
          onClose={() => setLoginOpen(false)}
          theme={t}
        >
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setAuthTab("login")}
              className={`rounded-2xl border px-4 py-3 font-black ${authTab === "login" ? t.main : t.input}`}
            >
              로그인
            </button>
            <button
              type="button"
              onClick={() => setAuthTab("signup")}
              className={`rounded-2xl border px-4 py-3 font-black ${authTab === "signup" ? t.main : t.input}`}
            >
              실제 지메일 회원가입
            </button>
          </div>
          <Field label="이메일" theme={t}>
            <input
              list="tg-login-email-suggestions"
              value={authEmail}
              onChange={(e) => setAuthEmail(e.target.value)}
              className={`rounded-2xl border px-4 py-3 font-bold outline-none ${t.input}`}
              placeholder="발급받은 테스트 또는 본인 지메일"
              autoComplete="username"
            />
          </Field>
          <datalist id="tg-login-email-suggestions">
            {savedLoginEmails.map((em) => (
              <option key={em} value={em} />
            ))}
          </datalist>
          <Field label="비밀번호" theme={t}>
            <input
              type="password"
              value={authPassword}
              onChange={(e) => setAuthPassword(e.target.value)}
              className={`rounded-2xl border px-4 py-3 font-bold outline-none ${t.input}`}
              placeholder="6자 이상"
              autoComplete="current-password"
            />
          </Field>
          {authTab === "login" && (
            <>
              <label className={`flex cursor-pointer items-start gap-2 text-xs font-bold leading-snug ${t.subtext}`}>
                <input
                  type="checkbox"
                  checked={loginRememberEmail}
                  onChange={(e) => setLoginRememberEmail(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-400"
                />
                <span>이메일 자동 저장 (이 브라우저에만 저장 · 비밀번호는 저장하지 않습니다)</span>
              </label>
              {savedLoginEmails.length > 0 ? (
                <div className={`rounded-2xl border p-3 ${t.cardSoft}`}>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-black">최근 로그인 이메일</span>
                    <button type="button" className={`text-[11px] font-bold underline ${t.muted}`} onClick={clearLoginEmailHistory}>
                      기록 삭제
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {savedLoginEmails.map((em) => (
                      <button
                        key={em}
                        type="button"
                        onClick={() => setAuthEmail(em)}
                        className={`max-w-[min(100%,220px)] truncate rounded-xl border px-2.5 py-1 text-[11px] font-bold ${t.input}`}
                      >
                        {em}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          )}
          {authTab === "signup" && (
            <>
              <Field label="비밀번호 확인" theme={t}>
                <input
                  type="password"
                  value={authPasswordConfirm}
                  onChange={(e) => setAuthPasswordConfirm(e.target.value)}
                  className={`rounded-2xl border px-4 py-3 font-bold outline-none ${t.input}`}
                  placeholder="비밀번호 재입력"
                />
              </Field>
              <Field label="닉네임" theme={t}>
                <input
                  value={authNickname}
                  onChange={(e) => setAuthNickname(e.target.value)}
                  className={`rounded-2xl border px-4 py-3 font-bold outline-none ${t.input}`}
                  placeholder="표시 닉네임"
                />
              </Field>
            </>
          )}
          <button type="button" onClick={handleAuthSubmit} className={`w-full rounded-2xl px-5 py-4 font-black ${t.main}`}>
            {authTab === "signup" ? "실제 서비스 회원가입 (API)" : "로그인"}
          </button>
          <div className={`rounded-2xl border p-3 text-xs ${t.cardSoft}`}>
            시드 테스트 계정 10개: 본사 <b>admin@tetherget.com</b>/<b>hq2@tetherget.test</b>, 영업{" "}
            <b>sales@… · sales2~4@tetherget.test</b>, 일반 <b>member1~4@tetherget.test</b>. 신규 공통 비번{" "}
            <b>Test1234</b>(기존 admin/sales 예외). 목록은 코드 <code className="text-[11px]">testAccountRegistry.js</code> 시드 참고. 발급은{" "}
            <a href="/owner" className="font-black underline">/owner</a>.
          </div>
          <details className={`rounded-2xl border p-3 ${t.cardSoft}`}>
            <summary className="cursor-pointer text-sm font-black">실제 서비스 · Google · 지갑</summary>
            <p className={`mb-3 mt-2 text-xs ${t.subtext}`}>실사용자 가입·Google OAuth·지갑 연동은 아래에서만 사용합니다.</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setLoginMode("google")}
              className={`rounded-2xl border px-4 py-3 font-black ${loginMode === "google" ? t.main : t.input}`}
            >
              이메일 로그인/가입
            </button>
            <button
              onClick={() => setLoginMode("wallet")}
              className={`rounded-2xl border px-4 py-3 font-black ${loginMode === "wallet" ? t.main : t.input}`}
            >
              지갑 로그인/가입
            </button>
          </div>

          {loginMode === "google" && (
            <>
              <button
                onClick={handleGoogleClickLogin}
                className={`rounded-2xl border px-5 py-4 font-black ${t.input}`}
              >
                Google 클릭 로그인
              </button>
              <Field label="1) 아이디(지메일)" theme={t}>
                <input
                  list="tg-login-email-suggestions"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  className={`rounded-2xl border px-4 py-3 font-bold outline-none ${t.input}`}
                  placeholder="예: user@gmail.com"
                />
              </Field>
              <Field label="추천인 코드 (선택)" theme={t}>
                <input
                  value={referralInput}
                  onChange={(e) => setReferralInput(e.target.value)}
                  className={`rounded-2xl border px-4 py-3 font-bold outline-none ${t.input}`}
                  placeholder="추천인 코드 입력"
                />
              </Field>
              <button
                onClick={handleAuthSubmit}
                className={`rounded-2xl px-5 py-4 font-black ${t.main}`}
              >
                1단계: 아이디(지메일)로 가입 / 로그인
              </button>
              <button
                onClick={() => connectMyWallet(walletProvider, phantomWallet)}
                className={`rounded-2xl border px-5 py-4 font-black ${t.input}`}
              >
                2단계: 로그인 후 지갑 연결
              </button>
            </>
          )}

          {loginMode === "wallet" && (
            <>
              <Field label="1) 지갑 종류 선택" theme={t}>
                <select
                  value={walletProvider}
                  onChange={(e) => setWalletProvider(e.target.value)}
                  className={`rounded-2xl border px-4 py-3 font-bold outline-none ${t.input}`}
                >
                  <option>Phantom</option>
                  <option>Solflare</option>
                  <option>Backpack</option>
                  <option>MetaMask</option>
                  <option>OKX Wallet</option>
                  <option>Trust Wallet</option>
                  <option>Coinbase Wallet</option>
                </select>
              </Field>

              <Field label={`2) ${walletProvider} 지갑 주소`} theme={t}>
                <input
                  value={phantomWallet}
                  onChange={(e) => setPhantomWallet(e.target.value)}
                  className={`rounded-2xl border px-4 py-3 font-bold outline-none ${t.input}`}
                  placeholder={`${walletProvider} 지갑 주소`}
                />
              </Field>
              <Field label="3) 닉네임 (신규 가입 시 필수)" theme={t}>
                <input
                  value={walletNicknameInput}
                  onChange={(e) => setWalletNicknameInput(e.target.value)}
                  className={`rounded-2xl border px-4 py-3 font-bold outline-none ${t.input}`}
                  placeholder="표시 닉네임"
                />
              </Field>
              <Field label="4) 비밀번호 (이메일 로그인용)" theme={t}>
                <input
                  type="password"
                  value={walletPasswordInput}
                  onChange={(e) => setWalletPasswordInput(e.target.value)}
                  className={`rounded-2xl border px-4 py-3 font-bold outline-none ${t.input}`}
                  placeholder="6자 이상"
                />
              </Field>
              <Field label="5) 아이디(지메일) (선택: 기존 계정 즉시 통합)" theme={t}>
                <input
                  value={walletEmailInput}
                  onChange={(e) => setWalletEmailInput(e.target.value)}
                  className={`rounded-2xl border px-4 py-3 font-bold outline-none ${t.input}`}
                  placeholder="예: user@gmail.com"
                />
              </Field>
              <Field label="추천인 코드 (선택)" theme={t}>
                <input
                  value={referralInput}
                  onChange={(e) => setReferralInput(e.target.value)}
                  className={`rounded-2xl border px-4 py-3 font-bold outline-none ${t.input}`}
                  placeholder="추천인 코드 입력"
                />
              </Field>
              <div className="rounded-2xl border p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-xs font-black">지갑 인증 상태</div>
                  <span className={`rounded-full px-2 py-1 text-xs font-black ${walletStatus.className}`}>{walletStatus.label}</span>
                </div>
                {!!walletAuthError && <div className="text-xs text-red-400">사유: {walletAuthError}</div>}
                {!walletAuthError && <div className={`text-xs ${t.subtext}`}>nonce 발급 → 지갑 서명 → 서버 검증 순서로 진행됩니다.</div>}
              </div>
              <button
                onClick={handleWalletAuthSubmit}
                disabled={walletAuthBusy}
                className={`rounded-2xl px-5 py-4 font-black ${walletAuthBusy ? "bg-slate-500 text-white" : t.main}`}
              >
                {walletAuthBusy ? "지갑 서명/검증 진행중..." : "지갑으로 가입 / 로그인 (아이디 통합 지원)"}
              </button>
              <Field label="지메일 연결 비밀번호 (로그인 후 사용)" theme={t}>
                <input
                  type="password"
                  value={walletEmailPasswordInput}
                  onChange={(e) => setWalletEmailPasswordInput(e.target.value)}
                  className={`rounded-2xl border px-4 py-3 font-bold outline-none ${t.input}`}
                  placeholder="이메일 로그인 비밀번호 (6자 이상)"
                />
              </Field>
              <button
                onClick={handleLinkEmailToWalletAccount}
                className={`rounded-2xl border px-5 py-4 font-black ${t.input}`}
              >
                로그인 후 아이디(지메일) 추가 연결
              </button>
            </>
          )}

          <div className={`rounded-3xl p-4 text-sm ${t.cardSoft}`}>
            <div className="font-black">계정 합산 원칙</div>
            <div className={`mt-2 leading-6 ${t.subtext}`}>
              가입 시 닉네임은 고유값으로 저장됩니다. 지갑으로 먼저 가입한 뒤 지메일을 추가하면, 다음 로그인에서 지메일/지갑 둘 다 같은 계정으로 인식됩니다. 레퍼럴/회원관리 데이터도 동일 계정으로 유지됩니다.
            </div>
          </div>
          </details>
        </Modal>
      )}

      {sellOpen && (
        <Modal title="판매 등록" desc="내가 판매하는 자산과 받을 종류를 먼저 선택합니다." onClose={() => setSellOpen(false)} theme={t}>
          <Field label="1. 내가 판매하는 자산" theme={t}>
            <select
              value={sellAsset}
              onChange={(e) => setSellAsset(e.target.value)}
              className={`rounded-2xl border px-4 py-3 font-bold outline-none ${t.input}`}
            >
              <option>USDT</option>
              <option>SOL</option>
              <option>BTC</option>
              <option>ETH</option>
            </select>
          </Field>

          <Field label="2. 받을 종류 선택" theme={t}>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => { setReceiveType("통화"); setReceiveAsset("KRW"); }}
                className={`rounded-2xl border px-4 py-3 font-black ${receiveType === "통화" ? t.main : t.input}`}
              >
                통화로 받기
              </button>
              <button
                onClick={() => { setReceiveType("코인"); setReceiveAsset("USDT"); }}
                className={`rounded-2xl border px-4 py-3 font-black ${receiveType === "코인" ? t.main : t.input}`}
              >
                코인으로 받기
              </button>
            </div>
          </Field>

          <Field label={receiveType === "통화" ? "3. 받을 통화 종류" : "3. 받을 코인 종류"} theme={t}>
            <select
              value={receiveAsset}
              onChange={(e) => setReceiveAsset(e.target.value)}
              className={`rounded-2xl border px-4 py-3 font-bold outline-none ${t.input}`}
            >
              {receiveType === "통화" ? (
                <>
                  <option>KRW</option>
                  <option>USD</option>
                  <option>VND</option>
                  <option>JPY</option>
                </>
              ) : (
                <>
                  <option>USDT</option>
                  <option>SOL</option>
                  <option>BTC</option>
                  <option>ETH</option>
                </>
              )}
            </select>
          </Field>

          <div className={`rounded-3xl p-4 ${t.cardSoft}`}>
            <div className="text-sm font-black">판매 조건 입력</div>
            <div className={`mt-1 text-xs ${t.muted}`}>
              {sellAsset}를 판매하고 {receiveAsset}로 받는 조건입니다.
            </div>
          </div>

          <Field label={`4. 판매 수량 (${sellAsset})`} theme={t}>
            <input
              value={sellAmount}
              onChange={(e) => setSellAmount(e.target.value)}
              className={`rounded-2xl border px-4 py-3 font-bold outline-none ${t.input}`}
              placeholder={`예: 1000 ${sellAsset}`}
            />
          </Field>

          <Field label={receiveType === "통화" ? `5. 희망 환율 (1 ${sellAsset} = ? ${receiveAsset})` : `5. 교환 비율 (1 ${sellAsset} = ? ${receiveAsset})`} theme={t}>
            <div className={`rounded-3xl p-4 ${t.cardSoft}`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-bold opacity-70">현재 실시간 기준가</div>
                  <div className="mt-1 text-xl font-black">
                    1 {sellAsset} = {rateText(marketRate, receiveAsset, receiveType)}
                  </div>
                </div>
                <button
                  onClick={() => setSellRate(String(marketRate))}
                  className={`rounded-2xl px-4 py-3 text-sm font-black ${t.main}`}
                >
                  현재가 적용
                </button>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                <button onClick={() => setSellRate(String(marketRateMinus))} className={`rounded-2xl border px-3 py-2 font-black ${t.input}`}>-1%</button>
                <button onClick={() => setSellRate(String(marketRate))} className={`rounded-2xl border px-3 py-2 font-black ${t.input}`}>현재가</button>
                <button onClick={() => setSellRate(String(marketRatePlus))} className={`rounded-2xl border px-3 py-2 font-black ${t.input}`}>+1%</button>
              </div>
            </div>

            <input
              value={sellRate}
              onChange={(e) => setSellRate(e.target.value)}
              className={`rounded-2xl border px-4 py-3 font-bold outline-none ${t.input}`}
              placeholder={receiveType === "통화" ? `예: ${marketRate} ${receiveAsset}` : `예: ${marketRate} ${receiveAsset}`}
            />
          </Field>

          <div className={`rounded-3xl p-4 text-sm ${t.cardSoft}`}>
            <div className="flex justify-between py-1">
              <span>판매 자산</span>
              <b>{sellAsset}</b>
            </div>
            <div className="flex justify-between py-1">
              <span>받을 종류</span>
              <b>{receiveType}</b>
            </div>
            <div className="flex justify-between py-1">
              <span>받을 자산</span>
              <b>{receiveAsset}</b>
            </div>
            <div className="mt-2 border-t border-white/20 pt-2">
              <div className="flex justify-between py-1">
                <span>판매자 수수료 1%</span>
                <b>{sellAmount ? `${(Number(sellAmount) * 0.01).toFixed(4)} ${sellAsset}` : `0 ${sellAsset}`}</b>
              </div>
              <div className="flex justify-between py-1">
                <span>판매자 총 예치 필요</span>
                <b>{sellAmount ? `${(Number(sellAmount) * 1.01).toFixed(4)} ${sellAsset}` : `0 ${sellAsset}`}</b>
              </div>
            </div>
          </div>

          <button
            onClick={() => { setSellOpen(false); notify(`${sellAsset} 판매 등록 완료`); }}
            className={`rounded-2xl px-5 py-4 font-black ${t.main}`}
          >
            판매 등록 완료
          </button>
        </Modal>
      )}

      {friendTradePopup && (
        <Modal
          title="친구 거래 신청"
          desc={`${tradeTargetFriend?.nickname || "선택 친구"}와 거래 정책을 확인하세요.`}
          onClose={() => setFriendTradePopup(false)}
          theme={t}
        >
          <div className={`rounded-2xl border p-4 text-sm ${t.cardSoft}`}>
            <div className="font-black">즉시송금 가능 여부</div>
            <div className={`mt-2 ${t.subtext}`}>
              대상: {tradeTargetFriend?.id || "-"} · 상태: {tradeTargetFriend?.status || "-"} · 즉시 릴리즈 설정:{" "}
              {tradeTargetFriend?.instantRelease ? "true" : "false"}
            </div>
            <div className={`mt-2 ${t.subtext}`}>
              판매 상태: {tradeTargetFriend?.selling ? "판매중" : "판매 대기"} · 판매 금액:{" "}
              {tradeTargetFriend?.selling ? `${number(tradeTargetFriend?.sellAmount)} ${tradeTargetFriend?.sellCoin}` : "-"}
            </div>
            <div className="mt-2 font-black">
              {isInstantReleaseAvailable(tradeTargetFriend) ? "즉시송금 가능" : "지연 릴리즈 적용"}
            </div>
          </div>
          <Field label={`거래 수량 입력 (${tradeTargetFriend?.sellCoin || "USDT"})`} theme={t}>
            <input
              value={friendTradeAmount}
              onChange={(e) => setFriendTradeAmount(e.target.value)}
              className={`rounded-2xl border px-4 py-3 font-bold outline-none ${t.input}`}
              placeholder={`최대 ${number(tradeTargetFriend?.sellAmount || 0)} ${tradeTargetFriend?.sellCoin || "USDT"}`}
            />
          </Field>
          <div className={`rounded-2xl border p-3 text-sm ${t.cardSoft}`}>
            <div className="flex justify-between">
              <span>요청 거래 수량</span>
              <b>{friendTradeAmount ? `${number(friendTradeAmount)} ${tradeTargetFriend?.sellCoin || "USDT"}` : "-"}</b>
            </div>
            <div className="mt-1 flex justify-between">
              <span>최대 가능 수량</span>
              <b>{`${number(tradeTargetFriend?.sellAmount || 0)} ${tradeTargetFriend?.sellCoin || "USDT"}`}</b>
            </div>
          </div>
          <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm leading-6">
            <div className="font-black">즉시 릴리즈 안내</div>
            <div className="mt-2">{instantReleasePolicyText}</div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => {
                proceedFriendTrade(tradeTargetFriend);
              }}
              className={`rounded-2xl px-4 py-3 font-black ${tradeTargetFriend?.selling ? t.main : "bg-slate-500 text-white"}`}
              disabled={!tradeTargetFriend?.selling}
            >
              바로 거래하기
            </button>
            <button onClick={() => setFriendTradePopup(false)} className={`rounded-2xl border px-4 py-3 font-black ${t.input}`}>
              취소
            </button>
          </div>
          {friendTradeFinalStep && (
            <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4">
              <div className="text-sm font-black">최종적으로 구매하시겠습니까?</div>
              <div className={`mt-1 text-sm ${t.subtext}`}>
                {tradeTargetFriend?.nickname || "선택 친구"} · {number(friendTradeAmount || 0)} {tradeTargetFriend?.sellCoin || "USDT"}
              </div>
              <button
                onClick={() => startFriendTrade(tradeTargetFriend)}
                className="mt-3 w-full rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-black text-white"
              >
                최종 구매
              </button>
            </div>
          )}
        </Modal>
      )}

      <header className={`sticky top-0 z-[300] isolate overflow-x-hidden border-b ${t.header}`}>
          <div
            className={`mx-auto flex min-w-0 max-w-7xl items-center px-3 sm:px-4 ${
              loggedIn
                ? "min-h-[56px] max-h-16 gap-0.5 py-1.5 sm:min-h-[56px] sm:max-h-16 sm:gap-1 sm:py-2"
                : "min-h-[3.5rem] gap-2 py-3 sm:min-h-0 sm:gap-3 sm:py-4"
            }`}
          >
          <button type="button" onClick={() => setActivePage("trade")} className="min-w-0 shrink-0 text-left">
            <div className={`truncate font-black leading-none ${loggedIn ? "text-[15px] sm:text-base" : "text-lg leading-tight sm:text-xl"}`}>TetherGet</div>
            {!loggedIn ? (
              <div className={`hidden truncate text-[10px] font-medium sm:block sm:text-xs ${t.muted}`}>Decentralized P2P Escrow MVP</div>
            ) : null}
          </button>

          <nav
            className="relative z-[301] mx-auto hidden min-h-0 min-w-0 max-w-full flex-1 justify-center pointer-events-auto md:flex md:flex-wrap md:gap-x-1 md:gap-y-0.5 md:overflow-x-hidden md:overflow-y-visible"
          >
            {primaryNavItems.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  openPage(item.key);
                }}
                className={`relative z-[302] shrink-0 cursor-pointer whitespace-nowrap rounded-md font-semibold leading-none ${
                  item.key === "admin" && loggedIn
                    ? "px-1.5 py-0.5 text-[10px] sm:text-[12px]"
                    : loggedIn
                      ? "px-2 py-0.5 text-[11px] sm:text-[13px]"
                      : "px-2 py-1.5 text-sm sm:text-[15px]"
                } ${navActiveKey === item.key ? t.main : `${t.muted} hover:opacity-80`}`}
              >
                {item.key === "admin"
                  ? language === "KR"
                    ? "관리자"
                    : language === "EN"
                      ? "Admin"
                      : item.label
                  : item.label}
              </button>
            ))}
          </nav>

          <div className={`relative z-[280] hidden shrink-0 items-center justify-end md:flex ${loggedIn ? "min-w-0 gap-1" : "flex-wrap gap-2"}`}>
            {loggedIn ? (
              <div ref={notifClusterDesktopRef} className="flex min-w-0 shrink items-center gap-0.5">
                <div className="relative">
                  <button
                    type="button"
                    aria-label={`거래푸시${mockTradeUnread > 0 ? ` ${mockTradeUnread}건` : ""}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setGeneralNotifOpen(false);
                      setTradePushOpen((v) => !v);
                    }}
                    className={`inline-flex max-w-[min(100%,7.5rem)] items-baseline gap-0.5 whitespace-nowrap rounded-lg border px-1.5 py-1 text-[10px] font-semibold leading-none ${t.headerControl ?? t.input}`}
                  >
                    <span className="truncate">거래푸시</span>
                    {mockTradeUnread > 0 ? (
                      <span className="shrink-0 font-black tabular-nums text-red-500">{mockTradeUnread > 99 ? "99+" : mockTradeUnread}</span>
                    ) : null}
                  </button>
                  {tradePushOpen ? (
                    <div className={`absolute right-0 top-full z-[60] mt-1.5 w-[min(96vw,22rem)] rounded-xl border p-2.5 shadow-xl ${t.popover ?? t.card}`}>
                      <TradePushPanel
                        theme={t}
                        items={MOCK_TRADE_PUSH_NOTIFICATIONS}
                        readIds={mockNotifReadIds}
                        setReadIds={setMockNotifReadIds}
                        onNavigateToTarget={navigateFromNotification}
                      />
                    </div>
                  ) : null}
                </div>
                <div className="relative">
                  <button
                    type="button"
                    aria-label={`알림${mockGeneralUnread > 0 ? ` ${mockGeneralUnread}건` : ""}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setTradePushOpen(false);
                      setGeneralNotifOpen((v) => !v);
                    }}
                    className={`inline-flex max-w-[min(100%,6rem)] items-baseline gap-0.5 whitespace-nowrap rounded-lg border px-1.5 py-1 text-[10px] font-semibold leading-none ${t.headerControl ?? t.input}`}
                  >
                    <span>알림</span>
                    {mockGeneralUnread > 0 ? (
                      <span className="shrink-0 font-black tabular-nums text-red-500">{mockGeneralUnread > 99 ? "99+" : mockGeneralUnread}</span>
                    ) : null}
                  </button>
                  {generalNotifOpen ? (
                    <div className={`absolute right-0 top-full z-[60] mt-1.5 w-[min(96vw,22rem)] rounded-xl border p-2.5 shadow-xl ${t.popover ?? t.card}`}>
                      <GeneralAlertPanel
                        theme={t}
                        notifications={MOCK_GENERAL_ALERT_NOTIFICATIONS}
                        readIds={mockNotifReadIds}
                        setReadIds={setMockNotifReadIds}
                        onNavigateToTarget={navigateFromNotification}
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
            <select
              value={language}
              onChange={(e) => {
                setLanguage(e.target.value);
                notify(`${languages.find((l) => l.code === e.target.value)?.label} 언어 적용`);
              }}
              className={`border font-semibold outline-none ${t.headerControl ?? t.input} ${
                loggedIn
                  ? "h-7 max-w-[3.25rem] min-w-0 shrink rounded-md px-1 py-0 text-[10px] leading-tight"
                  : "rounded-xl px-3 py-2 text-sm"
              }`}
            >
              {languages.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {loggedIn ? `${lang.flag} ${lang.code}` : `${lang.flag} ${lang.label}`}
                </option>
              ))}
            </select>
            <button
              type="button"
              aria-label={theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환"}
              title={theme === "dark" ? "현재: 다크 · 클릭 시 라이트" : "현재: 라이트 · 클릭 시 다크"}
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className={`border font-semibold outline-none transition ${t.headerControl ?? t.input} ${
                loggedIn
                  ? "h-7 max-w-[3rem] shrink-0 rounded-md px-1.5 py-0 text-[10px] leading-none"
                  : "rounded-xl px-3 py-2 text-sm"
              }`}
            >
              테마
            </button>
            {loggedIn ? (
              <button onClick={async () => {
                try {
                  if (authRefreshToken) {
                    await apiClient.request("/api/auth/logout", {
                      method: "POST",
                      body: JSON.stringify({ refreshToken: authRefreshToken }),
                    });
                  }
                } catch {}
                setLoggedIn(false);
                setAuthToken("");
                setAuthRefreshToken("");
                localStorage.removeItem(LOCAL_SESSION_KEY);
                setActivePage("trade");
                setCurrentRole("회원");
                setMergeStatus("로그아웃됨");
                notify("Logout complete");
              }} className={`rounded-lg border px-2 py-1 text-[11px] font-semibold leading-none ${t.headerControl ?? t.input}`}>{lang.logout}</button>
            ) : (
              <>
                <button type="button" onClick={() => setLoginOpen(true)} className={`rounded-xl border px-3 py-2 text-sm font-semibold ${t.headerControl ?? t.input}`}>{lang.login}</button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthTab("signup");
                    setLoginOpen(true);
                  }}
                  className={`rounded-xl border px-3 py-2 text-sm font-semibold ${t.headerControl ?? t.input}`}
                >
                  {lang.signup}
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => requireLogin(() => notify("지갑이 연결되어 있습니다."))}
              className={`font-semibold ${t.main} ${loggedIn ? "rounded-lg px-2 py-1 text-[11px] leading-none" : "rounded-xl px-3 py-2 text-sm"}`}
            >
              {lang.connectWallet}
            </button>
          </div>

          <div className={`relative z-[280] ml-auto flex shrink-0 flex-wrap items-center justify-end md:hidden ${loggedIn ? "max-w-[min(100%,calc(100vw-5rem))] gap-1" : "gap-2"}`}>
            {loggedIn ? (
              <div ref={notifClusterMobileRef} className="flex min-w-0 max-w-full shrink items-center gap-0.5">
                <div className="relative">
                  <button
                    type="button"
                    aria-label={`거래푸시${mockTradeUnread > 0 ? ` ${mockTradeUnread}건` : ""}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setGeneralNotifOpen(false);
                      setTradePushOpen((v) => !v);
                    }}
                    className={`inline-flex max-w-[4.25rem] items-baseline gap-0.5 whitespace-nowrap rounded-lg border px-1 py-0.5 text-[9px] font-semibold leading-none sm:max-w-[7rem] sm:px-1.5 sm:py-1 sm:text-[10px] ${t.headerControl ?? t.input}`}
                  >
                    <span className="truncate sm:hidden">거래</span>
                    <span className="hidden truncate sm:inline">거래푸시</span>
                    {mockTradeUnread > 0 ? (
                      <span className="shrink-0 font-black tabular-nums text-red-500">{mockTradeUnread > 99 ? "99+" : mockTradeUnread}</span>
                    ) : null}
                  </button>
                  {tradePushOpen ? (
                    <div
                      className={`fixed left-2 right-2 top-[3.75rem] z-[60] max-h-[min(85vh,28rem)] overflow-hidden rounded-xl border p-2.5 shadow-xl sm:absolute sm:inset-auto sm:left-auto sm:right-0 sm:top-full sm:mt-1.5 sm:w-[min(96vw,22rem)] sm:max-h-none ${t.popover ?? t.card}`}
                    >
                      <TradePushPanel
                        theme={t}
                        items={MOCK_TRADE_PUSH_NOTIFICATIONS}
                        readIds={mockNotifReadIds}
                        setReadIds={setMockNotifReadIds}
                        onNavigateToTarget={navigateFromNotification}
                      />
                    </div>
                  ) : null}
                </div>
                <div className="relative">
                  <button
                    type="button"
                    aria-label={`알림${mockGeneralUnread > 0 ? ` ${mockGeneralUnread}건` : ""}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setTradePushOpen(false);
                      setGeneralNotifOpen((v) => !v);
                    }}
                    className={`inline-flex items-baseline gap-0.5 whitespace-nowrap rounded-lg border px-1 py-0.5 text-[9px] font-semibold leading-none sm:px-1.5 sm:py-1 sm:text-[10px] ${t.headerControl ?? t.input}`}
                  >
                    <span>알림</span>
                    {mockGeneralUnread > 0 ? (
                      <span className="shrink-0 font-black tabular-nums text-red-500">{mockGeneralUnread > 99 ? "99+" : mockGeneralUnread}</span>
                    ) : null}
                  </button>
                  {generalNotifOpen ? (
                    <div
                      className={`fixed left-2 right-2 top-[3.75rem] z-[60] max-h-[min(85vh,28rem)] overflow-hidden rounded-xl border p-2.5 shadow-xl sm:absolute sm:inset-auto sm:left-auto sm:right-0 sm:top-full sm:mt-1.5 sm:w-[min(96vw,22rem)] sm:max-h-none ${t.popover ?? t.card}`}
                    >
                      <GeneralAlertPanel
                        theme={t}
                        notifications={MOCK_GENERAL_ALERT_NOTIFICATIONS}
                        readIds={mockNotifReadIds}
                        setReadIds={setMockNotifReadIds}
                        onNavigateToTarget={navigateFromNotification}
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
            {!loggedIn ? (
              <>
                <button type="button" onClick={() => setLoginOpen(true)} className={`rounded-xl border px-2.5 py-2 text-[11px] font-semibold ${t.headerControl ?? t.input}`}>
                  {lang.login}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthTab("signup");
                    setLoginOpen(true);
                  }}
                  className={`rounded-xl border px-2.5 py-2 text-[11px] font-semibold ${t.headerControl ?? t.input}`}
                >
                  {lang.signup}
                </button>
              </>
            ) : null}
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className={`border font-semibold outline-none ${t.headerControl ?? t.input} ${
                loggedIn
                  ? "h-7 max-w-[3.25rem] min-w-0 shrink rounded-md px-1 py-0 text-[10px] leading-tight"
                  : "rounded-xl px-3 py-2 text-xs"
              }`}
            >
              {languages.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {loggedIn ? `${lang.flag} ${lang.code}` : lang.flag}
                </option>
              ))}
            </select>
            <button
              type="button"
              aria-label={theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환"}
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className={`border font-semibold ${t.headerControl ?? t.input} ${
                loggedIn
                  ? "h-7 max-w-[3rem] shrink-0 rounded-md px-1.5 py-0 text-[10px] leading-none"
                  : "whitespace-nowrap rounded-xl px-3 py-2 text-[11px] sm:text-xs"
              }`}
            >
              테마
            </button>
            <button type="button" onClick={() => setMenuOpen(!menuOpen)} className={`rounded-lg border px-2 py-1 text-[11px] font-semibold leading-none sm:px-3 sm:py-2 sm:text-sm ${t.headerControl ?? t.input}`}>
              메뉴
            </button>
          </div>
        </div>

        {menuOpen && (
          <div className={`border-t px-4 py-3 md:hidden ${t.header}`}>
            {primaryNavItems.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setMenuOpen(false);
                  openPage(item.key);
                }}
                className={`block w-full rounded-xl px-4 py-3 text-left text-base font-semibold ${
                  navActiveKey === item.key ? t.main : ""
                }`}
              >
                {item.key === "admin"
                  ? language === "KR"
                    ? "관리자"
                    : language === "EN"
                      ? "Admin"
                      : item.label
                  : item.label}
              </button>
            ))}
          </div>
        )}
      </header>

      <main className="relative z-0">
        {pageForMain === "trade" && (
          <TradeList
            theme={t}
            requireLogin={requireLogin}
            notify={notify}
            apiClient={apiClient}
            authToken={authToken}
            myUserId={meAuthUser?.id ?? null}
            guestMode={!loggedIn}
          />
        )}
        {loggedIn && pageForMain === "myinfo" ? (
          <MyInfo nickname={nickname} setNickname={setNickname} bankRegistered={bankRegistered} setBankRegistered={setBankRegistered} buyerKyc={buyerKyc} setBuyerKyc={setBuyerKyc} apiClient={apiClient} myInfoTab={myInfoTab} setMyInfoTab={setMyInfoTab} showReferral={showReferral} setShowReferral={setShowReferral} theme={t} notify={notify} linkedGoogle={linkedGoogle} setLinkedGoogle={setLinkedGoogle} linkedWallet={linkedWallet} setLinkedWallet={setLinkedWallet} linkedReferral={linkedReferral} mergeStatus={mergeStatus} setMergeStatus={setMergeStatus} googleEmail={googleEmail} phantomWallet={phantomWallet} walletAccount={walletAccount} financeAccount={financeAccount} withdrawRequests={withdrawRequests} withdrawAmountInput={withdrawAmountInput} setWithdrawAmountInput={setWithdrawAmountInput} withdrawNoteInput={withdrawNoteInput} setWithdrawNoteInput={setWithdrawNoteInput} onConnectWallet={connectMyWallet} onRequestWithdrawal={requestWithdrawal} myReferralCode={myReferralCode} setMyReferralCode={setMyReferralCode} referralJoinLink={referralJoinLink} referralStats={referralStats} onSaveNickname={saveMyNickname} isSavingNickname={isSavingNickname} />
        ) : null}
        {loggedIn && pageForMain === "mytrades" ? <MyTradesOnly theme={t} notify={notify} apiClient={apiClient} authToken={authToken} /> : null}
        {loggedIn && pageForMain === "friends" ? (
          <FriendsPage
            theme={t}
            friends={friends}
            selectedFriendId={selectedFriendId}
            selectedFriend={selectedFriend}
            friendLastMessages={friendLastMessages}
            roomPreview={selectedFriend ? chatRooms[selectedFriend.id] || [] : []}
            onSelectFriend={selectFriend}
            onOpenTrade={openFriendTrade}
            onOpenChat={openFriendChat}
            onGoTrade={() => setActivePage("trade")}
            onGoMyInfo={() => setActivePage("myinfo")}
            onGoMyTrades={() => setActivePage("mytrades")}
            onGoSell={() => setSellOpen(true)}
          />
        ) : null}
        {loggedIn && pageForMain === "messenger" ? (
          <FriendMessenger
            theme={t}
            friends={friends}
            selectedFriendId={selectedFriendId}
            selectedFriend={selectedFriend}
            friendLastMessages={friendLastMessages}
            messages={selectedFriendMessages}
            chatInput={chatInput}
            setChatInput={setChatInput}
            friendSearch={friendSearch}
            setFriendSearch={setFriendSearch}
            pinnedFriendIds={pinnedFriendIds}
            setPinnedFriendIds={setPinnedFriendIds}
            mutedFriendIds={mutedFriendIds}
            setMutedFriendIds={setMutedFriendIds}
            onSelectFriend={selectFriend}
            onSendMessage={sendFriendMessage}
            onDeleteMessage={deleteFriendMessage}
            onClearMessages={clearFriendMessages}
            onOpenTrade={openFriendTrade}
            notify={notify}
            onSendAttachment={sendFriendAttachment}
            onGoTrade={() => setActivePage("trade")}
            onGoMyInfo={() => setActivePage("myinfo")}
            onGoMyTrades={() => setActivePage("mytrades")}
            onGoSell={() => setSellOpen(true)}
          />
        ) : null}
        {loggedIn && pageForMain === "p2p" ? <P2PInfo theme={t} /> : null}
        {loggedIn && pageForMain === "admin" && adminGateAllowed ? (
          <AdminShell
            theme={t}
            title="관리자"
            subtitle="운영 · 회원 · 거래 · 정산"
            userLabel={`${nickname || "—"} · ${linkedGoogle || "—"}`}
            activeMenu={adminShellMenu}
            onMenuChange={setAdminShellMenu}
            onExit={() => setActivePage("trade")}
          >
            <AdminReferralPanel
              theme={t}
              notify={notify}
              isSuperAdmin={isSuperAdmin}
              apiClient={apiClient}
              authToken={authToken}
              authUsers={authUsers}
              setAuthUsers={setAuthUsers}
              buyerKyc={buyerKyc}
              setBuyerKyc={setBuyerKyc}
              friends={friends}
              chatRooms={chatRooms}
              sellerDepositNotice={sellerDepositNotice}
              setSellerDepositNotice={setSellerDepositNotice}
              escrowPolicy={escrowPolicy}
              setEscrowPolicy={setEscrowPolicy}
              disputeCases={disputeCases}
              approveDisputeCase={approveDisputeCase}
              finalizeDisputeByMain={finalizeDisputeByMain}
              currentAdminActorId={adminPanelActorId}
              finalApprovalPinInput={finalApprovalPinInput}
              setFinalApprovalPinInput={setFinalApprovalPinInput}
              finalApprovalOtpInput={finalApprovalOtpInput}
              setFinalApprovalOtpInput={setFinalApprovalOtpInput}
              newPolicyPinInput={newPolicyPinInput}
              setNewPolicyPinInput={setNewPolicyPinInput}
              selectedDisputeIdForTimeline={selectedDisputeIdForTimeline}
              setSelectedDisputeIdForTimeline={setSelectedDisputeIdForTimeline}
              selectedDisputeEvents={selectedDisputeEvents}
              setSelectedDisputeEvents={setSelectedDisputeEvents}
              timelineActionFilter={timelineActionFilter}
              setTimelineActionFilter={setTimelineActionFilter}
              timelineFromDate={timelineFromDate}
              setTimelineFromDate={setTimelineFromDate}
              timelineToDate={timelineToDate}
              setTimelineToDate={setTimelineToDate}
              adminMediaTypeFilter={adminMediaTypeFilter}
              setAdminMediaTypeFilter={setAdminMediaTypeFilter}
              adminMediaFriendFilter={adminMediaFriendFilter}
              setAdminMediaFriendFilter={setAdminMediaFriendFilter}
              adminActionLogs={adminActionLogs}
              appendAdminAction={appendAdminAction}
              setAdminActionLogs={setAdminActionLogs}
              adminMember={adminMember}
              setAdminMember={setAdminMember}
              adminParent={adminParent}
              setAdminParent={setAdminParent}
              adminReceivedRate={adminReceivedRate}
              setAdminReceivedRate={setAdminReceivedRate}
              adminRate={adminRate}
              setAdminRate={setAdminRate}
              adminMemo={adminMemo}
              setAdminMemo={setAdminMemo}
              adminUserSearch={adminUserSearch}
              setAdminUserSearch={setAdminUserSearch}
              selectedAdminUser={selectedAdminUser}
              setSelectedAdminUser={setSelectedAdminUser}
              selectedChildUser={selectedChildUser}
              setSelectedChildUser={setSelectedChildUser}
              securityFilter={securityFilter}
              setSecurityFilter={setSecurityFilter}
              blockReason={blockReason}
              setBlockReason={setBlockReason}
              useExternalAdminNav
              legacyTabFromShell={adminShellLegacyTab}
            />
          </AdminShell>
        ) : null}
        {loggedIn && pageForMain === "admin" && !adminGateAllowed ? (
          <div className={`mx-auto max-w-lg px-4 py-16 text-center ${t.cardSoft ?? ""}`}>
            <div className={`text-lg font-black ${t.page ?? ""}`}>관리자 권한이 없습니다</div>
            <p className={`mt-2 text-sm ${t.subtext ?? ""}`}>이 계정으로는 관리자 화면을 열 수 없습니다.</p>
            <button
              type="button"
              onClick={() => setActivePage("trade")}
              className={`mt-6 rounded-2xl px-6 py-3 text-sm font-black ${t.main ?? ""}`}
            >
              거래 화면으로
            </button>
          </div>
        ) : null}
        {loggedIn && pageForMain === "admin-denied" ? (
          <div className={`mx-auto max-w-lg px-4 py-16 text-center ${t.cardSoft ?? ""}`}>
            <div className={`text-lg font-black ${t.page ?? ""}`}>관리자 권한이 없습니다</div>
            <p className={`mt-2 text-sm ${t.subtext ?? ""}`}>로그인은 유지됩니다. 다른 메뉴를 이용해 주세요.</p>
            <button
              type="button"
              onClick={() => setActivePage("trade")}
              className={`mt-6 rounded-2xl px-6 py-3 text-sm font-black ${t.main ?? ""}`}
            >
              거래 화면으로
            </button>
          </div>
        ) : null}
        {pageForMain === "support" ? <Support theme={t} notify={notify} /> : null}

      </main>
    </div>
    </LangContext.Provider>
    </LanguageCodeContext.Provider>
  );
}

function Modal({ title, desc, onClose, theme, children }) {
  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/60 px-4">
      <div className={`w-full max-w-md rounded-3xl border p-4 shadow-2xl ${theme.popover ?? theme.card}`}>
        <div className="flex items-start justify-between gap-4">
          <div><div className="text-2xl font-black">{title}</div><div className={`mt-1 text-sm ${theme.subtext}`}>{desc}</div></div>
          <button onClick={onClose} className={`rounded-xl border px-3 py-2 text-sm font-black whitespace-nowrap ${theme.input}`}>닫기</button>
        </div>
        <div className="mt-5 grid gap-3">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, theme, children }) {
  const language = useLanguageCode();
  return <label className="grid gap-2"><span className={`text-sm font-bold ${theme.subtext}`}>{localizeLoose(label, language)}</span>{children}</label>;
}

/** 서버 호가가 없으면 데모 목업만, 개발 모드에서는 서버 건 뒤에 데모 건을 덧붙임 */
function TradeMarketHero({
  theme,
  tradeClockTick,
  displayedListedOrders,
  liveSpotTicker,
  currencyFilter,
  notify,
  onRefresh,
  listedLoading,
  compactGuest = false,
}) {
  const isDark = theme.page.includes("slate");
  const vol24 = useMemo(
    () => displayedListedOrders.reduce((s, o) => s + estimateListingNotional(o), 0),
    [displayedListedOrders]
  );
  const onlineMerchants = useMemo(() => {
    const n = new Set(displayedListedOrders.map((o) => String(o.seller_user_id))).size;
    const flick = tradeClockTick % 17 === 0 ? 1 : 0;
    return Math.max(1, n + flick);
  }, [displayedListedOrders, tradeClockTick]);
  const avgTradeTimeLabel = useMemo(() => {
    if (!displayedListedOrders.length) return "—";
    let s = 0;
    for (const r of displayedListedOrders) {
      s += getListingUiMeta(r, tradeClockTick).avgMinutes;
    }
    return `${Math.round(s / displayedListedOrders.length)}분`;
  }, [displayedListedOrders, tradeClockTick]);

  const tickerEntries = useMemo(
    () => buildP2pTickerEntries(displayedListedOrders, tradeClockTick),
    [displayedListedOrders, tradeClockTick]
  );

  const statCard =
    "rounded-2xl border px-3 py-2.5 sm:px-4 sm:py-3 backdrop-blur-sm transition " +
    (isDark
      ? "border-white/10 bg-white/[0.04] shadow-[0_8px_32px_-12px_rgba(0,0,0,0.65)]"
      : "border-stone-200/90 bg-white/80 shadow-[0_10px_40px_-18px_rgba(15,23,42,0.12)]");

  return (
    <div className={compactGuest ? "mb-4 sm:mb-5" : "mb-6 sm:mb-8"}>
      <div
        className={`relative overflow-hidden rounded-3xl border text-left ${
          isDark
            ? "border-emerald-500/15 bg-gradient-to-br from-slate-900 via-slate-950 to-black shadow-[0_24px_80px_-24px_rgba(16,185,129,0.35),0_0_0_1px_rgba(255,255,255,0.04)_inset]"
            : "border-amber-200/60 bg-gradient-to-br from-[#fffefb] via-[#f7f4ee] to-[#ebe6dc] shadow-[0_20px_60px_-28px_rgba(180,83,9,0.18)]"
        }`}
      >
        <div
          className={`pointer-events-none absolute -left-20 top-0 h-64 w-64 rounded-full blur-3xl ${
            isDark ? "bg-emerald-500/20" : "bg-amber-400/25"
          }`}
          aria-hidden
        />
        <div
          className={`pointer-events-none absolute -right-16 bottom-0 h-56 w-56 rounded-full blur-3xl ${
            isDark ? "bg-cyan-500/15" : "bg-sky-400/20"
          }`}
          aria-hidden
        />
        <div
          className={`pointer-events-none absolute inset-0 opacity-[0.35] ${
            isDark
              ? "bg-[radial-gradient(ellipse_at_20%_0%,rgba(52,211,153,0.2),transparent_50%),radial-gradient(ellipse_at_90%_100%,rgba(56,189,248,0.15),transparent_45%)]"
              : "bg-[radial-gradient(ellipse_at_15%_0%,rgba(251,191,36,0.18),transparent_50%)]"
          }`}
          aria-hidden
        />

        <div
          className={
            compactGuest
              ? "relative px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8"
              : "relative px-4 py-8 sm:px-8 sm:py-10 lg:px-10 lg:py-12"
          }
        >
          <div className={`flex flex-col ${compactGuest ? "gap-4 lg:gap-5" : "gap-6"} lg:flex-row lg:items-end lg:justify-between`}>
            <div className="max-w-2xl">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.2em] ${
                    isDark ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-300" : "border-amber-600/30 bg-amber-500/10 text-amber-900"
                  }`}
                >
                  Live · Escrow P2P
                </span>
                <span className={`text-[10px] font-bold uppercase tracking-wider ${theme.muted}`}>Global OTC Desk</span>
              </div>
              <h1
                className={`mt-3 text-xl font-black tracking-tight sm:mt-4 sm:text-2xl md:text-3xl lg:text-4xl lg:leading-tight ${
                  compactGuest ? "" : "lg:text-[2.75rem]"
                } ${isDark ? "text-white drop-shadow-[0_0_24px_rgba(16,185,129,0.25)]" : "text-slate-950"}`}
              >
                기관급 유동성,
                <span className={isDark ? "text-emerald-400" : "text-amber-700"}> 개인 간</span> 안전 거래
              </h1>
              <p className={`mt-3 max-w-xl text-sm leading-relaxed sm:text-[15px] ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                스마트 에스크로 · 다통화 결제 · 실시간 호가. Web3 인프라와 거래소급 UI로 P2P를 재정의합니다.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold tabular-nums ${
                    isDark ? "border-white/10 bg-black/30 text-slate-200" : "border-stone-200 bg-white/90 text-slate-800"
                  }`}
                >
                  <span className="relative flex h-2 w-2">
                    <span
                      className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${isDark ? "bg-emerald-400" : "bg-emerald-500"}`}
                    />
                    <span className={`relative inline-flex h-2 w-2 rounded-full ${isDark ? "bg-emerald-400" : "bg-emerald-500"}`} />
                  </span>
                  네트워크 동기화됨
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onRefresh();
                    notify("호가 최신화");
                  }}
                  disabled={listedLoading}
                  className={`rounded-full border px-3 py-1 text-[11px] font-black transition hover:opacity-90 disabled:opacity-50 ${
                    isDark ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-200" : "border-sky-600/30 bg-sky-500/10 text-sky-900"
                  }`}
                >
                  {listedLoading ? "동기화…" : "호가 새로고침"}
                </button>
              </div>
            </div>

            <div
              className={`grid w-full max-w-md shrink-0 gap-2 rounded-2xl border p-3 sm:p-4 ${
                isDark ? "border-white/10 bg-black/25" : "border-stone-200/80 bg-white/60"
              }`}
            >
              <div className={`text-[10px] font-black uppercase tracking-[0.2em] ${theme.muted}`}>Index · {currencyFilter === "전체" ? "KRW 기준" : currencyFilter}</div>
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <div className={`text-[11px] font-bold ${theme.muted}`}>USDT / Fiat</div>
                  <div className={`font-mono text-2xl font-black tabular-nums ${isDark ? "text-emerald-300" : "text-emerald-800"}`}>
                    {liveSpotTicker.display}{" "}
                    <span className={`text-base ${theme.muted}`}>{liveSpotTicker.labelFiat}</span>
                  </div>
                </div>
                <div className={`rounded-lg px-2 py-1 font-mono text-[10px] font-bold ${isDark ? "bg-emerald-500/15 text-emerald-200" : "bg-emerald-100 text-emerald-900"}`}>
                  Δ live {(Math.sin(tradeClockTick * 0.11) * 0.08).toFixed(2)}%
                </div>
              </div>
            </div>
          </div>

          <div className={`grid gap-3 sm:grid-cols-2 lg:grid-cols-4 ${compactGuest ? "mt-4 sm:mt-5" : "mt-8"}`}>
            <div className={statCard}>
              <div className={`text-[10px] font-black uppercase tracking-wider ${theme.muted}`}>24h 거래량 (추정)</div>
              <div className={`mt-1 font-mono text-lg font-black tabular-nums ${isDark ? "text-white" : "text-slate-900"}`}>
                {formatCompactVol(vol24)} <span className={`text-xs font-bold ${theme.muted}`}>{currencyFilter === "전체" ? "명목" : currencyFilter}</span>
              </div>
            </div>
            <div className={statCard}>
              <div className={`text-[10px] font-black uppercase tracking-wider ${theme.muted}`}>온라인 판매자</div>
              <div className={`mt-1 font-mono text-lg font-black tabular-nums ${isDark ? "text-cyan-200" : "text-cyan-900"}`}>
                {onlineMerchants.toLocaleString()}
                <span className={`ml-1 text-xs font-bold ${theme.muted}`}>명</span>
              </div>
            </div>
            <div className={statCard}>
              <div className={`text-[10px] font-black uppercase tracking-wider ${theme.muted}`}>평균 체결 시간</div>
              <div className={`mt-1 font-mono text-lg font-black tabular-nums ${isDark ? "text-amber-200" : "text-amber-900"}`}>{avgTradeTimeLabel}</div>
            </div>
            <div className={statCard}>
              <div className={`text-[10px] font-black uppercase tracking-wider ${theme.muted}`}>활성 호가</div>
              <div className={`mt-1 font-mono text-lg font-black tabular-nums ${isDark ? "text-violet-200" : "text-violet-900"}`}>
                {displayedListedOrders.length}
                <span className={`ml-1 text-xs font-bold ${theme.muted}`}>건</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        className={`relative overflow-hidden rounded-2xl border ${compactGuest ? "mt-3" : "mt-4"} ${
          isDark ? "border-white/10 bg-slate-950/80 shadow-[0_0_40px_-16px_rgba(34,211,238,0.25)]" : "border-stone-200 bg-white/90 shadow-[0_12px_40px_-20px_rgba(15,23,42,0.1)]"
        }`}
      >
        <div
          className={`pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r ${isDark ? "from-slate-950" : "from-[#faf9f6]"} to-transparent`}
          aria-hidden
        />
        <div
          className={`pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l ${isDark ? "from-slate-950" : "from-[#faf9f6]"} to-transparent`}
          aria-hidden
        />
        <div className="flex items-center gap-2 border-b px-3 py-2 sm:px-4">
          <span className={`text-[10px] font-black uppercase tracking-[0.24em] ${theme.muted}`}>Live tape</span>
          <span
            className={`rounded px-1.5 py-0.5 text-[9px] font-black ${isDark ? "bg-rose-500/15 text-rose-300" : "bg-rose-100 text-rose-700"}`}
          >
            LIVE
          </span>
        </div>
        <div className="relative overflow-hidden py-2">
          <div className="tg-marquee-track flex w-max gap-8">
            {[...tickerEntries, ...tickerEntries].map((entry, idx) => (
              <span
                key={`${entry.id}-${idx}`}
                className={`inline-flex shrink-0 items-center gap-2 font-mono text-[11px] font-bold sm:text-xs ${
                  entry.accent ? (isDark ? "text-emerald-300" : "text-emerald-700") : isDark ? "text-slate-400" : "text-slate-600"
                }`}
              >
                <span className={`h-1 w-1 shrink-0 rounded-full ${entry.accent ? "bg-emerald-400" : "bg-slate-500"}`} />
                {entry.text}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function mergeListedOrdersWithDemo(serverOrders) {
  const list = Array.isArray(serverOrders) ? serverOrders : [];
  if (list.length === 0) return MOCK_P2P_LISTED_ORDERS.map((o) => ({ ...o }));
  if (import.meta.env.DEV) {
    const ids = new Set(list.map((x) => String(x.id)));
    return [...list, ...MOCK_P2P_LISTED_ORDERS.filter((m) => !ids.has(String(m.id)))];
  }
  return list;
}

function TradeList({ theme, requireLogin, notify, apiClient, authToken, myUserId, guestMode = false }) {
  const [listedOrders, setListedOrders] = useState([]);
  const [listedLoading, setListedLoading] = useState(false);
  const [listedTakeId, setListedTakeId] = useState("");
  const [listedCancelId, setListedCancelId] = useState("");
  const [tradeTimelineOrderId, setTradeTimelineOrderId] = useState("");
  const [tradeOrderEventsCache, setTradeOrderEventsCache] = useState({});
  const [tradeOrderEventsLoadingId, setTradeOrderEventsLoadingId] = useState("");
  const [sellCoin, setSellCoin] = useState("USDT");
  const [sellAmount, setSellAmount] = useState("");
  const [sellUnitPrice, setSellUnitPrice] = useState("");
  const [sellPayMethod, setSellPayMethod] = useState("KRW");
  const [currencyFilter, setCurrencyFilter] = useState("전체");
  const [myProgressOrders, setMyProgressOrders] = useState([]);
  const [myOrdersLoading, setMyOrdersLoading] = useState(false);
  const [tradeFlowActionId, setTradeFlowActionId] = useState("");
  const [tradeClockTick, setTradeClockTick] = useState(0);
  const [takeAmountDraft, setTakeAmountDraft] = useState({});

  async function loadListedOrders() {
    try {
      setListedLoading(true);
      const data = await apiClient.request("/api/p2p/orders?limit=60");
      const serverOrders = Array.isArray(data.orders) ? data.orders : [];
      setListedOrders(mergeListedOrdersWithDemo(serverOrders));
    } catch {
      setListedOrders(MOCK_P2P_LISTED_ORDERS.map((o) => ({ ...o })));
    } finally {
      setListedLoading(false);
    }
  }

  async function loadMyProgressOrders() {
    if (!authToken) {
      setMyProgressOrders([]);
      return;
    }
    try {
      setMyOrdersLoading(true);
      const data = await apiClient.request("/api/p2p/orders/me", { auth: true });
      const all = Array.isArray(data.orders) ? data.orders : [];
      setMyProgressOrders(all.filter((o) => o.status === "matched" || o.status === "payment_sent"));
    } catch {
      setMyProgressOrders([]);
    } finally {
      setMyOrdersLoading(false);
    }
  }

  async function tradePaymentStart(orderId) {
    try {
      setTradeFlowActionId(orderId);
      await apiClient.request(`/api/p2p/orders/${encodeURIComponent(orderId)}/payment-start`, {
        method: "POST",
        auth: true,
        body: JSON.stringify({}),
      });
      notify("송금 신청을 접수했습니다.");
      await loadMyProgressOrders();
      await loadListedOrders();
      setTradeOrderEventsCache((prev) => {
        const next = { ...prev };
        delete next[orderId];
        return next;
      });
    } catch (error) {
      notify(error.message || "송금 신청에 실패했습니다.");
    } finally {
      setTradeFlowActionId("");
    }
  }

  async function tradeMarkBuyerPaid(orderId) {
    try {
      setTradeFlowActionId(orderId);
      await apiClient.request(`/api/p2p/orders/${encodeURIComponent(orderId)}/mark-paid`, {
        method: "POST",
        auth: true,
        body: JSON.stringify({}),
      });
      notify("송금 완료로 표시했습니다.");
      await loadMyProgressOrders();
      await loadListedOrders();
      setTradeOrderEventsCache((prev) => {
        const next = { ...prev };
        delete next[orderId];
        return next;
      });
    } catch (error) {
      notify(error.message || "처리에 실패했습니다.");
    } finally {
      setTradeFlowActionId("");
    }
  }

  async function tradeCompleteSeller(orderId) {
    try {
      setTradeFlowActionId(orderId);
      await apiClient.request(`/api/p2p/orders/${encodeURIComponent(orderId)}/complete`, {
        method: "POST",
        auth: true,
        body: JSON.stringify({}),
      });
      notify("거래를 완료했습니다.");
      await loadMyProgressOrders();
      await loadListedOrders();
      setTradeOrderEventsCache((prev) => {
        const next = { ...prev };
        delete next[orderId];
        return next;
      });
    } catch (error) {
      notify(error.message || "완료 처리에 실패했습니다.");
    } finally {
      setTradeFlowActionId("");
    }
  }

  async function tradeWithdrawMatch(orderId) {
    const ok = window.confirm("매칭을 철회하고 주문을 취소합니다. 계속할까요?");
    if (!ok) return;
    try {
      setTradeFlowActionId(orderId);
      await apiClient.request(`/api/p2p/orders/${encodeURIComponent(orderId)}/withdraw-match`, {
        method: "POST",
        auth: true,
        body: JSON.stringify({}),
      });
      notify("매칭을 철회했습니다.");
      await loadMyProgressOrders();
      await loadListedOrders();
      setTradeOrderEventsCache((prev) => {
        const next = { ...prev };
        delete next[orderId];
        return next;
      });
      setTradeTimelineOrderId((cur) => (cur === orderId ? "" : cur));
    } catch (error) {
      notify(error.message || "철회에 실패했습니다.");
    } finally {
      setTradeFlowActionId("");
    }
  }

  useEffect(() => {
    loadListedOrders();
    loadMyProgressOrders();
    const id = setInterval(() => {
      loadListedOrders();
      loadMyProgressOrders();
    }, 25000);
    return () => clearInterval(id);
  }, [apiClient, authToken]);

  useEffect(() => {
    const id = setInterval(() => setTradeClockTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  function submitSellListing() {
    requireLogin(async () => {
      try {
        const amount = Number(sellAmount);
        if (!Number.isFinite(amount) || amount <= 0) {
          notify("판매 수량을 올바르게 입력하세요.");
          return;
        }
        await apiClient.request("/api/p2p/orders", {
          method: "POST",
          auth: true,
          body: JSON.stringify({
            coin: sellCoin || "USDT",
            amount,
            unitPrice: Number(sellUnitPrice) || 0,
            paymentMethod: sellPayMethod || "",
          }),
        });
        notify("판매 등록이 완료되었습니다.");
        setSellAmount("");
        await loadListedOrders();
      } catch (error) {
        notify(error.message || "판매 등록에 실패했습니다.");
      }
    });
  }

  function takeListedOrder(orderId, listedAmount) {
    requireLogin(async () => {
      if (String(orderId).startsWith("P2P-DEMO")) {
        notify("데모 호가입니다. 실제 매칭은 서버에 등록된 판매만 가능합니다.");
        return;
      }
      try {
        setListedTakeId(orderId);
        const raw = takeAmountDraft[orderId];
        const body = {};
        if (raw != null && String(raw).trim() !== "") {
          const n = Number(raw);
          if (!Number.isFinite(n) || n <= 0) {
            notify("매칭 수량을 올바르게 입력하세요.");
            setListedTakeId("");
            return;
          }
          if (n > listedAmount + 1e-9) {
            notify("등록 수량을 초과할 수 없습니다.");
            setListedTakeId("");
            return;
          }
          body.amount = n;
        }
        const data = await apiClient.request(`/api/p2p/orders/${encodeURIComponent(orderId)}/take`, {
          method: "POST",
          auth: true,
          body: JSON.stringify(body),
        });
        if (data.listingOrder) {
            notify(`부분 매칭되었습니다. (${body.amount ?? listedAmount} ${data.order?.coin || ""}) 나머지는 목록에 남습니다.`);
        } else {
          notify("매칭되었습니다. 내 거래에서 확인하세요.");
        }
        await loadListedOrders();
        await loadMyProgressOrders();
        setTradeOrderEventsCache((prev) => {
          const next = { ...prev };
          delete next[orderId];
          if (data.order?.id) delete next[data.order.id];
          return next;
        });
        setTakeAmountDraft((prev) => {
          const next = { ...prev };
          delete next[orderId];
          return next;
        });
      } catch (error) {
        notify(error.message || "매칭에 실패했습니다.");
      } finally {
        setListedTakeId("");
      }
    });
  }

  function cancelListedOrder(orderId) {
    requireLogin(async () => {
      if (String(orderId).startsWith("P2P-DEMO")) {
        notify("데모 호가는 취소할 수 없습니다.");
        return;
      }
      try {
        setListedCancelId(orderId);
        await apiClient.request(`/api/p2p/orders/${encodeURIComponent(orderId)}/cancel`, {
          method: "POST",
          auth: true,
          body: JSON.stringify({}),
        });
        notify("등록을 취소했습니다.");
        await loadListedOrders();
        setTradeOrderEventsCache((prev) => {
          const next = { ...prev };
          delete next[orderId];
          return next;
        });
      } catch (error) {
        notify(error.message || "등록 취소에 실패했습니다.");
      } finally {
        setListedCancelId("");
      }
    });
  }

  async function toggleTradeTimeline(orderId) {
    if (String(orderId).startsWith("P2P-DEMO")) {
      notify("데모 호가에는 서버 이벤트 타임라인이 없습니다.");
      return;
    }
    if (!authToken) {
      notify("로그인 후 이벤트 타임라인을 볼 수 있습니다.");
      return;
    }
    if (tradeTimelineOrderId === orderId) {
      setTradeTimelineOrderId("");
      return;
    }
    setTradeTimelineOrderId(orderId);
    if (tradeOrderEventsCache[orderId]) return;
    try {
      setTradeOrderEventsLoadingId(orderId);
      const data = await apiClient.request(`/api/p2p/orders/${encodeURIComponent(orderId)}/events`, { auth: true });
      const ev = Array.isArray(data.events) ? data.events : [];
      setTradeOrderEventsCache((prev) => ({ ...prev, [orderId]: ev }));
    } catch (error) {
      notify(error.message || "이벤트를 불러오지 못했습니다.");
      setTradeTimelineOrderId("");
    } finally {
      setTradeOrderEventsLoadingId("");
    }
  }

  async function refreshTradeTimeline(orderId) {
    if (String(orderId).startsWith("P2P-DEMO")) return;
    if (!authToken) return;
    try {
      setTradeOrderEventsLoadingId(orderId);
      const data = await apiClient.request(`/api/p2p/orders/${encodeURIComponent(orderId)}/events`, { auth: true });
      const ev = Array.isArray(data.events) ? data.events : [];
      setTradeOrderEventsCache((prev) => ({ ...prev, [orderId]: ev }));
      notify("타임라인을 새로고침했습니다.");
    } catch (error) {
      notify(error.message || "새로고침에 실패했습니다.");
    } finally {
      setTradeOrderEventsLoadingId("");
    }
  }

  const displayedListedOrders = useMemo(() => {
    const rows = Array.isArray(listedOrders) ? listedOrders : [];
    if (currencyFilter === "전체") return rows;
    return rows.filter((o) => o.payment_method === currencyFilter);
  }, [listedOrders, currencyFilter]);

  const liveSpotTicker = useMemo(() => {
    const fiatBase = { KRW: 1392, USD: 1.002, VND: 26850, JPY: 205.4, CNY: 7.18, USDT: 1 };
    const sel = currencyFilter === "전체" ? "KRW" : currencyFilter;
    let base = fiatBase[sel] ?? fiatBase.KRW;
    const withPx = displayedListedOrders.filter((o) => Number(o.unit_price) > 0);
    if (withPx.length > 0) {
      base = withPx.reduce((s, o) => s + Number(o.unit_price), 0) / withPx.length;
    }
    const pulse = Math.sin(tradeClockTick * 0.45) * base * 0.00012 + Math.cos(tradeClockTick * 0.17) * base * 0.00006;
    const v = base + pulse;
    return {
      labelFiat: sel,
      display: v >= 100 ? v.toFixed(2) : v.toFixed(4),
    };
  }, [currencyFilter, displayedListedOrders, tradeClockTick]);

  const isTradeDark = theme.card.includes("slate-900");

  return (
    <>
      <div className={`mx-auto max-w-7xl px-4 ${guestMode ? "pt-3 sm:pt-5" : "pt-5 sm:pt-8"} ${isTradeDark ? "text-white" : "text-slate-950"}`}>
        <TradeMarketHero
          theme={theme}
          tradeClockTick={tradeClockTick}
          displayedListedOrders={displayedListedOrders}
          liveSpotTicker={liveSpotTicker}
          currencyFilter={currencyFilter}
          notify={notify}
          onRefresh={() => loadListedOrders()}
          listedLoading={listedLoading}
          compactGuest={guestMode}
        />
      </div>
      <section className={`mx-auto max-w-7xl px-4 ${guestMode ? "pb-6 pt-0 sm:pb-8" : "pb-8 pt-1 sm:pb-10"} ${isTradeDark ? "text-white" : "text-slate-950"}`}>
      <div className="mb-4 flex flex-col gap-2">
        <div className="-mx-1 flex flex-nowrap items-center gap-2 overflow-x-auto pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible">
          {countryFilters.map((c) => (
            <button
              key={c.currency}
              type="button"
              onClick={() => {
                setCurrencyFilter(c.currency);
                notify(`${c.label} ${c.currency} 거래 리스트`);
              }}
              className={`rounded-xl border px-2.5 py-1.5 text-xs font-black ${currencyFilter === c.currency ? theme.main : theme.input}`}
            >
              {c.flag} {c.currency}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setCurrencyFilter("전체");
              notify("전체 거래 리스트");
            }}
            className={`rounded-xl border px-2.5 py-1.5 text-xs font-black ${currencyFilter === "전체" ? theme.main : theme.input}`}
          >
            🌐 전체
          </button>
          <span
            className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 font-mono text-xs tabular-nums ${theme.cardSoft}`}
            title="선택 통화 기준 참고 시세 (등록 단가 평균 반영)"
          >
            <span className={theme.muted}>실시간 시세</span>
            <span className={`font-black tabular-nums ${theme.card.includes("slate-900") ? "text-sky-400" : "text-sky-700"}`}>
              1 USDT ≈ {liveSpotTicker.display} {liveSpotTicker.labelFiat}
            </span>
          </span>
          <button
            type="button"
            onClick={() => loadListedOrders()}
            disabled={listedLoading}
            className={`ml-auto rounded-xl border px-2.5 py-1.5 text-xs font-black ${listedLoading ? "opacity-60" : theme.input}`}
          >
            {listedLoading ? "…" : "새로고침"}
          </button>
        </div>
        <p className={`text-[11px] ${theme.subtext}`}>통화를 바꾸면 시세와 판매 목록이 함께 바뀝니다.</p>
      </div>

      <div
        className={`mb-6 rounded-3xl border p-4 sm:p-5 ${
          isTradeDark
            ? "border-white/[0.07] bg-slate-950/40 shadow-[0_24px_64px_-32px_rgba(0,0,0,0.75),0_0_0_1px_rgba(255,255,255,0.04)_inset]"
            : "border-stone-200/90 bg-white/90 shadow-[0_20px_50px_-30px_rgba(15,23,42,0.18)]"
        }`}
      >
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <div className="text-sm font-black tracking-tight sm:text-base">판매자 목록</div>
            <div className={`text-[11px] ${theme.subtext}`}>서버 등록 건 + 데모 호가(표시용) · 선택 통화로 필터됩니다.</div>
          </div>
        </div>

        {authToken ? (
          <div className="mb-4 grid gap-2 rounded-xl border border-white/10 p-3 md:grid-cols-6">
            <label className={`grid gap-0.5 md:col-span-1 ${theme.subtext}`}>
              <span className="text-[10px] font-black">코인</span>
              <select value={sellCoin} onChange={(e) => setSellCoin(e.target.value)} className={`rounded-lg border px-2 py-1.5 text-xs font-bold outline-none ${theme.input}`}>
                <option value="USDT">USDT</option>
                <option value="SOL">SOL</option>
                <option value="BTC">BTC</option>
                <option value="ETH">ETH</option>
              </select>
            </label>
            <label className={`grid gap-0.5 md:col-span-1 ${theme.subtext}`}>
              <span className="text-[10px] font-black">수량</span>
              <input value={sellAmount} onChange={(e) => setSellAmount(e.target.value)} placeholder="예: 500" className={`rounded-lg border px-2 py-1.5 text-xs font-bold outline-none ${theme.input}`} />
            </label>
            <label className={`grid gap-0.5 md:col-span-1 ${theme.subtext}`}>
              <span className="text-[10px] font-black">단가(통화)</span>
              <input value={sellUnitPrice} onChange={(e) => setSellUnitPrice(e.target.value)} placeholder="0 = 미표시" className={`rounded-lg border px-2 py-1.5 text-xs font-bold outline-none ${theme.input}`} />
            </label>
            <label className={`grid gap-0.5 md:col-span-1 ${theme.subtext}`}>
              <span className="text-[10px] font-black">결제 방식</span>
              <select value={sellPayMethod} onChange={(e) => setSellPayMethod(e.target.value)} className={`rounded-lg border px-2 py-1.5 text-xs font-bold outline-none ${theme.input}`}>
                <option value="KRW">KRW</option>
                <option value="USD">USD</option>
                <option value="VND">VND</option>
                <option value="JPY">JPY</option>
                <option value="USDT">USDT</option>
              </select>
            </label>
            <div className="flex flex-col justify-end gap-1 md:col-span-2">
              <div className={`text-[9px] leading-snug ${theme.muted}`}>등록 수량만큼 잔고에서 예치됩니다. 취소·완료 시 복구됩니다.</div>
              <button type="button" onClick={submitSellListing} className={`w-full rounded-lg px-3 py-2 text-xs font-black ${theme.main}`}>
                판매 등록
              </button>
            </div>
          </div>
        ) : (
          <div className={`mb-4 rounded-xl p-3 text-xs ${theme.cardSoft}`}>로그인 후 판매를 등록할 수 있습니다.</div>
        )}

        {authToken && (myProgressOrders.length > 0 || myOrdersLoading) ? (
          <div className={`mb-4 rounded-xl border border-amber-500/25 bg-amber-950/25 p-3 ${theme.cardSoft}`}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-black text-amber-100">진행 중인 주문 (매칭·송금)</div>
              {myOrdersLoading ? <span className={`text-xs ${theme.muted}`}>동기화…</span> : null}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {myProgressOrders.map((row) => (
                <div key={row.id} className={`rounded-xl border border-white/10 p-3 ${theme.card}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-mono text-[10px] text-emerald-400">{row.id}</div>
                      <div className="mt-1 text-sm font-black">
                        {row.my_role === "seller" ? "매도" : row.my_role === "buyer" ? "매수" : "참여"} · {number(row.amount)} {row.coin}
                      </div>
                      {row.status === "matched" && row.match_deadline_at ? (
                        <div className={`mt-1 text-[10px] font-bold text-amber-400`}>
                          {formatP2pMatchCountdown(row.match_deadline_at)}
                          {typeof row.match_sla_minutes === "number" ? ` · ${row.match_sla_minutes}분 내 송금 확인` : ""}
                        </div>
                      ) : null}
                      {row.status === "matched" && row.my_role === "seller" ? (
                        <div className={`mt-1 text-[9px] leading-snug ${theme.muted}`}>미체결 시 자동 취소 후 예치 물량 복구.</div>
                      ) : null}
                    </div>
                    <span className="shrink-0 rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-black text-white">{p2pStatusLabel(row.status)}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {row.my_role === "buyer" && row.status === "matched" && !row.buyer_payment_started_at ? (
                      <button
                        type="button"
                        disabled={tradeFlowActionId === row.id}
                        onClick={() => tradePaymentStart(row.id)}
                        className={`rounded-lg border border-violet-500/60 px-3 py-2 text-[11px] font-black text-violet-200 ${theme.input}`}
                      >
                        {tradeFlowActionId === row.id ? "처리 중…" : "송금 신청"}
                      </button>
                    ) : null}
                    {row.my_role === "buyer" && row.status === "matched" && row.buyer_payment_started_at ? (
                      <button
                        type="button"
                        disabled={tradeFlowActionId === row.id}
                        onClick={() => tradeMarkBuyerPaid(row.id)}
                        className={`rounded-lg border border-sky-500/60 px-3 py-2 text-[11px] font-black text-sky-200 ${theme.input}`}
                      >
                        {tradeFlowActionId === row.id ? "처리 중…" : "송금 완료 표시"}
                      </button>
                    ) : null}
                    {row.my_role === "seller" && row.status === "payment_sent" ? (
                      <button
                        type="button"
                        disabled={tradeFlowActionId === row.id}
                        onClick={() => tradeCompleteSeller(row.id)}
                        className={`rounded-lg border border-emerald-500/60 px-3 py-2 text-[11px] font-black text-emerald-200 ${theme.input}`}
                      >
                        {tradeFlowActionId === row.id ? "처리 중…" : "거래 완료(릴리즈)"}
                      </button>
                    ) : null}
                    {row.status === "matched" && row.my_role === "seller" ? (
                      <button
                        type="button"
                        disabled={tradeFlowActionId === row.id}
                        onClick={() => tradeWithdrawMatch(row.id)}
                        className={`rounded-lg border border-red-500/50 px-3 py-2 text-[11px] font-black text-red-300 ${theme.input}`}
                      >
                        {tradeFlowActionId === row.id ? "처리 중…" : "매칭 취소"}
                      </button>
                    ) : null}
                    {row.status === "matched" && row.my_role === "buyer" && !row.buyer_payment_started_at ? (
                      <button
                        type="button"
                        disabled={tradeFlowActionId === row.id}
                        onClick={() => tradeWithdrawMatch(row.id)}
                        className={`rounded-lg border border-red-500/50 px-3 py-2 text-[11px] font-black text-red-300 ${theme.input}`}
                      >
                        {tradeFlowActionId === row.id ? "처리 중…" : "매칭 철회"}
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
          {displayedListedOrders.length === 0 && !listedLoading ? (
            <div className={`col-span-full rounded-xl border p-3 text-xs ${theme.input}`}>
              {listedOrders.length === 0 ? "등록된 판매가 없습니다." : "선택한 통화로 등록된 판매가 없습니다."}
            </div>
          ) : null}
          {displayedListedOrders.map((row) => {
            const ownListing = myUserId != null && Number(row.seller_user_id) === Number(myUserId);
            const evCount = tradeOrderEventsCache[row.id]?.length;
            const meta = getListingUiMeta(row, tradeClockTick);
            const notional = estimateListingNotional(row);
            const tagClass = (tag) => {
              if (tag === "HOT")
                return "bg-gradient-to-r from-orange-500 to-rose-600 text-white shadow-sm shadow-orange-500/30";
              if (tag === "VERIFIED")
                return isTradeDark
                  ? "border border-sky-400/50 bg-sky-500/15 text-sky-200"
                  : "border border-sky-200 bg-sky-50 text-sky-900";
              if (tag === "FAST")
                return isTradeDark
                  ? "border border-emerald-400/50 bg-emerald-500/15 text-emerald-200"
                  : "border border-emerald-200 bg-emerald-50 text-emerald-900";
              return isTradeDark ? "bg-white/10 text-white" : "bg-slate-100 text-slate-800";
            };
            return (
              <div
                key={row.id}
                className={`group relative overflow-hidden rounded-2xl border transition-all duration-300 ease-out will-change-transform hover:-translate-y-1 ${
                  isTradeDark
                    ? "border-white/[0.08] bg-gradient-to-b from-slate-900/95 to-slate-950 shadow-[0_16px_48px_-24px_rgba(0,0,0,0.65)] hover:border-emerald-400/35 hover:shadow-[0_28px_56px_-28px_rgba(16,185,129,0.38),0_0_48px_-16px_rgba(52,211,153,0.18)]"
                    : "border-stone-200/95 bg-gradient-to-b from-white to-stone-50/90 shadow-[0_14px_44px_-26px_rgba(15,23,42,0.16)] hover:border-emerald-300/80 hover:shadow-[0_22px_48px_-28px_rgba(16,185,129,0.22)]"
                }`}
              >
                <div
                  className={`pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 ${
                    isTradeDark
                      ? "bg-[radial-gradient(ellipse_at_50%_0%,rgba(52,211,153,0.14),transparent_55%)]"
                      : "bg-[radial-gradient(ellipse_at_50%_0%,rgba(16,185,129,0.12),transparent_55%)]"
                  }`}
                  aria-hidden
                />
                <div className="relative p-3 sm:p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`rounded-lg bg-gradient-to-br px-2 py-0.5 font-mono text-[10px] font-black text-white shadow-sm ${
                            meta.grade.startsWith("A")
                              ? "from-emerald-500 to-teal-600"
                              : meta.grade.startsWith("B")
                                ? "from-amber-500 to-orange-600"
                                : "from-slate-500 to-zinc-700"
                          }`}
                        >
                          {meta.grade}
                        </span>
                        <span className={`truncate text-[11px] font-bold ${theme.subtext}`}>{meta.sellerAlias}</span>
                      </div>
                      <div className="mt-1 font-mono text-[9px] text-emerald-400/90">{row.id}</div>
                    </div>
                    <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-0.5">
                      {meta.tags.map((tag) => (
                        <span key={tag} className={`rounded px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide ${tagClass(tag)}`}>
                          {tag}
                        </span>
                      ))}
                      {evCount != null ? (
                        <span className="rounded-full bg-violet-600 px-1.5 py-0.5 text-[9px] font-black text-white" title="불러온 이벤트 수">
                          EVT {evCount}
                        </span>
                      ) : null}
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[9px] font-black text-white ${row._demo ? "bg-amber-600" : "bg-slate-600"}`}
                      >
                        {row._demo ? "데모" : "서버"}
                      </span>
                    </div>
                  </div>

                  <div className="mt-2.5 flex items-end justify-between gap-2">
                    <div>
                      <div className="text-lg font-black tracking-tight sm:text-xl">
                        {number(row.amount)}{" "}
                        <span className={`text-sm font-black ${isTradeDark ? "text-emerald-400" : "text-emerald-600"}`}>{row.coin}</span>
                      </div>
                      <div className={`mt-0.5 text-[11px] leading-snug ${theme.subtext}`}>
                        {Number(row.unit_price) > 0 ? (
                          <>
                            단가 <span className="font-mono font-black tabular-nums">{number(row.unit_price)}</span>
                            {row.payment_method ? ` ${row.payment_method}` : ""}
                          </>
                        ) : (
                          "단가 협의"
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-[9px] font-bold uppercase tracking-wider ${theme.muted}`}>명목</div>
                      <div className={`font-mono text-xs font-black tabular-nums ${isTradeDark ? "text-cyan-300" : "text-cyan-800"}`}>
                        {notional > 0 ? formatCompactVol(notional) : "—"}
                      </div>
                    </div>
                  </div>

                  <div
                    className={`mt-3 grid grid-cols-3 gap-1.5 rounded-xl border px-2 py-1.5 text-[9px] sm:text-[10px] ${
                      isTradeDark ? "border-white/5 bg-black/25" : "border-stone-200 bg-stone-100/90"
                    }`}
                  >
                    <div>
                      <div className={`font-bold ${theme.muted}`}>완료율</div>
                      <div
                        className={`font-mono font-black tabular-nums ${isTradeDark ? "text-emerald-300" : "text-emerald-700"}`}
                      >
                        {meta.completionRate}%
                      </div>
                    </div>
                    <div>
                      <div className={`font-bold ${theme.muted}`}>거래</div>
                      <div className="font-mono font-black tabular-nums">{meta.tradeCount.toLocaleString()}건</div>
                    </div>
                    <div>
                      <div className={`font-bold ${theme.muted}`}>평균</div>
                      <div className="font-mono font-black tabular-nums">{meta.avgMinutes}분</div>
                    </div>
                  </div>

                  <div className={`mt-2 flex items-center gap-1 text-[10px] ${theme.muted}`}>
                    <span className={isTradeDark ? "text-amber-400" : "text-amber-600"} aria-hidden>
                      {"★".repeat(meta.trustStars)}
                    </span>
                    <span className="opacity-80">{row.created_at}</span>
                  </div>
                  <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => toggleTradeTimeline(row.id)}
                      className={`rounded-lg border px-2 py-1.5 text-[10px] font-black ${theme.input}`}
                    >
                      {tradeTimelineOrderId === row.id ? "타임라인 닫기" : "이벤트"}
                    </button>
                    {authToken && tradeTimelineOrderId === row.id ? (
                      <button
                        type="button"
                        disabled={tradeOrderEventsLoadingId === row.id}
                        onClick={() => refreshTradeTimeline(row.id)}
                        className={`rounded-lg border px-2 py-1.5 text-[10px] font-black ${theme.input}`}
                      >
                        {tradeOrderEventsLoadingId === row.id ? "…" : "새로고침"}
                      </button>
                    ) : null}
                  </div>
                  {ownListing && row.status === "listed" ? (
                    <button
                      type="button"
                      disabled={listedCancelId === row.id}
                      onClick={() => cancelListedOrder(row.id)}
                      className="mt-2 w-full rounded-lg bg-amber-600 px-2 py-1.5 text-xs font-black text-white disabled:opacity-60"
                    >
                      {listedCancelId === row.id ? "취소 중…" : "등록 취소"}
                    </button>
                  ) : (
                    <>
                      {authToken && !ownListing ? (
                        <label className={`mt-2 grid gap-0.5 text-[10px] font-bold ${theme.subtext}`}>
                          매칭 수량 (비우면 전체 {number(row.amount)})
                          <input
                            type="number"
                            min={0}
                            step="any"
                            placeholder={`최대 ${number(row.amount)}`}
                            value={takeAmountDraft[row.id] ?? ""}
                            onChange={(e) =>
                              setTakeAmountDraft((prev) => ({ ...prev, [row.id]: e.target.value }))
                            }
                            className={`rounded-lg border px-2 py-1 text-xs font-bold outline-none ${theme.input}`}
                          />
                        </label>
                      ) : null}
                      <button
                        type="button"
                        disabled={!authToken || ownListing || listedTakeId === row.id}
                        onClick={() => takeListedOrder(row.id, Number(row.amount))}
                        className={`mt-2 w-full rounded-lg px-2 py-1.5 text-xs font-black ${
                          !authToken || ownListing ? "bg-slate-600 text-white" : theme.main
                        }`}
                      >
                        {!authToken ? "로그인 후 매칭" : ownListing ? "내 주문" : listedTakeId === row.id ? "처리 중…" : "매칭"}
                      </button>
                    </>
                  )}
                </div>
                {tradeTimelineOrderId === row.id ? (
                  <div className={`border-t border-white/10 px-2.5 pb-2.5 pt-2 ${theme.subtext}`}>
                    <div className="mb-1 text-[10px] font-black text-emerald-400">서버 이벤트</div>
                    {tradeOrderEventsLoadingId === row.id ? (
                      <div className={`text-[10px] ${theme.muted}`}>불러오는 중…</div>
                    ) : (tradeOrderEventsCache[row.id] || []).length ? (
                      <ul className="max-h-32 space-y-1 overflow-auto text-[10px]">
                        {(tradeOrderEventsCache[row.id] || []).map((ev) => (
                          <li key={ev.id} className={`rounded border border-white/5 px-1.5 py-1.5 ${theme.card}`}>
                            <div className="flex flex-wrap gap-1.5">
                              <span className="font-mono text-[9px] text-sky-400">{ev.created_at}</span>
                              <span className="font-black">{ev.action}</span>
                            </div>
                            <pre className={`mt-0.5 max-h-12 overflow-auto whitespace-pre-wrap break-all font-mono text-[9px] ${theme.muted}`}>{ev.detail_json}</pre>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className={`text-[10px] ${theme.muted}`}>이벤트가 없습니다.</div>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </section>
    </>
  );
}

function MyPage({ nickname, setNickname, bankRegistered, setBankRegistered, theme, notify }) {
  return (
    <section className="mx-auto grid max-w-7xl gap-5 px-4 py-8 md:grid-cols-2">
      <div className={`rounded-3xl border p-5 shadow-sm ${theme.card}`}>
        <div className="mb-5 flex items-center justify-between"><div><div className="text-xl font-black">거래 내정보</div><div className={`text-sm ${theme.subtext}`}>기간별 거래내역 · 입금증빙 · 상태조회</div></div><button onClick={() => notify("기간조회 기능 실행")} className={`rounded-2xl border px-4 py-2 text-sm font-bold ${theme.input}`}>기간조회</button></div>
        <div className="space-y-3">{trades.map((tr) => <div key={tr.id} className={`flex items-center justify-between rounded-2xl p-4 ${theme.cardSoft}`}><div><div className="font-black">{tr.type} {tr.amount} {tr.coin}</div><div className={`mt-1 text-xs ${theme.muted}`}>{tr.id} · {tr.time}</div></div><span className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-black text-white">{tr.status}</span></div>)}</div>
      </div>
      <div className={`rounded-3xl border p-5 shadow-sm ${theme.card}`}>
        <div className="mb-5"><div className="text-xl font-black">회원 정보</div><div className={`text-sm ${theme.subtext}`}>레퍼럴 코드 · 지갑주소 · 닉네임 · 은행계좌</div></div>
        <div className="space-y-3">
          <label className={`block rounded-2xl p-4 ${theme.cardSoft}`}><div className={`text-xs ${theme.muted}`}>닉네임 변경</div><input value={nickname} onChange={(e) => setNickname(e.target.value)} className="mt-1 w-full bg-transparent font-black outline-none" /></label>
          <Box label="레퍼럴 코드" value="TG777" theme={theme} />
          <Box label="등록 지갑" value={linkedWallet || "8xA2...9QpL"} theme={theme} />
          <button onClick={() => { setBankRegistered(true); notify("은행계좌 등록 완료"); }} className={`w-full rounded-2xl px-4 py-3 text-sm font-black ${bankRegistered ? "bg-emerald-600 text-white" : theme.main}`}>{bankRegistered ? "은행계좌 등록됨" : "은행계좌 등록"}</button>
        </div>
      </div>
    </section>
  );
}

function MyInfo({ nickname, setNickname, bankRegistered, setBankRegistered, buyerKyc, setBuyerKyc, apiClient, myInfoTab, setMyInfoTab, showReferral, setShowReferral, theme, notify, linkedGoogle, setLinkedGoogle, linkedWallet, setLinkedWallet, linkedReferral, mergeStatus, setMergeStatus, googleEmail, phantomWallet, walletAccount, financeAccount, withdrawRequests, withdrawAmountInput, setWithdrawAmountInput, withdrawNoteInput, setWithdrawNoteInput, onConnectWallet, onRequestWithdrawal, myReferralCode, setMyReferralCode, referralJoinLink, referralStats, onSaveNickname, isSavingNickname }) {
  const [idDocFile, setIdDocFile] = useState(null);
  const [bankDocFile, setBankDocFile] = useState(null);
  const [referralCodeDraft, setReferralCodeDraft] = useState(myReferralCode || "");
  const [isSavingReferralCode, setIsSavingReferralCode] = useState(false);
  const tabs = ["기본정보", "계정연결", "지갑", "잔고/출금", "계좌", "레퍼럴"];
  const normalizedReferralDraft = String(referralCodeDraft || "").trim().toUpperCase();
  const referralCodeValid = /^[A-Z0-9-]{1,20}$/.test(normalizedReferralDraft);

  useEffect(() => {
    setReferralCodeDraft(myReferralCode || "");
  }, [myReferralCode]);
  return (
    <section className="mx-auto w-full max-w-[1400px] px-3 py-8 lg:px-4">
      <div className={`rounded-3xl border p-5 shadow-sm ${theme.card}`}>
        <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-2xl font-black">내정보</div>
            <div className={`mt-1 text-sm ${theme.subtext}`}>회원정보는 필요한 항목만 선택해서 확인합니다.</div>
          </div>
          <div className="grid grid-cols-2 gap-2 md:flex">
            {tabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setMyInfoTab(tab)}
                className={`rounded-2xl px-4 py-3 text-sm font-black ${myInfoTab === tab ? theme.main : theme.input}`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {myInfoTab === "기본정보" && (
          <div className="grid gap-3 md:grid-cols-2">
            <label className={`block rounded-2xl p-4 ${theme.cardSoft}`}>
              <div className={`text-xs ${theme.muted}`}>닉네임 변경</div>
              <input value={nickname} onChange={(e) => setNickname(e.target.value)} className="mt-1 w-full bg-transparent font-black outline-none" />
            </label>
            <button onClick={onSaveNickname} disabled={isSavingNickname} className={`rounded-2xl px-4 py-3 text-sm font-black ${isSavingNickname ? "bg-slate-500 text-white" : theme.main}`}>
              {isSavingNickname ? "저장중..." : "닉네임 저장"}
            </button>
            <Box label="회원 등급" value="Lv.4 / 안전거래 회원" theme={theme} />
          </div>
        )}

        {myInfoTab === "계정연결" && (
          <div className="grid gap-3 md:grid-cols-2">
            <Box label="연결된 구글 계정" value={linkedGoogle || "미연결"} theme={theme} />
            <Box label="연결된 팬텀 지갑" value={linkedWallet || "미연결"} theme={theme} />
            <Box label="연결된 추천인" value={linkedReferral || "미연결"} theme={theme} />
            <Box label="합산 상태" value={mergeStatus} theme={theme} />
            <button
              onClick={() => { setLinkedGoogle(String(googleEmail).trim().toLowerCase()); setMergeStatus("기존 계정에 지메일 추가 연결 완료"); notify("지메일 추가 연결 완료"); }}
              className={`rounded-2xl px-4 py-3 text-sm font-black ${theme.main}`}
            >
              지메일 추가 연결
            </button>
            <button
              onClick={() => { setLinkedWallet(phantomWallet); setMergeStatus("기존 계정에 팬텀 지갑 추가 연결 완료"); notify("팬텀 지갑 추가 연결 완료"); }}
              className={`rounded-2xl px-4 py-3 text-sm font-black ${theme.main}`}
            >
              팬텀 지갑 추가 연결
            </button>
          </div>
        )}

        {myInfoTab === "지갑" && (
          <div className="grid gap-3 md:grid-cols-2">
            <Box label="등록 지갑" value={walletAccount?.address || linkedWallet || "미연결"} theme={theme} />
            <Box label="지갑 제공자" value={walletAccount?.provider || "미지정"} theme={theme} />
            <button onClick={() => onConnectWallet("Phantom", phantomWallet)} className={`rounded-2xl px-4 py-3 text-sm font-black ${theme.main}`}>Phantom 지갑 연결</button>
            <button onClick={() => onConnectWallet("MetaMask", phantomWallet)} className={`rounded-2xl border px-4 py-3 text-sm font-black ${theme.input}`}>MetaMask로 변경 연결</button>
          </div>
        )}

        {myInfoTab === "잔고/출금" && (
          <div className="grid gap-3 md:grid-cols-2">
            <Box label="내 잔고" value={`${number(financeAccount?.availableBalance || 0)} USDT`} theme={theme} />
            <Box label="P2P 판매 예치(락)" value={`${number(financeAccount?.p2pEscrowLocked || 0)} USDT`} theme={theme} />
            <Box label="누적 레퍼럴 수익" value={`${number(financeAccount?.referralEarningsTotal || 0)} USDT`} theme={theme} />
            <Box label="출금 대기" value={`${number(financeAccount?.pendingWithdrawal || 0)} USDT`} theme={theme} />
            <Box label="출금 지갑" value={walletAccount?.address || "지갑 미연결"} theme={theme} />
            <label className={`rounded-2xl p-4 ${theme.cardSoft}`}>
              <div className={`text-xs ${theme.muted}`}>출금 금액 (USDT)</div>
              <input
                value={withdrawAmountInput}
                onChange={(e) => setWithdrawAmountInput(e.target.value)}
                className="mt-1 w-full bg-transparent font-black outline-none"
                placeholder="예: 120"
              />
            </label>
            <label className={`rounded-2xl p-4 ${theme.cardSoft}`}>
              <div className={`text-xs ${theme.muted}`}>출금 메모</div>
              <input
                value={withdrawNoteInput}
                onChange={(e) => setWithdrawNoteInput(e.target.value)}
                className="mt-1 w-full bg-transparent font-black outline-none"
                placeholder="예: 레퍼럴 수익 정산"
              />
            </label>
            <button
              onClick={onRequestWithdrawal}
              className={`rounded-2xl px-4 py-3 text-sm font-black ${theme.main}`}
            >
              출금 신청 (회사 지갑 처리)
            </button>
            <div className={`rounded-2xl border p-4 text-xs ${theme.input}`}>
              출금 신청 시 회사 지갑에서 검토 후 순차 출금됩니다. P2P 매도가 최종 확인되면 주문 수량만큼 매수자 출금 가능 잔고에 반영됩니다(표시 단위는 추후 코인별 분리 가능).
            </div>
            <div className="md:col-span-2">
              <div className="mb-2 text-sm font-black">최근 출금 신청</div>
              <div className="space-y-2">
                {(withdrawRequests || []).slice(0, 6).map((item) => (
                  <div key={item.id} className={`rounded-2xl border p-3 text-xs ${theme.input}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-black">#{item.id} · {number(item.amount)} USDT</div>
                      <span className={`rounded-full px-2 py-1 text-[11px] font-black ${item.status === "approved" ? "bg-emerald-600 text-white" : item.status === "rejected" ? "bg-red-600 text-white" : "bg-amber-500 text-white"}`}>
                        {item.status}
                      </span>
                    </div>
                    <div className={`mt-1 ${theme.muted}`}>{item.destination_wallet_provider} · {item.destination_wallet_address}</div>
                    <div className={`mt-1 ${theme.muted}`}>{item.requested_at}{item.company_wallet_tx_id ? ` · tx ${item.company_wallet_tx_id}` : ""}</div>
                  </div>
                ))}
                {!withdrawRequests?.length && <div className={`rounded-2xl border p-3 text-xs ${theme.input}`}>아직 출금 신청 내역이 없습니다.</div>}
              </div>
            </div>
          </div>
        )}

        {myInfoTab === "계좌" && (
          <div className="grid gap-3 md:grid-cols-2">
            <Box label="은행계좌 상태" value={bankRegistered ? "등록 완료" : "미등록"} theme={theme} />
            <button onClick={() => { setBankRegistered(true); notify("은행계좌 등록 완료"); }} className={`rounded-2xl px-4 py-3 text-sm font-black ${bankRegistered ? "bg-emerald-600 text-white" : theme.main}`}>{bankRegistered ? "은행계좌 등록됨" : "은행계좌 등록"}</button>
            <label className={`rounded-2xl p-4 ${theme.cardSoft}`}>
              <div className={`text-xs ${theme.muted}`}>실명(신분증 기준)</div>
              <input
                value={buyerKyc.realName}
                onChange={(e) => setBuyerKyc((prev) => ({ ...prev, realName: e.target.value }))}
                className="mt-1 w-full bg-transparent font-black outline-none"
                placeholder="신분증과 동일한 실명"
              />
            </label>
            <div className={`rounded-2xl p-4 text-xs leading-6 ${theme.cardSoft}`}>
              KYC 문서(신분증, 은행계좌 증빙)는 회사 내부 분쟁 대응 목적으로만 비공개 보관되며 누구에게도 공개되지 않습니다.
            </div>
            <button
              onClick={async () => {
                try {
                  if (!idDocFile || !bankDocFile) {
                    notify("신분증 파일과 계좌증빙 파일을 모두 선택하세요.");
                    return;
                  }
                  const form = new FormData();
                  form.append("docType", "id_card");
                  form.append("file", idDocFile);
                  await fetch(`${API_BASE}/api/kyc/me/upload`, {
                    method: "POST",
                    headers: { Authorization: `Bearer ${localStorage.getItem(AUTH_TOKEN_KEY) || ""}` },
                    body: form,
                  });
                  const form2 = new FormData();
                  form2.append("docType", "bank_account");
                  form2.append("file", bankDocFile);
                  await fetch(`${API_BASE}/api/kyc/me/upload`, {
                    method: "POST",
                    headers: { Authorization: `Bearer ${localStorage.getItem(AUTH_TOKEN_KEY) || ""}` },
                    body: form2,
                  });
                  const data = await apiClient.request("/api/kyc/me/submit", {
                    method: "POST",
                    auth: true,
                    body: JSON.stringify({ realName: buyerKyc.realName }),
                  });
                  if (data?.profile) setBuyerKyc(data.profile);
                  notify("KYC 서류 제출 완료 · 회사 심사대기");
                } catch (error) {
                  notify(error.message || "KYC 제출에 실패했습니다.");
                }
              }}
              className={`rounded-2xl px-4 py-3 text-sm font-black ${theme.main}`}
            >
              KYC 서류 제출
            </button>
            <label className={`rounded-2xl p-4 ${theme.cardSoft}`}>
              <div className={`text-xs ${theme.muted}`}>신분증 파일 업로드</div>
              <input type="file" onChange={(e) => setIdDocFile(e.target.files?.[0] || null)} className="mt-2 w-full text-xs" />
            </label>
            <label className={`rounded-2xl p-4 ${theme.cardSoft}`}>
              <div className={`text-xs ${theme.muted}`}>은행계좌 증빙 업로드</div>
              <input type="file" onChange={(e) => setBankDocFile(e.target.files?.[0] || null)} className="mt-2 w-full text-xs" />
            </label>
            <Box
              label="KYC 최종 상태"
              value={buyerKyc.companyApprovalStatus || "미제출"}
              theme={theme}
            />
          </div>
        )}

        {myInfoTab === "레퍼럴" && (
          <div className="grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2 grid gap-2 md:grid-cols-3">
              <div className={`rounded-2xl p-4 ${theme.cardSoft}`}>
                <div className={`text-xs ${theme.muted}`}>총 하부</div>
                <div className="mt-1 text-xl font-black">{number(referralStats?.totalDownlines || 0)}명</div>
              </div>
              <div className={`rounded-2xl p-4 ${theme.cardSoft}`}>
                <div className={`text-xs ${theme.muted}`}>활성 하부</div>
                <div className="mt-1 text-xl font-black">{number(referralStats?.activeDownlines || 0)}명</div>
              </div>
              <div className={`rounded-2xl p-4 ${theme.cardSoft}`}>
                <div className={`text-xs ${theme.muted}`}>이번 주 유입</div>
                <div className="mt-1 text-xl font-black">{number(referralStats?.weeklyNew || 0)}명</div>
              </div>
            </div>
            <div className={`rounded-2xl p-4 ${theme.cardSoft}`}>
              <div className={`text-xs ${theme.muted}`}>연결된 추천인(상위)</div>
              <div className="mt-1 font-black">{linkedReferral || "미연결"}</div>
            </div>
            <div className={`rounded-2xl p-4 ${theme.cardSoft}`}>
              <div className={`text-xs ${theme.muted}`}>내 추천인 코드 (수정 가능)</div>
              <input
                value={referralCodeDraft}
                onChange={(e) => setReferralCodeDraft(e.target.value.toUpperCase())}
                className="mt-1 w-full bg-transparent font-black outline-none"
                placeholder="예: TG-AB12CD"
              />
              <div className={`mt-1 text-[11px] ${referralCodeValid ? "text-emerald-500" : "text-amber-500"}`}>
                형식: 영문 대문자/숫자/-, 1~20자 (숫자만 가능)
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={async () => {
                    if (!referralCodeValid) {
                      notify("추천인 코드 형식이 올바르지 않습니다.");
                      return;
                    }
                    try {
                      setIsSavingReferralCode(true);
                      const data = await apiClient.request("/api/referral/me/code", {
                        method: "PUT",
                        auth: true,
                        body: JSON.stringify({ myReferralCode: normalizedReferralDraft }),
                      });
                      const savedCode = data?.referral?.myReferralCode || normalizedReferralDraft;
                      setMyReferralCode(savedCode);
                      setReferralCodeDraft(savedCode);
                      notify("내 추천인 코드가 저장되었습니다.");
                    } catch (error) {
                      notify(error.message || "추천인 코드 저장에 실패했습니다.");
                    } finally {
                      setIsSavingReferralCode(false);
                    }
                  }}
                  disabled={isSavingReferralCode || !referralCodeValid}
                  className={`rounded-xl px-3 py-2 text-xs font-black ${isSavingReferralCode || !referralCodeValid ? "bg-slate-500 text-white" : theme.main}`}
                >
                  {isSavingReferralCode ? "저장중..." : "코드 저장"}
                </button>
                <button
                  onClick={() => {
                    const seed = Math.random().toString(36).slice(2, 8).toUpperCase();
                    setReferralCodeDraft(`TG-${seed}`);
                  }}
                  className={`rounded-xl border px-3 py-2 text-xs font-black ${theme.input}`}
                >
                  코드 생성
                </button>
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(myReferralCode || "");
                      notify("추천인 코드가 복사되었습니다.");
                    } catch {
                      notify("복사에 실패했습니다.");
                    }
                  }}
                  className={`rounded-xl border px-3 py-2 text-xs font-black ${theme.input}`}
                >
                  코드 복사
                </button>
              </div>
            </div>
            <div className="md:col-span-2 rounded-2xl border p-4">
              <div className={`text-xs ${theme.muted}`}>추천 가입 링크</div>
              <div className="mt-1 break-all text-sm font-black">{referralJoinLink}</div>
              <div className={`mt-1 text-[11px] ${theme.muted}`}>
                링크로 접속한 사용자는 가입창 추천인 코드가 자동 입력됩니다.
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(referralJoinLink || "");
                      notify("추천 링크가 복사되었습니다.");
                    } catch {
                      notify("링크 복사에 실패했습니다.");
                    }
                  }}
                  className={`rounded-xl px-3 py-2 text-xs font-black ${theme.main}`}
                >
                  추천 링크 복사
                </button>
                <button onClick={() => setShowReferral(!showReferral)} className={`rounded-xl border px-3 py-2 text-xs font-black ${theme.input}`}>
                  {showReferral ? "내 코드 숨기기" : "내 코드 보기"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function p2pStatusLabel(status) {
  const map = {
    listed: "판매등록",
    matched: "매칭됨",
    payment_sent: "송금완료·확인대기",
    cancelled: "취소",
    completed: "완료",
  };
  return map[status] || status;
}

function formatP2pMatchCountdown(matchDeadlineAtIso) {
  if (!matchDeadlineAtIso) return "";
  const end = Date.parse(matchDeadlineAtIso);
  if (!Number.isFinite(end)) return "";
  const ms = end - Date.now();
  if (ms <= 0) return "송금 마감됨";
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `송금 확인까지 약 ${m}분 ${s}초`;
}

function MyTradesOnly({ theme, notify, apiClient, authToken }) {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [serverOrders, setServerOrders] = useState([]);
  const [serverLoading, setServerLoading] = useState(false);
  const [serverCancelId, setServerCancelId] = useState("");
  const [timelineOrderId, setTimelineOrderId] = useState("");
  const [orderEventsCache, setOrderEventsCache] = useState({});
  const [orderEventsLoadingId, setOrderEventsLoadingId] = useState("");
  const [orderFlowActionId, setOrderFlowActionId] = useState("");
  const [clockTick, setClockTick] = useState(0);

  async function reloadServerOrders() {
    if (!authToken) {
      setServerOrders([]);
      return;
    }
    try {
      setServerLoading(true);
      const data = await apiClient.request("/api/p2p/orders/me", { auth: true });
      setServerOrders(Array.isArray(data.orders) ? data.orders : []);
    } catch {
      setServerOrders([]);
    } finally {
      setServerLoading(false);
    }
  }

  useEffect(() => {
    reloadServerOrders();
  }, [authToken, apiClient]);

  useEffect(() => {
    if (!authToken) return undefined;
    const id = setInterval(() => setClockTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [authToken]);

  async function cancelMyListing(orderId) {
    try {
      setServerCancelId(orderId);
      await apiClient.request(`/api/p2p/orders/${encodeURIComponent(orderId)}/cancel`, {
        method: "POST",
        auth: true,
        body: JSON.stringify({}),
      });
      notify("호가를 취소했습니다.");
      await reloadServerOrders();
      setOrderEventsCache((prev) => {
        const next = { ...prev };
        delete next[orderId];
        return next;
      });
    } catch (error) {
      notify(error.message || "취소에 실패했습니다.");
    } finally {
      setServerCancelId("");
    }
  }

  async function toggleOrderTimeline(orderId) {
    if (timelineOrderId === orderId) {
      setTimelineOrderId("");
      return;
    }
    setTimelineOrderId(orderId);
    if (orderEventsCache[orderId]) return;
    try {
      setOrderEventsLoadingId(orderId);
      const data = await apiClient.request(`/api/p2p/orders/${encodeURIComponent(orderId)}/events`, { auth: true });
      const ev = Array.isArray(data.events) ? data.events : [];
      setOrderEventsCache((prev) => ({ ...prev, [orderId]: ev }));
    } catch (error) {
      notify(error.message || "주문 이벤트를 불러오지 못했습니다.");
      setTimelineOrderId("");
    } finally {
      setOrderEventsLoadingId("");
    }
  }

  async function refreshOrderTimeline(orderId) {
    if (!authToken) return;
    try {
      setOrderEventsLoadingId(orderId);
      const data = await apiClient.request(`/api/p2p/orders/${encodeURIComponent(orderId)}/events`, { auth: true });
      const ev = Array.isArray(data.events) ? data.events : [];
      setOrderEventsCache((prev) => ({ ...prev, [orderId]: ev }));
      notify("타임라인을 새로고침했습니다.");
    } catch (error) {
      notify(error.message || "새로고침에 실패했습니다.");
    } finally {
      setOrderEventsLoadingId("");
    }
  }

  async function paymentStartOrder(orderId) {
    try {
      setOrderFlowActionId(orderId);
      await apiClient.request(`/api/p2p/orders/${encodeURIComponent(orderId)}/payment-start`, {
        method: "POST",
        auth: true,
        body: JSON.stringify({}),
      });
      notify("송금 신청을 접수했습니다. 마감 전 송금 확인(송금 완료 표시)을 완료해 주세요.");
      await reloadServerOrders();
      setOrderEventsCache((prev) => {
        const next = { ...prev };
        delete next[orderId];
        return next;
      });
    } catch (error) {
      notify(error.message || "송금 신청에 실패했습니다.");
    } finally {
      setOrderFlowActionId("");
    }
  }

  async function markBuyerPaid(orderId) {
    try {
      setOrderFlowActionId(orderId);
      await apiClient.request(`/api/p2p/orders/${encodeURIComponent(orderId)}/mark-paid`, {
        method: "POST",
        auth: true,
        body: JSON.stringify({}),
      });
      notify("송금 완료로 표시했습니다.");
      await reloadServerOrders();
      setOrderEventsCache((prev) => {
        const next = { ...prev };
        delete next[orderId];
        return next;
      });
    } catch (error) {
      notify(error.message || "처리에 실패했습니다.");
    } finally {
      setOrderFlowActionId("");
    }
  }

  async function completeSellerOrder(orderId) {
    try {
      setOrderFlowActionId(orderId);
      await apiClient.request(`/api/p2p/orders/${encodeURIComponent(orderId)}/complete`, {
        method: "POST",
        auth: true,
        body: JSON.stringify({}),
      });
      notify("거래를 완료했습니다.");
      await reloadServerOrders();
      setOrderEventsCache((prev) => {
        const next = { ...prev };
        delete next[orderId];
        return next;
      });
    } catch (error) {
      notify(error.message || "완료 처리에 실패했습니다.");
    } finally {
      setOrderFlowActionId("");
    }
  }

  async function withdrawMatched(orderId) {
    const ok = window.confirm("매칭을 철회하고 주문을 취소합니다. 계속할까요?");
    if (!ok) return;
    try {
      setOrderFlowActionId(orderId);
      await apiClient.request(`/api/p2p/orders/${encodeURIComponent(orderId)}/withdraw-match`, {
        method: "POST",
        auth: true,
        body: JSON.stringify({}),
      });
      notify("매칭을 철회했습니다.");
      await reloadServerOrders();
      setOrderEventsCache((prev) => {
        const next = { ...prev };
        delete next[orderId];
        return next;
      });
      setTimelineOrderId((cur) => (cur === orderId ? "" : cur));
    } catch (error) {
      notify(error.message || "철회에 실패했습니다.");
    } finally {
      setOrderFlowActionId("");
    }
  }

  const filteredTrades = trades.filter((trade) => {
    const tradeDate = trade.time.slice(0, 10);
    if (fromDate && tradeDate < fromDate) return false;
    if (toDate && tradeDate > toDate) return false;
    return true;
  });

  const filteredServerOrders = serverOrders.filter((row) => {
    const d = String(row.created_at || "").slice(0, 10);
    if (fromDate && d && d < fromDate) return false;
    if (toDate && d && d > toDate) return false;
    return true;
  });

  return (
    <section className="mx-auto max-w-7xl px-4 py-8">
      <div className={`rounded-3xl border p-5 shadow-sm ${theme.card}`}>
        <div className="mb-5 flex items-center justify-between">
          <div>
            <div className="text-xl font-black">내 거래</div>
            <div className={`text-sm ${theme.subtext}`}>기간별 거래내역 · 서버 연동 P2P 주문 · 데모 목업</div>
          </div>
          <button onClick={() => notify(`${fromDate || "시작일 미지정"} ~ ${toDate || "종료일 미지정"} 기간 조회`)} className={`rounded-2xl border px-4 py-2 text-sm font-bold ${theme.input}`}>기간조회</button>
        </div>
        <div className="mb-4 grid gap-2 md:grid-cols-3">
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={`rounded-2xl border px-4 py-3 text-sm font-bold outline-none ${theme.input}`} />
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className={`rounded-2xl border px-4 py-3 text-sm font-bold outline-none ${theme.input}`} />
          <button
            onClick={() => {
              setFromDate("");
              setToDate("");
              notify("기간 필터를 초기화했습니다.");
            }}
            className={`rounded-2xl border px-4 py-3 text-sm font-black ${theme.input}`}
          >
            기간 초기화
          </button>
        </div>

        {authToken ? (
          <div className="mb-6 space-y-3">
            <div className={`text-sm font-black ${theme.subtext}`}>서버 P2P 주문 {serverLoading ? "(불러오는 중…)" : `(${filteredServerOrders.length}건)`}</div>
            {filteredServerOrders.length ? filteredServerOrders.map((row) => (
              <div key={row.id} className={`rounded-2xl border border-white/10 ${theme.cardSoft}`}>
                <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="font-black">
                      {row.my_role === "seller" ? "매도" : row.my_role === "buyer" ? "매수" : "참여"}
                      {" "}
                      {row.amount} {row.coin}
                      {Number(row.unit_price) > 0 ? ` · 단가 ${row.unit_price}` : ""}
                    </div>
                    <div className={`mt-1 text-xs ${theme.muted}`}>
                      {row.id} · {row.created_at}
                      {row.payment_method ? ` · ${row.payment_method}` : ""}
                    </div>
                    {row.status === "matched" && row.match_deadline_at ? (
                      <div className={`mt-1 text-[11px] font-bold text-amber-400`}>
                        {formatP2pMatchCountdown(row.match_deadline_at)}
                        {typeof row.match_sla_minutes === "number" ? ` · 매칭 후 ${row.match_sla_minutes}분 내 송금 확인` : ""}
                      </div>
                    ) : null}
                    {row.status === "matched" && row.my_role === "seller" ? (
                      <div className={`mt-1 text-[10px] leading-snug ${theme.muted}`}>
                        시간 내 미체결 시 자동 취소되며, 예치·정산 정책에 따라 해당 물량이 판매자 측으로 복구됩니다.
                      </div>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
                    <span className="w-fit rounded-full bg-indigo-600 px-3 py-1 text-xs font-black text-white">{p2pStatusLabel(row.status)}</span>
                    <button
                      type="button"
                      onClick={() => toggleOrderTimeline(row.id)}
                      className={`rounded-xl border px-3 py-2 text-xs font-black ${theme.input}`}
                    >
                      {timelineOrderId === row.id ? "타임라인 닫기" : "이벤트 타임라인"}
                    </button>
                    {row.my_role === "seller" && row.status === "listed" ? (
                      <button
                        type="button"
                        disabled={serverCancelId === row.id}
                        onClick={() => cancelMyListing(row.id)}
                        className={`rounded-xl border border-amber-500/60 px-3 py-2 text-xs font-black text-amber-600 ${theme.input}`}
                      >
                        {serverCancelId === row.id ? "취소 중…" : "호가 취소"}
                      </button>
                    ) : null}
                    {row.my_role === "buyer" && row.status === "matched" && !row.buyer_payment_started_at ? (
                      <button
                        type="button"
                        disabled={orderFlowActionId === row.id}
                        onClick={() => paymentStartOrder(row.id)}
                        className={`rounded-xl border border-violet-500/60 px-3 py-2 text-xs font-black text-violet-200 ${theme.input}`}
                      >
                        {orderFlowActionId === row.id ? "처리 중…" : "송금 신청"}
                      </button>
                    ) : null}
                    {row.my_role === "buyer" && row.status === "matched" && row.buyer_payment_started_at ? (
                      <button
                        type="button"
                        disabled={orderFlowActionId === row.id}
                        onClick={() => markBuyerPaid(row.id)}
                        className={`rounded-xl border border-sky-500/60 px-3 py-2 text-xs font-black text-sky-300 ${theme.input}`}
                      >
                        {orderFlowActionId === row.id ? "처리 중…" : "송금 완료 표시"}
                      </button>
                    ) : null}
                    {row.status === "matched" && row.my_role === "seller" ? (
                      <button
                        type="button"
                        disabled={orderFlowActionId === row.id}
                        onClick={() => withdrawMatched(row.id)}
                        className={`rounded-xl border border-red-500/50 px-3 py-2 text-xs font-black text-red-300 ${theme.input}`}
                      >
                        {orderFlowActionId === row.id ? "처리 중…" : "매칭 취소"}
                      </button>
                    ) : null}
                    {row.status === "matched" && row.my_role === "buyer" && !row.buyer_payment_started_at ? (
                      <button
                        type="button"
                        disabled={orderFlowActionId === row.id}
                        onClick={() => withdrawMatched(row.id)}
                        className={`rounded-xl border border-red-500/50 px-3 py-2 text-xs font-black text-red-300 ${theme.input}`}
                      >
                        {orderFlowActionId === row.id ? "처리 중…" : "매칭 철회"}
                      </button>
                    ) : null}
                    {row.my_role === "seller" && row.status === "payment_sent" ? (
                      <button
                        type="button"
                        disabled={orderFlowActionId === row.id}
                        onClick={() => completeSellerOrder(row.id)}
                        className={`rounded-xl border border-emerald-500/60 px-3 py-2 text-xs font-black text-emerald-300 ${theme.input}`}
                      >
                        {orderFlowActionId === row.id ? "처리 중…" : "거래 완료(릴리즈)"}
                      </button>
                    ) : null}
                  </div>
                </div>
                {timelineOrderId === row.id ? (
                  <div className={`border-t border-white/10 px-4 pb-4 pt-3 ${theme.subtext}`}>
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[11px] font-black text-emerald-400">서버 기록 (추적)</span>
                      <button
                        type="button"
                        disabled={orderEventsLoadingId === row.id}
                        onClick={() => refreshOrderTimeline(row.id)}
                        className={`rounded-xl border px-3 py-2 text-xs font-black ${theme.input}`}
                      >
                        {orderEventsLoadingId === row.id ? "…" : "타임라인 새로고침"}
                      </button>
                    </div>
                    {orderEventsLoadingId === row.id ? (
                      <div className={`text-xs ${theme.muted}`}>불러오는 중…</div>
                    ) : (orderEventsCache[row.id] || []).length ? (
                      <ul className="max-h-56 space-y-2 overflow-auto text-[11px]">
                        {(orderEventsCache[row.id] || []).map((ev) => (
                          <li key={ev.id} className={`rounded-lg border border-white/5 px-2 py-2 ${theme.card}`}>
                            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                              <span className="font-mono text-[10px] text-sky-400">{ev.created_at}</span>
                              <span className="font-black">{ev.action}</span>
                              {ev.actor_user_id != null ? (
                                <span className={`text-[10px] ${theme.muted}`}>actor #{ev.actor_user_id}</span>
                              ) : null}
                            </div>
                            <pre className={`mt-1 max-h-20 overflow-auto whitespace-pre-wrap break-all font-mono text-[10px] ${theme.muted}`}>{ev.detail_json}</pre>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className={`text-xs ${theme.muted}`}>이벤트가 없습니다.</div>
                    )}
                  </div>
                ) : null}
              </div>
            )) : !serverLoading ? (
              <div className={`rounded-2xl border p-4 text-sm ${theme.input}`}>아직 서버에 등록된 P2P 주문이 없습니다. (API 연동됨)</div>
            ) : null}
          </div>
        ) : (
          <div className={`mb-6 rounded-2xl border p-3 text-sm ${theme.input}`}>로그인하면 서버에 저장된 P2P 주문이 여기에 표시됩니다.</div>
        )}

        <div className={`mb-2 text-sm font-black ${theme.subtext}`}>데모 목업 거래 (로컬)</div>
        <div className="space-y-3">
          {filteredTrades.length ? filteredTrades.map((tr) => (
            <div key={tr.id} className={`flex items-center justify-between rounded-2xl p-4 ${theme.cardSoft}`}>
              <div>
                <div className="font-black">{tr.type} {tr.amount} {tr.coin}</div>
                <div className={`mt-1 text-xs ${theme.muted}`}>{tr.id} · {tr.time}</div>
              </div>
              <span className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-black text-white">{tr.status}</span>
            </div>
          )) : (
            <div className={`rounded-2xl border p-4 text-sm ${theme.input}`}>선택한 기간의 데모 거래 기록이 없습니다.</div>
          )}
        </div>
      </div>
    </section>
  );
}

function P2PInfo({ theme }) {
  return <section className="mx-auto max-w-7xl px-4 py-8"><div className={`rounded-3xl border p-6 shadow-sm ${theme.card}`}><h2 className="text-2xl font-black">P2P 운영 구조</h2><div className="mt-5 grid gap-4 md:grid-cols-3"><Info title="판매자 예치" text="판매자는 거래금액, 수수료, 가스비, 취소비용을 포함해 예치합니다." theme={theme} /><Info title="구매자 송금" text="구매자는 선택한 통화 종류 기준으로 송금 후 증빙을 업로드합니다." theme={theme} /><Info title="릴리즈" text="구매확인, 친구등록, 레벨정책, 지연이체 조건에 따라 코인이 지급됩니다." theme={theme} /></div></div></section>;
}

function AdminReferralPanel({ theme, notify, isSuperAdmin, apiClient, authToken, authUsers, setAuthUsers, buyerKyc, setBuyerKyc, friends, chatRooms, sellerDepositNotice, setSellerDepositNotice, escrowPolicy, setEscrowPolicy, disputeCases, approveDisputeCase, finalizeDisputeByMain, currentAdminActorId, finalApprovalPinInput, setFinalApprovalPinInput, finalApprovalOtpInput, setFinalApprovalOtpInput, newPolicyPinInput, setNewPolicyPinInput, selectedDisputeIdForTimeline, setSelectedDisputeIdForTimeline, selectedDisputeEvents, setSelectedDisputeEvents, timelineActionFilter, setTimelineActionFilter, timelineFromDate, setTimelineFromDate, timelineToDate, setTimelineToDate, adminMediaTypeFilter, setAdminMediaTypeFilter, adminMediaFriendFilter, setAdminMediaFriendFilter, adminActionLogs, appendAdminAction, setAdminActionLogs, adminMember, setAdminMember, adminParent, setAdminParent, adminReceivedRate, setAdminReceivedRate, adminRate, setAdminRate, adminMemo, setAdminMemo, adminUserSearch, setAdminUserSearch, selectedAdminUser, setSelectedAdminUser, selectedChildUser, setSelectedChildUser, securityFilter, setSecurityFilter, blockReason, setBlockReason, useExternalAdminNav = false, legacyTabFromShell = null }) {
  const [timelineVerifyResult, setTimelineVerifyResult] = useState("");
  const [kycDocs, setKycDocs] = useState([]);
  const [kycViewReason, setKycViewReason] = useState("");
  const [kycDocPreview, setKycDocPreview] = useState("");
  const [kycDocLogs, setKycDocLogs] = useState([]);
  const [kycViewRequests, setKycViewRequests] = useState([]);
  const [selectedKycRequestId, setSelectedKycRequestId] = useState("");
  const [kycLogVerifyResult, setKycLogVerifyResult] = useState("");
  const [selectedKycDocId, setSelectedKycDocId] = useState("");
  const [kycWatermarkText, setKycWatermarkText] = useState("");
  const [kycRejectReason, setKycRejectReason] = useState("");
  const [webhookEvents, setWebhookEvents] = useState([]);
  const [webhookLoading, setWebhookLoading] = useState(false);
  const [webhookStatusFilter, setWebhookStatusFilter] = useState("all");
  const [webhookChainAlertOnly, setWebhookChainAlertOnly] = useState(false);
  const [webhookAutoRefresh, setWebhookAutoRefresh] = useState(true);
  const [webhookChainAlertUnreadCount, setWebhookChainAlertUnreadCount] = useState(0);
  const [webhookAutoFocusOpsOnAlert, setWebhookAutoFocusOpsOnAlert] = useState(true);
  const [webhookAlertSoundEnabled, setWebhookAlertSoundEnabled] = useState(false);
  const webhookChainInitialFetchDoneRef = useRef(false);
  const webhookChainMaxSeenIdRef = useRef(0);
  const webhookPrevUnreadCountRef = useRef(0);
  const [auditFromDate, setAuditFromDate] = useState("");
  const [auditToDate, setAuditToDate] = useState("");
  const [auditLoading, setAuditLoading] = useState(false);
  const [approvalAuditSummary, setApprovalAuditSummary] = useState({
    totalEvents: 0,
    kycRequestCount: 0,
    kycApprovalCount: 0,
    kycRejectedCount: 0,
    kycViewCount: 0,
    disputeApprovalCount: 0,
  });
  const [approvalAuditEvents, setApprovalAuditEvents] = useState([]);
  const [recentReportHashes, setRecentReportHashes] = useState([]);
  const [verifyHashInput, setVerifyHashInput] = useState("");
  const [verifyHashResult, setVerifyHashResult] = useState("");
  const [verifyHashType, setVerifyHashType] = useState("approval_audit_pdf");
  const [opsRiskLoading, setOpsRiskLoading] = useState(false);
  const [opsRiskSummary, setOpsRiskSummary] = useState({
    overallLevel: "normal",
    score: 0,
    risks: [],
    generatedAt: "",
  });
  const [opsActionLoading, setOpsActionLoading] = useState("");
  const [adminViewTab, setAdminViewTab] = useState("dashboard");
  useEffect(() => {
    if (!legacyTabFromShell) return;
    setAdminViewTab(legacyTabFromShell);
  }, [legacyTabFromShell]);
  const [selectedOpsUserId, setSelectedOpsUserId] = useState("");
  const [selectedSecurityUserId, setSelectedSecurityUserId] = useState("");
  const [opsSnapshots, setOpsSnapshots] = useState([]);
  const [opsSnapshotLabel, setOpsSnapshotLabel] = useState("");
  const [opsSnapshotReason, setOpsSnapshotReason] = useState("");
  const [rollbackSnapshotId, setRollbackSnapshotId] = useState("");
  const [rollbackReason, setRollbackReason] = useState("");
  const [rollbackConfirmText, setRollbackConfirmText] = useState("");
  const [opsSnapshotLoading, setOpsSnapshotLoading] = useState(false);
  const [marketCatalogLoading, setMarketCatalogLoading] = useState(false);
  const [marketCatalogSaving, setMarketCatalogSaving] = useState(false);
  const [marketCatalogRevision, setMarketCatalogRevision] = useState("");
  const [marketAssets, setMarketAssets] = useState([]);
  const [marketCatalog, setMarketCatalog] = useState([]);
  const [marketCatalogLogs, setMarketCatalogLogs] = useState([]);
  const [marketAuditActorFilter, setMarketAuditActorFilter] = useState("");
  const [marketAuditQuery, setMarketAuditQuery] = useState("");
  const [marketAuditFromDate, setMarketAuditFromDate] = useState("");
  const [marketAuditToDate, setMarketAuditToDate] = useState("");
  const [marketAuditHasMore, setMarketAuditHasMore] = useState(false);
  const [marketAuditLoadingMore, setMarketAuditLoadingMore] = useState(false);
  const [expandedMarketAuditIds, setExpandedMarketAuditIds] = useState({});
  const [marketAuditScope, setMarketAuditScope] = useState("all");
  const [marketAuditIntegrityLoading, setMarketAuditIntegrityLoading] = useState(false);
  const [marketAuditIntegrity, setMarketAuditIntegrity] = useState({
    checkedAt: "",
    total: 0,
    rootHash: "",
    scope: "all",
  });
  const [marketAuditChangeAlerts, setMarketAuditChangeAlerts] = useState([]);
  const [lastMarketAuditAlertHash, setLastMarketAuditAlertHash] = useState("");
  const [originalMarketAssets, setOriginalMarketAssets] = useState([]);
  const [originalMarketCatalog, setOriginalMarketCatalog] = useState([]);
  const [marketAssetTypeFilter, setMarketAssetTypeFilter] = useState("all");
  const [marketStatusFilter, setMarketStatusFilter] = useState("all");
  const [marketSaveConfirmOpen, setMarketSaveConfirmOpen] = useState(false);
  const [emergencyState, setEmergencyState] = useState({
    emergencyMode: false,
    emergencyReason: "",
    emergencyEta: "",
    updatedByUserId: 0,
    updatedAt: "",
  });
  const [emergencyReasonInput, setEmergencyReasonInput] = useState("");
  const [emergencyEtaInput, setEmergencyEtaInput] = useState("");
  const [emergencyLoading, setEmergencyLoading] = useState(false);
  const [platformOpsLoading, setPlatformOpsLoading] = useState(false);
  const [platformOpsSaving, setPlatformOpsSaving] = useState(false);
  const [p2pMatchSlaInput, setP2pMatchSlaInput] = useState("30");
  const [p2pMatchSlaUpdatedAt, setP2pMatchSlaUpdatedAt] = useState("");
  const [p2pMatchSlaUpdatedBy, setP2pMatchSlaUpdatedBy] = useState(null);
  const [envFallbackSla, setEnvFallbackSla] = useState(30);
  const [priceFeedProviderSelect, setPriceFeedProviderSelect] = useState("");
  const [priceFeedBuiltinIds, setPriceFeedBuiltinIds] = useState([]);
  const [priceFeedEffective, setPriceFeedEffective] = useState("");
  const [priceFeedEnvOnly, setPriceFeedEnvOnly] = useState("");
  const [priceFeedUpdatedAt, setPriceFeedUpdatedAt] = useState("");
  const [priceFeedUpdatedBy, setPriceFeedUpdatedBy] = useState(null);
  const [selectedChildRateInput, setSelectedChildRateInput] = useState("");
  const [selectedChildIds, setSelectedChildIds] = useState([]);
  const [bulkChildRateInput, setBulkChildRateInput] = useState("");
  const [childInlineRates, setChildInlineRates] = useState({});
  const [monitorPath, setMonitorPath] = useState([]);
  const [userRateOverrides, setUserRateOverrides] = useState({});
  const [stageByUserId, setStageByUserId] = useState({});
  const [virtualDownlineUsers, setVirtualDownlineUsers] = useState(() => createVirtualDownlineUsers(currentAdminActorId));
  const [userParentOverrides, setUserParentOverrides] = useState({});
  const [userAdminAssignments, setUserAdminAssignments] = useState({});
  const [memberUserPage, setMemberUserPage] = useState(1);
  const [memberChildPage, setMemberChildPage] = useState(1);
  const [memberStageFilter, setMemberStageFilter] = useState("전체");
  const [memberStageFilterExpanded, setMemberStageFilterExpanded] = useState(false);
  const [memberListSort, setMemberListSort] = useState("joined_desc");
  const [platformAuditLogs, setPlatformAuditLogs] = useState([]);
  const [platformAuditLoading, setPlatformAuditLoading] = useState(false);
  const [adminP2pOrders, setAdminP2pOrders] = useState([]);
  const [adminP2pLoading, setAdminP2pLoading] = useState(false);
  const [adminP2pTimelineId, setAdminP2pTimelineId] = useState("");
  const [adminP2pEventsCache, setAdminP2pEventsCache] = useState({});
  const [adminP2pEventsLoadingId, setAdminP2pEventsLoadingId] = useState("");
  const [adminP2pCancelId, setAdminP2pCancelId] = useState("");
  const [downlineTargetUserId, setDownlineTargetUserId] = useState("");
  /** 우측 하부 트리 패널 전용 빠른 검색 (경로·선택 이동) */
  const [hierarchyQuickSearch, setHierarchyQuickSearch] = useState("");
  const [stageSelectionValue, setStageSelectionValue] = useState("");
  const [pendingStageValue, setPendingStageValue] = useState("");
  const [pendingStageFrom, setPendingStageFrom] = useState("");
  const [stageConfirmOpen, setStageConfirmOpen] = useState(false);
  const [stageConfirmTarget, setStageConfirmTarget] = useState("");
  const [stageConfirmFromStage, setStageConfirmFromStage] = useState("");
  const [showAdminDebug, setShowAdminDebug] = useState(false);
  const memberTreeSectionRef = useRef(null);
  const rateValidationSectionRef = useRef(null);
  const adminActionLogSectionRef = useRef(null);
  const hierarchyPathSectionRef = useRef(null);
  const directDownlineListRef = useRef(null);
  const pendingStageLengthLogRef = useRef(false);
  const lang = useLang();

  const memberUsers = useMemo(() => {
    const authMapped = Array.isArray(authUsers) && authUsers.length ? authUsers.map((user, index) => mapAuthUserToMember(user, index)) : [];
    const source = [...authMapped, ...virtualDownlineUsers];
    const effectiveParentOf = (candidate) =>
      userParentOverrides[candidate.id] != null ? userParentOverrides[candidate.id] : candidate.parent;
    return source.map((user) => {
      const childCount = source.filter((candidate) => String(effectiveParentOf(candidate)) === String(user.id)).length;
      const idKey = String(user.id);
      const fromApi = [user.stage_label, user.stageLabel].map((s) => String(s || "").trim()).find(Boolean);
      const byRuntimeMap = String(stageByUserId[idKey] || "").trim();
      const mergedStage = normalizeStageLabel(byRuntimeMap || fromApi || defaultStageLabelFromRole(user));
      return { ...user, stageLabel: mergedStage, stage_label: mergedStage, children: childCount };
    });
  }, [authUsers, virtualDownlineUsers, stageByUserId, userParentOverrides]);
  /** 로그인 관리자 1명만 집계에서 제외 — 동일 id 중복 행이 있어도 한 명만 빠지게(전체 카운트 급감 방지) */
  const summaryScopeUsers = useMemo(() => {
    const aid = String(currentAdminActorId ?? "");
    if (!aid) return memberUsers;
    let actorExcluded = false;
    const out = [];
    for (const u of memberUsers) {
      if (String(u.id) === aid && !actorExcluded) {
        actorExcluded = true;
        continue;
      }
      out.push(u);
    }
    return out;
  }, [memberUsers, currentAdminActorId]);

  useLayoutEffect(() => {
    if (!import.meta.env.DEV || !pendingStageLengthLogRef.current) return;
    pendingStageLengthLogRef.current = false;
    console.log("[handleChangeUserLevel] AFTER commit lengths", {
      authUsers: authUsers.length,
      virtualDownlineUsers: virtualDownlineUsers.length,
      memberUsers: memberUsers.length,
      summaryScopeUsers: summaryScopeUsers.length,
    });
  }, [authUsers.length, virtualDownlineUsers.length, memberUsers.length, summaryScopeUsers.length]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const expected = (Array.isArray(authUsers) ? authUsers.length : 0) + virtualDownlineUsers.length;
    if (memberUsers.length !== expected) {
      console.warn("[member pipeline] memberUsers.length !== authUsers.length + virtualDownlineUsers.length", {
        memberUsers: memberUsers.length,
        authUsers: authUsers.length,
        virtualDownlineUsers: virtualDownlineUsers.length,
        expected,
      });
    }
  }, [authUsers.length, virtualDownlineUsers.length, memberUsers.length]);

  useEffect(() => {
    setVirtualDownlineUsers(createVirtualDownlineUsers(currentAdminActorId));
  }, [currentAdminActorId]);

  function resetMemberMockDataset() {
    setVirtualDownlineUsers(createVirtualDownlineUsers(currentAdminActorId));
    setStageByUserId({});
    setUserParentOverrides({});
    setUserRateOverrides({});
    setChildInlineRates({});
    setMonitorPath([]);
    setSelectedChildIds([]);
    setDownlineTargetUserId("");
    setHierarchyQuickSearch("");
    setMemberUserPage(1);
    setMemberChildPage(1);
    setBulkChildRateInput("");
    setSelectedChildRateInput("");
    setSelectedAdminUser(null);
    setSelectedChildUser(null);
    setAdminUserSearch("");
    setAdminActionLogs([]);
    appendAdminAction(
      `목업 회원 데이터 초기화: 가상 하부 ${VIRTUAL_DOWNLINE_MEMBER_COUNT}명 재생성 · 단계/상위/배분 오버라이드 초기화 (시드·발급 테스트 계정·localStorage 레지스트리 유지)`
    );
    notify(`목업 DB 초기화: 가상 회원 ${VIRTUAL_DOWNLINE_MEMBER_COUNT}명 기본 분포로 복구했습니다.`);
  }

  useEffect(() => {
    const stripVirtualKeys = (prev) => {
      const next = { ...prev };
      for (const k of Object.keys(next)) {
        if (String(k).startsWith("VD-")) delete next[k];
      }
      return next;
    };
    setStageByUserId(stripVirtualKeys);
  }, [currentAdminActorId]);

  useEffect(() => {
    setUserAdminAssignments((prev) => {
      const next = { ...prev };
      for (const u of authUsers || []) {
        if (u?.admin_assigned !== undefined && u?.admin_assigned !== null) {
          next[u.id] = Boolean(u.admin_assigned);
        }
      }
      return next;
    });
  }, [authUsers]);

  const searchableUsers = useMemo(() => {
    const q = adminUserSearch.toLowerCase().trim();
    const filtered = summaryScopeUsers.filter((u) => {
      const stageText = String(u.stageLabel || u.stage_label || "").trim();
      const hay = `${u.id} ${u.nickname} ${u.email} ${u.wallet} ${u.parent} ${stageText}`.toLowerCase();
      return hay.includes(q);
    });
    if (q.length >= 1) return filtered.slice(0, 400);
    return filtered;
  }, [summaryScopeUsers, adminUserSearch]);

  const hierarchyQuickMatches = useMemo(() => {
    const q = hierarchyQuickSearch.trim().toLowerCase();
    if (!q) return [];
    return summaryScopeUsers
      .filter((u) => {
        const stageText = String(u.stageLabel || u.stage_label || "").trim();
        const hay = `${u.id} ${u.nickname} ${u.email} ${u.wallet} ${u.parent} ${stageText}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 14);
  }, [summaryScopeUsers, hierarchyQuickSearch]);
  const engineUsers = useMemo(
    () => memberUsers.map((u) => ({ ...u, level: getEffectiveStage(u), parentId: getEffectiveParent(u) })),
    [memberUsers, stageByUserId, userParentOverrides]
  );
  const referralTree = useMemo(() => buildReferralTree(engineUsers), [engineUsers]);
  /** 좌측 단계별 버튼 — `memberUsers`에 이미 병합된 `stageLabel`만 집계(stageByUserId 이중 참조 없음) */
  const downlineStageSummary = useMemo(() => {
    const counts = {};
    for (const u of summaryScopeUsers) {
      const stage = normalizeStageLabel(String(u.stageLabel || "").trim());
      counts[stage] = (counts[stage] || 0) + 1;
    }
    return counts;
  }, [summaryScopeUsers]);
  /** 버튼 표시 순서: ADMIN_STAGE_OPTIONS 순 → 그 외 알파벳 */
  const downlineStageSummaryEntries = useMemo(() => {
    const counts = downlineStageSummary;
    const seen = new Set();
    const ordered = [];
    for (const label of ADMIN_STAGE_OPTIONS) {
      if (Object.prototype.hasOwnProperty.call(counts, label)) {
        ordered.push([label, counts[label]]);
        seen.add(label);
      }
    }
    const extras = Object.keys(counts)
      .filter((k) => !seen.has(k))
      .sort((a, b) => a.localeCompare(b, "ko"));
    for (const k of extras) ordered.push([k, counts[k]]);
    return ordered;
  }, [downlineStageSummary]);
  const adminStats = useMemo(() => recalculateAdminStats(engineUsers), [engineUsers]);
  const treeIntegrity = useMemo(() => validateTreeIntegrity(engineUsers), [engineUsers]);
  const stageSummaryHealth = useMemo(() => {
    const total = Object.values(downlineStageSummary).reduce((acc, count) => acc + Number(count || 0), 0);
    const expected = summaryScopeUsers.length;
    return { total, expected, mismatch: total !== expected };
  }, [downlineStageSummary, summaryScopeUsers.length]);
  const visibleUsers = useMemo(() => {
    const stageUsers =
      memberStageFilter === "전체"
        ? searchableUsers
        : searchableUsers.filter((user) => {
            const rowStage = normalizeStageLabel(
              String(user.stageLabel || user.stage_label || "").trim() || defaultStageLabelFromRole(user)
            );
            return rowStage === normalizeStageLabel(String(memberStageFilter || "").trim());
          });
    const sorted = [...stageUsers];
    sorted.sort((a, b) => {
      if (memberListSort === "joined_asc") return String(a.joined || "").localeCompare(String(b.joined || ""));
      if (memberListSort === "joined_desc") return String(b.joined || "").localeCompare(String(a.joined || ""));
      if (memberListSort === "children_desc") return Number(b.children || 0) - Number(a.children || 0);
      if (memberListSort === "children_asc") return Number(a.children || 0) - Number(b.children || 0);
      if (memberListSort === "trades_desc") return Number(b.trades || 0) - Number(b.trades || 0);
      if (memberListSort === "trades_asc") return Number(a.trades || 0) - Number(b.trades || 0);
      return 0;
    });
    return sorted;
  }, [searchableUsers, memberStageFilter, memberListSort]);

  const received = Number(adminReceivedRate || 0);
  const childRate = Number(adminRate || 0);
  const marginRate = Math.max(received - childRate, 0);
  const invalidRate = childRate > received;

  function getEffectiveParent(user) {
    return userParentOverrides[user.id] ?? user.parent;
  }

  function getEffectiveStage(user) {
    if (!user) return ADMIN_STAGE_LABEL.MEMBER;
    const idKey = String(user.id || "");
    const staged = String(stageByUserId[idKey] || "").trim();
    if (staged) return normalizeStageLabel(staged);
    return normalizeStageLabel(user.stageLabel || user.stage_label || defaultStageLabelFromRole(user));
  }

  function getStageRank(stageLabel) {
    const normalized = normalizeStageLabel(stageLabel);
    if (normalized === ADMIN_STAGE_LABEL.SUPER_PAGE) return 1000;
    if (normalized === ADMIN_STAGE_LABEL.HQ_ADMIN) return 900;
    if (normalized === ADMIN_STAGE_LABEL.HQ_STAFF) return 800;
    if (normalized === ADMIN_STAGE_LABEL.MEMBER) return 0;
    const match = normalized.match(/^LEVEL\s+(\d{1,2})$/i);
    if (match) {
      const levelNo = Number(match[1]);
      if (Number.isFinite(levelNo) && levelNo >= 1 && levelNo <= 10) {
        return 700 - levelNo;
      }
    }
    return 0;
  }

  function canActorControlTargetLevel(targetUser, nextLevel) {
    if (!targetUser) return false;
    if (isSuperAdmin) return true;
    const actor = memberUsers.find((u) => String(u.id) === String(currentAdminActorId));
    if (!actor) return false;
    const isDownlineTarget = getAllDownlines(actor.id, memberUsers).some((u) => String(u.id) === String(targetUser.id));
    if (!isDownlineTarget) return false;
    const actorRank = getStageRank(getEffectiveStage(actor));
    const targetRank = getStageRank(getEffectiveStage(targetUser));
    const nextRank = getStageRank(nextLevel);
    return actorRank > targetRank && actorRank > nextRank;
  }

  function isAdminAssignedUser(user) {
    if (!user) return false;
    if (Object.prototype.hasOwnProperty.call(userAdminAssignments, user.id)) {
      return Boolean(userAdminAssignments[user.id]);
    }
    return Boolean(user.adminAssigned || user.admin_assigned);
  }

  const monitorCurrentId = monitorPath[monitorPath.length - 1] || selectedAdminUser?.id || "";
  /** 반드시 memberUsers 안에서만 해석 — fakeUsers 등 풀 밖 객체를 쓰면 단계/집계가 영구히 어긋남 */
  const monitorCurrentUser = monitorCurrentId ? memberUsers.find((u) => String(u.id) === String(monitorCurrentId)) ?? null : null;
  const isSelfTargetMember = Boolean(monitorCurrentUser) && String(monitorCurrentUser.id) === String(currentAdminActorId);
  const monitorChildren = monitorCurrentUser ? getDirectDownlines(monitorCurrentUser.id, memberUsers) : [];
  const selectedChildren = monitorCurrentUser ? getDirectDownlines(monitorCurrentUser.id, memberUsers) : [];
  const MEMBER_USERS_PER_PAGE = 6;
  const MEMBER_CHILDREN_PER_PAGE = 6;
  const memberUserTotalPages = Math.max(1, Math.ceil(visibleUsers.length / MEMBER_USERS_PER_PAGE));
  const memberChildTotalPages = Math.max(1, Math.ceil(selectedChildren.length / MEMBER_CHILDREN_PER_PAGE));
  const pagedVisibleUsers = visibleUsers.slice((memberUserPage - 1) * MEMBER_USERS_PER_PAGE, memberUserPage * MEMBER_USERS_PER_PAGE);
  const pagedSelectedChildren = selectedChildren.slice((memberChildPage - 1) * MEMBER_CHILDREN_PER_PAGE, memberChildPage * MEMBER_CHILDREN_PER_PAGE);
  const monitorDirectChildrenCount = monitorChildren.length;
  const monitorDescendantCount = monitorCurrentUser ? getAllDownlines(monitorCurrentUser.id, memberUsers).length : 0;

  const securityUsers = memberUsers.filter((u) => {
    if (securityFilter === "전체") return true;
    if (securityFilter === "주의") return u.status === "주의" || u.riskScore >= 70;
    if (securityFilter === "신고") return u.reports > 0;
    if (securityFilter === "블랙") return u.blacklist;
    return true;
  }).slice(0, 12);

  const riskColor = selectedAdminUser?.blacklist ? "bg-red-600 text-white" : selectedAdminUser?.riskScore >= 70 ? "bg-amber-500 text-white" : "bg-emerald-600 text-white";
  const mediaEvents = Object.entries(chatRooms || {}).flatMap(([friendId, roomMessages = []]) => {
    const friendName = (friends || []).find((friend) => friend.id === friendId)?.nickname || friendId;
    return roomMessages
      .filter((message) => message.attachment)
      .map((message) => ({
        id: message.id,
        friendId,
        friendName,
        createdAt: message.createdAt,
        sender: message.sender,
        fileName: message.attachment?.name || "unknown",
        fileType: message.attachment?.type || "unknown",
        isVoice: (message.attachment?.type || "").startsWith("audio/"),
      }));
  });
  const filteredMediaEvents = mediaEvents.filter((item) => {
    const typeMatch =
      adminMediaTypeFilter === "전체"
        ? true
        : adminMediaTypeFilter === "음성"
          ? item.isVoice
          : !item.isVoice;
    const friendMatch = adminMediaFriendFilter === "전체" ? true : item.friendId === adminMediaFriendFilter;
    return typeMatch && friendMatch;
  });
  const totalMediaCount = filteredMediaEvents.length;
  const voiceMediaCount = filteredMediaEvents.filter((item) => item.isVoice).length;
  const fileMediaCount = totalMediaCount - voiceMediaCount;

  const myDirectUsers = memberUsers.filter((u) => String(getEffectiveParent(u)) === String(selectedAdminUser?.id));
  const myTotalVolume = myDirectUsers.reduce((sum, u) => sum + u.volume, 0);

  const myReferralProfit = myDirectUsers.reduce((sum, u) => {
    const referralFee = u.volume * (u.marginRate / 100) * 0.02;
    return sum + referralFee;
  }, 0);
  const myMonthlyProfit = myReferralProfit * 0.42;
  const myWeeklyProfit = myReferralProfit * 0.11;
  const myWithdrawable = myReferralProfit * 0.72;
  const myPendingProfit = myReferralProfit - myWithdrawable;
  const selectedOpsUser = authUsers.find((user) => String(user.id) === String(selectedOpsUserId)) || authUsers[0] || null;
  const selectedSecurityUser = securityUsers.find((user) => String(user.id) === String(selectedSecurityUserId)) || securityUsers[0] || null;

  function applyUserContext(user) {
    const canonicalUser = memberUsers.find((u) => String(u.id) === String(user?.id)) || user || null;
    if (!canonicalUser) return;
    setSelectedAdminUser(canonicalUser);
    setSelectedChildUser(null);
    setSelectedChildRateInput("");
    setSelectedChildIds([]);
    setBulkChildRateInput("");
    setChildInlineRates({});
    setAdminMember(String(canonicalUser?.id || ""));
    setAdminParent(String(getEffectiveParent(canonicalUser) || ""));
    setAdminReceivedRate(String(canonicalUser?.receivedRate ?? ""));
    setAdminRate(String(canonicalUser?.childRate ?? ""));
    setAdminMemo(`${canonicalUser?.nickname || "-"} / ${canonicalUser?.parent || "-"} 하부 / 현재 배분율 ${canonicalUser?.childRate ?? 0}%`);
    setDownlineTargetUserId("");
  }

  function selectUser(user) {
    applyUserContext(user);
    setMonitorPath([user.id]);
  }

  function jumpToTreeMember(user) {
    if (!user) return;
    selectUser(user);
    setHierarchyQuickSearch("");
    requestAnimationFrame(() => {
      hierarchyPathSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function drillDownToUser(user) {
    applyUserContext(user);
    setMonitorPath((prev) => {
      const foundIndex = prev.indexOf(user.id);
      if (foundIndex >= 0) return prev.slice(0, foundIndex + 1);
      return [...prev, user.id];
    });
    requestAnimationFrame(() => {
      hierarchyPathSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function moveToHierarchyDepth(targetIndex) {
    setMonitorPath((prev) => {
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const nextPath = prev.slice(0, targetIndex + 1);
      const targetUser = memberUsers.find((u) => String(u.id) === String(nextPath[nextPath.length - 1]));
      if (targetUser) applyUserContext(targetUser);
      return nextPath;
    });
    requestAnimationFrame(() => {
      hierarchyPathSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function moveToHierarchyRoot() {
    moveToHierarchyDepth(0);
  }

  useEffect(() => {
    setMemberUserPage(1);
  }, [adminUserSearch]);

  useEffect(() => {
    setMemberChildPage(1);
  }, [monitorCurrentUser?.id]);

  useEffect(() => {
    if (memberUserPage > memberUserTotalPages) setMemberUserPage(memberUserTotalPages);
  }, [memberUserPage, memberUserTotalPages]);
  useEffect(() => {
    setMemberUserPage(1);
  }, [adminUserSearch, memberStageFilter, memberListSort]);

  useEffect(() => {
    if (memberChildPage > memberChildTotalPages) setMemberChildPage(memberChildTotalPages);
  }, [memberChildPage, memberChildTotalPages]);

  /** 선택 회원: 로그인 관리자(본사)를 기본으로 두고, 목록 갱신·단계 변경 등에도 유지한다. 없어진 id일 때만 본사 관리자로 되돌린다(목업 DB 초기화 시 null→재설정). */
  useEffect(() => {
    if (!memberUsers.length) return;
    const actor = memberUsers.find((u) => String(u.id) === String(currentAdminActorId));
    const selectedId = String(selectedAdminUser?.id || "");
    const existsInMemberPool = selectedId ? memberUsers.some((u) => String(u.id) === selectedId) : false;
    if (selectedId && existsInMemberPool) return;
    if (actor) {
      applyUserContext(actor);
      setMonitorPath([actor.id]);
    } else if (visibleUsers.length) {
      const first = visibleUsers[0];
      applyUserContext(first);
      setMonitorPath([first.id]);
    }
  }, [memberUsers, visibleUsers, currentAdminActorId, selectedAdminUser?.id]);

  const monitorStageTargetIdRef = useRef("");
  /** 선택 회원이 바뀔 때만 드롭다운을 동기화 — stageByUserId·memberUsers 갱신마다 덮어쓰면 선택 단계가 초기화되어 단계 적용이 막힘 */
  useEffect(() => {
    if (!monitorCurrentUser) {
      monitorStageTargetIdRef.current = "";
      setStageSelectionValue("");
      setPendingStageValue("");
      return;
    }
    const nextId = String(monitorCurrentUser.id);
    if (monitorStageTargetIdRef.current !== nextId) {
      monitorStageTargetIdRef.current = nextId;
      setPendingStageValue("");
      setStageSelectionValue(getEffectiveStage(monitorCurrentUser));
    }
  }, [monitorCurrentUser?.id]);

  useEffect(() => {
    const stageConfirmPayload = { from: stageConfirmFromStage, to: stageConfirmTarget };
    console.log("[stage-confirm-state]", {
      stageConfirmOpen,
      stageConfirmPayload,
    });
  }, [stageConfirmOpen, stageConfirmFromStage, stageConfirmTarget]);

  useEffect(() => {
    const id = selectedAdminUser?.id;
    if (id == null || id === "") return;
    const fresh = memberUsers.find((u) => String(u.id) === String(id));
    if (!fresh) return;
    if (fresh !== selectedAdminUser) {
      setSelectedAdminUser(fresh);
    }
  }, [memberUsers, selectedAdminUser, stageByUserId]);

  useEffect(() => {
    setSelectedChildUser((prev) => {
      if (!prev?.id) return prev;
      const fresh = memberUsers.find((u) => String(u.id) === String(prev.id));
      if (!fresh) return null;
      if (
        prev.stageLabel === fresh.stageLabel &&
        prev.stage_label === fresh.stage_label &&
        String(prev.parent) === String(fresh.parent) &&
        prev.childRate === fresh.childRate &&
        prev.nickname === fresh.nickname &&
        Number(prev.children || 0) === Number(fresh.children || 0)
      ) {
        return prev;
      }
      return fresh;
    });
  }, [memberUsers]);

  useEffect(() => {
    if (!selectedChildUser?.id) {
      setSelectedChildRateInput("");
      return;
    }
    const v = userRateOverrides[selectedChildUser.id] ?? selectedChildUser.childRate;
    setSelectedChildRateInput(String(v ?? ""));
  }, [selectedChildUser?.id, userRateOverrides]);

  useEffect(() => {
    setSelectedChildUser((prev) => {
      if (!prev?.id || !monitorCurrentUser?.id) return prev;
      const child = memberUsers.find((u) => String(u.id) === String(prev.id));
      if (!child) return null;
      if (String(getEffectiveParent(child)) !== String(monitorCurrentUser.id)) return null;
      return prev;
    });
  }, [monitorCurrentUser?.id, userParentOverrides, memberUsers]);

  async function handleChangeUserLevel(userId, newLevel, options = {}) {
    const targetId = String(userId || "");
    const nextLevel = String(newLevel || "").trim();
    if (!targetId || !nextLevel) return false;
    if (import.meta.env.DEV) {
      console.log("[handleChangeUserLevel] BEFORE lengths", {
        authUsers: authUsers.length,
        virtualDownlineUsers: virtualDownlineUsers.length,
        memberUsers: memberUsers.length,
        summaryScopeUsers: summaryScopeUsers.length,
      });
    }
    const canon = normalizeStageLabel(nextLevel);
    const prevStageMap = { ...stageByUserId };
    const targetMemberBefore = memberUsers.find((u) => String(u.id) === targetId);
    const prevEffectiveStage = targetMemberBefore ? getEffectiveStage(targetMemberBefore) : ADMIN_STAGE_LABEL.MEMBER;
    const prevHadStageOverride = Object.prototype.hasOwnProperty.call(stageByUserId, targetId);

    const authRowBefore =
      !targetId.startsWith("VD-") ? authUsers.find((u) => String(u.id) === targetId) : null;
    const authStageBackup =
      authRowBefore != null
        ? { stage_label: authRowBefore.stage_label, stageLabel: authRowBefore.stageLabel }
        : null;

    /** 엔진용 스냅샷 — updateUserLevel은 map만 사용·길이 불변(referralTreeEngine) */
    const nextUsers = updateUserLevel(targetId, canon, memberUsers);
    const nextStats = recalculateAdminStats(nextUsers);
    const nextIntegrity = validateTreeIntegrity(nextUsers);
    const nextTree = buildReferralTree(nextUsers);
    const targetUser = nextUsers.find((u) => String(u.id) === targetId);
    if (!targetUser) return false;

    flushSync(() => {
      if (targetId.startsWith("VD-")) {
        setVirtualDownlineUsers((prev) => {
          if (import.meta.env.DEV) console.log("[handleChangeUserLevel] VD before virtualDownlineUsers.length", prev.length);
          const next = prev.map((u) =>
            String(u.id) !== targetId ? u : { ...u, stageLabel: canon, stage_label: canon }
          );
          if (next.length !== prev.length) {
            notify("단계 변경 중단: 가상 회원 수가 바뀌었습니다.");
            return prev;
          }
          if (import.meta.env.DEV) console.log("[handleChangeUserLevel] VD after virtualDownlineUsers.length", next.length);
          return next;
        });
      } else {
        setAuthUsers((prev) => {
          if (import.meta.env.DEV) console.log("[handleChangeUserLevel] REAL before authUsers.length", prev.length);
          const next = prev.map((u) =>
            String(u.id) !== targetId ? u : { ...u, stageLabel: canon, stage_label: canon }
          );
          if (next.length !== prev.length) {
            notify("단계 변경 중단: 회원 수가 바뀌었습니다.");
            return prev;
          }
          if (import.meta.env.DEV) console.log("[handleChangeUserLevel] REAL after authUsers.length", next.length);
          return next;
        });
      }
      setStageByUserId((prev) => ({ ...prev, [targetId]: canon }));
    });
    pendingStageLengthLogRef.current = true;

    setSelectedAdminUser((prev) => {
      if (!prev || String(prev.id) !== targetId) return prev;
      return { ...prev, level: canon, stageLabel: canon, stage_label: canon };
    });

    setPendingStageValue(canon);
    setStageSelectionValue(canon);
    setStageConfirmOpen(false);
    setStageConfirmTarget("");
    setStageConfirmFromStage("");

    const requestedPersist = options.persist !== false;
    const isVirtualTarget = targetId.startsWith("VD-");
    const canPersistRealUser = Boolean(isSuperAdmin);
    const shouldPersist = requestedPersist && !isVirtualTarget && canPersistRealUser;
    if (!shouldPersist) {
      if (requestedPersist && !isVirtualTarget && !canPersistRealUser) {
        notify("실제 회원 단계 저장은 본사 계정만 가능합니다. 현재 변경은 로컬 시뮬레이션으로 반영됩니다.");
      }
      appendAdminAction?.(
        `단계 변경(로컬): ${targetUser.nickname} (${targetId}) · ${prevEffectiveStage} → ${canon}`
      );
      notify(`단계 적용됨: ${targetUser.nickname} -> ${canon}`);
      requestAnimationFrame(() => adminActionLogSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
      return true;
    }

    const parentNode = nextTree.byId.get(targetId);
    const ok = await updateAuthProfile(targetId, {
      stageLabel: canon,
      parentUserRef: String(parentNode?.parentId || getEffectiveParent(targetUser) || ""),
      adminAssigned: isAdminAssignedUser(targetUser),
    });
    if (!ok) {
      setStageByUserId((prev) => {
        const next = { ...prev };
        if (prevHadStageOverride) next[targetId] = prevStageMap[targetId];
        else delete next[targetId];
        return next;
      });
      if (targetId.startsWith("VD-")) {
        const restored = normalizeStageLabel(prevEffectiveStage);
        setVirtualDownlineUsers((prev) =>
          prev.map((u) =>
            String(u.id) !== targetId ? u : { ...u, stageLabel: restored, stage_label: restored }
          )
        );
      } else if (authStageBackup) {
        setAuthUsers((prev) =>
          prev.map((u) =>
            String(u.id) !== targetId
              ? u
              : {
                  ...u,
                  stage_label: authStageBackup.stage_label,
                  stageLabel: authStageBackup.stageLabel,
                }
          )
        );
      }
      setSelectedAdminUser((prev) => {
        if (!prev || String(prev.id) !== targetId) return prev;
        const restoredLevel = normalizeStageLabel(prevEffectiveStage);
        return { ...prev, level: restoredLevel, stageLabel: restoredLevel, stage_label: restoredLevel };
      });
      notify("단계 저장 실패: 변경을 되돌렸습니다. 다시 시도하세요.");
      return false;
    }
    appendAdminAction?.(
      `단계 변경: ${targetUser.nickname} (${targetId}) · ${prevEffectiveStage} → ${canon} · 합계 ${nextStats.levelCountSum}/${nextStats.totalUsers} · 무결성 ${nextIntegrity.ok ? "OK" : "FAIL"}`
    );
    notify(`단계 저장됨: ${targetUser.nickname} -> ${canon}`);
    requestAnimationFrame(() => adminActionLogSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
    return true;
  }

  async function applyMonitorAdminAssignment(nextAssigned) {
    if (!monitorCurrentUser) return;
    if (isSelfTargetMember) {
      notify("본인 계정은 관리자 지정/해제를 변경할 수 없습니다.");
      return;
    }
    const isVirtualUser = String(monitorCurrentUser.id || "").startsWith("VD-");
    const canEdit = isSuperAdmin || isVirtualUser;
    if (!canEdit) {
      notify("실제 회원의 관리자 지정은 슈퍼관리자만 변경할 수 있습니다. (가상 VD 회원은 로컬에서 테스트 가능합니다.)");
      return;
    }
    const id = monitorCurrentUser.id;
    const prevAssigned = isAdminAssignedUser(monitorCurrentUser);
    setUserAdminAssignments((prev) => ({ ...prev, [id]: nextAssigned }));
    if (isVirtualUser) {
      setVirtualDownlineUsers((prev) =>
        prev.map((u) =>
          String(u.id) === String(id) ? { ...u, adminAssigned: nextAssigned, admin_assigned: nextAssigned } : u
        )
      );
      appendAdminAction?.(`관리자 지정 변경(로컬): ${id} -> ${nextAssigned ? "ON" : "OFF"}`);
      notify(`${monitorCurrentUser.nickname} · 관리자 지정 ${nextAssigned ? "ON" : "OFF"} (가상 회원, 로컬 반영)`);
      return;
    }
    const ok = await updateAuthProfile(id, {
      stageLabel: getEffectiveStage(monitorCurrentUser),
      parentUserRef: getEffectiveParent(monitorCurrentUser),
      adminAssigned: nextAssigned,
    });
    if (ok) {
      appendAdminAction?.(`관리자 지정 변경: ${id} -> ${nextAssigned ? "ON" : "OFF"}`);
      notify(`${monitorCurrentUser.nickname} 관리자 지정이 ${nextAssigned ? "활성화" : "해제"}되었습니다.`);
    } else {
      setUserAdminAssignments((prev) => ({ ...prev, [id]: prevAssigned }));
    }
  }

  async function assignDownlineUser() {
    if (!monitorCurrentUser) return;
    if (isSelfTargetMember) {
      notify("본인 계정에서는 하위 유저 지정을 변경할 수 없습니다.");
      return;
    }
    if (!isSuperAdmin) {
      notify("슈퍼관리자 권한이 필요합니다.");
      return;
    }
    const target = memberUsers.find((u) => String(u.id) === String(downlineTargetUserId));
    if (!target) {
      notify("하위로 지정할 회원 ID를 확인하세요.");
      return;
    }
    if (target.id === monitorCurrentUser.id) {
      notify("본인을 하위로 지정할 수 없습니다.");
      return;
    }
    setUserParentOverrides((prev) => ({ ...prev, [target.id]: monitorCurrentUser.id }));
    const ok = await updateAuthProfile(target.id, {
      stageLabel: getEffectiveStage(target),
      parentUserRef: monitorCurrentUser.id,
      adminAssigned: isAdminAssignedUser(target),
    });
    if (ok) {
      appendAdminAction?.(`하위 지정 변경: ${target.id} -> parent ${monitorCurrentUser.id}`);
      notify(`${target.nickname} 회원이 ${monitorCurrentUser.nickname} 하위로 지정되었습니다.`);
    }
    setDownlineTargetUserId("");
  }

  function requestApplyStage() {
    const selectedUser = monitorCurrentUser
      ? { id: monitorCurrentUser.id, nickname: monitorCurrentUser.nickname }
      : null;
    const selectedStage = String(stageSelectionValue || "").trim();
    const fromSelect = selectedStage;
    const nextStage = normalizeStageLabel(fromSelect || getEffectiveStage(monitorCurrentUser));
    const canControlTarget = Boolean(
      monitorCurrentUser &&
        (String(monitorCurrentUser.id || "").startsWith("VD-") ||
          canActorControlTargetLevel(monitorCurrentUser, nextStage))
    );
    console.log("[stage-apply-click]", {
      selectedUser,
      selectedStage,
      nextStage,
      isSelfTargetMember,
      canControlTarget,
      stageConfirmOpen,
    });
    if (!monitorCurrentUser) {
      notify("선택된 회원이 없습니다.");
      return;
    }
    const isVirtualUser = String(monitorCurrentUser.id || "").startsWith("VD-");
    if (isSelfTargetMember) {
      notify("본인 계정의 단계는 변경할 수 없습니다.");
      return;
    }
    if (!nextStage) {
      notify("적용할 단계를 선택하세요.");
      return;
    }
    if (!isVirtualUser && !canActorControlTargetLevel(monitorCurrentUser, nextStage)) {
      notify("상위 레벨 관리자만 자신의 하위 회원 단계를 승급/강등할 수 있습니다.");
      return;
    }
    const currentStage = getEffectiveStage(monitorCurrentUser);
    if (nextStage === currentStage) {
      notify("이미 동일한 단계입니다.");
      return;
    }
    setStageConfirmFromStage(currentStage);
    setStageConfirmTarget(nextStage);
    setStageConfirmOpen(true);
  }

  async function executeApplySelectedStage(nextStageExplicit) {
    if (!monitorCurrentUser) return;
    const isVirtualUser = String(monitorCurrentUser.id || "").startsWith("VD-");
    if (isSelfTargetMember) {
      notify("본인 계정의 단계는 변경할 수 없습니다.");
      return;
    }
    const nextStage = normalizeStageLabel(String(nextStageExplicit ?? stageSelectionValue ?? "").trim() || getEffectiveStage(monitorCurrentUser));
    if (!nextStage) {
      notify("적용할 단계를 선택하세요.");
      return;
    }
    if (!isVirtualUser && !canActorControlTargetLevel(monitorCurrentUser, nextStage)) {
      notify("상위 레벨 관리자만 자신의 하위 회원 단계를 승급/강등할 수 있습니다.");
      return;
    }
    const targetId = String(monitorCurrentUser.id);
    const currentStage = getEffectiveStage(monitorCurrentUser);
    setPendingStageFrom(currentStage);
    await handleChangeUserLevel(targetId, nextStage, { persist: !isVirtualUser });
    setPendingStageValue("");
    setPendingStageFrom("");
  }

  async function confirmApplySelectedStage() {
    const nextStage = String(stageConfirmTarget || "").trim();
    if (!monitorCurrentUser || !nextStage) {
      setStageConfirmOpen(false);
      setStageConfirmFromStage("");
      setStageConfirmTarget("");
      return;
    }
    setStageConfirmOpen(false);
    setStageConfirmFromStage("");
    setStageConfirmTarget("");
    await executeApplySelectedStage(nextStage);
  }

  async function saveSelectedStage() {
    requestApplyStage();
  }

  function appliedRate(user) {
    return userRateOverrides[user.id] ?? user.childRate;
  }

  function saveSelectedChildRate() {
    if (!selectedChildUser) {
      notify("먼저 하부 회원을 선택하세요.");
      return;
    }
    if (!isSuperAdmin) {
      notify("슈퍼관리자 권한이 필요합니다.");
      return;
    }
    const nextRate = Number(selectedChildRateInput || 0);
    if (!Number.isFinite(nextRate) || nextRate < 0) {
      notify("유효한 배분율을 입력하세요.");
      return;
    }
    if (nextRate > received) {
      notify(`하부 배분율은 상위 배분율(${received}%)을 초과할 수 없습니다.`);
      return;
    }
    setUserRateOverrides((prev) => ({ ...prev, [selectedChildUser.id]: nextRate }));
    appendAdminAction?.(`하부 배분율 변경: ${selectedChildUser.id} -> ${nextRate}%`);
    notify(`${selectedChildUser.nickname} 배분율이 ${nextRate}%로 저장되었습니다.`);
  }

  function setInlineChildRate(childId, value) {
    setChildInlineRates((prev) => ({ ...prev, [childId]: value }));
  }

  function saveInlineChildRate(child) {
    if (!isSuperAdmin) {
      notify("슈퍼관리자 권한이 필요합니다.");
      return;
    }
    const rawValue = childInlineRates[child.id];
    const nextRate = Number(rawValue ?? appliedRate(child));
    if (!Number.isFinite(nextRate) || nextRate < 0) {
      notify("유효한 배분율을 입력하세요.");
      return;
    }
    if (nextRate > received) {
      notify(`하부 배분율은 상위 배분율(${received}%)을 초과할 수 없습니다.`);
      return;
    }
    setUserRateOverrides((prev) => ({ ...prev, [child.id]: nextRate }));
    setChildInlineRates((prev) => ({ ...prev, [child.id]: String(nextRate) }));
    appendAdminAction?.(`하부 배분율 즉시 변경: ${child.id} -> ${nextRate}%`);
    notify(`${child.nickname} 배분율이 ${nextRate}%로 저장되었습니다.`);
  }

  function toggleChildSelection(childId) {
    setSelectedChildIds((prev) => (prev.includes(childId) ? prev.filter((id) => id !== childId) : [...prev, childId]));
  }

  function applyBulkChildRate() {
    if (!isSuperAdmin) {
      notify("슈퍼관리자 권한이 필요합니다.");
      return;
    }
    if (!selectedChildIds.length) {
      notify("일괄 적용할 하부를 먼저 선택하세요.");
      return;
    }
    const nextRate = Number(bulkChildRateInput || 0);
    if (!Number.isFinite(nextRate) || nextRate < 0) {
      notify("유효한 배분율을 입력하세요.");
      return;
    }
    if (nextRate > received) {
      notify(`하부 배분율은 상위 배분율(${received}%)을 초과할 수 없습니다.`);
      return;
    }
    setUserRateOverrides((prev) => {
      const next = { ...prev };
      selectedChildIds.forEach((id) => {
        next[id] = nextRate;
      });
      return next;
    });
    appendAdminAction?.(`하부 배분율 일괄 변경: ${selectedChildIds.length}명 -> ${nextRate}%`);
    notify(`${selectedChildIds.length}명의 하부 배분율을 ${nextRate}%로 일괄 저장했습니다.`);
  }

  async function updateAuthRole(userId, nextRole) {
    if (!isSuperAdmin) {
      notify("슈퍼관리자 권한이 필요합니다.");
      return;
    }
    if (!authToken) {
      notify("인증 토큰이 없습니다. 다시 로그인하세요.");
      return;
    }
    try {
      const data = await apiClient.request(`/api/admin/users/${userId}/role`, {
        method: "PATCH",
        auth: true,
        body: JSON.stringify({ role: nextRole }),
      });
      setAuthUsers((prev) =>
        prev.map((user) => (String(user.id) === String(userId) ? { ...user, role: data.user?.role || nextRole } : user))
      );
      if (String(currentAdminActorId) === String(userId)) {
        const appliedRole = data.user?.role || nextRole;
        setCurrentRole(appliedRole);
        if (!String(appliedRole).includes("관리자") && activePage === "admin") {
          setActivePage("trade");
        }
      }
      appendAdminAction?.(`권한 변경: ${userId} -> ${nextRole}`);
      notify(`권한이 ${nextRole}(으)로 변경되었습니다.`);
    } catch (error) {
      notify(error.message || "권한 변경 API 연결에 실패했습니다.");
    }
  }

  async function updateAuthProfile(userId, payload) {
    if (!isSuperAdmin) {
      notify("슈퍼관리자 권한이 필요합니다.");
      return false;
    }
    if (!authToken) {
      // Allow local admin simulation even without API token.
      setAuthUsers((prev) =>
        prev.map((user) => (String(user.id) === String(userId) ? { ...user, ...payload } : user))
      );
      return true;
    }
    try {
      const data = await apiClient.request(`/api/admin/users/${userId}/profile`, {
        method: "PATCH",
        auth: true,
        body: JSON.stringify(payload),
      });
      setAuthUsers((prev) =>
        prev.map((user) => (String(user.id) === String(userId) ? { ...user, ...(data.user || payload) } : user))
      );
      appendAdminAction?.(`회원 프로필 정책 저장: ${userId}`);
      return true;
    } catch (error) {
      notify(error.message || "회원 프로필 저장에 실패했습니다.");
      return false;
    }
  }

  function isRiskyFileName(name) {
    const lowered = (name || "").toLowerCase();
    return lowered.includes(".exe") || lowered.includes(".bat") || lowered.includes("seed") || lowered.includes("private");
  }

  async function loadDisputeEvents(disputeId) {
    if (!disputeId) return;
    try {
      const data = await apiClient.request(`/api/admin/disputes/${disputeId}/events`, {
        auth: true,
      });
      setSelectedDisputeIdForTimeline(disputeId);
      setSelectedDisputeEvents(Array.isArray(data.events) ? data.events : []);
    } catch (error) {
      notify(error.message || "분쟁 이벤트 조회에 실패했습니다.");
    }
  }

  async function loadKycDocuments() {
    const uid = Number(buyerKyc.userId || 0);
    if (!uid) {
      notify("조회할 KYC 사용자 정보가 없습니다.");
      return;
    }
    try {
      const data = await apiClient.request(`/api/admin/kyc/${uid}/documents`, { auth: true });
      setKycDocs(Array.isArray(data.documents) ? data.documents : []);
    } catch (error) {
      notify(error.message || "KYC 문서 조회에 실패했습니다.");
    }
  }

  async function viewKycDocument(docId, mimeType) {
    if (!kycViewReason || kycViewReason.length < 5) {
      notify("열람 사유를 5자 이상 입력해야 합니다.");
      return;
    }
    try {
      const viewed = await apiClient.request(`/api/admin/kyc/documents/${docId}/view`, {
        method: "POST",
        auth: true,
        body: JSON.stringify({ reason: kycViewReason, requestId: Number(selectedKycRequestId || 0) }),
      });
      const doc = viewed.document || {};
      setKycWatermarkText(String(doc.watermarkText || ""));
      if (doc.previewText) setKycDocPreview(doc.previewText);
      else if (doc.contentBase64 && String(mimeType).startsWith("image/")) {
        setKycDocPreview(`data:${mimeType};base64,${doc.contentBase64}`);
      } else {
        setKycDocPreview("미리보기 가능한 텍스트/이미지 형식이 아닙니다.");
      }
      const logs = await apiClient.request(`/api/admin/kyc/documents/${docId}/access-logs`, { auth: true });
      setKycDocLogs(Array.isArray(logs.logs) ? logs.logs : []);
    } catch (error) {
      notify(error.message || "문서 열람에 실패했습니다.");
    }
  }

  async function loadKycViewRequests(docId) {
    try {
      const data = await apiClient.request(`/api/admin/kyc/documents/${docId}/view-requests`, { auth: true });
      setKycViewRequests(Array.isArray(data.requests) ? data.requests : []);
      setSelectedKycDocId(String(docId));
    } catch (error) {
      notify(error.message || "열람 요청 조회에 실패했습니다.");
    }
  }

  async function createKycViewRequest(docId) {
    if (!kycViewReason || kycViewReason.length < 5) {
      notify("열람 사유를 5자 이상 입력하세요.");
      return;
    }
    try {
      const data = await apiClient.request(`/api/admin/kyc/documents/${docId}/view-requests`, {
        method: "POST",
        auth: true,
        body: JSON.stringify({ reason: kycViewReason }),
      });
      setSelectedKycRequestId(String(data.requestId || ""));
      await loadKycViewRequests(docId);
      notify("열람 요청이 생성되었습니다. 관리자 2인 승인 후 열람 가능합니다.");
    } catch (error) {
      notify(error.message || "열람 요청 생성에 실패했습니다.");
    }
  }

  async function approveKycViewRequest(requestId, docId) {
    try {
      await apiClient.request(`/api/admin/kyc/view-requests/${requestId}/approve`, {
        method: "POST",
        auth: true,
        body: JSON.stringify({}),
      });
      await loadKycViewRequests(docId);
      notify("열람 요청 승인 처리되었습니다.");
    } catch (error) {
      notify(error.message || "열람 요청 승인에 실패했습니다.");
    }
  }

  async function rejectKycViewRequest(requestId, docId) {
    if (!kycRejectReason || kycRejectReason.length < 5) {
      notify("반려 사유를 5자 이상 입력하세요.");
      return;
    }
    try {
      await apiClient.request(`/api/admin/kyc/view-requests/${requestId}/reject`, {
        method: "POST",
        auth: true,
        body: JSON.stringify({ rejectReason: kycRejectReason }),
      });
      await loadKycViewRequests(docId);
      notify("열람 요청이 반려 처리되었습니다.");
    } catch (error) {
      notify(error.message || "열람 요청 반려에 실패했습니다.");
    }
  }

  async function verifyKycAccessLogs(docId) {
    try {
      const data = await apiClient.request(`/api/admin/kyc/documents/${docId}/access-logs/verify`, { auth: true });
      const message = data.valid ? `접근로그 무결성 검증 성공: ${data.reason}` : `접근로그 무결성 검증 실패: ${data.reason}`;
      setKycLogVerifyResult(message);
      notify(message);
    } catch (error) {
      notify(error.message || "접근로그 무결성 검증에 실패했습니다.");
    }
  }

  function exportTimelineCsv() {
    const rows = filteredTimelineEvents.map((event) => ({
      id: event.id,
      disputeId: event.dispute_id,
      action: event.action,
      actor: actorNameMap[event.actor_user_id] || event.actor_user_id,
      detail: event.detail || "",
      createdAt: event.created_at,
    }));
    if (!rows.length) {
      notify("내보낼 타임라인 데이터가 없습니다.");
      return;
    }
    const header = ["id", "disputeId", "action", "actor", "detail", "createdAt"];
    const csvBody = [
      header.join(","),
      ...rows.map((row) =>
        header
          .map((key) => `"${String(row[key] ?? "").replace(/"/g, '""')}"`)
          .join(",")
      ),
    ].join("\n");
    const blob = new Blob([csvBody], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dispute-timeline-${selectedDisputeIdForTimeline || "all"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    notify("타임라인 CSV를 내보냈습니다.");
  }

  async function verifyTimelineIntegrity() {
    if (!selectedDisputeIdForTimeline) {
      notify("먼저 타임라인 조회할 분쟁을 선택하세요.");
      return;
    }
    try {
      const data = await apiClient.request(`/api/admin/disputes/${selectedDisputeIdForTimeline}/events/verify`, {
        auth: true,
      });
      const msg = data.valid ? `무결성 검증 성공: ${data.reason}` : `무결성 검증 실패: ${data.reason}`;
      setTimelineVerifyResult(msg);
      notify(msg);
    } catch (error) {
      notify(error.message || "타임라인 무결성 검증에 실패했습니다.");
    }
  }

  async function loadWebhookEvents(options = {}) {
    const acknowledgeUnread = Boolean(options.acknowledgeUnread);
    try {
      setWebhookLoading(true);
      const data = await apiClient.request("/api/admin/webhook-events?limit=15", { auth: true });
      const next = Array.isArray(data.events) ? data.events : [];
      const chainEvents = next.filter((e) => String(e?.event_type || "") === "market_catalog_audit_chain_changed");
      const chainIds = chainEvents.map((e) => Number(e.id)).filter((id) => Number.isFinite(id));
      const maxChainId = chainIds.length ? Math.max(...chainIds) : webhookChainMaxSeenIdRef.current;

      if (acknowledgeUnread || !webhookChainInitialFetchDoneRef.current) {
        webhookChainInitialFetchDoneRef.current = true;
        webhookChainMaxSeenIdRef.current = maxChainId;
        if (acknowledgeUnread) setWebhookChainAlertUnreadCount(0);
      } else {
        const prevMax = webhookChainMaxSeenIdRef.current;
        const newChainCount = chainEvents.filter((e) => Number(e.id) > prevMax).length;
        webhookChainMaxSeenIdRef.current = Math.max(prevMax, maxChainId);
        if (newChainCount > 0) setWebhookChainAlertUnreadCount((c) => c + newChainCount);
      }

      setWebhookEvents(next);
    } catch (error) {
      notify(error.message || "웹훅 전송 이력 조회에 실패했습니다.");
    } finally {
      setWebhookLoading(false);
    }
  }

  function acknowledgeWebhookChainAlerts() {
    const chainIds = (webhookEvents || [])
      .filter((e) => String(e?.event_type || "") === "market_catalog_audit_chain_changed")
      .map((e) => Number(e.id))
      .filter((id) => Number.isFinite(id));
    if (chainIds.length) webhookChainMaxSeenIdRef.current = Math.max(...chainIds);
    webhookChainInitialFetchDoneRef.current = true;
    setWebhookChainAlertUnreadCount(0);
  }

  async function loadApprovalAuditReport() {
    try {
      setAuditLoading(true);
      const query = new URLSearchParams({
        limit: "100",
        ...(auditFromDate ? { from: auditFromDate } : {}),
        ...(auditToDate ? { to: auditToDate } : {}),
      });
      const data = await apiClient.request(`/api/admin/audit/approvals?${query.toString()}`, { auth: true });
      setApprovalAuditSummary(data.summary || {
        totalEvents: 0,
        kycRequestCount: 0,
        kycApprovalCount: 0,
        kycRejectedCount: 0,
        kycViewCount: 0,
        disputeApprovalCount: 0,
      });
      setApprovalAuditEvents(Array.isArray(data.events) ? data.events : []);
    } catch (error) {
      notify(error.message || "권한 감사 리포트 조회에 실패했습니다.");
    } finally {
      setAuditLoading(false);
    }
  }

  async function loadRecentReportHashes(reportType = "") {
    try {
      const qs = new URLSearchParams({
        limit: "8",
        ...(reportType ? { reportType } : {}),
      });
      const data = await apiClient.request(`/api/admin/audit/report-hashes?${qs.toString()}`, { auth: true });
      setRecentReportHashes(Array.isArray(data.hashes) ? data.hashes : []);
    } catch (error) {
      notify(error.message || "리포트 해시 이력 조회에 실패했습니다.");
    }
  }

  async function loadOpsRiskSummary() {
    try {
      setOpsRiskLoading(true);
      const data = await apiClient.request("/api/admin/ops/risk-summary", { auth: true });
      setOpsRiskSummary({
        overallLevel: data.overallLevel || "normal",
        score: Number(data.score || 0),
        risks: Array.isArray(data.risks) ? data.risks : [],
        generatedAt: data.generatedAt || "",
      });
    } catch (error) {
      notify(error.message || "운영 리스크 요약 조회에 실패했습니다.");
    } finally {
      setOpsRiskLoading(false);
    }
  }

  async function loadPlatformAuditLogs() {
    try {
      setPlatformAuditLoading(true);
      const data = await apiClient.request("/api/admin/platform-audit-logs?limit=150", { auth: true });
      setPlatformAuditLogs(Array.isArray(data.logs) ? data.logs : []);
    } catch (error) {
      notify(error.message || "플랫폼 감사 로그 조회에 실패했습니다.");
    } finally {
      setPlatformAuditLoading(false);
    }
  }

  async function loadAdminP2pOrders() {
    try {
      setAdminP2pLoading(true);
      const data = await apiClient.request("/api/admin/p2p/orders?limit=120", { auth: true });
      setAdminP2pOrders(Array.isArray(data.orders) ? data.orders : []);
    } catch (error) {
      notify(error.message || "P2P 주문 목록 조회에 실패했습니다.");
    } finally {
      setAdminP2pLoading(false);
    }
  }

  async function toggleAdminP2pTimeline(orderId) {
    if (adminP2pTimelineId === orderId) {
      setAdminP2pTimelineId("");
      return;
    }
    setAdminP2pTimelineId(orderId);
    if (adminP2pEventsCache[orderId]) return;
    try {
      setAdminP2pEventsLoadingId(orderId);
      const data = await apiClient.request(`/api/p2p/orders/${encodeURIComponent(orderId)}/events`, { auth: true });
      const ev = Array.isArray(data.events) ? data.events : [];
      setAdminP2pEventsCache((prev) => ({ ...prev, [orderId]: ev }));
    } catch (error) {
      notify(error.message || "주문 이벤트 조회에 실패했습니다.");
      setAdminP2pTimelineId("");
    } finally {
      setAdminP2pEventsLoadingId("");
    }
  }

  async function refreshAdminP2pTimeline(orderId) {
    try {
      setAdminP2pEventsLoadingId(orderId);
      const data = await apiClient.request(`/api/p2p/orders/${encodeURIComponent(orderId)}/events`, { auth: true });
      const ev = Array.isArray(data.events) ? data.events : [];
      setAdminP2pEventsCache((prev) => ({ ...prev, [orderId]: ev }));
      notify("타임라인을 새로고침했습니다.");
    } catch (error) {
      notify(error.message || "새로고침에 실패했습니다.");
    } finally {
      setAdminP2pEventsLoadingId("");
    }
  }

  async function adminCancelP2pOrder(orderId) {
    const ok = window.confirm("이 주문을 관리자 취소로 종료할까요? (매칭·송금 단계만 가능)");
    if (!ok) return;
    try {
      setAdminP2pCancelId(orderId);
      await apiClient.request(`/api/admin/p2p/orders/${encodeURIComponent(orderId)}/cancel`, {
        method: "POST",
        auth: true,
        body: JSON.stringify({ reason: "관리자 중재 취소" }),
      });
      notify("주문을 취소 처리했습니다.");
      await loadAdminP2pOrders();
      setAdminP2pEventsCache((prev) => {
        const next = { ...prev };
        delete next[orderId];
        return next;
      });
      setAdminP2pTimelineId((cur) => (cur === orderId ? "" : cur));
    } catch (error) {
      notify(error.message || "취소 처리에 실패했습니다.");
    } finally {
      setAdminP2pCancelId("");
    }
  }

  async function runOpsAction(actionKey) {
    try {
      setOpsActionLoading(actionKey);
      if (actionKey === "expired_otp_unused") {
        const data = await apiClient.request("/api/admin/ops/actions/cleanup-expired-otp", {
          method: "POST",
          auth: true,
          body: JSON.stringify({}),
        });
        notify(`만료 OTP 정리 완료: ${data.cleaned || 0}건`);
      } else if (actionKey === "kyc_pending_over_12h") {
        const data = await apiClient.request("/api/admin/ops/actions/reject-stale-kyc-requests", {
          method: "POST",
          auth: true,
          body: JSON.stringify({ reason: "장기 대기 요청 자동 반려(운영자 실행)" }),
        });
        notify(`장기 대기 KYC 요청 반려 완료: ${data.rejected || 0}건`);
      } else {
        notify("해당 리스크 항목의 자동 조치 기능은 준비 중입니다.");
      }
      await loadOpsRiskSummary();
    } catch (error) {
      notify(error.message || "운영 조치 실행에 실패했습니다.");
    } finally {
      setOpsActionLoading("");
    }
  }

  async function loadOpsSnapshots() {
    try {
      setOpsSnapshotLoading(true);
      const data = await apiClient.request("/api/admin/ops/snapshots?limit=12", { auth: true });
      setOpsSnapshots(Array.isArray(data.snapshots) ? data.snapshots : []);
    } catch (error) {
      notify(error.message || "운영 스냅샷 조회에 실패했습니다.");
    } finally {
      setOpsSnapshotLoading(false);
    }
  }

  async function loadMarketCatalog() {
    try {
      setMarketCatalogLoading(true);
      const data = await apiClient.request("/api/admin/markets/catalog", { auth: true });
      const assets = (Array.isArray(data?.assets) ? data.assets : []).map((asset) => ({
        ...asset,
        metadataText: JSON.stringify(asset?.metadata || {}, null, 2),
      }));
      const markets = (Array.isArray(data?.markets) ? data.markets : []).map((market) => ({
        ...market,
        metadataText: JSON.stringify(market?.metadata || {}, null, 2),
      }));
      setMarketAssets(assets);
      setMarketCatalog(markets);
      setOriginalMarketAssets(assets);
      setOriginalMarketCatalog(markets);
      setMarketCatalogRevision(String(data?.revision || ""));
    } catch (error) {
      notify(error.message || "마켓 카탈로그 조회에 실패했습니다.");
    } finally {
      setMarketCatalogLoading(false);
    }
  }

  async function loadMarketCatalogAudit(options = {}) {
    const { append = false } = options;
    const beforeId = append && marketCatalogLogs.length ? marketCatalogLogs[marketCatalogLogs.length - 1]?.id : 0;
    try {
      if (append) setMarketAuditLoadingMore(true);
      const qs = new URLSearchParams({
        limit: "12",
        ...(marketAuditActorFilter ? { actorUserId: String(marketAuditActorFilter) } : {}),
        ...(marketAuditQuery.trim() ? { q: marketAuditQuery.trim() } : {}),
        ...(marketAuditFromDate ? { fromDate: marketAuditFromDate } : {}),
        ...(marketAuditToDate ? { toDate: marketAuditToDate } : {}),
        ...(beforeId ? { beforeId: String(beforeId) } : {}),
      });
      const data = await apiClient.request(`/api/admin/markets/catalog/audit?${qs.toString()}`, { auth: true });
      const logs = Array.isArray(data?.logs) ? data.logs : [];
      setMarketCatalogLogs((prev) => (append ? [...prev, ...logs] : logs));
      if (!append) setExpandedMarketAuditIds({});
      setMarketAuditHasMore(Boolean(data?.hasMore));
      setMarketAuditScope(String(data?.scope || "all"));
    } catch (error) {
      notify(error.message || "카탈로그 변경 이력 조회에 실패했습니다.");
    } finally {
      if (append) setMarketAuditLoadingMore(false);
    }
  }

  function exportMarketCatalogAuditCsv() {
    if (!marketCatalogLogs.length) {
      notify("내보낼 카탈로그 이력이 없습니다.");
      return;
    }
    const header = [
      "id", "createdAt", "actorUserId", "actorName", "assetsCount", "marketsCount",
      "assetAdded", "assetRemoved", "assetUpdated", "marketAdded", "marketRemoved", "marketUpdated",
    ];
    const rows = marketCatalogLogs.map((log) => ({
      id: log.id || "",
      createdAt: log.createdAt || "",
      actorUserId: log.actorUserId || "",
      actorName: log.actorName || "",
      assetsCount: log.assetsCount || 0,
      marketsCount: log.marketsCount || 0,
      assetAdded: log.summary?.assetDiff?.added?.join("|") || "",
      assetRemoved: log.summary?.assetDiff?.removed?.join("|") || "",
      assetUpdated: log.summary?.assetDiff?.updated?.join("|") || "",
      marketAdded: log.summary?.marketDiff?.added?.join("|") || "",
      marketRemoved: log.summary?.marketDiff?.removed?.join("|") || "",
      marketUpdated: log.summary?.marketDiff?.updated?.join("|") || "",
    }));
    const csvBody = [
      header.join(","),
      ...rows.map((row) => header.map((key) => `"${String(row[key] ?? "").replace(/"/g, '""')}"`).join(",")),
    ].join("\n");
    const blob = new Blob([csvBody], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `market-catalog-audit-${marketAuditFromDate || "all"}-to-${marketAuditToDate || "all"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    notify("마켓 카탈로그 이력 CSV를 내보냈습니다.");
  }

  function toDateInputValue(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, "0");
    const d = String(dateObj.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function applyMarketAuditQuickRange(days) {
    const now = new Date();
    const start = new Date(now);
    start.setDate(now.getDate() - Math.max(days - 1, 0));
    setMarketAuditFromDate(toDateInputValue(start));
    setMarketAuditToDate(toDateInputValue(now));
  }

  function resetMarketAuditFilters() {
    setMarketAuditActorFilter("");
    setMarketAuditQuery("");
    setMarketAuditFromDate("");
    setMarketAuditToDate("");
  }

  function toggleMarketAuditExpanded(logId) {
    setExpandedMarketAuditIds((prev) => ({
      ...prev,
      [logId]: !prev[logId],
    }));
  }

  async function verifyMarketCatalogAuditIntegrity() {
    try {
      setMarketAuditIntegrityLoading(true);
      const qs = new URLSearchParams({
        ...(marketAuditActorFilter ? { actorUserId: String(marketAuditActorFilter) } : {}),
        ...(marketAuditQuery.trim() ? { q: marketAuditQuery.trim() } : {}),
        ...(marketAuditFromDate ? { fromDate: marketAuditFromDate } : {}),
        ...(marketAuditToDate ? { toDate: marketAuditToDate } : {}),
      });
      const data = await apiClient.request(`/api/admin/markets/catalog/audit/verify?${qs.toString()}`, { auth: true });
      setMarketAuditIntegrity({
        checkedAt: new Date().toISOString(),
        total: Number(data?.total || 0),
        rootHash: String(data?.rootHash || ""),
        scope: String(data?.scope || "all"),
      });
      if (/^[a-f0-9]{64}$/.test(String(data?.rootHash || ""))) {
        await apiClient.request("/api/admin/audit/report-hashes", {
          method: "POST",
          auth: true,
          body: JSON.stringify({
            reportType: "market_catalog_audit_chain",
            fromDate: marketAuditFromDate || "",
            toDate: marketAuditToDate || "",
            rowCount: Number(data?.total || 0),
            sha256Hash: String(data.rootHash),
          }),
        });
      }
      loadRecentReportHashes("market_catalog_audit_chain");
      notify(`감사 무결성 검증 완료 · rows ${Number(data?.total || 0)} · hash ${String(data?.rootHash || "").slice(0, 12)}...`);
    } catch (error) {
      notify(error.message || "감사 무결성 검증에 실패했습니다.");
    } finally {
      setMarketAuditIntegrityLoading(false);
    }
  }

  async function saveMarketCatalog() {
    const assets = Array.isArray(marketAssets) ? marketAssets : [];
    const markets = Array.isArray(marketCatalog) ? marketCatalog : [];
    if (!Array.isArray(assets) || !Array.isArray(markets)) {
      notify("assets와 markets는 배열(Array) 형식이어야 합니다.");
      return;
    }
    const seenAssetCodes = new Set();
    const sanitizedAssets = [];
    for (const asset of assets) {
      const code = String(asset?.assetCode || "").trim().toUpperCase();
      const name = String(asset?.displayName || "").trim();
      if (!code || !name) {
        notify("assets의 assetCode/displayName은 필수입니다.");
        return;
      }
      if (seenAssetCodes.has(code)) {
        notify(`중복 assetCode: ${code}`);
        return;
      }
      let metadata = {};
      try {
        metadata = asset?.metadataText ? JSON.parse(String(asset.metadataText || "{}")) : (asset?.metadata || {});
      } catch {
        notify(`asset metadata JSON 오류: ${code}`);
        return;
      }
      sanitizedAssets.push({
        ...asset,
        assetCode: code,
        displayName: name,
        metadata,
      });
      seenAssetCodes.add(code);
    }
    const seenMarketKeys = new Set();
    const sanitizedMarkets = [];
    for (const market of markets) {
      const key = String(market?.marketKey || "").trim();
      const offered = String(market?.offeredAssetCode || "").trim().toUpperCase();
      const requested = String(market?.requestedAssetCode || "").trim().toUpperCase();
      if (!key || !offered || !requested) {
        notify("markets의 marketKey/offeredAssetCode/requestedAssetCode는 필수입니다.");
        return;
      }
      if (seenMarketKeys.has(key)) {
        notify(`중복 marketKey: ${key}`);
        return;
      }
      let metadata = {};
      try {
        metadata = market?.metadataText ? JSON.parse(String(market.metadataText || "{}")) : (market?.metadata || {});
      } catch {
        notify(`market metadata JSON 오류: ${key}`);
        return;
      }
      sanitizedMarkets.push({
        ...market,
        marketKey: key,
        offeredAssetCode: offered,
        requestedAssetCode: requested,
        settlementAssetCode: String(market?.settlementAssetCode || "").trim().toUpperCase(),
        metadata,
      });
      seenMarketKeys.add(key);
    }
    try {
      setMarketCatalogSaving(true);
      await apiClient.request("/api/admin/markets/catalog", {
        method: "PUT",
        auth: true,
        body: JSON.stringify({
          assets: sanitizedAssets,
          markets: sanitizedMarkets,
          expectedRevision: marketCatalogRevision || "",
        }),
      });
      notify("마켓 카탈로그가 저장되었습니다.");
      await loadMarketCatalog();
      await loadMarketCatalogAudit();
    } catch (error) {
      if (String(error?.message || "").includes("catalog_revision_conflict")) {
        notify("다른 관리자가 먼저 저장했습니다. 최신 이력을 다시 불러온 뒤 재시도하세요.");
        await loadMarketCatalog();
        await loadMarketCatalogAudit();
        return;
      }
      notify(error.message || "마켓 카탈로그 저장에 실패했습니다.");
    } finally {
      setMarketCatalogSaving(false);
    }
  }

  function updateAssetRow(index, key, value) {
    setMarketAssets((prev) => prev.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  }

  function updateMarketRow(index, key, value) {
    setMarketCatalog((prev) => prev.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  }

  function addAssetRow() {
    setMarketAssets((prev) => ([
      ...prev,
      {
        assetCode: "",
        displayName: "",
        assetType: "coin",
        network: "",
        settlementEnabled: false,
        isActive: true,
        metadata: {},
        metadataText: "{}",
      },
    ]));
  }

  function addMarketRow() {
    setMarketCatalog((prev) => ([
      ...prev,
      {
        marketKey: "",
        marketType: "p2p",
        offeredAssetCode: "",
        requestedAssetCode: "",
        settlementAssetCode: "",
        escrowAdapter: "coin_escrow",
        status: "planned",
        metadata: {},
        metadataText: "{}",
      },
    ]));
  }

  function removeAssetRow(index) {
    setMarketAssets((prev) => prev.filter((_, i) => i !== index));
  }

  function removeMarketRow(index) {
    setMarketCatalog((prev) => prev.filter((_, i) => i !== index));
  }

  const filteredMarketAssets = useMemo(
    () => marketAssets
      .map((asset, index) => ({ asset, index }))
      .filter(({ asset }) => marketAssetTypeFilter === "all" || String(asset.assetType || "") === marketAssetTypeFilter),
    [marketAssets, marketAssetTypeFilter]
  );
  const filteredMarketCatalog = useMemo(
    () => marketCatalog
      .map((market, index) => ({ market, index }))
      .filter(({ market }) => marketStatusFilter === "all" || String(market.status || "") === marketStatusFilter),
    [marketCatalog, marketStatusFilter]
  );
  const recentMarketAuditChainHashes = useMemo(
    () => (recentReportHashes || []).filter((row) => String(row?.report_type || "") === "market_catalog_audit_chain"),
    [recentReportHashes]
  );
  const marketAuditChainDrift = useMemo(() => {
    const latest = recentMarketAuditChainHashes[0];
    const previous = recentMarketAuditChainHashes[1];
    if (!latest || !previous) return { ready: false, changed: false };
    const latestHash = String(latest?.sha256_hash || "");
    const previousHash = String(previous?.sha256_hash || "");
    return {
      ready: true,
      changed: Boolean(latestHash && previousHash && latestHash !== previousHash),
      latestAt: String(latest?.created_at || ""),
      previousAt: String(previous?.created_at || ""),
      latestHash,
      previousHash,
    };
  }, [recentMarketAuditChainHashes]);
  const marketAuditChainStatus = marketAuditChainDrift.ready
    ? (marketAuditChainDrift.changed ? "changed" : "stable")
    : "pending";

  const marketCatalogDiff = useMemo(() => {
    const assetKey = (row) => String(row?.assetCode || "").trim().toUpperCase();
    const marketKey = (row) => String(row?.marketKey || "").trim();
    const assetSnapshot = (row) => JSON.stringify({
      assetCode: assetKey(row),
      displayName: String(row?.displayName || "").trim(),
      assetType: String(row?.assetType || "").trim(),
      network: String(row?.network || "").trim(),
      settlementEnabled: Boolean(row?.settlementEnabled),
      isActive: row?.isActive !== false,
      metadataText: String(row?.metadataText || "").trim(),
    });
    const marketSnapshot = (row) => JSON.stringify({
      marketKey: marketKey(row),
      marketType: String(row?.marketType || "").trim(),
      offeredAssetCode: String(row?.offeredAssetCode || "").trim().toUpperCase(),
      requestedAssetCode: String(row?.requestedAssetCode || "").trim().toUpperCase(),
      settlementAssetCode: String(row?.settlementAssetCode || "").trim().toUpperCase(),
      escrowAdapter: String(row?.escrowAdapter || "").trim(),
      status: String(row?.status || "").trim(),
      metadataText: String(row?.metadataText || "").trim(),
    });

    const origAssetMap = new Map(originalMarketAssets.map((row) => [assetKey(row), assetSnapshot(row)]));
    const currAssetMap = new Map(marketAssets.map((row) => [assetKey(row), assetSnapshot(row)]));
    const addedAssets = [...currAssetMap.keys()].filter((key) => key && !origAssetMap.has(key)).length;
    const removedAssets = [...origAssetMap.keys()].filter((key) => key && !currAssetMap.has(key)).length;
    const updatedAssets = [...currAssetMap.keys()].filter((key) => key && origAssetMap.has(key) && origAssetMap.get(key) !== currAssetMap.get(key)).length;

    const origMarketMap = new Map(originalMarketCatalog.map((row) => [marketKey(row), marketSnapshot(row)]));
    const currMarketMap = new Map(marketCatalog.map((row) => [marketKey(row), marketSnapshot(row)]));
    const addedMarkets = [...currMarketMap.keys()].filter((key) => key && !origMarketMap.has(key)).length;
    const removedMarkets = [...origMarketMap.keys()].filter((key) => key && !currMarketMap.has(key)).length;
    const updatedMarkets = [...currMarketMap.keys()].filter((key) => key && origMarketMap.has(key) && origMarketMap.get(key) !== currMarketMap.get(key)).length;

    const hasChanges = Boolean(addedAssets || removedAssets || updatedAssets || addedMarkets || removedMarkets || updatedMarkets);
    return { hasChanges, addedAssets, removedAssets, updatedAssets, addedMarkets, removedMarkets, updatedMarkets };
  }, [marketAssets, marketCatalog, originalMarketAssets, originalMarketCatalog]);

  function openMarketSaveConfirm() {
    if (!marketCatalogDiff.hasChanges) {
      notify("변경된 내용이 없습니다.");
      return;
    }
    setMarketSaveConfirmOpen(true);
  }

  function resetMarketCatalogDraft() {
    setMarketAssets(originalMarketAssets);
    setMarketCatalog(originalMarketCatalog);
    setMarketSaveConfirmOpen(false);
    notify("카탈로그 편집 내용을 마지막 조회 기준으로 되돌렸습니다.");
  }

  async function createOpsSnapshot() {
    if (!opsSnapshotReason || opsSnapshotReason.length < 5) {
      notify("스냅샷 사유를 5자 이상 입력하세요.");
      return;
    }
    try {
      setOpsSnapshotLoading(true);
      await apiClient.request("/api/admin/ops/snapshots", {
        method: "POST",
        auth: true,
        body: JSON.stringify({
          label: opsSnapshotLabel,
          reason: opsSnapshotReason,
        }),
      });
      notify("운영 스냅샷이 생성되었습니다.");
      await loadOpsSnapshots();
      setOpsSnapshotLabel("");
      setOpsSnapshotReason("");
    } catch (error) {
      notify(error.message || "운영 스냅샷 생성에 실패했습니다.");
    } finally {
      setOpsSnapshotLoading(false);
    }
  }

  async function executeRollback() {
    if (!rollbackSnapshotId) {
      notify("롤백할 스냅샷을 선택하세요.");
      return;
    }
    if (!rollbackReason || rollbackReason.length < 5) {
      notify("롤백 사유를 5자 이상 입력하세요.");
      return;
    }
    if (rollbackConfirmText !== "ROLLBACK") {
      notify("확인문구 ROLLBACK을 정확히 입력해야 실행됩니다.");
      return;
    }
    try {
      setOpsSnapshotLoading(true);
      await apiClient.request("/api/admin/ops/rollback", {
        method: "POST",
        auth: true,
        body: JSON.stringify({
          snapshotId: Number(rollbackSnapshotId),
          reason: rollbackReason,
          confirmText: rollbackConfirmText,
        }),
      });
      notify("롤백 실행이 완료되었습니다.");
      setRollbackConfirmText("");
      setRollbackReason("");
      await loadOpsSnapshots();
      await loadOpsRiskSummary();
      await loadApprovalAuditReport();
    } catch (error) {
      notify(error.message || "롤백 실행에 실패했습니다.");
    } finally {
      setOpsSnapshotLoading(false);
    }
  }

  async function loadPlatformSettings() {
    try {
      setPlatformOpsLoading(true);
      const data = await apiClient.request("/api/admin/platform-settings", { auth: true });
      const m = Number(data.p2p_match_sla_minutes ?? 30);
      setP2pMatchSlaInput(String(Number.isFinite(m) ? m : 30));
      setP2pMatchSlaUpdatedAt(String(data.p2p_match_sla_updated_at || ""));
      setP2pMatchSlaUpdatedBy(data.p2p_match_sla_updated_by ?? null);
      const ef = Number(data.env_fallback_p2p_match_sla_minutes ?? 30);
      setEnvFallbackSla(Number.isFinite(ef) ? ef : 30);
      const pfp = String(data.price_feed_provider ?? "").trim().toLowerCase();
      setPriceFeedProviderSelect(pfp);
      setPriceFeedBuiltinIds(Array.isArray(data.price_feed_builtin_providers) ? data.price_feed_builtin_providers : []);
      setPriceFeedEffective(String(data.price_feed_provider_effective || ""));
      setPriceFeedEnvOnly(String(data.env_only_price_feed_provider || ""));
      setPriceFeedUpdatedAt(String(data.price_feed_updated_at || ""));
      setPriceFeedUpdatedBy(data.price_feed_updated_by ?? null);
    } catch (error) {
      notify(error.message || "플랫폼 설정을 불러오지 못했습니다.");
    } finally {
      setPlatformOpsLoading(false);
    }
  }

  async function savePlatformSettings() {
    const n = Number(p2pMatchSlaInput);
    if (!Number.isFinite(n) || n < 5 || n > 180) {
      notify("P2P 송금 마감은 5~180분 사이로 입력하세요.");
      return;
    }
    try {
      setPlatformOpsSaving(true);
      await apiClient.request("/api/admin/platform-settings", {
        method: "PATCH",
        auth: true,
        body: JSON.stringify({
          p2p_match_sla_minutes: n,
          price_feed_provider: priceFeedProviderSelect === "" ? "" : priceFeedProviderSelect,
        }),
      });
      notify("플랫폼 설정을 저장했습니다.");
      await loadPlatformSettings();
    } catch (error) {
      notify(error.message || "저장에 실패했습니다.");
    } finally {
      setPlatformOpsSaving(false);
    }
  }

  async function loadEmergencyState() {
    try {
      const data = await apiClient.request("/api/admin/ops/emergency-mode", { auth: true });
      const state = data.state || {};
      setEmergencyState({
        emergencyMode: Boolean(state.emergencyMode),
        emergencyReason: String(state.emergencyReason || ""),
        emergencyEta: String(state.emergencyEta || ""),
        updatedByUserId: Number(state.updatedByUserId || 0),
        updatedAt: String(state.updatedAt || ""),
      });
      setEmergencyReasonInput(String(state.emergencyReason || ""));
      setEmergencyEtaInput(String(state.emergencyEta || ""));
    } catch (error) {
      notify(error.message || "비상모드 상태 조회에 실패했습니다.");
    }
  }

  async function updateEmergencyMode(enabled) {
    if (enabled && (!emergencyReasonInput || emergencyReasonInput.length < 5)) {
      notify("비상모드 사유를 5자 이상 입력하세요.");
      return;
    }
    try {
      setEmergencyLoading(true);
      const data = await apiClient.request("/api/admin/ops/emergency-mode", {
        method: "PUT",
        auth: true,
        body: JSON.stringify({
          enabled,
          reason: enabled ? emergencyReasonInput : "",
          eta: enabled ? emergencyEtaInput : "",
        }),
      });
      setEmergencyState(data.state || emergencyState);
      notify(enabled ? "비상모드가 활성화되었습니다." : "비상모드가 해제되었습니다.");
      await loadOpsRiskSummary();
    } catch (error) {
      notify(error.message || "비상모드 업데이트에 실패했습니다.");
    } finally {
      setEmergencyLoading(false);
    }
  }

  async function verifyReportHash() {
    const normalized = String(verifyHashInput || "").trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(normalized)) {
      notify("검증할 SHA-256 해시 64자(hex)를 입력하세요.");
      return;
    }
    try {
      const data = await apiClient.request("/api/admin/audit/report-hashes/verify", {
        method: "POST",
        auth: true,
        body: JSON.stringify({
          sha256Hash: normalized,
          reportType: verifyHashType,
        }),
      });
      const msg = data.matched
        ? `일치: ${data.reason} (record #${data.record?.id || "-"})`
        : `불일치: ${data.reason}`;
      setVerifyHashResult(msg);
      notify(msg);
    } catch (error) {
      notify(error.message || "해시 검증에 실패했습니다.");
    }
  }

  async function exportApprovalAuditCsv() {
    if (!approvalAuditEvents.length) {
      notify("내보낼 감사 리포트 데이터가 없습니다.");
      return;
    }
    const rows = approvalAuditEvents.map((event) => ({
      kind: event.kind || "",
      action: event.action || "",
      actorUserId: event.actorUserId || "",
      actorName: event.actorName || "",
      target: event.target || "",
      detail: event.detail || "",
      createdAt: event.createdAt || "",
    }));
    const header = ["kind", "action", "actorUserId", "actorName", "target", "detail", "createdAt"];
    const csvBody = [
      header.join(","),
      ...rows.map((row) =>
        header
          .map((key) => `"${String(row[key] ?? "").replace(/"/g, '""')}"`)
          .join(",")
      ),
    ].join("\n");
    const encoded = new TextEncoder().encode(csvBody);
    const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
    const csvIntegrityHash = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    try {
      await apiClient.request("/api/admin/audit/report-hashes", {
        method: "POST",
        auth: true,
        body: JSON.stringify({
          reportType: "approval_audit_csv",
          fromDate: auditFromDate || "",
          toDate: auditToDate || "",
          rowCount: approvalAuditEvents.length,
          sha256Hash: csvIntegrityHash,
        }),
      });
      loadRecentReportHashes();
    } catch (error) {
      notify(error.message || "CSV 리포트 해시 서버 기록에 실패했습니다.");
    }
    const blob = new Blob([csvBody], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const fromLabel = auditFromDate || "all";
    const toLabel = auditToDate || "all";
    a.href = url;
    a.download = `approval-audit-${fromLabel}-to-${toLabel}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    notify(`권한 감사 리포트 CSV를 내보냈습니다. SHA-256: ${csvIntegrityHash.slice(0, 12)}...`);
  }

  async function exportApprovalAuditPdf() {
    if (!approvalAuditEvents.length) {
      notify("출력할 감사 리포트 데이터가 없습니다.");
      return;
    }
    const fromLabel = auditFromDate || "전체기간";
    const toLabel = auditToDate || "전체기간";
    const generatedAt = new Date().toISOString();
    const integrityPayload = JSON.stringify({
      from: fromLabel,
      to: toLabel,
      generatedAt,
      summary: approvalAuditSummary,
      events: approvalAuditEvents,
    });
    const encoded = new TextEncoder().encode(integrityPayload);
    const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
    const integrityHash = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    try {
      await apiClient.request("/api/admin/audit/report-hashes", {
        method: "POST",
        auth: true,
        body: JSON.stringify({
          reportType: "approval_audit_pdf",
          fromDate: auditFromDate || "",
          toDate: auditToDate || "",
          rowCount: approvalAuditEvents.length,
          sha256Hash: integrityHash,
        }),
      });
      loadRecentReportHashes();
    } catch (error) {
      notify(error.message || "리포트 해시 서버 기록에 실패했습니다.");
    }
    const rowsHtml = approvalAuditEvents
      .map(
        (event) => `
          <tr>
            <td>${String(event.createdAt || "")}</td>
            <td>${String(event.action || "")}</td>
            <td>${String(event.actorName || "")} (${String(event.actorUserId || "")})</td>
            <td>${String(event.target || "")}</td>
            <td>${String(event.detail || "")}</td>
          </tr>
        `
      )
      .join("");
    const printHtml = `
      <!doctype html>
      <html lang="ko">
        <head>
          <meta charset="utf-8" />
          <title>권한 감사 리포트</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
            h1 { margin: 0 0 8px; font-size: 20px; }
            .meta { margin-bottom: 16px; font-size: 12px; color: #333; }
            .kpi { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 16px; }
            .box { border: 1px solid #999; border-radius: 6px; padding: 8px; font-size: 12px; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; }
            th, td { border: 1px solid #999; padding: 6px; text-align: left; vertical-align: top; }
            th { background: #f2f2f2; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          <h1>권한 감사 리포트</h1>
          <div class="meta">조회기간: ${fromLabel} ~ ${toLabel} / 생성시각: ${generatedAt}</div>
          <div class="kpi">
            <div class="box">전체 이벤트: <b>${approvalAuditSummary.totalEvents || 0}</b></div>
            <div class="box">KYC 요청: <b>${approvalAuditSummary.kycRequestCount || 0}</b></div>
            <div class="box">KYC 승인: <b>${approvalAuditSummary.kycApprovalCount || 0}</b></div>
            <div class="box">KYC 반려: <b>${approvalAuditSummary.kycRejectedCount || 0}</b></div>
            <div class="box">KYC 열람: <b>${approvalAuditSummary.kycViewCount || 0}</b></div>
            <div class="box">분쟁 결재: <b>${approvalAuditSummary.disputeApprovalCount || 0}</b></div>
          </div>
          <table>
            <thead>
              <tr>
                <th>시간</th>
                <th>액션</th>
                <th>담당자</th>
                <th>대상</th>
                <th>상세</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
          <div style="margin-top:12px; font-size:11px; color:#333; word-break:break-all;">
            Integrity SHA-256: ${integrityHash}
          </div>
        </body>
      </html>
    `;
    const printWindow = window.open("", "_blank", "noopener,noreferrer,width=1200,height=900");
    if (!printWindow) {
      notify("팝업이 차단되어 PDF 출력창을 열 수 없습니다.");
      return;
    }
    printWindow.document.open();
    printWindow.document.write(printHtml);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    notify("인쇄창이 열렸습니다. PDF로 저장하세요.");
  }

  useEffect(() => {
    if (!authToken) return;
    loadWebhookEvents();
  }, [authToken]);

  useEffect(() => {
    if (!authToken) return;
    loadApprovalAuditReport();
    loadRecentReportHashes();
    loadOpsRiskSummary();
    loadOpsSnapshots();
    loadMarketCatalog();
    loadMarketCatalogAudit();
    loadEmergencyState();
    loadPlatformSettings();
  }, [authToken]);

  useEffect(() => {
    if (!webhookAutoRefresh) return;
    const timerId = setInterval(() => {
      loadWebhookEvents();
    }, 15000);
    return () => clearInterval(timerId);
  }, [webhookAutoRefresh]);

  useEffect(() => {
    const prevUnread = webhookPrevUnreadCountRef.current;
    const hasNewUnread = webhookChainAlertUnreadCount > prevUnread;
    webhookPrevUnreadCountRef.current = webhookChainAlertUnreadCount;
    if (!hasNewUnread) return;
    if (webhookAutoFocusOpsOnAlert && webhookChainAlertOnly) {
      setAdminViewTab("ops");
    }
    if (webhookAlertSoundEnabled) {
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(880, ctx.currentTime);
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        oscillator.connect(gain);
        gain.connect(ctx.destination);
        oscillator.start();
        oscillator.stop(ctx.currentTime + 0.12);
      } catch {
        // ignore audio notification errors
      }
    }
  }, [webhookChainAlertUnreadCount, webhookAutoFocusOpsOnAlert, webhookChainAlertOnly, webhookAlertSoundEnabled]);

  useEffect(() => {
    loadMarketCatalogAudit();
  }, [marketAuditActorFilter, marketAuditQuery, marketAuditFromDate, marketAuditToDate]);

  useEffect(() => {
    if (adminViewTab !== "audit") return;
    loadPlatformAuditLogs();
    loadAdminP2pOrders();
  }, [adminViewTab]);

  useEffect(() => {
    if (!marketAuditChainDrift.ready || !marketAuditChainDrift.changed) return;
    const alertKey = `${marketAuditChainDrift.latestAt}:${marketAuditChainDrift.latestHash}`;
    if (!alertKey || alertKey === lastMarketAuditAlertHash) return;
    setLastMarketAuditAlertHash(alertKey);
    setMarketAuditChangeAlerts((prev) => ([
      {
        id: `audit-alert-${Date.now()}`,
        at: marketAuditChainDrift.latestAt || new Date().toISOString(),
        message: `체인 변경 감지 · ${marketAuditChainDrift.previousAt} -> ${marketAuditChainDrift.latestAt}`,
        latestHash: marketAuditChainDrift.latestHash,
        previousHash: marketAuditChainDrift.previousHash,
      },
      ...prev,
    ]).slice(0, 8));
  }, [marketAuditChainDrift, lastMarketAuditAlertHash]);

  const filteredWebhookEvents = (webhookEvents || []).filter((event) => {
    const statusMatched = webhookStatusFilter === "all" ? true : event.status === webhookStatusFilter;
    const chainMatched = webhookChainAlertOnly ? String(event?.event_type || "") === "market_catalog_audit_chain_changed" : true;
    return statusMatched && chainMatched;
  });
  const latestWebhookChainAlertAt = useMemo(() => {
    const row = (webhookEvents || []).find((event) => String(event?.event_type || "") === "market_catalog_audit_chain_changed");
    return row?.occurred_at || "";
  }, [webhookEvents]);
  const isAdminTab = (tab) => adminViewTab === tab;
  const adminCategories = [
    { key: "member", title: "회원관리", desc: "유저 선택, 하부 목록, 선택 유저 상세 확인", color: "bg-indigo-600" },
    { key: "memberOps", title: "회원운영", desc: "권한/배분/공지/관리 로그/운영 액션", color: "bg-sky-600" },
    { key: "security", title: "보안", desc: "위험 모니터링, 신고/블랙 정책", color: "bg-red-600" },
    { key: "kyc", title: "KYC", desc: "회사 승인, 문서 열람, 2인 승인 워크플로우", color: "bg-violet-600" },
    { key: "dispute", title: "분쟁/정산", desc: "다중승인, OTP 최종승인, 보관계좌 정책", color: "bg-amber-500" },
    { key: "ops", title: "감사/복구", desc: "감사리포트, 해시검증, 스냅샷/롤백/비상모드", color: "bg-emerald-600" },
    { key: "audit", title: "플랫폼 감사로그", desc: "로그인·가입 등 서버 공통 감사 기록", color: "bg-slate-600" },
  ];
  const adminTabTitleMap = {
    dashboard: "대시보드",
    member: "회원관리",
    memberOps: "회원운영",
    security: "보안",
    kyc: "KYC",
    dispute: "분쟁/정산",
    ops: "감사/복구",
    audit: "플랫폼 감사로그",
  };
  const currentAdminStage = adminTabTitleMap[adminViewTab] || "대시보드";
  const currentAdminFocus =
    adminViewTab === "member"
      ? `${monitorCurrentUser?.nickname || "-"} (${monitorCurrentUser?.id || "-"})`
      : adminViewTab === "memberOps"
        ? `${selectedOpsUser?.nickname || "-"} (${selectedOpsUser?.id || "-"})`
        : adminViewTab === "security"
          ? `${selectedSecurityUser?.nickname || "-"} (${selectedSecurityUser?.id || "-"})`
          : adminViewTab === "kyc"
            ? `KYC 상태: ${buyerKyc?.companyApprovalStatus || "-"}`
            : adminViewTab === "dispute"
              ? `분쟁 ${Array.isArray(disputeCases) ? disputeCases.length : 0}건`
              : adminViewTab === "ops"
                ? `리스크 점수: ${opsRiskSummary?.score ?? 0}`
                : adminViewTab === "audit"
                  ? `로그 ${platformAuditLogs.length}건 표시`
                  : "카테고리를 선택하세요";
  const quickActionLabel =
    adminViewTab === "member"
      ? "하부 열기"
      : adminViewTab === "memberOps"
        ? "권한 변경"
        : adminViewTab === "security"
          ? "거래정지"
          : adminViewTab === "kyc"
            ? "KYC 승인"
            : adminViewTab === "dispute"
              ? "분쟁 새로고침"
              : adminViewTab === "ops"
                ? "리스크 점검"
                : adminViewTab === "audit"
                  ? "로그 새로고침"
                  : "카테고리 열기";
  const quickActionDisabled =
    (adminViewTab === "member" && !monitorCurrentUser) ||
    (adminViewTab === "memberOps" && !selectedOpsUser) ||
    (adminViewTab === "security" && !selectedSecurityUser);

  function runAdminQuickAction() {
    if (adminViewTab === "member") {
      if (!monitorCurrentUser) return;
      notify(`${monitorCurrentUser.nickname} 하부 ${selectedChildren.length}명 열기`);
      return;
    }
    if (adminViewTab === "memberOps") {
      if (!selectedOpsUser) return;
      notify(`${selectedOpsUser.nickname} 권한 변경 화면`);
      return;
    }
    if (adminViewTab === "security") {
      if (!selectedSecurityUser) return;
      notify(`${selectedSecurityUser.nickname} 거래 일시정지`);
      return;
    }
    if (adminViewTab === "kyc") {
      notify("KYC 승인 워크플로우로 이동");
      return;
    }
    if (adminViewTab === "dispute") {
      apiClient.request("/api/admin/disputes", { auth: true })
        .then((data) => {
          setDisputeCases(Array.isArray(data.disputes) ? data.disputes : []);
          notify("분쟁 목록을 새로고침했습니다.");
        })
        .catch((error) => notify(error.message || "분쟁 목록 새로고침에 실패했습니다."));
      return;
    }
    if (adminViewTab === "ops") {
      loadOpsRiskSummary();
      notify("운영 리스크를 점검합니다.");
      return;
    }
    if (adminViewTab === "audit") {
      Promise.all([loadPlatformAuditLogs(), loadAdminP2pOrders()]).then(() => notify("감사 로그·P2P 주문을 새로고침했습니다."));
      return;
    }
    notify("카테고리를 선택하세요.");
  }

  const actorNameMap = useMemo(
    () =>
      (authUsers || []).reduce((acc, user) => {
        acc[user.id] = user.nickname || user.email || String(user.id);
        return acc;
      }, {}),
    [authUsers]
  );

  const filteredTimelineEvents = (selectedDisputeEvents || []).filter((event) => {
    const actionMatch = timelineActionFilter === "전체" ? true : event.action === timelineActionFilter;
    const eventDate = String(event.created_at || "").slice(0, 10);
    const fromMatch = timelineFromDate ? eventDate >= timelineFromDate : true;
    const toMatch = timelineToDate ? eventDate <= timelineToDate : true;
    return actionMatch && fromMatch && toMatch;
  });

  function moveToSection(sectionRef) {
    requestAnimationFrame(() => {
      sectionRef?.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  return (
    <section className="mx-auto max-w-[1400px] px-4 py-6">
      <div className={`rounded-3xl border p-3 shadow-sm md:p-4 ${theme.card}`}>
        <div className="mb-5">
          <div className="text-xl font-black">{lang.adminTitle}</div>
          <div className={`mt-1 text-xs ${theme.subtext}`}>
            상위 회원이 본인 하부를 누르면 가입일, 이메일, 지갑, 거래정보, 하부 리스트를 확인할 수 있습니다.
          </div>
          <div className={`mt-3 flex flex-wrap items-center gap-2 rounded-2xl border px-3 py-2 text-xs ${theme.cardSoft}`}>
            <span className={`rounded-full px-2 py-1 font-black text-white ${theme.main.includes("blue") ? "bg-blue-600" : "bg-slate-700"}`}>
              현재 단계: {currentAdminStage}
            </span>
            <span className={`rounded-full border px-2 py-1 font-black ${theme.input}`}>
              현재 정보: {currentAdminFocus}
            </span>
            <button
              onClick={runAdminQuickAction}
              disabled={quickActionDisabled}
              className={`rounded-full border px-3 py-1 font-black ${quickActionDisabled ? "bg-slate-500 text-white" : theme.main}`}
            >
              바로가기: {quickActionLabel}
            </button>
          </div>
        </div>

        {!useExternalAdminNav ? (
        <div className={`${isAdminTab("dashboard") ? "" : "hidden "}mb-4 rounded-3xl border p-4 ${theme.cardSoft}`}>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-lg font-black">관리자 메인 카테고리</div>
              <div className={`text-xs ${theme.muted}`}>카테고리를 누르면 해당 기능 화면으로 이동합니다.</div>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {adminCategories.map((category) => (
              <button
                key={category.key}
                onClick={() => setAdminViewTab(category.key)}
                className={`rounded-2xl border p-4 text-left transition hover:scale-[1.01] ${theme.input}`}
              >
                <div className="flex items-center justify-between">
                  <div className="text-base font-black">{category.title}</div>
                  <span className={`rounded-full px-2 py-1 text-[11px] font-black text-white ${category.color}`}>이동</span>
                </div>
                <div className={`mt-2 text-xs leading-5 ${theme.muted}`}>{category.desc}</div>
              </button>
            ))}
          </div>
        </div>
        ) : null}

        <div className={`${isAdminTab("dashboard") ? "" : "hidden "}mb-4 rounded-3xl border p-4 ${theme.card}`}>
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="text-sm font-black">
                운영 알림 요약{" "}
                <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-black text-amber-300">MOCK</span>
              </div>
              <div className={`mt-1 text-xs ${theme.muted}`}>실제 알림·승인 큐 API 연동 전, 레이아웃과 우선순위 점검용입니다.</div>
            </div>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {MOCK_ADMIN_BRIEFS.map((b) => (
              <li
                key={b.id}
                className={`rounded-2xl border p-3 text-left ${
                  b.tone === "warn"
                    ? "border-amber-500/40 bg-amber-500/5"
                    : b.tone === "info"
                      ? "border-sky-500/35 bg-sky-500/5"
                      : theme.input
                }`}
              >
                <div className="text-xs font-black">{b.title}</div>
                <div className={`mt-1 text-[11px] leading-snug ${theme.subtext}`}>{b.body}</div>
                <div className={`mt-2 text-[10px] font-bold ${theme.muted}`}>{b.at}</div>
              </li>
            ))}
          </ul>
        </div>

        <div className={`sticky top-2 z-20 mb-4 rounded-3xl border p-2.5 backdrop-blur ${theme.cardSoft}`}>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
            <div className="flex items-center gap-2 text-[11px]">
              <span className={`rounded-full px-2 py-1 font-black text-white ${
                webhookChainAlertUnreadCount > 0 ? "bg-red-600" : "bg-emerald-600"
              }`}>
                {webhookChainAlertUnreadCount > 0 ? `CHAIN ALERT ${webhookChainAlertUnreadCount}` : "CHAIN STABLE"}
              </span>
              <span className={theme.muted}>
                {latestWebhookChainAlertAt ? `최근 경보: ${latestWebhookChainAlertAt}` : "최근 경보 기록 없음"}
              </span>
            </div>
            {webhookChainAlertUnreadCount > 0 ? (
              <button
                onClick={() => setAdminViewTab("ops")}
                className="rounded-full border border-red-500/50 bg-red-600/10 px-3 py-1 text-[11px] font-black text-red-400"
              >
                경보 바로보기
              </button>
            ) : null}
          </div>
          {!useExternalAdminNav ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
            <button onClick={() => setAdminViewTab("dashboard")} className={`rounded-xl border px-3 py-2 text-xs font-black ${isAdminTab("dashboard") ? theme.main : theme.input}`}>대시보드</button>
            <button onClick={() => setAdminViewTab("member")} className={`rounded-xl border px-3 py-2 text-xs font-black ${isAdminTab("member") ? theme.main : theme.input}`}>회원관리</button>
            <button onClick={() => setAdminViewTab("memberOps")} className={`rounded-xl border px-3 py-2 text-xs font-black ${isAdminTab("memberOps") ? theme.main : theme.input}`}>회원운영</button>
            <button onClick={() => setAdminViewTab("security")} className={`rounded-xl border px-3 py-2 text-xs font-black ${isAdminTab("security") ? theme.main : theme.input}`}>보안</button>
            <button onClick={() => setAdminViewTab("kyc")} className={`rounded-xl border px-3 py-2 text-xs font-black ${isAdminTab("kyc") ? theme.main : theme.input}`}>KYC</button>
            <button onClick={() => setAdminViewTab("dispute")} className={`rounded-xl border px-3 py-2 text-xs font-black ${isAdminTab("dispute") ? theme.main : theme.input}`}>분쟁/정산</button>
            <button onClick={() => setAdminViewTab("ops")} className={`rounded-xl border px-3 py-2 text-xs font-black ${isAdminTab("ops") ? theme.main : theme.input}`}>감사/복구</button>
            <button onClick={() => setAdminViewTab("audit")} className={`rounded-xl border px-3 py-2 text-xs font-black ${isAdminTab("audit") ? theme.main : theme.input}`}>플랫폼로그</button>
          </div>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 px-1 pt-2">
            <div className={`text-[11px] ${theme.muted}`}>
              목업 회원 DB: 가상 하부 <b>{VIRTUAL_DOWNLINE_MEMBER_COUNT}명</b> · 발급/시드 테스트 계정은 유지됩니다.
            </div>
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`목업 회원 데이터를 초기화할까요?\n가상 VD 회원 ${VIRTUAL_DOWNLINE_MEMBER_COUNT}명이 기본 분포로 다시 만들어지고, 단계·상위·배분 오버라이드가 지워집니다.`)) {
                  resetMemberMockDataset();
                }
              }}
              className="rounded-xl border border-amber-500/50 bg-amber-500/10 px-3 py-1.5 text-[11px] font-black text-amber-200"
            >
              목업 회원 DB 초기화
            </button>
          </div>
        </div>

        <div className="space-y-4">

        <div className={`${isAdminTab("audit") ? "" : "hidden "}mb-5 rounded-3xl border p-4 ${theme.cardSoft}`}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-black">플랫폼 감사 로그</div>
              <div className={`text-xs ${theme.muted}`}>로그인·가입·지갑 로그인 등 서버에 기록된 공통 감사 이벤트입니다.</div>
            </div>
            <button
              type="button"
              onClick={() => {
                loadPlatformAuditLogs();
                loadAdminP2pOrders();
              }}
              disabled={platformAuditLoading || adminP2pLoading}
              className={`rounded-xl border px-3 py-2 text-xs font-black ${platformAuditLoading || adminP2pLoading ? "opacity-60" : theme.input}`}
            >
              {platformAuditLoading || adminP2pLoading ? "불러오는 중…" : "새로고침"}
            </button>
          </div>
          <div className="max-h-[min(70vh,560px)] overflow-auto rounded-2xl border border-white/10">
            <table className="min-w-full text-left text-[11px]">
              <thead className={`sticky top-0 z-10 ${theme.card}`}>
                <tr className={`border-b ${theme.muted}`}>
                  <th className="px-2 py-2 pr-2">ID</th>
                  <th className="py-2 pr-2">시각</th>
                  <th className="py-2 pr-2">이벤트</th>
                  <th className="py-2 pr-2">플랫폼</th>
                  <th className="py-2 pr-2">user_id</th>
                  <th className="py-2 pr-2">IP</th>
                  <th className="py-2 pr-2">UA</th>
                  <th className="py-2 pr-2">payload</th>
                </tr>
              </thead>
              <tbody>
                {(platformAuditLogs || []).map((row) => (
                  <tr key={row.id} className={`border-b border-white/5 ${theme.subtext}`}>
                    <td className="px-2 py-1.5 pr-2 font-mono">{row.id}</td>
                    <td className="py-1.5 pr-2 whitespace-nowrap">{row.created_at}</td>
                    <td className="py-1.5 pr-2">{row.event_type}</td>
                    <td className="py-1.5 pr-2 font-mono text-[10px]">{row.platform_code || "—"}</td>
                    <td className="py-1.5 pr-2">{row.user_id ?? "—"}</td>
                    <td className="py-1.5 pr-2 font-mono text-[10px]">{row.ip || "—"}</td>
                    <td className="py-1.5 pr-2 max-w-[120px] truncate text-[10px]" title={row.user_agent}>{row.user_agent || "—"}</td>
                    <td className="py-1.5 pr-2 max-w-[min(40vw,220px)] truncate font-mono text-[10px]" title={row.payload_json}>{row.payload_json}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!platformAuditLoading && (!platformAuditLogs || platformAuditLogs.length === 0) ? (
            <div className={`mt-3 text-xs ${theme.muted}`}>기록이 없습니다. 로그인 후 이 탭을 다시 열어 보세요.</div>
          ) : null}

          <div className="mt-8 border-t border-white/10 pt-6">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-black">P2P 주문 모니터</div>
                <div className={`text-xs ${theme.muted}`}>전체 주문 상태 · 판매자/매수자 user_id (관리자 전용)</div>
              </div>
              <span className={`rounded-full px-2 py-1 text-[11px] font-black ${theme.cardSoft}`}>
                {adminP2pLoading ? "…" : `${adminP2pOrders.length}건`}
              </span>
            </div>
            <div className="max-h-[min(50vh,420px)] overflow-auto rounded-2xl border border-white/10">
              <table className="min-w-full text-left text-[11px]">
                <thead className={`sticky top-0 z-10 ${theme.card}`}>
                  <tr className={`border-b ${theme.muted}`}>
                    <th className="px-2 py-2">주문 ID</th>
                    <th className="py-2 pr-2">상태</th>
                    <th className="py-2 pr-2">플랫폼</th>
                    <th className="py-2 pr-2">코인/수량</th>
                    <th className="py-2 pr-2">판매자</th>
                    <th className="py-2 pr-2">매수자</th>
                    <th className="py-2 pr-2">갱신</th>
                    <th className="py-2 pr-2">이벤트</th>
                    <th className="py-2 pr-2">중재</th>
                  </tr>
                </thead>
                <tbody>
                  {(adminP2pOrders || []).map((row) => (
                    <tr key={row.id} className={`border-b border-white/5 ${theme.subtext}`}>
                      <td className="max-w-[140px] truncate px-2 py-1.5 font-mono text-[10px]" title={row.id}>{row.id}</td>
                      <td className="py-1.5 pr-2">{row.status}</td>
                      <td className="py-1.5 pr-2 font-mono text-[10px]">{row.platform_code || "—"}</td>
                      <td className="py-1.5 pr-2 whitespace-nowrap">{row.amount} {row.coin}</td>
                      <td className="py-1.5 pr-2">{actorNameMap[row.seller_user_id] || `#${row.seller_user_id}`}</td>
                      <td className="py-1.5 pr-2">{row.buyer_user_id != null ? (actorNameMap[row.buyer_user_id] || `#${row.buyer_user_id}`) : "—"}</td>
                      <td className="py-1.5 pr-2 whitespace-nowrap text-[10px]">{row.updated_at}</td>
                      <td className="py-1.5 pr-2">
                        <button
                          type="button"
                          onClick={() => toggleAdminP2pTimeline(row.id)}
                          className={`rounded-lg border px-2 py-1 text-[10px] font-black ${theme.input}`}
                        >
                          {adminP2pTimelineId === row.id ? "닫기" : "보기"}
                        </button>
                      </td>
                      <td className="py-1.5 pr-2">
                        {row.status === "matched" || row.status === "payment_sent" ? (
                          <button
                            type="button"
                            disabled={adminP2pCancelId === row.id}
                            onClick={() => adminCancelP2pOrder(row.id)}
                            className={`rounded-lg border border-red-500/50 px-2 py-1 text-[10px] font-black text-red-300 ${theme.input}`}
                          >
                            {adminP2pCancelId === row.id ? "…" : "취소"}
                          </button>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {adminP2pTimelineId ? (
              <div className={`mt-4 rounded-2xl border border-white/10 p-4 ${theme.card}`}>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-black text-emerald-400">이벤트 타임라인 · {adminP2pTimelineId}</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={adminP2pEventsLoadingId === adminP2pTimelineId}
                      onClick={() => refreshAdminP2pTimeline(adminP2pTimelineId)}
                      className={`rounded-lg border px-2 py-1 text-[10px] font-black ${theme.input}`}
                    >
                      {adminP2pEventsLoadingId === adminP2pTimelineId ? "…" : "타임라인 새로고침"}
                    </button>
                    <button type="button" onClick={() => setAdminP2pTimelineId("")} className={`rounded-lg border px-2 py-1 text-[10px] font-black ${theme.input}`}>
                      닫기
                    </button>
                  </div>
                </div>
                {adminP2pEventsLoadingId === adminP2pTimelineId ? (
                  <div className={`text-xs ${theme.muted}`}>불러오는 중…</div>
                ) : (adminP2pEventsCache[adminP2pTimelineId] || []).length ? (
                  <ul className="max-h-64 space-y-2 overflow-auto text-[11px]">
                    {(adminP2pEventsCache[adminP2pTimelineId] || []).map((ev) => (
                      <li key={ev.id} className={`rounded-lg border border-white/5 px-2 py-2 ${theme.cardSoft}`}>
                        <div className="flex flex-wrap gap-2">
                          <span className="font-mono text-[10px] text-sky-400">{ev.created_at}</span>
                          <span className="font-black">{ev.action}</span>
                          <span className={`text-[10px] ${theme.muted}`}>#{ev.actor_user_id ?? "—"}</span>
                        </div>
                        <pre className={`mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-all font-mono text-[10px] ${theme.muted}`}>{ev.detail_json}</pre>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className={`text-xs ${theme.muted}`}>이벤트가 없습니다.</div>
                )}
              </div>
            ) : null}
            {!adminP2pLoading && (!adminP2pOrders || adminP2pOrders.length === 0) ? (
              <div className={`mt-3 text-xs ${theme.muted}`}>등록된 P2P 주문이 없습니다.</div>
            ) : null}
          </div>
        </div>

        <div className={`${isAdminTab("ops") ? "" : "hidden "}mb-5 rounded-3xl border p-4 ${theme.cardSoft}`}>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-black">본사 운영 설정</div>
              <div className={`text-xs ${theme.muted}`}>
                DB에 저장되며 재시작 후에도 유지됩니다. P2P 송금 마감: 환경변수 미설정 시 폴백 {envFallbackSla}분. 시세 출처를 비우면{" "}
                <span className="font-mono">PRICE_FEED_PROVIDER</span> 등 환경변수 규칙을 따릅니다.
              </div>
            </div>
            <button
              type="button"
              onClick={() => loadPlatformSettings()}
              disabled={platformOpsLoading}
              className={`rounded-xl border px-3 py-2 text-xs font-black ${platformOpsLoading ? "opacity-60" : theme.input}`}
            >
              {platformOpsLoading ? "불러오는 중…" : "새로고침"}
            </button>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className={`grid gap-1 ${theme.subtext}`}>
              <span className="text-[11px] font-black">P2P 매칭 후 송금 마감(분)</span>
              <input
                type="number"
                min={5}
                max={180}
                value={p2pMatchSlaInput}
                onChange={(e) => setP2pMatchSlaInput(e.target.value)}
                className={`w-28 rounded-xl border px-3 py-2 text-xs font-bold outline-none ${theme.input}`}
              />
            </label>
            <label className={`grid min-w-[220px] gap-1 ${theme.subtext}`}>
              <span className="text-[11px] font-black">참고 시세 출처 (앱 표시용)</span>
              <select
                value={priceFeedProviderSelect}
                onChange={(e) => setPriceFeedProviderSelect(e.target.value)}
                className={`rounded-xl border px-3 py-2 text-xs font-bold outline-none ${theme.input}`}
              >
                <option value="">(비움) 환경변수·자동 규칙</option>
                {(priceFeedBuiltinIds.length ? priceFeedBuiltinIds : ["coingecko", "coinmarketcap", "static", "upbit"]).map((id) => (
                  <option key={id} value={id}>
                    {id === "coingecko"
                      ? "CoinGecko (집계)"
                      : id === "coinmarketcap"
                        ? "CoinMarketCap (집계, API 키)"
                        : id === "static"
                          ? "내장 고정값"
                          : id === "upbit"
                            ? "업비트 공개 티커"
                            : id}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => savePlatformSettings()}
              disabled={platformOpsSaving || platformOpsLoading}
              className={`rounded-xl border px-4 py-2 text-xs font-black ${theme.main}`}
            >
              {platformOpsSaving ? "저장 중…" : "저장"}
            </button>
          </div>
          <div className={`mt-2 space-y-1 text-[11px] ${theme.muted}`}>
            <div>
              P2P 적용: {p2pMatchSlaInput}분 · 마지막 수정: {p2pMatchSlaUpdatedAt || "-"}
              {p2pMatchSlaUpdatedBy != null ? ` · by user #${p2pMatchSlaUpdatedBy}` : ""}
            </div>
            <div>
              시세 DB 지정: {priceFeedProviderSelect ? <span className="font-mono text-sky-400">{priceFeedProviderSelect}</span> : "— (환경변수 규칙)"}{" "}
              · 적용 출처 id: <span className="font-mono text-emerald-400">{priceFeedEffective || "—"}</span>
              {" "}
              <span className="opacity-80">(CMC는 키 없으면 내부적으로 coingecko 로 폴백)</span>
              {priceFeedEnvOnly ? (
                <>
                  {" "}
                  · 환경만 보면: <span className="font-mono">{priceFeedEnvOnly}</span>
                </>
              ) : null}
              {" · "}
              마지막 수정: {priceFeedUpdatedAt || "-"}
              {priceFeedUpdatedBy != null ? ` · by user #${priceFeedUpdatedBy}` : ""}
            </div>
          </div>
        </div>

        <div className={`${isAdminTab("ops") ? "" : "hidden "}mb-5 rounded-3xl border p-4 ${theme.cardSoft}`}>
          <div className="mb-2 flex items-center justify-between">
            <div>
              <div className="text-sm font-black">비상 점검 모드 (원클릭)</div>
              <div className={`text-xs ${theme.muted}`}>활성화 시 일반 사용자 변경 요청을 차단하고 관리자 복구 작업만 허용합니다.</div>
            </div>
            <span className={`rounded-full px-2 py-1 text-xs font-black ${
              emergencyState.emergencyMode ? "bg-red-600 text-white" : "bg-emerald-600 text-white"
            }`}>
              {emergencyState.emergencyMode ? "ON" : "OFF"}
            </span>
          </div>
          <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto_auto_auto]">
            <input
              value={emergencyReasonInput}
              onChange={(e) => setEmergencyReasonInput(e.target.value)}
              placeholder="비상모드 사유 (예: 결제 장애 긴급 점검)"
              className={`rounded-xl border px-3 py-2 text-xs font-bold outline-none ${theme.input}`}
            />
            <input
              value={emergencyEtaInput}
              onChange={(e) => setEmergencyEtaInput(e.target.value)}
              placeholder="예상 복구 시간 ETA (예: 2026-05-09 03:00 KST)"
              className={`rounded-xl border px-3 py-2 text-xs font-bold outline-none ${theme.input}`}
            />
            <button onClick={() => updateEmergencyMode(true)} disabled={emergencyLoading} className="rounded-xl border border-red-500/60 px-3 py-2 text-xs font-black text-red-400">
              {emergencyLoading ? "처리중..." : "비상모드 ON"}
            </button>
            <button onClick={() => updateEmergencyMode(false)} disabled={emergencyLoading} className={`rounded-xl border px-3 py-2 text-xs font-black ${theme.input}`}>
              비상모드 OFF
            </button>
            <button onClick={loadEmergencyState} className={`rounded-xl border px-3 py-2 text-xs font-black ${theme.input}`}>
              상태 새로고침
            </button>
          </div>
          <div className={`mt-2 text-[11px] ${theme.muted}`}>
            현재 사유: {emergencyState.emergencyReason || "-"} · ETA: {emergencyState.emergencyEta || "-"} · updatedBy: {emergencyState.updatedByUserId || "-"} · {emergencyState.updatedAt || "-"}
          </div>
        </div>

        <div className={`${isAdminTab("ops") ? "" : "hidden "}mb-5 rounded-3xl border p-4 ${theme.cardSoft}`}>
          <div className="mb-2 flex items-center justify-between">
            <div>
              <div className="text-sm font-black">마켓 카탈로그 변경 이력</div>
              <div className={`text-xs ${theme.muted}`}>최근 변경 내역(작업자/시각/대상)을 추적합니다.</div>
              <div className={`mt-1 text-[11px] ${theme.muted}`}>
                scope: {marketAuditScope} · integrity rows: {marketAuditIntegrity.total || 0}
                {marketAuditIntegrity.rootHash ? ` · hash: ${marketAuditIntegrity.rootHash.slice(0, 12)}...` : ""}
              </div>
              <div className={`mt-1 text-[11px] ${theme.muted}`}>
                chain proof: {recentMarketAuditChainHashes.length ? `${recentMarketAuditChainHashes[0].created_at} / ${String(recentMarketAuditChainHashes[0].sha256_hash || "").slice(0, 12)}...` : "아직 없음"}
              </div>
              <div className={`mt-1 text-[11px] ${theme.muted}`}>
                chain compare: {!marketAuditChainDrift.ready
                  ? "비교용 기록 부족"
                  : marketAuditChainDrift.changed
                    ? `변경 감지 (${marketAuditChainDrift.previousAt} -> ${marketAuditChainDrift.latestAt})`
                    : "변경 없음(최근 2회 동일)"}
              </div>
              <div className="mt-1">
                <span className={`rounded-full px-2 py-1 text-[11px] font-black text-white ${
                  marketAuditChainStatus === "changed"
                    ? "bg-red-600"
                    : marketAuditChainStatus === "stable"
                      ? "bg-emerald-600"
                      : "bg-slate-600"
                }`}>
                  {marketAuditChainStatus === "changed" ? "CHAIN ALERT" : marketAuditChainStatus === "stable" ? "CHAIN STABLE" : "CHAIN PENDING"}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={loadMarketCatalogAudit} className={`rounded-xl border px-3 py-2 text-xs font-black ${theme.input}`}>
                이력 새로고침
              </button>
              <button onClick={exportMarketCatalogAuditCsv} className={`rounded-xl border px-3 py-2 text-xs font-black ${theme.input}`}>
                CSV 내보내기
              </button>
              <button onClick={verifyMarketCatalogAuditIntegrity} disabled={marketAuditIntegrityLoading} className={`rounded-xl border px-3 py-2 text-xs font-black ${theme.input}`}>
                {marketAuditIntegrityLoading ? "검증중..." : "무결성 검증"}
              </button>
              <button onClick={() => loadRecentReportHashes("market_catalog_audit_chain")} className={`rounded-xl border px-3 py-2 text-xs font-black ${theme.input}`}>
                체인기록 새로고침
              </button>
            </div>
          </div>
          <div className="mb-2 grid gap-2 md:grid-cols-2">
            <select
              value={marketAuditActorFilter}
              onChange={(e) => setMarketAuditActorFilter(e.target.value)}
              className={`rounded-xl border px-3 py-2 text-xs font-black outline-none ${theme.input}`}
            >
              <option value="">전체 작업자</option>
              {(authUsers || []).map((u) => (
                <option key={`audit-actor-${u.id}`} value={u.id}>
                  {u.nickname || u.email || u.id}
                </option>
              ))}
            </select>
            <input
              value={marketAuditQuery}
              onChange={(e) => setMarketAuditQuery(e.target.value)}
              placeholder="키워드 검색 (assetCode/marketKey/작업자)"
              className={`rounded-xl border px-3 py-2 text-xs font-bold outline-none ${theme.input}`}
            />
          </div>
          <div className="mb-2 grid gap-2 md:grid-cols-2">
            <input
              type="date"
              value={marketAuditFromDate}
              onChange={(e) => setMarketAuditFromDate(e.target.value)}
              className={`rounded-xl border px-3 py-2 text-xs font-bold outline-none ${theme.input}`}
            />
            <input
              type="date"
              value={marketAuditToDate}
              onChange={(e) => setMarketAuditToDate(e.target.value)}
              className={`rounded-xl border px-3 py-2 text-xs font-bold outline-none ${theme.input}`}
            />
          </div>
          <div className="mb-2 flex flex-wrap items-center gap-1">
            <button onClick={() => applyMarketAuditQuickRange(1)} className={`rounded-xl border px-2 py-1 text-[11px] font-black ${theme.input}`}>오늘</button>
            <button onClick={() => applyMarketAuditQuickRange(7)} className={`rounded-xl border px-2 py-1 text-[11px] font-black ${theme.input}`}>7일</button>
            <button onClick={() => applyMarketAuditQuickRange(30)} className={`rounded-xl border px-2 py-1 text-[11px] font-black ${theme.input}`}>30일</button>
            <button onClick={resetMarketAuditFilters} className={`rounded-xl border px-2 py-1 text-[11px] font-black ${theme.input}`}>필터 초기화</button>
          </div>
          <div className="max-h-36 space-y-1 overflow-y-auto pr-1">
            {marketCatalogLogs.length ? (
              marketCatalogLogs.map((log) => (
                <div key={log.id} className={`rounded-xl border p-2 text-xs ${theme.input}`}>
                  <div className="font-black">#{log.id} · {log.createdAt}</div>
                  <div className={theme.muted}>
                    actor: {log.actorName || log.actorUserId} · assets {log.assetsCount} · markets {log.marketsCount}
                  </div>
                  <div className="mt-1 text-[11px]">
                    a(+{log.summary?.assetDiff?.added?.length || 0}/-{log.summary?.assetDiff?.removed?.length || 0}/~{log.summary?.assetDiff?.updated?.length || 0})
                    {" · "}
                    m(+{log.summary?.marketDiff?.added?.length || 0}/-{log.summary?.marketDiff?.removed?.length || 0}/~{log.summary?.marketDiff?.updated?.length || 0})
                  </div>
                  <div className="mt-1 text-[11px]">
                    +asset: {Array.isArray(log.summary?.assetDiff?.added) && log.summary.assetDiff.added.length ? log.summary.assetDiff.added.slice(0, 5).join(", ") : "-"}
                    {" · "}
                    -asset: {Array.isArray(log.summary?.assetDiff?.removed) && log.summary.assetDiff.removed.length ? log.summary.assetDiff.removed.slice(0, 5).join(", ") : "-"}
                    {" · "}
                    ~asset: {Array.isArray(log.summary?.assetDiff?.updated) && log.summary.assetDiff.updated.length ? log.summary.assetDiff.updated.slice(0, 5).join(", ") : "-"}
                  </div>
                  <div className="mt-1 text-[11px]">
                    +market: {Array.isArray(log.summary?.marketDiff?.added) && log.summary.marketDiff.added.length ? log.summary.marketDiff.added.slice(0, 5).join(", ") : "-"}
                    {" · "}
                    -market: {Array.isArray(log.summary?.marketDiff?.removed) && log.summary.marketDiff.removed.length ? log.summary.marketDiff.removed.slice(0, 5).join(", ") : "-"}
                    {" · "}
                    ~market: {Array.isArray(log.summary?.marketDiff?.updated) && log.summary.marketDiff.updated.length ? log.summary.marketDiff.updated.slice(0, 5).join(", ") : "-"}
                  </div>
                  <div className="mt-1 text-[11px]">
                    {Array.isArray(log.summary?.assetCodes) ? `assets: ${log.summary.assetCodes.slice(0, 6).join(", ")}` : ""}
                    {Array.isArray(log.summary?.marketKeys) ? ` · markets: ${log.summary.marketKeys.slice(0, 6).join(", ")}` : ""}
                  </div>
                  <div className="mt-1">
                    <button
                      onClick={() => toggleMarketAuditExpanded(log.id)}
                      className={`rounded border px-2 py-1 text-[11px] font-black ${theme.input}`}
                    >
                      {expandedMarketAuditIds[log.id] ? "상세 닫기" : "상세 보기"}
                    </button>
                  </div>
                  {expandedMarketAuditIds[log.id] ? (
                    <div className={`mt-2 rounded-lg border p-2 text-[11px] ${theme.cardSoft}`}>
                      <div>
                        asset added: {Array.isArray(log.summary?.assetDiff?.added) && log.summary.assetDiff.added.length ? log.summary.assetDiff.added.join(", ") : "-"}
                      </div>
                      <div>
                        asset removed: {Array.isArray(log.summary?.assetDiff?.removed) && log.summary.assetDiff.removed.length ? log.summary.assetDiff.removed.join(", ") : "-"}
                      </div>
                      <div>
                        asset updated: {Array.isArray(log.summary?.assetDiff?.updated) && log.summary.assetDiff.updated.length ? log.summary.assetDiff.updated.join(", ") : "-"}
                      </div>
                      <div className="mt-1">
                        market added: {Array.isArray(log.summary?.marketDiff?.added) && log.summary.marketDiff.added.length ? log.summary.marketDiff.added.join(", ") : "-"}
                      </div>
                      <div>
                        market removed: {Array.isArray(log.summary?.marketDiff?.removed) && log.summary.marketDiff.removed.length ? log.summary.marketDiff.removed.join(", ") : "-"}
                      </div>
                      <div>
                        market updated: {Array.isArray(log.summary?.marketDiff?.updated) && log.summary.marketDiff.updated.length ? log.summary.marketDiff.updated.join(", ") : "-"}
                      </div>
                    </div>
                  ) : null}
                </div>
              ))
            ) : (
              <div className={`rounded-xl border p-2 text-xs ${theme.input}`}>카탈로그 변경 이력이 없습니다.</div>
            )}
          </div>
          <div className="mt-2 flex justify-end">
            <button
              onClick={() => loadMarketCatalogAudit({ append: true })}
              disabled={!marketAuditHasMore || marketAuditLoadingMore}
              className={`rounded-xl border px-3 py-2 text-xs font-black ${theme.input} ${!marketAuditHasMore ? "opacity-50" : ""}`}
            >
              {marketAuditLoadingMore ? "불러오는 중..." : marketAuditHasMore ? "더보기" : "끝"}
            </button>
          </div>
          <div className={`mt-2 rounded-xl border p-2 ${theme.cardSoft}`}>
            <div className="mb-1 text-xs font-black">감사 알림 로그</div>
            <div className="max-h-24 space-y-1 overflow-y-auto pr-1">
              {marketAuditChangeAlerts.length ? marketAuditChangeAlerts.map((alert) => (
                <div key={alert.id} className={`rounded border p-1 text-[11px] ${theme.input}`}>
                  <div className="font-black">{alert.at}</div>
                  <div>{alert.message}</div>
                  <div className="break-all text-[10px]">latest: {String(alert.latestHash || "").slice(0, 24)}... · prev: {String(alert.previousHash || "").slice(0, 24)}...</div>
                </div>
              )) : (
                <div className={`rounded border p-1 text-[11px] ${theme.input}`}>변경 감지 알림이 없습니다.</div>
              )}
            </div>
          </div>
        </div>

        <div className={`${isAdminTab("ops") ? "" : "hidden "}mb-5 rounded-3xl border p-4 ${theme.cardSoft}`}>
          <div className="mb-2 flex items-center justify-between">
            <div>
              <div className="text-sm font-black">운영 리스크 센터</div>
              <div className={`text-xs ${theme.muted}`}>장애/지연/승인 병목을 실시간으로 점검합니다.</div>
            </div>
            <button onClick={loadOpsRiskSummary} className={`rounded-xl border px-3 py-2 text-xs font-black ${theme.input}`}>
              {opsRiskLoading ? "점검중..." : "리스크 점검"}
            </button>
          </div>
          <div className="mb-2 flex items-center gap-2 text-xs">
            <span className={`rounded-full px-2 py-1 font-black ${
              opsRiskSummary.overallLevel === "high"
                ? "bg-red-600 text-white"
                : opsRiskSummary.overallLevel === "medium"
                  ? "bg-amber-500 text-white"
                  : "bg-emerald-600 text-white"
            }`}>
              overall: {opsRiskSummary.overallLevel}
            </span>
            <span className={`rounded-full border px-2 py-1 font-black ${theme.input}`}>score: {opsRiskSummary.score}</span>
            <span className={theme.muted}>generated: {opsRiskSummary.generatedAt || "-"}</span>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {(opsRiskSummary.risks || []).map((risk) => (
              <div key={risk.key} className={`rounded-xl border p-2 text-xs ${theme.input}`}>
                <div className="flex items-center justify-between">
                  <span className="font-black">{risk.message}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-black ${
                    risk.level === "high"
                      ? "bg-red-600 text-white"
                      : risk.level === "medium"
                        ? "bg-amber-500 text-white"
                        : "bg-emerald-600 text-white"
                  }`}>
                    {risk.level}
                  </span>
                </div>
                <div className={theme.muted}>count: {risk.count}</div>
                <div className="mt-2">
                  <button
                    onClick={() => runOpsAction(risk.key)}
                    disabled={opsActionLoading === risk.key}
                    className={`rounded-lg border px-2 py-1 text-[11px] font-black ${theme.input}`}
                  >
                    {opsActionLoading === risk.key ? "조치중..." : "즉시 조치"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={`${isAdminTab("ops") ? "" : "hidden "}mb-5 rounded-3xl border p-4 ${theme.cardSoft}`}>
          <div className="mb-2 flex items-center justify-between">
            <div>
              <div className="text-sm font-black">확장형 마켓 카탈로그 (코인/NFT)</div>
              <div className={`text-xs ${theme.muted}`}>현재는 결제 코인 중심으로 운영하고, NFT 등은 planned 상태로 확장할 수 있습니다.</div>
            </div>
            <div className="flex gap-2">
              <button onClick={loadMarketCatalog} className={`rounded-xl border px-3 py-2 text-xs font-black ${theme.input}`}>
                {marketCatalogLoading ? "조회중..." : "카탈로그 새로고침"}
              </button>
              <button
                onClick={resetMarketCatalogDraft}
                disabled={marketCatalogSaving || !marketCatalogDiff.hasChanges}
                className={`rounded-xl border px-3 py-2 text-xs font-black ${theme.input}`}
              >
                편집 원복
              </button>
              <button
                onClick={openMarketSaveConfirm}
                disabled={!isSuperAdmin || marketCatalogSaving}
                className={`rounded-xl border px-3 py-2 text-xs font-black ${isSuperAdmin ? theme.main : theme.input}`}
              >
                {marketCatalogSaving ? "저장중..." : "카탈로그 저장"}
              </button>
            </div>
          </div>
          <div className={`mb-2 text-[11px] ${theme.muted}`}>자산/마켓을 행 단위로 수정한 뒤 저장하세요. (코인 active, NFT planned 권장)</div>
          <div className={`mb-2 rounded-xl border px-2 py-1 text-[11px] ${theme.input}`}>
            변경 요약 ·
            assets +{marketCatalogDiff.addedAssets} / -{marketCatalogDiff.removedAssets} / ~{marketCatalogDiff.updatedAssets}
            {"  "}· markets +{marketCatalogDiff.addedMarkets} / -{marketCatalogDiff.removedMarkets} / ~{marketCatalogDiff.updatedMarkets}
            {!marketCatalogDiff.hasChanges && " (변경 없음)"}
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <div className={`rounded-xl border p-2 ${theme.input}`}>
              <div className="mb-2 flex items-center justify-between">
                <div className="text-xs font-black">Assets</div>
                <div className="flex items-center gap-1">
                  <select
                    value={marketAssetTypeFilter}
                    onChange={(e) => setMarketAssetTypeFilter(e.target.value)}
                    className={`rounded-lg border px-2 py-1 text-[11px] font-black ${theme.input}`}
                  >
                    <option value="all">all type</option>
                    <option value="coin">coin</option>
                    <option value="nft">nft</option>
                    <option value="tokenized_asset">tokenized</option>
                    <option value="point">point</option>
                  </select>
                  <button onClick={addAssetRow} className={`rounded-lg border px-2 py-1 text-[11px] font-black ${theme.input}`}>+ asset</button>
                </div>
              </div>
              <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                {filteredMarketAssets.map(({ asset, index }) => (
                  <div key={`asset-${index}`} className={`rounded-lg border p-2 text-[11px] ${theme.cardSoft}`}>
                    <div className="grid gap-1 md:grid-cols-2">
                      <input value={asset.assetCode || ""} onChange={(e) => updateAssetRow(index, "assetCode", e.target.value.toUpperCase())} placeholder="assetCode" className={`rounded border px-2 py-1 ${theme.input}`} />
                      <input value={asset.displayName || ""} onChange={(e) => updateAssetRow(index, "displayName", e.target.value)} placeholder="displayName" className={`rounded border px-2 py-1 ${theme.input}`} />
                      <select value={asset.assetType || "coin"} onChange={(e) => updateAssetRow(index, "assetType", e.target.value)} className={`rounded border px-2 py-1 ${theme.input}`}>
                        <option value="coin">coin</option><option value="nft">nft</option><option value="tokenized_asset">tokenized_asset</option><option value="point">point</option>
                      </select>
                      <input value={asset.network || ""} onChange={(e) => updateAssetRow(index, "network", e.target.value)} placeholder="network" className={`rounded border px-2 py-1 ${theme.input}`} />
                    </div>
                    <textarea
                      value={asset.metadataText || "{}"}
                      onChange={(e) => updateAssetRow(index, "metadataText", e.target.value)}
                      placeholder='metadata JSON (e.g. {"precision":6})'
                      className={`mt-1 min-h-16 w-full rounded border px-2 py-1 font-mono text-[10px] ${theme.input}`}
                    />
                    <div className="mt-1 flex items-center gap-3">
                      <label className="flex items-center gap-1"><input type="checkbox" checked={Boolean(asset.settlementEnabled)} onChange={(e) => updateAssetRow(index, "settlementEnabled", e.target.checked)} />settlement</label>
                      <label className="flex items-center gap-1"><input type="checkbox" checked={asset.isActive !== false} onChange={(e) => updateAssetRow(index, "isActive", e.target.checked)} />active</label>
                      <button onClick={() => removeAssetRow(index)} className="rounded border px-2 py-1 text-[11px] font-black text-red-400">삭제</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className={`rounded-xl border p-2 ${theme.input}`}>
              <div className="mb-2 flex items-center justify-between">
                <div className="text-xs font-black">Markets</div>
                <div className="flex items-center gap-1">
                  <select
                    value={marketStatusFilter}
                    onChange={(e) => setMarketStatusFilter(e.target.value)}
                    className={`rounded-lg border px-2 py-1 text-[11px] font-black ${theme.input}`}
                  >
                    <option value="all">all status</option>
                    <option value="active">active</option>
                    <option value="planned">planned</option>
                    <option value="disabled">disabled</option>
                  </select>
                  <button onClick={addMarketRow} className={`rounded-lg border px-2 py-1 text-[11px] font-black ${theme.input}`}>+ market</button>
                </div>
              </div>
              <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                {filteredMarketCatalog.map(({ market, index }) => (
                  <div key={`market-${index}`} className={`rounded-lg border p-2 text-[11px] ${theme.cardSoft}`}>
                    <div className="grid gap-1 md:grid-cols-2">
                      <input value={market.marketKey || ""} onChange={(e) => updateMarketRow(index, "marketKey", e.target.value)} placeholder="marketKey" className={`rounded border px-2 py-1 ${theme.input}`} />
                      <select value={market.marketType || "p2p"} onChange={(e) => updateMarketRow(index, "marketType", e.target.value)} className={`rounded border px-2 py-1 ${theme.input}`}>
                        <option value="p2p">p2p</option><option value="mock">mock</option><option value="spot">spot</option>
                      </select>
                      <input value={market.offeredAssetCode || ""} onChange={(e) => updateMarketRow(index, "offeredAssetCode", e.target.value.toUpperCase())} placeholder="offeredAssetCode" className={`rounded border px-2 py-1 ${theme.input}`} />
                      <input value={market.requestedAssetCode || ""} onChange={(e) => updateMarketRow(index, "requestedAssetCode", e.target.value.toUpperCase())} placeholder="requestedAssetCode" className={`rounded border px-2 py-1 ${theme.input}`} />
                      <input value={market.settlementAssetCode || ""} onChange={(e) => updateMarketRow(index, "settlementAssetCode", e.target.value.toUpperCase())} placeholder="settlementAssetCode" className={`rounded border px-2 py-1 ${theme.input}`} />
                      <input value={market.escrowAdapter || ""} onChange={(e) => updateMarketRow(index, "escrowAdapter", e.target.value)} placeholder="escrowAdapter" className={`rounded border px-2 py-1 ${theme.input}`} />
                      <select value={market.status || "planned"} onChange={(e) => updateMarketRow(index, "status", e.target.value)} className={`rounded border px-2 py-1 ${theme.input}`}>
                        <option value="active">active</option><option value="planned">planned</option><option value="disabled">disabled</option>
                      </select>
                    </div>
                    <textarea
                      value={market.metadataText || "{}"}
                      onChange={(e) => updateMarketRow(index, "metadataText", e.target.value)}
                      placeholder='metadata JSON (e.g. {"label":"BTC/USDT"})'
                      className={`mt-1 min-h-16 w-full rounded border px-2 py-1 font-mono text-[10px] ${theme.input}`}
                    />
                    <div className="mt-1">
                      <button onClick={() => removeMarketRow(index)} className="rounded border px-2 py-1 text-[11px] font-black text-red-400">삭제</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {marketSaveConfirmOpen && (
            <div className={`mt-2 rounded-xl border p-2 text-xs ${theme.input}`}>
              <div className="font-black">카탈로그 저장 확인</div>
              <div className="mt-1">
                assets +{marketCatalogDiff.addedAssets} / -{marketCatalogDiff.removedAssets} / ~{marketCatalogDiff.updatedAssets}
                {" · "}
                markets +{marketCatalogDiff.addedMarkets} / -{marketCatalogDiff.removedMarkets} / ~{marketCatalogDiff.updatedMarkets}
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={async () => {
                    setMarketSaveConfirmOpen(false);
                    await saveMarketCatalog();
                  }}
                  className={`rounded-lg px-3 py-1.5 font-black ${theme.main}`}
                >
                  저장 실행
                </button>
                <button onClick={() => setMarketSaveConfirmOpen(false)} className={`rounded-lg border px-3 py-1.5 font-black ${theme.input}`}>
                  취소
                </button>
              </div>
            </div>
          )}
        </div>

        <div className={`${isAdminTab("ops") ? "" : "hidden "}mb-5 rounded-3xl border p-4 ${theme.cardSoft}`}>
          <div className="mb-2 flex items-center justify-between">
            <div>
              <div className="text-sm font-black">복구 스냅샷 · 롤백 센터</div>
              <div className={`text-xs ${theme.muted}`}>문제 발생 시 스냅샷 생성, 분석 후 원점 복구를 실행합니다.</div>
            </div>
            <button onClick={loadOpsSnapshots} className={`rounded-xl border px-3 py-2 text-xs font-black ${theme.input}`}>
              {opsSnapshotLoading ? "동기화중..." : "스냅샷 새로고침"}
            </button>
          </div>

          <div className="grid gap-2 md:grid-cols-3">
            <input
              value={opsSnapshotLabel}
              onChange={(e) => setOpsSnapshotLabel(e.target.value)}
              placeholder="스냅샷 라벨 (예: pre-release-v2)"
              className={`rounded-xl border px-3 py-2 text-xs font-bold outline-none ${theme.input}`}
            />
            <input
              value={opsSnapshotReason}
              onChange={(e) => setOpsSnapshotReason(e.target.value)}
              placeholder="스냅샷 사유 (5자 이상)"
              className={`rounded-xl border px-3 py-2 text-xs font-bold outline-none ${theme.input}`}
            />
            <button onClick={createOpsSnapshot} className={`rounded-xl border px-3 py-2 text-xs font-black ${theme.input}`}>
              운영 스냅샷 생성
            </button>
          </div>

          <div className="mt-2 max-h-36 space-y-1 overflow-y-auto pr-1">
            {opsSnapshots.length ? (
              opsSnapshots.map((snapshot) => (
                <div key={snapshot.id} className={`rounded-xl border p-2 text-xs ${theme.input}`}>
                  <div className="font-black">#{snapshot.id} · {snapshot.snapshot_type} · {snapshot.label || "-"}</div>
                  <div className={theme.muted}>
                    {snapshot.created_at} · by {snapshot.created_by_name || snapshot.created_by_user_id} · {number((snapshot.size_bytes || 0) / 1024)}KB
                  </div>
                  <div className="mt-1 break-all text-[11px]">{snapshot.sha256_hash}</div>
                </div>
              ))
            ) : (
              <div className={`rounded-xl border p-2 text-xs ${theme.input}`}>생성된 운영 스냅샷이 없습니다.</div>
            )}
          </div>

          <div className="mt-3 rounded-xl border p-3">
            <div className="mb-2 text-xs font-black">롤백 실행 (슈퍼관리자)</div>
            <div className="grid gap-2 md:grid-cols-4">
              <select
                value={rollbackSnapshotId}
                onChange={(e) => setRollbackSnapshotId(e.target.value)}
                className={`rounded-xl border px-3 py-2 text-xs font-black outline-none ${theme.input}`}
              >
                <option value="">롤백 대상 스냅샷 선택</option>
                {opsSnapshots.map((snapshot) => (
                  <option key={snapshot.id} value={snapshot.id}>
                    #{snapshot.id} · {snapshot.label || snapshot.snapshot_type}
                  </option>
                ))}
              </select>
              <input
                value={rollbackReason}
                onChange={(e) => setRollbackReason(e.target.value)}
                placeholder="롤백 사유 (5자 이상)"
                className={`rounded-xl border px-3 py-2 text-xs font-bold outline-none ${theme.input}`}
              />
              <input
                value={rollbackConfirmText}
                onChange={(e) => setRollbackConfirmText(e.target.value)}
                placeholder="확인문구: ROLLBACK"
                className={`rounded-xl border px-3 py-2 text-xs font-bold outline-none ${theme.input}`}
              />
              <button onClick={executeRollback} className="rounded-xl border border-red-500/60 px-3 py-2 text-xs font-black text-red-400">
                원점 롤백 실행
              </button>
            </div>
          </div>
        </div>

        <div className={`${isAdminTab("ops") ? "" : "hidden "}mb-5 rounded-3xl border p-4 ${theme.cardSoft}`}>
          <div className="mb-2 flex items-center justify-between">
            <div>
              <div className="text-sm font-black">리포트 해시 서버 기록</div>
              <div className={`text-xs ${theme.muted}`}>PDF 해시를 서버에 저장해 위변조 검증 기준으로 사용합니다.</div>
            </div>
            <button onClick={loadRecentReportHashes} className={`rounded-xl border px-3 py-2 text-xs font-black ${theme.input}`}>
              해시 이력 새로고침
            </button>
          </div>
          <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
            {recentReportHashes.length ? (
              recentReportHashes.map((row) => (
                <div key={row.id} className={`rounded-xl border p-2 text-xs ${theme.input}`}>
                  <div className="font-black">{row.report_type} · {row.created_at}</div>
                  <div className={theme.muted}>
                    actor {row.actor_name || row.actor_user_id} · rows {row.row_count} · {row.from_date || "all"} ~ {row.to_date || "all"}
                  </div>
                  <div className="mt-1 break-all text-[11px]">{row.sha256_hash}</div>
                </div>
              ))
            ) : (
              <div className={`rounded-xl border p-2 text-xs ${theme.input}`}>저장된 리포트 해시 이력이 없습니다.</div>
            )}
          </div>
          <div className="mt-2 rounded-xl border p-2">
            <div className="mb-1 text-xs font-black">해시 대조 검증</div>
            <div className="flex flex-col gap-2 md:flex-row">
              <select
                value={verifyHashType}
                onChange={(e) => setVerifyHashType(e.target.value)}
                className={`rounded-xl border px-3 py-2 text-xs font-black outline-none ${theme.input}`}
              >
                <option value="approval_audit_pdf">PDF 리포트</option>
                <option value="approval_audit_csv">CSV 리포트</option>
                <option value="market_catalog_audit_chain">카탈로그 감사 체인</option>
              </select>
              <input
                value={verifyHashInput}
                onChange={(e) => setVerifyHashInput(e.target.value)}
                placeholder="SHA-256 해시 64자 입력"
                className={`w-full rounded-xl border px-3 py-2 text-xs font-bold outline-none ${theme.input}`}
              />
              <button onClick={verifyReportHash} className={`rounded-xl border px-3 py-2 text-xs font-black ${theme.input}`}>
                서버 대조
              </button>
            </div>
            {!!verifyHashResult && <div className={`mt-2 text-[11px] ${theme.muted}`}>{verifyHashResult}</div>}
          </div>
        </div>

        <div className={`${isAdminTab("ops") ? "" : "hidden "}mb-5 rounded-3xl border p-4 ${theme.cardSoft}`}>
          <div className="mb-2 flex items-center justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-black">Webhook 전송 상태</span>
                {webhookChainAlertUnreadCount > 0 ? (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-black text-white ${
                      webhookAutoRefresh && webhookChainAlertOnly ? "bg-red-600" : "bg-amber-600"
                    }`}
                    title={webhookAutoRefresh && webhookChainAlertOnly ? "자동 감시 중 신규 CHAIN ALERT" : "신규 CHAIN ALERT (확인 전)"}
                  >
                    +{webhookChainAlertUnreadCount} CHAIN
                  </span>
                ) : null}
              </div>
              <div className={`text-xs ${theme.muted}`}>
                최근 관리자 이벤트 전송 결과 (성공/실패/비활성)
                {latestWebhookChainAlertAt ? ` · 최근 CHAIN ALERT: ${latestWebhookChainAlertAt}` : ""}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={webhookStatusFilter}
                onChange={(e) => setWebhookStatusFilter(e.target.value)}
                className={`rounded-xl border px-2 py-2 text-xs font-black outline-none ${theme.input}`}
              >
                <option value="all">전체</option>
                <option value="success">성공</option>
                <option value="failed">실패</option>
                <option value="disabled">비활성</option>
              </select>
              <label className={`flex items-center gap-1 rounded-xl border px-2 py-2 text-xs font-black ${theme.input}`}>
                <input
                  type="checkbox"
                  checked={webhookAutoRefresh}
                  onChange={(e) => setWebhookAutoRefresh(e.target.checked)}
                />
                15초 자동
              </label>
              <label className={`relative flex items-center gap-1 rounded-xl border px-2 py-2 text-xs font-black ${theme.input}`}>
                <input
                  type="checkbox"
                  checked={webhookChainAlertOnly}
                  onChange={(e) => setWebhookChainAlertOnly(e.target.checked)}
                />
                CHAIN ALERT만
                {webhookChainAlertUnreadCount > 0 && webhookChainAlertOnly ? (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-black leading-none text-white">
                    {webhookChainAlertUnreadCount > 99 ? "99+" : webhookChainAlertUnreadCount}
                  </span>
                ) : null}
              </label>
              <label className={`flex items-center gap-1 rounded-xl border px-2 py-2 text-xs font-black ${theme.input}`}>
                <input
                  type="checkbox"
                  checked={webhookAutoFocusOpsOnAlert}
                  onChange={(e) => setWebhookAutoFocusOpsOnAlert(e.target.checked)}
                />
                경보시 ops 고정
              </label>
              <label className={`flex items-center gap-1 rounded-xl border px-2 py-2 text-xs font-black ${theme.input}`}>
                <input
                  type="checkbox"
                  checked={webhookAlertSoundEnabled}
                  onChange={(e) => setWebhookAlertSoundEnabled(e.target.checked)}
                />
                소리 알림
              </label>
              <button
                onClick={() => loadWebhookEvents({ acknowledgeUnread: true })}
                className={`rounded-xl border px-3 py-2 text-xs font-black ${theme.input}`}
              >
                {webhookLoading ? "조회중..." : "새로고침"}
              </button>
              <button
                onClick={acknowledgeWebhookChainAlerts}
                className={`rounded-xl border px-3 py-2 text-xs font-black ${theme.input}`}
              >
                경보 확인처리
              </button>
            </div>
          </div>
          <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
            {filteredWebhookEvents.length ? (
              filteredWebhookEvents.map((event) => {
                const badgeClass =
                  event.status === "success"
                    ? "bg-emerald-600 text-white"
                    : event.status === "failed"
                      ? "bg-red-600 text-white"
                      : "bg-amber-500 text-white";
                const isChainAlertEvent = String(event.event_type || "") === "market_catalog_audit_chain_changed";
                return (
                  <div key={event.id} className={`flex items-center justify-between rounded-xl border p-2 text-xs ${theme.input}`}>
                    <div>
                      <div className="flex items-center gap-1">
                        <div className="font-black">{event.event_type}</div>
                        {isChainAlertEvent ? (
                          <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-black text-white">CHAIN ALERT</span>
                        ) : null}
                      </div>
                      <div className={theme.muted}>
                        {event.occurred_at}
                        {event.status_code ? ` · HTTP ${event.status_code}` : ""}
                      </div>
                      {!!event.error_message && <div className="text-[11px] text-red-400">{event.error_message}</div>}
                    </div>
                    <span className={`rounded-full px-2 py-1 text-[11px] font-black ${badgeClass}`}>{event.status}</span>
                  </div>
                );
              })
            ) : (
              <div className={`rounded-xl border p-2 text-xs ${theme.input}`}>조건에 맞는 웹훅 이벤트가 없습니다.</div>
            )}
          </div>
        </div>

        <div className={`${isAdminTab("ops") ? "" : "hidden "}mb-5 rounded-3xl border p-4 ${theme.cardSoft}`}>
          <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-sm font-black">권한 감사 리포트</div>
              <div className={`text-xs ${theme.muted}`}>누가 언제 무엇을 승인/반려/열람했는지 추적합니다.</div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={auditFromDate}
                onChange={(e) => setAuditFromDate(e.target.value)}
                className={`rounded-xl border px-2 py-2 text-xs font-black outline-none ${theme.input}`}
              />
              <input
                type="date"
                value={auditToDate}
                onChange={(e) => setAuditToDate(e.target.value)}
                className={`rounded-xl border px-2 py-2 text-xs font-black outline-none ${theme.input}`}
              />
              <button
                onClick={loadApprovalAuditReport}
                className={`rounded-xl border px-3 py-2 text-xs font-black ${theme.input}`}
              >
                {auditLoading ? "조회중..." : "리포트 조회"}
              </button>
              <button
                onClick={exportApprovalAuditCsv}
                className={`rounded-xl border px-3 py-2 text-xs font-black ${theme.input}`}
              >
                CSV 내보내기
              </button>
              <button
                onClick={exportApprovalAuditPdf}
                className={`rounded-xl border px-3 py-2 text-xs font-black ${theme.input}`}
              >
                PDF 출력
              </button>
            </div>
          </div>

          <div className="mb-3 grid gap-2 md:grid-cols-6">
            <div className={`rounded-xl border p-2 text-xs ${theme.input}`}>전체 이벤트 <b>{approvalAuditSummary.totalEvents || 0}</b></div>
            <div className={`rounded-xl border p-2 text-xs ${theme.input}`}>KYC 요청 <b>{approvalAuditSummary.kycRequestCount || 0}</b></div>
            <div className={`rounded-xl border p-2 text-xs ${theme.input}`}>KYC 승인 <b>{approvalAuditSummary.kycApprovalCount || 0}</b></div>
            <div className={`rounded-xl border p-2 text-xs ${theme.input}`}>KYC 반려 <b>{approvalAuditSummary.kycRejectedCount || 0}</b></div>
            <div className={`rounded-xl border p-2 text-xs ${theme.input}`}>KYC 열람 <b>{approvalAuditSummary.kycViewCount || 0}</b></div>
            <div className={`rounded-xl border p-2 text-xs ${theme.input}`}>분쟁 결재 <b>{approvalAuditSummary.disputeApprovalCount || 0}</b></div>
          </div>

          <div className="max-h-52 space-y-1 overflow-y-auto pr-1">
            {approvalAuditEvents.length ? (
              approvalAuditEvents.map((event, idx) => (
                <div key={`${event.kind}-${event.target}-${idx}`} className={`rounded-xl border p-2 text-xs ${theme.input}`}>
                  <div className="font-black">{event.action}</div>
                  <div className={theme.muted}>
                    {event.createdAt} · {event.actorName} ({event.actorUserId}) · {event.target}
                  </div>
                  {!!event.detail && <div className="mt-1 text-[11px]">{event.detail}</div>}
                </div>
              ))
            ) : (
              <div className={`rounded-xl border p-2 text-xs ${theme.input}`}>조회된 감사 이벤트가 없습니다.</div>
            )}
          </div>
        </div>

        <div className={`${isAdminTab("dashboard") ? "" : "hidden "}mb-4 rounded-3xl border p-4 ${theme.card}`}>
          <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-xl font-black">{lang.adminStorage}</div>
              <div className={`text-sm ${theme.subtext}`}>내 하부 기준 총거래량 · 레퍼럴 수익 · 기간별 수익 · 출금가능액</div>
            </div>
            <button onClick={() => notify("withdraw")} className={`rounded-2xl px-4 py-3 text-sm font-black ${theme.main}`}>{lang.withdrawRequest}</button>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <div className={`rounded-3xl p-4 ${theme.cardSoft}`}>
              <div className={theme.muted}>{lang.totalVolume}</div>
              <div className="mt-2 text-2xl font-black">${number(myTotalVolume)}</div>
              <div className={`mt-1 text-xs ${theme.muted}`}>직접 레퍼럴 거래량 기준</div>
            </div>
            <div className={`rounded-3xl p-4 ${theme.cardSoft}`}>
              <div className={theme.muted}>{lang.referralProfit}</div>
              <div className="mt-2 text-2xl font-black">${number(myReferralProfit)}</div>
              <div className={`mt-1 text-xs ${theme.muted}`}>직접 하부 거래 수익 합산</div>
            </div>
            <div className={`rounded-3xl p-4 ${theme.cardSoft}`}>
              <div className={theme.muted}>{lang.withdrawable}</div>
              <div className="mt-2 text-2xl font-black text-emerald-500">${number(myWithdrawable)}</div>
              <div className={`mt-1 text-xs ${theme.muted}`}>정산 가능 금액</div>
            </div>
            <div className={`rounded-3xl p-4 ${theme.cardSoft}`}>
              <div className={theme.muted}>{lang.pendingSettlement}</div>
              <div className="mt-2 text-2xl font-black text-amber-500">${number(myPendingProfit)}</div>
              <div className={`mt-1 text-xs ${theme.muted}`}>검증/락업 대기</div>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className={`rounded-3xl p-4 ${theme.cardSoft}`}>
              <div className={theme.muted}>{lang.weeklyProfit}</div>
              <div className="mt-2 text-xl font-black">${number(myWeeklyProfit)}</div>
            </div>
            <div className={`rounded-3xl p-4 ${theme.cardSoft}`}>
              <div className={theme.muted}>{lang.monthlyProfit}</div>
              <div className="mt-2 text-xl font-black">${number(myMonthlyProfit)}</div>
            </div>
            <div className={`rounded-3xl p-4 ${theme.cardSoft}`}>
              <div className={theme.muted}>{lang.managedChildren}</div>
              <div className="mt-2 text-xl font-black">{myDirectUsers.length}명</div>
            </div>
          </div>
        </div>

        <div ref={memberTreeSectionRef} className={`${isAdminTab("member") ? "" : "hidden "}grid h-[calc(100vh-350px)] gap-2 overflow-hidden md:grid-cols-[280px_minmax(0,1fr)]`}>
          <div className={`rounded-2xl p-2 ${theme.cardSoft}`}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-lg font-black">{lang.childList}</div>
                <div className={`text-xs ${theme.muted}`}>내 하부 가상 {VIRTUAL_DOWNLINE_MEMBER_COUNT}명 · 단계별 분포 분석</div>
              </div>
              <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-black text-white">{visibleUsers.length}명</span>
            </div>
            <div
              className={
                memberStageFilterExpanded
                  ? "mb-2 flex flex-wrap gap-1.5"
                  : "mb-1 flex max-h-[5.5rem] flex-wrap gap-1.5 overflow-hidden"
              }
            >
              <button
                type="button"
                onClick={() => setMemberStageFilter("전체")}
                className={`shrink-0 rounded-xl border px-2.5 py-1.5 text-center text-xs font-black whitespace-nowrap ${memberStageFilter === "전체" ? theme.main : theme.input}`}
              >
                <div>전체</div>
                <div>{summaryScopeUsers.length}</div>
              </button>
              {downlineStageSummaryEntries.map(([stage, count]) => (
                <button
                  key={stage}
                  type="button"
                  onClick={() => setMemberStageFilter(stage)}
                  className={`shrink-0 rounded-xl border px-2.5 py-1.5 text-center text-xs font-black whitespace-nowrap ${memberStageFilter === stage ? theme.main : theme.input}`}
                >
                  <div>{stage}</div>
                  <div>{count}</div>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setMemberStageFilterExpanded((v) => !v)}
              className={`mb-2 w-full rounded-xl border px-3 py-2 text-center text-[11px] font-black ${theme.input}`}
            >
              {memberStageFilterExpanded ? "▲ 감추기" : "▼ 모든 단계 보기"}
            </button>
            {stageSummaryHealth.mismatch && (
              <div className="mb-2 rounded-xl border border-red-500/40 bg-red-500/10 px-2 py-1 text-[11px] font-black text-red-300">
                단계 집계 점검 필요: 합계 {stageSummaryHealth.total} / 기대 {stageSummaryHealth.expected}
              </div>
            )}
            <label className={`mb-2 flex items-center gap-2 text-[11px] font-black ${theme.muted}`}>
              <input
                type="checkbox"
                checked={showAdminDebug}
                onChange={(e) => setShowAdminDebug(e.target.checked)}
              />
              관리자 디버그 체크
            </label>
            {showAdminDebug && (
              <div className={`mb-2 rounded-xl border p-2 text-[11px] ${theme.input}`}>
                <div>전체 회원 수(엔진): {adminStats.totalUsers}</div>
                <div>레벨별 회원 수 합계: {adminStats.levelCountSum}</div>
                <div>실제 users.length: {engineUsers.length}</div>
                <div>불일치 여부: {adminStats.levelCountMismatch ? "불일치" : "정상"}</div>
                <div>트리 무결성 검사: {treeIntegrity.ok ? "통과" : `실패 (${treeIntegrity.errors.length})`}</div>
                <div>직접 하부(선택): {monitorCurrentUser ? getDirectDownlines(monitorCurrentUser.id, engineUsers).length : 0}</div>
                <div>전체 하부(선택): {monitorCurrentUser ? getAllDownlines(monitorCurrentUser.id, engineUsers).length : 0}</div>
                <div>슈퍼페이지 회원 수: {getUsersByLevel(ADMIN_STAGE_LABEL.SUPER_PAGE, engineUsers).length}</div>
              </div>
            )}

            <div className="mb-2 grid gap-1.5 md:grid-cols-[1fr_auto]">
              <input
                value={adminUserSearch}
                onChange={(e) => setAdminUserSearch(e.target.value)}
                className={`w-full rounded-2xl border px-3 py-2 text-xs font-bold outline-none ${theme.input}`}
                placeholder="닉네임 · ID · 이메일 · 지갑 · 단계(LEVEL 1~10, 본사) 검색"
              />
              <select
                value={memberListSort}
                onChange={(e) => setMemberListSort(e.target.value)}
                className={`rounded-2xl border px-2 py-2 text-xs font-black outline-none ${theme.input}`}
              >
                <option value="joined_desc">가입순 (최신)</option>
                <option value="joined_asc">가입순 (오래된)</option>
                <option value="children_desc">하부 많은순</option>
                <option value="children_asc">하부 적은순</option>
                <option value="trades_desc">거래 많은순</option>
                <option value="trades_asc">거래 적은순</option>
              </select>
            </div>

            <div className="space-y-1.5">
              {pagedVisibleUsers.map((user) => (
                <button
                  key={user.id}
                  onClick={() => selectUser(user)}
                  className={`w-full rounded-xl border p-2.5 text-left transition ${selectedAdminUser?.id === user.id ? theme.main : theme.input}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-black">{user.nickname}</div>
                    <div className={`rounded-full px-2 py-1 text-xs font-black ${user.status === "주의" ? "bg-red-600 text-white" : "bg-emerald-600 text-white"}`}>{user.status}</div>
                  </div>
                  <div className="mt-1 text-xs opacity-80">{user.id} · 상위: {user.parent}</div>
                  <div className="mt-1 text-xs opacity-80">현재 단계: {getEffectiveStage(user)}</div>
                  <div className="mt-1 text-xs opacity-80">배분 {user.childRate}% · 거래 {number(user.trades)}건 · 하부 {user.children}명</div>
                </button>
              ))}
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <button
                onClick={() => setMemberUserPage((prev) => Math.max(1, prev - 1))}
                disabled={memberUserPage <= 1}
                className={`rounded-xl border px-2 py-1 text-[11px] font-black ${memberUserPage <= 1 ? "bg-slate-500 text-white" : theme.input}`}
              >
                이전
              </button>
              <div className={`text-[11px] ${theme.muted}`}>{memberUserPage} / {memberUserTotalPages}</div>
              <button
                onClick={() => setMemberUserPage((prev) => Math.min(memberUserTotalPages, prev + 1))}
                disabled={memberUserPage >= memberUserTotalPages}
                className={`rounded-xl border px-2 py-1 text-[11px] font-black ${memberUserPage >= memberUserTotalPages ? "bg-slate-500 text-white" : theme.input}`}
              >
                다음
              </button>
            </div>
          </div>

          <div className="grid h-full gap-2 overflow-hidden">
            <div className={`rounded-2xl p-2.5 ${theme.cardSoft} overflow-hidden`}>
              <div className="text-lg font-black">{lang.selectedUser}</div>

              {monitorCurrentUser ? (
                <>
                  <div ref={hierarchyPathSectionRef} className="mt-3 rounded-2xl border p-3">
                    <div className="mb-3 rounded-xl border border-white/10 bg-black/15 p-2.5">
                      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                        <div className="text-xs font-black">하부 트리 · 회원 검색</div>
                        <button
                          type="button"
                          onClick={() => setAdminUserSearch(hierarchyQuickSearch)}
                          className={`rounded-lg border px-2 py-1 text-[10px] font-black ${theme.input}`}
                        >
                          이 검색어를 왼쪽 목록에도 적용
                        </button>
                      </div>
                      <input
                        value={hierarchyQuickSearch}
                        onChange={(e) => setHierarchyQuickSearch(e.target.value)}
                        className={`w-full rounded-xl border px-3 py-2 text-xs font-bold outline-none ${theme.input}`}
                        placeholder="ID · 닉네임 · 이메일 · 상위 · 단계(예: LEVEL 1, VD-004)"
                        aria-label="하부 트리 회원 검색"
                      />
                      {hierarchyQuickMatches.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {hierarchyQuickMatches.map((u) => (
                            <button
                              key={u.id}
                              type="button"
                              onClick={() => jumpToTreeMember(u)}
                              className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${theme.input}`}
                            >
                              {u.nickname} · {u.id} · {String(u.stageLabel || "").slice(0, 6)}
                            </button>
                          ))}
                        </div>
                      ) : hierarchyQuickSearch.trim() ? (
                        <div className={`mt-2 text-[11px] ${theme.muted}`}>일치하는 회원이 없습니다.</div>
                      ) : (
                        <div className={`mt-1.5 text-[10px] ${theme.muted}`}>검색 결과에서 회원을 누르면 트리 경로가 해당 회원으로 이동합니다.</div>
                      )}
                    </div>
                    <div className="mb-2 flex items-center justify-between">
                      <div className="text-sm font-black">회원 단계 지정</div>
                      <div className="flex items-center gap-1 text-xs">
                        <span className={`rounded-full border px-2 py-0.5 font-black ${theme.main}`}>
                          선택 회원: {monitorCurrentUser.nickname} ({getEffectiveStage(monitorCurrentUser)})
                        </span>
                        <span className={`rounded-full border px-2 py-0.5 font-black ${theme.input}`}>직계 하부 {monitorDirectChildrenCount}명</span>
                        <span className={`rounded-full border px-2 py-0.5 font-black ${theme.input}`}>전체 하위 {monitorDescendantCount}명</span>
                      </div>
                    </div>
                    <div className="mb-2 grid gap-1.5 md:grid-cols-[1fr_auto_auto]">
                      <select
                        value={stageSelectionValue || getEffectiveStage(monitorCurrentUser)}
                        onChange={(e) => setStageSelectionValue(e.target.value)}
                        disabled={isSelfTargetMember}
                        className={`rounded-xl border px-2.5 py-1.5 text-sm font-black outline-none ${theme.input}`}
                      >
                        {ADMIN_STAGE_OPTIONS.map((stageName) => (
                          <option key={stageName} value={stageName}>
                            {stageName}
                          </option>
                        ))}
                      </select>
                      <button type="button" onClick={requestApplyStage} disabled={isSelfTargetMember} className={`rounded-xl px-3 py-1.5 text-sm font-black ${isSelfTargetMember ? "bg-slate-500 text-white" : theme.main}`}>
                        단계 적용
                      </button>
                      <button type="button" onClick={saveSelectedStage} className={`rounded-xl border px-3 py-1.5 text-sm font-black ${isSelfTargetMember ? "bg-slate-500 text-white" : theme.input}`} disabled={isSelfTargetMember}>
                        저장/확인
                      </button>
                    </div>
                    <div className="mb-2 flex flex-wrap items-stretch gap-2">
                      <button
                        type="button"
                        onClick={() => void applyMonitorAdminAssignment(true)}
                        disabled={
                          isSelfTargetMember
                          || !(isSuperAdmin || String(monitorCurrentUser.id || "").startsWith("VD-"))
                          || isAdminAssignedUser(monitorCurrentUser)
                        }
                        className={`rounded-xl px-3 py-1.5 text-xs font-black ${
                          isSelfTargetMember || isAdminAssignedUser(monitorCurrentUser) ? "bg-slate-600 text-white" : "bg-indigo-600 text-white"
                        }`}
                      >
                        관리자 지정 ON
                      </button>
                      <button
                        type="button"
                        onClick={() => void applyMonitorAdminAssignment(false)}
                        disabled={
                          isSelfTargetMember
                          || !(isSuperAdmin || String(monitorCurrentUser.id || "").startsWith("VD-"))
                          || !isAdminAssignedUser(monitorCurrentUser)
                        }
                        className={`rounded-xl border px-3 py-1.5 text-xs font-black ${theme.input}`}
                      >
                        관리자 해제 OFF
                      </button>
                      <div className={`min-w-[160px] flex-1 rounded-xl border px-2 py-1.5 text-[10px] leading-snug ${theme.muted}`}>
                        <span className="font-black text-white/90">안내:</span> 실회원 저장은 슈퍼관리자만 가능합니다. <span className="text-amber-200/90">VD- 가상 회원</span>은 버튼 클릭 시 즉시 로컬 반영됩니다.
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      {monitorPath.map((userId, index) => {
                        const nodeUser = memberUsers.find((u) => String(u.id) === String(userId));
                        return (
                          <button
                            key={`${userId}-${index}`}
                            onClick={() => moveToHierarchyDepth(index)}
                            className={`rounded-full border px-2 py-1 text-[11px] font-black ${index === monitorPath.length - 1 ? theme.main : theme.input}`}
                          >
                            {nodeUser?.nickname || userId}
                          </button>
                        );
                      })}
                      {monitorPath.length > 1 && (
                        <button
                          onClick={() => moveToHierarchyDepth(monitorPath.length - 2)}
                          className={`rounded-full border px-2 py-1 text-[11px] font-black ${theme.input}`}
                        >
                          한 단계 위로
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="mt-2 grid gap-2 text-sm md:grid-cols-2">
                    <DetailBox label="닉네임" value={monitorCurrentUser?.nickname || "-"} theme={theme} />
                    <DetailBox label="회원 ID" value={monitorCurrentUser?.id || "-"} theme={theme} />
                    <DetailBox label="이메일" value={monitorCurrentUser?.email || "-"} theme={theme} />
                    <DetailBox label="지갑" value={monitorCurrentUser?.wallet || "-"} theme={theme} />
                    <DetailBox label="상위" value={getEffectiveParent(monitorCurrentUser)} theme={theme} />
                    <DetailBox label="가입일" value={monitorCurrentUser?.joined || "-"} theme={theme} />
                    <DetailBox label="현재 단계" value={getEffectiveStage(monitorCurrentUser)} theme={theme} />
                    <DetailBox label="관리자 지정" value={isAdminAssignedUser(monitorCurrentUser) ? "지정됨" : "미지정"} theme={theme} />
                    <DetailBox label="누적 거래" value={`${number(monitorCurrentUser?.trades || 0)}건`} theme={theme} />
                    <DetailBox label="누적 거래액" value={`$${number(monitorCurrentUser?.volume || 0)}`} theme={theme} />
                  </div>

                  {isSelfTargetMember && (
                    <div className={`mt-1 rounded-xl border px-3 py-2 text-xs ${theme.input}`}>
                      현재 선택한 회원은 본인 계정입니다. 본인 상태는 변경할 수 없고 하위 회원만 변경 가능합니다.
                    </div>
                  )}
                  {stageConfirmOpen && monitorCurrentUser ? (
                    <div className="mt-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3">
                      <div className="text-sm font-black">단계 변경 확인</div>
                      <div className="mt-2 text-sm leading-relaxed">
                        <span className="font-bold">{monitorCurrentUser.nickname}</span>을(를){" "}
                        <span className="font-black text-amber-200">{adminStageDisplayName(stageConfirmFromStage)}</span>에서{" "}
                        <span className="font-black text-amber-200">{adminStageDisplayName(stageConfirmTarget)}</span>
                        로 변경하시겠습니까?
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setStageConfirmOpen(false);
                            setStageConfirmFromStage("");
                            setStageConfirmTarget("");
                          }}
                          className={`rounded-xl border px-4 py-2 text-sm font-black ${theme.input}`}
                        >
                          취소
                        </button>
                        <button type="button" onClick={() => void confirmApplySelectedStage()} className={`rounded-xl px-4 py-2 text-sm font-black ${theme.main}`}>
                          확인
                        </button>
                      </div>
                    </div>
                  ) : null}
                  {!!pendingStageValue && (
                    <div className="mt-1 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
                      변경 대기: {pendingStageFrom || getEffectiveStage(monitorCurrentUser)} {"->"} {pendingStageValue}
                    </div>
                  )}

                  <div className="mt-2 grid gap-2 md:grid-cols-[1fr_auto]">
                    <input
                      value={downlineTargetUserId}
                      onChange={(e) => setDownlineTargetUserId(e.target.value.trim().toUpperCase())}
                      disabled={isSelfTargetMember}
                      placeholder="하위 유저 ID 입력 (예: TG-MEMBER-015)"
                      className={`rounded-2xl border px-3 py-2 text-sm font-bold outline-none ${theme.input}`}
                    />
                    <button onClick={assignDownlineUser} disabled={isSelfTargetMember} className={`rounded-2xl border px-4 py-2 text-sm font-black ${isSelfTargetMember ? "bg-slate-500 text-white" : theme.input}`}>
                      하위 유저 지정
                    </button>
                  </div>

                  <div className="mt-2 grid gap-1.5 md:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (!selectedChildren.length) {
                          notify("등록된 하부가 없습니다.");
                          return;
                        }
                        directDownlineListRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                      }}
                      className={`rounded-xl px-3 py-2.5 text-sm font-black ${theme.main}`}
                    >
                      하부 {selectedChildren.length}명 보기
                    </button>
                    <button
                      onClick={() => notify(`${monitorCurrentUser.nickname} 닉네임/정보 수정 화면`)}
                      className={`rounded-xl border px-3 py-2.5 text-sm font-black ${theme.input}`}
                    >
                      정보 수정
                    </button>
                  </div>
                  {selectedChildren.length === 0 && (
                    <div className={`mt-1 rounded-xl border px-3 py-2 text-xs ${theme.input}`}>
                      등록된 하부가 없습니다.
                    </div>
                  )}
                  <div className="mt-2 grid gap-2 md:grid-cols-4">
                    <div className={`rounded-xl border px-3 py-2 text-xs ${theme.input}`}>현재 단계 <b>{getEffectiveStage(monitorCurrentUser)}</b></div>
                    <div className={`rounded-xl border px-3 py-2 text-xs ${theme.input}`}>직계 하부 <b>{monitorDirectChildrenCount}명</b></div>
                    <div className={`rounded-xl border px-3 py-2 text-xs ${theme.input}`}>전체 하위 <b>{monitorDescendantCount}명</b></div>
                    <div className={`rounded-xl border px-3 py-2 text-xs ${theme.input}`}>관리자 지정 <b>{isAdminAssignedUser(monitorCurrentUser) ? "ON" : "OFF"}</b></div>
                  </div>

                  {selectedChildren.length > 0 && (
                    <div ref={directDownlineListRef} className="mt-2 rounded-2xl bg-black/10 p-2.5">
                      <div className="mb-3 flex items-center justify-between">
                        <div className="font-black">{monitorCurrentUser.nickname}의 직접 하부</div>
                        <div className={`text-xs ${theme.muted}`}>행 클릭으로 선택 · 행에서 배분율 바로 수정 · 선택 항목만 부분 일괄 적용</div>
                      </div>
                      {selectedChildUser && (
                        <div className={`mb-3 rounded-xl border px-3 py-2 text-xs ${theme.input}`}>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-black">선택 하부</span>
                            <span>{selectedChildUser.nickname} ({selectedChildUser.id})</span>
                            <input
                              value={selectedChildRateInput}
                              onChange={(e) => setSelectedChildRateInput(e.target.value)}
                              disabled={!isSuperAdmin}
                              className={`w-20 rounded-lg border px-2 py-1 text-[11px] font-bold outline-none ${theme.input}`}
                              placeholder="%"
                              aria-label="선택 하부 배분율"
                            />
                            <span className="text-[11px]">%</span>
                            <button
                              type="button"
                              onClick={saveSelectedChildRate}
                              disabled={!isSuperAdmin}
                              className={`rounded-lg border px-2 py-1 text-[11px] font-black ${theme.input}`}
                            >
                              배분율 저장
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedChildUser(null)}
                              className={`rounded-lg border px-2 py-1 text-[11px] font-black ${theme.input}`}
                            >
                              선택 해제
                            </button>
                          </div>
                        </div>
                      )}
                      <div className="mb-3 grid gap-2 md:grid-cols-[1fr_auto_auto]">
                        <input
                          value={bulkChildRateInput}
                          onChange={(e) => setBulkChildRateInput(e.target.value)}
                          className={`rounded-2xl border px-3 py-2 text-xs font-bold outline-none ${theme.input}`}
                          placeholder="선택 하부 일괄 배분율(%)"
                        />
                        <button onClick={applyBulkChildRate} className={`rounded-2xl border px-3 py-2 text-xs font-black ${theme.input}`}>
                          선택 하부 일괄 저장
                        </button>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setSelectedChildIds(selectedChildren.map((child) => child.id))}
                            className={`rounded-2xl border px-3 py-2 text-xs font-black ${theme.input}`}
                          >
                            전체선택
                          </button>
                          <button
                            onClick={() => setSelectedChildIds([])}
                            className={`rounded-2xl border px-3 py-2 text-xs font-black ${theme.input}`}
                          >
                            전체해제
                          </button>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        {pagedSelectedChildren.map((child) => (
                          <div
                            key={child.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => setSelectedChildUser(child)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setSelectedChildUser(child);
                              }
                            }}
                            className={`w-full cursor-pointer rounded-2xl border px-3 py-2 text-left text-xs transition ${theme.input} ${
                              selectedChildUser?.id === child.id ? "ring-2 ring-indigo-500 ring-offset-2 ring-offset-transparent" : ""
                            }`}
                          >
                            <div className="grid items-center gap-2 md:grid-cols-[auto_1.2fr_1fr_1fr_auto_auto_auto]">
                              <label className="inline-flex items-center">
                                <input
                                  type="checkbox"
                                  checked={selectedChildIds.includes(child.id)}
                                  onChange={(e) => {
                                    e.stopPropagation();
                                    toggleChildSelection(child.id);
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </label>
                              <div className="pointer-events-none font-black">{child.nickname} ({child.id})</div>
                              <div className="opacity-80">가입일 {child.joined}</div>
                              <div className="opacity-80">거래 {number(child.trades)}건</div>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  drillDownToUser(child);
                                }}
                                className={`rounded-full border px-2 py-1 text-[10px] font-black ${theme.input}`}
                              >
                                하부 {child.children}명 열기
                              </button>
                              <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                                <input
                                  value={childInlineRates[child.id] ?? String(appliedRate(child))}
                                  onChange={(e) => setInlineChildRate(child.id, e.target.value)}
                                  className={`w-20 rounded-xl border px-2 py-1 text-[11px] font-bold outline-none ${theme.input}`}
                                  placeholder="배분율"
                                />
                                <span className="text-[11px]">%</span>
                                <button
                                  type="button"
                                  onClick={() => saveInlineChildRate(child)}
                                  className={`rounded-xl border px-2 py-1 text-[11px] font-black ${theme.input}`}
                                >
                                  저장
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <button
                          onClick={() => setMemberChildPage((prev) => Math.max(1, prev - 1))}
                          disabled={memberChildPage <= 1}
                          className={`rounded-xl border px-2 py-1 text-[11px] font-black ${memberChildPage <= 1 ? "bg-slate-500 text-white" : theme.input}`}
                        >
                          이전
                        </button>
                        <div className={`text-[11px] ${theme.muted}`}>{memberChildPage} / {memberChildTotalPages}</div>
                        <button
                          onClick={() => setMemberChildPage((prev) => Math.min(memberChildTotalPages, prev + 1))}
                          disabled={memberChildPage >= memberChildTotalPages}
                          className={`rounded-xl border px-2 py-1 text-[11px] font-black ${memberChildPage >= memberChildTotalPages ? "bg-slate-500 text-white" : theme.input}`}
                        >
                          다음
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className={`mt-3 text-sm ${theme.subtext}`}>왼쪽에서 하부 회원을 선택하세요.</div>
              )}
            </div>

            <div className="hidden">
              <Field label="대상 회원 ID / 지갑 / 이메일" theme={theme}>
                <input value={adminMember} onChange={(e) => setAdminMember(e.target.value)} className={`rounded-2xl border px-4 py-3 font-bold outline-none ${theme.input}`} placeholder="예: TG-MEMBER-001" />
              </Field>
              <Field label="상위 회원 / 추천인 / 레벨 관리자 ID" theme={theme}>
                <input value={adminParent} onChange={(e) => setAdminParent(e.target.value)} className={`rounded-2xl border px-4 py-3 font-bold outline-none ${theme.input}`} placeholder="예: TG777" />
              </Field>
              <Field label="상위자가 받은 배분율 (%)" theme={theme}>
                <input value={adminReceivedRate} onChange={(e) => setAdminReceivedRate(e.target.value)} className={`rounded-2xl border px-4 py-3 font-bold outline-none ${theme.input}`} placeholder="예: 50" />
              </Field>
              <Field label="하위에게 내려줄 배분율 (%)" theme={theme}>
                <input value={adminRate} onChange={(e) => setAdminRate(e.target.value)} className={`rounded-2xl border px-4 py-3 font-bold outline-none ${theme.input}`} placeholder="예: 45" />
              </Field>
            </div>
          </div>
        </div>

        <div className={`${isAdminTab("memberOps") ? "" : "hidden "}mt-5 grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]`}>
          <div className={`rounded-3xl border p-4 ${theme.card}`}>
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-black">회원 운영 대상</div>
              <span className={`rounded-full px-2 py-1 text-[11px] font-black ${theme.input}`}>{authUsers.length}명</span>
            </div>
            <div className="max-h-[560px] space-y-2 overflow-y-auto pr-1">
              {authUsers.map((user) => (
                <button
                  key={user.id}
                  onClick={() => setSelectedOpsUserId(user.id)}
                  className={`w-full rounded-2xl border p-3 text-left text-xs ${String(selectedOpsUser?.id) === String(user.id) ? theme.main : theme.input}`}
                >
                  <div className="font-black">{user.nickname}</div>
                  <div className={`mt-1 ${theme.muted}`}>{user.id}</div>
                  <div className={`mt-1 ${theme.muted}`}>{user.role}</div>
                </button>
              ))}
            </div>
          </div>

          <div className={`rounded-3xl border p-4 ${theme.card}`}>
            {selectedOpsUser ? (
              <>
                <div className="grid gap-2 md:grid-cols-2">
                  <DetailBox label="닉네임" value={selectedOpsUser.nickname} theme={theme} />
                  <DetailBox label="회원 ID" value={selectedOpsUser.id} theme={theme} />
                  <DetailBox label="이메일" value={selectedOpsUser.email} theme={theme} />
                  <DetailBox label="현재 권한" value={selectedOpsUser.role} theme={theme} />
                  <DetailBox label="현재 단계" value={selectedOpsUser.stage_label || "미지정"} theme={theme} />
                  <DetailBox label="상위 참조" value={selectedOpsUser.parent_user_ref || "미지정"} theme={theme} />
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto]">
                  <select
                    value={selectedOpsUser.role}
                    onChange={(e) => updateAuthRole(selectedOpsUser.id, e.target.value)}
                    disabled={!isSuperAdmin}
                    className={`rounded-2xl border px-3 py-2 text-sm font-black outline-none ${theme.input}`}
                  >
                    <option>회원</option>
                    <option>본사 관계자</option>
                    <option>본사 관리자</option>
                    <option>슈퍼페이지 관리자</option>
                  </select>
                  <button
                    onClick={() => notify(`${selectedOpsUser.nickname} 정보 수정 화면`)}
                    className={`rounded-2xl border px-4 py-2 text-sm font-black ${theme.input}`}
                  >
                    정보 수정
                  </button>
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-3">
                  <input
                    value={selectedOpsUser.stage_label || ""}
                    onChange={(e) =>
                      setAuthUsers((prev) =>
                        prev.map((user) => (String(user.id) === String(selectedOpsUser.id) ? { ...user, stage_label: e.target.value } : user))
                      )
                    }
                    placeholder="현재 단계 (예: LEVEL 1)"
                    className={`rounded-2xl border px-3 py-2 text-sm font-bold outline-none ${theme.input}`}
                  />
                  <input
                    value={selectedOpsUser.parent_user_ref || ""}
                    onChange={(e) =>
                      setAuthUsers((prev) =>
                        prev.map((user) => (String(user.id) === String(selectedOpsUser.id) ? { ...user, parent_user_ref: e.target.value } : user))
                      )
                    }
                    placeholder="상위 관리자/회원 ID"
                    className={`rounded-2xl border px-3 py-2 text-sm font-bold outline-none ${theme.input}`}
                  />
                  <label className={`flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-black ${theme.input}`}>
                    <input
                      type="checkbox"
                      checked={Boolean(selectedOpsUser.admin_assigned)}
                      onChange={(e) =>
                        setAuthUsers((prev) =>
                          prev.map((user) =>
                            String(user.id) === String(selectedOpsUser.id) ? { ...user, admin_assigned: e.target.checked } : user
                          )
                        )
                      }
                    />
                    관리자 지정
                  </label>
                </div>
                <button
                  onClick={async () => {
                    const ok = await updateAuthProfile(selectedOpsUser.id, {
                      stageLabel: selectedOpsUser.stage_label || "",
                      parentUserRef: selectedOpsUser.parent_user_ref || "",
                      adminAssigned: Boolean(selectedOpsUser.admin_assigned),
                    });
                    if (ok) notify("회원 단계/관리자 지정 정보가 저장되었습니다.");
                  }}
                  className={`mt-2 rounded-2xl px-4 py-2 text-sm font-black ${theme.main}`}
                >
                  단계/관리자 지정 저장
                </button>
                <div className="mt-3 rounded-2xl border p-3">
                  <div className="mb-2 text-xs font-black">판매자 입금자명 공지</div>
                  <textarea
                    value={sellerDepositNotice}
                    onChange={(e) => setSellerDepositNotice(e.target.value)}
                    className={`min-h-20 w-full rounded-xl border px-3 py-2 text-xs font-bold outline-none ${theme.input}`}
                  />
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => {
                        appendAdminAction?.("판매자 입금자명 확인 공지 수정");
                        notify("판매자 공지 문구가 업데이트되었습니다.");
                      }}
                      className={`rounded-xl px-3 py-2 text-xs font-black ${theme.main}`}
                    >
                      공지 저장
                    </button>
                    <button
                      onClick={() => {
                        setAdminViewTab("ops");
                        notify("감사/복구 탭으로 이동합니다.");
                      }}
                      className={`rounded-xl border px-3 py-2 text-xs font-black ${theme.input}`}
                    >
                      로그 보기
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className={`text-sm ${theme.subtext}`}>왼쪽에서 운영 대상을 선택하세요.</div>
            )}
          </div>
        </div>

        <div className={`${isAdminTab("security") ? "" : "hidden "}mt-5 grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]`}>
          <div className={`rounded-3xl border p-4 ${theme.card}`}>
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-black">{lang.riskMonitor}</div>
              <span className={`rounded-full px-2 py-1 text-[11px] font-black ${theme.input}`}>{securityUsers.length}명</span>
            </div>
            <select
              value={securityFilter}
              onChange={(e) => setSecurityFilter(e.target.value)}
              className={`mb-3 w-full rounded-2xl border px-3 py-2 text-xs font-black outline-none ${theme.input}`}
            >
              <option>전체</option>
              <option>주의</option>
              <option>신고</option>
              <option>블랙</option>
            </select>
            <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
              {securityUsers.map((user) => {
                const rowSel = String(selectedSecurityUser?.id) === String(user.id);
                const subCls = rowSel ? theme.mutedOnMain ?? theme.muted : theme.muted;
                return (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => setSelectedSecurityUserId(user.id)}
                    className={`w-full rounded-2xl border p-3 text-left text-xs ${rowSel ? theme.main : theme.input}`}
                  >
                    <div className="font-black">{user.nickname}</div>
                    <div className={`mt-1 ${subCls}`}>
                      {user.id} · 위험 {user.riskScore}
                    </div>
                    <div className={`mt-1 ${subCls}`}>
                      신고 {user.reports}건 · 블랙 {user.blacklist ? "Y" : "N"}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className={`rounded-3xl border p-4 ${theme.card}`}>
            {selectedSecurityUser ? (
              <>
                <div className="grid gap-2 md:grid-cols-3">
                  <Admin title="위험 점수" value={selectedSecurityUser.riskScore} sub={selectedSecurityUser.blacklist ? "블랙리스트" : "모니터링"} theme={theme} />
                  <Admin title="신고 건수" value={selectedSecurityUser.reports} sub="누적 신고" theme={theme} />
                  <Admin title="최근 접속" value={selectedSecurityUser.lastLogin} sub={selectedSecurityUser.country} theme={theme} />
                </div>
                <div className="mt-3 grid gap-2 text-xs md:grid-cols-2">
                  <DetailBox label="회원" value={`${selectedSecurityUser.nickname} (${selectedSecurityUser.id})`} theme={theme} />
                  <DetailBox label="디바이스" value={selectedSecurityUser.device} theme={theme} />
                  <DetailBox label="IP" value={selectedSecurityUser.ip} theme={theme} />
                  <DetailBox label="전화번호" value={selectedSecurityUser.phone} theme={theme} />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button onClick={() => notify(`${selectedSecurityUser.nickname} 거래 일시정지`)} className="rounded-xl bg-amber-500 px-3 py-2 text-xs font-black text-white">거래정지</button>
                  <button onClick={() => notify(`${selectedSecurityUser.nickname} 블랙리스트 등록`)} className="rounded-xl bg-red-600 px-3 py-2 text-xs font-black text-white">블랙등록</button>
                  <button onClick={() => notify(`${selectedSecurityUser.nickname} IP 추적 조회`)} className={`rounded-xl border px-3 py-2 text-xs font-black ${theme.input}`}>IP분석</button>
                  <button onClick={() => notify(`${selectedSecurityUser.nickname} 다중계정 분석`)} className={`rounded-xl border px-3 py-2 text-xs font-black ${theme.input}`}>다중계정</button>
                </div>
                <Field label="차단 사유 메모" theme={theme}>
                  <textarea
                    value={blockReason}
                    onChange={(e) => setBlockReason(e.target.value)}
                    className={`min-h-20 rounded-2xl border px-3 py-2 text-sm font-bold outline-none ${theme.input}`}
                  />
                </Field>
              </>
            ) : (
              <div className={`text-sm ${theme.subtext}`}>왼쪽에서 보안 모니터링 유저를 선택하세요.</div>
            )}
          </div>
        </div>

        <div ref={rateValidationSectionRef} className={`${false && isAdminTab("memberOps") ? "" : "hidden "}mt-5 rounded-3xl p-4 text-sm ${invalidRate ? "bg-red-600 text-white" : theme.cardSoft}`}>
          <div className="flex justify-between py-1"><span>대상 회원</span><b>{adminMember || "미입력"}</b></div>
          <div className="flex justify-between py-1"><span>상위 회원</span><b>{adminParent || "미입력"}</b></div>
          <div className="flex justify-between py-1"><span>상위자 받은 배분율</span><b>{received}%</b></div>
          <div className="flex justify-between py-1"><span>하위에게 내려줄 배분율</span><b>{childRate}%</b></div>
          <div className="flex justify-between py-1"><span>상위자 차액 수익</span><b>{invalidRate ? "오류" : `${marginRate}%`}</b></div>
          {invalidRate && <div className="mt-2 font-black">하위 배분율은 상위자가 받은 배분율보다 클 수 없습니다.</div>}
        </div>

        <div className={`${false && isAdminTab("memberOps") ? "" : "hidden "}mt-5 rounded-3xl p-4 ${theme.cardSoft}`}>
          <div className="text-sm font-black">하부트리 예시</div>
          <div className="mt-3 grid gap-2 text-sm">
            <div className="rounded-2xl bg-black/10 p-3">본사: 전체 수수료 100% 권한</div>
            <div className="rounded-2xl bg-black/10 p-3">└ {adminParent || "상위 회원"}: 본사로부터 {received}% 배분권 보유</div>
            <div className="rounded-2xl bg-black/10 p-3">&nbsp;&nbsp;&nbsp;└ {adminMember || "하위 회원"}: {childRate}% 배분율 적용</div>
            <div className="rounded-2xl bg-black/10 p-3">상위자 수익: {received}% - {childRate}% = {invalidRate ? "설정 오류" : `${marginRate}%`}</div>
          </div>
        </div>

        <div className={isAdminTab("memberOps") ? "" : "hidden"}>
          <Field label="관리 메모" theme={theme}>
            <textarea value={adminMemo} onChange={(e) => setAdminMemo(e.target.value)} className={`min-h-24 rounded-2xl border px-4 py-3 font-bold outline-none ${theme.input}`} placeholder="관리자 메모" />
          </Field>
        </div>

        <div className={`${false && isAdminTab("security") ? "" : "hidden "}mt-5 rounded-3xl border p-5 ${theme.card}`}>
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-xl font-black">{lang.securityCenter}</div>
              <div className={`text-sm ${theme.subtext}`}>IP · 기기 · 신고 · 블랙리스트 · 다중계정 위험 분석</div>
            </div>

            <select
              value={securityFilter}
              onChange={(e) => setSecurityFilter(e.target.value)}
              className={`rounded-2xl border px-4 py-3 text-sm font-black outline-none ${theme.input}`}
            >
              <option>전체</option>
              <option>주의</option>
              <option>신고</option>
              <option>블랙</option>
            </select>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <Admin title="전체 회원" value="100" sub="가상 회원 데이터" theme={theme} />
            <Admin title="위험 감지" value={securityUsers.filter((u) => u.riskScore >= 70).length} sub="위험점수 70 이상" theme={theme} />
            <Admin title="사고 신고" value={securityUsers.filter((u) => u.reports > 0).length} sub="신고 접수 회원" theme={theme} />
            <Admin title="블랙리스트" value={securityUsers.filter((u) => u.blacklist).length} sub="차단된 계정" theme={theme} />
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
            <div className={`rounded-3xl p-4 ${theme.cardSoft}`}>
              <div className="mb-3 flex items-center justify-between">
                <div className="font-black">{lang.riskMonitor}</div>
                <div className={`text-xs ${theme.muted}`}>실시간 감시 대상</div>
              </div>

              <div className="space-y-2">
                {securityUsers.map((user) => (
                  <div key={user.id} className={`rounded-2xl border p-3 ${theme.input}`}>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-black">{user.nickname}</div>
                        <div className="mt-1 text-xs opacity-70">{user.id} · {user.country} · {user.device}</div>
                      </div>

                      <div className={`rounded-full px-3 py-1 text-xs font-black ${user.blacklist ? "bg-red-600 text-white" : user.riskScore >= 70 ? "bg-amber-500 text-white" : "bg-emerald-600 text-white"}`}>
                        위험 {user.riskScore}
                      </div>
                    </div>

                    <div className="mt-3 grid gap-2 text-xs md:grid-cols-2">
                      <div>IP: <b>{user.ip}</b></div>
                      <div>전화번호: <b>{user.phone}</b></div>
                      <div>신고건수: <b>{user.reports}건</b></div>
                      <div>최근접속: <b>{user.lastLogin}</b></div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button onClick={() => notify(`${user.nickname} 거래 일시정지`)} className="rounded-xl bg-amber-500 px-3 py-2 text-xs font-black text-white">거래정지</button>
                      <button onClick={() => notify(`${user.nickname} 블랙리스트 등록`)} className="rounded-xl bg-red-600 px-3 py-2 text-xs font-black text-white">블랙등록</button>
                      <button onClick={() => notify(`${user.nickname} IP 추적 조회`)} className={`rounded-xl border px-3 py-2 text-xs font-black ${theme.input}`}>IP분석</button>
                      <button onClick={() => notify(`${user.nickname} 다중계정 분석`)} className={`rounded-xl border px-3 py-2 text-xs font-black ${theme.input}`}>다중계정</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className={`rounded-3xl p-4 ${theme.cardSoft}`}>
              <div className="font-black">{lang.blockPolicy}</div>

              <div className="mt-4 space-y-3 text-sm">
                <div className="rounded-2xl bg-black/10 p-3">✔ 동일 IP 다중계정 감지</div>
                <div className="rounded-2xl bg-black/10 p-3">✔ VPN / 해외 우회 접속 탐지</div>
                <div className="rounded-2xl bg-black/10 p-3">✔ 반복 신고 회원 자동 감시</div>
                <div className="rounded-2xl bg-black/10 p-3">✔ 블랙 지갑 주소 공유</div>
                <div className="rounded-2xl bg-black/10 p-3">✔ 위험 거래 자동 알림</div>
                <div className="rounded-2xl bg-black/10 p-3">✔ 관리자 승인 전 대량거래 제한</div>
                <div className="rounded-2xl bg-black/10 p-3">✔ 기기 변경 반복 회원 추적</div>
              </div>

              <Field label="차단 사유 메모" theme={theme}>
                <textarea
                  value={blockReason}
                  onChange={(e) => setBlockReason(e.target.value)}
                  className={`min-h-28 rounded-2xl border px-4 py-3 font-bold outline-none ${theme.input}`}
                />
              </Field>

              <button
                onClick={() => notify(`전체 보안 정책 저장 완료`)}
                className={`mt-4 w-full rounded-2xl px-5 py-4 font-black ${theme.main}`}
              >
                보안 정책 저장
              </button>
            </div>
          </div>
        </div>

        <div className={`${false && isAdminTab("memberOps") ? "" : "hidden "}mt-5 rounded-3xl border p-5 ${theme.card}`}>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-xl font-black">실계정 권한 관리</div>
              <div className={`text-sm ${theme.subtext}`}>실전형 이메일 계정의 관리자 권한을 통제합니다.</div>
            </div>
            <span className="rounded-full bg-indigo-600 px-3 py-1 text-xs font-black text-white">{authUsers.length}명</span>
          </div>
          <div className="space-y-2">
            {authUsers.map((user) => (
              <div key={user.id} className={`flex flex-col gap-2 rounded-2xl border p-3 md:flex-row md:items-center md:justify-between ${theme.input}`}>
                <div className="text-sm">
                  <div className="font-black">{user.nickname} ({user.id})</div>
                  <div className={theme.muted}>{user.email}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-black/20 px-3 py-1 text-xs font-black">{user.role}</span>
                  <select
                    value={user.role}
                    onChange={(e) => updateAuthRole(user.id, e.target.value)}
                    disabled={!isSuperAdmin}
                    className={`rounded-xl border px-3 py-2 text-xs font-black outline-none ${theme.input}`}
                  >
                    <option>회원</option>
                    <option>본사 관계자</option>
                    <option>본사 관리자</option>
                    <option>슈퍼페이지 관리자</option>
                  </select>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={`${false && isAdminTab("memberOps") ? "" : "hidden "}mt-5 rounded-3xl border p-5 ${theme.card}`}>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-xl font-black">판매자 입금자명 확인 공지 관리</div>
              <div className={`text-sm ${theme.subtext}`}>판매자에게 노출되는 입금자명 일치 안내 문구를 운영자가 직접 설정합니다.</div>
            </div>
            <span className="rounded-full bg-amber-500 px-3 py-1 text-xs font-black text-white">필수 공지</span>
          </div>
          <textarea
            value={sellerDepositNotice}
            onChange={(e) => setSellerDepositNotice(e.target.value)}
            className={`min-h-24 w-full rounded-2xl border px-4 py-3 text-sm font-bold outline-none ${theme.input}`}
          />
          <button
            onClick={() => {
              appendAdminAction?.("판매자 입금자명 확인 공지 수정");
              notify("판매자 공지 문구가 업데이트되었습니다.");
            }}
            className={`mt-3 rounded-2xl px-4 py-3 text-sm font-black ${theme.main}`}
          >
            공지 저장
          </button>
        </div>

        <div className={`${isAdminTab("kyc") ? "" : "hidden "}mt-5 rounded-3xl border p-5 ${theme.card}`}>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-xl font-black">회사 KYC 승인 센터</div>
              <div className={`text-sm ${theme.subtext}`}>KYC는 회사만 승인하며, 문서는 분쟁 대응 목적으로 비공개 보관됩니다.</div>
            </div>
            <span className="rounded-full bg-violet-600 px-3 py-1 text-xs font-black text-white">{buyerKyc.companyApprovalStatus}</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Box label="실명" value={buyerKyc.realName || "미입력"} theme={theme} />
            <Box label="서류 제출 여부" value={buyerKyc.idImageUploaded && buyerKyc.bankAccountUploaded ? "제출됨" : "미제출"} theme={theme} />
          </div>
          <div className="mt-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-6">
            KYC 문서는 회사 내부 보관 정책에 따라 접근 통제되며, 법적 분쟁/수사 협조를 제외하고 누구에게도 공개되지 않습니다.
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={async () => {
                try {
                  const data = await apiClient.request(`/api/admin/kyc/${buyerKyc.userId || currentAdminActorId}/review`, {
                    method: "POST",
                    auth: true,
                    body: JSON.stringify({ approve: true }),
                  });
                  if (data?.profile) setBuyerKyc(data.profile);
                  appendAdminAction?.("KYC 회사 승인 처리");
                  notify("회사 KYC 승인 완료");
                } catch (error) {
                  notify(error.message || "KYC 승인 처리에 실패했습니다.");
                }
              }}
              className={`rounded-2xl px-4 py-3 text-sm font-black ${theme.main}`}
            >
              회사 승인
            </button>
            <button
              onClick={async () => {
                try {
                  const data = await apiClient.request(`/api/admin/kyc/${buyerKyc.userId || currentAdminActorId}/review`, {
                    method: "POST",
                    auth: true,
                    body: JSON.stringify({ approve: false }),
                  });
                  if (data?.profile) setBuyerKyc(data.profile);
                  appendAdminAction?.("KYC 회사 반려 처리");
                  notify("KYC 반려 처리 완료");
                } catch (error) {
                  notify(error.message || "KYC 반려 처리에 실패했습니다.");
                }
              }}
              className="rounded-2xl bg-red-600 px-4 py-3 text-sm font-black text-white"
            >
              반려
            </button>
          </div>
          <div className="mt-3 rounded-2xl border p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-black">KYC 문서 열람 (사유 필수)</div>
              <button onClick={loadKycDocuments} className={`rounded-xl border px-3 py-2 text-xs font-black ${theme.input}`}>
                문서 목록 새로고침
              </button>
            </div>
            <input
              value={kycViewReason}
              onChange={(e) => setKycViewReason(e.target.value)}
              placeholder="열람 사유 입력 (5자 이상)"
              className={`w-full rounded-xl border px-3 py-2 text-xs font-bold outline-none ${theme.input}`}
            />
            <div className="mt-2 space-y-2">
              {kycDocs.length ? (
                kycDocs.map((doc) => (
                  <div key={doc.id} className={`rounded-xl border p-2 text-xs ${theme.input}`}>
                    <div className="font-black">{doc.file_name}</div>
                    <div className={theme.muted}>{doc.doc_type} · {doc.mime_type} · {number((doc.size_bytes || 0) / 1024)}KB</div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      <button
                        onClick={() => createKycViewRequest(doc.id)}
                        className={`rounded-lg border px-2 py-1 text-xs font-black ${theme.input}`}
                      >
                        열람요청 생성
                      </button>
                      <button
                        onClick={() => loadKycViewRequests(doc.id)}
                        className={`rounded-lg border px-2 py-1 text-xs font-black ${theme.input}`}
                      >
                        요청목록 조회
                      </button>
                      <button
                        onClick={() => viewKycDocument(doc.id, doc.mime_type)}
                        className={`rounded-lg border px-2 py-1 text-xs font-black ${theme.input}`}
                      >
                        사유 입력 후 열람
                      </button>
                      <button
                        onClick={() => verifyKycAccessLogs(doc.id)}
                        className={`rounded-lg border px-2 py-1 text-xs font-black ${theme.input}`}
                      >
                        로그 무결성 검증
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className={`rounded-xl border p-2 text-xs ${theme.input}`}>등록된 KYC 문서가 없습니다.</div>
              )}
            </div>
            {!!selectedKycDocId && (
              <div className="mt-3 rounded-xl border p-3 text-xs">
                <div className="mb-2 font-black">열람 요청 승인 워크플로우 (2인 승인)</div>
                <input
                  value={kycRejectReason}
                  onChange={(e) => setKycRejectReason(e.target.value)}
                  placeholder="반려 사유 입력 (5자 이상)"
                  className={`mb-2 w-full rounded-xl border px-3 py-2 text-xs font-bold outline-none ${theme.input}`}
                />
                <select
                  value={selectedKycRequestId}
                  onChange={(e) => setSelectedKycRequestId(e.target.value)}
                  className={`w-full rounded-xl border px-3 py-2 text-xs font-bold outline-none ${theme.input}`}
                >
                  <option value="">열람 요청 선택</option>
                  {kycViewRequests.map((reqItem) => (
                    <option key={reqItem.id} value={reqItem.id}>
                      #{reqItem.id} · {reqItem.status} · approvals {reqItem.approvals?.length || 0}/2
                    </option>
                  ))}
                </select>
                <div className="mt-2 max-h-36 space-y-1 overflow-y-auto pr-1">
                  {kycViewRequests.length ? (
                    kycViewRequests.map((reqItem) => (
                      <div key={reqItem.id} className={`rounded-lg border p-2 text-[11px] ${theme.input}`}>
                        <div>
                          요청 #{reqItem.id} · {reqItem.status} · 승인 {(reqItem.approvals || []).length}/2
                        </div>
                        <div className={theme.muted}>{reqItem.reason}</div>
                        {!!reqItem.rejected_reason && (
                          <div className="text-red-400">
                            반려사유: {reqItem.rejected_reason} (by {reqItem.rejected_by_user_id || "-"} · {reqItem.rejected_at || "-"})
                          </div>
                        )}
                        <div className={theme.muted}>요청자 {reqItem.requester_user_id} · {reqItem.created_at}</div>
                        <div className="mt-1 flex gap-1">
                          <button
                            onClick={() => approveKycViewRequest(reqItem.id, Number(selectedKycDocId))}
                            className={`rounded-lg border px-2 py-1 text-xs font-black ${theme.input}`}
                          >
                            이 요청 승인
                          </button>
                          <button
                            onClick={() => rejectKycViewRequest(reqItem.id, Number(selectedKycDocId))}
                            className="rounded-lg border border-red-500/60 px-2 py-1 text-xs font-black text-red-400"
                          >
                            이 요청 반려
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className={`rounded-lg border p-2 text-[11px] ${theme.input}`}>조회된 열람 요청이 없습니다.</div>
                  )}
                </div>
              </div>
            )}
            {kycDocPreview && (
              <div className="mt-3 rounded-xl border p-3 text-xs">
                <div className="font-black">문서 미리보기</div>
                <div
                  className="relative mt-2 overflow-hidden rounded-lg border"
                  onContextMenu={(e) => e.preventDefault()}
                  onDragStart={(e) => e.preventDefault()}
                  onCopy={(e) => e.preventDefault()}
                  style={{ userSelect: "none", WebkitUserSelect: "none" }}
                >
                  {kycDocPreview.startsWith("data:image/") ? (
                    <img src={kycDocPreview} alt="kyc-preview" className="max-h-56 w-full object-contain" />
                  ) : (
                    <pre className="whitespace-pre-wrap p-2">{kycDocPreview}</pre>
                  )}
                  <div className="pointer-events-none absolute inset-0 grid place-items-center bg-transparent p-2 text-[10px] font-black tracking-wider text-red-500/30">
                    {kycWatermarkText || "CONFIDENTIAL"}
                  </div>
                </div>
                <div className={`mt-1 text-[11px] ${theme.muted}`}>
                  보안뷰어 모드: 다운로드/우클릭/드래그/복사 제한 + 워터마크 적용
                </div>
              </div>
            )}
            {!!kycLogVerifyResult && (
              <div className={`mt-2 rounded-lg border p-2 text-[11px] ${theme.input}`}>{kycLogVerifyResult}</div>
            )}
            <div className="mt-3">
              <div className="text-xs font-black">문서 열람 로그</div>
              <div className="mt-1 max-h-28 space-y-1 overflow-y-auto pr-1">
                {kycDocLogs.length ? (
                  kycDocLogs.map((log) => (
                    <div key={log.id} className={`rounded-lg border p-2 text-[11px] ${theme.input}`}>
                      actor {log.actor_user_id} · {log.created_at}
                      <div className={theme.muted}>{log.reason}</div>
                    </div>
                  ))
                ) : (
                  <div className={`rounded-lg border p-2 text-[11px] ${theme.input}`}>아직 열람 로그가 없습니다.</div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className={`${isAdminTab("dispute") ? "" : "hidden "}mt-5 rounded-3xl border p-5 ${theme.card}`}>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-xl font-black">분쟁 다중승인 / 메인 관리자 보관계좌 정책</div>
              <div className={`text-sm ${theme.subtext}`}>분쟁 시 지정 승인자 3~5인 결재가 모여야 반환 처리됩니다.</div>
            </div>
            <span className="rounded-full bg-red-600 px-3 py-1 text-xs font-black text-white">고신뢰 정책</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="회사 지정 보관 계좌" theme={theme}>
              <input
                value={escrowPolicy.mainCustodyAccount}
                onChange={(e) => setEscrowPolicy((prev) => ({ ...prev, mainCustodyAccount: e.target.value }))}
                className={`rounded-2xl border px-4 py-3 font-bold outline-none ${theme.input}`}
              />
            </Field>
            <Field label="필요 승인 인원(3~5)" theme={theme}>
              <select
                value={escrowPolicy.requiredApprovals}
                onChange={(e) => setEscrowPolicy((prev) => ({ ...prev, requiredApprovals: Number(e.target.value) }))}
                className={`rounded-2xl border px-4 py-3 font-bold outline-none ${theme.input}`}
              >
                <option value={3}>3인 승인</option>
                <option value={4}>4인 승인</option>
                <option value={5}>5인 승인</option>
              </select>
            </Field>
            <Field label="최종 승인 메인 관리자 ID (1인 고정)" theme={theme}>
              <select
                value={escrowPolicy.mainFinalApproverId}
                onChange={(e) => setEscrowPolicy((prev) => ({ ...prev, mainFinalApproverId: e.target.value }))}
                className={`rounded-2xl border px-4 py-3 font-bold outline-none ${theme.input}`}
              >
                {authUsers.filter((u) => u.role.includes("관리자")).map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.nickname} ({user.id})
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="mt-3 rounded-2xl border p-3">
            <div className="text-sm font-black">레벨별 구매 지연시간(시간)</div>
            <div className="mt-2 grid gap-2 md:grid-cols-5">
              {["Lv1", "Lv2", "Lv3", "Lv4", "Lv5"].map((levelKey) => (
                <label key={levelKey} className={`rounded-xl border px-3 py-2 text-xs ${theme.input}`}>
                  <div className="font-black">{levelKey}</div>
                  <input
                    type="number"
                    min={0}
                    max={168}
                    value={escrowPolicy?.levelDelayHours?.[levelKey] ?? 0}
                    onChange={(e) =>
                      setEscrowPolicy((prev) => ({
                        ...prev,
                        levelDelayHours: {
                          ...(prev.levelDelayHours || {}),
                          [levelKey]: Math.max(0, Number(e.target.value || 0)),
                        },
                      }))
                    }
                    className={`mt-1 w-full rounded-lg border px-2 py-1 text-xs font-bold outline-none ${theme.input}`}
                  />
                </label>
              ))}
            </div>
            <div className={`mt-2 text-xs ${theme.muted}`}>0 입력 시 즉시 처리로 표시됩니다.</div>
          </div>
          <div className="mt-3 rounded-2xl border p-3">
            <div className="text-sm font-black">지정 승인자 선택</div>
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              {authUsers.filter((u) => u.role.includes("관리자")).map((user) => (
                <label key={user.id} className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${theme.input}`}>
                  <input
                    type="checkbox"
                    checked={escrowPolicy.approverIds.includes(user.id)}
                    onChange={(e) => {
                      if (!isSuperAdmin) {
                        notify("슈퍼관리자만 승인자를 지정할 수 있습니다.");
                        return;
                      }
                      setEscrowPolicy((prev) => ({
                        ...prev,
                        approverIds: e.target.checked
                          ? [...prev.approverIds, user.id]
                          : prev.approverIds.filter((id) => id !== user.id),
                      }));
                    }}
                  />
                  <span className="font-black">{user.nickname}</span>
                  <span className={theme.muted}>({user.id})</span>
                </label>
              ))}
            </div>
          </div>
          <button
            onClick={async () => {
              try {
                const data = await apiClient.request("/api/admin/escrow-policy", {
                  method: "PUT",
                  auth: true,
                  body: JSON.stringify(escrowPolicy),
                });
                if (data?.policy) setEscrowPolicy(data.policy);
                appendAdminAction?.("보관계좌/분쟁승인 정책 저장");
                notify("분쟁 다중승인 정책이 저장되었습니다.");
              } catch (error) {
                notify(error.message || "정책 저장에 실패했습니다.");
              }
            }}
            className={`mt-3 rounded-2xl px-4 py-3 text-sm font-black ${theme.main}`}
          >
            정책 저장
          </button>
          <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto]">
            <input
              value={newPolicyPinInput}
              onChange={(e) => setNewPolicyPinInput(e.target.value)}
              placeholder="최종승인 PIN 변경 (숫자 6~10자리)"
              className={`rounded-2xl border px-4 py-3 text-sm font-bold outline-none ${theme.input}`}
            />
            <button
              onClick={async () => {
                try {
                  await apiClient.request("/api/admin/escrow-policy/pin", {
                    method: "PUT",
                    auth: true,
                    body: JSON.stringify({ pin: newPolicyPinInput }),
                  });
                  appendAdminAction?.("최종승인 PIN 변경");
                  setNewPolicyPinInput("");
                  notify("최종승인 PIN이 업데이트되었습니다.");
                } catch (error) {
                  notify(error.message || "PIN 변경에 실패했습니다.");
                }
              }}
              className={`rounded-2xl px-4 py-3 text-sm font-black ${theme.main}`}
            >
              PIN 저장
            </button>
          </div>
          <input
            value={finalApprovalPinInput}
            onChange={(e) => setFinalApprovalPinInput(e.target.value)}
            placeholder="메인 관리자 최종승인 PIN 입력"
            className={`mt-3 w-full rounded-2xl border px-4 py-3 text-sm font-bold outline-none ${theme.input}`}
          />
          <input
            value={finalApprovalOtpInput}
            onChange={(e) => setFinalApprovalOtpInput(e.target.value)}
            placeholder="메인 관리자 최종승인 OTP 입력"
            className={`mt-2 w-full rounded-2xl border px-4 py-3 text-sm font-bold outline-none ${theme.input}`}
          />
          <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
            {disputeCases.length ? (
              disputeCases.map((item) => (
                <div key={item.id} className={`rounded-2xl border p-3 text-sm ${theme.input}`}>
                  <div className="flex items-center justify-between">
                    <div className="font-black">{item.id} · {item.orderSeller}</div>
                    <span className={`rounded-full px-2 py-1 text-xs font-black ${item.status === "반환완료" ? "bg-emerald-600 text-white" : "bg-amber-500 text-white"}`}>
                      {item.status}
                    </span>
                  </div>
                  <div className={`mt-1 text-xs ${theme.muted}`}>{item.coin} {number(item.amount)} · 입금자 {item.senderName} · 계좌 {item.senderAccount}</div>
                  <div className={`mt-1 text-xs ${theme.muted}`}>승인 {item.approvals.length} / {escrowPolicy.requiredApprovals} · 최종승인자 {escrowPolicy.mainFinalApproverId}</div>
                  {item.releaseMessage && <div className="mt-1 text-xs font-black text-emerald-500">{item.releaseMessage}</div>}
                  <button
                    onClick={() => approveDisputeCase(item.id, currentAdminActorId)}
                    disabled={!escrowPolicy.approverIds.includes(currentAdminActorId) || item.status === "반환완료" || item.status === "최종승인대기"}
                    className={`mt-2 rounded-xl px-3 py-2 text-xs font-black ${item.status === "반환완료" ? "bg-slate-500 text-white" : theme.main}`}
                  >
                    내가 승인하기
                  </button>
                  <button
                    onClick={() => loadDisputeEvents(item.id)}
                    className={`mt-2 ml-2 rounded-xl border px-3 py-2 text-xs font-black ${theme.input}`}
                  >
                    이벤트 타임라인
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        await apiClient.request(`/api/admin/disputes/${item.id}/request-otp`, {
                          method: "POST",
                          auth: true,
                          body: JSON.stringify({}),
                        });
                        notify("OTP 발급 완료 (5분 유효). 등록된 관리자 보안 채널로 전송되었습니다.");
                      } catch (error) {
                        notify(error.message || "OTP 발급에 실패했습니다.");
                      }
                    }}
                    disabled={item.status !== "최종승인대기" || currentAdminActorId !== escrowPolicy.mainFinalApproverId}
                    className={`mt-2 ml-2 rounded-xl border px-3 py-2 text-xs font-black ${theme.input}`}
                  >
                    OTP 발급
                  </button>
                  <button
                    onClick={() => finalizeDisputeByMain(item.id, currentAdminActorId, finalApprovalPinInput, finalApprovalOtpInput)}
                    disabled={item.status !== "최종승인대기" || currentAdminActorId !== escrowPolicy.mainFinalApproverId}
                    className={`mt-2 ml-2 rounded-xl px-3 py-2 text-xs font-black ${item.status === "최종승인대기" ? "bg-red-600 text-white" : "bg-slate-500 text-white"}`}
                  >
                    메인 관리자 최종승인
                  </button>
                </div>
              ))
            ) : (
              <div className={`rounded-2xl border p-3 text-sm ${theme.input}`}>접수된 분쟁이 없습니다.</div>
            )}
          </div>
          <div className="mt-3 rounded-2xl border p-3">
            <div className="text-sm font-black">분쟁 이벤트 타임라인 {selectedDisputeIdForTimeline ? `(${selectedDisputeIdForTimeline})` : ""}</div>
            <div className="mt-2 grid gap-2 md:grid-cols-3">
              <select value={timelineActionFilter} onChange={(e) => setTimelineActionFilter(e.target.value)} className={`rounded-xl border px-3 py-2 text-xs font-black outline-none ${theme.input}`}>
                <option>전체</option>
                <option>분쟁접수</option>
                <option>다중승인</option>
                <option>OTP발급</option>
                <option>최종승인</option>
              </select>
              <input type="date" value={timelineFromDate} onChange={(e) => setTimelineFromDate(e.target.value)} className={`rounded-xl border px-3 py-2 text-xs font-black outline-none ${theme.input}`} />
              <input type="date" value={timelineToDate} onChange={(e) => setTimelineToDate(e.target.value)} className={`rounded-xl border px-3 py-2 text-xs font-black outline-none ${theme.input}`} />
            </div>
            <div className="mt-2 max-h-44 space-y-2 overflow-y-auto pr-1">
              {filteredTimelineEvents.length ? (
                filteredTimelineEvents.map((event) => (
                  <div key={event.id} className={`rounded-xl border p-2 text-xs ${theme.input}`}>
                    <div className="font-black">{event.action}</div>
                    <div className={theme.muted}>actor: {actorNameMap[event.actor_user_id] || event.actor_user_id} · {event.created_at}</div>
                    <div className={theme.muted}>{event.detail}</div>
                  </div>
                ))
              ) : (
                <div className={`rounded-xl border p-2 text-xs ${theme.input}`}>조회된 이벤트가 없습니다. 분쟁 카드에서 `이벤트 타임라인`을 누르세요.</div>
              )}
            </div>
            <button onClick={exportTimelineCsv} className={`mt-2 rounded-xl border px-3 py-2 text-xs font-black ${theme.input}`}>
              타임라인 CSV 내보내기
            </button>
            <button onClick={verifyTimelineIntegrity} className={`mt-2 ml-2 rounded-xl border px-3 py-2 text-xs font-black ${theme.input}`}>
              타임라인 무결성 검증
            </button>
            {timelineVerifyResult && <div className={`mt-2 text-xs font-black ${theme.muted}`}>{timelineVerifyResult}</div>}
          </div>
        </div>

        <div className={`${isAdminTab("memberOps") ? "" : "hidden "}mt-5 rounded-3xl border p-5 ${theme.card}`}>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-xl font-black">첨부/음성 메시지 모니터링</div>
              <div className={`text-sm ${theme.subtext}`}>친구 채팅방에서 오간 첨부파일과 음성 메시지를 관리자에서 추적합니다.</div>
            </div>
            <span className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-black text-white">{totalMediaCount}건</span>
          </div>
          <div className="mb-3 grid gap-2 md:grid-cols-2">
            <select
              value={adminMediaTypeFilter}
              onChange={(e) => {
                setAdminMediaTypeFilter(e.target.value);
                appendAdminAction?.(`미디어 타입 필터 변경: ${e.target.value}`);
              }}
              className={`rounded-2xl border px-3 py-2 text-sm font-black outline-none ${theme.input}`}
            >
              <option>전체</option>
              <option>첨부파일</option>
              <option>음성</option>
            </select>
            <select
              value={adminMediaFriendFilter}
              onChange={(e) => {
                setAdminMediaFriendFilter(e.target.value);
                appendAdminAction?.(`친구 필터 변경: ${e.target.value}`);
              }}
              className={`rounded-2xl border px-3 py-2 text-sm font-black outline-none ${theme.input}`}
            >
              <option value="전체">전체 친구</option>
              {(friends || []).map((friend) => (
                <option key={friend.id} value={friend.id}>
                  {friend.nickname} ({friend.id})
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className={`rounded-2xl p-3 ${theme.cardSoft}`}>
              <div className={theme.muted}>전체 첨부</div>
              <div className="mt-1 text-xl font-black">{totalMediaCount}</div>
            </div>
            <div className={`rounded-2xl p-3 ${theme.cardSoft}`}>
              <div className={theme.muted}>일반 첨부</div>
              <div className="mt-1 text-xl font-black">{fileMediaCount}</div>
            </div>
            <div className={`rounded-2xl p-3 ${theme.cardSoft}`}>
              <div className={theme.muted}>음성 메시지</div>
              <div className="mt-1 text-xl font-black">{voiceMediaCount}</div>
            </div>
          </div>
          <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
            {filteredMediaEvents.length ? (
              filteredMediaEvents.slice().reverse().map((item) => (
                <div key={item.id} className={`rounded-2xl border p-3 text-sm ${theme.input}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-black">{item.friendName} ({item.friendId})</div>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-black ${item.isVoice ? "bg-violet-600 text-white" : "bg-blue-600 text-white"}`}>
                      {item.isVoice ? "음성" : "첨부"}
                    </span>
                  </div>
                  <div className={`mt-1 text-xs ${isRiskyFileName(item.fileName) ? "font-black text-red-500" : theme.muted}`}>
                    {item.fileName}
                    {isRiskyFileName(item.fileName) ? " · 위험 파일명 의심" : ""}
                  </div>
                  <div className={`mt-1 text-xs ${theme.muted}`}>{item.fileType} · {item.sender === "me" ? "내 전송" : "상대 전송"} · {item.createdAt}</div>
                </div>
              ))
            ) : (
              <div className={`rounded-2xl border p-3 text-sm ${theme.input}`}>아직 수집된 첨부/음성 이벤트가 없습니다.</div>
            )}
          </div>
        </div>

        <div
          ref={adminActionLogSectionRef}
          className={`${isAdminTab("member") || isAdminTab("memberOps") ? "" : "hidden "}mt-5 rounded-3xl border p-5 ${theme.card}`}
        >
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-xl font-black">관리자 액션 로그</div>
              <div className={`text-sm ${theme.subtext}`}>단계 변경·필터·권한 등 관리자 행동 기록 (VD 목업은 로컬 반영)</div>
            </div>
            <span className="rounded-full bg-slate-700 px-3 py-1 text-xs font-black text-white">{adminActionLogs.length}건</span>
          </div>
          <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
            {adminActionLogs.length ? (
              adminActionLogs.map((log) => (
                <div key={log.id} className={`rounded-2xl border p-3 text-sm ${theme.input}`}>
                  <div className="font-black">{log.action}</div>
                  <div className={`mt-1 text-xs ${theme.muted}`}>{log.role} · {log.time}</div>
                </div>
              ))
            ) : (
              <div className={`rounded-2xl border p-3 text-sm ${theme.input}`}>아직 기록된 관리자 액션이 없습니다.</div>
            )}
          </div>
        </div>

        <div className={`${false && isAdminTab("memberOps") ? "" : "hidden "}mt-5 grid gap-3 md:grid-cols-3`}>
          {(() => {
            const canSaveDownlineLink = isSuperAdmin && !invalidRate;
            const canValidateMargin = isSuperAdmin;
            return (
              <>
          <div className="grid gap-1">
            <button
              onClick={() => {
                if (!isSuperAdmin) {
                  notify("슈퍼관리자 권한이 필요합니다.");
                  return;
                }
                if (invalidRate) {
                  notify("배분율 오류: 하위 배분율이 상위 배분율보다 큽니다.");
                  moveToSection(rateValidationSectionRef);
                  return;
                }
                appendAdminAction?.(`하부 연결 저장: ${adminParent} -> ${adminMember}`);
                notify(`${adminMember} 회원을 ${adminParent} 하부로 연결했습니다.`);
                moveToSection(adminActionLogSectionRef);
              }}
              disabled={!canSaveDownlineLink}
              className={`rounded-2xl px-5 py-4 font-black ${canSaveDownlineLink ? theme.main : "bg-slate-500 text-white"}`}
            >
              <span className="inline-flex items-center gap-2">
                <span aria-hidden="true">[Link]</span>
                <span>하부 연결 저장</span>
              </span>
            </button>
            {!canSaveDownlineLink && (
              <div className={`text-[11px] ${theme.muted}`}>
                {!isSuperAdmin ? "슈퍼관리자만 저장할 수 있습니다." : "배분율 오류가 있어 저장할 수 없습니다."}
              </div>
            )}
          </div>
          <button
            onClick={() => {
              notify("전체 하부 트리 조회 실행");
              moveToSection(memberTreeSectionRef);
            }}
            className={`rounded-2xl border px-5 py-4 font-black ${theme.input}`}
          >
            <span className="inline-flex items-center gap-2">
              <span aria-hidden="true">[Tree]</span>
              <span>하부 트리 조회</span>
            </span>
          </button>
          <div className="grid gap-1">
            <button
              onClick={() => {
                if (!isSuperAdmin) {
                  notify("슈퍼관리자 권한이 필요합니다.");
                  return;
                }
                notify("상위-하위 차액 수익 검증 실행");
                moveToSection(rateValidationSectionRef);
              }}
              disabled={!canValidateMargin}
              className={`rounded-2xl border px-5 py-4 font-black ${canValidateMargin ? theme.input : "bg-slate-500 text-white"}`}
            >
              <span className="inline-flex items-center gap-2">
                <span aria-hidden="true">[Check]</span>
                <span>차액 수익 검증</span>
              </span>
            </button>
            {!canValidateMargin && <div className={`text-[11px] ${theme.muted}`}>슈퍼관리자만 검증할 수 있습니다.</div>}
          </div>
              </>
            );
          })()}
        </div>
        <div className={`${false && isAdminTab("memberOps") ? "" : "hidden "}mt-3 rounded-2xl border p-3 text-xs ${theme.cardSoft}`}>
          권한 레벨: {isSuperAdmin ? "슈퍼관리자 (전체 제어)" : "일반 관리자 (조회/모니터링 중심)"}
        </div>
        </div>
      </div>
    </section>
  );
}

function FriendListItem({ friend, selected, lastMessage, onClick, onOpenTrade, onOpenChat, theme }) {
  const canInstant = (friend.status === "완전매칭" || friend.status === "거래매칭") && friend.instantRelease;
  const statusClass =
    friend.status === "완전매칭"
      ? "bg-emerald-600 text-white"
      : friend.status === "거래매칭"
        ? "bg-blue-600 text-white"
        : "bg-amber-500 text-white";

  return (
    <div className={`rounded-2xl border px-3 py-2 ${selected ? "ring-2 ring-emerald-500/70" : ""} ${theme.input}`}>
      <button onClick={onClick} className="w-full text-left">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${friend.online ? "bg-emerald-400" : "bg-slate-500"}`} />
            <span className="text-sm font-black">{friend.nickname}</span>
          </div>
          {friend.unread > 0 && <span className="rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-black text-white">{friend.unread}</span>}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px]">
          <span className="rounded-full bg-black/20 px-2 py-0.5 font-black">{friend.level}</span>
          <span className={`rounded-full px-2 py-0.5 font-black ${statusClass}`}>{friend.status}</span>
          <span className={`rounded-full px-2 py-0.5 font-black ${canInstant ? "bg-emerald-500 text-white" : "bg-amber-500 text-white"}`}>
            {canInstant ? "즉시송금" : "지연송금"}
          </span>
          <span className={`rounded-full px-2 py-0.5 font-black ${friend.selling ? "bg-indigo-600 text-white" : "bg-slate-500 text-white"}`}>
            {friend.selling ? "판매중" : "판매대기"}
          </span>
        </div>
        <div className="mt-1 text-[11px] font-bold opacity-80">
          {friend.selling
            ? `판매금액 ${number(friend.sellAmount)} ${friend.sellCoin} · ${number(friend.sellPrice)} ${friend.sellCurrency}`
            : "현재 판매글 없음"}
        </div>
        <div className="mt-1 truncate text-xs opacity-75">{lastMessage || "대화 없음"}</div>
      </button>
      <div className="mt-2 grid grid-cols-2 gap-1">
        <button onClick={onOpenTrade} className="rounded-xl bg-blue-600 px-2 py-1 text-xs font-black text-white">거래</button>
        <button onClick={onOpenChat} className="rounded-xl bg-emerald-600 px-2 py-1 text-xs font-black text-white">채팅</button>
      </div>
    </div>
  );
}

function FriendsPage({ theme, friends, selectedFriendId, selectedFriend, friendLastMessages, roomPreview, onSelectFriend, onOpenTrade, onOpenChat, onGoTrade, onGoMyInfo, onGoMyTrades, onGoSell }) {
  const selectedPreview = (roomPreview || []).filter(Boolean).slice(-2);
  const [friendPage, setFriendPage] = useState(1);
  const FRIENDS_PER_PAGE = 6;
  const friendTotalPages = Math.max(1, Math.ceil((friends || []).length / FRIENDS_PER_PAGE));
  const pagedFriends = (friends || []).slice((friendPage - 1) * FRIENDS_PER_PAGE, friendPage * FRIENDS_PER_PAGE);
  useEffect(() => {
    if (friendPage > friendTotalPages) setFriendPage(friendTotalPages);
  }, [friendPage, friendTotalPages]);

  return (
    <section className="mx-auto max-w-7xl px-4 py-8">
      <div className={`rounded-3xl border p-5 shadow-sm ${theme.card}`}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="text-2xl font-black">친구</div>
          <div className="flex flex-wrap items-center justify-end gap-1">
            <button onClick={onGoTrade} className={`rounded-xl border px-3 py-1.5 text-xs font-black ${theme.input}`}>거래</button>
            <button onClick={onGoSell} className={`rounded-xl border px-3 py-1.5 text-xs font-black ${theme.input}`}>판매등록</button>
            <button onClick={onGoMyTrades} className={`rounded-xl border px-3 py-1.5 text-xs font-black ${theme.input}`}>내 거래</button>
            <button onClick={onGoMyInfo} className={`rounded-xl border px-3 py-1.5 text-xs font-black ${theme.input}`}>내정보</button>
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
          <div className="space-y-2">
            {pagedFriends.map((friend) => {
              return (
                <FriendListItem
                  key={friend.id}
                  friend={friend}
                  selected={selectedFriendId === friend.id}
                  lastMessage={friendLastMessages[friend.id]}
                  onClick={() => onSelectFriend(friend.id)}
                  onOpenTrade={() => onOpenTrade(friend.id)}
                  onOpenChat={() => onOpenChat(friend.id)}
                  theme={theme}
                />
              );
            })}
            <div className="mt-2 flex items-center justify-between gap-2">
              <button
                onClick={() => setFriendPage((prev) => Math.max(1, prev - 1))}
                disabled={friendPage <= 1}
                className={`rounded-xl border px-2 py-1 text-[11px] font-black ${friendPage <= 1 ? "bg-slate-500 text-white" : theme.input}`}
              >
                이전
              </button>
              <div className={`text-[11px] ${theme.muted}`}>{friendPage} / {friendTotalPages}</div>
              <button
                onClick={() => setFriendPage((prev) => Math.min(friendTotalPages, prev + 1))}
                disabled={friendPage >= friendTotalPages}
                className={`rounded-xl border px-2 py-1 text-[11px] font-black ${friendPage >= friendTotalPages ? "bg-slate-500 text-white" : theme.input}`}
              >
                다음
              </button>
            </div>
          </div>
          <div className={`rounded-3xl p-4 ${theme.cardSoft}`}>
            <div className="text-lg font-black">친구등록 화면 미리보기</div>
            <div className={`mt-1 text-sm ${theme.subtext}`}>친구 등록 전 최근 채팅 미리보기와 바로가기 버튼을 제공합니다.</div>
            <div className="mt-3 rounded-2xl bg-black/10 p-4">
              <div className="font-black">{selectedFriend?.nickname || "선택된 친구 없음"}</div>
              <div className={`text-xs ${theme.muted}`}>{selectedFriend?.id || "-"}</div>
              <div className="mt-3 space-y-2 text-sm">
                {selectedPreview.length ? (
                  selectedPreview.map((message, idx) => (
                    <div key={message?.id ?? `pv-${idx}`} className="rounded-xl bg-white/10 px-3 py-2">
                      {message?.deleted ? "삭제된 메시지입니다." : message?.text ?? ""}
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl bg-white/10 px-3 py-2">미리보기 메시지가 없습니다.</div>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  if (selectedFriend?.id != null) onOpenChat(selectedFriend.id);
                }}
                className="mt-3 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-black text-white"
              >
                채팅 바로가기
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FriendMessenger({
  theme,
  friends,
  selectedFriendId,
  selectedFriend,
  friendLastMessages,
  messages,
  chatInput,
  setChatInput,
  friendSearch,
  setFriendSearch,
  pinnedFriendIds,
  setPinnedFriendIds,
  mutedFriendIds,
  setMutedFriendIds,
  onSelectFriend,
  onSendMessage,
  onDeleteMessage,
  onClearMessages,
  onOpenTrade,
  notify,
  onSendAttachment,
  onGoTrade,
  onGoMyInfo,
  onGoMyTrades,
  onGoSell,
}) {
  const endRef = useRef(null);
  const fileInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [pendingVoiceBlob, setPendingVoiceBlob] = useState(null);
  const [pendingVoiceUrl, setPendingVoiceUrl] = useState("");
  const [voiceFileSizeLimitMb] = useState(5);
  const [uploadingInfo, setUploadingInfo] = useState({ name: "", progress: 0, active: false });
  const [friendPage, setFriendPage] = useState(1);
  const FRIENDS_PER_PAGE = 4;
  const filteredFriends = useMemo(() => {
    const list = Array.isArray(friends) ? friends : [];
    return list
      .filter((friend) => friend && `${friend.nickname ?? ""} ${friend.id ?? ""}`.toLowerCase().includes((friendSearch || "").toLowerCase()))
      .sort((a, b) => Number(pinnedFriendIds.includes(b.id)) - Number(pinnedFriendIds.includes(a.id)));
  }, [friends, friendSearch, pinnedFriendIds]);
  const friendTotalPages = Math.max(1, Math.ceil(filteredFriends.length / FRIENDS_PER_PAGE));
  const pagedFriends = filteredFriends.slice((friendPage - 1) * FRIENDS_PER_PAGE, friendPage * FRIENDS_PER_PAGE);

  useEffect(() => {
    setFriendPage(1);
  }, [friendSearch]);

  useEffect(() => {
    if (friendPage > friendTotalPages) setFriendPage(friendTotalPages);
  }, [friendPage, friendTotalPages]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, selectedFriendId]);

  useEffect(() => {
    if (!isRecordingVoice) return undefined;
    const timer = setInterval(() => {
      setRecordingSeconds((prev) => {
        const next = prev + 1;
        if (next >= 60) {
          mediaRecorderRef.current?.stop();
          setIsRecordingVoice(false);
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isRecordingVoice]);

  function handleKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSendMessage();
    }
  }

  function togglePinned(friendId) {
    if (!friendId) return;
    setPinnedFriendIds((prev) => (prev.includes(friendId) ? prev.filter((id) => id !== friendId) : [...prev, friendId]));
  }

  function toggleMuted(friendId) {
    if (!friendId) return;
    setMutedFriendIds((prev) => (prev.includes(friendId) ? prev.filter((id) => id !== friendId) : [...prev, friendId]));
  }

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  function simulateUploadAndSend(file, doneMessage) {
    return new Promise((resolve) => {
      let progress = 0;
      setUploadingInfo({ name: file.name, progress: 0, active: true });
      const timer = setInterval(() => {
        progress += 20;
        if (progress >= 100) {
          clearInterval(timer);
          setUploadingInfo({ name: file.name, progress: 100, active: true });
          onSendAttachment?.(file);
          notify(doneMessage);
          setTimeout(() => setUploadingInfo({ name: "", progress: 0, active: false }), 350);
          resolve();
          return;
        }
        setUploadingInfo({ name: file.name, progress, active: true });
      }, 120);
    });
  }

  function handleAttachmentChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    simulateUploadAndSend(file, `${file.name} 첨부 전송 완료`);
    event.target.value = "";
  }

  async function toggleVoiceRecording() {
    if (isRecordingVoice) {
      mediaRecorderRef.current?.stop();
      setIsRecordingVoice(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recordedChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data?.size > 0) recordedChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: "audio/webm" });
        if ((blob.size || 0) > voiceFileSizeLimitMb * 1024 * 1024) {
          notify(`음성 파일은 ${voiceFileSizeLimitMb}MB 이하로 전송 가능합니다.`);
          stream.getTracks().forEach((track) => track.stop());
          setRecordingSeconds(0);
          return;
        }
        setPendingVoiceBlob(blob);
        setPendingVoiceUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((track) => track.stop());
        setRecordingSeconds(0);
        notify("녹음 완료. 미리듣기 후 전송하세요.");
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecordingVoice(true);
      setRecordingSeconds(0);
      notify("녹음을 시작했습니다. 다시 누르면 전송됩니다.");
    } catch {
      notify("마이크 권한이 필요합니다.");
    }
  }

  function confirmPendingVoice() {
    if (!pendingVoiceBlob) return;
    const voiceFile = new File([pendingVoiceBlob], `voice-${Date.now()}.webm`, { type: "audio/webm" });
    simulateUploadAndSend(voiceFile, "음성 메시지 전송 완료");
    setPendingVoiceBlob(null);
    setPendingVoiceUrl("");
  }

  function cancelPendingVoice() {
    if (pendingVoiceUrl) URL.revokeObjectURL(pendingVoiceUrl);
    setPendingVoiceBlob(null);
    setPendingVoiceUrl("");
    notify("음성 메시지를 취소했습니다.");
  }

  return (
    <section className="mx-auto h-[calc(100vh-96px)] max-w-7xl px-4 py-4">
      <div className={`h-full overflow-hidden rounded-3xl border p-4 shadow-sm ${theme.card}`}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="text-2xl font-black">메신저</div>
          <div className="flex flex-wrap items-center justify-end gap-1">
            <button onClick={onGoTrade} className={`rounded-xl border px-3 py-1.5 text-xs font-black ${theme.input}`}>거래</button>
            <button onClick={onGoSell} className={`rounded-xl border px-3 py-1.5 text-xs font-black ${theme.input}`}>판매등록</button>
            <button onClick={onGoMyTrades} className={`rounded-xl border px-3 py-1.5 text-xs font-black ${theme.input}`}>내 거래</button>
            <button onClick={onGoMyInfo} className={`rounded-xl border px-3 py-1.5 text-xs font-black ${theme.input}`}>내정보</button>
          </div>
        </div>
        <div className="grid h-full gap-3 lg:grid-cols-[300px_1fr]">
          <div className="pr-1">
            <input
              value={friendSearch}
              onChange={(event) => setFriendSearch(event.target.value)}
              placeholder="친구 검색 (이름/ID)"
              className={`w-full rounded-2xl border px-4 py-2 text-sm font-bold outline-none ${theme.input}`}
            />
            <div className="mt-2 space-y-1.5">
            {pagedFriends.map((friend) => {
              return (
                <div key={friend.id} className={`rounded-xl border px-2.5 py-2 ${selectedFriendId === friend.id ? theme.main : theme.input}`}>
                  <button onClick={() => onSelectFriend(friend.id)} className="w-full text-left">
                    <div className="flex items-center justify-between gap-2">
                      <div className="truncate text-xs font-black">{friend.nickname}</div>
                      <span className={`h-2 w-2 rounded-full ${friend.online ? "bg-emerald-400" : "bg-slate-500"}`} />
                    </div>
                    <div className="mt-1 truncate text-[10px] opacity-75">{friendLastMessages[friend.id] || "대화 없음"}</div>
                  </button>
                  <div className="mt-1 flex gap-1">
                    <button onClick={() => togglePinned(friend.id)} className={`rounded-md px-2 py-0.5 text-[10px] font-black ${pinnedFriendIds.includes(friend.id) ? "bg-amber-500 text-white" : theme.input}`}>
                      고정
                    </button>
                    <button onClick={() => toggleMuted(friend.id)} className={`rounded-md px-2 py-0.5 text-[10px] font-black ${mutedFriendIds.includes(friend.id) ? "bg-slate-600 text-white" : theme.input}`}>
                      음소거
                    </button>
                    <button onClick={() => onOpenTrade(friend.id)} className="rounded-md bg-blue-600 px-2 py-0.5 text-[10px] font-black text-white">
                      거래
                    </button>
                  </div>
                </div>
              );
            })}
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <button
                onClick={() => setFriendPage((prev) => Math.max(1, prev - 1))}
                disabled={friendPage <= 1}
                className={`rounded-xl border px-2 py-1 text-[11px] font-black ${friendPage <= 1 ? "bg-slate-500 text-white" : theme.input}`}
              >
                이전
              </button>
              <div className={`text-[11px] ${theme.muted}`}>{friendPage} / {friendTotalPages}</div>
              <button
                onClick={() => setFriendPage((prev) => Math.min(friendTotalPages, prev + 1))}
                disabled={friendPage >= friendTotalPages}
                className={`rounded-xl border px-2 py-1 text-[11px] font-black ${friendPage >= friendTotalPages ? "bg-slate-500 text-white" : theme.input}`}
              >
                다음
              </button>
            </div>
          </div>

          <div className={`rounded-3xl p-3 ${theme.cardSoft} flex h-full flex-col overflow-hidden`}>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-lg font-black">{selectedFriend?.nickname || "친구를 선택하세요."}</div>
                <div className={`text-xs ${theme.muted}`}>{selectedFriend?.id || "-"}</div>
                <div className={`text-xs ${theme.muted}`}>
                  {mutedFriendIds.includes(selectedFriend?.id) ? "알림 상태: 음소거" : "알림 상태: 활성"}
                </div>
              </div>
              <button onClick={() => onClearMessages(selectedFriend?.id)} className={`rounded-xl border px-3 py-2 text-xs font-black ${theme.input}`}>
                대화 전체삭제
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto rounded-2xl bg-black/10 p-3">
              {(messages || []).filter(Boolean).length ? (
                (messages || [])
                  .filter(Boolean)
                  .map((message, msgIdx) => (
                  <div
                    key={message?.id ?? `msg-${msgIdx}`}
                    className={`max-w-[86%] rounded-2xl px-3 py-1.5 text-xs leading-5 ${message?.sender === "me" ? "ml-auto bg-emerald-600 text-white" : "bg-slate-700 text-white"}`}
                  >
                    {message?.attachment?.previewUrl && (
                      <img src={message.attachment.previewUrl} alt={message.attachment.name || ""} className="mb-2 max-h-44 w-full rounded-xl object-cover" />
                    )}
                    {message?.attachment && !message.attachment.previewUrl && (
                      <div className="mb-2 rounded-xl bg-black/20 p-2 text-xs font-black">
                        첨부파일: {message.attachment.name ?? ""} ({number((message.attachment.size || 0) / 1024)}KB)
                      </div>
                    )}
                    {message?.attachment?.audioUrl && (
                      <audio controls src={message.attachment.audioUrl} className="mb-2 w-full" />
                    )}
                    <div>{message?.deleted ? "삭제된 메시지입니다." : message?.text ?? ""}</div>
                    <div className="mt-1 flex items-center justify-between gap-2 text-[10px] opacity-80">
                      <span>{message?.createdAt ?? ""} · {message?.sender === "me" ? "전달됨" : "수신"}</span>
                      {!message?.deleted && message?.id != null && (
                        <button type="button" onClick={() => onDeleteMessage(selectedFriend?.id, message.id)} className="rounded bg-black/20 px-2 py-0.5 font-black">
                          삭제
                        </button>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm opacity-70">대화가 없습니다.</div>
              )}
              <div ref={endRef} />
            </div>

            <div className="mt-3 flex gap-2">
              <button
                onClick={openFilePicker}
                className={`rounded-2xl border px-3 py-3 text-sm font-black ${theme.input}`}
              >
                첨부
              </button>
              <input ref={fileInputRef} type="file" onChange={handleAttachmentChange} className="hidden" />
              <button
                onClick={toggleVoiceRecording}
                className={`rounded-2xl border px-3 py-3 text-sm font-black ${isRecordingVoice ? "bg-red-600 text-white" : theme.input}`}
              >
                {isRecordingVoice ? `녹음중 ${recordingSeconds}s` : "음성"}
              </button>
              <input
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="메시지를 입력하세요. Enter로 전송"
                className={`flex-1 rounded-2xl border px-4 py-3 text-sm font-bold outline-none ${theme.input}`}
              />
              <button onClick={onSendMessage} className={`rounded-2xl px-4 py-3 text-sm font-black ${theme.main}`}>
                전송
              </button>
            </div>
            {uploadingInfo.active && (
              <div className="mt-3 rounded-2xl border border-blue-500/40 bg-blue-500/10 p-3">
                <div className="flex items-center justify-between text-xs font-black">
                  <span>업로드 중: {uploadingInfo.name}</span>
                  <span>{uploadingInfo.progress}%</span>
                </div>
                <div className="mt-2 h-2 w-full rounded-full bg-black/20">
                  <div className="h-2 rounded-full bg-blue-500 transition-all" style={{ width: `${uploadingInfo.progress}%` }} />
                </div>
              </div>
            )}
            {isRecordingVoice && (
              <div className="mt-3 rounded-2xl border border-red-500/40 bg-red-500/10 p-3">
                <div className="text-xs font-black">녹음 파형</div>
                <div className="mt-2 flex items-end gap-1">
                  {Array.from({ length: 12 }).map((_, index) => {
                    const h = 6 + ((recordingSeconds + index * 3) % 14);
                    return <span key={index} className="w-1 rounded-full bg-red-500/80 animate-pulse" style={{ height: `${h}px` }} />;
                  })}
                </div>
              </div>
            )}
            {pendingVoiceUrl && (
              <div className="mt-3 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-3">
                <div className="text-sm font-black">음성 미리듣기</div>
                <audio controls src={pendingVoiceUrl} className="mt-2 w-full" />
                <div className="mt-2 flex gap-2">
                  <button onClick={confirmPendingVoice} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white">전송 확정</button>
                  <button onClick={cancelPendingVoice} className={`rounded-xl border px-3 py-2 text-xs font-black ${theme.input}`}>취소</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function Support({ theme, notify }) {
  const language = useLanguageCode();
  return <section className="mx-auto max-w-7xl px-4 py-8"><div className={`rounded-3xl border p-6 shadow-sm ${theme.card}`}><h2 className="text-2xl font-black">{localizeLoose("고객센터 / 사고신고", language)}</h2><p className={`mt-2 ${theme.subtext}`}>{localizeLoose("피싱, 사기, 송금오류, 증빙문제 발생 시 신고 접수 후 필요한 범위의 정보를 제공합니다.", language)}</p><textarea className={`mt-5 h-32 w-full rounded-2xl border p-4 outline-none ${theme.input}`} placeholder={localizeLoose("신고 내용 입력", language)} /><button onClick={() => notify(localizeLoose("사고신고가 접수되었습니다.", language))} className={`mt-3 rounded-2xl px-5 py-3 font-black ${theme.main}`}>{localizeLoose("사고신고 접수", language)}</button></div></section>;
}

function Stat({ title, text, theme }) {
  const language = useLanguageCode();
  return <div className={`rounded-3xl p-4 shadow-sm ${theme.card}`}><div className="text-2xl font-black">{localizeLoose(title, language)}</div><div className={`text-sm ${theme.subtext}`}>{localizeLoose(text, language)}</div></div>;
}

function Info({ title, text, theme }) {
  const language = useLanguageCode();
  return <div className={`rounded-3xl border p-5 shadow-sm ${theme.card}`}><div className="font-black">{localizeLoose(title, language)}</div><div className={`mt-2 text-sm leading-6 ${theme.subtext}`}>{localizeLoose(text, language)}</div></div>;
}

function DetailBox({ label, value, theme }) {
  const language = useLanguageCode();
  return (
    <div className={`rounded-2xl border p-3 ${theme.cardSoft}`}>
      <div className={`text-xs ${theme.muted}`}>{localizeLoose(label, language)}</div>
      <div className={`mt-1 text-sm font-bold ${theme.statValue ?? theme.subtext}`}>{localizeLoose(value, language)}</div>
    </div>
  );
}

function Box({ label, value, theme }) {
  const language = useLanguageCode();
  return <div className={`rounded-2xl p-4 ${theme.cardSoft}`}><div className={`text-xs ${theme.muted}`}>{localizeLoose(label, language)}</div><div className="mt-1 font-black">{localizeLoose(value, language)}</div></div>;
}

function Admin({ title, value, sub, theme }) {
  return (
    <div className={`rounded-3xl border p-4 ${theme.cardSoft}`}>
      <div className={`text-sm font-bold ${theme.muted}`}>{title}</div>
      <div className={`mt-2 text-2xl font-black tabular-nums ${theme.statValue ?? ""}`}>{value}</div>
      <div className={`mt-1 text-xs ${theme.muted}`}>{sub}</div>
    </div>
  );
}
