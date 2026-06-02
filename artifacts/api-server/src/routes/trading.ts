import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { tradersTable, copySubscriptionsTable, watchlistTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";

const router = Router();

function buildTraderResponse(t: typeof tradersTable.$inferSelect) {
  return {
    id: t.id,
    userId: t.userId,
    displayName: t.displayName,
    avatarUrl: t.avatarUrl,
    bio: t.bio,
    roi: parseFloat(t.roi as string),
    winRate: parseFloat(t.winRate as string),
    maxDrawdown: parseFloat(t.maxDrawdown as string),
    totalTrades: t.totalTrades,
    followers: t.followers,
    status: t.status,
    verified: t.verified,
    markets: t.markets,
    strategy: t.strategy,
    monthlyReturn: t.monthlyReturn ? parseFloat(t.monthlyReturn as string) : null,
    riskScore: t.riskScore,
    createdAt: t.createdAt,
  };
}

// GET /api/traders
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

// GET /api/traders/:traderId
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

// GET /api/copy-subscriptions
router.get("/copy-subscriptions", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const subs = await db.select().from(copySubscriptionsTable).where(eq(copySubscriptionsTable.userId, clerkId));
    const results = await Promise.all(subs.map(async (s) => {
      const trader = await db.select({ displayName: tradersTable.displayName }).from(tradersTable).where(eq(tradersTable.id, s.traderId)).limit(1);
      return {
        id: s.id,
        userId: s.userId,
        traderId: s.traderId,
        traderName: trader[0]?.displayName ?? null,
        status: s.status,
        maxAmount: s.maxAmount ? parseFloat(s.maxAmount as string) : null,
        stopLoss: s.stopLoss ? parseFloat(s.stopLoss as string) : null,
        allocatedAmount: s.allocatedAmount ? parseFloat(s.allocatedAmount as string) : null,
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

// POST /api/copy-subscriptions
router.post("/copy-subscriptions", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const { traderId, maxAmount, stopLoss, allocatedAmount } = req.body;
    if (!traderId) { res.status(400).json({ error: "traderId required" }); return; }

    const inserted = await db.insert(copySubscriptionsTable).values({
      userId: clerkId,
      traderId,
      status: "active",
      maxAmount: maxAmount?.toString(),
      stopLoss: stopLoss?.toString(),
      allocatedAmount: allocatedAmount?.toString(),
    }).returning();

    const s = inserted[0];
    const trader = await db.select({ displayName: tradersTable.displayName }).from(tradersTable).where(eq(tradersTable.id, s.traderId)).limit(1);
    res.status(201).json({
      id: s.id, userId: s.userId, traderId: s.traderId,
      traderName: trader[0]?.displayName ?? null,
      status: s.status,
      maxAmount: s.maxAmount ? parseFloat(s.maxAmount as string) : null,
      stopLoss: s.stopLoss ? parseFloat(s.stopLoss as string) : null,
      allocatedAmount: s.allocatedAmount ? parseFloat(s.allocatedAmount as string) : null,
      currentPnl: null, createdAt: s.createdAt,
    });
  } catch (err) {
    req.log.error({ err }, "Error creating copy subscription");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/copy-subscriptions/:subscriptionId
router.patch("/copy-subscriptions/:subscriptionId", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.subscriptionId);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const { status, maxAmount, stopLoss, allocatedAmount } = req.body;
    const updated = await db.update(copySubscriptionsTable).set({
      ...(status !== undefined && { status }),
      ...(maxAmount !== undefined && { maxAmount: maxAmount?.toString() }),
      ...(stopLoss !== undefined && { stopLoss: stopLoss?.toString() }),
      ...(allocatedAmount !== undefined && { allocatedAmount: allocatedAmount?.toString() }),
    }).where(eq(copySubscriptionsTable.id, id)).returning();
    if (!updated[0]) { res.status(404).json({ error: "Subscription not found" }); return; }
    const s = updated[0];
    const trader = await db.select({ displayName: tradersTable.displayName }).from(tradersTable).where(eq(tradersTable.id, s.traderId)).limit(1);
    res.json({
      id: s.id, userId: s.userId, traderId: s.traderId,
      traderName: trader[0]?.displayName ?? null,
      status: s.status,
      maxAmount: s.maxAmount ? parseFloat(s.maxAmount as string) : null,
      stopLoss: s.stopLoss ? parseFloat(s.stopLoss as string) : null,
      allocatedAmount: s.allocatedAmount ? parseFloat(s.allocatedAmount as string) : null,
      currentPnl: s.currentPnl ? parseFloat(s.currentPnl as string) : null,
      createdAt: s.createdAt,
    });
  } catch (err) {
    req.log.error({ err }, "Error updating copy subscription");
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/copy-subscriptions/:subscriptionId
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

// GET /api/watchlist
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

// POST /api/watchlist
router.post("/watchlist", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const { symbol, market, displayName, alertPrice } = req.body;
    if (!symbol || !market) { res.status(400).json({ error: "symbol and market required" }); return; }

    const inserted = await db.insert(watchlistTable).values({
      userId: clerkId, symbol, market, displayName, alertPrice: alertPrice?.toString(),
    }).returning();

    const w = inserted[0];
    res.status(201).json({
      id: w.id, userId: w.userId, symbol: w.symbol, market: w.market,
      displayName: w.displayName,
      alertPrice: w.alertPrice ? parseFloat(w.alertPrice as string) : null,
      createdAt: w.createdAt,
    });
  } catch (err) {
    req.log.error({ err }, "Error adding to watchlist");
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/watchlist/:itemId
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
