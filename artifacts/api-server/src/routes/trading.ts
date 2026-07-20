import { Router } from "express";
import { getAuth } from "../lib/auth";
import { randomUUID } from "crypto";
import { db } from "@workspace/db";
import {
  tradersTable, copySubscriptionsTable, watchlistTable,
  copyAccountsTable, tradeSignalsTable, copyTradesTable,
  masterPositionsTable, usersTable,
  platformSubscriptionsTable, subscriptionPlansTable,
  siteSettingsTable,
} from "@workspace/db";
import { eq, and, desc, sql, gte, count, inArray, avg } from "drizzle-orm";
import { encrypt, decrypt } from "../lib/encrypt";
import { fanOutSignal, metaapiSubscribe, metaapiUnsubscribe, metaapiCreateAccount } from "../lib/fan-out";

const router = Router();

/* ─── helpers ─────────────────────────────────────────────────────── */

/**
 * Recalculate winRate and roi from actual executed trade pairs.
 * Matches every buy/sell signal with its subsequent close signal per symbol (FIFO),
 * uses avg executedPrice from copy_trades as the fill price proxy,
 * then derives win/loss and cumulative ROI from price differences.
 */
async function recalcTraderPerformance(traderId: number): Promise<void> {
  try {
    // 1. All executed signals for this trader with their avg fill price across copiers
    const signals = await db
      .select({
        id:        tradeSignalsTable.id,
        symbol:    tradeSignalsTable.symbol,
        action:    tradeSignalsTable.action,
        createdAt: tradeSignalsTable.createdAt,
        signalPrice: tradeSignalsTable.price,
      })
      .from(tradeSignalsTable)
      .where(and(
        eq(tradeSignalsTable.traderId, traderId),
        eq(tradeSignalsTable.status, "executed"),
      ))
      .orderBy(tradeSignalsTable.createdAt);

    if (signals.length === 0) return;

    // 2. Avg fill prices per signal from copy_trades
    const sigIds = signals.map((s) => s.id);
    const fillRows = await db
      .select({
        signalId: copyTradesTable.signalId,
        avgPrice: avg(copyTradesTable.executedPrice).as("avg_price"),
      })
      .from(copyTradesTable)
      .where(and(
        inArray(copyTradesTable.signalId, sigIds),
        // Include "closed" so manually-closed open trades still provide their open price
        inArray(copyTradesTable.status, ["executed", "closed"]),
      ))
      .groupBy(copyTradesTable.signalId);

    const fillMap = new Map(
      fillRows.map((r) => [
        r.signalId,
        r.avgPrice ? parseFloat(r.avgPrice as string) : null,
      ]),
    );

    // Helper: best price for a signal (fill price preferred, signal price fallback)
    const getPrice = (sig: (typeof signals)[0]): number | null => {
      return fillMap.get(sig.id) ?? (sig.signalPrice ? parseFloat(sig.signalPrice as string) : null);
    };

    // 3. Match open↔close pairs per symbol (FIFO queue)
    const openStack = new Map<string, Array<{ price: number; action: string }>>();
    let wins = 0, losses = 0, cumulativeReturn = 0;

    for (const sig of signals) {
      if (sig.action === "buy" || sig.action === "sell") {
        const price = getPrice(sig);
        if (price == null) continue;
        const stack = openStack.get(sig.symbol) ?? [];
        stack.push({ price, action: sig.action });
        openStack.set(sig.symbol, stack);
      } else if (sig.action === "close") {
        const closePrice = getPrice(sig);
        if (closePrice == null) continue;
        const stack = openStack.get(sig.symbol);
        if (!stack || stack.length === 0) continue;

        const open = stack.shift()!;
        const diff = open.action === "buy"
          ? closePrice - open.price   // long: profit when close > open
          : open.price - closePrice;  // short: profit when close < open

        const returnPct = (diff / open.price) * 100;
        cumulativeReturn += returnPct;
        if (diff > 0) wins++; else losses++;
      }
    }

    const totalClosed = wins + losses;
    if (totalClosed === 0) return; // no closed pairs yet — don't overwrite zeros

    const winRate = (wins / totalClosed) * 100;
    await db.update(tradersTable).set({
      winRate: winRate.toFixed(2),
      roi:     cumulativeReturn.toFixed(2),
    }).where(eq(tradersTable.id, traderId));
  } catch { /* non-critical */ }
}

/** Recompute totalTrades + followers from live DB counts and persist them. */
async function recalcTraderStats(traderId: number): Promise<void> {
  try {
    const [[sigRow], [subRow]] = await Promise.all([
      db.select({ n: count() }).from(tradeSignalsTable)
        .where(eq(tradeSignalsTable.traderId, traderId)),
      db.select({ n: count() }).from(copySubscriptionsTable)
        .where(and(
          eq(copySubscriptionsTable.traderId, traderId),
          eq(copySubscriptionsTable.status, "active"),
        )),
    ]);
    await db.update(tradersTable).set({
      totalTrades: sigRow?.n ?? 0,
      followers:   subRow?.n ?? 0,
    }).where(eq(tradersTable.id, traderId));
  } catch { /* non-critical — never let a stat failure break a request */ }
}

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
    executionMode: a.executionMode ?? "cloud",
    agentToken: a.agentToken ?? null,
    agentLastSeen: a.agentLastSeen ?? null,
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

/* GET /copy-trading-disclaimer — public, no auth needed */
router.get("/copy-trading-disclaimer", async (_req, res): Promise<void> => {
  try {
    const row = await db.select().from(siteSettingsTable)
      .where(eq(siteSettingsTable.key, "copy_trading_disclaimer")).limit(1).then((r) => r[0]);
    res.json({ text: row?.value ?? "" });
  } catch { res.json({ text: "" }); }
});

/* GET /gallery — public gallery images for the landing page */
router.get("/gallery", async (_req, res): Promise<void> => {
  try {
    const row = await db.select().from(siteSettingsTable)
      .where(eq(siteSettingsTable.key, "landing_gallery")).limit(1).then((r) => r[0]);
    res.json(row ? JSON.parse(row.value) : []);
  } catch { res.json([]); }
});

/* GET /trading-pairs — public list of admin-configured pairs for the trade form */
router.get("/trading-pairs", async (_req, res): Promise<void> => {
  try {
    const row = await db.select().from(siteSettingsTable)
      .where(eq(siteSettingsTable.key, "trading_pairs")).limit(1).then((r) => r[0]);
    res.json(row ? JSON.parse(row.value) : []);
  } catch {
    res.json([]);
  }
});

/* PATCH /my-trader — trader updates their own profile */
router.patch("/my-trader", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const trader = await db.select().from(tradersTable)
      .where(eq(tradersTable.userId, clerkId)).limit(1).then((r) => r[0]);
    if (!trader) { res.status(404).json({ error: "No trader profile found" }); return; }

    const { displayName, bio, strategy, markets, riskScore, avatarUrl } = req.body;
    const update: Record<string, unknown> = {};
    if (displayName !== undefined) update.displayName = displayName;
    if (bio !== undefined) update.bio = bio;
    if (strategy !== undefined) update.strategy = strategy;
    if (markets !== undefined) update.markets = markets;
    if (riskScore !== undefined) update.riskScore = riskScore !== null ? parseInt(String(riskScore)) : null;
    if (avatarUrl !== undefined) update.avatarUrl = avatarUrl;

    const [updated] = await db.update(tradersTable).set(update).where(eq(tradersTable.userId, clerkId)).returning();
    res.json(buildTraderResponse(updated));
  } catch (err) {
    req.log.error({ err }, "Error updating my trader");
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
            metaapiAccountId, mt5Platform, executionMode } = req.body as Record<string, string>;
    if (!type || !label) { res.status(400).json({ error: "type and label required" }); return; }
    if (!["binance", "bybit", "mt5", "metaapi"].includes(type)) {
      res.status(400).json({ error: "type must be binance, bybit, mt5, or metaapi" }); return;
    }
    const resolvedMode = (
      executionMode === "safe"  ? "safe"  :
      executionMode === "agent" ? "agent" : "cloud"
    ) as "cloud" | "agent" | "safe";
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

    // Safe mode = MT5 direct on Windows VPS — skip MetaAPI entirely.
    // Cloud/agent mode = MetaAPI cloud as usual.
    let resolvedMetaapiAccountId = metaapiAccountId ?? null;
    if (type === "metaapi" && resolvedMode !== "safe") {
      const platform = (mt5Platform === "mt4" ? "mt4" : "mt5") as "mt4" | "mt5";
      resolvedMetaapiAccountId = await metaapiCreateAccount({
        login: mt5Login,
        password: mt5Password,
        server: mt5Server,
        platform,
        name: label,
      });
    }

    // Generate token for agent/safe modes
    const agentToken = (resolvedMode === "agent" || resolvedMode === "safe")
      ? `bia_${randomUUID().replace(/-/g, "")}`
      : null;

    const [inserted] = await db.insert(copyAccountsTable).values({
      userId: clerkId, role: "copier", type, label,
      apiKey: apiKey ? encrypt(apiKey) : null,
      apiSecret: apiSecret ? encrypt(apiSecret) : null,
      mt5Login: mt5Login ?? null,
      // Store encrypted password for mt5 type AND safe-mode metaapi (VPS needs it)
      mt5Password: ((type === "mt5" || resolvedMode === "safe") && mt5Password) ? encrypt(mt5Password) : null,
      mt5Server: mt5Server ?? null,
      metaapiAccountId: resolvedMetaapiAccountId,
      executionMode: resolvedMode,
      agentToken,
    }).returning();

    // Agent mode → Linux VPS (legacy, MetaAPI cloud)
    if (resolvedMode === "agent" && inserted.agentToken) {
      import("../lib/vps-manager").then(({ provisionVps }) => {
        provisionVps({
          copyAccountId: inserted.id,
          userId: clerkId,
          agentToken: inserted.agentToken!,
        }).catch((err: unknown) => req.log.error({ err }, "Linux VPS provision failed"));
      }).catch(() => {});
    }

    // Safe mode → Windows VPS (MT5 direct, no MetaAPI)
    if (resolvedMode === "safe" && inserted.agentToken && mt5Login && mt5Password && mt5Server) {
      import("../lib/vps-manager").then(({ provisionSafeVps }) => {
        provisionSafeVps({
          copyAccountId: inserted.id,
          userId:        clerkId,
          agentToken:    inserted.agentToken!,
          mt5Login,
          mt5Password,   // raw password from request body (before encryption)
          mt5Server,
          platform:      (mt5Platform === "mt4" ? "mt4" : "mt5") as "mt4" | "mt5",
        }).catch((err: unknown) => req.log.error({ err }, "Windows VPS provision failed"));
      }).catch(() => {});
    }

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
    // Destroy managed VPS if one exists
    if (account.executionMode === "agent") {
      import("../lib/vps-manager").then(({ destroyVps }) => {
        destroyVps(id).catch(() => {});
      }).catch(() => {});
    }
    // Also clean up any stored positions for master accounts
    if (account.role === "master") {
      await db.delete(masterPositionsTable).where(eq(masterPositionsTable.masterAccountId, id));
    }
    // MetaAPI account deletion: individual copy-subscriptions are cleaned up via DELETE /copy-subscriptions,
    // which handles per-strategy unsubscription. Nothing to do here at the account level.
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

    // Duplicate trader check — user already has an active sub for this trader
    const dupTrader = await db.select({ id: copySubscriptionsTable.id }).from(copySubscriptionsTable)
      .where(and(
        eq(copySubscriptionsTable.userId, clerkId),
        eq(copySubscriptionsTable.traderId, traderId),
        eq(copySubscriptionsTable.status, "active"),
      )).limit(1);
    if (dupTrader.length > 0) {
      res.status(409).json({ error: "You are already copying this trader. Unfollow first to re-subscribe." });
      return;
    }

    // Verify the copy account belongs to this user if provided
    let copyAccount: typeof copyAccountsTable.$inferSelect | undefined;
    if (copyAccountId) {
      copyAccount = await db.select().from(copyAccountsTable).where(eq(copyAccountsTable.id, copyAccountId)).limit(1).then((r) => r[0]);
      if (!copyAccount || copyAccount.userId !== clerkId) { res.status(403).json({ error: "Invalid copy account" }); return; }

      // Account already linked check — same broker account can't be active on another trader
      const dupAccount = await db.select({ id: copySubscriptionsTable.id, traderId: copySubscriptionsTable.traderId })
        .from(copySubscriptionsTable)
        .where(and(
          eq(copySubscriptionsTable.copyAccountId, copyAccountId),
          eq(copySubscriptionsTable.status, "active"),
        )).limit(1);
      if (dupAccount.length > 0 && dupAccount[0].traderId !== traderId) {
        res.status(409).json({ error: "This broker account is already linked to another trader. Unlink it first before connecting to a new one." });
        return;
      }
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

    const trader = await db.select({ displayName: tradersTable.displayName, metaapiStrategyId: tradersTable.metaapiStrategyId })
      .from(tradersTable).where(eq(tradersTable.id, inserted.traderId)).limit(1);

    // If copier chose a MetaAPI account, subscribe it to this specific trader's strategy
    if (copyAccount?.type === "metaapi" && copyAccount.metaapiAccountId && trader[0]?.metaapiStrategyId) {
      try {
        await metaapiSubscribe(
          copyAccount.metaapiAccountId,
          copyAccount.label,
          parseFloat((inserted.lotMultiplier ?? "1") as string),
          trader[0].metaapiStrategyId,
        );
      } catch (err) {
        req.log.warn({ err }, "MetaAPI subscribe failed — subscription created but MetaAPI not wired");
      }
    }

    // Increment follower count
    setImmediate(() => recalcTraderStats(traderId).catch(() => {}));

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
    setImmediate(() => recalcTraderStats(updated.traderId).catch(() => {}));
  } catch (err) {
    req.log.error({ err }, "Error updating copy subscription");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/copy-subscriptions/:subscriptionId", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.subscriptionId);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

    // Look up subscription + account + trader before deleting, to unsubscribe from MetaAPI
    const sub = await db.select().from(copySubscriptionsTable).where(eq(copySubscriptionsTable.id, id)).limit(1).then((r) => r[0]);
    if (sub?.copyAccountId) {
      const [account, traderRow] = await Promise.all([
        db.select().from(copyAccountsTable).where(eq(copyAccountsTable.id, sub.copyAccountId)).limit(1).then((r) => r[0]),
        db.select({ metaapiStrategyId: tradersTable.metaapiStrategyId }).from(tradersTable).where(eq(tradersTable.id, sub.traderId)).limit(1).then((r) => r[0]),
      ]);
      if (account?.type === "metaapi" && account.metaapiAccountId && traderRow?.metaapiStrategyId) {
        await metaapiUnsubscribe(account.metaapiAccountId, traderRow.metaapiStrategyId);
      }
    }

    const traderId = sub?.traderId;
    await db.delete(copySubscriptionsTable).where(eq(copySubscriptionsTable.id, id));
    res.status(204).send();
    if (traderId) setImmediate(() => recalcTraderStats(traderId).catch(() => {}));
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

    // Fan-out + stat recalc asynchronously — don't block the response
    setImmediate(() => {
      fanOutSignal(signal).catch((e) => console.error("Fan-out error:", e));
      recalcTraderStats(signal.traderId).catch(() => {});
      // For close signals, wait for fill prices to arrive (4s fetch delay) then recalc
      const delay = signal.action === "close" ? 8_000 : 0;
      setTimeout(() => recalcTraderPerformance(signal.traderId).catch(() => {}), delay);
    });
  } catch (err) {
    req.log.error({ err }, "Error creating trade signal");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ═══════════════════════════════════════════════════════════════════
   TRADER DASHBOARD  — stats + closed trades + copier PnL + subscribers
════════════════════════════════════════════════════════════════════ */

router.get("/trader-dashboard", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const traderId = req.query.traderId ? parseInt(req.query.traderId as string) : null;
    if (!traderId) { res.status(400).json({ error: "traderId required" }); return; }

    // ── 1. Trader headline stats ─────────────────────────────────
    const [trader] = await db.select().from(tradersTable).where(eq(tradersTable.id, traderId)).limit(1);

    // ── 2. All executed signals for matching ─────────────────────
    const allSigs = await db.select().from(tradeSignalsTable)
      .where(and(
        eq(tradeSignalsTable.traderId, traderId),
        eq(tradeSignalsTable.status, "executed"),
        inArray(tradeSignalsTable.action, ["buy", "sell", "close"]),
      ))
      .orderBy(tradeSignalsTable.createdAt);

    // ── 3. Avg fill prices per signal from copy_trades ───────────
    const sigIds = allSigs.map((s) => s.id);
    const fillRows = sigIds.length > 0 ? await db
      .select({
        signalId: copyTradesTable.signalId,
        avgPrice: avg(copyTradesTable.executedPrice).as("ap"),
      })
      .from(copyTradesTable)
      .where(and(inArray(copyTradesTable.signalId, sigIds), eq(copyTradesTable.status, "executed")))
      .groupBy(copyTradesTable.signalId) : [];

    const fillMap = new Map(fillRows.map((r) => [r.signalId, r.avgPrice ? parseFloat(r.avgPrice as string) : null]));

    // ── 4. FIFO match → closed positions ────────────────────────
    type OpenEntry = { sig: (typeof allSigs)[0]; price: number };
    const openStack = new Map<string, OpenEntry[]>();
    const closedPositions: Array<{
      symbol: string; market: string; action: string;
      openedAt: string; closedAt: string;
      openPrice: number; closePrice: number;
      returnPct: number; openSignalId: number; closeSignalId: number;
    }> = [];

    for (const sig of allSigs) {
      const price = fillMap.get(sig.id) ?? (sig.price ? parseFloat(sig.price as string) : null);
      if (sig.action === "buy" || sig.action === "sell") {
        if (price == null) continue;
        const st = openStack.get(sig.symbol) ?? [];
        st.push({ sig, price });
        openStack.set(sig.symbol, st);
      } else if (sig.action === "close") {
        const st = openStack.get(sig.symbol);
        if (!st || st.length === 0) continue;
        const open = st.shift()!;
        if (price == null) continue;
        const diff = open.sig.action === "buy" ? price - open.price : open.price - price;
        const returnPct = (diff / open.price) * 100;
        closedPositions.push({
          symbol:        open.sig.symbol,
          market:        open.sig.market,
          action:        open.sig.action,
          openedAt:      open.sig.createdAt as unknown as string,
          closedAt:      sig.createdAt as unknown as string,
          openPrice:     open.price,
          closePrice:    price,
          returnPct,
          openSignalId:  open.sig.id,
          closeSignalId: sig.id,
        });
      }
    }

    // ── 5. Aggregate PnL by copier account ───────────────────────
    const pnlRows = sigIds.length > 0 ? await db
      .select({
        copyAccountId: copyTradesTable.copyAccountId,
        totalPnl:      sql<string>`SUM(${copyTradesTable.pnl}::numeric)`.as("total_pnl"),
        tradeCount:    sql<string>`COUNT(*)`.as("trade_count"),
        winCount:      sql<string>`COUNT(*) FILTER (WHERE ${copyTradesTable.pnl}::numeric > 0)`.as("win_count"),
        accountLabel:  copyAccountsTable.label,
        accountType:   copyAccountsTable.type,
      })
      .from(copyTradesTable)
      .innerJoin(copyAccountsTable, eq(copyTradesTable.copyAccountId, copyAccountsTable.id))
      .where(and(
        inArray(copyTradesTable.signalId, sigIds),
        inArray(copyTradesTable.status, ["executed", "closed"]),
      ))
      .groupBy(copyTradesTable.copyAccountId, copyAccountsTable.label, copyAccountsTable.type) : [];

    // ── 5b. Failed trade counts per copier account ────────────────
    const failRows = sigIds.length > 0 ? await db
      .select({
        copyAccountId: copyTradesTable.copyAccountId,
        failCount:     sql<string>`COUNT(*)`.as("fail_count"),
      })
      .from(copyTradesTable)
      .where(and(
        inArray(copyTradesTable.signalId, sigIds),
        eq(copyTradesTable.status, "failed"),
      ))
      .groupBy(copyTradesTable.copyAccountId) : [];

    const failMap = new Map(failRows.map((r) => [r.copyAccountId, r.failCount ? parseInt(r.failCount) : 0]));

    // ── 6. Subscribers list ──────────────────────────────────────
    const subsRows = await db
      .select({
        subId:           copySubscriptionsTable.id,
        userId:          copySubscriptionsTable.userId,
        status:          copySubscriptionsTable.status,
        lotMultiplier:   copySubscriptionsTable.lotMultiplier,
        currentPnl:      copySubscriptionsTable.currentPnl,
        allocatedAmount: copySubscriptionsTable.allocatedAmount,
        maxAmount:       copySubscriptionsTable.maxAmount,
        since:           copySubscriptionsTable.createdAt,
        accountLabel:    copyAccountsTable.label,
        accountType:     copyAccountsTable.type,
        displayName:     usersTable.displayName,
        email:           usersTable.email,
      })
      .from(copySubscriptionsTable)
      .leftJoin(copyAccountsTable, eq(copySubscriptionsTable.copyAccountId, copyAccountsTable.id))
      .leftJoin(usersTable, eq(copySubscriptionsTable.userId, usersTable.id))
      .where(eq(copySubscriptionsTable.traderId, traderId))
      .orderBy(desc(copySubscriptionsTable.createdAt));

    // ── 7. Total PnL across all copiers (from copy_trades.pnl) ──
    const totalPnlRow = sigIds.length > 0 ? await db
      .select({ total: sql<string>`COALESCE(SUM(${copyTradesTable.pnl}::numeric), 0)`.as("total") })
      .from(copyTradesTable)
      .where(and(
        inArray(copyTradesTable.signalId, sigIds),
        inArray(copyTradesTable.status, ["executed", "closed"]),
      ))
      .then((r) => r[0]) : { total: "0" };

    res.json({
      stats: {
        totalTrades:  trader?.totalTrades ?? 0,
        winRate:      trader?.winRate     ? parseFloat(trader.winRate as string)  : 0,
        roi:          trader?.roi         ? parseFloat(trader.roi as string)       : 0,
        totalPnl:     parseFloat(totalPnlRow?.total ?? "0"),
        closedCount:  closedPositions.length,
        followers:    trader?.followers   ?? 0,
      },
      closedPositions: closedPositions.slice().reverse(), // newest first
      copierPnl: pnlRows.map((r) => ({
        copyAccountId: r.copyAccountId,
        accountLabel:  r.accountLabel ?? `Account #${r.copyAccountId}`,
        accountType:   r.accountType,
        totalPnl:      r.totalPnl     ? parseFloat(r.totalPnl)     : null,
        tradeCount:    r.tradeCount   ? parseInt(r.tradeCount)      : 0,
        winCount:      r.winCount     ? parseInt(r.winCount)        : 0,
        failCount:     failMap.get(r.copyAccountId) ?? 0,
      })),
      subscribers: subsRows.map((s) => ({
        subId:           s.subId,
        userId:          s.userId,
        displayName:     s.displayName ?? s.email ?? "Unknown",
        accountLabel:    s.accountLabel ?? "Signal only",
        accountType:     s.accountType ?? null,
        lotMultiplier:   s.lotMultiplier ? parseFloat(s.lotMultiplier as string) : 1,
        currentPnl:      s.currentPnl      ? parseFloat(s.currentPnl      as string) : null,
        allocatedAmount: s.allocatedAmount ? parseFloat(s.allocatedAmount  as string) : null,
        maxAmount:       s.maxAmount       ? parseFloat(s.maxAmount        as string) : null,
        status:          s.status,
        since:           s.since,
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching trader dashboard");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ═══════════════════════════════════════════════════════════════════
   COPIER TRADES  (per-copier per-trade rows for instructor view)
════════════════════════════════════════════════════════════════════ */

router.get("/trader-copier-trades", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const traderId = req.query.traderId ? parseInt(req.query.traderId as string) : null;
    if (!traderId) { res.status(400).json({ error: "traderId required" }); return; }

    // All signals for this trader (buy/sell/close, any status)
    const allSigs = await db.select().from(tradeSignalsTable)
      .where(and(
        eq(tradeSignalsTable.traderId, traderId),
        inArray(tradeSignalsTable.action, ["buy", "sell", "close"]),
      ))
      .orderBy(tradeSignalsTable.createdAt);

    const sigIds = allSigs.map((s) => s.id);
    if (sigIds.length === 0) { res.json([]); return; }

    // All copy_trades for those signals joined with accounts + users
    const rows = await db
      .select({
        ctId:          copyTradesTable.id,
        signalId:      copyTradesTable.signalId,
        copyAccountId: copyTradesTable.copyAccountId,
        status:        copyTradesTable.status,
        executedPrice: copyTradesTable.executedPrice,
        quantity:      copyTradesTable.quantity,
        pnl:           copyTradesTable.pnl,
        brokerOrderId: copyTradesTable.brokerOrderId,
        createdAt:     copyTradesTable.createdAt,
        accountLabel:  copyAccountsTable.label,
        accountType:   copyAccountsTable.type,
        displayName:   usersTable.displayName,
        email:         usersTable.email,
      })
      .from(copyTradesTable)
      .innerJoin(copyAccountsTable, eq(copyTradesTable.copyAccountId, copyAccountsTable.id))
      .leftJoin(usersTable, eq(copyTradesTable.userId, usersTable.id))
      .where(inArray(copyTradesTable.signalId, sigIds))
      .orderBy(copyTradesTable.createdAt);

    const sigMap = new Map(allSigs.map((s) => [s.id, s]));

    // Group by copyAccountId for FIFO matching
    type CtRow = (typeof rows)[0];
    const byAccount = new Map<number, CtRow[]>();
    for (const r of rows) {
      const arr = byAccount.get(r.copyAccountId) ?? [];
      arr.push(r);
      byAccount.set(r.copyAccountId, arr);
    }

    type TradePair = {
      symbol: string; market: string; side: string;
      openPrice: number | null; closePrice: number | null;
      lots: number | null; pnl: number | null; returnPct: number | null;
      status: string; orderId: string | null;
      openTime: string; closeTime: string | null; durationMs: number | null;
      accountLabel: string; accountType: string | null; displayName: string;
    };
    const result: TradePair[] = [];

    for (const [, ctRows] of byAccount) {
      ctRows.sort((a, b) =>
        new Date(a.createdAt as unknown as string).getTime() -
        new Date(b.createdAt as unknown as string).getTime()
      );

      type OpenEntry = { ct: CtRow; sig: (typeof allSigs)[0] };
      const stack = new Map<string, OpenEntry[]>();

      for (const ct of ctRows) {
        const sig = sigMap.get(ct.signalId);
        if (!sig) continue;
        const acctLabel = ct.accountLabel ?? `Account #${ct.copyAccountId}`;
        const userName  = ct.displayName ?? ct.email ?? "Unknown";

        if (sig.action === "buy" || sig.action === "sell") {
          if (ct.status === "failed") {
            result.push({
              symbol: sig.symbol, market: sig.market, side: sig.action,
              openPrice: ct.executedPrice ? parseFloat(ct.executedPrice as string) : null,
              closePrice: null,
              lots: ct.quantity ? parseFloat(ct.quantity as string) : null,
              pnl: ct.pnl ? parseFloat(ct.pnl as string) : null,
              returnPct: null, status: "failed", orderId: ct.brokerOrderId,
              openTime: ct.createdAt as unknown as string,
              closeTime: null, durationMs: null,
              accountLabel: acctLabel, accountType: ct.accountType, displayName: userName,
            });
            continue;
          }
          if (ct.status !== "executed" && ct.status !== "closed") continue;
          const arr = stack.get(sig.symbol) ?? [];
          arr.push({ ct, sig });
          stack.set(sig.symbol, arr);
        } else if (sig.action === "close") {
          const arr = stack.get(sig.symbol);
          if (!arr || arr.length === 0) continue;
          const open = arr.shift()!;
          const openPrice  = open.ct.executedPrice ? parseFloat(open.ct.executedPrice as string) : null;
          const closePrice = ct.executedPrice ? parseFloat(ct.executedPrice as string) : null;
          const lots       = open.ct.quantity  ? parseFloat(open.ct.quantity  as string) : null;
          const pnl        = ct.pnl            ? parseFloat(ct.pnl            as string)
                           : open.ct.pnl       ? parseFloat(open.ct.pnl       as string) : null;
          let returnPct: number | null = null;
          if (openPrice != null && closePrice != null) {
            const diff = open.sig.action === "buy" ? closePrice - openPrice : openPrice - closePrice;
            returnPct = (diff / openPrice) * 100;
          }
          const openMs  = new Date(open.ct.createdAt as unknown as string).getTime();
          const closeMs = new Date(ct.createdAt as unknown as string).getTime();
          result.push({
            symbol: open.sig.symbol, market: open.sig.market, side: open.sig.action,
            openPrice, closePrice, lots, pnl, returnPct,
            status: ct.status === "failed" ? "failed" : "closed",
            orderId: open.ct.brokerOrderId,
            openTime:  open.ct.createdAt as unknown as string,
            closeTime: ct.createdAt as unknown as string,
            durationMs: closeMs - openMs,
            accountLabel: acctLabel, accountType: ct.accountType, displayName: userName,
          });
        }
      }

      // Remaining open (unmatched) positions
      for (const [, entries] of stack) {
        for (const { ct, sig } of entries) {
          if (ct.status === "executed") {
            result.push({
              symbol: sig.symbol, market: sig.market, side: sig.action,
              openPrice: ct.executedPrice ? parseFloat(ct.executedPrice as string) : null,
              closePrice: null,
              lots: ct.quantity ? parseFloat(ct.quantity as string) : null,
              pnl: ct.pnl ? parseFloat(ct.pnl as string) : null,
              returnPct: null, status: "open", orderId: ct.brokerOrderId,
              openTime: ct.createdAt as unknown as string,
              closeTime: null, durationMs: null,
              accountLabel: ct.accountLabel ?? `Account #${ct.copyAccountId}`,
              accountType: ct.accountType,
              displayName: ct.displayName ?? ct.email ?? "Unknown",
            });
          }
        }
      }
    }

    result.sort((a, b) => new Date(b.openTime).getTime() - new Date(a.openTime).getTime());
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Error fetching trader copier trades");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ═══════════════════════════════════════════════════════════════════
   OPEN POSITIONS  (buy/sell signals not yet matched by a close)
════════════════════════════════════════════════════════════════════ */

router.get("/open-positions", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const traderId = req.query.traderId ? parseInt(req.query.traderId as string) : null;
    if (!traderId) { res.status(400).json({ error: "traderId required" }); return; }

    // All executed buy/sell/close for this trader ordered by time
    const allSigs = await db.select().from(tradeSignalsTable)
      .where(and(
        eq(tradeSignalsTable.traderId, traderId),
        eq(tradeSignalsTable.status, "executed"),
        inArray(tradeSignalsTable.action, ["buy", "sell", "close"]),
      ))
      .orderBy(tradeSignalsTable.createdAt);

    // FIFO match per symbol: consume one open for each close
    const openStack = new Map<string, (typeof allSigs)>();
    for (const sig of allSigs) {
      if (sig.action === "buy" || sig.action === "sell") {
        const st = openStack.get(sig.symbol) ?? [];
        st.push(sig);
        openStack.set(sig.symbol, st);
      } else if (sig.action === "close") {
        const st = openStack.get(sig.symbol);
        if (st && st.length > 0) st.shift();
      }
    }

    const openSigs: (typeof allSigs) = [];
    for (const st of openStack.values()) openSigs.push(...st);
    if (openSigs.length === 0) { res.json([]); return; }

    // Join copy_trades + accounts for each open signal
    const sigIds = openSigs.map((s) => s.id);
    const ctRows = await db
      .select({
        id:            copyTradesTable.id,
        signalId:      copyTradesTable.signalId,
        copyAccountId: copyTradesTable.copyAccountId,
        status:        copyTradesTable.status,
        executedPrice: copyTradesTable.executedPrice,
        quantity:      copyTradesTable.quantity,
        brokerOrderId: copyTradesTable.brokerOrderId,
        createdAt:     copyTradesTable.createdAt,
        accountLabel:  copyAccountsTable.label,
        accountType:   copyAccountsTable.type,
        executionMode: copyAccountsTable.executionMode,
      })
      .from(copyTradesTable)
      .innerJoin(copyAccountsTable, eq(copyTradesTable.copyAccountId, copyAccountsTable.id))
      .where(and(
        inArray(copyTradesTable.signalId, sigIds),
        inArray(copyTradesTable.status, ["executed", "closed"]),
      ));

    const bySignal = new Map<number, typeof ctRows>();
    for (const ct of ctRows) {
      const arr = bySignal.get(ct.signalId) ?? [];
      arr.push(ct);
      bySignal.set(ct.signalId, arr);
    }

    res.json(openSigs.map((sig) => ({
      signalId:    sig.id,
      symbol:      sig.symbol,
      market:      sig.market,
      action:      sig.action,
      quantity:    parseFloat(sig.quantity as string),
      signalPrice: sig.price ? parseFloat(sig.price as string) : null,
      notes:       sig.notes,
      createdAt:   sig.createdAt,
      copiers: (bySignal.get(sig.id) ?? []).map((ct) => ({
        copyTradeId:   ct.id,
        accountId:     ct.copyAccountId,
        accountLabel:  ct.accountLabel ?? `Account #${ct.copyAccountId}`,
        accountType:   ct.accountType,
        executionMode: ct.executionMode,
        executedPrice: ct.executedPrice ? parseFloat(ct.executedPrice as string) : null,
        quantity:      ct.quantity ? parseFloat(ct.quantity as string) : null,
        brokerOrderId: ct.brokerOrderId,
        executedAt:    ct.createdAt,
        status:        ct.status,
      })),
    })));
  } catch (err) {
    req.log.error({ err }, "Error fetching open positions");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ═══════════════════════════════════════════════════════════════════
   SIGNAL COPIERS  (copier breakdown for a single signal)
════════════════════════════════════════════════════════════════════ */

router.get("/signal-copiers", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const signalId = parseInt(req.query.signalId as string);
    if (!signalId) { res.status(400).json({ error: "signalId required" }); return; }

    const rows = await db
      .select({
        id:            copyTradesTable.id,
        copyAccountId: copyTradesTable.copyAccountId,
        status:        copyTradesTable.status,
        executedPrice: copyTradesTable.executedPrice,
        quantity:      copyTradesTable.quantity,
        pnl:           copyTradesTable.pnl,
        brokerOrderId: copyTradesTable.brokerOrderId,
        errorMessage:  copyTradesTable.errorMessage,
        createdAt:     copyTradesTable.createdAt,
        accountLabel:  copyAccountsTable.label,
        accountType:   copyAccountsTable.type,
        executionMode: copyAccountsTable.executionMode,
      })
      .from(copyTradesTable)
      .innerJoin(copyAccountsTable, eq(copyTradesTable.copyAccountId, copyAccountsTable.id))
      .where(eq(copyTradesTable.signalId, signalId))
      .orderBy(desc(copyTradesTable.createdAt));

    res.json(rows.map((r) => ({
      copyTradeId:   r.id,
      accountId:     r.copyAccountId,
      accountLabel:  r.accountLabel ?? `Account #${r.copyAccountId}`,
      accountType:   r.accountType,
      executionMode: r.executionMode,
      executedPrice: r.executedPrice ? parseFloat(r.executedPrice as string) : null,
      quantity:      r.quantity ? parseFloat(r.quantity as string) : null,
      pnl:           r.pnl ? parseFloat(r.pnl as string) : null,
      brokerOrderId: r.brokerOrderId,
      errorMessage:  r.errorMessage,
      executedAt:    r.createdAt,
      status:        r.status,
    })));
  } catch (err) {
    req.log.error({ err }, "Error fetching signal copiers");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ═══════════════════════════════════════════════════════════════════
   DIRECT CLOSE — close a specific signal's positions across all copiers
════════════════════════════════════════════════════════════════════ */

router.post("/signals/:signalId/close", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const signalId = parseInt(req.params.signalId);
    if (!signalId) { res.status(400).json({ error: "Invalid signalId" }); return; }
    const { closeBySignalId } = await import("../lib/fan-out");
    const result = await closeBySignalId(signalId);
    res.json(result);
    // Recalculate stats after close prices settle (fill-price fetches take ~4s)
    if (result.closed > 0) {
      setTimeout(() => {
        recalcTraderStats(result.traderId).catch(() => {});
        recalcTraderPerformance(result.traderId).catch(() => {});
      }, 12_000);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    req.log.error({ err }, "Error closing signal positions");
    res.status(500).json({ error: msg });
  }
});

/* ═══════════════════════════════════════════════════════════════════
   CLOSE ALL — close every open position for a trader
════════════════════════════════════════════════════════════════════ */

router.post("/signals/close-all", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const traderId = req.query.traderId ? parseInt(req.query.traderId as string) : null;
    if (!traderId) { res.status(400).json({ error: "traderId required" }); return; }

    // Find all FIFO-open signal IDs (same logic as open-positions)
    const allSigs = await db.select({ id: tradeSignalsTable.id, action: tradeSignalsTable.action, symbol: tradeSignalsTable.symbol })
      .from(tradeSignalsTable)
      .where(and(
        eq(tradeSignalsTable.traderId, traderId),
        eq(tradeSignalsTable.status, "executed"),
        inArray(tradeSignalsTable.action, ["buy", "sell", "close"]),
      ))
      .orderBy(tradeSignalsTable.createdAt);

    const openStack = new Map<string, number[]>();
    for (const sig of allSigs) {
      if (sig.action === "buy" || sig.action === "sell") {
        const st = openStack.get(sig.symbol) ?? [];
        st.push(sig.id);
        openStack.set(sig.symbol, st);
      } else if (sig.action === "close") {
        const st = openStack.get(sig.symbol);
        if (st && st.length > 0) st.shift();
      }
    }

    const openIds: number[] = [];
    for (const ids of openStack.values()) openIds.push(...ids);
    if (openIds.length === 0) { res.json({ closed: 0, failed: 0, skipped: 0, total: 0 }); return; }

    const { closeBySignalId } = await import("../lib/fan-out");
    let closed = 0, failed = 0, skipped = 0;
    await Promise.allSettled(openIds.map(async (id) => {
      try {
        const r = await closeBySignalId(id);
        closed  += r.closed;
        failed  += r.failed;
        skipped += r.skipped;
      } catch { failed++; }
    }));

    res.json({ closed, failed, skipped, total: openIds.length });
    // Recalculate stats after close prices settle (fill-price fetches take ~4s)
    if (closed > 0) {
      setTimeout(() => {
        recalcTraderStats(traderId).catch(() => {});
        recalcTraderPerformance(traderId).catch(() => {});
      }, 12_000);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    req.log.error({ err }, "Error in close-all");
    res.status(500).json({ error: msg });
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
   PUBLIC PAYMENT SETTINGS  (returns deposit address — no API key)
════════════════════════════════════════════════════════════════════ */
router.get("/payment-settings", async (_req, res): Promise<void> => {
  try {
    const row = await db.select().from(siteSettingsTable)
      .where(eq(siteSettingsTable.key, "payment_settings")).limit(1).then((r) => r[0]);
    const settings = row?.value ? (JSON.parse(row.value as string) as Record<string, string>) : {};
    res.json({ usdtAddress: settings.usdtAddress ?? "" });
  } catch {
    res.json({ usdtAddress: "" });
  }
});

/* ── BscScan TX verification helper ────────────────────────────── */
const USDT_BEP20_CONTRACT = "0x55d398326f99059ff775485246999027b3197955";
const TRANSFER_TOPIC0 = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

async function verifyUsdtTx(
  txHash: string,
  depositAddress: string,
  expectedUsdt: number,
  apiKey: string,
): Promise<{ valid: boolean; error?: string; amountUsdt?: number }> {
  const url = `https://api.bscscan.com/api?module=proxy&action=eth_getTransactionReceipt&txhash=${txHash}&apikey=${apiKey || "YourApiKeyToken"}`;
  const resp = await (fetch as typeof globalThis.fetch)(url, { signal: AbortSignal.timeout(10000) });
  if (!resp.ok) return { valid: false, error: "BscScan API unreachable" };
  const data = await resp.json() as { result?: Record<string, unknown> | null };
  if (!data.result) return { valid: false, error: "Transaction not found or not yet confirmed. Please wait for at least 1 confirmation and try again." };

  const receipt = data.result;
  if (receipt.status !== "0x1") return { valid: false, error: "Transaction failed on chain." };

  const logs = receipt.logs as Array<{ address: string; topics: string[]; data: string }> ?? [];
  const transferLog = logs.find(
    (log) =>
      log.address.toLowerCase() === USDT_BEP20_CONTRACT &&
      log.topics[0] === TRANSFER_TOPIC0 &&
      log.topics[2] &&
      ("0x" + log.topics[2].slice(26)).toLowerCase() === depositAddress.toLowerCase(),
  );

  if (!transferLog) {
    return { valid: false, error: "No USDT (BEP-20) transfer to the deposit address was found in this transaction." };
  }

  // USDT BEP-20 has 18 decimals on BSC
  const amountWei = BigInt(transferLog.data);
  const amountUsdt = Number(amountWei) / 1e18;

  if (amountUsdt < expectedUsdt * 0.99) {
    return { valid: false, error: `Insufficient amount: received ${amountUsdt.toFixed(2)} USDT, expected ${expectedUsdt} USDT.` };
  }

  return { valid: true, amountUsdt };
}

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
    const rows = await db.select().from(subscriptionPlansTable)
      .where(eq(subscriptionPlansTable.enabled, true));
    if (!rows.length) {
      // Return default plans if table is empty (all enabled by default)
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

    // First, check for a valid active subscription (best entitlement)
    const allSubs = await db.select().from(platformSubscriptionsTable)
      .where(eq(platformSubscriptionsTable.userId, clerkId))
      .orderBy(desc(platformSubscriptionsTable.createdAt));

    if (!allSubs.length) { res.json(null); return; }

    // Expire any active subs that have passed their endDate
    for (const s of allSubs) {
      if (s.status === "active" && s.endDate && s.endDate < now) {
        await db.update(platformSubscriptionsTable).set({ status: "expired" }).where(eq(platformSubscriptionsTable.id, s.id));
        s.status = "expired";
      }
    }

    // Exclude cancelled — they convey no entitlement and must never shadow active/pending
    const meaningful = allSubs.filter((s) => s.status !== "cancelled");
    if (!meaningful.length) { res.json(null); return; }

    // Priority: active > pending_payment > rejected > expired
    const priority = ["active", "pending_payment", "rejected", "expired"];
    const sub = meaningful.sort((a, b) => priority.indexOf(a.status) - priority.indexOf(b.status))[0];

    // For pending payments, include the deposit address and expected amount
    let depositAddress: string | null = null;
    if (sub.status === "pending_payment") {
      const settingsRow = await db.select().from(siteSettingsTable)
        .where(eq(siteSettingsTable.key, "payment_settings")).limit(1).then((r) => r[0]);
      const settings = settingsRow?.value ? (JSON.parse(settingsRow.value as string) as Record<string, string>) : {};
      depositAddress = settings.usdtAddress?.trim() ?? null;
    }

    res.json({
      id: sub.id, plan: sub.plan, status: sub.status,
      startDate: sub.startDate, endDate: sub.endDate,
      txHash: sub.txHash, adminNote: sub.adminNote,
      createdAt: sub.createdAt,
      // payment initiation fields
      expectedAmount: sub.status === "pending_payment" ? parseFloat(sub.priceUsdt as string) : undefined,
      depositAddress: sub.status === "pending_payment" ? depositAddress : undefined,
      expiresAt: sub.status === "pending_payment" ? new Date(new Date(sub.createdAt).getTime() + 24 * 60 * 60 * 1000).toISOString() : undefined,
    });
  } catch (err) {
    req.log.error({ err }, "Error getting platform subscription");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── POST /platform-subscriptions — initiate automated USDT payment ── */
router.post("/platform-subscriptions", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const { plan } = req.body as { plan?: string };
    if (!plan || !["1m","3m","6m","1y"].includes(plan)) {
      res.status(400).json({ error: "plan must be 1m, 3m, 6m, or 1y" }); return;
    }

    // Load deposit address — required for automated payment
    const settingsRow = await db.select().from(siteSettingsTable)
      .where(eq(siteSettingsTable.key, "payment_settings")).limit(1).then((r) => r[0]);
    const settings = settingsRow?.value ? (JSON.parse(settingsRow.value as string) as Record<string, string>) : {};
    const depositAddress = settings.usdtAddress?.trim();
    if (!depositAddress) {
      res.status(503).json({ error: "Payment system not configured. Please contact support." }); return;
    }

    // Look up plan price — also enforces that the plan is enabled
    const planRow = await db.select().from(subscriptionPlansTable)
      .where(and(eq(subscriptionPlansTable.plan, plan), eq(subscriptionPlansTable.enabled, true)))
      .limit(1).then((r) => r[0]);
    const tableHasRows = await db.select({ count: sql`count(*)` }).from(subscriptionPlansTable).then((r) => Number(r[0]?.count ?? 0));
    if (tableHasRows > 0 && !planRow) {
      res.status(400).json({ error: "Selected plan is not available" }); return;
    }
    const defaults = DEFAULT_PLANS.find((p) => p.plan === plan);
    const basePrice = parseFloat((planRow?.priceUsdt ?? defaults?.priceUsdt ?? "49").toString());

    // Assign a unique expected amount (basePrice + small cents suffix) to distinguish concurrent payments
    const windowStart = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const existingAmounts = await db.select({ priceUsdt: platformSubscriptionsTable.priceUsdt })
      .from(platformSubscriptionsTable)
      .where(and(
        eq(platformSubscriptionsTable.status, "pending_payment"),
        gte(platformSubscriptionsTable.createdAt, windowStart),
      ));
    const usedAmounts = new Set(existingAmounts.map((r) => parseFloat(r.priceUsdt as string)));
    let uniqueAmount = basePrice;
    for (let i = 1; i <= 97; i++) {
      const candidate = parseFloat((basePrice + i * 0.01).toFixed(2));
      if (!usedAmounts.has(candidate)) { uniqueAmount = candidate; break; }
    }

    // Cancel any existing pending_payment for this user
    await db.update(platformSubscriptionsTable)
      .set({ status: "cancelled", adminNote: "Superseded by new payment" })
      .where(and(
        eq(platformSubscriptionsTable.userId, clerkId),
        eq(platformSubscriptionsTable.status, "pending_payment"),
      ));

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const [inserted] = await db.insert(platformSubscriptionsTable).values({
      userId: clerkId, plan, status: "pending_payment",
      priceUsdt: uniqueAmount.toFixed(2),
      priceFiat: (planRow?.priceFiat ?? defaults?.priceFiat ?? "0").toString(),
      paymentMethod: "usdt_bep20",
    }).returning();

    res.status(201).json({
      id: inserted.id, status: "pending_payment",
      depositAddress, expectedAmount: uniqueAmount, expiresAt,
    });
  } catch (err) {
    req.log.error({ err }, "Error initiating platform subscription");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── Helper: gate copy trading behind an active platform subscription */
async function requireActiveSub(clerkId: string): Promise<boolean> {
  const now = new Date();
  // Find any active sub for this user
  const subs = await db.select().from(platformSubscriptionsTable)
    .where(and(
      eq(platformSubscriptionsTable.userId, clerkId),
      eq(platformSubscriptionsTable.status, "active"),
    ));
  for (const sub of subs) {
    if (!sub.endDate || sub.endDate >= now) return true;
    // Expired — mark it
    await db.update(platformSubscriptionsTable).set({ status: "expired" }).where(eq(platformSubscriptionsTable.id, sub.id));
  }
  return false;
}

/* ══════════════════════════════════════════════════════════════════
   BROKER SERVER SEARCH
════════════════════════════════════════════════════════════════════ */

const BROKER_SERVERS: { name: string; platform: "mt4" | "mt5" | "both" }[] = [
  { name: "OctaFX-Demo", platform: "mt5" },
  { name: "OctaFX-Real", platform: "mt5" },
  { name: "ICMarkets-Demo", platform: "both" },
  { name: "ICMarkets-Live01", platform: "both" },
  { name: "ICMarkets-Live02", platform: "both" },
  { name: "ICMarkets-Live03", platform: "both" },
  { name: "Exness-Trial1", platform: "mt5" },
  { name: "Exness-Real3", platform: "mt5" },
  { name: "Exness-Real4", platform: "mt5" },
  { name: "Exness-Real5", platform: "mt5" },
  { name: "ExnessTech-Real", platform: "mt5" },
  { name: "XMGlobal-Demo 3", platform: "mt5" },
  { name: "XMGlobal-Demo 4", platform: "mt5" },
  { name: "XMGlobal-Real 3", platform: "mt5" },
  { name: "XMGlobal-Real 4", platform: "mt5" },
  { name: "XMGlobal-Real 10", platform: "mt5" },
  { name: "Deriv-Demo", platform: "mt5" },
  { name: "Deriv-Server", platform: "mt5" },
  { name: "Pepperstone-Demo", platform: "both" },
  { name: "Pepperstone-Edge-Demo", platform: "both" },
  { name: "Pepperstone-Edge01", platform: "both" },
  { name: "Pepperstone-Edge02", platform: "both" },
  { name: "Pepperstone-Edge03", platform: "both" },
  { name: "FBS-Demo", platform: "both" },
  { name: "FBS-Real", platform: "both" },
  { name: "FXTM-Demo", platform: "both" },
  { name: "FXTM-ECN", platform: "both" },
  { name: "FXTM-Real", platform: "both" },
  { name: "HotForex-Demo", platform: "both" },
  { name: "HotForex-Live04", platform: "both" },
  { name: "HotForex-Live05", platform: "both" },
  { name: "Alpari-Demo", platform: "both" },
  { name: "Alpari-MT5-Demo", platform: "mt5" },
  { name: "Alpari-MT5-Real2", platform: "mt5" },
  { name: "AxiTrader-Demo MT5", platform: "mt5" },
  { name: "AxiTrader-Live MT5", platform: "mt5" },
  { name: "FxPro-Demo", platform: "both" },
  { name: "FxPro-MT5 Real4", platform: "mt5" },
  { name: "ThinkMarkets-Demo", platform: "both" },
  { name: "ThinkMarkets-Live", platform: "both" },
  { name: "EasyMarkets-Demo", platform: "both" },
  { name: "EasyMarkets-Live", platform: "both" },
  { name: "Tickmill-Demo", platform: "both" },
  { name: "Tickmill-Live", platform: "both" },
  { name: "RoboForex-Demo", platform: "both" },
  { name: "RoboForex-ECN", platform: "both" },
  { name: "VantageFX-Demo", platform: "both" },
  { name: "VantageFX-Live", platform: "both" },
  { name: "Admiral-Demo", platform: "both" },
  { name: "Admiral-Live", platform: "both" },
  { name: "TMGM-Demo", platform: "mt5" },
  { name: "TMGM-Live", platform: "mt5" },
  { name: "Swissquote-Demo", platform: "both" },
  { name: "Swissquote-Live", platform: "both" },
  { name: "LiteFinance-MT5-Demo", platform: "mt5" },
  { name: "LiteFinance-MT5-Real", platform: "mt5" },
  { name: "FP Markets-Demo", platform: "both" },
  { name: "FP Markets-Live", platform: "both" },
  { name: "GBE-Demo", platform: "mt5" },
  { name: "GBE-Live", platform: "mt5" },
];

router.get("/broker-servers", (req, res): void => {
  const q = String(req.query.q ?? "").trim().toLowerCase();
  if (!q || q.length < 2) { res.json([]); return; }
  const results = BROKER_SERVERS
    .filter((s) => s.name.toLowerCase().includes(q))
    .slice(0, 10)
    .map((s) => s.name);
  res.json(results);
});

export default router;
