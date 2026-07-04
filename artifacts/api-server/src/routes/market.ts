import { Router } from "express";
import WebSocket from "ws";
import { db } from "@workspace/db";
import { marketCandlesTable, marketCacheTable } from "@workspace/db";
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

/* ── CMC new listings — DB-backed hourly cache ───────────────────── */
const CMC_CACHE_KEY = "cmc_new_listings";
const CMC_TTL_MS    = 60 * 60 * 1000; /* 1 hour */

interface CmcListing {
  id: number; name: string; symbol: string; slug: string;
  date_added: string;
  quote: { USD: { price: number; percent_change_24h: number; market_cap: number; volume_24h: number } };
}

function cmcToRow(c: CmcListing) {
  return {
    id:                        String(c.id),
    symbol:                    c.symbol,
    name:                      c.name,
    activated_at:              Math.floor(new Date(c.date_added).getTime() / 1000),
    image:                     `https://s2.coinmarketcap.com/static/img/coins/64x64/${c.id}.png`,
    current_price:             c.quote.USD.price,
    price_change_percentage_24h: c.quote.USD.percent_change_24h,
    market_cap:                c.quote.USD.market_cap,
    total_volume:              c.quote.USD.volume_24h,
    market_cap_rank:           null,
  };
}

async function fetchFromCmc(): Promise<unknown[]> {
  const apiKey = process.env.CMC_API_KEY;
  if (!apiKey) { console.warn("[CMC] CMC_API_KEY not set"); return []; }
  const url = "https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest?sort=date_added&sort_dir=desc&limit=20&convert=USD";
  const res  = await fetch(url, { headers: { "X-CMC_PRO_API_KEY": apiKey, "Accept": "application/json" } });
  if (!res.ok) throw new Error(`CMC HTTP ${res.status}`);
  const json = await res.json() as { data?: CmcListing[] };
  if (!Array.isArray(json.data)) throw new Error("CMC: unexpected response shape");
  return json.data.map(cmcToRow);
}

async function refreshCmcCache(): Promise<void> {
  try {
    const listings = await fetchFromCmc();
    await db.insert(marketCacheTable)
      .values({ key: CMC_CACHE_KEY, data: listings })
      .onConflictDoUpdate({ target: marketCacheTable.key, set: { data: listings, fetchedAt: new Date() } });
    console.info(`[CMC] Saved ${listings.length} new listings to DB`);
  } catch (err) {
    console.error("[CMC] Refresh failed:", err);
  }
}

async function getCmcListings(): Promise<unknown[]> {
  try {
    const row = await db.select().from(marketCacheTable).where(eq(marketCacheTable.key, CMC_CACHE_KEY)).limit(1);
    if (row.length && row[0].fetchedAt && Date.now() - row[0].fetchedAt.getTime() < CMC_TTL_MS) {
      return row[0].data as unknown[];
    }
    /* Stale or missing — refresh now and return whatever we get */
    await refreshCmcCache();
    const fresh = await db.select().from(marketCacheTable).where(eq(marketCacheTable.key, CMC_CACHE_KEY)).limit(1);
    return fresh.length ? (fresh[0].data as unknown[]) : [];
  } catch (err) {
    console.error("[CMC] getCmcListings error:", err);
    return [];
  }
}

/* Kick off on server start and refresh every hour */
getCmcListings().catch(() => {});
setInterval(() => refreshCmcCache().catch(() => {}), CMC_TTL_MS);

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
      getCmcListings(),
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

/* ── Helpers ─────────────────────────────────────────────────────── */
async function dbCacheGet<T>(key: string, ttlMs: number): Promise<T | null> {
  const rows = await db.select().from(marketCacheTable).where(eq(marketCacheTable.key, key)).limit(1);
  if (rows.length && Date.now() - rows[0].fetchedAt.getTime() < ttlMs) return rows[0].data as T;
  return null;
}
async function dbCacheSet(key: string, data: unknown): Promise<void> {
  await db.insert(marketCacheTable).values({ key, data })
    .onConflictDoUpdate({ target: marketCacheTable.key, set: { data, fetchedAt: new Date() } });
}

/* ── Forex pairs — frankfurter.app (free, no key) ────────────────── */
const FOREX_PAIR_LIST = [
  "EUR/USD","GBP/USD","USD/JPY","USD/CHF","AUD/USD","NZD/USD","USD/CAD","EUR/GBP","EUR/JPY","GBP/JPY",
];
const FOREX_FLAGS: Record<string, string> = {
  "EUR/USD":"🇪🇺🇺🇸","GBP/USD":"🇬🇧🇺🇸","USD/JPY":"🇺🇸🇯🇵","USD/CHF":"🇺🇸🇨🇭",
  "AUD/USD":"🇦🇺🇺🇸","NZD/USD":"🇳🇿🇺🇸","USD/CAD":"🇺🇸🇨🇦","EUR/GBP":"🇪🇺🇬🇧",
  "EUR/JPY":"🇪🇺🇯🇵","GBP/JPY":"🇬🇧🇯🇵",
};

function calcFxRate(pair: string, rates: Record<string, number>): number | null {
  const [b, q] = pair.split("/");
  if (!b || !q) return null;
  if (b === "USD") return rates[q] ?? null;
  if (q === "USD") return rates[b] ? 1 / rates[b] : null;
  return (rates[q] && rates[b]) ? rates[q] / rates[b] : null;
}

/* ECB 90-day history XML — EUR-based rates (1 EUR = X foreign) */
function parseEcbXml(xml: string): Array<{ date: string; rates: Record<string, number> }> {
  /* Match outer day blocks — ECB uses double quotes in hist XML */
  const dayRe = /<Cube time=["']([\d-]+)["'][^>]*>([\s\S]*?)<\/Cube>/g;
  const results: Array<{ date: string; rates: Record<string, number> }> = [];
  let dm: RegExpExecArray | null;
  while ((dm = dayRe.exec(xml)) !== null && results.length < 2) {
    const rates: Record<string, number> = {};
    const rr = /<Cube currency=["']([A-Z]+)["'] rate=["']([\d.]+)["']\/>/g;
    let rm: RegExpExecArray | null;
    while ((rm = rr.exec(dm[2])) !== null) rates[rm[1]] = parseFloat(rm[2]);
    results.push({ date: dm[1], rates });
  }
  return results;
}

/* Compute pair rate from ECB EUR-base rates */
function calcEcbRate(pair: string, r: Record<string, number>): number | null {
  switch (pair) {
    case "EUR/USD": return r.USD ?? null;
    case "GBP/USD": return r.USD && r.GBP ? r.USD / r.GBP : null;
    case "USD/JPY": return r.JPY && r.USD ? r.JPY / r.USD : null;
    case "USD/CHF": return r.CHF && r.USD ? r.CHF / r.USD : null;
    case "AUD/USD": return r.USD && r.AUD ? r.USD / r.AUD : null;
    case "NZD/USD": return r.USD && r.NZD ? r.USD / r.NZD : null;
    case "USD/CAD": return r.CAD && r.USD ? r.CAD / r.USD : null;
    case "EUR/GBP": return r.GBP ?? null;
    case "EUR/JPY": return r.JPY ?? null;
    case "GBP/JPY": return r.JPY && r.GBP ? r.JPY / r.GBP : null;
    default: return null;
  }
}

async function fetchForexPairs() {
  const res = await fetch("https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml", {
    headers: { "User-Agent": "brightinsight/1.0", "Accept": "application/xml, text/xml" },
  });
  if (!res.ok) throw new Error(`ECB ${res.status}`);
  const xml  = await res.text();
  const days = parseEcbXml(xml);
  const today = days[0]?.rates ?? {};
  const yday  = days[1]?.rates ?? {};
  return FOREX_PAIR_LIST.map((pair) => {
    const price  = calcEcbRate(pair, today);
    const prev   = calcEcbRate(pair, yday);
    const change = price && prev ? ((price - prev) / prev) * 100 : null;
    return { pair, flags: FOREX_FLAGS[pair] ?? "🌐", price, change };
  }).filter((r) => r.price !== null);
}

router.get("/market/forex-pairs", async (_req, res): Promise<void> => {
  try {
    const cached = await dbCacheGet<unknown[]>("forex_pairs", 10 * 60_000);
    if (cached) { res.json(cached); return; }
    const data = await fetchForexPairs();
    await dbCacheSet("forex_pairs", data);
    res.json(data);
  } catch (err) {
    const stale = await dbCacheGet<unknown[]>("forex_pairs", Infinity);
    if (stale) { res.json(stale); return; }
    res.status(502).json({ error: "Forex data unavailable", detail: String(err) });
  }
});

/* ── Commodities pairs — Yahoo Finance v7 quote ──────────────────── */
const COMMODITY_META: Record<string, { name: string; unit: string; emoji: string }> = {
  "GC=F":  { name: "Gold",         unit: "oz",    emoji: "🥇" },
  "SI=F":  { name: "Silver",       unit: "oz",    emoji: "🥈" },
  "CL=F":  { name: "Crude Oil WTI",unit: "bbl",   emoji: "🛢️" },
  "NG=F":  { name: "Natural Gas",  unit: "MMBtu", emoji: "🔥" },
  "HG=F":  { name: "Copper",       unit: "lb",    emoji: "🔶" },
  "ZW=F":  { name: "Wheat",        unit: "bu",    emoji: "🌾" },
};

/* metals.live — free, no key, returns { gold, silver, platinum, palladium } in USD/oz */
const METALS_KEY_MAP: Record<string, { yfSym: string; name: string; unit: string; emoji: string }> = {
  gold:      { yfSym: "GC=F", name: "Gold",      unit: "oz",   emoji: "🥇" },
  silver:    { yfSym: "SI=F", name: "Silver",     unit: "oz",   emoji: "🥈" },
  platinum:  { yfSym: "PL=F", name: "Platinum",   unit: "oz",   emoji: "⚪" },
  palladium: { yfSym: "PA=F", name: "Palladium",  unit: "oz",   emoji: "🔘" },
};
const ENERGY_SYMS: Record<string, { name: string; unit: string; emoji: string }> = {
  "CL=F": { name: "Crude Oil WTI", unit: "bbl",   emoji: "🛢️" },
  "NG=F": { name: "Natural Gas",   unit: "MMBtu", emoji: "🔥" },
  "HG=F": { name: "Copper",        unit: "lb",    emoji: "🔶" },
  "ZW=F": { name: "Wheat",         unit: "bu",    emoji: "🌾" },
};
const YF_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "application/json",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer": "https://finance.yahoo.com/",
};

async function fetchYFChart(sym: string): Promise<{ price: number | null; change: number | null }> {
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=5d`;
  const res = await fetch(url, { headers: YF_HEADERS });
  if (!res.ok) return { price: null, change: null };
  type ChartMeta = { regularMarketPrice?: number; regularMarketChangePercent?: number; chartPreviousClose?: number };
  const json = await res.json() as { chart?: { result?: Array<{ meta?: ChartMeta }> } };
  const meta = json.chart?.result?.[0]?.meta ?? {};
  const price = meta.regularMarketPrice ?? null;
  const prev  = meta.chartPreviousClose ?? null;
  const change = price && prev ? ((price - prev) / prev) * 100 : (meta.regularMarketChangePercent ?? null);
  return { price, change };
}

async function fetchCommoditiesPairs() {
  /* 1. Precious metals via metals.live (free, no key) */
  const metalsRes = await fetch("https://api.metals.live/v1/spot", {
    headers: { "User-Agent": "brightinsight/1.0", "Accept": "application/json" },
  }).catch(() => null);
  const metalsRaw: Record<string, number> = (metalsRes?.ok ? await metalsRes.json() : {}) as Record<string, number>;

  const metalRows = await Promise.all(
    Object.entries(METALS_KEY_MAP).map(async ([key, meta]) => {
      const spotPrice = metalsRaw[key] ?? null;
      /* try YF for % change even when we have metals.live spot price */
      const { price: yfPrice, change } = await fetchYFChart(meta.yfSym).catch(() => ({ price: null, change: null }));
      return {
        symbol: key, name: meta.name, unit: meta.unit, emoji: meta.emoji,
        price: spotPrice ?? yfPrice, change,
      };
    }),
  );

  /* 2. Energy / grains via Yahoo Finance v8 chart */
  const energyRows = await Promise.all(
    Object.entries(ENERGY_SYMS).map(async ([sym, meta]) => {
      const { price, change } = await fetchYFChart(sym).catch(() => ({ price: null, change: null }));
      return { symbol: sym, name: meta.name, unit: meta.unit, emoji: meta.emoji, price, change };
    }),
  );

  return [...metalRows, ...energyRows].filter((r) => r.price !== null);
}

router.get("/market/commodities-pairs", async (_req, res): Promise<void> => {
  try {
    const cached = await dbCacheGet<unknown[]>("commodities_pairs", 10 * 60_000);
    if (cached) { res.json(cached); return; }
    const data = await fetchCommoditiesPairs();
    await dbCacheSet("commodities_pairs", data);
    res.json(data);
  } catch (err) {
    const stale = await dbCacheGet<unknown[]>("commodities_pairs", Infinity);
    if (stale) { res.json(stale); return; }
    res.status(502).json({ error: "Commodities data unavailable", detail: String(err) });
  }
});

/* ── Market news — Yahoo Finance search API (JSON, no auth) ──────── */
const NEWS_QUERIES: Record<string, string> = {
  forex:       "forex currency trading EUR USD GBP",
  commodities: "gold oil commodities metals energy prices",
};

router.get("/market/news", async (req, res): Promise<void> => {
  const type = (req.query.type as string) === "commodities" ? "commodities" : "forex";
  const cacheKey = `news_${type}`;
  try {
    const cached = await dbCacheGet<unknown[]>(cacheKey, 30 * 60_000);
    if (cached) { res.json(cached); return; }

    const q = encodeURIComponent(NEWS_QUERIES[type]);
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${q}&newsCount=12&quotesCount=0&enableFuzzyQuery=false`;
    const newsRes = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "application/json",
        "Referer": "https://finance.yahoo.com/",
      },
    });
    if (!newsRes.ok) throw new Error(`YF news ${newsRes.status}`);

    type YFNews = { title?: string; link?: string; publisher?: string; providerPublishTime?: number };
    const json = await newsRes.json() as { news?: YFNews[] };
    const data = (json.news ?? []).map((n) => ({
      title:       n.title ?? "",
      link:        n.link  ?? "",
      description: "",
      publisher:   n.publisher ?? "Yahoo Finance",
      pubDate:     n.providerPublishTime ? new Date(n.providerPublishTime * 1000).toUTCString() : "",
    })).filter((n) => n.title);

    if (data.length) await dbCacheSet(cacheKey, data);
    res.json(data);
  } catch (err) {
    const stale = await dbCacheGet<unknown[]>(cacheKey, Infinity);
    if (stale) { res.json(stale); return; }
    res.status(502).json({ error: "News unavailable", detail: String(err) });
  }
});

/* ── Economic Calendar — TradingView API (includes actual values) ── */
interface CalendarEvent {
  id: string; title: string; country: string; date: string;
  time: string; impact: string; forecast: string; previous: string; actual: string;
}

interface TvEvent {
  id: string; title: string; country: string; importance: number; date: string;
  actual: number | null; previous: number | null; forecast: number | null;
  actualRaw: number | null; previousRaw: number | null; forecastRaw: number | null;
  unit?: string;
}

/* Country code → forex currency label */
const TV_COUNTRY_TO_CURRENCY: Record<string, string> = {
  US: "USD", GB: "GBP", JP: "JPY", AU: "AUD", CA: "CAD",
  CH: "CHF", NZ: "NZD", CN: "CNY", SG: "SGD", KR: "KRW",
  IN: "INR", NO: "NOK", SE: "SEK", MX: "MXN", TR: "TRY",
  DE: "EUR", FR: "EUR", IT: "EUR", ES: "EUR", NL: "EUR",
  BE: "EUR", AT: "EUR", PT: "EUR", FI: "EUR", IE: "EUR",
  GR: "EUR", LU: "EUR", SK: "EUR", SI: "EUR", EE: "EUR",
  LV: "EUR", LT: "EUR", MT: "EUR", CY: "EUR",
};
const TV_COUNTRIES = Object.keys(TV_COUNTRY_TO_CURRENCY).join(",");

function tvImpact(importance: number): string {
  if (importance >= 1) return "High";
  if (importance >= 0) return "Medium";
  return "Low";
}

function tvFmtValue(raw: number | null | undefined, unit?: string): string {
  if (raw === null || raw === undefined) return "";
  const abs = Math.abs(raw);
  let str: string;
  if (abs >= 1_000_000) str = (raw / 1_000_000).toFixed(2).replace(/\.?0+$/, "") + "M";
  else if (abs >= 1_000)  str = (raw / 1_000).toFixed(2).replace(/\.?0+$/, "") + "K";
  else if (Number.isInteger(raw)) str = String(raw);
  else str = raw.toFixed(2).replace(/\.?0+$/, "");
  return unit === "%" ? `${str}%` : unit ? `${str} ${unit}` : str;
}

function tvDateToFF(isoDate: string): { date: string; time: string } {
  const dt = new Date(isoDate);
  const etDate = dt.toLocaleDateString("en-US", {
    timeZone: "America/New_York", month: "2-digit", day: "2-digit", year: "numeric",
  });
  const [m, d, y] = etDate.split("/");
  const date = `${m}-${d}-${y}`;
  const etTime = dt.toLocaleTimeString("en-US", {
    timeZone: "America/New_York", hour: "numeric", minute: "2-digit", hour12: true,
  });
  const time = etTime.toLowerCase().replace(" ", "");
  return { date, time };
}

async function fetchEconomicCalendar(): Promise<CalendarEvent[]> {
  const now = new Date();
  const from = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const to   = new Date(now.getTime() + 8 * 86_400_000).toISOString();
  const url  = `https://economic-calendar.tradingview.com/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&countries=${TV_COUNTRIES}`;
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0",
    "Origin": "https://www.tradingview.com",
    "Referer": "https://www.tradingview.com/",
  };
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`TradingView calendar HTTP ${r.status}`);
  const json = await r.json() as { status: string; result: TvEvent[] };
  if (json.status !== "ok" || !Array.isArray(json.result))
    throw new Error("TradingView calendar: bad response");

  const events: CalendarEvent[] = [];
  for (const ev of json.result) {
    const currency = TV_COUNTRY_TO_CURRENCY[ev.country?.toUpperCase() ?? ""];
    if (!currency) continue;
    if ((ev.importance ?? 0) < 0) continue;
    const { date, time } = tvDateToFF(ev.date);
    events.push({
      id:       ev.id,
      title:    ev.title,
      country:  currency,
      date, time,
      impact:   tvImpact(ev.importance),
      forecast: tvFmtValue(ev.forecastRaw ?? ev.forecast, ev.unit),
      previous: tvFmtValue(ev.previousRaw ?? ev.previous, ev.unit),
      actual:   tvFmtValue(ev.actualRaw   ?? ev.actual,   ev.unit),
    });
  }
  if (!events.length) throw new Error("TradingView calendar: no events");
  return events;
}

router.get("/market/economic-calendar", async (_req, res): Promise<void> => {
  try {
    const cached = await dbCacheGet<CalendarEvent[]>("econ_calendar", 15 * 60_000);
    if (cached) { res.json(cached); return; }
    const data = await fetchEconomicCalendar();
    await dbCacheSet("econ_calendar", data);
    res.json(data);
  } catch (err) {
    const stale = await dbCacheGet<CalendarEvent[]>("econ_calendar", Infinity);
    if (stale) { res.json(stale); return; }
    res.status(502).json({ error: "Economic calendar unavailable", detail: String(err) });
  }
});

export default router;
