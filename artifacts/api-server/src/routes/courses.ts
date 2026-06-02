import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import {
  coursesTable,
  lessonsTable,
  enrollmentsTable,
  usersTable,
} from "@workspace/db";
import { eq, ilike, and, sql } from "drizzle-orm";

const router = Router();

async function buildCourseResponse(course: typeof coursesTable.$inferSelect) {
  const [lessonCountResult, enrollmentCountResult, instructor] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(lessonsTable).where(eq(lessonsTable.courseId, course.id)),
    db.select({ count: sql<number>`count(*)::int` }).from(enrollmentsTable).where(and(eq(enrollmentsTable.courseId, course.id), eq(enrollmentsTable.status, "active"))),
    db.select({ displayName: usersTable.displayName }).from(usersTable).where(eq(usersTable.id, course.instructorId)).limit(1),
  ]);

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
    rating: 4.5,
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
    const id = parseInt(req.params.courseId);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    await db.delete(coursesTable).where(eq(coursesTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Error deleting course");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
