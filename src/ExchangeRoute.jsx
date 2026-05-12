import { useEffect, useState } from "react";
import { ExchangeDeskShell } from "@tetherget/exchange";
import { loadExchangeMaxLeverage } from "./lib/exchangeAdminPolicy.js";

/**
 * Toss 스타일 거래소 데모 — paper 모드 + Bitget 시세/호가.
 * League: 동일 Shell 에 mode="league" + leagueTicker 등 주입.
 */
export default function ExchangeRoute() {
  const [maxLev, setMaxLev] = useState(() => loadExchangeMaxLeverage());

  useEffect(() => {
    function sync() {
      setMaxLev(loadExchangeMaxLeverage());
    }
    window.addEventListener("storage", sync);
    window.addEventListener("tgx-exchange-max-leverage-changed", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("tgx-exchange-max-leverage-changed", sync);
    };
  }, []);

  return (
    <ExchangeDeskShell
      mode="paper"
      instId="BTCUSDT"
      baseAsset="BTC"
      quoteAsset="USDT"
      label="비트코인"
      paperInitialQuote={50_000}
      paperInitialBase={0}
      maxPlatformLeverage={maxLev}
    />
  );
}
