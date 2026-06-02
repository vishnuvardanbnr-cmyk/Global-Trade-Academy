import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { lessonsTable, lessonProgressTable } from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";

const router = Router();

function buildLessonResponse(l: typeof lessonsTable.$inferSelect) {
  return {
    id: l.id,
    courseId: l.courseId,
    title: l.title,
    description: l.description,
    type: l.type,
    videoUrl: l.videoUrl,
    content: l.content,
    duration: l.duration,
    order: l.order,
    isFree: l.isFree,
    createdAt: l.createdAt,
  };
}

// GET /api/courses/:courseId/lessons
router.get("/courses/:courseId/lessons", async (req, res): Promise<void> => {
  try {
    const courseId = parseInt(req.params.courseId);
    if (isNaN(courseId)) { res.status(400).json({ error: "Invalid id" }); return; }

    const lessons = await db
      .select()
      .from(lessonsTable)
      .where(eq(lessonsTable.courseId, courseId))
      .orderBy(asc(lessonsTable.order));

    res.json(lessons.map(buildLessonResponse));
  } catch (err) {
    req.log.error({ err }, "Error listing lessons");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/courses/:courseId/lessons
router.post("/courses/:courseId/lessons", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const courseId = parseInt(req.params.courseId);
    if (isNaN(courseId)) { res.status(400).json({ error: "Invalid id" }); return; }

    const { title, description, type, videoUrl, content, duration, order, isFree } = req.body;
    if (!title) { res.status(400).json({ error: "title required" }); return; }

    const inserted = await db.insert(lessonsTable).values({
      courseId,
      title,
      description,
      type: type ?? "video",
      videoUrl,
      content,
      duration,
      order: order ?? 0,
      isFree: isFree ?? false,
    }).returning();

    res.status(201).json(buildLessonResponse(inserted[0]));
  } catch (err) {
    req.log.error({ err }, "Error creating lesson");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/lessons/:lessonId
router.get("/lessons/:lessonId", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.lessonId);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

    const lesson = await db.select().from(lessonsTable).where(eq(lessonsTable.id, id)).limit(1).then((r) => r[0]);
    if (!lesson) { res.status(404).json({ error: "Lesson not found" }); return; }

    res.json(buildLessonResponse(lesson));
  } catch (err) {
    req.log.error({ err }, "Error getting lesson");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/lessons/:lessonId
router.patch("/lessons/:lessonId", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.lessonId);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

    const { title, description, type, videoUrl, content, duration, order, isFree } = req.body;
    const updated = await db.update(lessonsTable).set({
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
      ...(type !== undefined && { type }),
      ...(videoUrl !== undefined && { videoUrl }),
      ...(content !== undefined && { content }),
      ...(duration !== undefined && { duration }),
      ...(order !== undefined && { order }),
      ...(isFree !== undefined && { isFree }),
    }).where(eq(lessonsTable.id, id)).returning();

    if (!updated[0]) { res.status(404).json({ error: "Lesson not found" }); return; }
    res.json(buildLessonResponse(updated[0]));
  } catch (err) {
    req.log.error({ err }, "Error updating lesson");
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/lessons/:lessonId
router.delete("/lessons/:lessonId", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.lessonId);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    await db.delete(lessonsTable).where(eq(lessonsTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Error deleting lesson");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/lessons/:lessonId/progress
router.patch("/lessons/:lessonId/progress", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const lessonId = parseInt(req.params.lessonId);
    if (isNaN(lessonId)) { res.status(400).json({ error: "Invalid id" }); return; }

    const { completed, watchedSeconds } = req.body;

    const existing = await db
      .select()
      .from(lessonProgressTable)
      .where(and(eq(lessonProgressTable.lessonId, lessonId), eq(lessonProgressTable.userId, clerkId)))
      .limit(1)
      .then((r) => r[0]);

    let result;
    if (existing) {
      const updated = await db.update(lessonProgressTable).set({
        completed: completed ?? existing.completed,
        watchedSeconds: watchedSeconds ?? existing.watchedSeconds,
      }).where(and(eq(lessonProgressTable.lessonId, lessonId), eq(lessonProgressTable.userId, clerkId))).returning();
      result = updated[0];
    } else {
      const inserted = await db.insert(lessonProgressTable).values({
        lessonId,
        userId: clerkId,
        completed: completed ?? false,
        watchedSeconds,
      }).returning();
      result = inserted[0];
    }

    res.json({
      lessonId: result.lessonId,
      userId: result.userId,
      completed: result.completed,
      watchedSeconds: result.watchedSeconds,
      updatedAt: result.updatedAt,
    });
  } catch (err) {
    req.log.error({ err }, "Error updating lesson progress");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
