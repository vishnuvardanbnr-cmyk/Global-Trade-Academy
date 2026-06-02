import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import {
  lessonGatesTable,
  quizzesTable,
  quizQuestionsTable,
  lessonsTable,
  coursesTable,
  usersTable,
} from "@workspace/db";
import { eq, and, inArray, desc } from "drizzle-orm";
import { ownsCourse } from "../lib/lms";

const router = Router();

/* ── STUDENT: GET /lessons/:lessonId/gate ────────────────────────── */
router.get("/lessons/:lessonId/gate", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const lessonId = parseInt(req.params.lessonId);
    if (isNaN(lessonId)) { res.status(400).json({ error: "Invalid id" }); return; }

    const gate = await db
      .select()
      .from(lessonGatesTable)
      .where(and(eq(lessonGatesTable.userId, clerkId), eq(lessonGatesTable.lessonId, lessonId)))
      .limit(1)
      .then((r) => r[0]);

    if (!gate) { res.status(404).json({ error: "No gate found" }); return; }

    res.json({
      id: gate.id,
      userId: gate.userId,
      courseId: gate.courseId,
      lessonId: gate.lessonId,
      requiredQuizId: gate.requiredQuizId,
      status: gate.status,
      score: gate.score,
      reviewNote: gate.reviewNote,
      reviewedBy: gate.reviewedBy,
      reviewedAt: gate.reviewedAt,
      submittedAt: gate.submittedAt,
      createdAt: gate.createdAt,
      updatedAt: gate.updatedAt,
    });
  } catch (err) {
    req.log.error({ err }, "Error getting lesson gate");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── INSTRUCTOR: GET /instructor/reviews/count ───────────────────── */
// Must be declared before /instructor/reviews/:gateId/... to avoid param collision
router.get("/instructor/reviews/count", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

    // Find all courses owned by this instructor
    const myCourses = await db
      .select({ id: coursesTable.id })
      .from(coursesTable)
      .where(eq(coursesTable.instructorId, clerkId));

    if (myCourses.length === 0) { res.json({ pending: 0 }); return; }

    const courseIds = myCourses.map((c) => c.id);
    const pending = await db
      .select({ id: lessonGatesTable.id })
      .from(lessonGatesTable)
      .where(
        and(
          inArray(lessonGatesTable.courseId, courseIds),
          eq(lessonGatesTable.status, "pending_review"),
        ),
      );

    res.json({ pending: pending.length });
  } catch (err) {
    req.log.error({ err }, "Error counting reviews");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── INSTRUCTOR: GET /instructor/reviews ─────────────────────────── */
router.get("/instructor/reviews", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const statusFilter = req.query.status as string | undefined;
    const courseIdFilter = req.query.courseId ? parseInt(req.query.courseId as string) : undefined;

    // Find all courses owned by this instructor
    const myCourses = await db
      .select({ id: coursesTable.id, title: coursesTable.title })
      .from(coursesTable)
      .where(eq(coursesTable.instructorId, clerkId));

    if (myCourses.length === 0) { res.json([]); return; }

    const courseIds = myCourses.map((c) => c.id);
    const courseMap = new Map(myCourses.map((c) => [c.id, c.title]));

    // Build filter conditions
    const conditions = [inArray(lessonGatesTable.courseId, courseIds)];
    if (statusFilter) conditions.push(eq(lessonGatesTable.status, statusFilter));
    if (courseIdFilter && !isNaN(courseIdFilter)) conditions.push(eq(lessonGatesTable.courseId, courseIdFilter));

    const gates = await db
      .select()
      .from(lessonGatesTable)
      .where(and(...conditions))
      .orderBy(desc(lessonGatesTable.submittedAt), desc(lessonGatesTable.createdAt))
      .limit(100);

    if (gates.length === 0) { res.json([]); return; }

    // Load related data in parallel
    const userIds = [...new Set(gates.map((g) => g.userId))];
    const lessonIds = [...new Set(gates.map((g) => g.lessonId))];
    const quizIds = [...new Set(gates.map((g) => g.requiredQuizId))];

    const [users, lessons, quizzes] = await Promise.all([
      db.select({ id: usersTable.id, displayName: usersTable.displayName, avatarUrl: usersTable.avatarUrl })
        .from(usersTable)
        .where(inArray(usersTable.id, userIds)),
      db.select({ id: lessonsTable.id, title: lessonsTable.title })
        .from(lessonsTable)
        .where(inArray(lessonsTable.id, lessonIds)),
      db.select({ id: quizzesTable.id, title: quizzesTable.title })
        .from(quizzesTable)
        .where(inArray(quizzesTable.id, quizIds)),
    ]);

    const userMap = new Map(users.map((u) => [u.id, u]));
    const lessonMap = new Map(lessons.map((l) => [l.id, l.title]));
    const quizMap = new Map(quizzes.map((q) => [q.id, q.title]));

    res.json(gates.map((g) => {
      const user = userMap.get(g.userId);
      return {
        id: g.id,
        userId: g.userId,
        userName: user?.displayName ?? null,
        userAvatar: user?.avatarUrl ?? null,
        courseId: g.courseId,
        courseTitle: courseMap.get(g.courseId) ?? null,
        lessonId: g.lessonId,
        lessonTitle: lessonMap.get(g.lessonId) ?? null,
        requiredQuizId: g.requiredQuizId,
        quizTitle: quizMap.get(g.requiredQuizId) ?? null,
        status: g.status,
        score: g.score,
        reviewNote: g.reviewNote,
        submittedAt: g.submittedAt,
        createdAt: g.createdAt,
        updatedAt: g.updatedAt,
      };
    }));
  } catch (err) {
    req.log.error({ err }, "Error listing reviews");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── INSTRUCTOR: POST /instructor/reviews/:gateId/approve ─────────── */
router.post("/instructor/reviews/:gateId/approve", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const gateId = parseInt(req.params.gateId);
    if (isNaN(gateId)) { res.status(400).json({ error: "Invalid id" }); return; }

    const gate = await db
      .select()
      .from(lessonGatesTable)
      .where(eq(lessonGatesTable.id, gateId))
      .limit(1)
      .then((r) => r[0]);
    if (!gate) { res.status(404).json({ error: "Gate not found" }); return; }

    if (!(await ownsCourse(clerkId, gate.courseId))) { res.status(403).json({ error: "Forbidden" }); return; }

    if (gate.status !== "pending_review") {
      res.status(400).json({ error: `Cannot approve gate with status ${gate.status}` });
      return;
    }

    const updated = await db
      .update(lessonGatesTable)
      .set({ status: "approved", reviewedBy: clerkId, reviewedAt: new Date() })
      .where(eq(lessonGatesTable.id, gateId))
      .returning()
      .then((r) => r[0]);

    res.json({
      id: updated.id,
      userId: updated.userId,
      courseId: updated.courseId,
      lessonId: updated.lessonId,
      requiredQuizId: updated.requiredQuizId,
      status: updated.status,
      score: updated.score,
      reviewNote: updated.reviewNote,
      reviewedBy: updated.reviewedBy,
      reviewedAt: updated.reviewedAt,
      submittedAt: updated.submittedAt,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    });
  } catch (err) {
    req.log.error({ err }, "Error approving gate");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── INSTRUCTOR: POST /instructor/reviews/:gateId/reject ──────────── */
router.post("/instructor/reviews/:gateId/reject", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const gateId = parseInt(req.params.gateId);
    if (isNaN(gateId)) { res.status(400).json({ error: "Invalid id" }); return; }

    const gate = await db
      .select()
      .from(lessonGatesTable)
      .where(eq(lessonGatesTable.id, gateId))
      .limit(1)
      .then((r) => r[0]);
    if (!gate) { res.status(404).json({ error: "Gate not found" }); return; }

    if (!(await ownsCourse(clerkId, gate.courseId))) { res.status(403).json({ error: "Forbidden" }); return; }

    if (gate.status !== "pending_review") {
      res.status(400).json({ error: `Cannot reject gate with status ${gate.status}` });
      return;
    }

    const { reviewNote, newQuiz } = req.body;
    if (!reviewNote || typeof reviewNote !== "string" || reviewNote.trim().length === 0) {
      res.status(400).json({ error: "reviewNote required" });
      return;
    }
    if (!newQuiz || !newQuiz.title || !Array.isArray(newQuiz.questions) || newQuiz.questions.length === 0) {
      res.status(400).json({ error: "newQuiz with title and questions required" });
      return;
    }

    // Create a student-specific replacement quiz
    const createdQuiz = await db.insert(quizzesTable).values({
      courseId: gate.courseId,
      lessonId: gate.lessonId,
      assignedUserId: gate.userId,
      title: newQuiz.title,
      description: newQuiz.description ?? null,
      passingScore: newQuiz.passingScore ?? 70,
      xpReward: 0, // Replacement quizzes don't grant additional XP
      order: 0,
    }).returning().then((r) => r[0]);

    await db.insert(quizQuestionsTable).values(
      (newQuiz.questions as Array<{ question: string; options: string[]; correctIndex: number; explanation?: string; order?: number }>)
        .map((q, i) => ({
          quizId: createdQuiz.id,
          question: q.question,
          options: q.options,
          correctIndex: q.correctIndex,
          explanation: q.explanation ?? null,
          order: q.order ?? i,
        })),
    );

    // Update gate: mark rejected, set new required quiz
    const updated = await db
      .update(lessonGatesTable)
      .set({
        status: "rejected",
        requiredQuizId: createdQuiz.id,
        reviewNote: reviewNote.trim(),
        reviewedBy: clerkId,
        reviewedAt: new Date(),
      })
      .where(eq(lessonGatesTable.id, gateId))
      .returning()
      .then((r) => r[0]);

    res.json({
      id: updated.id,
      userId: updated.userId,
      courseId: updated.courseId,
      lessonId: updated.lessonId,
      requiredQuizId: updated.requiredQuizId,
      status: updated.status,
      score: updated.score,
      reviewNote: updated.reviewNote,
      reviewedBy: updated.reviewedBy,
      reviewedAt: updated.reviewedAt,
      submittedAt: updated.submittedAt,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    });
  } catch (err) {
    req.log.error({ err }, "Error rejecting gate");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
