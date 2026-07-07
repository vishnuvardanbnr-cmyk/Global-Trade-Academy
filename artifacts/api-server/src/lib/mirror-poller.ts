/**
 * Mirror / Copy-Trading Poller
 *
 * Runs a background setInterval for every master account in copy_accounts
 * (role = "master").  Every POLL_INTERVAL_MS it:
 *   1. Fetches live open positions from the master's exchange / MT5 bridge
 *   2. Diffs against the snapshot stored in master_positions
 *   3. Auto-fires open / close / modify / partial-close signals that
 *      fan out to all copiers through the existing fanOutSignal() path
 */

import { db } from "@workspace/db";
import {
  copyAccountsTable,
  masterPositionsTable,
  tradeSignalsTable,
  copySubscriptionsTable,
  copyTradesTable,
} from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { createHmac } from "crypto";
import { decrypt } from "./encrypt";
import { logger } from "./logger";

const POLL_INTERVAL_MS = 5_000;

/* ─── Canonical position shape returned by every fetcher ─────────── */
export interface LivePosition {
  brokerPositionId: string;   // unique key on the exchange side
  symbol: string;
  side: "long" | "short";
  size: number;               // quantity / lots (always positive)
  entryPrice: number;
  stopLoss: number | null;
  takeProfit: number | null;
  leverage: number;
  market: "crypto" | "forex";
}

/* ══════════════════════════════════════════════════════════════════
   EXCHANGE POSITION FETCHERS
══════════════════════════════════════════════════════════════════ */

/* ── Binance Futures (USDⓂ perpetuals) ─────────────────────────── */
async function fetchBinancePositions(apiKey: string, apiSecret: string): Promise<LivePosition[]> {
  const ts = Date.now().toString();
  const params = new URLSearchParams({ timestamp: ts });
  const sig = createHmac("sha256", apiSecret).update(params.toString()).digest("hex");
  params.append("signature", sig);

  const res = await fetch(
    `https://fapi.binance.com/fapi/v2/positionRisk?${params.toString()}`,
    { headers: { "X-MBX-APIKEY": apiKey } },
  );

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Binance positions error: ${txt}`);
  }

  const data = await res.json() as Array<{
    symbol: string;
    positionAmt: string;
    entryPrice: string;
    stopPrice?: string;
    takeProfitPrice?: string;
    leverage: string;
    positionSide: string;  // "LONG" | "SHORT" | "BOTH"
  }>;

  const positions: LivePosition[] = [];
  for (const p of data) {
    const size = Math.abs(parseFloat(p.positionAmt));
    if (size === 0) continue;

    const side: "long" | "short" =
      p.positionSide === "SHORT" ? "short"
      : p.positionSide === "LONG" ? "long"
      : parseFloat(p.positionAmt) > 0 ? "long" : "short";

    positions.push({
      brokerPositionId: `${p.symbol}_${side}`,
      symbol: p.symbol,
      side,
      size,
      entryPrice: parseFloat(p.entryPrice),
      stopLoss: p.stopPrice && parseFloat(p.stopPrice) > 0 ? parseFloat(p.stopPrice) : null,
      takeProfit: p.takeProfitPrice && parseFloat(p.takeProfitPrice) > 0 ? parseFloat(p.takeProfitPrice) : null,
      leverage: parseInt(p.leverage),
      market: "crypto",
    });
  }
  return positions;
}

/* ── Bybit Unified (linear perpetuals) ─────────────────────────── */
async function fetchBybitPositions(apiKey: string, apiSecret: string): Promise<LivePosition[]> {
  const ts = Date.now().toString();
  const recv = "5000";
  const queryStr = "category=linear&settleCoin=USDT&limit=200";
  const toSign = `${ts}${apiKey}${recv}${queryStr}`;
  const sig = createHmac("sha256", apiSecret).update(toSign).digest("hex");

  const res = await fetch(
    `https://api.bybit.com/v5/position/list?${queryStr}`,
    {
      headers: {
        "X-BAPI-API-KEY": apiKey,
        "X-BAPI-TIMESTAMP": ts,
        "X-BAPI-SIGN": sig,
        "X-BAPI-RECV-WINDOW": recv,
      },
    },
  );

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Bybit positions error: ${txt}`);
  }

  const json = await res.json() as {
    retCode: number;
    retMsg: string;
    result: {
      list: Array<{
        symbol: string;
        side: string;        // "Buy" | "Sell"
        size: string;
        avgPrice: string;
        stopLoss: string;
        takeProfit: string;
        leverage: string;
        positionIdx: number;
      }>;
    };
  };

  if (json.retCode !== 0) throw new Error(`Bybit: ${json.retMsg}`);

  const positions: LivePosition[] = [];
  for (const p of json.result.list) {
    const size = parseFloat(p.size);
    if (size === 0) continue;
    const side: "long" | "short" = p.side === "Buy" ? "long" : "short";
    positions.push({
      brokerPositionId: `${p.symbol}_${p.positionIdx}`,
      symbol: p.symbol,
      side,
      size,
      entryPrice: parseFloat(p.avgPrice),
      stopLoss: p.stopLoss && parseFloat(p.stopLoss) > 0 ? parseFloat(p.stopLoss) : null,
      takeProfit: p.takeProfit && parseFloat(p.takeProfit) > 0 ? parseFloat(p.takeProfit) : null,
      leverage: parseInt(p.leverage),
      market: "crypto",
    });
  }
  return positions;
}

/* ── MT5 bridge ─────────────────────────────────────────────────── */
async function fetchMt5Positions(
  login: string,
  password: string,
  server: string,
): Promise<LivePosition[]> {
  const bridgeUrl = process.env.MT5_BRIDGE_URL;
  if (!bridgeUrl) throw new Error("MT5_BRIDGE_URL not configured");

  const res = await fetch(`${bridgeUrl}/positions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login, password, server }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`MT5 bridge positions error: ${txt}`);
  }

  const data = await res.json() as Array<{
    ticket: number;
    symbol: string;
    type: number;   // 0=buy 1=sell
    volume: number;
    priceOpen: number;
    sl: number;
    tp: number;
  }>;

  return data.map((p) => ({
    brokerPositionId: String(p.ticket),
    symbol: p.symbol,
    side: p.type === 0 ? "long" : "short",
    size: p.volume,
    entryPrice: p.priceOpen,
    stopLoss: p.sl > 0 ? p.sl : null,
    takeProfit: p.tp > 0 ? p.tp : null,
    leverage: 1,
    market: "forex",
  }));
}

/* ══════════════════════════════════════════════════════════════════
   FAN-OUT  (mirrors the manual signal fan-out in trading.ts)
══════════════════════════════════════════════════════════════════ */

async function autoFanOut(signal: typeof tradeSignalsTable.$inferSelect) {
  const { fanOutSignal } = await import("./fan-out");
  await fanOutSignal(signal);
}

/* ══════════════════════════════════════════════════════════════════
   DIFF ENGINE
══════════════════════════════════════════════════════════════════ */

async function processMasterAccount(
  account: typeof copyAccountsTable.$inferSelect,
) {
  if (!account.traderId) return;
  const traderId = account.traderId;

  /* 1. Fetch live positions from exchange */
  let live: LivePosition[] = [];
  try {
    if (account.type === "binance") {
      live = await fetchBinancePositions(
        decrypt(account.apiKey!),
        decrypt(account.apiSecret!),
      );
    } else if (account.type === "bybit") {
      live = await fetchBybitPositions(
        decrypt(account.apiKey!),
        decrypt(account.apiSecret!),
      );
    } else if (account.type === "mt5") {
      live = await fetchMt5Positions(
        account.mt5Login!,
        decrypt(account.mt5Password!),
        account.mt5Server!,
      );
    }
    // Clear any previous error
    await db
      .update(copyAccountsTable)
      .set({ status: "active", lastError: null })
      .where(eq(copyAccountsTable.id, account.id));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ accountId: account.id, err: msg }, "mirror-poller: fetch error");
    await db
      .update(copyAccountsTable)
      .set({ status: "error", lastError: msg })
      .where(eq(copyAccountsTable.id, account.id));
    return;
  }

  /* 2. Load stored snapshot */
  const stored = await db
    .select()
    .from(masterPositionsTable)
    .where(eq(masterPositionsTable.masterAccountId, account.id));

  const storedMap = new Map(stored.map((p) => [p.brokerPositionId ?? "", p]));
  const liveMap   = new Map(live.map((p) => [p.brokerPositionId ?? "", p]));

  /* 3. NEW positions — not in stored snapshot */
  for (const [posId, lp] of liveMap) {
    if (!storedMap.has(posId)) {
      logger.info({ accountId: account.id, symbol: lp.symbol, side: lp.side }, "mirror-poller: new position");

      // Insert snapshot
      await db.insert(masterPositionsTable).values({
        masterAccountId: account.id,
        traderId,
        symbol: lp.symbol,
        side: lp.side,
        size: lp.size.toFixed(8),
        entryPrice: lp.entryPrice.toFixed(8),
        stopLoss: lp.stopLoss?.toFixed(8) ?? null,
        takeProfit: lp.takeProfit?.toFixed(8) ?? null,
        leverage: lp.leverage,
        brokerPositionId: posId,
        market: lp.market,
      });

      // Fire open signal
      const [signal] = await db.insert(tradeSignalsTable).values({
        traderId,
        symbol: lp.symbol,
        market: lp.market,
        action: lp.side === "long" ? "buy" : "sell",
        orderType: "market",
        price: lp.entryPrice.toFixed(8),
        quantity: lp.size.toFixed(8),
        stopLoss: lp.stopLoss?.toFixed(8) ?? null,
        takeProfit: lp.takeProfit?.toFixed(8) ?? null,
        leverage: lp.leverage,
        notes: `[mirror] ${account.label} opened ${lp.side} ${lp.symbol}`,
      }).returning();

      await autoFanOut(signal);
    }
  }

  /* 4. CLOSED positions — in snapshot but not live any more */
  for (const [posId, sp] of storedMap) {
    if (!liveMap.has(posId)) {
      logger.info({ accountId: account.id, symbol: sp.symbol }, "mirror-poller: position closed");

      // Remove snapshot
      await db.delete(masterPositionsTable).where(eq(masterPositionsTable.id, sp.id));

      // Fire close signal
      const [signal] = await db.insert(tradeSignalsTable).values({
        traderId,
        symbol: sp.symbol,
        market: sp.market,
        action: "close",
        orderType: "market",
        quantity: sp.size.toString(),
        notes: `[mirror] ${account.label} closed ${sp.symbol}`,
      }).returning();

      await autoFanOut(signal);
    }
  }

  /* 5. MODIFIED positions — size changed (partial close or add) or SL/TP changed */
  for (const [posId, lp] of liveMap) {
    const sp = storedMap.get(posId);
    if (!sp) continue; // handled as new above

    const liveSize   = lp.size;
    const storedSize = parseFloat(sp.size as string);
    const liveSL     = lp.stopLoss;
    const storedSL   = sp.stopLoss ? parseFloat(sp.stopLoss as string) : null;
    const liveTP     = lp.takeProfit;
    const storedTP   = sp.takeProfit ? parseFloat(sp.takeProfit as string) : null;

    const sizeDiff   = Math.abs(liveSize - storedSize) / storedSize;
    const slChanged  = Math.abs((liveSL ?? 0) - (storedSL ?? 0)) > 0.000001;
    const tpChanged  = Math.abs((liveTP ?? 0) - (storedTP ?? 0)) > 0.000001;

    if (sizeDiff < 0.0001 && !slChanged && !tpChanged) continue; // no meaningful change

    // Update snapshot
    await db
      .update(masterPositionsTable)
      .set({
        size: liveSize.toFixed(8),
        stopLoss: liveSL?.toFixed(8) ?? null,
        takeProfit: liveTP?.toFixed(8) ?? null,
      })
      .where(eq(masterPositionsTable.id, sp.id));

    if (sizeDiff >= 0.0001) {
      const delta      = liveSize - storedSize;
      const isReduce   = delta < 0;
      const action     = isReduce
        ? (lp.side === "long" ? "sell" : "buy")   // partial close
        : (lp.side === "long" ? "buy"  : "sell");  // add to position

      logger.info(
        { accountId: account.id, symbol: lp.symbol, delta },
        `mirror-poller: position ${isReduce ? "reduced" : "increased"}`,
      );

      const [signal] = await db.insert(tradeSignalsTable).values({
        traderId,
        symbol: lp.symbol,
        market: lp.market,
        action,
        orderType: "market",
        quantity: Math.abs(delta).toFixed(8),
        stopLoss: liveSL?.toFixed(8) ?? null,
        takeProfit: liveTP?.toFixed(8) ?? null,
        leverage: lp.leverage,
        notes: `[mirror] ${account.label} ${isReduce ? "partial close" : "added"} ${lp.symbol} Δ${Math.abs(delta).toFixed(4)}`,
      }).returning();

      await autoFanOut(signal);
    } else if (slChanged || tpChanged) {
      // SL/TP update only — fire a modify signal (action = "modify")
      logger.info({ accountId: account.id, symbol: lp.symbol }, "mirror-poller: SL/TP modified");

      const [signal] = await db.insert(tradeSignalsTable).values({
        traderId,
        symbol: lp.symbol,
        market: lp.market,
        action: "modify",
        orderType: "market",
        quantity: liveSize.toFixed(8),
        stopLoss: liveSL?.toFixed(8) ?? null,
        takeProfit: liveTP?.toFixed(8) ?? null,
        leverage: lp.leverage,
        notes: `[mirror] ${account.label} modified SL/TP ${lp.symbol}`,
      }).returning();

      await autoFanOut(signal);
    }
  }
}

/* ══════════════════════════════════════════════════════════════════
   POLLER BOOTSTRAP
══════════════════════════════════════════════════════════════════ */

let pollTimer: ReturnType<typeof setInterval> | null = null;

async function pollOnce() {
  try {
    const masters = await db
      .select()
      .from(copyAccountsTable)
      .where(eq(copyAccountsTable.role, "master"));

    if (masters.length === 0) return;

    await Promise.allSettled(masters.map((m) => processMasterAccount(m)));
  } catch (err) {
    logger.error({ err }, "mirror-poller: top-level error");
  }
}

export function startMirrorPoller() {
  if (pollTimer) return; // already running
  logger.info({ intervalMs: POLL_INTERVAL_MS }, "mirror-poller: starting");
  pollTimer = setInterval(() => { void pollOnce(); }, POLL_INTERVAL_MS);
  // Also run immediately on startup so first poll isn't delayed
  void pollOnce();
}

export function stopMirrorPoller() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
    logger.info("mirror-poller: stopped");
  }
}
