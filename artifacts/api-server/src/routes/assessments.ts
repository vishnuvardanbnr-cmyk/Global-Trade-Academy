import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import {
  quizzesTable,
  quizQuestionsTable,
  quizAttemptsTable,
  tasksTable,
  taskCompletionsTable,
} from "@workspace/db";
import { eq, and, asc, desc, inArray, isNull, or } from "drizzle-orm";
import { awardXp, ownsCourse, recordLearningDay, isEnrolled, advanceGateOnPass } from "../lib/lms";

const router = Router();

/* ── QUIZZES ─────────────────────────────────────────────────────── */

// GET /api/courses/:courseId/quizzes — list (no answers)
router.get("/courses/:courseId/quizzes", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const courseId = parseInt(req.params.courseId);
    if (isNaN(courseId)) { res.status(400).json({ error: "Invalid id" }); return; }

    // Instructors see all quizzes for their course; students see only public + their own assigned quizzes
    const isOwner = await ownsCourse(clerkId, courseId);
    const visibilityFilter = isOwner
      ? eq(quizzesTable.courseId, courseId)
      : and(
          eq(quizzesTable.courseId, courseId),
          or(isNull(quizzesTable.assignedUserId), eq(quizzesTable.assignedUserId, clerkId)),
        );

    const quizzes = await db
      .select()
      .from(quizzesTable)
      .where(visibilityFilter)
      .orderBy(asc(quizzesTable.order));

    if (quizzes.length === 0) { res.json([]); return; }

    const quizIds = quizzes.map((q) => q.id);
    const questions = await db
      .select({ id: quizQuestionsTable.id, quizId: quizQuestionsTable.quizId })
      .from(quizQuestionsTable)
      .where(inArray(quizQuestionsTable.quizId, quizIds));
    const attempts = await db
      .select()
      .from(quizAttemptsTable)
      .where(and(eq(quizAttemptsTable.userId, clerkId), inArray(quizAttemptsTable.quizId, quizIds)));

    res.json(
      quizzes.map((q) => {
        const qAttempts = attempts.filter((a) => a.quizId === q.id);
        const bestScore = qAttempts.length ? Math.max(...qAttempts.map((a) => a.score)) : null;
        return {
          id: q.id,
          courseId: q.courseId,
          lessonId: q.lessonId,
          title: q.title,
          description: q.description,
          passingScore: q.passingScore,
          xpReward: q.xpReward,
          order: q.order,
          questionCount: questions.filter((qq) => qq.quizId === q.id).length,
          bestScore,
          passed: qAttempts.some((a) => a.passed),
          questions: [],
        };
      }),
    );
  } catch (err) {
    req.log.error({ err }, "Error listing quizzes");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/courses/:courseId/quizzes — create with questions (instructor)
router.post("/courses/:courseId/quizzes", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const courseId = parseInt(req.params.courseId);
    if (isNaN(courseId)) { res.status(400).json({ error: "Invalid id" }); return; }
    if (!(await ownsCourse(clerkId, courseId))) { res.status(403).json({ error: "Forbidden" }); return; }

    const { lessonId, title, description, passingScore, xpReward, order, questions } = req.body;
    if (!title || !Array.isArray(questions) || questions.length === 0) {
      res.status(400).json({ error: "title and questions required" });
      return;
    }

    const quiz = await db.insert(quizzesTable).values({
      courseId,
      lessonId: lessonId ?? null,
      title,
      description,
      ...(passingScore !== undefined && { passingScore }),
      ...(xpReward !== undefined && { xpReward }),
      ...(order !== undefined && { order }),
    }).returning().then((r) => r[0]);

    await db.insert(quizQuestionsTable).values(
      questions.map((q: { question: string; options: string[]; correctIndex: number; explanation?: string; order?: number }, i: number) => ({
        quizId: quiz.id,
        question: q.question,
        options: q.options,
        correctIndex: q.correctIndex,
        explanation: q.explanation ?? null,
        order: q.order ?? i,
      })),
    );

    res.status(201).json({
      id: quiz.id,
      courseId: quiz.courseId,
      lessonId: quiz.lessonId,
      title: quiz.title,
      description: quiz.description,
      passingScore: quiz.passingScore,
      xpReward: quiz.xpReward,
      order: quiz.order,
      questionCount: questions.length,
      bestScore: null,
      passed: false,
      questions: [],
    });
  } catch (err) {
    req.log.error({ err }, "Error creating quiz");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/quizzes/:quizId — detail with public questions (NO correctIndex)
router.get("/quizzes/:quizId", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const quizId = parseInt(req.params.quizId);
    if (isNaN(quizId)) { res.status(400).json({ error: "Invalid id" }); return; }

    const quiz = await db.select().from(quizzesTable).where(eq(quizzesTable.id, quizId)).limit(1).then((r) => r[0]);
    if (!quiz) { res.status(404).json({ error: "Quiz not found" }); return; }

    // Access control: quiz is accessible if public (no assignedUserId), assigned to this user, or user owns the course
    const canAccess =
      quiz.assignedUserId === null ||
      quiz.assignedUserId === clerkId ||
      (await ownsCourse(clerkId, quiz.courseId));
    if (!canAccess) { res.status(403).json({ error: "Forbidden" }); return; }

    const questions = await db
      .select()
      .from(quizQuestionsTable)
      .where(eq(quizQuestionsTable.quizId, quizId))
      .orderBy(asc(quizQuestionsTable.order), asc(quizQuestionsTable.id));
    const attempts = await db
      .select()
      .from(quizAttemptsTable)
      .where(and(eq(quizAttemptsTable.quizId, quizId), eq(quizAttemptsTable.userId, clerkId)));
    const bestScore = attempts.length ? Math.max(...attempts.map((a) => a.score)) : null;

    res.json({
      id: quiz.id,
      courseId: quiz.courseId,
      lessonId: quiz.lessonId,
      title: quiz.title,
      description: quiz.description,
      passingScore: quiz.passingScore,
      xpReward: quiz.xpReward,
      order: quiz.order,
      questionCount: questions.length,
      bestScore,
      passed: attempts.some((a) => a.passed),
      // SECURITY: correctIndex/explanation are never sent before submission.
      questions: questions.map((q) => ({
        id: q.id,
        question: q.question,
        options: q.options,
        order: q.order,
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Error getting quiz");
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/quizzes/:quizId (instructor)
router.delete("/quizzes/:quizId", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const quizId = parseInt(req.params.quizId);
    if (isNaN(quizId)) { res.status(400).json({ error: "Invalid id" }); return; }

    const quiz = await db.select().from(quizzesTable).where(eq(quizzesTable.id, quizId)).limit(1).then((r) => r[0]);
    if (!quiz) { res.status(204).send(); return; }
    if (!(await ownsCourse(clerkId, quiz.courseId))) { res.status(403).json({ error: "Forbidden" }); return; }

    await db.delete(quizQuestionsTable).where(eq(quizQuestionsTable.quizId, quizId));
    await db.delete(quizzesTable).where(eq(quizzesTable.id, quizId));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Error deleting quiz");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/quizzes/:quizId/attempts — user's attempts
router.get("/quizzes/:quizId/attempts", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const quizId = parseInt(req.params.quizId);
    if (isNaN(quizId)) { res.status(400).json({ error: "Invalid id" }); return; }

    const attempts = await db
      .select()
      .from(quizAttemptsTable)
      .where(and(eq(quizAttemptsTable.quizId, quizId), eq(quizAttemptsTable.userId, clerkId)))
      .orderBy(desc(quizAttemptsTable.createdAt));

    res.json(attempts.map((a) => ({
      id: a.id,
      quizId: a.quizId,
      userId: a.userId,
      score: a.score,
      passed: a.passed,
      createdAt: a.createdAt,
    })));
  } catch (err) {
    req.log.error({ err }, "Error listing attempts");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/quizzes/:quizId/attempts — submit, graded server-side
router.post("/quizzes/:quizId/attempts", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const quizId = parseInt(req.params.quizId);
    if (isNaN(quizId)) { res.status(400).json({ error: "Invalid id" }); return; }

    const { answers } = req.body;
    if (!Array.isArray(answers)) { res.status(400).json({ error: "answers required" }); return; }

    const quiz = await db.select().from(quizzesTable).where(eq(quizzesTable.id, quizId)).limit(1).then((r) => r[0]);
    if (!quiz) { res.status(404).json({ error: "Quiz not found" }); return; }

    // Access control: student can only attempt quizzes assigned to them or public quizzes
    const canAccess =
      quiz.assignedUserId === null ||
      quiz.assignedUserId === clerkId ||
      (await ownsCourse(clerkId, quiz.courseId));
    if (!canAccess) { res.status(403).json({ error: "Forbidden" }); return; }

    if (!(await isEnrolled(clerkId, quiz.courseId))) { res.status(403).json({ error: "Not enrolled" }); return; }

    const questions = await db
      .select()
      .from(quizQuestionsTable)
      .where(eq(quizQuestionsTable.quizId, quizId))
      .orderBy(asc(quizQuestionsTable.order), asc(quizQuestionsTable.id));
    if (questions.length === 0) { res.status(400).json({ error: "Quiz has no questions" }); return; }

    let correctCount = 0;
    const results = questions.map((q, i) => {
      const given = answers[i];
      const correct = given === q.correctIndex;
      if (correct) correctCount++;
      return { questionId: q.id, correct, correctIndex: q.correctIndex, explanation: q.explanation };
    });

    const total = questions.length;
    const score = Math.round((correctCount / total) * 100);
    const passed = score >= quiz.passingScore;

    // Was the user already passing before this attempt?
    const priorPass = await db
      .select({ id: quizAttemptsTable.id })
      .from(quizAttemptsTable)
      .where(and(eq(quizAttemptsTable.quizId, quizId), eq(quizAttemptsTable.userId, clerkId), eq(quizAttemptsTable.passed, true)))
      .limit(1)
      .then((r) => r[0]);

    await db.insert(quizAttemptsTable).values({
      quizId,
      userId: clerkId,
      score,
      passed,
      answers,
    });

    let xpAwarded = 0;
    if (passed && !priorPass) {
      xpAwarded = await awardXp(clerkId, "quiz_pass", `quiz:${quizId}`, quiz.xpReward);
      await recordLearningDay(clerkId);
    }

    // Advance lesson gate if this quiz is a gate quiz (passed → pending_review)
    let gateStatus: string | null = null;
    if (passed) {
      gateStatus = await advanceGateOnPass(clerkId, quizId, score);
    }

    res.json({
      score,
      passed,
      correctCount,
      total,
      xpAwarded,
      ...(gateStatus !== null && { gateStatus }),
      results,
    });
  } catch (err) {
    req.log.error({ err }, "Error submitting quiz attempt");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── TASKS ───────────────────────────────────────────────────────── */

// GET /api/courses/:courseId/tasks — list with completion state
router.get("/courses/:courseId/tasks", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const courseId = parseInt(req.params.courseId);
    if (isNaN(courseId)) { res.status(400).json({ error: "Invalid id" }); return; }

    const tasks = await db
      .select()
      .from(tasksTable)
      .where(eq(tasksTable.courseId, courseId))
      .orderBy(asc(tasksTable.order));
    if (tasks.length === 0) { res.json([]); return; }

    const taskIds = tasks.map((t) => t.id);
    const completions = await db
      .select()
      .from(taskCompletionsTable)
      .where(and(eq(taskCompletionsTable.userId, clerkId), inArray(taskCompletionsTable.taskId, taskIds)));

    res.json(tasks.map((t) => {
      const c = completions.find((cc) => cc.taskId === t.id);
      return {
        id: t.id,
        courseId: t.courseId,
        title: t.title,
        description: t.description,
        xpReward: t.xpReward,
        order: t.order,
        completed: !!c,
        submission: c?.submission ?? null,
      };
    }));
  } catch (err) {
    req.log.error({ err }, "Error listing tasks");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/courses/:courseId/tasks — create (instructor)
router.post("/courses/:courseId/tasks", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const courseId = parseInt(req.params.courseId);
    if (isNaN(courseId)) { res.status(400).json({ error: "Invalid id" }); return; }
    if (!(await ownsCourse(clerkId, courseId))) { res.status(403).json({ error: "Forbidden" }); return; }

    const { title, description, xpReward, order } = req.body;
    if (!title) { res.status(400).json({ error: "title required" }); return; }

    const task = await db.insert(tasksTable).values({
      courseId,
      title,
      description,
      ...(xpReward !== undefined && { xpReward }),
      ...(order !== undefined && { order }),
    }).returning().then((r) => r[0]);

    res.status(201).json({
      id: task.id,
      courseId: task.courseId,
      title: task.title,
      description: task.description,
      xpReward: task.xpReward,
      order: task.order,
      completed: false,
      submission: null,
    });
  } catch (err) {
    req.log.error({ err }, "Error creating task");
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/tasks/:taskId (instructor)
router.delete("/tasks/:taskId", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const taskId = parseInt(req.params.taskId);
    if (isNaN(taskId)) { res.status(400).json({ error: "Invalid id" }); return; }

    const task = await db.select().from(tasksTable).where(eq(tasksTable.id, taskId)).limit(1).then((r) => r[0]);
    if (!task) { res.status(204).send(); return; }
    if (!(await ownsCourse(clerkId, task.courseId))) { res.status(403).json({ error: "Forbidden" }); return; }

    await db.delete(taskCompletionsTable).where(eq(taskCompletionsTable.taskId, taskId));
    await db.delete(tasksTable).where(eq(tasksTable.id, taskId));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Error deleting task");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/tasks/:taskId/complete — mark complete, award XP idempotently
router.post("/tasks/:taskId/complete", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const taskId = parseInt(req.params.taskId);
    if (isNaN(taskId)) { res.status(400).json({ error: "Invalid id" }); return; }

    const { submission } = req.body ?? {};

    const task = await db.select().from(tasksTable).where(eq(tasksTable.id, taskId)).limit(1).then((r) => r[0]);
    if (!task) { res.status(404).json({ error: "Task not found" }); return; }

    if (!(await isEnrolled(clerkId, task.courseId))) { res.status(403).json({ error: "Not enrolled" }); return; }

    const completion = await db.insert(taskCompletionsTable).values({
      taskId,
      userId: clerkId,
      submission: submission ?? null,
    }).onConflictDoUpdate({
      target: [taskCompletionsTable.taskId, taskCompletionsTable.userId],
      set: { submission: submission ?? null },
    }).returning().then((r) => r[0]);

    const xpAwarded = await awardXp(clerkId, "task_complete", `task:${taskId}`, task.xpReward);
    await recordLearningDay(clerkId);

    res.json({
      taskId: completion.taskId,
      userId: completion.userId,
      submission: completion.submission,
      completedAt: completion.completedAt,
      xpAwarded,
    });
  } catch (err) {
    req.log.error({ err }, "Error completing task");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
