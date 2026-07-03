import { Router } from "express";
import WebSocket from "ws";
import { db } from "@workspace/db";
import { marketCandlesTable } from "@workspace/db";
import { eq, and, gte, sql } from "drizzle-orm";

const SYMBOL_MAP: Record<string, string> = {
  "BTC/USD":  "cryBTCUSD",
  "ETH/USD":  "cryETHUSD",
  "EUR/USD":  "frxEURUSD",
  "GBP/USD":  "frxGBPUSD",
  "XAU/USD":  "frxXAUUSD",
  "XAG/USD":  "frxXAGUSD",
  "SPX500":   "OTC_SPX",
  "NDX100":   "OTC_NDX",
  "DJI":      "OTC_DJI",
  "FTSE100":  "OTC_FTSE",
  "USD/JPY":  "frxUSDJPY",
  "AUD/USD":  "frxAUDUSD",
  "NZD/USD":  "frxNZDUSD",
  "USD/CAD":  "frxUSDCAD",
  "USD/CHF":  "frxUSDCHF",
};

const GRANULARITY_MAP: Record<string, { granularity: number; derivCount: number; dbCount: number; cacheTtlSec: number }> = {
  "1m":  { granularity: 60,    derivCount: 500,  dbCount: 2000,  cacheTtlSec: 60    },
  "5m":  { granularity: 300,   derivCount: 500,  dbCount: 3000,  cacheTtlSec: 120   },
  "15m": { granularity: 900,   derivCount: 500,  dbCount: 3000,  cacheTtlSec: 300   },
  "1h":  { granularity: 3600,  derivCount: 500,  dbCount: 5000,  cacheTtlSec: 600   },
  "4h":  { granularity: 14400, derivCount: 500,  dbCount: 5000,  cacheTtlSec: 1800  },
  "1D":  { granularity: 86400, derivCount: 1000, dbCount: 10000, cacheTtlSec: 3600  },
  "1W":  { granularity: 604800,derivCount: 300,  dbCount: 1000,  cacheTtlSec: 7200  },
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

/** Load cached candles if fresh enough.
 *
 * Strategy: check whether the most-recently-fetched row for this
 * symbol+timeframe is within the TTL window.  If yes, serve ALL stored
 * candles (not just those fetched within the window) so accumulated
 * DB history grows over time.
 */
async function loadCachedCandles(
  symbol: string,
  timeframe: string,
  cacheTtlSec: number,
  count: number,
): Promise<{ time: number; open: number; high: number; low: number; close: number }[] | null> {
  // 1. Find the most recent fetchedAt for this symbol+timeframe
  const freshCheck = await db
    .select({ fetchedAt: marketCandlesTable.fetchedAt })
    .from(marketCandlesTable)
    .where(and(eq(marketCandlesTable.symbol, symbol), eq(marketCandlesTable.timeframe, timeframe)))
    .orderBy(sql`fetched_at DESC`)
    .limit(1);

  if (!freshCheck.length) return null;

  const mostRecent = freshCheck[0].fetchedAt;
  const cutoff = new Date(Date.now() - cacheTtlSec * 1000);
  if (mostRecent < cutoff) return null; // cache is stale — re-fetch from Deriv

  // 2. Serve all stored candles (accumulated history)
  const rows = await db
    .select()
    .from(marketCandlesTable)
    .where(and(eq(marketCandlesTable.symbol, symbol), eq(marketCandlesTable.timeframe, timeframe)))
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

  const { granularity, derivCount, dbCount, cacheTtlSec } = GRANULARITY_MAP[tf] ?? GRANULARITY_MAP["1D"];

  try {
    // Try DB cache first
    const cached = await loadCachedCandles(symbol, tf, cacheTtlSec, dbCount);
    if (cached) { res.json(cached); return; }

    // Fetch live from Deriv
    const derivCandles = await fetchDerivCandles(derivSymbol, granularity, derivCount);

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
        .limit(dbCount);
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

/* ── GET /api/market/stocks — Stooq CSV (no API key, server-friendly) ── */
const STOCK_TICKERS = [
  "AAPL","MSFT","NVDA","GOOGL","AMZN","META","TSLA","AVGO","JPM","V",
  "WMT","XOM","UNH","LLY","JNJ","MA","NFLX","AMD","ORCL","COST",
  "UBER","PYPL","INTC","QCOM","TXN","CRM","ADBE","MU","PANW","AMAT",
];

const STOCK_NAMES: Record<string, string> = {
  AAPL:"Apple", MSFT:"Microsoft", NVDA:"NVIDIA", GOOGL:"Alphabet",
  AMZN:"Amazon", META:"Meta", TSLA:"Tesla", AVGO:"Broadcom",
  JPM:"JPMorgan", V:"Visa", WMT:"Walmart", XOM:"ExxonMobil",
  UNH:"UnitedHealth", LLY:"Eli Lilly", JNJ:"Johnson & Johnson",
  MA:"Mastercard", NFLX:"Netflix", AMD:"AMD", ORCL:"Oracle", COST:"Costco",
  UBER:"Uber", PYPL:"PayPal", INTC:"Intel", QCOM:"Qualcomm", TXN:"Texas Instruments",
  CRM:"Salesforce", ADBE:"Adobe", MU:"Micron", PANW:"Palo Alto", AMAT:"Applied Materials",
};

interface StockRow {
  symbol: string; shortName: string;
  regularMarketPrice: number; regularMarketChange: number;
  regularMarketChangePercent: number; marketCap: number;
  regularMarketVolume: number; regularMarketDayHigh: number; regularMarketDayLow: number;
}

/** Fetch one stock via Yahoo Finance /v8/finance/chart (works from VPS). */
async function fetchYahooChart(symbol: string): Promise<StockRow | null> {
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=2d`;
  const r = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Accept": "application/json",
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) return null;
  const json = (await r.json()) as {
    chart?: {
      result?: Array<{
        meta?: {
          regularMarketPrice?: number;
          previousClose?: number;
          regularMarketDayHigh?: number;
          regularMarketDayLow?: number;
          regularMarketVolume?: number;
          marketCap?: number;
        };
      }>;
    };
  };
  const meta = json?.chart?.result?.[0]?.meta;
  if (!meta?.regularMarketPrice) return null;
  const price = meta.regularMarketPrice;
  const prev  = meta.previousClose ?? price;
  const chg   = price - prev;
  const pct   = prev > 0 ? (chg / prev) * 100 : 0;
  return {
    symbol,
    shortName: STOCK_NAMES[symbol] ?? symbol,
    regularMarketPrice: price,
    regularMarketChange: chg,
    regularMarketChangePercent: pct,
    marketCap: meta.marketCap ?? 0,
    regularMarketVolume: meta.regularMarketVolume ?? 0,
    regularMarketDayHigh: meta.regularMarketDayHigh ?? price,
    regularMarketDayLow:  meta.regularMarketDayLow  ?? price,
  };
}

/** Fetch all stocks in parallel batches of 8 to avoid rate limits. */
async function fetchAllStocks(): Promise<StockRow[]> {
  const BATCH = 8;
  const results: StockRow[] = [];
  for (let i = 0; i < STOCK_TICKERS.length; i += BATCH) {
    const batch = STOCK_TICKERS.slice(i, i + BATCH);
    const settled = await Promise.allSettled(batch.map(fetchYahooChart));
    for (const r of settled) {
      if (r.status === "fulfilled" && r.value) results.push(r.value);
    }
  }
  return results;
}

let _stocksCache: { ts: number; data: StockRow[] } | null = null;

router.get("/market/stocks", async (_req, res): Promise<void> => {
  if (_stocksCache && Date.now() - _stocksCache.ts < 5 * 60_000) {
    res.json(_stocksCache.data); return;
  }
  try {
    const quotes = await fetchAllStocks();
    if (quotes.length === 0) throw new Error("No quotes returned");
    _stocksCache = { ts: Date.now(), data: quotes };
    res.json(quotes);
  } catch (err) {
    if (_stocksCache) { res.json(_stocksCache.data); return; }
    res.status(502).json({ error: "Stock data unavailable", detail: String(err) });
  }
});

/* ── CMC new listings helper ─────────────────────────────────────── */
interface CmcListing {
  id: number; name: string; symbol: string; slug: string;
  date_added: string;
  quote: { USD: { price: number; percent_change_24h: number; market_cap: number; volume_24h: number } };
}

async function fetchCmcNewListings(limit = 20): Promise<unknown[]> {
  const apiKey = process.env.CMC_API_KEY;
  if (!apiKey) return [];
  const url = `https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest?sort=date_added&sort_dir=desc&limit=${limit}&convert=USD`;
  const res = await fetch(url, {
    headers: { "X-CMC_PRO_API_KEY": apiKey, "Accept": "application/json" },
  });
  if (!res.ok) throw new Error(`CMC ${res.status}`);
  const json = await res.json() as { data?: CmcListing[] };
  if (!Array.isArray(json.data)) return [];

  return json.data.map((c) => ({
    id: String(c.id),
    symbol: c.symbol,
    name: c.name,
    activated_at: Math.floor(new Date(c.date_added).getTime() / 1000),
    /* CMC logo URL pattern */
    image: `https://s2.coinmarketcap.com/static/img/coins/64x64/${c.id}.png`,
    current_price: c.quote.USD.price,
    price_change_percentage_24h: c.quote.USD.percent_change_24h,
    market_cap: c.quote.USD.market_cap,
    total_volume: c.quote.USD.volume_24h,
    market_cap_rank: null,
  }));
}

/* ── GET /api/market/overview — CoinGecko proxy with 2-min cache ─── */
let _overviewCache: { ts: number; data: unknown } | null = null;

router.get("/market/overview", async (_req, res): Promise<void> => {
  if (_overviewCache && Date.now() - _overviewCache.ts < 2 * 60_000) {
    res.json(_overviewCache.data);
    return;
  }
  try {
    const cgHeaders = { "Accept": "application/json", "User-Agent": "brightinsight/1.0" };
    const [coinsR, globalR, newR] = await Promise.allSettled([
      fetch(
        "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=80&page=1&sparkline=false&price_change_percentage=1h,24h,7d,30d,1y",
        { headers: cgHeaders },
      ).then((r) => r.json()),
      fetch("https://api.coingecko.com/api/v3/global", { headers: cgHeaders }).then((r) => r.json()),
      fetchCmcNewListings(20),
    ]);

    const data = {
      coins: coinsR.status === "fulfilled" && Array.isArray(coinsR.value) ? coinsR.value : [],
      global: globalR.status === "fulfilled" ? ((globalR.value as { data?: unknown })?.data ?? {}) : {},
      newListings: newR.status === "fulfilled" ? newR.value : [],
    };
    _overviewCache = { ts: Date.now(), data };
    res.json(data);
  } catch {
    res.status(502).json({ error: "Failed to fetch market overview" });
  }
});

export default router;
