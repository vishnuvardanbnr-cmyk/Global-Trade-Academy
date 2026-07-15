import { Router } from "express";
import { db } from "@workspace/db";
import { pushSubscriptionsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { getAuth } from "../lib/auth";
import { getVapidPublicKey } from "../lib/web-push";

const router = Router();

/** GET /api/push/vapid-public-key — public, no auth required */
router.get("/push/vapid-public-key", (_req, res): void => {
  const key = getVapidPublicKey();
  if (!key) { res.status(503).json({ error: "Push notifications not configured" }); return; }
  res.json({ publicKey: key });
});

/** POST /api/push/subscribe — save/update a push subscription */
router.post("/push/subscribe", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { endpoint, keys } = req.body as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    res.status(400).json({ error: "endpoint, keys.p256dh and keys.auth are required" }); return;
  }

  try {
    await db
      .insert(pushSubscriptionsTable)
      .values({ userId, endpoint, p256dh: keys.p256dh, auth: keys.auth })
      .onConflictDoUpdate({
        target: pushSubscriptionsTable.endpoint,
        set: { userId, p256dh: keys.p256dh, auth: keys.auth },
      });
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "push subscribe error");
    res.status(500).json({ error: "Internal server error" });
  }
});

/** DELETE /api/push/unsubscribe — remove a push subscription */
router.delete("/push/unsubscribe", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { endpoint } = req.body as { endpoint?: string };
  if (!endpoint) { res.status(400).json({ error: "endpoint is required" }); return; }

  try {
    await db
      .delete(pushSubscriptionsTable)
      .where(
        and(
          eq(pushSubscriptionsTable.endpoint, endpoint),
          eq(pushSubscriptionsTable.userId, userId),
        ),
      );
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "push unsubscribe error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
