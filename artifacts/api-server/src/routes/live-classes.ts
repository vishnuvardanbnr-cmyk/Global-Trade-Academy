import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { liveClassesTable, liveClassRegistrationsTable, usersTable } from "@workspace/db";
import { eq, and, gte, sql } from "drizzle-orm";

const router = Router();

async function buildClassResponse(cls: typeof liveClassesTable.$inferSelect) {
  const [regCount, instructor] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(liveClassRegistrationsTable).where(eq(liveClassRegistrationsTable.classId, cls.id)),
    db.select({ displayName: usersTable.displayName }).from(usersTable).where(eq(usersTable.id, cls.instructorId)).limit(1),
  ]);
  return {
    id: cls.id,
    title: cls.title,
    description: cls.description,
    instructorId: cls.instructorId,
    instructorName: instructor[0]?.displayName ?? null,
    scheduledAt: cls.scheduledAt,
    duration: cls.duration,
    status: cls.status,
    meetingUrl: cls.meetingUrl,
    replayUrl: cls.replayUrl,
    category: cls.category,
    maxAttendees: cls.maxAttendees,
    registrationCount: regCount[0]?.count ?? 0,
    thumbnailUrl: cls.thumbnailUrl,
    createdAt: cls.createdAt,
  };
}

// GET /api/live-classes
router.get("/live-classes", async (req, res): Promise<void> => {
  try {
    const { upcoming, instructorId } = req.query as Record<string, string>;
    let query = db.select().from(liveClassesTable).$dynamic();
    const conditions = [];
    if (upcoming === "true") conditions.push(gte(liveClassesTable.scheduledAt, new Date()));
    if (instructorId) conditions.push(eq(liveClassesTable.instructorId, instructorId));
    if (conditions.length) query = query.where(and(...conditions));
    const classes = await query.limit(50);
    const results = await Promise.all(classes.map(buildClassResponse));
    res.json(results);
  } catch (err) {
    req.log.error({ err }, "Error listing live classes");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/live-classes
router.post("/live-classes", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const { title, description, scheduledAt, duration, meetingUrl, category, maxAttendees, thumbnailUrl } = req.body;
    if (!title || !scheduledAt) { res.status(400).json({ error: "title and scheduledAt required" }); return; }

    const inserted = await db.insert(liveClassesTable).values({
      title, description, instructorId: clerkId,
      scheduledAt: new Date(scheduledAt), duration, meetingUrl, category, maxAttendees, thumbnailUrl,
      status: "scheduled",
    }).returning();

    res.status(201).json(await buildClassResponse(inserted[0]));
  } catch (err) {
    req.log.error({ err }, "Error creating live class");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/live-classes/:classId
router.get("/live-classes/:classId", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.classId);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const cls = await db.select().from(liveClassesTable).where(eq(liveClassesTable.id, id)).limit(1).then((r) => r[0]);
    if (!cls) { res.status(404).json({ error: "Live class not found" }); return; }
    res.json(await buildClassResponse(cls));
  } catch (err) {
    req.log.error({ err }, "Error getting live class");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/live-classes/:classId
router.patch("/live-classes/:classId", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.classId);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const { title, description, scheduledAt, duration, status, meetingUrl, replayUrl, category, maxAttendees } = req.body;
    const updated = await db.update(liveClassesTable).set({
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
      ...(scheduledAt !== undefined && { scheduledAt: new Date(scheduledAt) }),
      ...(duration !== undefined && { duration }),
      ...(status !== undefined && { status }),
      ...(meetingUrl !== undefined && { meetingUrl }),
      ...(replayUrl !== undefined && { replayUrl }),
      ...(category !== undefined && { category }),
      ...(maxAttendees !== undefined && { maxAttendees }),
    }).where(eq(liveClassesTable.id, id)).returning();
    if (!updated[0]) { res.status(404).json({ error: "Live class not found" }); return; }
    res.json(await buildClassResponse(updated[0]));
  } catch (err) {
    req.log.error({ err }, "Error updating live class");
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/live-classes/:classId
router.delete("/live-classes/:classId", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.classId);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    await db.delete(liveClassesTable).where(eq(liveClassesTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Error deleting live class");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/live-classes/:classId/register
router.post("/live-classes/:classId/register", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const classId = parseInt(req.params.classId);
    if (isNaN(classId)) { res.status(400).json({ error: "Invalid id" }); return; }

    const existing = await db.select().from(liveClassRegistrationsTable)
      .where(and(eq(liveClassRegistrationsTable.classId, classId), eq(liveClassRegistrationsTable.userId, clerkId)))
      .limit(1).then((r) => r[0]);

    if (existing) { res.status(409).json({ error: "Already registered" }); return; }

    const inserted = await db.insert(liveClassRegistrationsTable).values({ classId, userId: clerkId }).returning();
    const reg = inserted[0];
    res.status(201).json({ classId: reg.classId, userId: reg.userId, registeredAt: reg.registeredAt });
  } catch (err) {
    req.log.error({ err }, "Error registering for live class");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
