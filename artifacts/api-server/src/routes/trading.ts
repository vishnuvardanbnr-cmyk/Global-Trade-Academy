import { Router } from "express";
import { getAuth } from "../lib/auth";
import { db } from "@workspace/db";
import {
  tradersTable, copySubscriptionsTable, watchlistTable,
  copyAccountsTable, tradeSignalsTable, copyTradesTable,
  masterPositionsTable, usersTable,
  platformSubscriptionsTable, subscriptionPlansTable,
} from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { encrypt, decrypt } from "../lib/encrypt";
import { fanOutSignal, metaapiSubscribe, metaapiUnsubscribe, metaapiCreateAccount } from "../lib/fan-out";

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
    id: a.id, userId: a.userId, role: a.role, traderId: a.traderId ?? null,
    type: a.type, label: a.label,
    status: a.status, lastError: a.lastError, createdAt: a.createdAt,
    apiKeyHint: a.apiKey ? `****${decrypt(a.apiKey).slice(-4)}` : null,
    mt5Login: a.mt5Login ?? null,
    mt5Server: a.mt5Server ?? null,
    metaapiAccountId: a.metaapiAccountId ?? null,
  };
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

/* My trader profile — returns the authenticated user's own trader row */
router.get("/my-trader", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const trader = await db.select().from(tradersTable)
      .where(eq(tradersTable.userId, clerkId)).limit(1).then((r) => r[0]);
    if (!trader) { res.status(404).json({ error: "No trader profile found" }); return; }
    res.json(buildTraderResponse(trader));
  } catch (err) {
    req.log.error({ err }, "Error getting my trader");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ═══════════════════════════════════════════════════════════════════
   COPY ACCOUNTS  (copier broker accounts + master accounts)
════════════════════════════════════════════════════════════════════ */

router.get("/copy-accounts", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const accounts = await db.select().from(copyAccountsTable)
      .where(and(eq(copyAccountsTable.userId, clerkId), eq(copyAccountsTable.role, "copier")))
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

    const { type, label, apiKey, apiSecret, mt5Login, mt5Password, mt5Server,
            metaapiAccountId, mt5Platform } = req.body as Record<string, string>;
    if (!type || !label) { res.status(400).json({ error: "type and label required" }); return; }
    if (!["binance", "bybit", "mt5", "metaapi"].includes(type)) {
      res.status(400).json({ error: "type must be binance, bybit, mt5, or metaapi" }); return;
    }
    if ((type === "binance" || type === "bybit") && (!apiKey || !apiSecret)) {
      res.status(400).json({ error: "apiKey and apiSecret required for exchange accounts" }); return;
    }
    if (type === "mt5" && (!mt5Login || !mt5Password || !mt5Server)) {
      res.status(400).json({ error: "mt5Login, mt5Password, and mt5Server required" }); return;
    }
    if (type === "metaapi" && (!mt5Login || !mt5Password || !mt5Server)) {
      res.status(400).json({ error: "mt5Login, mt5Password, and mt5Server required for MetaAPI accounts" }); return;
    }

    // Gate: require active platform subscription
    if (!(await requireActiveSub(clerkId))) {
      res.status(403).json({ error: "Active copy trading subscription required", code: "SUBSCRIPTION_REQUIRED" }); return;
    }

    // For MetaAPI: provision the broker account via MetaAPI API, then subscribe to our strategy
    let resolvedMetaapiAccountId = metaapiAccountId ?? null;
    if (type === "metaapi") {
      const platform = (mt5Platform === "mt4" ? "mt4" : "mt5") as "mt4" | "mt5";
      resolvedMetaapiAccountId = await metaapiCreateAccount({
        login: mt5Login,
        password: mt5Password,
        server: mt5Server,
        platform,
        name: label,
      });
      await metaapiSubscribe(resolvedMetaapiAccountId, label, 1.0);
    }

    const [inserted] = await db.insert(copyAccountsTable).values({
      userId: clerkId, role: "copier", type, label,
      apiKey: apiKey ? encrypt(apiKey) : null,
      apiSecret: apiSecret ? encrypt(apiSecret) : null,
      // Store login/server for MetaAPI accounts too (display only — credentials stay with MetaAPI)
      mt5Login: mt5Login ?? null,
      mt5Password: (type === "mt5" && mt5Password) ? encrypt(mt5Password) : null,
      mt5Server: mt5Server ?? null,
      metaapiAccountId: resolvedMetaapiAccountId,
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
    // Also clean up any stored positions for master accounts
    if (account.role === "master") {
      await db.delete(masterPositionsTable).where(eq(masterPositionsTable.masterAccountId, id));
    }
    // For MetaAPI accounts, unsubscribe from the strategy (best-effort)
    if (account.metaapiAccountId) {
      await metaapiUnsubscribe(account.metaapiAccountId).catch(() => {});
    }
    await db.delete(copyAccountsTable).where(eq(copyAccountsTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Error deleting copy account");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ═══════════════════════════════════════════════════════════════════
   MASTER ACCOUNTS  (trader's own exchange account — the source)
════════════════════════════════════════════════════════════════════ */

// GET /master-accounts — list master accounts for the authenticated user
router.get("/master-accounts", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const accounts = await db.select().from(copyAccountsTable)
      .where(and(eq(copyAccountsTable.userId, clerkId), eq(copyAccountsTable.role, "master")))
      .orderBy(desc(copyAccountsTable.createdAt));
    res.json(accounts.map(maskAccount));
  } catch (err) {
    req.log.error({ err }, "Error listing master accounts");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /master-accounts — link a master (exchange) account to a trader profile
router.post("/master-accounts", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const { traderId, type, label, apiKey, apiSecret, mt5Login, mt5Password, mt5Server } = req.body as Record<string, string>;
    if (!traderId || !type || !label) {
      res.status(400).json({ error: "traderId, type, and label required" }); return;
    }
    if (!["binance", "bybit", "mt5"].includes(type)) {
      res.status(400).json({ error: "type must be binance, bybit, or mt5" }); return;
    }
    if ((type === "binance" || type === "bybit") && (!apiKey || !apiSecret)) {
      res.status(400).json({ error: "apiKey and apiSecret required for exchange accounts" }); return;
    }
    if (type === "mt5" && (!mt5Login || !mt5Password || !mt5Server)) {
      res.status(400).json({ error: "mt5Login, mt5Password, and mt5Server required" }); return;
    }

    // Verify the trader profile exists
    const trader = await db.select().from(tradersTable)
      .where(eq(tradersTable.id, parseInt(traderId))).limit(1).then((r) => r[0]);
    if (!trader) { res.status(404).json({ error: "Trader profile not found" }); return; }

    const [inserted] = await db.insert(copyAccountsTable).values({
      userId: clerkId,
      role: "master",
      traderId: parseInt(traderId),
      type,
      label,
      apiKey: apiKey ? encrypt(apiKey) : null,
      apiSecret: apiSecret ? encrypt(apiSecret) : null,
      mt5Login: mt5Login ?? null,
      mt5Password: mt5Password ? encrypt(mt5Password) : null,
      mt5Server: mt5Server ?? null,
    }).returning();

    res.status(201).json(maskAccount(inserted));
  } catch (err) {
    req.log.error({ err }, "Error creating master account");
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /master-accounts/:id
router.delete("/master-accounts/:id", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const account = await db.select().from(copyAccountsTable)
      .where(and(eq(copyAccountsTable.id, id), eq(copyAccountsTable.role, "master")))
      .limit(1).then((r) => r[0]);
    if (!account || account.userId !== clerkId) { res.status(404).json({ error: "Not found" }); return; }
    // Clean up position snapshot
    await db.delete(masterPositionsTable).where(eq(masterPositionsTable.masterAccountId, id));
    await db.delete(copyAccountsTable).where(eq(copyAccountsTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Error deleting master account");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ═══════════════════════════════════════════════════════════════════
   MASTER POSITIONS  (live snapshot — read-only, updated by poller)
════════════════════════════════════════════════════════════════════ */

// GET /master-positions?traderId=123 — current open positions for a trader's master account
router.get("/master-positions", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const { traderId } = req.query as Record<string, string>;
    if (!traderId) { res.status(400).json({ error: "traderId required" }); return; }

    const positions = await db.select().from(masterPositionsTable)
      .where(eq(masterPositionsTable.traderId, parseInt(traderId)))
      .orderBy(desc(masterPositionsTable.openedAt));

    res.json(positions.map((p) => ({
      id: p.id,
      masterAccountId: p.masterAccountId,
      traderId: p.traderId,
      symbol: p.symbol,
      side: p.side,
      size: parseFloat(p.size as string),
      entryPrice: parseFloat(p.entryPrice as string),
      stopLoss: p.stopLoss ? parseFloat(p.stopLoss as string) : null,
      takeProfit: p.takeProfit ? parseFloat(p.takeProfit as string) : null,
      leverage: p.leverage,
      market: p.market,
      brokerPositionId: p.brokerPositionId,
      openedAt: p.openedAt,
      updatedAt: p.updatedAt,
    })));
  } catch (err) {
    req.log.error({ err }, "Error listing master positions");
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

/* Copier limits by plan — premium/elite get unlimited (-1) */
const PLAN_COPIER_LIMITS: Record<string, number> = {
  free:    1,
  pro:     3,
  premium: -1,
  elite:   -1,
};

router.post("/copy-subscriptions", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const { traderId, copyAccountId, maxAmount, stopLoss, allocatedAmount, lotMultiplier } = req.body;
    if (!traderId) { res.status(400).json({ error: "traderId required" }); return; }

    // Gate: require active platform subscription
    if (!(await requireActiveSub(clerkId))) {
      res.status(403).json({ error: "Active copy trading subscription required", code: "SUBSCRIPTION_REQUIRED" }); return;
    }

    // Check plan copier limit
    const userRow = await db.select({ plan: usersTable.plan }).from(usersTable).where(eq(usersTable.id, clerkId)).limit(1).then((r) => r[0]);
    const plan = userRow?.plan ?? "free";
    const limit = PLAN_COPIER_LIMITS[plan] ?? 1;
    if (limit !== -1) {
      const existing = await db.select({ id: copySubscriptionsTable.id }).from(copySubscriptionsTable)
        .where(and(eq(copySubscriptionsTable.userId, clerkId), eq(copySubscriptionsTable.status, "active")));
      if (existing.length >= limit) {
        res.status(403).json({
          error: `Your ${plan} plan allows up to ${limit} active copier${limit !== 1 ? "s" : ""}. Upgrade to Premium for unlimited copiers.`,
          code: "PLAN_LIMIT_REACHED",
          plan,
          limit,
        });
        return;
      }
    }

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

    const { traderId, symbol, market, action, orderType, price, stopPrice, quantity, stopLoss, takeProfit, leverage, notes } = req.body;
    if (!traderId || !symbol || !market || !action || !quantity) {
      res.status(400).json({ error: "traderId, symbol, market, action, quantity required" }); return;
    }

    const [signal] = await db.insert(tradeSignalsTable).values({
      traderId, symbol, market, action,
      orderType: orderType ?? "market",
      price: price?.toString() ?? null,
      stopPrice: stopPrice?.toString() ?? null,
      quantity: quantity.toString(),
      stopLoss: stopLoss?.toString() ?? null,
      takeProfit: takeProfit?.toString() ?? null,
      leverage: leverage ?? 1,
      notes: notes ?? null,
    }).returning();

    res.status(201).json({
      ...signal,
      price: signal.price ? parseFloat(signal.price as string) : null,
      stopPrice: signal.stopPrice ? parseFloat(signal.stopPrice as string) : null,
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

/* ═══════════════════════════════════════════════════════════════════
   PLATFORM SUBSCRIPTION PLANS  (public — returns pricing)
════════════════════════════════════════════════════════════════════ */

const DEFAULT_PLANS = [
  { plan: "1m",  label: "1 Month",  durationMonths: 1,  priceUsdt: "49",  priceFiat: "49"  },
  { plan: "3m",  label: "3 Months", durationMonths: 3,  priceUsdt: "129", priceFiat: "129" },
  { plan: "6m",  label: "6 Months", durationMonths: 6,  priceUsdt: "229", priceFiat: "229" },
  { plan: "1y",  label: "1 Year",   durationMonths: 12, priceUsdt: "399", priceFiat: "399" },
];

router.get("/subscription-plans", async (req, res): Promise<void> => {
  try {
    const rows = await db.select().from(subscriptionPlansTable);
    if (!rows.length) {
      res.json(DEFAULT_PLANS.map((p) => ({ ...p, enabled: true })));
      return;
    }
    res.json(rows.map((r) => ({
      plan: r.plan, label: r.label, durationMonths: r.durationMonths,
      priceUsdt: parseFloat(r.priceUsdt as string),
      priceFiat: parseFloat(r.priceFiat as string),
      enabled: r.enabled,
    })));
  } catch (err) {
    req.log.error({ err }, "Error listing subscription plans");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── GET /my-platform-subscription ─────────────────────────────── */
router.get("/my-platform-subscription", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const now = new Date();

    const sub = await db.select().from(platformSubscriptionsTable)
      .where(eq(platformSubscriptionsTable.userId, clerkId))
      .orderBy(desc(platformSubscriptionsTable.createdAt))
      .limit(1)
      .then((r) => r[0]);

    if (!sub) { res.json(null); return; }

    // Re-check expiry
    if (sub.status === "active" && sub.endDate && sub.endDate < now) {
      await db.update(platformSubscriptionsTable).set({ status: "expired" }).where(eq(platformSubscriptionsTable.id, sub.id));
      sub.status = "expired";
    }

    res.json({
      id: sub.id, plan: sub.plan, status: sub.status,
      startDate: sub.startDate, endDate: sub.endDate,
      paymentMethod: sub.paymentMethod, adminNote: sub.adminNote,
      createdAt: sub.createdAt,
    });
  } catch (err) {
    req.log.error({ err }, "Error getting platform subscription");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── POST /platform-subscriptions — submit payment proof ─────── */
router.post("/platform-subscriptions", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const { plan, paymentMethod, txHash, screenshotUrl } = req.body as Record<string, string>;
    if (!plan || !["1m","3m","6m","1y"].includes(plan)) {
      res.status(400).json({ error: "plan must be 1m, 3m, 6m, or 1y" }); return;
    }
    if (!paymentMethod || !["usdt_bep20","bank_transfer"].includes(paymentMethod)) {
      res.status(400).json({ error: "paymentMethod must be usdt_bep20 or bank_transfer" }); return;
    }
    if (!txHash?.trim()) {
      res.status(400).json({ error: "txHash / reference is required" }); return;
    }

    // Look up plan price
    const planRow = await db.select().from(subscriptionPlansTable).where(eq(subscriptionPlansTable.plan, plan)).limit(1).then((r) => r[0]);
    const defaults = DEFAULT_PLANS.find((p) => p.plan === plan);
    const priceUsdt = planRow?.priceUsdt ?? defaults?.priceUsdt ?? "0";
    const priceFiat = planRow?.priceFiat ?? defaults?.priceFiat ?? "0";

    // Cancel any existing pending_payment for this user so they can resubmit
    await db.update(platformSubscriptionsTable)
      .set({ status: "rejected", adminNote: "Superseded by new submission" })
      .where(and(
        eq(platformSubscriptionsTable.userId, clerkId),
        eq(platformSubscriptionsTable.status, "pending_payment"),
      ));

    const [inserted] = await db.insert(platformSubscriptionsTable).values({
      userId: clerkId, plan, status: "pending_payment",
      priceUsdt: priceUsdt.toString(), priceFiat: priceFiat.toString(),
      paymentMethod, txHash: txHash.trim(),
      screenshotUrl: screenshotUrl?.trim() ?? null,
    }).returning();

    res.status(201).json({ id: inserted.id, status: inserted.status });
  } catch (err) {
    req.log.error({ err }, "Error submitting platform subscription");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── Helper: gate copy trading behind an active platform subscription */
async function requireActiveSub(clerkId: string): Promise<boolean> {
  const now = new Date();
  const sub = await db.select().from(platformSubscriptionsTable)
    .where(and(
      eq(platformSubscriptionsTable.userId, clerkId),
      eq(platformSubscriptionsTable.status, "active"),
    ))
    .limit(1).then((r) => r[0]);
  if (!sub) return false;
  if (sub.endDate && sub.endDate < now) {
    await db.update(platformSubscriptionsTable).set({ status: "expired" }).where(eq(platformSubscriptionsTable.id, sub.id));
    return false;
  }
  return true;
}

export default router;
