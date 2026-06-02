import { Router } from "express";

const SYMBOL_MAP: Record<string, string> = {
  "BTC/USD": "cryBTCUSD",
  "ETH/USD": "cryETHUSD",
  "EUR/USD": "frxEURUSD",
  "XAU/USD": "frxXAUUSD",
  "SPX500":  "OTC_SPX",
  "GBP/USD": "frxGBPUSD",
};

const GRANULARITY_MAP: Record<string, { granularity: number; count: number }> = {
  "1m":  { granularity: 60,    count: 120 },
  "5m":  { granularity: 300,   count: 120 },
  "15m": { granularity: 900,   count: 120 },
  "1h":  { granularity: 3600,  count: 120 },
  "4h":  { granularity: 14400, count: 120 },
  "1D":  { granularity: 86400, count: 120 },
  "1W":  { granularity: 86400, count: 200 },
};

interface DerivCandle {
  epoch: number;
  open: string;
  high: string;
  low: string;
  close: string;
}

interface DerivMsg {
  candles?: DerivCandle[];
  error?: { message: string };
}

// Deriv requires a numeric app_id. DERIV_APP_ID may hold an API token instead;
// only use it when it is actually numeric, otherwise fall back to the public demo id.
function resolveDerivAppId(): string {
  const raw = process.env.DERIV_APP_ID ?? "";
  const n   = parseInt(raw, 10);
  return !isNaN(n) && String(n) === raw.trim() ? raw.trim() : "1089";
}

function fetchDerivCandles(symbol: string, granularity: number, count: number): Promise<DerivCandle[]> {
  return new Promise((resolve, reject) => {
    const appId = resolveDerivAppId();
    // Node 24 exposes WebSocket as a global; cast through unknown to avoid DOM lib conflicts
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const WS = (globalThis as any).WebSocket as typeof WebSocket;
    const ws  = new WS(`wss://ws.binaryws.com/websockets/v3?app_id=${appId}`);
    const timer = setTimeout(() => { ws.close(); reject(new Error("Deriv timeout")); }, 12_000);

    ws.onopen = () => {
      ws.send(JSON.stringify({ ticks_history: symbol, count, end: "latest", granularity, style: "candles" }));
    };
    ws.onmessage = (ev: MessageEvent) => {
      let msg: DerivMsg;
      try { msg = JSON.parse(ev.data as string) as DerivMsg; } catch { return; }
      if (msg.error) { clearTimeout(timer); ws.close(); reject(new Error(msg.error.message)); return; }
      if (msg.candles) { clearTimeout(timer); ws.close(); resolve(msg.candles); }
    };
    ws.onerror = () => { clearTimeout(timer); reject(new Error("WebSocket error connecting to Deriv")); };
  });
}

const router = Router();

/* ── GET /api/market/candles?symbol=BTC%2FUSD&tf=1D ──────────────── */
router.get("/market/candles", async (req, res): Promise<void> => {
  const symbol = (req.query.symbol as string) ?? "";
  const tf = (req.query.tf as string) ?? "1D";
  const derivSymbol = SYMBOL_MAP[symbol];
  if (!derivSymbol) { res.status(400).json({ error: "Unknown symbol" }); return; }
  const { granularity, count } = GRANULARITY_MAP[tf] ?? { granularity: 86400, count: 120 };
  try {
    const candles = await fetchDerivCandles(derivSymbol, granularity, count);
    res.json(candles.map((c) => ({
      time: c.epoch,
      open: parseFloat(c.open),
      high: parseFloat(c.high),
      low: parseFloat(c.low),
      close: parseFloat(c.close),
    })));
  } catch (err) {
    req.log.error({ err }, "Error fetching candles from Deriv");
    res.status(502).json({ error: "Failed to fetch market data" });
  }
});

/* ── GET /api/market/prices — last-close price for all watchlist symbols */
router.get("/market/prices", async (req, res): Promise<void> => {
  const results = await Promise.allSettled(
    Object.entries(SYMBOL_MAP).map(async ([display, derivSym]) => {
      const candles = await fetchDerivCandles(derivSym, 86400, 2);
      const last = candles.at(-1)!;
      const prev = candles.length > 1 ? candles.at(-2)! : candles[0];
      const price = parseFloat(last.close);
      const prevClose = parseFloat(prev.close);
      const pct = ((price - prevClose) / prevClose) * 100;
      return {
        symbol: display,
        price,
        change: pct.toFixed(2),
        up: pct >= 0,
        open: parseFloat(last.open),
        high: parseFloat(last.high),
        low: parseFloat(last.low),
      };
    }),
  );

  const prices: Record<string, unknown> = {};
  for (const r of results) {
    if (r.status === "fulfilled") {
      prices[r.value.symbol] = r.value;
    }
  }
  res.json(prices);
});

export default router;
