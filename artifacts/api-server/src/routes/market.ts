import { Router } from "express";
import WebSocket from "ws";
import { db } from "@workspace/db";
import { marketCandlesTable } from "@workspace/db";
import { eq, and, gte, sql } from "drizzle-orm";

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

const GRANULARITY_MAP: Record<string, { granularity: number; count: number; cacheTtlSec: number }> = {
  "1m":  { granularity: 60,    count: 180, cacheTtlSec: 60    },
  "5m":  { granularity: 300,   count: 180, cacheTtlSec: 120   },
  "15m": { granularity: 900,   count: 180, cacheTtlSec: 300   },
  "1h":  { granularity: 3600,  count: 168, cacheTtlSec: 600   },
  "4h":  { granularity: 14400, count: 120, cacheTtlSec: 1800  },
  "1D":  { granularity: 86400, count: 200, cacheTtlSec: 3600  },
  "1W":  { granularity: 86400, count: 200, cacheTtlSec: 7200  },
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

function resolveDerivAppId(): string {
  const raw = process.env.DERIV_APP_ID ?? "";
  const n   = parseInt(raw, 10);
  return !isNaN(n) && String(n) === raw.trim() ? raw.trim() : "1089";
}

function fetchDerivCandles(symbol: string, granularity: number, count: number): Promise<DerivCandle[]> {
  return new Promise((resolve, reject) => {
    const appId = resolveDerivAppId();
    const ws = new WebSocket(`wss://ws.binaryws.com/websockets/v3?app_id=${appId}`);
    const timer = setTimeout(() => { ws.close(); reject(new Error("Deriv timeout")); }, 15_000);

    ws.onopen = () => {
      ws.send(JSON.stringify({ ticks_history: symbol, count, end: "latest", granularity, style: "candles" }));
    };
    ws.onmessage = (ev) => {
      let msg: DerivMsg;
      try { msg = JSON.parse(ev.data.toString()) as DerivMsg; } catch { return; }
      if (msg.error) { clearTimeout(timer); ws.close(); reject(new Error(msg.error.message)); return; }
      if (msg.candles) { clearTimeout(timer); ws.close(); resolve(msg.candles); }
    };
    ws.onerror = () => { clearTimeout(timer); reject(new Error("WebSocket error connecting to Deriv")); };
  });
}

/** Persist fetched candles into DB (upsert) */
async function storeCandles(
  symbol: string,
  timeframe: string,
  candles: DerivCandle[],
): Promise<void> {
  if (!candles.length) return;
  const rows = candles.map((c) => ({
    symbol,
    timeframe,
    epoch: c.epoch,
    open:  parseFloat(c.open),
    high:  parseFloat(c.high),
    low:   parseFloat(c.low),
    close: parseFloat(c.close),
    fetchedAt: new Date(),
  }));
  await db
    .insert(marketCandlesTable)
    .values(rows)
    .onConflictDoUpdate({
      target: [marketCandlesTable.symbol, marketCandlesTable.timeframe, marketCandlesTable.epoch],
      set: {
        open:      sql`excluded.open`,
        high:      sql`excluded.high`,
        low:       sql`excluded.low`,
        close:     sql`excluded.close`,
        fetchedAt: sql`excluded.fetched_at`,
      },
    });
}

/** Load cached candles if fresh enough */
async function loadCachedCandles(
  symbol: string,
  timeframe: string,
  cacheTtlSec: number,
  count: number,
): Promise<{ time: number; open: number; high: number; low: number; close: number }[] | null> {
  const cutoff = new Date(Date.now() - cacheTtlSec * 1000);
  const rows = await db
    .select()
    .from(marketCandlesTable)
    .where(
      and(
        eq(marketCandlesTable.symbol, symbol),
        eq(marketCandlesTable.timeframe, timeframe),
        gte(marketCandlesTable.fetchedAt, cutoff),
      ),
    )
    .orderBy(marketCandlesTable.epoch)
    .limit(count);

  if (rows.length < 10) return null;
  return rows.map((r) => ({ time: r.epoch, open: r.open, high: r.high, low: r.low, close: r.close }));
}

const router = Router();

/* ── GET /api/market/candles?symbol=BTC%2FUSD&tf=1D ──────────────── */
router.get("/market/candles", async (req, res): Promise<void> => {
  const symbol = (req.query.symbol as string) ?? "";
  const tf     = (req.query.tf as string) ?? "1D";
  const derivSymbol = SYMBOL_MAP[symbol];
  if (!derivSymbol) { res.status(400).json({ error: "Unknown symbol" }); return; }

  const { granularity, count, cacheTtlSec } = GRANULARITY_MAP[tf] ?? GRANULARITY_MAP["1D"];

  try {
    // Try DB cache first
    const cached = await loadCachedCandles(symbol, tf, cacheTtlSec, count);
    if (cached) { res.json(cached); return; }

    // Fetch live from Deriv
    const derivCandles = await fetchDerivCandles(derivSymbol, granularity, count);

    // Persist to DB in background (don't block the response)
    storeCandles(symbol, tf, derivCandles).catch(() => { /* non-fatal */ });

    res.json(
      derivCandles.map((c) => ({
        time:  c.epoch,
        open:  parseFloat(c.open),
        high:  parseFloat(c.high),
        low:   parseFloat(c.low),
        close: parseFloat(c.close),
      })),
    );
  } catch (err) {
    req.log.error({ err }, "Error fetching candles from Deriv");

    // Fallback: serve any cached data even if stale
    try {
      const stale = await db
        .select()
        .from(marketCandlesTable)
        .where(and(eq(marketCandlesTable.symbol, symbol), eq(marketCandlesTable.timeframe, tf)))
        .orderBy(marketCandlesTable.epoch)
        .limit(count);
      if (stale.length) {
        res.json(stale.map((r) => ({ time: r.epoch, open: r.open, high: r.high, low: r.low, close: r.close })));
        return;
      }
    } catch { /* ignore */ }

    res.status(502).json({ error: "Failed to fetch market data" });
  }
});

/* ── GET /api/market/prices — latest price for each symbol ─────────── */
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
        low:  parseFloat(last.low),
      };
    }),
  );

  const prices: Record<string, unknown> = {};
  for (const r of results) {
    if (r.status === "fulfilled") prices[r.value.symbol] = r.value;
  }
  res.json(prices);
});

export default router;
