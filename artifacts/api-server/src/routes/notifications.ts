import { Router } from "express";
import { db } from "@workspace/db";
import { notificationsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";

const router = Router();

/* GET /api/notifications — list for current user */
router.get("/notifications", async (req, res): Promise<void> => {
  const clerkId = req.auth?.userId;
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const rows = await db
      .select()
      .from(notificationsTable)
      .where(eq(notificationsTable.userId, clerkId))
      .orderBy(desc(notificationsTable.createdAt))
      .limit(50);
    const unreadCount = rows.filter((n) => !n.read).length;
    res.json({ notifications: rows, unreadCount });
  } catch (err) {
    req.log.error({ err }, "Error fetching notifications");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* PATCH /api/notifications/:id/read — mark one read */
router.patch("/notifications/:id/read", async (req, res): Promise<void> => {
  const clerkId = req.auth?.userId;
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = Number(req.params.id);
  try {
    await db
      .update(notificationsTable)
      .set({ read: true })
      .where(and(eq(notificationsTable.id, id), eq(notificationsTable.userId, clerkId)));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Error marking notification read");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* POST /api/notifications/read-all — mark all read */
router.post("/notifications/read-all", async (req, res): Promise<void> => {
  const clerkId = req.auth?.userId;
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    await db
      .update(notificationsTable)
      .set({ read: true })
      .where(eq(notificationsTable.userId, clerkId));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Error marking all notifications read");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* DELETE /api/notifications/:id */
router.delete("/notifications/:id", async (req, res): Promise<void> => {
  const clerkId = req.auth?.userId;
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = Number(req.params.id);
  try {
    await db
      .delete(notificationsTable)
      .where(and(eq(notificationsTable.id, id), eq(notificationsTable.userId, clerkId)));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Error deleting notification");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
