import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { enrollmentsTable, coursesTable, lessonsTable, lessonProgressTable, usersTable, reviewsTable, coursePrerequisitesTable } from "@workspace/db";
import { eq, and, sql, inArray } from "drizzle-orm";

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

      // Scope completed-lesson count to THIS course's lessons only.
      const courseLessons = await db
        .select({ id: lessonsTable.id })
        .from(lessonsTable)
        .where(eq(lessonsTable.courseId, enr.courseId));
      const total = courseLessons.length;
      const lessonIds = courseLessons.map((l) => l.id);

      const completedResult = lessonIds.length
        ? await db
            .select({ count: sql<number>`count(*)::int` })
            .from(lessonProgressTable)
            .where(and(eq(lessonProgressTable.userId, clerkId), eq(lessonProgressTable.completed, true), inArray(lessonProgressTable.lessonId, lessonIds)))
        : [{ count: 0 }];

      const completed = completedResult[0]?.count ?? 0;
      const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

      const [instructor, ratingResult] = await Promise.all([
        course ? db.select({ displayName: usersTable.displayName }).from(usersTable).where(eq(usersTable.id, course.instructorId)).limit(1) : Promise.resolve([]),
        db.select({ avg: sql<number>`coalesce(avg(${reviewsTable.rating}), 0)::float`, count: sql<number>`count(*)::int` }).from(reviewsTable).where(eq(reviewsTable.courseId, enr.courseId)),
      ]);
      const reviewCount = ratingResult[0]?.count ?? 0;

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
          rating: reviewCount > 0 ? Math.round((ratingResult[0]?.avg ?? 0) * 10) / 10 : 0,
          reviewCount,
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

    // Enforce prerequisites: every required course must be completed by this user.
    const prereqs = await db
      .select({ requiredCourseId: coursePrerequisitesTable.requiredCourseId })
      .from(coursePrerequisitesTable)
      .where(eq(coursePrerequisitesTable.courseId, courseId));

    if (prereqs.length > 0) {
      const requiredIds = prereqs.map((p) => p.requiredCourseId);
      const completed = await db
        .select({ courseId: enrollmentsTable.courseId })
        .from(enrollmentsTable)
        .where(and(
          eq(enrollmentsTable.userId, clerkId),
          eq(enrollmentsTable.status, "completed"),
          inArray(enrollmentsTable.courseId, requiredIds),
        ));
      const metSet = new Set(completed.map((c) => c.courseId));
      const unmet = requiredIds.filter((id) => !metSet.has(id));
      if (unmet.length > 0) {
        res.status(403).json({ error: "Prerequisites not met", requiredCourseIds: unmet });
        return;
      }
    }

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
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const id = parseInt(req.params.enrollmentId);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

    // Only the enrollment owner may delete it.
    const deleted = await db
      .delete(enrollmentsTable)
      .where(and(eq(enrollmentsTable.id, id), eq(enrollmentsTable.userId, clerkId)))
      .returning({ id: enrollmentsTable.id });
    if (deleted.length === 0) { res.status(404).json({ error: "Enrollment not found" }); return; }

    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Error deleting enrollment");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
