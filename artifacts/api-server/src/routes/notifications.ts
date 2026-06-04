import { Router } from "express";
import { db } from "@workspace/db";
import { notificationsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { getAuth } from "../lib/auth";

const router = Router();

router.get("/notifications", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const rows = await db
      .select()
      .from(notificationsTable)
      .where(eq(notificationsTable.userId, userId))
      .orderBy(desc(notificationsTable.createdAt))
      .limit(50);
    const unreadCount = rows.filter((n) => !n.read).length;
    res.json({ notifications: rows, unreadCount });
  } catch (err) {
    req.log.error({ err }, "Error fetching notifications");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/notifications/:id/read", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = Number(req.params.id);
  try {
    await db
      .update(notificationsTable)
      .set({ read: true })
      .where(and(eq(notificationsTable.id, id), eq(notificationsTable.userId, userId)));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Error marking notification read");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/notifications/read-all", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    await db
      .update(notificationsTable)
      .set({ read: true })
      .where(eq(notificationsTable.userId, userId));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Error marking all notifications read");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/notifications/:id", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = Number(req.params.id);
  try {
    await db
      .delete(notificationsTable)
      .where(and(eq(notificationsTable.id, id), eq(notificationsTable.userId, userId)));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Error deleting notification");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
