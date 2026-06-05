/**
 * useDerivLiveCandles
 *
 * Opens a Deriv WebSocket subscription from the browser.
 * 1. Sends a `ticks_history` request with `subscribe: 1`
 * 2. Receives the full historical candle array first
 * 3. Then receives `ohlc` stream messages that update / append the live candle
 *
 * This gives the same real-time tick-by-tick movement as TradingView.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import type { Candle } from "@/components/chart/CandlestickChart";

export type LiveStatus = "connecting" | "live" | "error" | "closed";

/* ── Symbol / timeframe maps ──────────────────────────────── */
const SYMBOL_MAP: Record<string, string> = {
  "BTC/USD": "cryBTCUSD",
  "ETH/USD": "cryETHUSD",
  "EUR/USD": "frxEURUSD",
  "GBP/USD": "frxGBPUSD",
  "XAU/USD": "frxXAUUSD",
  "SPX500":  "OTC_SPX",
  "USD/JPY": "frxUSDJPY",
  "AUD/USD": "frxAUDUSD",
};

const TF_GRAN: Record<string, number> = {
  "1m":  60,
  "5m":  300,
  "15m": 900,
  "1h":  3600,
  "4h":  14400,
  "1D":  86400,
  "1W":  604800,
};

const TF_COUNT: Record<string, number> = {
  "1m":  500, "5m": 500, "15m": 500,
  "1h":  500, "4h": 500,
  "1D":  1000, "1W": 300,
};

const DERIV_WS = "wss://ws.binaryws.com/websockets/v3?app_id=1089";

/* ── Deriv message types ──────────────────────────────────── */
interface DerivHistCandle {
  epoch: number;
  open: string; high: string; low: string; close: string;
}
interface DerivOhlc {
  open_time: number;   // candle-start epoch  (matches historical `epoch`)
  open: string; high: string; low: string; close: string;
}
interface DerivMsg {
  candles?:     DerivHistCandle[];
  ohlc?:        DerivOhlc;
  subscription?: { id: string };
  error?:       { message: string; code: string };
}

/* ── Hook ─────────────────────────────────────────────────── */
export function useDerivLiveCandles(symbol: string, timeframe: string) {
  const [candles,  setCandles]  = useState<Candle[]>([]);
  const [status,   setStatus]   = useState<LiveStatus>("connecting");

  const wsRef      = useRef<WebSocket | null>(null);
  const candlesBuf = useRef<Candle[]>([]);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retries    = useRef(0);
  const unmounted  = useRef(false);

  const connect = useCallback(() => {
    if (unmounted.current) return;
    const derivSym  = SYMBOL_MAP[symbol];
    if (!derivSym) { setStatus("error"); return; }

    const granularity = TF_GRAN[timeframe] ?? 86400;
    const count       = TF_COUNT[timeframe] ?? 500;

    /* close previous socket */
    wsRef.current?.close();
    candlesBuf.current = [];
    setStatus("connecting");

    const ws = new WebSocket(DERIV_WS);
    wsRef.current = ws;

    const TIMEOUT = setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) { ws.close(); }
    }, 12_000);

    ws.onopen = () => {
      clearTimeout(TIMEOUT);
      ws.send(JSON.stringify({
        ticks_history: derivSym,
        count,
        end:         "latest",
        granularity,
        style:       "candles",
        subscribe:   1,
      }));
    };

    ws.onmessage = (ev) => {
      if (unmounted.current) return;
      let msg: DerivMsg;
      try { msg = JSON.parse(ev.data as string) as DerivMsg; } catch { return; }

      if (msg.error) {
        setStatus("error");
        return;
      }

      /* ── Historical batch ── */
      if (msg.candles?.length) {
        const hist: Candle[] = msg.candles.map((c) => ({
          time:  c.epoch,
          open:  parseFloat(c.open),
          high:  parseFloat(c.high),
          low:   parseFloat(c.low),
          close: parseFloat(c.close),
        }));
        candlesBuf.current = hist;
        setCandles([...hist]);
        setStatus("live");
        retries.current = 0;
      }

      /* ── Live OHLC tick ── */
      if (msg.ohlc) {
        const o = msg.ohlc;
        const live: Candle = {
          time:  o.open_time,
          open:  parseFloat(o.open),
          high:  parseFloat(o.high),
          low:   parseFloat(o.low),
          close: parseFloat(o.close),
        };
        const buf = candlesBuf.current;
        if (!buf.length) return;

        const last = buf[buf.length - 1];
        if (live.time === last.time) {
          /* update current candle in-place (avoid extra GC pressure) */
          buf[buf.length - 1] = live;
          setCandles([...buf]);
        } else if (live.time > last.time) {
          /* new candle opened */
          buf.push(live);
          setCandles([...buf]);
        }
      }
    };

    ws.onerror = () => {
      if (!unmounted.current) setStatus("error");
    };

    ws.onclose = () => {
      clearTimeout(TIMEOUT);
      if (unmounted.current) return;
      /* exponential back-off reconnect (max 30s) */
      const delay = Math.min(1000 * 2 ** retries.current, 30_000);
      retries.current += 1;
      setStatus("closed");
      retryTimer.current = setTimeout(connect, delay);
    };
  }, [symbol, timeframe]);

  /* (re)connect when symbol or timeframe changes */
  useEffect(() => {
    unmounted.current = false;
    retries.current   = 0;
    connect();
    return () => {
      unmounted.current = true;
      if (retryTimer.current) clearTimeout(retryTimer.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect]);

  const refetch = useCallback(() => {
    retries.current = 0;
    connect();
  }, [connect]);

  return { candles, status, refetch };
}
