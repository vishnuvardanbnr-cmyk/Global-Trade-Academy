import { Router } from "express";
import { getAuth } from "../lib/auth";
import { db } from "@workspace/db";
import { attendanceTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router = Router();

async function buildAttendanceResponse(att: typeof attendanceTable.$inferSelect) {
  const user = await db.select({ displayName: usersTable.displayName }).from(usersTable).where(eq(usersTable.id, att.userId)).limit(1);
  return {
    id: att.id,
    classId: att.classId,
    userId: att.userId,
    userName: user[0]?.displayName ?? null,
    status: att.status,
    joinedAt: att.joinedAt,
    leftAt: att.leftAt,
    durationMinutes: att.durationMinutes,
    createdAt: att.createdAt,
  };
}

// GET /api/attendance
router.get("/attendance", async (req, res): Promise<void> => {
  try {
    const { classId, userId } = req.query as Record<string, string>;
    let query = db.select().from(attendanceTable).$dynamic();
    const conditions = [];
    if (classId) conditions.push(eq(attendanceTable.classId, parseInt(classId)));
    if (userId) conditions.push(eq(attendanceTable.userId, userId));
    if (conditions.length) query = query.where(and(...conditions));
    const records = await query.limit(100);
    const results = await Promise.all(records.map(buildAttendanceResponse));
    res.json(results);
  } catch (err) {
    req.log.error({ err }, "Error listing attendance");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/attendance
router.post("/attendance", async (req, res): Promise<void> => {
  try {
    const { classId, userId, status, joinedAt, leftAt, durationMinutes } = req.body;
    if (!classId || !userId || !status) { res.status(400).json({ error: "classId, userId, status required" }); return; }

    const inserted = await db.insert(attendanceTable).values({
      classId,
      userId,
      status,
      joinedAt: joinedAt ? new Date(joinedAt) : undefined,
      leftAt: leftAt ? new Date(leftAt) : undefined,
      durationMinutes,
    }).returning();

    res.status(201).json(await buildAttendanceResponse(inserted[0]));
  } catch (err) {
    req.log.error({ err }, "Error marking attendance");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/attendance/my
router.get("/attendance/my", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const records = await db.select().from(attendanceTable).where(eq(attendanceTable.userId, clerkId)).limit(50);
    const results = await Promise.all(records.map(buildAttendanceResponse));
    res.json(results);
  } catch (err) {
    req.log.error({ err }, "Error getting my attendance");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
