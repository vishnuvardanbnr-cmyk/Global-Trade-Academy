import { Router } from "express";
import { getAuth } from "../lib/auth";
import { db } from "@workspace/db";
import {
  lessonQuestionsTable,
  lessonAnswersTable,
  lessonsTable,
  coursesTable,
  usersTable,
  enrollmentsTable,
} from "@workspace/db";
import { eq, desc, asc } from "drizzle-orm";
import { isEnrolled, ownsCourse } from "../lib/lms";

const router = Router();

async function getUserRole(userId: string): Promise<string | null> {
  const row = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  return row[0]?.role ?? null;
}

async function getUserName(userId: string): Promise<string> {
  const row = await db.select({ displayName: usersTable.displayName }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  return row[0]?.displayName ?? "Student";
}

/* ─── GET /api/lessons/:lessonId/questions ────────────────────── */
router.get("/lessons/:lessonId/questions", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const lessonId = parseInt(req.params.lessonId);
  if (isNaN(lessonId)) { res.status(400).json({ error: "Invalid lessonId" }); return; }

  const [lesson] = await db.select().from(lessonsTable).where(eq(lessonsTable.id, lessonId)).limit(1);
  if (!lesson) { res.status(404).json({ error: "Lesson not found" }); return; }

  const [course] = await db.select().from(coursesTable).where(eq(coursesTable.id, lesson.courseId)).limit(1);
  if (!course) { res.status(404).json({ error: "Course not found" }); return; }

  const enrolled = await isEnrolled(userId, lesson.courseId);
  const owner = await ownsCourse(userId, lesson.courseId);
  const role = await getUserRole(userId);
  if (!enrolled && !owner && role !== "admin") { res.status(403).json({ error: "Not enrolled" }); return; }

  const questions = await db
    .select({
      id: lessonQuestionsTable.id,
      lessonId: lessonQuestionsTable.lessonId,
      userId: lessonQuestionsTable.userId,
      content: lessonQuestionsTable.content,
      resolved: lessonQuestionsTable.resolved,
      createdAt: lessonQuestionsTable.createdAt,
      authorName: usersTable.displayName,
    })
    .from(lessonQuestionsTable)
    .leftJoin(usersTable, eq(lessonQuestionsTable.userId, usersTable.id))
    .where(eq(lessonQuestionsTable.lessonId, lessonId))
    .orderBy(asc(lessonQuestionsTable.createdAt));

  res.json({ questions });
});

/* ─── POST /api/lessons/:lessonId/questions ───────────────────── */
router.post("/lessons/:lessonId/questions", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const lessonId = parseInt(req.params.lessonId);
  if (isNaN(lessonId)) { res.status(400).json({ error: "Invalid lessonId" }); return; }

  const { content } = req.body as { content?: string };
  if (!content?.trim()) { res.status(400).json({ error: "Content required" }); return; }

  const [lesson] = await db.select().from(lessonsTable).where(eq(lessonsTable.id, lessonId)).limit(1);
  if (!lesson) { res.status(404).json({ error: "Lesson not found" }); return; }

  const enrolled = await isEnrolled(userId, lesson.courseId);
  const owner = await ownsCourse(userId, lesson.courseId);
  const role = await getUserRole(userId);
  if (!enrolled && !owner && role !== "admin") { res.status(403).json({ error: "Not enrolled" }); return; }

  const [q] = await db.insert(lessonQuestionsTable).values({ lessonId, userId, content: content.trim() }).returning();
  const authorName = await getUserName(userId);
  res.status(201).json({ question: { ...q, authorName } });
});

/* ─── GET /api/lessons/:lessonId/questions/:questionId/answers ── */
router.get("/lessons/:lessonId/questions/:questionId/answers", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const questionId = parseInt(req.params.questionId);
  if (isNaN(questionId)) { res.status(400).json({ error: "Invalid questionId" }); return; }

  const answers = await db
    .select({
      id: lessonAnswersTable.id,
      questionId: lessonAnswersTable.questionId,
      userId: lessonAnswersTable.userId,
      content: lessonAnswersTable.content,
      isInstructor: lessonAnswersTable.isInstructor,
      createdAt: lessonAnswersTable.createdAt,
      authorName: usersTable.displayName,
    })
    .from(lessonAnswersTable)
    .leftJoin(usersTable, eq(lessonAnswersTable.userId, usersTable.id))
    .where(eq(lessonAnswersTable.questionId, questionId))
    .orderBy(asc(lessonAnswersTable.createdAt));

  res.json({ answers });
});

/* ─── POST /api/lessons/:lessonId/questions/:questionId/answers ─ */
router.post("/lessons/:lessonId/questions/:questionId/answers", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const lessonId = parseInt(req.params.lessonId);
  const questionId = parseInt(req.params.questionId);
  if (isNaN(questionId) || isNaN(lessonId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { content } = req.body as { content?: string };
  if (!content?.trim()) { res.status(400).json({ error: "Content required" }); return; }

  const [lesson] = await db.select().from(lessonsTable).where(eq(lessonsTable.id, lessonId)).limit(1);
  if (!lesson) { res.status(404).json({ error: "Lesson not found" }); return; }

  const enrolled = await isEnrolled(userId, lesson.courseId);
  const owner = await ownsCourse(userId, lesson.courseId);
  const role = await getUserRole(userId);
  if (!enrolled && !owner && role !== "admin") { res.status(403).json({ error: "Not enrolled" }); return; }

  const isInstructor = owner || role === "instructor" || role === "admin";
  const [a] = await db.insert(lessonAnswersTable).values({ questionId, userId, content: content.trim(), isInstructor }).returning();
  const authorName = await getUserName(userId);
  res.status(201).json({ answer: { ...a, authorName } });
});

/* ─── PATCH /api/lessons/:lessonId/questions/:questionId/resolve */
router.patch("/lessons/:lessonId/questions/:questionId/resolve", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const lessonId = parseInt(req.params.lessonId);
  const questionId = parseInt(req.params.questionId);
  if (isNaN(questionId) || isNaN(lessonId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [lesson] = await db.select().from(lessonsTable).where(eq(lessonsTable.id, lessonId)).limit(1);
  if (!lesson) { res.status(404).json({ error: "Lesson not found" }); return; }

  const [q] = await db.select().from(lessonQuestionsTable).where(eq(lessonQuestionsTable.id, questionId)).limit(1);
  if (!q) { res.status(404).json({ error: "Question not found" }); return; }

  const owner = await ownsCourse(userId, lesson.courseId);
  const role = await getUserRole(userId);
  const isAuthor = q.userId === userId;
  if (!owner && role !== "admin" && !isAuthor) { res.status(403).json({ error: "Forbidden" }); return; }

  const [updated] = await db.update(lessonQuestionsTable).set({ resolved: true }).where(eq(lessonQuestionsTable.id, questionId)).returning();
  res.json({ question: updated });
});

/* ─── DELETE /api/lessons/:lessonId/questions/:questionId ──────── */
router.delete("/lessons/:lessonId/questions/:questionId", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const lessonId = parseInt(req.params.lessonId);
  const questionId = parseInt(req.params.questionId);
  if (isNaN(questionId) || isNaN(lessonId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [lesson] = await db.select().from(lessonsTable).where(eq(lessonsTable.id, lessonId)).limit(1);
  if (!lesson) { res.status(404).json({ error: "Lesson not found" }); return; }

  const [q] = await db.select().from(lessonQuestionsTable).where(eq(lessonQuestionsTable.id, questionId)).limit(1);
  if (!q) { res.status(404).json({ error: "Question not found" }); return; }

  const owner = await ownsCourse(userId, lesson.courseId);
  const role = await getUserRole(userId);
  const isAuthor = q.userId === userId;
  if (!owner && role !== "admin" && !isAuthor) { res.status(403).json({ error: "Forbidden" }); return; }

  await db.delete(lessonQuestionsTable).where(eq(lessonQuestionsTable.id, questionId));
  res.json({ ok: true });
});

export default router;
