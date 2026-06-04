import { Router } from "express";
import { getAuth } from "../lib/auth";
import { db } from "@workspace/db";
import {
  coursesTable,
  lessonsTable,
  enrollmentsTable,
  usersTable,
  reviewsTable,
  quizzesTable,
  quizAttemptsTable,
  lessonProgressTable,
  coursePrerequisitesTable,
} from "@workspace/db";
import { eq, ilike, and, sql, inArray } from "drizzle-orm";
import { ownsCourse } from "../lib/lms";

const router = Router();

async function buildCourseResponse(course: typeof coursesTable.$inferSelect) {
  const [lessonCountResult, enrollmentCountResult, instructor, ratingResult] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(lessonsTable).where(eq(lessonsTable.courseId, course.id)),
    db.select({ count: sql<number>`count(*)::int` }).from(enrollmentsTable).where(and(eq(enrollmentsTable.courseId, course.id), eq(enrollmentsTable.status, "active"))),
    db.select({ displayName: usersTable.displayName }).from(usersTable).where(eq(usersTable.id, course.instructorId)).limit(1),
    db.select({ avg: sql<number>`coalesce(avg(${reviewsTable.rating}), 0)::float`, count: sql<number>`count(*)::int` }).from(reviewsTable).where(eq(reviewsTable.courseId, course.id)),
  ]);

  const reviewCount = ratingResult[0]?.count ?? 0;

  return {
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
    lessonCount: lessonCountResult[0]?.count ?? 0,
    enrollmentCount: enrollmentCountResult[0]?.count ?? 0,
    rating: reviewCount > 0 ? Math.round((ratingResult[0]?.avg ?? 0) * 10) / 10 : 0,
    reviewCount,
    isFeatured: course.isFeatured,
    createdAt: course.createdAt,
  };
}

// GET /api/courses
router.get("/courses", async (req, res): Promise<void> => {
  try {
    const { category, level, search, instructorId } = req.query as Record<string, string>;

    let query = db.select().from(coursesTable).$dynamic();
    const conditions = [];
    if (category) conditions.push(eq(coursesTable.category, category));
    if (level) conditions.push(eq(coursesTable.level, level));
    if (instructorId) conditions.push(eq(coursesTable.instructorId, instructorId));
    if (search) conditions.push(ilike(coursesTable.title, `%${search}%`));
    if (!instructorId) conditions.push(eq(coursesTable.status, "published"));

    query = query.where(and(...conditions));
    const courses = await query.limit(50);
    const results = await Promise.all(courses.map(buildCourseResponse));
    res.json(results);
  } catch (err) {
    req.log.error({ err }, "Error listing courses");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/courses/featured — must be before /:courseId
router.get("/courses/featured", async (req, res): Promise<void> => {
  try {
    const courses = await db
      .select()
      .from(coursesTable)
      .where(and(eq(coursesTable.isFeatured, true), eq(coursesTable.status, "published")))
      .limit(8);
    const results = await Promise.all(courses.map(buildCourseResponse));
    res.json(results);
  } catch (err) {
    req.log.error({ err }, "Error listing featured courses");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/courses
router.post("/courses", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const userRow = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, clerkId)).limit(1).then((r) => r[0]);
    if (!userRow || (userRow.role !== "instructor" && userRow.role !== "admin")) {
      res.status(403).json({ error: "Only instructors and admins can create courses" }); return;
    }

    const { title, description, category, level, thumbnailUrl, price, duration } = req.body;
    if (!title || !category || !level) { res.status(400).json({ error: "title, category, level required" }); return; }

    const inserted = await db.insert(coursesTable).values({
      title,
      description,
      instructorId: clerkId,
      category,
      level,
      thumbnailUrl,
      price: price?.toString(),
      duration,
      status: "draft",
    }).returning();

    res.status(201).json(await buildCourseResponse(inserted[0]));
  } catch (err) {
    req.log.error({ err }, "Error creating course");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/courses/:courseId
router.get("/courses/:courseId", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.courseId);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

    const course = await db.select().from(coursesTable).where(eq(coursesTable.id, id)).limit(1).then((r) => r[0]);
    if (!course) { res.status(404).json({ error: "Course not found" }); return; }

    res.json(await buildCourseResponse(course));
  } catch (err) {
    req.log.error({ err }, "Error getting course");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/courses/:courseId
router.patch("/courses/:courseId", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const id = parseInt(req.params.courseId);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

    if (!(await ownsCourse(clerkId, id))) { res.status(403).json({ error: "Forbidden" }); return; }

    const { title, description, category, level, status, thumbnailUrl, price, isFeatured } = req.body;
    const updated = await db.update(coursesTable).set({
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
      ...(category !== undefined && { category }),
      ...(level !== undefined && { level }),
      ...(status !== undefined && { status }),
      ...(thumbnailUrl !== undefined && { thumbnailUrl }),
      ...(price !== undefined && { price: price?.toString() }),
      ...(isFeatured !== undefined && { isFeatured }),
    }).where(eq(coursesTable.id, id)).returning();

    if (!updated[0]) { res.status(404).json({ error: "Course not found" }); return; }
    res.json(await buildCourseResponse(updated[0]));
  } catch (err) {
    req.log.error({ err }, "Error updating course");
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/courses/:courseId
router.delete("/courses/:courseId", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const id = parseInt(req.params.courseId);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

    if (!(await ownsCourse(clerkId, id))) { res.status(403).json({ error: "Forbidden" }); return; }

    await db.delete(coursesTable).where(eq(coursesTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Error deleting course");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/courses/:courseId/prerequisites — with met state for current user
router.get("/courses/:courseId/prerequisites", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    const courseId = parseInt(req.params.courseId);
    if (isNaN(courseId)) { res.status(400).json({ error: "Invalid id" }); return; }

    const prereqs = await db
      .select()
      .from(coursePrerequisitesTable)
      .where(eq(coursePrerequisitesTable.courseId, courseId));
    if (prereqs.length === 0) { res.json([]); return; }

    const requiredIds = prereqs.map((p) => p.requiredCourseId);
    const courses = await db
      .select({ id: coursesTable.id, title: coursesTable.title })
      .from(coursesTable)
      .where(inArray(coursesTable.id, requiredIds));

    // A prerequisite is "met" when the user has a completed enrollment for it.
    const completed = clerkId
      ? await db
          .select({ courseId: enrollmentsTable.courseId })
          .from(enrollmentsTable)
          .where(and(eq(enrollmentsTable.userId, clerkId), eq(enrollmentsTable.status, "completed"), inArray(enrollmentsTable.courseId, requiredIds)))
      : [];
    const metSet = new Set(completed.map((c) => c.courseId));

    res.json(prereqs.map((p) => ({
      courseId: p.courseId,
      requiredCourseId: p.requiredCourseId,
      title: courses.find((c) => c.id === p.requiredCourseId)?.title ?? `Course #${p.requiredCourseId}`,
      met: metSet.has(p.requiredCourseId),
    })));
  } catch (err) {
    req.log.error({ err }, "Error listing prerequisites");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/courses/:courseId/analytics — instructor only
router.get("/courses/:courseId/analytics", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const courseId = parseInt(req.params.courseId);
    if (isNaN(courseId)) { res.status(400).json({ error: "Invalid id" }); return; }
    if (!(await ownsCourse(clerkId, courseId))) { res.status(403).json({ error: "Forbidden" }); return; }

    const course = await db.select().from(coursesTable).where(eq(coursesTable.id, courseId)).limit(1).then((r) => r[0]);
    if (!course) { res.status(404).json({ error: "Course not found" }); return; }

    const [enrollRows, lessons, quizzes, ratingResult] = await Promise.all([
      db.select({ status: enrollmentsTable.status }).from(enrollmentsTable).where(eq(enrollmentsTable.courseId, courseId)),
      db.select().from(lessonsTable).where(eq(lessonsTable.courseId, courseId)),
      db.select().from(quizzesTable).where(eq(quizzesTable.courseId, courseId)),
      db.select({ avg: sql<number>`coalesce(avg(${reviewsTable.rating}), 0)::float`, count: sql<number>`count(*)::int` }).from(reviewsTable).where(eq(reviewsTable.courseId, courseId)),
    ]);

    const enrollments = enrollRows.length;
    const completions = enrollRows.filter((e) => e.status === "completed").length;
    const completionRate = enrollments === 0 ? 0 : Math.round((completions / enrollments) * 100);

    // Lesson completion counts (drop-off curve)
    const lessonIds = lessons.map((l) => l.id);
    const progressRows = lessonIds.length
      ? await db
          .select({ lessonId: lessonProgressTable.lessonId })
          .from(lessonProgressTable)
          .where(and(eq(lessonProgressTable.completed, true), inArray(lessonProgressTable.lessonId, lessonIds)))
      : [];
    const lessonDropoff = lessons
      .sort((a, b) => a.order - b.order)
      .map((l) => {
        const c = progressRows.filter((p) => p.lessonId === l.id).length;
        return {
          lessonId: l.id,
          title: l.title,
          completions: c,
          completionRate: enrollments === 0 ? 0 : Math.round((c / enrollments) * 100),
        };
      });

    // Quiz stats
    const quizIds = quizzes.map((q) => q.id);
    const attempts = quizIds.length
      ? await db.select().from(quizAttemptsTable).where(inArray(quizAttemptsTable.quizId, quizIds))
      : [];
    const quizStats = quizzes.map((q) => {
      const qa = attempts.filter((a) => a.quizId === q.id);
      const passCount = qa.filter((a) => a.passed).length;
      const avgScore = qa.length ? qa.reduce((s, a) => s + a.score, 0) / qa.length : 0;
      return {
        quizId: q.id,
        title: q.title,
        attempts: qa.length,
        passRate: qa.length ? Math.round((passCount / qa.length) * 100) : 0,
        averageScore: Math.round(avgScore),
      };
    });

    res.json({
      courseId,
      enrollments,
      completions,
      completionRate,
      averageRating: (ratingResult[0]?.count ?? 0) > 0 ? Math.round((ratingResult[0]?.avg ?? 0) * 10) / 10 : null,
      reviewCount: ratingResult[0]?.count ?? 0,
      revenue: enrollments * (course.price ? parseFloat(course.price) : 0),
      lessonDropoff,
      quizStats,
    });
  } catch (err) {
    req.log.error({ err }, "Error getting course analytics");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
