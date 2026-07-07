import { Router } from "express";
import { createHmac } from "crypto";
import { getAuth } from "../lib/auth";
import { db } from "@workspace/db";
import {
  tradersTable, copySubscriptionsTable, watchlistTable,
  copyAccountsTable, tradeSignalsTable, copyTradesTable,
} from "@workspace/db";
import { eq, and, desc, inArray } from "drizzle-orm";
import { encrypt, decrypt } from "../lib/encrypt";

const router = Router();

/* ─── helpers ─────────────────────────────────────────────────────── */

function buildTraderResponse(t: typeof tradersTable.$inferSelect) {
  return {
    id: t.id, userId: t.userId, displayName: t.displayName,
    avatarUrl: t.avatarUrl, bio: t.bio,
    roi: parseFloat(t.roi as string),
    winRate: parseFloat(t.winRate as string),
    maxDrawdown: parseFloat(t.maxDrawdown as string),
    totalTrades: t.totalTrades, followers: t.followers,
    status: t.status, verified: t.verified, markets: t.markets,
    strategy: t.strategy,
    monthlyReturn: t.monthlyReturn ? parseFloat(t.monthlyReturn as string) : null,
    riskScore: t.riskScore, createdAt: t.createdAt,
  };
}

function maskAccount(a: typeof copyAccountsTable.$inferSelect) {
  return {
    id: a.id, userId: a.userId, type: a.type, label: a.label,
    status: a.status, lastError: a.lastError, createdAt: a.createdAt,
    // show only last 4 chars of apiKey so user can identify which key
    apiKeyHint: a.apiKey ? `****${decrypt(a.apiKey).slice(-4)}` : null,
    mt5Login: a.mt5Login ?? null,
    mt5Server: a.mt5Server ?? null,
  };
}

/* ─── Binance order execution ─────────────────────────────────────── */
async function executeBinance(
  apiKey: string, apiSecret: string,
  signal: typeof tradeSignalsTable.$inferSelect,
  lotMultiplier: number,
): Promise<string> {
  const side = signal.action === "buy" ? "BUY" : "SELL";
  const qty = (parseFloat(signal.quantity as string) * lotMultiplier).toFixed(6);
  const params = new URLSearchParams({
    symbol: signal.symbol.toUpperCase(),
    side,
    type: "MARKET",
    quantity: qty,
    timestamp: Date.now().toString(),
  });
  const sig = createHmac("sha256", apiSecret).update(params.toString()).digest("hex");
  params.append("signature", sig);

  const baseUrl = signal.market === "crypto"
    ? "https://api.binance.com/api/v3/order"
    : "https://api.binance.com/api/v3/order"; // spot only for now

  const res = await fetch(`${baseUrl}?${params.toString()}`, {
    method: "POST",
    headers: { "X-MBX-APIKEY": apiKey },
  });
  const json = await res.json() as { orderId?: number; msg?: string };
  if (!res.ok) throw new Error(json.msg ?? "Binance error");
  return String(json.orderId);
}

/* ─── Bybit order execution ───────────────────────────────────────── */
async function executeBybit(
  apiKey: string, apiSecret: string,
  signal: typeof tradeSignalsTable.$inferSelect,
  lotMultiplier: number,
): Promise<string> {
  const timestamp = Date.now().toString();
  const qty = (parseFloat(signal.quantity as string) * lotMultiplier).toFixed(6);
  const body = JSON.stringify({
    category: signal.market === "crypto" ? "spot" : "linear",
    symbol: signal.symbol.toUpperCase(),
    side: signal.action === "buy" ? "Buy" : "Sell",
    orderType: "Market",
    qty,
  });
  const toSign = `${timestamp}${apiKey}5000${body}`;
  const signature = createHmac("sha256", apiSecret).update(toSign).digest("hex");

  const res = await fetch("https://api.bybit.com/v5/order/create", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-BAPI-API-KEY": apiKey,
      "X-BAPI-TIMESTAMP": timestamp,
      "X-BAPI-SIGN": signature,
      "X-BAPI-RECV-WINDOW": "5000",
    },
    body,
  });
  const json = await res.json() as { result?: { orderId?: string }; retMsg?: string; retCode?: number };
  if (json.retCode !== 0) throw new Error(json.retMsg ?? "Bybit error");
  return json.result?.orderId ?? "unknown";
}

/* ─── MT5 bridge execution ────────────────────────────────────────── */
async function executeMt5(
  login: string, password: string, server: string,
  signal: typeof tradeSignalsTable.$inferSelect,
  lotMultiplier: number,
): Promise<string> {
  const bridgeUrl = process.env.MT5_BRIDGE_URL;
  if (!bridgeUrl) throw new Error("MT5_BRIDGE_URL not configured");

  const res = await fetch(`${bridgeUrl}/signal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      login, password, server,
      symbol: signal.symbol,
      action: signal.action,
      volume: parseFloat(signal.quantity as string) * lotMultiplier,
      price: signal.price ? parseFloat(signal.price as string) : 0,
      sl: signal.stopLoss ? parseFloat(signal.stopLoss as string) : 0,
      tp: signal.takeProfit ? parseFloat(signal.takeProfit as string) : 0,
      leverage: signal.leverage ?? 1,
    }),
  });
  const json = await res.json() as { orderId?: string; error?: string };
  if (!res.ok) throw new Error(json.error ?? "MT5 bridge error");
  return json.orderId ?? "unknown";
}

/* ─── Fan-out: execute signal across all active subscribers ────────── */
async function fanOutSignal(signal: typeof tradeSignalsTable.$inferSelect) {
  const subs = await db
    .select()
    .from(copySubscriptionsTable)
    .where(and(
      eq(copySubscriptionsTable.traderId, signal.traderId),
      eq(copySubscriptionsTable.status, "active"),
    ));

  const activeSubs = subs.filter((s) => s.copyAccountId != null);
  if (activeSubs.length === 0) return;

  const accountIds = activeSubs.map((s) => s.copyAccountId!);
  const accounts = await db.select().from(copyAccountsTable).where(inArray(copyAccountsTable.id, accountIds));
  const accountMap = Object.fromEntries(accounts.map((a) => [a.id, a]));

  await Promise.allSettled(activeSubs.map(async (sub) => {
    const account = accountMap[sub.copyAccountId!];
    if (!account) return;

    const multiplier = parseFloat((sub.lotMultiplier ?? "1") as string);

    // Insert pending copy trade record
    const [trade] = await db.insert(copyTradesTable).values({
      signalId: signal.id,
      subscriptionId: sub.id,
      userId: sub.userId,
      copyAccountId: account.id,
      status: "pending",
      quantity: (parseFloat(signal.quantity as string) * multiplier).toFixed(6),
    }).returning();

    try {
      let brokerOrderId = "";

      if (account.type === "binance") {
        brokerOrderId = await executeBinance(
          decrypt(account.apiKey!), decrypt(account.apiSecret!), signal, multiplier,
        );
      } else if (account.type === "bybit") {
        brokerOrderId = await executeBybit(
          decrypt(account.apiKey!), decrypt(account.apiSecret!), signal, multiplier,
        );
      } else if (account.type === "mt5") {
        brokerOrderId = await executeMt5(
          account.mt5Login!, decrypt(account.mt5Password!), account.mt5Server!, signal, multiplier,
        );
      }

      await db.update(copyTradesTable).set({
        status: "executed", brokerOrderId,
        executedPrice: signal.price ?? null,
      }).where(eq(copyTradesTable.id, trade.id));

      // Clear any previous error on the account
      await db.update(copyAccountsTable).set({ status: "active", lastError: null })
        .where(eq(copyAccountsTable.id, account.id));

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      await db.update(copyTradesTable).set({ status: "failed", errorMessage: msg })
        .where(eq(copyTradesTable.id, trade.id));
      await db.update(copyAccountsTable).set({ status: "error", lastError: msg })
        .where(eq(copyAccountsTable.id, account.id));
    }
  }));

  // Mark signal as executed
  await db.update(tradeSignalsTable).set({ status: "executed", executedAt: new Date() })
    .where(eq(tradeSignalsTable.id, signal.id));
}

/* ═══════════════════════════════════════════════════════════════════
   TRADERS
════════════════════════════════════════════════════════════════════ */

router.get("/traders", async (req, res): Promise<void> => {
  try {
    const { verified } = req.query as Record<string, string>;
    let query = db.select().from(tradersTable).$dynamic();
    if (verified === "true") query = query.where(eq(tradersTable.verified, true));
    const traders = await query.orderBy(desc(tradersTable.roi)).limit(50);
    res.json(traders.map(buildTraderResponse));
  } catch (err) {
    req.log.error({ err }, "Error listing traders");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/traders/:traderId", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.traderId);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const trader = await db.select().from(tradersTable).where(eq(tradersTable.id, id)).limit(1).then((r) => r[0]);
    if (!trader) { res.status(404).json({ error: "Trader not found" }); return; }
    res.json(buildTraderResponse(trader));
  } catch (err) {
    req.log.error({ err }, "Error getting trader");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ═══════════════════════════════════════════════════════════════════
   COPY ACCOUNTS  (student's connected broker accounts)
════════════════════════════════════════════════════════════════════ */

router.get("/copy-accounts", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const accounts = await db.select().from(copyAccountsTable)
      .where(eq(copyAccountsTable.userId, clerkId))
      .orderBy(desc(copyAccountsTable.createdAt));
    res.json(accounts.map(maskAccount));
  } catch (err) {
    req.log.error({ err }, "Error listing copy accounts");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/copy-accounts", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const { type, label, apiKey, apiSecret, mt5Login, mt5Password, mt5Server } = req.body as Record<string, string>;
    if (!type || !label) { res.status(400).json({ error: "type and label required" }); return; }
    if (!["binance", "bybit", "mt5"].includes(type)) {
      res.status(400).json({ error: "type must be binance, bybit, or mt5" }); return;
    }
    if ((type === "binance" || type === "bybit") && (!apiKey || !apiSecret)) {
      res.status(400).json({ error: "apiKey and apiSecret required for exchange accounts" }); return;
    }
    if (type === "mt5" && (!mt5Login || !mt5Password || !mt5Server)) {
      res.status(400).json({ error: "mt5Login, mt5Password, and mt5Server required" }); return;
    }

    const [inserted] = await db.insert(copyAccountsTable).values({
      userId: clerkId, type, label,
      apiKey: apiKey ? encrypt(apiKey) : null,
      apiSecret: apiSecret ? encrypt(apiSecret) : null,
      mt5Login: mt5Login ?? null,
      mt5Password: mt5Password ? encrypt(mt5Password) : null,
      mt5Server: mt5Server ?? null,
    }).returning();

    res.status(201).json(maskAccount(inserted));
  } catch (err) {
    req.log.error({ err }, "Error creating copy account");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/copy-accounts/:id", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const account = await db.select().from(copyAccountsTable).where(eq(copyAccountsTable.id, id)).limit(1).then((r) => r[0]);
    if (!account || account.userId !== clerkId) { res.status(404).json({ error: "Not found" }); return; }
    await db.delete(copyAccountsTable).where(eq(copyAccountsTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Error deleting copy account");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ═══════════════════════════════════════════════════════════════════
   COPY SUBSCRIPTIONS
════════════════════════════════════════════════════════════════════ */

router.get("/copy-subscriptions", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const subs = await db.select().from(copySubscriptionsTable).where(eq(copySubscriptionsTable.userId, clerkId));
    const results = await Promise.all(subs.map(async (s) => {
      const trader = await db.select({ displayName: tradersTable.displayName })
        .from(tradersTable).where(eq(tradersTable.id, s.traderId)).limit(1);
      let accountLabel: string | null = null;
      if (s.copyAccountId) {
        const acc = await db.select({ label: copyAccountsTable.label, type: copyAccountsTable.type })
          .from(copyAccountsTable).where(eq(copyAccountsTable.id, s.copyAccountId)).limit(1);
        accountLabel = acc[0] ? `${acc[0].type.toUpperCase()} — ${acc[0].label}` : null;
      }
      return {
        id: s.id, userId: s.userId, traderId: s.traderId,
        traderName: trader[0]?.displayName ?? null,
        copyAccountId: s.copyAccountId ?? null,
        accountLabel,
        status: s.status,
        maxAmount: s.maxAmount ? parseFloat(s.maxAmount as string) : null,
        stopLoss: s.stopLoss ? parseFloat(s.stopLoss as string) : null,
        allocatedAmount: s.allocatedAmount ? parseFloat(s.allocatedAmount as string) : null,
        lotMultiplier: parseFloat((s.lotMultiplier ?? "1") as string),
        currentPnl: s.currentPnl ? parseFloat(s.currentPnl as string) : null,
        createdAt: s.createdAt,
      };
    }));
    res.json(results);
  } catch (err) {
    req.log.error({ err }, "Error listing copy subscriptions");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/copy-subscriptions", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const { traderId, copyAccountId, maxAmount, stopLoss, allocatedAmount, lotMultiplier } = req.body;
    if (!traderId) { res.status(400).json({ error: "traderId required" }); return; }

    // Verify the copy account belongs to this user if provided
    if (copyAccountId) {
      const acc = await db.select().from(copyAccountsTable).where(eq(copyAccountsTable.id, copyAccountId)).limit(1).then((r) => r[0]);
      if (!acc || acc.userId !== clerkId) { res.status(403).json({ error: "Invalid copy account" }); return; }
    }

    const [inserted] = await db.insert(copySubscriptionsTable).values({
      userId: clerkId, traderId,
      copyAccountId: copyAccountId ?? null,
      status: "active",
      maxAmount: maxAmount?.toString(),
      stopLoss: stopLoss?.toString(),
      allocatedAmount: allocatedAmount?.toString(),
      lotMultiplier: lotMultiplier?.toString() ?? "1.00",
    }).returning();

    const trader = await db.select({ displayName: tradersTable.displayName })
      .from(tradersTable).where(eq(tradersTable.id, inserted.traderId)).limit(1);

    // Increment follower count
    await db.update(tradersTable).set({ followers: (await db.select({ f: tradersTable.followers }).from(tradersTable).where(eq(tradersTable.id, traderId)).limit(1).then((r) => (r[0]?.f ?? 0) + 1)) }).where(eq(tradersTable.id, traderId));

    res.status(201).json({
      id: inserted.id, userId: inserted.userId, traderId: inserted.traderId,
      traderName: trader[0]?.displayName ?? null,
      copyAccountId: inserted.copyAccountId ?? null,
      accountLabel: null,
      status: inserted.status,
      maxAmount: null, stopLoss: null, allocatedAmount: null,
      lotMultiplier: parseFloat((inserted.lotMultiplier ?? "1") as string),
      currentPnl: null, createdAt: inserted.createdAt,
    });
  } catch (err) {
    req.log.error({ err }, "Error creating copy subscription");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/copy-subscriptions/:subscriptionId", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.subscriptionId);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const { status, maxAmount, stopLoss, allocatedAmount, lotMultiplier, copyAccountId } = req.body;
    const [updated] = await db.update(copySubscriptionsTable).set({
      ...(status !== undefined && { status }),
      ...(maxAmount !== undefined && { maxAmount: maxAmount?.toString() }),
      ...(stopLoss !== undefined && { stopLoss: stopLoss?.toString() }),
      ...(allocatedAmount !== undefined && { allocatedAmount: allocatedAmount?.toString() }),
      ...(lotMultiplier !== undefined && { lotMultiplier: lotMultiplier?.toString() }),
      ...(copyAccountId !== undefined && { copyAccountId }),
    }).where(eq(copySubscriptionsTable.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Subscription not found" }); return; }
    res.json({ id: updated.id, status: updated.status });
  } catch (err) {
    req.log.error({ err }, "Error updating copy subscription");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/copy-subscriptions/:subscriptionId", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.subscriptionId);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    await db.delete(copySubscriptionsTable).where(eq(copySubscriptionsTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Error deleting copy subscription");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ═══════════════════════════════════════════════════════════════════
   TRADE SIGNALS  (posted by instructor/admin, fans out to subscribers)
════════════════════════════════════════════════════════════════════ */

router.get("/trade-signals", async (req, res): Promise<void> => {
  try {
    const { traderId } = req.query as Record<string, string>;
    let query = db.select().from(tradeSignalsTable).$dynamic();
    if (traderId) query = query.where(eq(tradeSignalsTable.traderId, parseInt(traderId)));
    const signals = await query.orderBy(desc(tradeSignalsTable.createdAt)).limit(100);
    res.json(signals.map((s) => ({
      ...s,
      price: s.price ? parseFloat(s.price as string) : null,
      quantity: s.quantity ? parseFloat(s.quantity as string) : null,
      stopLoss: s.stopLoss ? parseFloat(s.stopLoss as string) : null,
      takeProfit: s.takeProfit ? parseFloat(s.takeProfit as string) : null,
    })));
  } catch (err) {
    req.log.error({ err }, "Error listing trade signals");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/trade-signals", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const { traderId, symbol, market, action, orderType, price, quantity, stopLoss, takeProfit, leverage, notes } = req.body;
    if (!traderId || !symbol || !market || !action || !quantity) {
      res.status(400).json({ error: "traderId, symbol, market, action, quantity required" }); return;
    }

    const [signal] = await db.insert(tradeSignalsTable).values({
      traderId, symbol, market, action,
      orderType: orderType ?? "market",
      price: price?.toString() ?? null,
      quantity: quantity.toString(),
      stopLoss: stopLoss?.toString() ?? null,
      takeProfit: takeProfit?.toString() ?? null,
      leverage: leverage ?? 1,
      notes: notes ?? null,
    }).returning();

    res.status(201).json({
      ...signal,
      price: signal.price ? parseFloat(signal.price as string) : null,
      quantity: signal.quantity ? parseFloat(signal.quantity as string) : null,
    });

    // Fan-out asynchronously — don't block the response
    setImmediate(() => fanOutSignal(signal).catch((e) => console.error("Fan-out error:", e)));
  } catch (err) {
    req.log.error({ err }, "Error creating trade signal");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ═══════════════════════════════════════════════════════════════════
   COPY TRADES HISTORY
════════════════════════════════════════════════════════════════════ */

router.get("/copy-trades", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const trades = await db.select().from(copyTradesTable)
      .where(eq(copyTradesTable.userId, clerkId))
      .orderBy(desc(copyTradesTable.createdAt))
      .limit(100);
    res.json(trades.map((t) => ({
      ...t,
      executedPrice: t.executedPrice ? parseFloat(t.executedPrice as string) : null,
      quantity: t.quantity ? parseFloat(t.quantity as string) : null,
      pnl: t.pnl ? parseFloat(t.pnl as string) : null,
    })));
  } catch (err) {
    req.log.error({ err }, "Error listing copy trades");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ═══════════════════════════════════════════════════════════════════
   WATCHLIST
════════════════════════════════════════════════════════════════════ */

router.get("/watchlist", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const items = await db.select().from(watchlistTable).where(eq(watchlistTable.userId, clerkId));
    res.json(items.map((w) => ({
      id: w.id, userId: w.userId, symbol: w.symbol, market: w.market,
      displayName: w.displayName,
      alertPrice: w.alertPrice ? parseFloat(w.alertPrice as string) : null,
      createdAt: w.createdAt,
    })));
  } catch (err) {
    req.log.error({ err }, "Error getting watchlist");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/watchlist", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const { symbol, market, displayName, alertPrice } = req.body;
    if (!symbol || !market) { res.status(400).json({ error: "symbol and market required" }); return; }
    const [inserted] = await db.insert(watchlistTable).values({
      userId: clerkId, symbol, market, displayName, alertPrice: alertPrice?.toString(),
    }).returning();
    res.status(201).json({
      id: inserted.id, userId: inserted.userId, symbol: inserted.symbol, market: inserted.market,
      displayName: inserted.displayName,
      alertPrice: inserted.alertPrice ? parseFloat(inserted.alertPrice as string) : null,
      createdAt: inserted.createdAt,
    });
  } catch (err) {
    req.log.error({ err }, "Error adding to watchlist");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/watchlist/:itemId", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.itemId);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    await db.delete(watchlistTable).where(eq(watchlistTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Error removing from watchlist");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
