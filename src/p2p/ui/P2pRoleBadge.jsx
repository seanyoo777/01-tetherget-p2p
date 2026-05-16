import React from "react";
import { isP2pTradeDark } from "./p2pTradeShell.js";

export function P2pRoleBadge({ role, theme }) {
  const isDark = isP2pTradeDark(theme);
  if (role === "buyer") {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black ${
          isDark ? "bg-sky-500/20 text-sky-200 ring-1 ring-sky-400/40" : "bg-sky-100 text-sky-800 ring-1 ring-sky-200"
        }`}
      >
        구매자 Buyer
      </span>
    );
  }
  if (role === "seller") {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black ${
          isDark ? "bg-amber-500/20 text-amber-200 ring-1 ring-amber-400/40" : "bg-amber-100 text-amber-900 ring-1 ring-amber-200"
        }`}
      >
        판매자 Seller
      </span>
    );
  }
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${theme.cardSoft}`}>관찰</span>
  );
}
