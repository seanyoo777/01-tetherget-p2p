import React, { useEffect, useMemo, useRef, useState, createContext, useContext } from "react";
import { createApiClient } from "./lib/apiClient";
import { deriveSessionProfile, isLoginTestAdminLike, SESSION_ROLE } from "./sessionRoles";
import {
  updateUserLevel,
  buildReferralTree,
  getDirectDownlines,
  getAllDownlines,
  getUsersByLevel,
  getLevelCounts,
  recalculateAdminStats,
  validateTreeIntegrity,
} from "./utils/referralTreeEngine";

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
  return STAGE_ALIASES[raw] || raw;
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
    login: "로그인", logout: "로그아웃", connectWallet: "지갑 연결", dashboard: "거래 대시보드", onlyNeeded: "필요한 거래 기능만 표시됩니다.",
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
    login: "Login", logout: "Logout", connectWallet: "Connect Wallet", dashboard: "Trading Dashboard", onlyNeeded: "Only essential trading features are shown.",
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
    login: "Đăng nhập", logout: "Đăng xuất", connectWallet: "Kết nối ví", dashboard: "Bảng giao dịch", onlyNeeded: "Chỉ hiển thị các chức năng cần thiết.",
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
    login: "ログイン", logout: "ログアウト", connectWallet: "ウォレット接続", dashboard: "取引ダッシュボード", onlyNeeded: "必要な取引機能のみ表示されます。",
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
    login: "登录", logout: "退出", connectWallet: "连接钱包", dashboard: "交易仪表盘", onlyNeeded: "仅显示必要交易功能。",
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
const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

const defaultAuthUsers = [
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
    id: "AUTH-SALES-001",
    email: "sales@tetherget.com",
    password: "sales1234",
    nickname: "LEVEL1 영업관리자",
    role: "영업관리자 LEVEL 1",
    session_role: "sales",
    sales_level: 1,
    createdAt: "2026-05-02",
  },
];

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

function createVirtualDownlineUsers(ownerId, count = 200) {
  const stageBuckets = [
    { stage: ADMIN_STAGE_LABEL.SUPER_PAGE, size: 2, receivedRate: 50, childRate: 45 },
    { stage: ADMIN_STAGE_LABEL.HQ_ADMIN, size: 3, receivedRate: 48, childRate: 44 },
    { stage: ADMIN_STAGE_LABEL.HQ_STAFF, size: 5, receivedRate: 46, childRate: 42 },
    { stage: SALES_LEVEL_STAGES[0], size: 15, receivedRate: 45, childRate: 40 },
    { stage: SALES_LEVEL_STAGES[1], size: 30, receivedRate: 40, childRate: 35 },
    { stage: SALES_LEVEL_STAGES[2], size: 50, receivedRate: 35, childRate: 30 },
  ];
  const users = [];
  let cursor = 1;
  for (const bucket of stageBuckets) {
    for (let i = 0; i < bucket.size && users.length < count; i += 1) {
      const n = cursor++;
      users.push({
        id: `VD-${String(n).padStart(3, "0")}`,
        nickname: `하부회원${String(n).padStart(3, "0")}`,
        email: `downline${n}@tetherget.com`,
        wallet: `${String(n).padStart(2, "0")}xV...${String(6000 + n).slice(-4)}`,
        parent: String(ownerId || "AUTH-ADMIN-001"),
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
  return users;
}

const themeMap = {
  dark: {
    name: "블랙",
    page: "bg-slate-950",
    header: "bg-slate-950 border-slate-800 text-white",
    card: "bg-slate-900 border-slate-800 text-white",
    cardSoft: "bg-slate-800 text-white",
    input: "bg-slate-800 border-slate-700 text-white placeholder:text-slate-400",
    main: "bg-white text-slate-950",
    subtext: "text-slate-300",
    muted: "text-slate-400",
  },
  blue: {
    name: "블루",
    page: "bg-blue-50",
    header: "bg-white border-slate-200 text-slate-950",
    card: "bg-white border-slate-200 text-slate-950",
    cardSoft: "bg-blue-50 text-slate-950",
    input: "bg-white border-slate-200 text-slate-950",
    main: "bg-blue-600 text-white",
    subtext: "text-slate-500",
    muted: "text-slate-500",
  },
  green: {
    name: "그린",
    page: "bg-emerald-50",
    header: "bg-white border-slate-200 text-slate-950",
    card: "bg-white border-slate-200 text-slate-950",
    cardSoft: "bg-emerald-50 text-slate-950",
    input: "bg-white border-slate-200 text-slate-950",
    main: "bg-emerald-600 text-white",
    subtext: "text-slate-500",
    muted: "text-slate-500",
  },
  purple: {
    name: "퍼플",
    page: "bg-violet-50",
    header: "bg-white border-slate-200 text-slate-950",
    card: "bg-white border-slate-200 text-slate-950",
    cardSoft: "bg-violet-50 text-slate-950",
    input: "bg-white border-slate-200 text-slate-950",
    main: "bg-violet-600 text-white",
    subtext: "text-slate-500",
    muted: "text-slate-500",
  },
};

function number(v) {
  return new Intl.NumberFormat("ko-KR").format(Math.round(v || 0));
}

function getMarketRate(sellAsset, receiveAsset, receiveType) {
  const fiatRates = {
    USDT: { KRW: 1392, USD: 1, VND: 26000, JPY: 156 },
    SOL: { KRW: 238000, USD: 171, VND: 4446000, JPY: 26600 },
    BTC: { KRW: 90000000, USD: 64700, VND: 1682200000, JPY: 10090000 },
    ETH: { KRW: 4300000, USD: 3090, VND: 80340000, JPY: 482000 },
  };

  const coinRates = {
    USDT: { USDT: 1, SOL: 0.0058, BTC: 0.000015, ETH: 0.00032 },
    SOL: { USDT: 171, SOL: 1, BTC: 0.0026, ETH: 0.055 },
    BTC: { USDT: 64700, SOL: 378, BTC: 1, ETH: 20.9 },
    ETH: { USDT: 3090, SOL: 18, BTC: 0.048, ETH: 1 },
  };

  if (receiveType === "통화") return fiatRates[sellAsset]?.[receiveAsset] || 0;
  return coinRates[sellAsset]?.[receiveAsset] || 0;
}

function rateText(value, receiveAsset, receiveType) {
  if (receiveType === "통화") return `${number(value)} ${receiveAsset}`;
  return `${value} ${receiveAsset}`;
}

export default function App() {
  const [theme, setTheme] = useState("dark");
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [sellOpen, setSellOpen] = useState(false);
  const [activePage, setActivePage] = useState("trade");
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
  const [authUsers, setAuthUsers] = useState(defaultAuthUsers.map(({ password, ...rest }) => rest));
  const [authToken, setAuthToken] = useState(() => localStorage.getItem(AUTH_TOKEN_KEY) || "");
  const [authRefreshToken, setAuthRefreshToken] = useState(() => localStorage.getItem(AUTH_REFRESH_TOKEN_KEY) || "");
  const [authTab, setAuthTab] = useState("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authPasswordConfirm, setAuthPasswordConfirm] = useState("");
  const [authNickname, setAuthNickname] = useState("");
  const [loginTestSearch, setLoginTestSearch] = useState("");
  const [loginTestAdminsOnly, setLoginTestAdminsOnly] = useState(false);
  const [loginRecentIds, setLoginRecentIds] = useState(() => {
    try {
      const raw = localStorage.getItem(LOGIN_RECENT_IDS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [friendSearch, setFriendSearch] = useState("");
  const [pinnedFriendIds, setPinnedFriendIds] = useState(["FR-001"]);
  const [mutedFriendIds, setMutedFriendIds] = useState([]);
  const [adminMediaTypeFilter, setAdminMediaTypeFilter] = useState("전체");
  const [adminMediaFriendFilter, setAdminMediaFriendFilter] = useState("전체");
  const [adminActionLogs, setAdminActionLogs] = useState([]);
  const [sellerDepositNotice, setSellerDepositNotice] = useState(defaultSellerDepositNotice);
  const [walletAccount, setWalletAccount] = useState({ provider: "", address: "", connectedAt: "", updatedAt: "" });
  const [financeAccount, setFinanceAccount] = useState({ availableBalance: 0, referralEarningsTotal: 0, pendingWithdrawal: 0, updatedAt: "" });
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
  const domI18nOriginalTextMapRef = useRef(new WeakMap());

  const t = themeMap[theme];
  const lang = translations[language] || translations.KR;
  const rate = coin === "USDT" ? 1392 : coin === "SOL" ? 238000 : 90000000;
  const fee = amount * rate * 0.01;
  const total = amount * rate + fee;
  const marketRate = getMarketRate(sellAsset, receiveAsset, receiveType);
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

  const sessionProfile = useMemo(() => deriveSessionProfile({
    legacyRole: currentRole,
    email: linkedGoogle,
    sessionRoleHint: meAuthUser?.session_role || null,
    salesLevel: meAuthUser?.sales_level ?? null,
  }), [currentRole, linkedGoogle, meAuthUser]);

  const canAccessAdmin = sessionProfile.sessionRole === SESSION_ROLE.SALES;
  const isSuperAdmin = sessionProfile.allowDestructiveAdminWrite || sessionProfile.sessionRole === SESSION_ROLE.HQ_OPS;
  const currentAdminActorId = useMemo(() => {
    const matched = authUsers.find((user) => user.email === linkedGoogle);
    return matched?.id || authUsers[0]?.id || 1;
  }, [authUsers, linkedGoogle]);
  useEffect(() => {
    if (!loggedIn) return;
    const me = authUsers.find((user) => String(user.id) === String(currentAdminActorId));
    if (!me) return;
    const nextRole = String(me.role || "");
    if (nextRole && nextRole !== currentRole) {
      setCurrentRole(nextRole);
      const nextProfile = deriveSessionProfile({
        legacyRole: nextRole,
        email: me.email || linkedGoogle,
        sessionRoleHint: me.session_role || null,
        salesLevel: me.sales_level ?? null,
      });
      if (!nextProfile.sessionRole || nextProfile.sessionRole !== SESSION_ROLE.SALES) {
        if (activePage === "admin") setActivePage("trade");
      }
      if (nextProfile.sessionRole === SESSION_ROLE.HQ_OPS) {
        window.location.assign("/owner");
        return;
      }
      if (!nextRole.includes("관리자") && activePage === "admin") {
        setActivePage("trade");
      }
    }
  }, [loggedIn, authUsers, currentAdminActorId, currentRole, activePage, linkedGoogle]);

  const primaryNavItems = useMemo(() => {
    return [
      { key: "trade", label: lang.menuTrade, show: true },
      { key: "sell", label: lang.sellRegister, show: true },
      { key: "myinfo", label: lang.myInfo, show: true },
      { key: "mytrades", label: lang.myTrades, show: true },
      { key: "friends", label: "친구", show: true },
      { key: "messenger", label: "메신저", show: true },
      { key: "admin", label: lang.admin, show: canAccessAdmin },
      { key: "support", label: lang.support, show: true },
    ].filter((item) => item.show);
  }, [lang, canAccessAdmin]);
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
        },
      }),
    [authToken, authRefreshToken]
  );

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
    if (myReferralCode) localStorage.setItem(MY_REFERRAL_CODE_KEY, myReferralCode);
  }, [myReferralCode]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search || "");
    const incomingReferral = String(params.get("ref") || params.get("referral") || "").trim();
    if (!incomingReferral) return;
    setReferralInput(incomingReferral);
  }, []);

  useEffect(() => {
    if (!authToken) return;
    apiClient.request("/api/admin/users", { auth: true })
      .then((data) => setAuthUsers(Array.isArray(data.users) ? data.users : []))
      .catch(() => {});
  }, [authToken, apiClient]);

  useEffect(() => {
    if (!authToken || !canAccessAdmin) return;
    apiClient.request("/api/admin/escrow-policy", { auth: true })
      .then((data) => {
        if (data?.policy) setEscrowPolicy(data.policy);
      })
      .catch(() => {});
    apiClient.request("/api/admin/disputes", { auth: true })
      .then((data) => setDisputeCases(Array.isArray(data.disputes) ? data.disputes : []))
      .catch(() => {});
  }, [authToken, canAccessAdmin, apiClient]);

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
        if (data?.account) setFinanceAccount(data.account);
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

  function notify(message) {
    setToast(localizeLoose(message, language));
    setTimeout(() => setToast(""), 1800);
  }

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

  async function loginWithEmailPassword(emailValue, passwordValue) {
    const loginData = await apiClient.request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: emailValue, password: passwordValue }),
    });
    applyEmailAuthSession(loginData, emailValue);
    notify("로그인 완료");
  }

  function applyEmailAuthSession(loginData, fallbackEmail = "") {
    const user = loginData?.user || {};
    setAuthToken(loginData?.accessToken || loginData?.token || "");
    setAuthRefreshToken(loginData?.refreshToken || "");
    setLoggedIn(true);
    setAccountType("이메일 계정");
    setCurrentRole(user.role || "회원");
    setNickname(user.nickname || "회원");
    setLinkedGoogle(user.email || fallbackEmail || "");
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
        const user = signupData.user || {};
        setAuthToken(signupData.accessToken || signupData.token || "");
        setAuthRefreshToken(signupData.refreshToken || "");
        setLoggedIn(true);
        setAccountType("이메일 계정");
        setCurrentRole(user.role || "회원");
        setNickname(user.nickname || "회원");
        setLinkedGoogle(user.email || email);
        setLinkedReferral(user.referred_by_code || referralInput || "");
        setMyReferralCode(user.referral_code || myReferralCode);
        setMergeStatus("DB 계정으로 가입됨");
        setLoginOpen(false);
        notify("회원가입 및 로그인 완료");
        return;
      }

      await loginWithEmailPassword(email, password);
    } catch (error) {
      notify(error.message || "인증 서버 연결에 실패했습니다. API 서버를 실행하세요.");
    }
  }

  function applyAuthSuccess(authData, fallbackEmail = "") {
    const user = authData?.user || {};
    const profile = deriveSessionProfile({
      legacyRole: user.role || "회원",
      email: user.email || fallbackEmail || "",
      sessionRoleHint: user.session_role || null,
      salesLevel: user.sales_level ?? null,
    });
    if (profile.sessionRole === SESSION_ROLE.HQ_OPS) {
      window.location.assign("/owner");
      return null;
    }
    setAuthToken(authData?.accessToken || authData?.token || "");
    setAuthRefreshToken(authData?.refreshToken || "");
    setLoggedIn(true);
    setCurrentRole(user.role || "회원");
    setNickname(user.nickname || "회원");
    setLinkedGoogle(user.email || fallbackEmail || "");
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
      setLinkedGoogle(email);
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
      if (financeData?.account) setFinanceAccount(financeData.account);
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
    if (key === "sell") {
      requireLogin(() => setSellOpen(true));
      return;
    }
    if (key === "admin") {
      requireLogin(() => {
        if (!canAccessAdmin) {
          notify("관리자 권한이 필요합니다.");
          return;
        }
        setActivePage("admin");
      });
      return;
    }
    setActivePage(key);
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
  const loginTestCandidates = (authUsers || [])
    .filter((user) => {
      if (loginTestAdminsOnly && !isLoginTestAdminLike(user)) return false;
      const keyword = loginTestSearch.trim().toLowerCase();
      if (!keyword) return true;
      return `${user?.id || ""} ${user?.email || ""} ${user?.nickname || ""} ${user?.role || ""}`.toLowerCase().includes(keyword);
    })
    .sort((a, b) => {
      const ai = loginRecentIds.indexOf(String(a?.id || ""));
      const bi = loginRecentIds.indexOf(String(b?.id || ""));
      if (ai === -1 && bi === -1) return 0;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    })
    .slice(0, 8);
  const recentQuickUsers = (loginRecentIds || [])
    .map((id) => (authUsers || []).find((user) => String(user?.id || "") === String(id)))
    .filter(Boolean)
    .slice(0, 3);

  async function quickTestLogin(user) {
    const emailValue = String(user?.email || "").trim().toLowerCase();
    if (!emailValue) return;
    setAuthTab("login");
    setAuthEmail(emailValue);
    setAuthPassword("");
    try {
      const loginData = await apiClient.request("/api/auth/test-login", {
        method: "POST",
        body: JSON.stringify({ email: emailValue }),
      });
      applyEmailAuthSession(loginData, emailValue);
      notify("테스트 로그인 완료");
    } catch (error) {
      const localUser = (authUsers || []).find(
        (item) => String(item?.email || "").trim().toLowerCase() === emailValue
      );
      if (!localUser) {
        notify(error.message || "테스트 로그인에 실패했습니다.");
        return;
      }
      setAuthToken("");
      setAuthRefreshToken("");
      setLoggedIn(true);
      setAccountType("테스트 로컬 계정");
      setCurrentRole(localUser.role || "회원");
      setNickname(localUser.nickname || "회원");
      setLinkedGoogle(localUser.email || emailValue);
      setLinkedReferral(localUser.referred_by_code || "");
      setMyReferralCode(localUser.referral_code || myReferralCode);
      setMergeStatus("API 미연결 - 로컬 테스트 로그인");
      setLoginRecentIds((prev) => {
        const nextId = String(localUser.id || "");
        const filtered = prev.filter((id) => String(id) !== nextId);
        return [nextId, ...filtered].slice(0, 12);
      });
      setLoginOpen(false);
      notify("API 미연결 - 로컬 테스트 로그인 완료");
    }
  }

  async function quickAutoTestLogin() {
    const fallback = (authUsers || []).find((user) => String(user?.email || "").toLowerCase() === "admin@tetherget.com") || (authUsers || [])[0];
    const target = recentQuickUsers[0] || fallback;
    if (!target) {
      notify("로그인 가능한 테스트 계정이 없습니다.");
      return;
    }
    await quickTestLogin(target);
  }

  return (
    <LanguageCodeContext.Provider value={language}>
    <LangContext.Provider value={lang}>
    <div className={`min-h-screen ${t.page}`}>
      {toast && <div className="fixed left-1/2 top-5 z-[100] -translate-x-1/2 rounded-2xl bg-black px-5 py-3 text-sm font-black text-white shadow-xl">{toast}</div>}
      {runtimeEmergencyState.emergencyMode && (
        <div className="sticky top-0 z-[95] border-b border-red-400/40 bg-red-600/95 px-4 py-2 text-center text-xs font-black text-white">
          비상 점검 모드 활성화: {runtimeEmergencyState.emergencyReason || "관리자 복구 작업 진행 중"}
          {runtimeEmergencyState.emergencyEta ? ` · ETA ${runtimeEmergencyState.emergencyEta}` : ""}
          {" · "}
          {runtimeEmergencyState.updatedAt || ""}
        </div>
      )}

      {loginOpen && (
        <Modal title="로그인 / 가입" desc="권장 순서: 1) 아이디(지메일) 2) 닉네임 3) 지갑 연결. 지갑으로 먼저 시작해도 같은 계정으로 통합됩니다." onClose={() => setLoginOpen(false)} theme={t}>
          <button onClick={quickAutoTestLogin} className={`mb-2 w-full rounded-2xl px-5 py-4 text-sm font-black ${t.main}`}>
            아이디 입력 없이 바로 테스트 로그인
          </button>
          <div className="mb-2 grid grid-cols-2 gap-2">
            <button
              onClick={() => quickTestLogin((authUsers || []).find((u) => String(u.email || "").toLowerCase() === "sales@tetherget.com"))}
              className={`rounded-2xl px-4 py-3 text-sm font-black ${t.main}`}
            >
              영업 테스트 로그인
            </button>
            <button
              onClick={handleGoogleClickLogin}
              className={`rounded-2xl border px-4 py-3 text-sm font-black ${t.input}`}
            >
              Google 클릭 로그인
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setAuthTab("login")}
              className={`rounded-2xl border px-4 py-3 font-black ${authTab === "login" ? t.main : t.input}`}
            >
              이메일 로그인
            </button>
            <button
              onClick={() => setAuthTab("signup")}
              className={`rounded-2xl border px-4 py-3 font-black ${authTab === "signup" ? t.main : t.input}`}
            >
              이메일 회원가입
            </button>
          </div>
          <Field label="이메일" theme={t}>
            <input
              value={authEmail}
              onChange={(e) => setAuthEmail(e.target.value)}
              className={`rounded-2xl border px-4 py-3 font-bold outline-none ${t.input}`}
              placeholder="예: user@gmail.com"
            />
          </Field>
          <Field label="비밀번호" theme={t}>
            <input
              type="password"
              value={authPassword}
              onChange={(e) => setAuthPassword(e.target.value)}
              className={`rounded-2xl border px-4 py-3 font-bold outline-none ${t.input}`}
              placeholder="6자 이상"
            />
          </Field>
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
          <button onClick={handleAuthSubmit} className={`rounded-2xl px-5 py-4 font-black ${t.main}`}>
            {authTab === "signup" ? "실전 회원가입" : "실전 로그인"}
          </button>
          <div className={`rounded-2xl border p-3 text-xs ${t.cardSoft}`}>
            기본 관리자 계정: <b>admin@tetherget.com / admin1234</b>
          </div>
          {false && (
          <div className={`rounded-2xl border p-3 ${t.cardSoft}`}>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-black">테스트 로그인 (검색)</div>
              <span className={`text-[11px] ${t.subtext}`}>{loginTestCandidates.length}건</span>
            </div>
            {recentQuickUsers.length > 0 && (
              <div className="mb-2 grid gap-1.5">
                {recentQuickUsers.map((user, idx) => (
                  <button
                    key={`RECENT-QUICK-${user.id}`}
                    onClick={() => quickTestLogin(user)}
                    className={`w-full rounded-xl px-3 py-2 text-left text-xs font-black ${t.main}`}
                  >
                    최근 {idx + 1} 바로 로그인: {user.nickname || "회원"} ({user.email || "-"})
                  </button>
                ))}
              </div>
            )}
            <div className="mb-2 flex items-center gap-2">
              <label className={`flex items-center gap-1 rounded-xl border px-2 py-1 text-[11px] font-black ${t.input}`}>
                <input
                  type="checkbox"
                  checked={loginTestAdminsOnly}
                  onChange={(e) => setLoginTestAdminsOnly(e.target.checked)}
                />
                관리자만 보기
              </label>
              <span className={`text-[11px] ${t.subtext}`}>최근 로그인 계정이 상단에 표시됩니다.</span>
            </div>
            <input
              value={loginTestSearch}
              onChange={(e) => setLoginTestSearch(e.target.value)}
              placeholder="닉네임, 이메일, ID, 권한 검색"
              className={`mb-2 w-full rounded-xl border px-3 py-2 text-xs font-bold outline-none ${t.input}`}
            />
            <div className="max-h-28 space-y-1 overflow-y-auto pr-1">
              {loginTestCandidates.map((user) => (
                <button
                  key={`LOGIN-TEST-${user.id}`}
                  onClick={() => quickTestLogin(user)}
                  className={`w-full rounded-xl border px-3 py-2 text-left text-xs font-black ${t.input}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span>{user.nickname || "회원"}</span>
                    <div className="flex items-center gap-1">
                      {loginRecentIds.includes(String(user.id || "")) && (
                        <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] text-white">최근</span>
                      )}
                      <span className={`rounded-full px-2 py-0.5 text-[10px] ${t.card}`}>{user.role || "회원"}</span>
                    </div>
                  </div>
                  <div className={`mt-0.5 text-[11px] ${t.subtext}`}>{user.email || "-"}</div>
                </button>
              ))}
            </div>
          </div>
          )}
          {true && (
          <>
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
          </>
          )}
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

      <header className={`sticky top-0 z-50 border-b ${t.header}`}>
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <button onClick={() => setActivePage("trade")} className="text-left">
            <div className="text-xl font-black">TetherGet</div>
            <div className={`text-xs font-bold ${t.muted}`}>Decentralized P2P Escrow MVP</div>
          </button>

          <nav className="hidden flex-nowrap items-center gap-2 overflow-x-auto md:flex">
            {primaryNavItems.map((item) => (
              <button key={item.key} onClick={() => openPage(item.key)} className={`whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-semibold ${activePage === item.key ? t.main : `${t.muted} hover:opacity-80`}`}>{item.label}</button>
            ))}
          </nav>

          <div className="hidden items-center gap-2 md:flex">
            <select value={language} onChange={(e) => { setLanguage(e.target.value); notify(`${languages.find((l) => l.code === e.target.value)?.label} 언어 적용`); }} className={`rounded-xl border px-3 py-2 text-sm font-bold outline-none ${t.input}`}>
              {languages.map((lang) => <option key={lang.code} value={lang.code}>{lang.flag} {lang.label}</option>)}
            </select>
            <select value={theme} onChange={(e) => setTheme(e.target.value)} className={`rounded-xl border px-3 py-2 text-sm font-bold outline-none ${t.input}`}>
              {Object.entries(themeMap).map(([key, val]) => <option key={key} value={key}>{val.name}</option>)}
            </select>
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
                setCurrentRole("회원");
                setMergeStatus("로그아웃됨");
                notify("Logout complete");
              }} className={`rounded-xl border px-4 py-2 text-sm font-bold ${t.input}`}>{lang.logout}</button>
            ) : (
              <button onClick={() => setLoginOpen(true)} className={`rounded-xl border px-4 py-2 text-sm font-bold ${t.input}`}>{lang.login}</button>
            )}
            <button onClick={() => requireLogin(() => notify("지갑이 연결되어 있습니다."))} className={`rounded-xl px-4 py-2 text-sm font-bold ${t.main}`}>{lang.connectWallet}</button>
          </div>

          <div className="flex items-center gap-2 md:hidden">
            <select value={language} onChange={(e) => setLanguage(e.target.value)} className={`rounded-xl border px-2 py-2 text-xs font-bold outline-none ${t.input}`}>
              {languages.map((lang) => <option key={lang.code} value={lang.code}>{lang.flag}</option>)}
            </select>
            <button onClick={() => setMenuOpen(!menuOpen)} className={`rounded-xl border px-3 py-2 text-sm font-bold ${t.input}`}>메뉴</button>
          </div>
        </div>

        {menuOpen && (
          <div className={`border-t px-4 py-3 md:hidden ${t.header}`}>
            {primaryNavItems.map((item) => (
              <button key={item.key} onClick={() => { setMenuOpen(false); openPage(item.key); }} className="block w-full rounded-xl px-4 py-3 text-left text-sm font-bold">{item.label}</button>
            ))}
            <select value={theme} onChange={(e) => setTheme(e.target.value)} className={`mt-2 w-full rounded-xl border px-4 py-3 text-sm font-bold outline-none ${t.input}`}>
              {Object.entries(themeMap).map(([key, val]) => <option key={key} value={key}>{val.name}</option>)}
            </select>
          </div>
        )}
      </header>

      <main>
        {!loggedIn ? (
          <>
            <section className="mx-auto grid max-w-7xl gap-8 px-4 py-10 md:grid-cols-2 md:py-16">
              <div className={theme === "dark" ? "text-white" : "text-slate-950"}>
                <div className={`inline-block rounded-full border px-4 py-2 text-sm font-black shadow-sm ${t.cardSoft}`}>{lang.heroBadge}</div>
                <h1 className="mt-6 whitespace-pre-line text-4xl font-black tracking-tight md:text-6xl">{lang.heroTitle}</h1>
                <p className={`mt-5 max-w-2xl text-lg leading-8 ${t.subtext}`}>{lang.heroDesc}</p>
                <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                  <button onClick={() => setLoginOpen(true)} className={`rounded-2xl px-6 py-4 font-black ${t.main}`}>{lang.loginJoin}</button>
                  <button onClick={() => setLoginOpen(true)} className={`rounded-2xl border px-6 py-4 font-black ${t.input}`}>{lang.startWallet}</button>
                </div>
                <div className="mt-8 grid gap-3 sm:grid-cols-3">
                  <Stat title="1% + 1%" text="구매자/판매자 수수료" theme={t} />
                  <Stat title="24H" text="기본 지연 릴리즈" theme={t} />
                  <Stat title="DAO" text="분쟁 중재 구조" theme={t} />
                </div>
              </div>

              <div className={`rounded-3xl border p-5 shadow-sm ${t.card}`}>
                <div className="text-xl font-black">{lang.beforeTrade}</div>
                <div className={`mt-2 text-sm leading-6 ${t.subtext}`}>가입 후 지갑 연결, 추천인 코드 저장, 판매자 예치, 구매자 증빙 업로드, 구매확인 후 자동 릴리즈 순서로 진행됩니다.</div>
                <div className="mt-5 grid gap-3">
                  <Info title="1. 로그인" text="구글 또는 지갑으로 가입하고 추천인 코드를 연결합니다." theme={t} />
                  <Info title="2. 지갑 연결" text="Phantom, Solflare, Backpack, MetaMask 등 지갑을 계정에 연결합니다." theme={t} />
                  <Info title="3. 안전거래" text="거래 상태와 증빙을 기록하고 분쟁 발생 시 신고할 수 있습니다." theme={t} />
                </div>
              </div>
            </section>

            <section className="mx-auto max-w-7xl px-4 pb-8">
              <div className="grid gap-4 md:grid-cols-4">
                <Info title="지갑 직접 보관" text="플랫폼이 고객 자산을 보관하지 않고 사용자의 지갑을 기준으로 거래합니다." theme={t} />
                <Info title="입금증빙 업로드" text="구매자는 송금 후 증빙 사진을 업로드하고 판매자는 구매확인을 진행합니다." theme={t} />
                <Info title="자동 릴리즈" text="판매자 구매확인 버튼 또는 정책 조건 충족 시 코인이 자동 지급됩니다." theme={t} />
                <Info title="사고신고 후 제공" text="피싱·사기 신고 접수 후 필요한 범위에서 거래정보 제공 구조를 둡니다." theme={t} />
              </div>
            </section>
          </>
        ) : null}

        {activePage === "trade" && (
          <TradeList
            theme={t}
            requireLogin={requireLogin}
            notify={notify}
            sellerDepositNotice={sellerDepositNotice}
            onReportDispute={registerDisputeCase}
            buyerKyc={buyerKyc}
            escrowPolicy={escrowPolicy}
          />
        )}
        {activePage === "myinfo" && <MyInfo nickname={nickname} setNickname={setNickname} bankRegistered={bankRegistered} setBankRegistered={setBankRegistered} buyerKyc={buyerKyc} setBuyerKyc={setBuyerKyc} apiClient={apiClient} myInfoTab={myInfoTab} setMyInfoTab={setMyInfoTab} showReferral={showReferral} setShowReferral={setShowReferral} theme={t} notify={notify} linkedGoogle={linkedGoogle} setLinkedGoogle={setLinkedGoogle} linkedWallet={linkedWallet} setLinkedWallet={setLinkedWallet} linkedReferral={linkedReferral} mergeStatus={mergeStatus} setMergeStatus={setMergeStatus} googleEmail={googleEmail} phantomWallet={phantomWallet} walletAccount={walletAccount} financeAccount={financeAccount} withdrawRequests={withdrawRequests} withdrawAmountInput={withdrawAmountInput} setWithdrawAmountInput={setWithdrawAmountInput} withdrawNoteInput={withdrawNoteInput} setWithdrawNoteInput={setWithdrawNoteInput} onConnectWallet={connectMyWallet} onRequestWithdrawal={requestWithdrawal} myReferralCode={myReferralCode} setMyReferralCode={setMyReferralCode} referralJoinLink={referralJoinLink} referralStats={referralStats} onSaveNickname={saveMyNickname} isSavingNickname={isSavingNickname} />}
        {activePage === "mytrades" && <MyTradesOnly theme={t} notify={notify} />}
        {activePage === "friends" && (
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
        )}
        {activePage === "messenger" && (
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
        )}
        {activePage === "p2p" && <P2PInfo theme={t} />}
        {activePage === "admin" && <AdminReferralPanel theme={t} notify={notify} isSuperAdmin={isSuperAdmin} apiClient={apiClient} authToken={authToken} authUsers={authUsers} setAuthUsers={setAuthUsers} buyerKyc={buyerKyc} setBuyerKyc={setBuyerKyc} friends={friends} chatRooms={chatRooms} sellerDepositNotice={sellerDepositNotice} setSellerDepositNotice={setSellerDepositNotice} escrowPolicy={escrowPolicy} setEscrowPolicy={setEscrowPolicy} disputeCases={disputeCases} approveDisputeCase={approveDisputeCase} finalizeDisputeByMain={finalizeDisputeByMain} currentAdminActorId={currentAdminActorId} finalApprovalPinInput={finalApprovalPinInput} setFinalApprovalPinInput={setFinalApprovalPinInput} finalApprovalOtpInput={finalApprovalOtpInput} setFinalApprovalOtpInput={setFinalApprovalOtpInput} newPolicyPinInput={newPolicyPinInput} setNewPolicyPinInput={setNewPolicyPinInput} selectedDisputeIdForTimeline={selectedDisputeIdForTimeline} setSelectedDisputeIdForTimeline={setSelectedDisputeIdForTimeline} selectedDisputeEvents={selectedDisputeEvents} setSelectedDisputeEvents={setSelectedDisputeEvents} timelineActionFilter={timelineActionFilter} setTimelineActionFilter={setTimelineActionFilter} timelineFromDate={timelineFromDate} setTimelineFromDate={setTimelineFromDate} timelineToDate={timelineToDate} setTimelineToDate={setTimelineToDate} adminMediaTypeFilter={adminMediaTypeFilter} setAdminMediaTypeFilter={setAdminMediaTypeFilter} adminMediaFriendFilter={adminMediaFriendFilter} setAdminMediaFriendFilter={setAdminMediaFriendFilter} adminActionLogs={adminActionLogs} appendAdminAction={appendAdminAction} adminMember={adminMember} setAdminMember={setAdminMember} adminParent={adminParent} setAdminParent={setAdminParent} adminReceivedRate={adminReceivedRate} setAdminReceivedRate={setAdminReceivedRate} adminRate={adminRate} setAdminRate={setAdminRate} adminMemo={adminMemo} setAdminMemo={setAdminMemo} adminUserSearch={adminUserSearch} setAdminUserSearch={setAdminUserSearch} selectedAdminUser={selectedAdminUser} setSelectedAdminUser={setSelectedAdminUser} selectedChildUser={selectedChildUser} setSelectedChildUser={setSelectedChildUser} securityFilter={securityFilter} setSecurityFilter={setSecurityFilter} blockReason={blockReason} setBlockReason={setBlockReason} />}
        {activePage === "support" && <Support theme={t} notify={notify} />}

      </main>
    </div>
    </LangContext.Provider>
    </LanguageCodeContext.Provider>
  );
}

function Modal({ title, desc, onClose, theme, children }) {
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 px-4">
      <div className={`w-full max-w-md rounded-3xl border p-4 shadow-2xl ${theme.card}`}>
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

function TradeList({ theme, requireLogin, notify, sellerDepositNotice, onReportDispute, buyerKyc, escrowPolicy }) {
  const lang = useLang();
  const language = useLanguageCode();
  const [query, setQuery] = useState("");
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [buyAmount, setBuyAmount] = useState("");
  const [proofUploaded, setProofUploaded] = useState(false);
  const [tradeRequested, setTradeRequested] = useState(false);
  const [tradeConfirmed, setTradeConfirmed] = useState(false);
  const [finalBuyReady, setFinalBuyReady] = useState(false);
  const [depositorName, setDepositorName] = useState("");
  const [sellerNameMatched, setSellerNameMatched] = useState(false);
  const [coinFilter, setCoinFilter] = useState("전체");
  const [currencyFilter, setCurrencyFilter] = useState("전체");
  const [categoryFilter, setCategoryFilter] = useState("전체");
  const [sortMode, setSortMode] = useState("상위노출");
  const [minAmount, setMinAmount] = useState("");
  const [delayNoticeAgreed, setDelayNoticeAgreed] = useState(false);

  function openTrade(order) {
    requireLogin(() => {
      setSelectedOrder(order);
      setBuyAmount("");
      setProofUploaded(false);
      setTradeRequested(false);
      setTradeConfirmed(false);
      setFinalBuyReady(false);
      setDepositorName("");
      setSellerNameMatched(false);
      setDelayNoticeAgreed(false);
      notify(`${order.seller} 거래 상세로 이동`);
    });
  }

  function getLevelDelayHours(level) {
    const delayMap = escrowPolicy?.levelDelayHours || {};
    if (level === "Lv.5") return Number(delayMap.Lv5 ?? 0);
    if (level === "Lv.4") return Number(delayMap.Lv4 ?? 12);
    if (level === "Lv.3") return Number(delayMap.Lv3 ?? 24);
    if (level === "Lv.2") return Number(delayMap.Lv2 ?? 36);
    return Number(delayMap.Lv1 ?? 48);
  }

  const featuredOrders = orders
    .filter((o) => o.featured || o.trust >= 95 || o.level === "Lv.5")
    .sort((a, b) => b.trust - a.trust)
    .slice(0, 3);

  const requestAmount = Number(buyAmount || 0);
  const isOverAmount = selectedOrder ? requestAmount > selectedOrder.amount : false;
  const isInvalidAmount = !requestAmount || requestAmount <= 0 || isOverAmount;
  const isKycReady = Boolean(buyerKyc?.companyApprovalStatus?.includes("승인") && buyerKyc?.privateStorageNoticeAccepted);
  const canRequestTrade = !isInvalidAmount && isKycReady && Boolean(depositorName.trim()) && delayNoticeAgreed;
  const canConfirmTrade = tradeRequested && !isInvalidAmount && sellerNameMatched;
  const expectedPay = selectedOrder ? requestAmount * selectedOrder.price : 0;
  const buyerFeeAmount = requestAmount * 0.01;
  const buyerReceiveAmount = Math.max(requestAmount - buyerFeeAmount, 0);
  const sellerFeeDeposit = selectedOrder ? selectedOrder.amount * 0.01 : 0;
  const sellerTotalEscrow = selectedOrder ? selectedOrder.amount + sellerFeeDeposit : 0;

  function requestTrade() {
    if (isInvalidAmount) {
      notify(isOverAmount ? "거래 가능 수량을 초과했습니다." : "구매 수량을 입력하세요.");
      return;
    }
    if (!isKycReady) {
      notify("회사 KYC 승인(비공개 보관) 완료 후 거래할 수 있습니다.");
      return;
    }
    if (!depositorName.trim()) {
      notify("입금자 이름을 입력하세요.");
      return;
    }
    if (!delayNoticeAgreed) {
      notify("레벨별 지연시간 및 취소 불가 정책 동의가 필요합니다.");
      return;
    }
    setTradeRequested(true);
    notify("거래 요청 전 확인이 필요합니다.");
  }

  function confirmTrade() {
    if (!tradeRequested) {
      notify("먼저 거래 요청을 눌러주세요.");
      return;
    }
    if (isInvalidAmount) {
      notify("수량을 다시 확인하세요.");
      return;
    }
    if (!sellerNameMatched) {
      notify("판매자 입금자명 일치 확인이 필요합니다.");
      return;
    }
    setFinalBuyReady(true);
    notify("최종 구매 확인 버튼을 눌러주세요.");
  }

  function finalizeTrade() {
    setTradeConfirmed(true);
    setFinalBuyReady(false);
    notify("거래 신청이 최종 확인되었습니다.");
  }

  const filtered = orders
    .filter((o) => `${o.seller} ${o.coin} ${o.method}`.toLowerCase().includes(query.toLowerCase()))
    .filter((o) => coinFilter === "전체" || o.coin === coinFilter)
    .filter((o) => currencyFilter === "전체" || o.method === currencyFilter)
    .filter((o) => categoryFilter === "전체" || o.category === categoryFilter)
    .filter((o) => !minAmount || o.amount >= Number(minAmount))
    .sort((a, b) => {
      if (sortMode === "상위노출") return Number(b.featured) - Number(a.featured) || b.trust - a.trust || b.trades - a.trades;
      if (sortMode === "신뢰도") return b.trust - a.trust;
      if (sortMode === "거래량") return b.trades - a.trades;
      if (sortMode === "낮은환율") return a.price - b.price;
      return b.price - a.price;
    });

  return (
    <section className={`mx-auto max-w-7xl px-4 py-8 ${theme.card.includes("slate-900") ? "text-white" : "text-slate-950"}`}>
      {selectedOrder && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 px-4">
          <div className={`w-full max-w-2xl rounded-3xl border p-6 shadow-2xl ${theme.card}`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-2xl font-black">{lang.tradeDetail}</div>
                <div className={`mt-1 text-sm ${theme.subtext}`}>{selectedOrder.seller} · {selectedOrder.coin} · {selectedOrder.method}</div>
              </div>
              <button onClick={() => setSelectedOrder(null)} className={`rounded-xl border px-3 py-2 text-sm font-black ${theme.input}`}>{lang.close}</button>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <DetailBox label={lang.seller} value={selectedOrder.seller} theme={theme} />
              <DetailBox label={lang.trust} value={`${selectedOrder.trust}%`} theme={theme} />
              <DetailBox label={localizeLoose("기준 환율", language)} value={`1 ${selectedOrder.coin} = ${number(selectedOrder.price)} ${selectedOrder.method}`} theme={theme} />
              <DetailBox label={lang.availableAmount} value={`${number(selectedOrder.amount)} ${selectedOrder.coin}`} theme={theme} />
              <DetailBox label={localizeLoose("거래 한도", language)} value={selectedOrder.limit} theme={theme} />
              <DetailBox label={localizeLoose("릴리즈 방식", language)} value={selectedOrder.release} theme={theme} />
              <DetailBox label={localizeLoose("판매자 1% 추가 예치", language)} value={`${sellerFeeDeposit.toFixed(4)} ${selectedOrder.coin}`} theme={theme} />
              <DetailBox label={localizeLoose("판매자 총 예치", language)} value={`${sellerTotalEscrow.toFixed(4)} ${selectedOrder.coin}`} theme={theme} />
            </div>

            <div className={`mt-5 rounded-3xl p-4 ${theme.cardSoft}`}>
              <Field label={`구매 수량 입력 (${selectedOrder.coin})`} theme={theme}>
                <input
                  value={buyAmount}
                  onChange={(e) => setBuyAmount(e.target.value)}
                  className={`rounded-2xl border px-4 py-3 font-bold outline-none ${theme.input}`}
                  placeholder={`예: 100 ${selectedOrder.coin}`}
                />
              </Field>
              <Field label="입금자 이름 (예금주)" theme={theme}>
                <input
                  value={depositorName}
                  onChange={(e) => setDepositorName(e.target.value)}
                  className={`rounded-2xl border px-4 py-3 font-bold outline-none ${theme.input}`}
                  placeholder="실제 송금 예금주명을 입력하세요"
                />
              </Field>
              <div className="mt-3 grid gap-2 text-sm">
                <div className="flex justify-between"><span>{lang.expectedPay}</span><b>{buyAmount ? `${number(expectedPay)} ${selectedOrder.method}` : `0 ${selectedOrder.method}`}</b></div>
                <div className="flex justify-between"><span>{lang.buyerFee}</span><b>{buyAmount ? `${buyerFeeAmount.toFixed(4)} ${selectedOrder.coin}` : `0 ${selectedOrder.coin}`}</b></div>
                <div className="flex justify-between"><span>{lang.finalReceive}</span><b>{buyAmount ? `${buyerReceiveAmount.toFixed(4)} ${selectedOrder.coin}` : `0 ${selectedOrder.coin}`}</b></div>
                {isOverAmount && <div className="rounded-2xl bg-red-600 p-3 font-black text-white">거래 가능 수량 {number(selectedOrder.amount)} {selectedOrder.coin}을 초과했습니다.</div>}
              </div>
            </div>
            <div className="mt-4 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm leading-6">
              <div className="font-black">{localizeLoose("판매자 확인 공지", language)}</div>
              <div className="mt-1">{localizeLoose(sellerDepositNotice, language)}</div>
              <div className="mt-2 rounded-xl bg-black/20 p-2 text-xs">
                {localizeLoose("구매자 인증 상태", language)}: {buyerKyc?.companyApprovalStatus}
              </div>
              <label className="mt-2 flex items-center gap-2 text-xs font-black">
                <input type="checkbox" checked={sellerNameMatched} onChange={(e) => setSellerNameMatched(e.target.checked)} />
                {localizeLoose("입금자 이름과 예금주가 일치함을 확인했을 때만 확인 버튼을 누르겠습니다.", language)}
              </label>
            </div>
            <div className="mt-3 rounded-2xl border border-red-500/40 bg-red-500/10 p-3 text-sm leading-6">
              <div className="font-black">{localizeLoose("레벨별 지연시간 및 취소 정책", language)}</div>
              <div className="mt-1">
                {localizeLoose("현재 등급", language)}: <b>{selectedOrder.level}</b> · {localizeLoose("지연시간", language)}:{" "}
                <b>{getLevelDelayHours(selectedOrder.level) === 0 ? localizeLoose("즉시 처리", language) : `${getLevelDelayHours(selectedOrder.level)}${localizeLoose("시간", language)}`}</b>
              </div>
              <div className="mt-1 text-xs">
                {localizeLoose("구매 요청 후 위 지연시간이 종료되기 전에는 취소할 수 없습니다. (분쟁 신고 절차 제외)", language)}
              </div>
              <label className="mt-2 flex items-center gap-2 text-xs font-black">
                <input type="checkbox" checked={delayNoticeAgreed} onChange={(e) => setDelayNoticeAgreed(e.target.checked)} />
                {localizeLoose("지연시간 및 취소 불가 안내를 확인했습니다.", language)}
              </label>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <button onClick={requestTrade} disabled={!canRequestTrade} className={`rounded-2xl px-4 py-3 text-sm font-black ${!canRequestTrade ? "bg-slate-500 text-white" : theme.main}`}>{lang.tradeRequest}</button>
              <button onClick={confirmTrade} disabled={!canConfirmTrade && !tradeConfirmed} className={`rounded-2xl border px-4 py-3 text-sm font-black ${tradeConfirmed ? "bg-emerald-600 text-white" : canConfirmTrade ? theme.main : "bg-slate-500 text-white"}`}>{tradeConfirmed ? "OK" : lang.confirmButton}</button>
              <button onClick={() => { setProofUploaded(true); notify("입금증빙 업로드 완료"); }} className={`rounded-2xl border px-4 py-3 text-sm font-black ${proofUploaded ? "bg-emerald-600 text-white" : theme.input}`}>{proofUploaded ? "OK" : lang.proofUpload}</button>
            </div>
            <button
              onClick={() =>
                onReportDispute?.({
                  orderSeller: selectedOrder.seller,
                  coin: selectedOrder.coin,
                  amount: requestAmount,
                  senderName: depositorName,
                  senderAccount: `${depositorName || "미입력"} 계좌`,
                })
              }
              className="mt-3 rounded-2xl bg-red-600 px-4 py-3 text-sm font-black text-white"
            >
              {localizeLoose("중단/분쟁 신고", language)}
            </button>
            {finalBuyReady && (
              <div className="mt-4 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4">
                <div className="text-sm font-black">{localizeLoose("최종적으로 구매하시겠습니까?", language)}</div>
                <div className="mt-1 text-sm">
                  {number(requestAmount)} {selectedOrder.coin} · 예상 송금액 {number(expectedPay)} {selectedOrder.method}
                </div>
                <button onClick={finalizeTrade} className="mt-3 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-black text-white">
                  {localizeLoose("최종 구매", language)}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <h2 className="text-2xl font-black md:text-3xl">P2P 거래</h2>
            <div className="flex flex-wrap gap-2">
              {countryFilters.map((c) => (
                <button
                  key={c.currency}
                  onClick={() => {
                    setCategoryFilter("코인↔통화");
                    setCurrencyFilter(c.currency);
                    notify(`${c.label} ${c.currency} 거래 리스트`);
                  }}
                  className={`rounded-2xl border px-3 py-2 text-sm font-black ${currencyFilter === c.currency ? theme.main : theme.input}`}
                >
                  {c.flag} {c.currency}
                </button>
              ))}
              <button
                onClick={() => {
                  setCurrencyFilter("전체");
                  setCategoryFilter("전체");
                  notify("전체 거래 리스트");
                }}
                className={`rounded-2xl border px-3 py-2 text-sm font-black ${currencyFilter === "전체" ? theme.main : theme.input}`}
              >
                🌐 전체
              </button>
            </div>
          </div>
          <p className={`mt-2 ${theme.subtext}`}>국가별 국기를 누르면 해당 통화 판매 등록 리스트가 바로 표시됩니다.</p>
        </div>
        <button onClick={() => notify("다른 P2P 거래 카테고리는 상단 리스트로 확장 예정입니다.")} className={`rounded-2xl border px-4 py-3 text-sm font-black ${theme.input}`}>다른 P2P 확장</button>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        {featuredOrders.map((o, idx) => (
          <div key={o.id} className={`rounded-3xl border p-5 shadow-sm ${theme.card}`}>
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-amber-500 px-3 py-1 text-xs font-black text-white">상위노출 #{idx + 1}</span>
              <span className="text-sm font-black text-emerald-500">신뢰 {o.trust}%</span>
            </div>
            <div className="mt-4 text-xl font-black">{o.seller}</div>
            <div className={`mt-1 text-sm ${theme.subtext}`}>{o.level} · 거래 {number(o.trades)}건 · {o.category}</div>
            <div className="mt-4 text-2xl font-black">{number(o.price)} {o.method}</div>
            <div className={`text-sm ${theme.subtext}`}>1 {o.coin} 기준</div>
            <button onClick={() => openTrade(o)} className={`mt-5 w-full rounded-2xl px-4 py-3 text-sm font-black ${theme.main}`}>{lang.tradeStart}</button>
          </div>
        ))}
      </div>

      <div className={`mb-5 rounded-3xl border p-5 shadow-sm ${theme.card}`}>
        <div className="mb-4 text-lg font-black">거래 조건 선택</div>
        <div className="grid gap-3 md:grid-cols-5">
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className={`rounded-2xl border px-4 py-3 text-sm font-bold outline-none ${theme.input}`}>
            <option>전체</option>
            <option>코인↔통화</option>
            <option>코인↔코인</option>
          </select>
          <select value={coinFilter} onChange={(e) => setCoinFilter(e.target.value)} className={`rounded-2xl border px-4 py-3 text-sm font-bold outline-none ${theme.input}`}>
            <option>전체</option>
            <option>USDT</option>
            <option>SOL</option>
            <option>BTC</option>
            <option>ETH</option>
          </select>
          <select value={currencyFilter} onChange={(e) => setCurrencyFilter(e.target.value)} className={`rounded-2xl border px-4 py-3 text-sm font-bold outline-none ${theme.input}`}>
            <option>전체</option>
            <option>KRW</option>
            <option>USD</option>
            <option>VND</option>
            <option>JPY</option>
            <option>USDT</option>
          </select>
          <select value={sortMode} onChange={(e) => setSortMode(e.target.value)} className={`rounded-2xl border px-4 py-3 text-sm font-bold outline-none ${theme.input}`}>
            <option>상위노출</option>
            <option>신뢰도</option>
            <option>거래량</option>
            <option>낮은환율</option>
            <option>높은환율</option>
          </select>
          <input value={minAmount} onChange={(e) => setMinAmount(e.target.value)} placeholder="최소 보유수량" className={`rounded-2xl border px-4 py-3 text-sm font-bold outline-none ${theme.input}`} />
        </div>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="판매자, 코인, 통화 검색" className={`mt-3 w-full rounded-2xl border px-4 py-3 text-sm outline-none ${theme.input}`} />
      </div>

      <div className={`mb-4 flex flex-col gap-2 rounded-2xl p-4 text-sm md:flex-row md:items-center md:justify-between ${theme.cardSoft}`}>
        <div><b>{filtered.length}개 거래</b> 표시 중 · 상위노출은 신뢰도/거래량/관리자 승인 기준</div>
        <div className={theme.muted}>거래가 수천 개가 되면 이 영역은 페이지네이션/무한스크롤로 확장</div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {filtered.map((o) => (
          <div key={o.id} className={`rounded-3xl border p-5 shadow-sm ${theme.card}`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className={`text-sm font-bold ${theme.muted}`}>{o.level} · {o.seller}</div>
                <div className="mt-3 text-2xl font-black">{number(o.price)} {o.method}</div>
                <div className={`mt-1 text-sm ${theme.subtext}`}>1 {o.coin} 기준 환율</div>
              </div>
              <div className="rounded-2xl bg-emerald-600 px-3 py-2 text-sm font-black text-white">신뢰 {o.trust}%</div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
              <div className={`rounded-2xl p-3 ${theme.cardSoft}`}><div className={theme.muted}>보유수량</div><div className="mt-1 font-black">{number(o.amount)} {o.coin}</div></div>
              <div className={`rounded-2xl p-3 ${theme.cardSoft}`}><div className={theme.muted}>거래횟수</div><div className="mt-1 font-black">{number(o.trades)}건</div></div>
            </div>
            <div className={`mt-4 space-y-2 text-sm ${theme.subtext}`}><div>거래한도: {o.limit}</div><div>방식: {o.category} · {o.release}</div></div>
            <button onClick={() => openTrade(o)} className={`mt-5 w-full rounded-2xl px-4 py-3 text-sm font-black ${theme.main}`}>{lang.tradeStart}</button>
          </div>
        ))}
      </div>
    </section>
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
              onClick={() => { setLinkedGoogle(googleEmail); setMergeStatus("기존 계정에 지메일 추가 연결 완료"); notify("지메일 추가 연결 완료"); }}
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
              출금 신청 시 회사 지갑에서 검토 후 순차 출금됩니다.
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

function MyTradesOnly({ theme, notify }) {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const filteredTrades = trades.filter((trade) => {
    const tradeDate = trade.time.slice(0, 10);
    if (fromDate && tradeDate < fromDate) return false;
    if (toDate && tradeDate > toDate) return false;
    return true;
  });

  return (
    <section className="mx-auto max-w-7xl px-4 py-8">
      <div className={`rounded-3xl border p-5 shadow-sm ${theme.card}`}>
        <div className="mb-5 flex items-center justify-between">
          <div>
            <div className="text-xl font-black">내 거래</div>
            <div className={`text-sm ${theme.subtext}`}>기간별 거래내역 · 입금증빙 · 상태조회</div>
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
            <div className={`rounded-2xl border p-4 text-sm ${theme.input}`}>선택한 기간의 거래 기록이 없습니다.</div>
          )}
        </div>
      </div>
    </section>
  );
}

function P2PInfo({ theme }) {
  return <section className="mx-auto max-w-7xl px-4 py-8"><div className={`rounded-3xl border p-6 shadow-sm ${theme.card}`}><h2 className="text-2xl font-black">P2P 운영 구조</h2><div className="mt-5 grid gap-4 md:grid-cols-3"><Info title="판매자 예치" text="판매자는 거래금액, 수수료, 가스비, 취소비용을 포함해 예치합니다." theme={theme} /><Info title="구매자 송금" text="구매자는 선택한 통화 종류 기준으로 송금 후 증빙을 업로드합니다." theme={theme} /><Info title="릴리즈" text="구매확인, 친구등록, 레벨정책, 지연이체 조건에 따라 코인이 지급됩니다." theme={theme} /></div></div></section>;
}

function AdminReferralPanel({ theme, notify, isSuperAdmin, apiClient, authToken, authUsers, setAuthUsers, buyerKyc, setBuyerKyc, friends, chatRooms, sellerDepositNotice, setSellerDepositNotice, escrowPolicy, setEscrowPolicy, disputeCases, approveDisputeCase, finalizeDisputeByMain, currentAdminActorId, finalApprovalPinInput, setFinalApprovalPinInput, finalApprovalOtpInput, setFinalApprovalOtpInput, newPolicyPinInput, setNewPolicyPinInput, selectedDisputeIdForTimeline, setSelectedDisputeIdForTimeline, selectedDisputeEvents, setSelectedDisputeEvents, timelineActionFilter, setTimelineActionFilter, timelineFromDate, setTimelineFromDate, timelineToDate, setTimelineToDate, adminMediaTypeFilter, setAdminMediaTypeFilter, adminMediaFriendFilter, setAdminMediaFriendFilter, adminActionLogs, appendAdminAction, adminMember, setAdminMember, adminParent, setAdminParent, adminReceivedRate, setAdminReceivedRate, adminRate, setAdminRate, adminMemo, setAdminMemo, adminUserSearch, setAdminUserSearch, selectedAdminUser, setSelectedAdminUser, selectedChildUser, setSelectedChildUser, securityFilter, setSecurityFilter, blockReason, setBlockReason }) {
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
  const [webhookAutoRefresh, setWebhookAutoRefresh] = useState(true);
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
  const [marketAssets, setMarketAssets] = useState([]);
  const [marketCatalog, setMarketCatalog] = useState([]);
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
  const [selectedChildRateInput, setSelectedChildRateInput] = useState("");
  const [selectedChildIds, setSelectedChildIds] = useState([]);
  const [bulkChildRateInput, setBulkChildRateInput] = useState("");
  const [childInlineRates, setChildInlineRates] = useState({});
  const [monitorPath, setMonitorPath] = useState([]);
  const [userRateOverrides, setUserRateOverrides] = useState({});
  const [stageByUserId, setStageByUserId] = useState({});
  const [virtualDownlineUsers, setVirtualDownlineUsers] = useState(() => createVirtualDownlineUsers(currentAdminActorId, 200));
  const [userParentOverrides, setUserParentOverrides] = useState({});
  const [userAdminAssignments, setUserAdminAssignments] = useState({});
  const [memberUserPage, setMemberUserPage] = useState(1);
  const [memberChildPage, setMemberChildPage] = useState(1);
  const [memberStageFilter, setMemberStageFilter] = useState("전체");
  const [memberListSort, setMemberListSort] = useState("joined_desc");
  const [downlineTargetUserId, setDownlineTargetUserId] = useState("");
  /** 우측 하부 트리 패널 전용 빠른 검색 (경로·선택 이동) */
  const [hierarchyQuickSearch, setHierarchyQuickSearch] = useState("");
  const [stageSelectionValue, setStageSelectionValue] = useState("");
  const [pendingStageValue, setPendingStageValue] = useState("");
  const [pendingStageFrom, setPendingStageFrom] = useState("");
  const [stageConfirmOpen, setStageConfirmOpen] = useState(false);
  const [stageConfirmTarget, setStageConfirmTarget] = useState("");
  const [showAdminDebug, setShowAdminDebug] = useState(false);
  const memberTreeSectionRef = useRef(null);
  const rateValidationSectionRef = useRef(null);
  const adminActionLogSectionRef = useRef(null);
  const hierarchyPathSectionRef = useRef(null);
  const directDownlineListRef = useRef(null);
  const lang = useLang();

  useEffect(() => {
    setVirtualDownlineUsers(createVirtualDownlineUsers(currentAdminActorId, 200));
  }, [currentAdminActorId]);

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

  const memberUsers = useMemo(() => {
    const authMapped = Array.isArray(authUsers) && authUsers.length ? authUsers.map((user, index) => mapAuthUserToMember(user, index)) : [];
    const source = [...authMapped, ...virtualDownlineUsers];
    const defaultStageFromRole = (user) => {
      const roleText = String(user?.role || "");
      if (roleText.includes("슈퍼관리자")) return ADMIN_STAGE_LABEL.SUPER_PAGE;
      if (roleText.includes("운영관리자") || roleText.includes("관리자")) return ADMIN_STAGE_LABEL.HQ_ADMIN;
      return ADMIN_STAGE_LABEL.MEMBER;
    };
    const effectiveParentOf = (candidate) =>
      userParentOverrides[candidate.id] != null ? userParentOverrides[candidate.id] : candidate.parent;
    return source.map((user) => {
      const childCount = source.filter((candidate) => String(effectiveParentOf(candidate)) === String(user.id)).length;
      const idKey = String(user.id);
      const fromApi = [user.stage_label, user.stageLabel].map((s) => String(s || "").trim()).find(Boolean);
      const byRuntimeMap = String(stageByUserId[idKey] || "").trim();
      const mergedStage = normalizeStageLabel(byRuntimeMap || fromApi || defaultStageFromRole(user));
      return { ...user, stageLabel: mergedStage, stage_label: mergedStage, children: childCount };
    });
  }, [authUsers, virtualDownlineUsers, stageByUserId, userParentOverrides]);
  const summaryScopeUsers = useMemo(
    () => memberUsers.filter((u) => String(u.id) !== String(currentAdminActorId)),
    [memberUsers, currentAdminActorId]
  );
  const searchableUsers = useMemo(() => {
    const q = adminUserSearch.toLowerCase().trim();
    const filtered = summaryScopeUsers.filter((u) => {
      const stageText = String(u.stageLabel || u.stage_label || "").trim();
      const hay = `${u.id} ${u.nickname} ${u.email} ${u.wallet} ${u.parent} ${stageText}`.toLowerCase();
      return hay.includes(q);
    });
    if (q.length >= 1) return filtered.slice(0, 400);
    return filtered.slice(0, 200);
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
  const downlineStageSummary = useMemo(() => getLevelCounts(engineUsers), [engineUsers]);
  const adminStats = useMemo(() => recalculateAdminStats(engineUsers), [engineUsers]);
  const treeIntegrity = useMemo(() => validateTreeIntegrity(engineUsers), [engineUsers]);
  const stageSummaryHealth = useMemo(() => {
    const total = Object.values(downlineStageSummary).reduce((acc, count) => acc + Number(count || 0), 0);
    const expected = engineUsers.length;
    return { total, expected, mismatch: total !== expected };
  }, [downlineStageSummary, engineUsers.length]);
  const visibleUsers = useMemo(() => {
    const stageUsers = memberStageFilter === "전체"
      ? searchableUsers
      : searchableUsers.filter((user) => String(user.stageLabel || user.stage_label || "") === memberStageFilter);
    const sorted = [...stageUsers];
    sorted.sort((a, b) => {
      if (memberListSort === "joined_asc") return String(a.joined || "").localeCompare(String(b.joined || ""));
      if (memberListSort === "joined_desc") return String(b.joined || "").localeCompare(String(a.joined || ""));
      if (memberListSort === "children_desc") return Number(b.children || 0) - Number(a.children || 0);
      if (memberListSort === "children_asc") return Number(a.children || 0) - Number(b.children || 0);
      if (memberListSort === "trades_desc") return Number(b.trades || 0) - Number(a.trades || 0);
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

  function getDefaultStage(user) {
    const roleText = String(user?.role || "");
    if (roleText.includes("슈퍼관리자")) return ADMIN_STAGE_LABEL.SUPER_PAGE;
    if (roleText.includes("운영관리자") || roleText.includes("관리자")) return ADMIN_STAGE_LABEL.HQ_ADMIN;
    return ADMIN_STAGE_LABEL.MEMBER;
  }

  function getEffectiveStage(user) {
    if (!user) return ADMIN_STAGE_LABEL.MEMBER;
    const idKey = String(user.id || "");
    const staged = String(stageByUserId[idKey] || "").trim();
    if (staged) return normalizeStageLabel(staged);
    return normalizeStageLabel(user.stageLabel || user.stage_label || getDefaultStage(user));
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

  useEffect(() => {
    if (!visibleUsers.length) return;
    const selectedId = String(selectedAdminUser?.id || "");
    const existsInMemberPool = selectedId ? memberUsers.some((u) => String(u.id) === selectedId) : false;
    const shouldReplaceSelection =
      !existsInMemberPool ||
      String(selectedAdminUser?.id) === String(currentAdminActorId);
    if (shouldReplaceSelection) {
      const first = visibleUsers[0];
      applyUserContext(first);
      setMonitorPath([first.id]);
    }
  }, [visibleUsers, memberUsers, currentAdminActorId]);

  const monitorStageTargetIdRef = useRef("");
  useEffect(() => {
    const nextId = monitorCurrentUser ? String(monitorCurrentUser.id) : "";
    if (!monitorCurrentUser) {
      monitorStageTargetIdRef.current = "";
      setStageSelectionValue("");
      setPendingStageValue("");
      return;
    }
    if (monitorStageTargetIdRef.current !== nextId) {
      monitorStageTargetIdRef.current = nextId;
      setPendingStageValue("");
    }
    setStageSelectionValue(getEffectiveStage(monitorCurrentUser));
  }, [monitorCurrentUser?.id, monitorCurrentUser?.stageLabel, monitorCurrentUser?.stage_label]);

  useEffect(() => {
    const id = selectedAdminUser?.id;
    if (id == null || id === "") return;
    const fresh = memberUsers.find((u) => String(u.id) === String(id));
    if (!fresh) return;
    if (fresh !== selectedAdminUser) {
      setSelectedAdminUser(fresh);
    }
  }, [memberUsers, selectedAdminUser]);

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
    const prevStageMap = { ...stageByUserId };
    const nextUsers = updateUserLevel(targetId, nextLevel, memberUsers);
    const nextStats = recalculateAdminStats(nextUsers);
    const nextIntegrity = validateTreeIntegrity(nextUsers);
    const nextTree = buildReferralTree(nextUsers);
    const targetUser = nextUsers.find((u) => String(u.id) === targetId);
    if (!targetUser) return false;

    const nextStageMap = {};
    for (const user of nextUsers) {
      const level = normalizeStageLabel(String(user.level || user.stageLabel || user.stage_label || ADMIN_STAGE_LABEL.MEMBER).trim());
      nextStageMap[String(user.id)] = level;
    }
    setStageByUserId(nextStageMap);

    setVirtualDownlineUsers((prev) =>
      prev.map((u) => {
        const mapped = nextStageMap[String(u.id)];
        if (!mapped) return u;
        return { ...u, level: mapped, stageLabel: mapped, stage_label: mapped };
      })
    );

    setSelectedAdminUser((prev) => {
      if (!prev || String(prev.id) !== targetId) return prev;
      return { ...prev, level: nextLevel, stageLabel: nextLevel, stage_label: nextLevel };
    });

    setPendingStageValue(nextLevel);
    setStageSelectionValue(nextLevel);
    setStageConfirmOpen(false);
    setStageConfirmTarget("");

    const requestedPersist = options.persist !== false;
    const isVirtualTarget = targetId.startsWith("VD-");
    const canPersistRealUser = Boolean(isSuperAdmin);
    const shouldPersist = requestedPersist && !isVirtualTarget && canPersistRealUser;
    if (!shouldPersist) {
      if (requestedPersist && !isVirtualTarget && !canPersistRealUser) {
        notify("실제 회원 단계 저장은 본사 계정만 가능합니다. 현재 변경은 로컬 시뮬레이션으로 반영됩니다.");
      }
      appendAdminAction?.(`단계 변경(로컬): ${targetId} -> ${nextLevel}`);
      notify(`단계 적용됨: ${targetUser.nickname} -> ${nextLevel}`);
      return true;
    }

    const parentNode = nextTree.byId.get(targetId);
    const ok = await updateAuthProfile(targetId, {
      stageLabel: nextLevel,
      parentUserRef: String(parentNode?.parentId || getEffectiveParent(targetUser) || ""),
      adminAssigned: isAdminAssignedUser(targetUser),
    });
    if (!ok) {
      setStageByUserId(prevStageMap);
      const rollbackVirtualUsers = updateUserLevel(targetId, prevStageMap[targetId] || "", nextUsers);
      setVirtualDownlineUsers((prev) =>
        prev.map((u) => {
          const restored = rollbackVirtualUsers.find((ru) => String(ru.id) === String(u.id));
          if (!restored) return u;
          const level = normalizeStageLabel(String(restored.level || restored.stageLabel || restored.stage_label || u.level || "").trim());
          return { ...u, level, stageLabel: level, stage_label: level };
        })
      );
      setSelectedAdminUser((prev) => {
        if (!prev || String(prev.id) !== targetId) return prev;
        const restoredLevel = normalizeStageLabel(String(prevStageMap[targetId] || prev.level || prev.stageLabel || prev.stage_label || "").trim());
        return { ...prev, level: restoredLevel, stageLabel: restoredLevel, stage_label: restoredLevel };
      });
      notify("단계 저장 실패: 변경을 되돌렸습니다. 다시 시도하세요.");
      return false;
    }
    appendAdminAction?.(
      `단계 변경: ${targetId} -> ${nextLevel} (합계 ${nextStats.levelCountSum}/${nextStats.totalUsers}, 무결성 ${nextIntegrity.ok ? "OK" : "FAIL"})`
    );
    notify(`단계 저장됨: ${targetUser.nickname} -> ${nextLevel}`);
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

  async function applySelectedStage() {
    if (!monitorCurrentUser) return;
    const isVirtualUser = String(monitorCurrentUser.id || "").startsWith("VD-");
    if (isSelfTargetMember) {
      notify("본인 계정의 단계는 변경할 수 없습니다.");
      return;
    }
    const fromSelect = String(stageSelectionValue || "").trim();
    const nextStage = normalizeStageLabel(fromSelect || getEffectiveStage(monitorCurrentUser));
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

  function confirmApplySelectedStage() {
    if (!monitorCurrentUser) return;
    const nextStage = String(stageConfirmTarget || "").trim();
    if (!nextStage) {
      setStageConfirmOpen(false);
      return;
    }
    setPendingStageValue(nextStage);
    setStageConfirmOpen(false);
    notify(`변경 확인됨: ${monitorCurrentUser.nickname} -> ${nextStage}. 저장 버튼으로 확정하세요.`);
  }

  async function saveSelectedStage() {
    await applySelectedStage();
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

  async function loadWebhookEvents() {
    try {
      setWebhookLoading(true);
      const data = await apiClient.request("/api/admin/webhook-events?limit=15", { auth: true });
      setWebhookEvents(Array.isArray(data.events) ? data.events : []);
    } catch (error) {
      notify(error.message || "웹훅 전송 이력 조회에 실패했습니다.");
    } finally {
      setWebhookLoading(false);
    }
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

  async function loadRecentReportHashes() {
    try {
      const data = await apiClient.request("/api/admin/audit/report-hashes?limit=8", { auth: true });
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
    } catch (error) {
      notify(error.message || "마켓 카탈로그 조회에 실패했습니다.");
    } finally {
      setMarketCatalogLoading(false);
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
        body: JSON.stringify({ assets: sanitizedAssets, markets: sanitizedMarkets }),
      });
      notify("마켓 카탈로그가 저장되었습니다.");
      await loadMarketCatalog();
    } catch (error) {
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
    loadWebhookEvents();
  }, []);

  useEffect(() => {
    loadApprovalAuditReport();
    loadRecentReportHashes();
    loadOpsRiskSummary();
    loadOpsSnapshots();
    loadMarketCatalog();
    loadEmergencyState();
  }, []);

  useEffect(() => {
    if (!webhookAutoRefresh) return;
    const timerId = setInterval(() => {
      loadWebhookEvents();
    }, 15000);
    return () => clearInterval(timerId);
  }, [webhookAutoRefresh]);

  const filteredWebhookEvents = (webhookEvents || []).filter((event) =>
    webhookStatusFilter === "all" ? true : event.status === webhookStatusFilter
  );
  const isAdminTab = (tab) => adminViewTab === tab;
  const adminCategories = [
    { key: "member", title: "회원관리", desc: "유저 선택, 하부 목록, 선택 유저 상세 확인", color: "bg-indigo-600" },
    { key: "memberOps", title: "회원운영", desc: "권한/배분/공지/관리 로그/운영 액션", color: "bg-sky-600" },
    { key: "security", title: "보안", desc: "위험 모니터링, 신고/블랙 정책", color: "bg-red-600" },
    { key: "kyc", title: "KYC", desc: "회사 승인, 문서 열람, 2인 승인 워크플로우", color: "bg-violet-600" },
    { key: "dispute", title: "분쟁/정산", desc: "다중승인, OTP 최종승인, 보관계좌 정책", color: "bg-amber-500" },
    { key: "ops", title: "감사/복구", desc: "감사리포트, 해시검증, 스냅샷/롤백/비상모드", color: "bg-emerald-600" },
  ];
  const adminTabTitleMap = {
    dashboard: "대시보드",
    member: "회원관리",
    memberOps: "회원운영",
    security: "보안",
    kyc: "KYC",
    dispute: "분쟁/정산",
    ops: "감사/복구",
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
            : adminViewTab === "ops"
              ? `리스크 점수: ${opsRiskSummary?.score ?? 0}`
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
            <span className={`rounded-full px-2 py-1 font-black text-white ${theme.main.includes("emerald") ? "bg-emerald-600" : "bg-slate-700"}`}>
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

        <div className={`sticky top-2 z-20 mb-4 rounded-3xl border p-2.5 backdrop-blur ${theme.cardSoft}`}>
          <div className="grid gap-2 md:grid-cols-7">
            <button onClick={() => setAdminViewTab("dashboard")} className={`rounded-xl border px-3 py-2 text-xs font-black ${isAdminTab("dashboard") ? theme.main : theme.input}`}>대시보드</button>
            <button onClick={() => setAdminViewTab("member")} className={`rounded-xl border px-3 py-2 text-xs font-black ${isAdminTab("member") ? theme.main : theme.input}`}>회원관리</button>
            <button onClick={() => setAdminViewTab("memberOps")} className={`rounded-xl border px-3 py-2 text-xs font-black ${isAdminTab("memberOps") ? theme.main : theme.input}`}>회원운영</button>
            <button onClick={() => setAdminViewTab("security")} className={`rounded-xl border px-3 py-2 text-xs font-black ${isAdminTab("security") ? theme.main : theme.input}`}>보안</button>
            <button onClick={() => setAdminViewTab("kyc")} className={`rounded-xl border px-3 py-2 text-xs font-black ${isAdminTab("kyc") ? theme.main : theme.input}`}>KYC</button>
            <button onClick={() => setAdminViewTab("dispute")} className={`rounded-xl border px-3 py-2 text-xs font-black ${isAdminTab("dispute") ? theme.main : theme.input}`}>분쟁/정산</button>
            <button onClick={() => setAdminViewTab("ops")} className={`rounded-xl border px-3 py-2 text-xs font-black ${isAdminTab("ops") ? theme.main : theme.input}`}>감사/복구</button>
          </div>
        </div>

        <div className="space-y-4">

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
              <div className="text-sm font-black">Webhook 전송 상태</div>
              <div className={`text-xs ${theme.muted}`}>최근 관리자 이벤트 전송 결과 (성공/실패/비활성)</div>
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
              <button onClick={loadWebhookEvents} className={`rounded-xl border px-3 py-2 text-xs font-black ${theme.input}`}>
                {webhookLoading ? "조회중..." : "새로고침"}
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
                return (
                  <div key={event.id} className={`flex items-center justify-between rounded-xl border p-2 text-xs ${theme.input}`}>
                    <div>
                      <div className="font-black">{event.event_type}</div>
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
                <div className={`text-xs ${theme.muted}`}>내 하부 가상 100명 · 단계별 분포 분석</div>
              </div>
              <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-black text-white">{visibleUsers.length}명</span>
            </div>
            <div className="mb-2 grid grid-cols-3 gap-1.5 md:grid-cols-6">
              <button
                onClick={() => setMemberStageFilter("전체")}
                className={`rounded-xl border px-2 py-1.5 text-center text-xs font-black ${memberStageFilter === "전체" ? theme.main : theme.input}`}
              >
                <div>전체</div>
                <div>{summaryScopeUsers.length}</div>
              </button>
              {Object.entries(downlineStageSummary).map(([stage, count]) => (
                <button
                  key={stage}
                  onClick={() => setMemberStageFilter(stage)}
                  className={`rounded-xl border px-2 py-1.5 text-center text-xs font-black ${memberStageFilter === stage ? theme.main : theme.input}`}
                >
                  <div>{stage}</div>
                  <div>{count}</div>
                </button>
              ))}
            </div>
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
                      <button onClick={applySelectedStage} disabled={isSelfTargetMember} className={`rounded-xl px-3 py-1.5 text-sm font-black ${isSelfTargetMember ? "bg-slate-500 text-white" : theme.main}`}>
                        단계 적용
                      </button>
                      <button onClick={saveSelectedStage} className={`rounded-xl border px-3 py-1.5 text-sm font-black ${isSelfTargetMember ? "bg-slate-500 text-white" : theme.input}`} disabled={isSelfTargetMember}>
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
                  {stageConfirmOpen && (
                    <div className="mt-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3">
                      <div className="text-sm font-black">단계를 적용하시겠습니까?</div>
                      <div className="mt-1 text-sm">
                        대상: {monitorCurrentUser.nickname} ({monitorCurrentUser.id}) · 변경: {getEffectiveStage(monitorCurrentUser)} {"->"} {stageConfirmTarget}
                      </div>
                      <div className="mt-2 flex gap-2">
                        <button onClick={confirmApplySelectedStage} className={`rounded-xl px-3 py-2 text-sm font-black ${theme.main}`}>
                          적용 확인
                        </button>
                        <button onClick={() => setStageConfirmOpen(false)} className={`rounded-xl border px-3 py-2 text-sm font-black ${theme.input}`}>
                          취소
                        </button>
                      </div>
                    </div>
                  )}
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
              {securityUsers.map((user) => (
                <button
                  key={user.id}
                  onClick={() => setSelectedSecurityUserId(user.id)}
                  className={`w-full rounded-2xl border p-3 text-left text-xs ${String(selectedSecurityUser?.id) === String(user.id) ? theme.main : theme.input}`}
                >
                  <div className="font-black">{user.nickname}</div>
                  <div className={`mt-1 ${theme.muted}`}>{user.id} · 위험 {user.riskScore}</div>
                  <div className={`mt-1 ${theme.muted}`}>신고 {user.reports}건 · 블랙 {user.blacklist ? "Y" : "N"}</div>
                </button>
              ))}
            </div>
          </div>

          <div className={`rounded-3xl border p-4 ${theme.card}`}>
            {selectedSecurityUser ? (
              <>
                <div className="grid gap-2 md:grid-cols-3">
                  <Admin title="위험 점수" value={selectedSecurityUser.riskScore} sub={selectedSecurityUser.blacklist ? "블랙리스트" : "모니터링"} />
                  <Admin title="신고 건수" value={selectedSecurityUser.reports} sub="누적 신고" />
                  <Admin title="최근 접속" value={selectedSecurityUser.lastLogin} sub={selectedSecurityUser.country} />
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
            <Admin title="전체 회원" value="100" sub="가상 회원 데이터" />
            <Admin title="위험 감지" value={securityUsers.filter((u) => u.riskScore >= 70).length} sub="위험점수 70 이상" />
            <Admin title="사고 신고" value={securityUsers.filter((u) => u.reports > 0).length} sub="신고 접수 회원" />
            <Admin title="블랙리스트" value={securityUsers.filter((u) => u.blacklist).length} sub="차단된 계정" />
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

        <div ref={adminActionLogSectionRef} className={`${false && isAdminTab("memberOps") ? "" : "hidden "}mt-5 rounded-3xl border p-5 ${theme.card}`}>
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

        <div className={`${false && isAdminTab("memberOps") ? "" : "hidden "}mt-5 rounded-3xl border p-5 ${theme.card}`}>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-xl font-black">관리자 액션 로그</div>
              <div className={`text-sm ${theme.subtext}`}>필터/권한 변경 등 관리자 행동 기록</div>
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
  const selectedPreview = (roomPreview || []).slice(-2);
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
                  selectedPreview.map((message) => (
                    <div key={message.id} className="rounded-xl bg-white/10 px-3 py-2">
                      {message.deleted ? "삭제된 메시지입니다." : message.text}
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl bg-white/10 px-3 py-2">미리보기 메시지가 없습니다.</div>
                )}
              </div>
              <button onClick={() => onOpenChat(selectedFriend?.id)} className="mt-3 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-black text-white">
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
  const filteredFriends = useMemo(
    () =>
      friends
        .filter((friend) => `${friend.nickname} ${friend.id}`.toLowerCase().includes((friendSearch || "").toLowerCase()))
        .sort((a, b) => Number(pinnedFriendIds.includes(b.id)) - Number(pinnedFriendIds.includes(a.id))),
    [friends, friendSearch, pinnedFriendIds]
  );
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
              {messages.length ? (
                messages.map((message) => (
                  <div key={message.id} className={`max-w-[86%] rounded-2xl px-3 py-1.5 text-xs leading-5 ${message.sender === "me" ? "ml-auto bg-emerald-600 text-white" : "bg-slate-700 text-white"}`}>
                    {message.attachment?.previewUrl && (
                      <img src={message.attachment.previewUrl} alt={message.attachment.name} className="mb-2 max-h-44 w-full rounded-xl object-cover" />
                    )}
                    {message.attachment && !message.attachment.previewUrl && (
                      <div className="mb-2 rounded-xl bg-black/20 p-2 text-xs font-black">
                        첨부파일: {message.attachment.name} ({number((message.attachment.size || 0) / 1024)}KB)
                      </div>
                    )}
                    {message.attachment?.audioUrl && (
                      <audio controls src={message.attachment.audioUrl} className="mb-2 w-full" />
                    )}
                    <div>{message.deleted ? "삭제된 메시지입니다." : message.text}</div>
                    <div className="mt-1 flex items-center justify-between gap-2 text-[10px] opacity-80">
                      <span>{message.createdAt} · {message.sender === "me" ? "전달됨" : "수신"}</span>
                      {!message.deleted && (
                        <button onClick={() => onDeleteMessage(selectedFriend?.id, message.id)} className="rounded bg-black/20 px-2 py-0.5 font-black">
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
  return <div className="rounded-2xl bg-black/10 p-3"><div className={theme.muted}>{localizeLoose(label, language)}</div><b>{localizeLoose(value, language)}</b></div>;
}

function Box({ label, value, theme }) {
  const language = useLanguageCode();
  return <div className={`rounded-2xl p-4 ${theme.cardSoft}`}><div className={`text-xs ${theme.muted}`}>{localizeLoose(label, language)}</div><div className="mt-1 font-black">{localizeLoose(value, language)}</div></div>;
}

function Admin({ title, value, sub }) {
  return <div className="rounded-3xl bg-white/10 p-4"><div className="text-sm text-slate-300">{title}</div><div className="mt-2 text-2xl font-black">{value}</div><div className="mt-1 text-xs text-slate-400">{sub}</div></div>;
}
