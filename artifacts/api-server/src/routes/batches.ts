import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import {
  batchesTable, batchStudentsTable, enrollmentsTable,
  usersTable, coursesTable, liveClassesTable,
} from "@workspace/db";
import { eq, and, inArray, desc, notInArray } from "drizzle-orm";

const router = Router();

async function isInstructorOf(clerkId: string, courseId: number): Promise<boolean> {
  const course = await db.select({ instructorId: coursesTable.instructorId })
    .from(coursesTable).where(eq(coursesTable.id, courseId)).limit(1).then((r) => r[0]);
  return !!course && course.instructorId === clerkId;
}

async function ownsBatch(clerkId: string, batchId: number): Promise<boolean> {
  const batch = await db.select({ instructorId: batchesTable.instructorId })
    .from(batchesTable).where(eq(batchesTable.id, batchId)).limit(1).then((r) => r[0]);
  return !!batch && batch.instructorId === clerkId;
}

/* ── GET /api/instructor/courses/:courseId/batches ── */
router.get("/instructor/courses/:courseId/batches", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const courseId = parseInt(req.params.courseId);
    if (!(await isInstructorOf(clerkId, courseId))) { res.status(403).json({ error: "Forbidden" }); return; }

    const batches = await db.select().from(batchesTable)
      .where(eq(batchesTable.courseId, courseId))
      .orderBy(desc(batchesTable.createdAt));

    const batchIds = batches.map((b) => b.id);
    const studentCounts = batchIds.length
      ? await db.select({ batchId: batchStudentsTable.batchId })
          .from(batchStudentsTable)
          .where(inArray(batchStudentsTable.batchId, batchIds))
      : [];

    const countMap: Record<number, number> = {};
    for (const s of studentCounts) countMap[s.batchId] = (countMap[s.batchId] ?? 0) + 1;

    res.json(batches.map((b) => ({ ...b, studentCount: countMap[b.id] ?? 0 })));
  } catch (err) {
    req.log.error({ err }, "Error listing batches");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── POST /api/instructor/courses/:courseId/batches ── */
router.post("/instructor/courses/:courseId/batches", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const courseId = parseInt(req.params.courseId);
    if (!(await isInstructorOf(clerkId, courseId))) { res.status(403).json({ error: "Forbidden" }); return; }

    const { name, description, startDate, endDate, maxStudents, status } = req.body;
    if (!name?.trim()) { res.status(400).json({ error: "name is required" }); return; }

    const inserted = await db.insert(batchesTable).values({
      courseId, instructorId: clerkId,
      name: name.trim(),
      description: description?.trim() || null,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      maxStudents: maxStudents ? parseInt(maxStudents) : null,
      status: status ?? "active",
    }).returning();

    res.status(201).json({ ...inserted[0], studentCount: 0 });
  } catch (err) {
    req.log.error({ err }, "Error creating batch");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── PATCH /api/instructor/batches/:batchId ── */
router.patch("/instructor/batches/:batchId", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const batchId = parseInt(req.params.batchId);
    if (!(await ownsBatch(clerkId, batchId))) { res.status(403).json({ error: "Forbidden" }); return; }

    const { name, description, startDate, endDate, maxStudents, status } = req.body;
    const updated = await db.update(batchesTable).set({
      ...(name !== undefined && { name: name.trim() }),
      ...(description !== undefined && { description: description?.trim() || null }),
      ...(startDate !== undefined && { startDate: startDate ? new Date(startDate) : null }),
      ...(endDate !== undefined && { endDate: endDate ? new Date(endDate) : null }),
      ...(maxStudents !== undefined && { maxStudents: maxStudents ? parseInt(maxStudents) : null }),
      ...(status !== undefined && { status }),
    }).where(eq(batchesTable.id, batchId)).returning();

    if (!updated.length) { res.status(404).json({ error: "Batch not found" }); return; }
    res.json(updated[0]);
  } catch (err) {
    req.log.error({ err }, "Error updating batch");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── DELETE /api/instructor/batches/:batchId ── */
router.delete("/instructor/batches/:batchId", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const batchId = parseInt(req.params.batchId);
    if (!(await ownsBatch(clerkId, batchId))) { res.status(403).json({ error: "Forbidden" }); return; }

    await db.delete(batchStudentsTable).where(eq(batchStudentsTable.batchId, batchId));
    await db.delete(batchesTable).where(eq(batchesTable.id, batchId));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Error deleting batch");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── GET /api/instructor/batches/:batchId/students ── */
router.get("/instructor/batches/:batchId/students", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const batchId = parseInt(req.params.batchId);
    if (!(await ownsBatch(clerkId, batchId))) { res.status(403).json({ error: "Forbidden" }); return; }

    const members = await db.select().from(batchStudentsTable)
      .where(eq(batchStudentsTable.batchId, batchId));

    const userIds = members.map((m) => m.userId);
    const users = userIds.length
      ? await db.select({ id: usersTable.id, displayName: usersTable.displayName, email: usersTable.email })
          .from(usersTable).where(inArray(usersTable.id, userIds))
      : [];
    const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

    res.json(members.map((m) => ({
      id: m.id,
      batchId: m.batchId,
      userId: m.userId,
      addedAt: m.addedAt,
      displayName: userMap[m.userId]?.displayName ?? null,
      email: userMap[m.userId]?.email ?? null,
    })));
  } catch (err) {
    req.log.error({ err }, "Error listing batch students");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── GET /api/instructor/batches/:batchId/available-students ── */
/* Returns course-enrolled students NOT yet in this batch */
router.get("/instructor/batches/:batchId/available-students", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const batchId = parseInt(req.params.batchId);

    const batch = await db.select().from(batchesTable)
      .where(eq(batchesTable.id, batchId)).limit(1).then((r) => r[0]);
    if (!batch || batch.instructorId !== clerkId) { res.status(403).json({ error: "Forbidden" }); return; }

    // All enrolled students for this course
    const enrolled = await db.select({ userId: enrollmentsTable.userId })
      .from(enrollmentsTable)
      .where(and(eq(enrollmentsTable.courseId, batch.courseId), eq(enrollmentsTable.status, "active")));

    const enrolledIds = enrolled.map((e) => e.userId);
    if (!enrolledIds.length) { res.json([]); return; }

    // Students already in this batch
    const inBatch = await db.select({ userId: batchStudentsTable.userId })
      .from(batchStudentsTable).where(eq(batchStudentsTable.batchId, batchId));
    const inBatchIds = new Set(inBatch.map((s) => s.userId));

    const availableIds = enrolledIds.filter((id) => !inBatchIds.has(id));
    if (!availableIds.length) { res.json([]); return; }

    const users = await db.select({ id: usersTable.id, displayName: usersTable.displayName, email: usersTable.email })
      .from(usersTable).where(inArray(usersTable.id, availableIds));

    res.json(users);
  } catch (err) {
    req.log.error({ err }, "Error listing available students");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── POST /api/instructor/batches/:batchId/students ── */
router.post("/instructor/batches/:batchId/students", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const batchId = parseInt(req.params.batchId);
    if (!(await ownsBatch(clerkId, batchId))) { res.status(403).json({ error: "Forbidden" }); return; }

    const { userId } = req.body;
    if (!userId) { res.status(400).json({ error: "userId required" }); return; }

    const inserted = await db.insert(batchStudentsTable).values({ batchId, userId })
      .onConflictDoNothing().returning();

    res.status(201).json(inserted[0] ?? { batchId, userId });
  } catch (err) {
    req.log.error({ err }, "Error adding student to batch");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── DELETE /api/instructor/batches/:batchId/students/:userId ── */
router.delete("/instructor/batches/:batchId/students/:userId", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const batchId = parseInt(req.params.batchId);
    if (!(await ownsBatch(clerkId, batchId))) { res.status(403).json({ error: "Forbidden" }); return; }

    await db.delete(batchStudentsTable)
      .where(and(eq(batchStudentsTable.batchId, batchId), eq(batchStudentsTable.userId, req.params.userId)));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Error removing student from batch");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── GET /api/instructor/batches/:batchId/live-classes ── */
router.get("/instructor/batches/:batchId/live-classes", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const batchId = parseInt(req.params.batchId);
    if (!(await ownsBatch(clerkId, batchId))) { res.status(403).json({ error: "Forbidden" }); return; }

    const classes = await db.select().from(liveClassesTable)
      .where(eq(liveClassesTable.batchId, batchId))
      .orderBy(desc(liveClassesTable.scheduledAt));

    res.json(classes);
  } catch (err) {
    req.log.error({ err }, "Error listing batch live classes");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
