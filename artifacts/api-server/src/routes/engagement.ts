import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import {
  reviewsTable,
  notesTable,
  bookmarksTable,
  certificatesTable,
  usersTable,
  coursesTable,
  lessonsTable,
} from "@workspace/db";
import { eq, and, asc, desc, inArray } from "drizzle-orm";
import { isEnrolled } from "../lib/lms";

const router = Router();

/* ── REVIEWS ─────────────────────────────────────────────────────── */

// GET /api/courses/:courseId/reviews — summary + list
router.get("/courses/:courseId/reviews", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    const courseId = parseInt(req.params.courseId);
    if (isNaN(courseId)) { res.status(400).json({ error: "Invalid id" }); return; }

    const reviews = await db
      .select()
      .from(reviewsTable)
      .where(eq(reviewsTable.courseId, courseId))
      .orderBy(desc(reviewsTable.createdAt));

    const userIds = [...new Set(reviews.map((r) => r.userId))];
    const users = userIds.length
      ? await db.select({ id: usersTable.id, displayName: usersTable.displayName }).from(usersTable).where(inArray(usersTable.id, userIds))
      : [];
    const nameOf = (id: string) => users.find((u) => u.id === id)?.displayName ?? null;

    const count = reviews.length;
    const average = count === 0 ? 0 : reviews.reduce((s, r) => s + r.rating, 0) / count;
    const distribution = [1, 2, 3, 4, 5].map((star) => reviews.filter((r) => r.rating === star).length);
    const mine = clerkId ? reviews.find((r) => r.userId === clerkId) : undefined;

    const toReview = (r: typeof reviews[number]) => ({
      id: r.id,
      courseId: r.courseId,
      userId: r.userId,
      userName: nameOf(r.userId),
      rating: r.rating,
      comment: r.comment,
      createdAt: r.createdAt,
    });

    res.json({
      average: Math.round(average * 10) / 10,
      count,
      distribution,
      ...(mine && { myReview: toReview(mine) }),
      reviews: reviews.map(toReview),
    });
  } catch (err) {
    req.log.error({ err }, "Error listing reviews");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/courses/:courseId/reviews — upsert (enrolled only)
router.post("/courses/:courseId/reviews", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const courseId = parseInt(req.params.courseId);
    if (isNaN(courseId)) { res.status(400).json({ error: "Invalid id" }); return; }

    const { rating, comment } = req.body;
    if (typeof rating !== "number" || rating < 1 || rating > 5) {
      res.status(400).json({ error: "rating must be 1-5" });
      return;
    }

    if (!(await isEnrolled(clerkId, courseId))) {
      res.status(403).json({ error: "Must be enrolled to review" });
      return;
    }

    const review = await db.insert(reviewsTable).values({
      courseId,
      userId: clerkId,
      rating,
      comment: comment ?? null,
    }).onConflictDoUpdate({
      target: [reviewsTable.courseId, reviewsTable.userId],
      set: { rating, comment: comment ?? null },
    }).returning().then((r) => r[0]);

    const me = await db.select({ displayName: usersTable.displayName }).from(usersTable).where(eq(usersTable.id, clerkId)).limit(1).then((r) => r[0]);

    res.json({
      id: review.id,
      courseId: review.courseId,
      userId: review.userId,
      userName: me?.displayName ?? null,
      rating: review.rating,
      comment: review.comment,
      createdAt: review.createdAt,
    });
  } catch (err) {
    req.log.error({ err }, "Error upserting review");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── NOTES ───────────────────────────────────────────────────────── */

// GET /api/lessons/:lessonId/notes
router.get("/lessons/:lessonId/notes", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const lessonId = parseInt(req.params.lessonId);
    if (isNaN(lessonId)) { res.status(400).json({ error: "Invalid id" }); return; }

    const notes = await db
      .select()
      .from(notesTable)
      .where(and(eq(notesTable.lessonId, lessonId), eq(notesTable.userId, clerkId)))
      .orderBy(asc(notesTable.timestampSeconds), asc(notesTable.createdAt));

    res.json(notes);
  } catch (err) {
    req.log.error({ err }, "Error listing notes");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/lessons/:lessonId/notes
router.post("/lessons/:lessonId/notes", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const lessonId = parseInt(req.params.lessonId);
    if (isNaN(lessonId)) { res.status(400).json({ error: "Invalid id" }); return; }

    const { content, timestampSeconds } = req.body;
    if (!content) { res.status(400).json({ error: "content required" }); return; }

    const lesson = await db.select({ courseId: lessonsTable.courseId }).from(lessonsTable).where(eq(lessonsTable.id, lessonId)).limit(1).then((r) => r[0]);
    if (!lesson) { res.status(404).json({ error: "Lesson not found" }); return; }

    const note = await db.insert(notesTable).values({
      lessonId,
      courseId: lesson.courseId,
      userId: clerkId,
      content,
      timestampSeconds: timestampSeconds ?? null,
    }).returning().then((r) => r[0]);

    res.status(201).json(note);
  } catch (err) {
    req.log.error({ err }, "Error creating note");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/notes/:noteId
router.patch("/notes/:noteId", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const noteId = parseInt(req.params.noteId);
    if (isNaN(noteId)) { res.status(400).json({ error: "Invalid id" }); return; }

    const { content } = req.body;
    if (!content) { res.status(400).json({ error: "content required" }); return; }

    const updated = await db.update(notesTable).set({ content })
      .where(and(eq(notesTable.id, noteId), eq(notesTable.userId, clerkId)))
      .returning();
    if (!updated[0]) { res.status(404).json({ error: "Note not found" }); return; }

    res.json(updated[0]);
  } catch (err) {
    req.log.error({ err }, "Error updating note");
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/notes/:noteId
router.delete("/notes/:noteId", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const noteId = parseInt(req.params.noteId);
    if (isNaN(noteId)) { res.status(400).json({ error: "Invalid id" }); return; }

    await db.delete(notesTable).where(and(eq(notesTable.id, noteId), eq(notesTable.userId, clerkId)));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Error deleting note");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── BOOKMARKS ───────────────────────────────────────────────────── */

// GET /api/courses/:courseId/bookmarks
router.get("/courses/:courseId/bookmarks", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const courseId = parseInt(req.params.courseId);
    if (isNaN(courseId)) { res.status(400).json({ error: "Invalid id" }); return; }

    const bookmarks = await db
      .select()
      .from(bookmarksTable)
      .where(and(eq(bookmarksTable.courseId, courseId), eq(bookmarksTable.userId, clerkId)))
      .orderBy(desc(bookmarksTable.createdAt));

    const lessonIds = bookmarks.map((b) => b.lessonId);
    const lessons = lessonIds.length
      ? await db.select({ id: lessonsTable.id, title: lessonsTable.title }).from(lessonsTable).where(inArray(lessonsTable.id, lessonIds))
      : [];

    res.json(bookmarks.map((b) => ({
      id: b.id,
      lessonId: b.lessonId,
      courseId: b.courseId,
      userId: b.userId,
      createdAt: b.createdAt,
      lessonTitle: lessons.find((l) => l.id === b.lessonId)?.title ?? null,
    })));
  } catch (err) {
    req.log.error({ err }, "Error listing bookmarks");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/lessons/:lessonId/bookmark — toggle
router.post("/lessons/:lessonId/bookmark", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const lessonId = parseInt(req.params.lessonId);
    if (isNaN(lessonId)) { res.status(400).json({ error: "Invalid id" }); return; }

    const existing = await db
      .select()
      .from(bookmarksTable)
      .where(and(eq(bookmarksTable.lessonId, lessonId), eq(bookmarksTable.userId, clerkId)))
      .limit(1)
      .then((r) => r[0]);

    if (existing) {
      await db.delete(bookmarksTable).where(eq(bookmarksTable.id, existing.id));
      res.json({ lessonId, bookmarked: false });
      return;
    }

    const lesson = await db.select({ courseId: lessonsTable.courseId }).from(lessonsTable).where(eq(lessonsTable.id, lessonId)).limit(1).then((r) => r[0]);
    if (!lesson) { res.status(404).json({ error: "Lesson not found" }); return; }

    await db.insert(bookmarksTable).values({ lessonId, courseId: lesson.courseId, userId: clerkId }).onConflictDoNothing();
    res.json({ lessonId, bookmarked: true });
  } catch (err) {
    req.log.error({ err }, "Error toggling bookmark");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── CERTIFICATES ────────────────────────────────────────────────── */

// GET /api/certificates — current user's certificates
router.get("/certificates", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const certs = await db
      .select()
      .from(certificatesTable)
      .where(eq(certificatesTable.userId, clerkId))
      .orderBy(desc(certificatesTable.issuedAt));

    const courseIds = certs.map((c) => c.courseId);
    const courses = courseIds.length
      ? await db.select({ id: coursesTable.id, title: coursesTable.title }).from(coursesTable).where(inArray(coursesTable.id, courseIds))
      : [];

    res.json(certs.map((c) => ({
      serial: c.serial,
      courseId: c.courseId,
      userId: c.userId,
      issuedAt: c.issuedAt,
      courseTitle: courses.find((co) => co.id === c.courseId)?.title ?? null,
    })));
  } catch (err) {
    req.log.error({ err }, "Error listing certificates");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/certificates/:serial — public verification
router.get("/certificates/:serial", async (req, res): Promise<void> => {
  try {
    const serial = req.params.serial;
    const cert = await db.select().from(certificatesTable).where(eq(certificatesTable.serial, serial)).limit(1).then((r) => r[0]);
    if (!cert) { res.status(404).json({ error: "Certificate not found" }); return; }

    const course = await db.select().from(coursesTable).where(eq(coursesTable.id, cert.courseId)).limit(1).then((r) => r[0]);
    const user = await db.select({ displayName: usersTable.displayName }).from(usersTable).where(eq(usersTable.id, cert.userId)).limit(1).then((r) => r[0]);
    const instructor = course
      ? await db.select({ displayName: usersTable.displayName }).from(usersTable).where(eq(usersTable.id, course.instructorId)).limit(1).then((r) => r[0])
      : undefined;

    res.json({
      serial: cert.serial,
      courseId: cert.courseId,
      userId: cert.userId,
      issuedAt: cert.issuedAt,
      courseTitle: course?.title ?? null,
      userName: user?.displayName ?? null,
      instructorName: instructor?.displayName ?? null,
    });
  } catch (err) {
    req.log.error({ err }, "Error verifying certificate");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
