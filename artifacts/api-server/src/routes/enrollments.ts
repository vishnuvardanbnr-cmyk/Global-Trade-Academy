import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { enrollmentsTable, coursesTable, lessonsTable, lessonProgressTable, usersTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";

const router = Router();

// GET /api/enrollments
router.get("/enrollments", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const enrollments = await db
      .select()
      .from(enrollmentsTable)
      .where(eq(enrollmentsTable.userId, clerkId));

    const results = await Promise.all(enrollments.map(async (enr) => {
      const course = await db.select().from(coursesTable).where(eq(coursesTable.id, enr.courseId)).limit(1).then((r) => r[0]);
      const [totalLessons, completedLessons] = await Promise.all([
        db.select({ count: sql<number>`count(*)::int` }).from(lessonsTable).where(eq(lessonsTable.courseId, enr.courseId)),
        db.select({ count: sql<number>`count(*)::int` }).from(lessonProgressTable).where(and(eq(lessonProgressTable.userId, clerkId), eq(lessonProgressTable.completed, true))),
      ]);

      const total = totalLessons[0]?.count ?? 0;
      const completed = completedLessons[0]?.count ?? 0;
      const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

      const instructor = course ? await db.select({ displayName: usersTable.displayName }).from(usersTable).where(eq(usersTable.id, course.instructorId)).limit(1) : [];

      return {
        id: enr.id,
        courseId: enr.courseId,
        userId: enr.userId,
        status: enr.status,
        progress,
        completedLessons: completed,
        totalLessons: total,
        enrolledAt: enr.enrolledAt,
        completedAt: enr.completedAt,
        course: course ? {
          id: course.id,
          title: course.title,
          description: course.description,
          instructorId: course.instructorId,
          instructorName: instructor[0]?.displayName ?? null,
          category: course.category,
          level: course.level,
          status: course.status,
          thumbnailUrl: course.thumbnailUrl,
          price: course.price ? parseFloat(course.price) : null,
          duration: course.duration,
          lessonCount: total,
          enrollmentCount: 0,
          rating: 4.5,
          isFeatured: course.isFeatured,
          createdAt: course.createdAt,
        } : null,
      };
    }));

    res.json(results);
  } catch (err) {
    req.log.error({ err }, "Error listing enrollments");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/enrollments
router.post("/enrollments", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const { courseId } = req.body;
    if (!courseId) { res.status(400).json({ error: "courseId required" }); return; }

    const existing = await db
      .select()
      .from(enrollmentsTable)
      .where(and(eq(enrollmentsTable.courseId, courseId), eq(enrollmentsTable.userId, clerkId)))
      .limit(1)
      .then((r) => r[0]);

    if (existing) { res.status(409).json({ error: "Already enrolled" }); return; }

    const inserted = await db.insert(enrollmentsTable).values({
      courseId,
      userId: clerkId,
      status: "active",
    }).returning();

    const enr = inserted[0];
    res.status(201).json({
      id: enr.id,
      courseId: enr.courseId,
      userId: enr.userId,
      status: enr.status,
      progress: 0,
      completedLessons: 0,
      totalLessons: 0,
      enrolledAt: enr.enrolledAt,
      completedAt: null,
      course: null,
    });
  } catch (err) {
    req.log.error({ err }, "Error creating enrollment");
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/enrollments/:enrollmentId
router.delete("/enrollments/:enrollmentId", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.enrollmentId);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    await db.delete(enrollmentsTable).where(eq(enrollmentsTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Error deleting enrollment");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
