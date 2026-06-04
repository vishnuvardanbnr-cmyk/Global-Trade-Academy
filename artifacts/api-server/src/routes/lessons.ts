import { Router } from "express";
import { getAuth } from "../lib/auth";
import { db } from "@workspace/db";
import { lessonsTable, lessonProgressTable, enrollmentsTable } from "@workspace/db";
import { eq, and, asc, inArray } from "drizzle-orm";
import {
  awardXp,
  recordLearningDay,
  syncCourseCompletion,
  getUnlockedLessonIds,
  ensureCertificate,
  ownsCourse,
  isEnrolled,
  upsertLessonGate,
  XP,
} from "../lib/lms";

const router = Router();

function buildLessonResponse(l: typeof lessonsTable.$inferSelect, locked = false) {
  return {
    id: l.id,
    courseId: l.courseId,
    sectionId: l.sectionId ?? null,
    title: l.title,
    description: l.description,
    type: l.type,
    // Paid content is withheld until the lesson is unlocked for this viewer.
    videoUrl: locked ? null : l.videoUrl,
    content: locked ? null : l.content,
    duration: l.duration,
    order: l.order,
    isFree: l.isFree,
    dripDays: l.dripDays,
    locked,
    createdAt: l.createdAt,
  };
}

// GET /api/courses/:courseId/lessons
router.get("/courses/:courseId/lessons", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    const courseId = parseInt(req.params.courseId);
    if (isNaN(courseId)) { res.status(400).json({ error: "Invalid id" }); return; }

    const lessons = await db
      .select()
      .from(lessonsTable)
      .where(eq(lessonsTable.courseId, courseId))
      .orderBy(asc(lessonsTable.order));

    // The course owner sees everything; everyone else only gets unlocked content.
    const isOwner = clerkId ? await ownsCourse(clerkId, courseId) : false;
    let unlockedIds = new Set<number>();
    if (!isOwner && clerkId) {
      const ids = await getUnlockedLessonIds(
        clerkId,
        courseId,
        lessons.map((l) => ({ id: l.id, isFree: l.isFree, dripDays: l.dripDays })),
      );
      unlockedIds = new Set(ids);
    }

    res.json(lessons.map((l) => {
      const locked = isOwner ? false : !(l.isFree || unlockedIds.has(l.id));
      return buildLessonResponse(l, locked);
    }));
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

    if (!(await ownsCourse(clerkId, courseId))) { res.status(403).json({ error: "Forbidden" }); return; }

    const { title, description, type, videoUrl, content, duration, order, isFree, dripDays } = req.body;
    if (!title) { res.status(400).json({ error: "title required" }); return; }

    const { sectionId } = req.body;
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
      dripDays: dripDays ?? 0,
      sectionId: sectionId ?? null,
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
    const { userId: clerkId } = getAuth(req);
    const id = parseInt(req.params.lessonId);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

    const lesson = await db.select().from(lessonsTable).where(eq(lessonsTable.id, id)).limit(1).then((r) => r[0]);
    if (!lesson) { res.status(404).json({ error: "Lesson not found" }); return; }

    // The course owner sees everything; everyone else only gets unlocked content.
    const isOwner = clerkId ? await ownsCourse(clerkId, lesson.courseId) : false;
    let locked = false;
    if (!isOwner && !lesson.isFree) {
      if (!clerkId) {
        locked = true;
      } else {
        // Load all course lessons to apply gate ordering correctly
        const allLessons = await db
          .select()
          .from(lessonsTable)
          .where(eq(lessonsTable.courseId, lesson.courseId))
          .orderBy(asc(lessonsTable.order));
        const unlocked = await getUnlockedLessonIds(
          clerkId,
          lesson.courseId,
          allLessons.map((l) => ({ id: l.id, isFree: l.isFree, dripDays: l.dripDays })),
        );
        locked = !unlocked.includes(lesson.id);
      }
    }

    res.json(buildLessonResponse(lesson, locked));
  } catch (err) {
    req.log.error({ err }, "Error getting lesson");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/lessons/:lessonId
router.patch("/lessons/:lessonId", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const id = parseInt(req.params.lessonId);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

    const lesson = await db.select().from(lessonsTable).where(eq(lessonsTable.id, id)).limit(1).then((r) => r[0]);
    if (!lesson) { res.status(404).json({ error: "Lesson not found" }); return; }
    if (!(await ownsCourse(clerkId, lesson.courseId))) { res.status(403).json({ error: "Forbidden" }); return; }

    const { title, description, type, videoUrl, content, duration, order, isFree, dripDays, sectionId } = req.body;
    const updated = await db.update(lessonsTable).set({
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
      ...(type !== undefined && { type }),
      ...(videoUrl !== undefined && { videoUrl }),
      ...(content !== undefined && { content }),
      ...(duration !== undefined && { duration }),
      ...(order !== undefined && { order }),
      ...(isFree !== undefined && { isFree }),
      ...(dripDays !== undefined && { dripDays }),
      ...(sectionId !== undefined && { sectionId: sectionId === null ? null : sectionId }),
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
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const id = parseInt(req.params.lessonId);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

    const lesson = await db.select().from(lessonsTable).where(eq(lessonsTable.id, id)).limit(1).then((r) => r[0]);
    if (!lesson) { res.status(204).send(); return; }
    if (!(await ownsCourse(clerkId, lesson.courseId))) { res.status(403).json({ error: "Forbidden" }); return; }

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

    const lesson = await db.select().from(lessonsTable).where(eq(lessonsTable.id, lessonId)).limit(1).then((r) => r[0]);
    if (!lesson) { res.status(404).json({ error: "Lesson not found" }); return; }

    // Must be enrolled in the course (free lessons aside) and the lesson must be unlocked.
    const enrolled = await isEnrolled(clerkId, lesson.courseId);
    if (!enrolled && !lesson.isFree) { res.status(403).json({ error: "Not enrolled" }); return; }

    // Load all course lessons to check gate ordering correctly
    const allLessons = await db
      .select()
      .from(lessonsTable)
      .where(eq(lessonsTable.courseId, lesson.courseId))
      .orderBy(asc(lessonsTable.order));
    const unlocked = await getUnlockedLessonIds(
      clerkId,
      lesson.courseId,
      allLessons.map((l) => ({ id: l.id, isFree: l.isFree, dripDays: l.dripDays })),
    );
    if (!unlocked.includes(lesson.id)) { res.status(403).json({ error: "Lesson locked" }); return; }

    const existing = await db
      .select()
      .from(lessonProgressTable)
      .where(and(eq(lessonProgressTable.lessonId, lessonId), eq(lessonProgressTable.userId, clerkId)))
      .limit(1)
      .then((r) => r[0]);

    const wasCompleted = existing?.completed ?? false;

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

    // Gamification only fires on the transition into "completed".
    let xpAwarded = 0;
    let courseCompleted = false;
    let certificateSerial: string | null = null;

    if (result.completed && !wasCompleted) {
      xpAwarded = await awardXp(clerkId, "lesson_complete", `lesson:${lessonId}`, XP.lessonComplete);
      await recordLearningDay(clerkId);
      const state = await syncCourseCompletion(clerkId, lesson.courseId);
      courseCompleted = state.completed;
      certificateSerial = state.certificateSerial;
      xpAwarded += state.xpAwarded;

      // Create the lesson gate if this lesson has a linked quiz
      await upsertLessonGate(clerkId, lesson.courseId, lessonId);
    }

    res.json({
      lessonId: result.lessonId,
      userId: result.userId,
      completed: result.completed,
      watchedSeconds: result.watchedSeconds,
      updatedAt: result.updatedAt,
      xpAwarded,
      courseCompleted,
      certificateSerial,
    });
  } catch (err) {
    req.log.error({ err }, "Error updating lesson progress");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/courses/:courseId/lessons/reorder
router.post("/courses/:courseId/lessons/reorder", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const courseId = parseInt(req.params.courseId);
    if (isNaN(courseId)) { res.status(400).json({ error: "Invalid id" }); return; }
    if (!(await ownsCourse(clerkId, courseId))) { res.status(403).json({ error: "Forbidden" }); return; }

    const { updates } = req.body as { updates: { id: number; order: number; sectionId?: number | null }[] };
    if (!Array.isArray(updates)) { res.status(400).json({ error: "updates array required" }); return; }

    await Promise.all(
      updates.map(({ id, order, sectionId }) =>
        db.update(lessonsTable).set({
          order,
          ...(sectionId !== undefined && { sectionId: sectionId === null ? null : sectionId }),
        }).where(and(eq(lessonsTable.id, id), eq(lessonsTable.courseId, courseId)))
      )
    );

    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Error reordering lessons");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/courses/:courseId/progress
router.get("/courses/:courseId/progress", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const courseId = parseInt(req.params.courseId);
    if (isNaN(courseId)) { res.status(400).json({ error: "Invalid id" }); return; }

    const lessons = await db
      .select()
      .from(lessonsTable)
      .where(eq(lessonsTable.courseId, courseId))
      .orderBy(asc(lessonsTable.order));
    const total = lessons.length;
    const lessonIds = lessons.map((l) => l.id);

    const progressRows = lessonIds.length
      ? await db
          .select()
          .from(lessonProgressTable)
          .where(and(eq(lessonProgressTable.userId, clerkId), inArray(lessonProgressTable.lessonId, lessonIds)))
      : [];

    const completedLessons = progressRows.filter((p) => p.completed).length;
    const percent = total === 0 ? 0 : Math.round((completedLessons / total) * 100);

    const enrollment = await db
      .select()
      .from(enrollmentsTable)
      .where(and(eq(enrollmentsTable.userId, clerkId), eq(enrollmentsTable.courseId, courseId)))
      .limit(1)
      .then((r) => r[0]);

    const courseCompleted = enrollment?.status === "completed";
    let certificateSerial: string | null = null;
    if (courseCompleted) {
      certificateSerial = await ensureCertificate(clerkId, courseId);
    }

    const unlockedLessonIds = await getUnlockedLessonIds(
      clerkId,
      courseId,
      lessons.map((l) => ({ id: l.id, isFree: l.isFree, dripDays: l.dripDays })),
    );

    res.json({
      courseId,
      totalLessons: total,
      completedLessons,
      percent,
      courseCompleted,
      completedAt: enrollment?.completedAt ?? null,
      certificateSerial,
      lessons: progressRows.map((p) => ({
        lessonId: p.lessonId,
        userId: p.userId,
        completed: p.completed,
        watchedSeconds: p.watchedSeconds,
        updatedAt: p.updatedAt,
      })),
      unlockedLessonIds,
    });
  } catch (err) {
    req.log.error({ err }, "Error getting course progress");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
