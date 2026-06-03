import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import {
  usersTable, coursesTable, enrollmentsTable, lessonsTable,
  lessonProgressTable, quizAttemptsTable, quizzesTable,
  taskCompletionsTable, tasksTable, lessonGatesTable,
  xpEventsTable, liveClassesTable, certificatesTable,
} from "@workspace/db";
import { eq, and, inArray, sql, desc, count, avg } from "drizzle-orm";
import { ownsCourse } from "../lib/lms";
import { notifyUsers } from "../lib/notify";
import { reviewsTable } from "@workspace/db";

const router = Router();

async function getInstructorCourseIds(clerkId: string): Promise<number[]> {
  const courses = await db
    .select({ id: coursesTable.id })
    .from(coursesTable)
    .where(eq(coursesTable.instructorId, clerkId));
  return courses.map((c) => c.id);
}

/* ── GET /api/instructor/students ─────────────────────────────────
   All students enrolled in any of the instructor's courses,
   with aggregate progress data.                                     */
router.get("/instructor/students", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const courseIds = await getInstructorCourseIds(clerkId);
    if (courseIds.length === 0) { res.json([]); return; }

    const enrollments = await db
      .select({
        userId: enrollmentsTable.userId,
        courseId: enrollmentsTable.courseId,
        status: enrollmentsTable.status,
        enrolledAt: enrollmentsTable.enrolledAt,
        completedAt: enrollmentsTable.completedAt,
      })
      .from(enrollmentsTable)
      .where(inArray(enrollmentsTable.courseId, courseIds));

    if (enrollments.length === 0) { res.json([]); return; }

    const studentIds = [...new Set(enrollments.map((e) => e.userId))];

    const [students, progressRows, xpRows, certRows] = await Promise.all([
      db.select({ id: usersTable.id, displayName: usersTable.displayName, email: usersTable.email, avatarUrl: usersTable.avatarUrl, xp: usersTable.xp, createdAt: usersTable.createdAt })
        .from(usersTable).where(inArray(usersTable.id, studentIds)),
      db.select({ userId: lessonProgressTable.userId, completed: sql<number>`count(*) filter (where ${lessonProgressTable.completed})::int` })
        .from(lessonProgressTable)
        .where(and(inArray(lessonProgressTable.userId, studentIds)))
        .groupBy(lessonProgressTable.userId),
      db.select({ userId: xpEventsTable.userId, total: sql<number>`sum(${xpEventsTable.amount})::int` })
        .from(xpEventsTable)
        .where(inArray(xpEventsTable.userId, studentIds))
        .groupBy(xpEventsTable.userId),
      db.select({ userId: certificatesTable.userId, count: sql<number>`count(*)::int` })
        .from(certificatesTable)
        .where(inArray(certificatesTable.userId, studentIds))
        .groupBy(certificatesTable.userId),
    ]);

    const studentMap = Object.fromEntries(students.map((s) => [s.id, s]));
    const progressMap = Object.fromEntries(progressRows.map((r) => [r.userId, r.completed]));
    const xpMap = Object.fromEntries(xpRows.map((r) => [r.userId, r.total]));
    const certMap = Object.fromEntries(certRows.map((r) => [r.userId, r.count]));

    const courseMap: Record<number, number> = {};
    for (const e of enrollments) {
      courseMap[e.userId] = (courseMap[e.userId] ?? 0) + 1;
    }
    const completedMap: Record<number, number> = {};
    for (const e of enrollments.filter((e) => e.status === "completed")) {
      completedMap[e.userId] = (completedMap[e.userId] ?? 0) + 1;
    }

    const seen = new Set<string>();
    const result = [];
    for (const s of students) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      const lastEnroll = enrollments.filter((e) => e.userId === s.id).sort((a, b) => new Date(b.enrolledAt!).getTime() - new Date(a.enrolledAt!).getTime())[0];
      result.push({
        userId: s.id,
        displayName: s.displayName ?? s.email ?? s.id,
        email: s.email,
        avatarUrl: s.avatarUrl,
        xp: s.xp ?? 0,
        coursesEnrolled: courseMap[s.id] ?? 0,
        coursesCompleted: completedMap[s.id] ?? 0,
        lessonsCompleted: progressMap[s.id] ?? 0,
        certificates: certMap[s.id] ?? 0,
        lastActivity: lastEnroll?.enrolledAt ?? s.createdAt,
      });
    }
    result.sort((a, b) => new Date(b.lastActivity!).getTime() - new Date(a.lastActivity!).getTime());
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Error listing instructor students");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── GET /api/instructor/enrollments ────────────────────────────── */
router.get("/instructor/enrollments", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const courseIds = await getInstructorCourseIds(clerkId);
    if (courseIds.length === 0) { res.json([]); return; }

    const enrollments = await db
      .select({
        id: enrollmentsTable.id,
        userId: enrollmentsTable.userId,
        courseId: enrollmentsTable.courseId,
        status: enrollmentsTable.status,
        enrolledAt: enrollmentsTable.enrolledAt,
        completedAt: enrollmentsTable.completedAt,
      })
      .from(enrollmentsTable)
      .where(inArray(enrollmentsTable.courseId, courseIds))
      .orderBy(desc(enrollmentsTable.enrolledAt));

    const userIds = [...new Set(enrollments.map((e) => e.userId))];
    const [users, courses] = await Promise.all([
      userIds.length ? db.select({ id: usersTable.id, displayName: usersTable.displayName, email: usersTable.email, avatarUrl: usersTable.avatarUrl })
        .from(usersTable).where(inArray(usersTable.id, userIds)) : [],
      db.select({ id: coursesTable.id, title: coursesTable.title })
        .from(coursesTable).where(inArray(coursesTable.id, courseIds)),
    ]);

    const userMap = Object.fromEntries(users.map((u) => [u.id, u]));
    const courseMap = Object.fromEntries(courses.map((c) => [c.id, c.title]));

    res.json(enrollments.map((e) => ({
      ...e,
      userName: userMap[e.userId]?.displayName ?? userMap[e.userId]?.email ?? e.userId,
      userEmail: userMap[e.userId]?.email ?? "",
      userAvatar: userMap[e.userId]?.avatarUrl ?? null,
      courseTitle: courseMap[e.courseId] ?? "Unknown Course",
    })));
  } catch (err) {
    req.log.error({ err }, "Error listing instructor enrollments");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── GET /api/instructor/course-analytics/:courseId ─────────────── */
router.get("/instructor/course-analytics/:courseId", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const courseId = parseInt(req.params.courseId);
    if (isNaN(courseId) || !(await ownsCourse(clerkId, courseId))) {
      res.status(403).json({ error: "Forbidden" }); return;
    }

    const [lessons, enrollments, quizzes] = await Promise.all([
      db.select({ id: lessonsTable.id, title: lessonsTable.title, order: lessonsTable.order })
        .from(lessonsTable).where(eq(lessonsTable.courseId, courseId)),
      db.select({ count: sql<number>`count(*)::int` })
        .from(enrollmentsTable).where(eq(enrollmentsTable.courseId, courseId)),
      db.select({ id: quizzesTable.id, title: quizzesTable.title, passingScore: quizzesTable.passingScore })
        .from(quizzesTable).where(eq(quizzesTable.courseId, courseId)),
    ]);

    const totalEnrolled = enrollments[0]?.count ?? 0;
    const lessonIds = lessons.map((l) => l.id);

    const lessonProgress = lessonIds.length
      ? await db
          .select({ lessonId: lessonProgressTable.lessonId, completed: sql<number>`count(*) filter (where ${lessonProgressTable.completed})::int`, total: sql<number>`count(*)::int` })
          .from(lessonProgressTable)
          .where(inArray(lessonProgressTable.lessonId, lessonIds))
          .groupBy(lessonProgressTable.lessonId)
      : [];

    const progressMap = Object.fromEntries(lessonProgress.map((r) => [r.lessonId, r]));

    const quizIds = quizzes.map((q) => q.id);
    const quizAttempts = quizIds.length
      ? await db
          .select({ quizId: quizAttemptsTable.quizId, passed: sql<number>`count(*) filter (where ${quizAttemptsTable.passed})::int`, total: sql<number>`count(*)::int`, avgScore: sql<number>`avg(${quizAttemptsTable.score})::float` })
          .from(quizAttemptsTable)
          .where(inArray(quizAttemptsTable.quizId, quizIds))
          .groupBy(quizAttemptsTable.quizId)
      : [];
    const quizMap = Object.fromEntries(quizAttempts.map((q) => [q.quizId, q]));

    const taskStats = await db
      .select({ status: taskCompletionsTable.status, count: sql<number>`count(*)::int` })
      .from(taskCompletionsTable)
      .innerJoin(tasksTable, eq(tasksTable.id, taskCompletionsTable.taskId))
      .where(eq(tasksTable.courseId, courseId))
      .groupBy(taskCompletionsTable.status);

    const completedEnrollments = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(enrollmentsTable)
      .where(and(eq(enrollmentsTable.courseId, courseId), eq(enrollmentsTable.status, "completed")));

    res.json({
      courseId,
      totalEnrolled,
      completedCourse: completedEnrollments[0]?.count ?? 0,
      completionRate: totalEnrolled > 0 ? Math.round(((completedEnrollments[0]?.count ?? 0) / totalEnrolled) * 100) : 0,
      lessonStats: lessons.map((l) => ({
        lessonId: l.id,
        title: l.title,
        order: l.order,
        completions: progressMap[l.id]?.completed ?? 0,
        completionRate: totalEnrolled > 0 ? Math.round(((progressMap[l.id]?.completed ?? 0) / totalEnrolled) * 100) : 0,
      })),
      quizStats: quizzes.map((q) => ({
        quizId: q.id,
        title: q.title,
        passingScore: q.passingScore,
        totalAttempts: quizMap[q.id]?.total ?? 0,
        passCount: quizMap[q.id]?.passed ?? 0,
        passRate: (quizMap[q.id]?.total ?? 0) > 0 ? Math.round(((quizMap[q.id]?.passed ?? 0) / (quizMap[q.id]?.total ?? 1)) * 100) : 0,
        avgScore: Math.round(quizMap[q.id]?.avgScore ?? 0),
      })),
      taskStats: {
        pending: taskStats.find((t) => t.status === "pending_review")?.count ?? 0,
        approved: taskStats.find((t) => t.status === "approved")?.count ?? 0,
        rejected: taskStats.find((t) => t.status === "rejected")?.count ?? 0,
      },
    });
  } catch (err) {
    req.log.error({ err }, "Error getting course analytics");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── DELETE /api/instructor/enrollments/:id ─────────────────────── */
router.delete("/instructor/enrollments/:id", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

    const enrollment = await db.select().from(enrollmentsTable).where(eq(enrollmentsTable.id, id)).limit(1).then((r) => r[0]);
    if (!enrollment) { res.status(404).json({ error: "Not found" }); return; }

    if (!(await ownsCourse(clerkId, enrollment.courseId))) { res.status(403).json({ error: "Forbidden" }); return; }

    await db.delete(enrollmentsTable).where(eq(enrollmentsTable.id, id));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Error removing enrollment");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── POST /api/instructor/announce ──────────────────────────────── */
router.post("/instructor/announce", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const { courseId, title, message } = req.body ?? {};
    if (!title?.trim() || !message?.trim()) {
      res.status(400).json({ error: "title and message are required" }); return;
    }

    if (courseId) {
      if (!(await ownsCourse(clerkId, courseId))) { res.status(403).json({ error: "Forbidden" }); return; }
      const enrollments = await db
        .select({ userId: enrollmentsTable.userId })
        .from(enrollmentsTable)
        .where(eq(enrollmentsTable.courseId, courseId));
      const studentIds = enrollments.map((e) => e.userId).filter((id) => id !== clerkId);
      await notifyUsers(studentIds, "announcement", title.trim(), message.trim(), String(courseId));
    } else {
      // Announce to all students enrolled in any of instructor's courses
      const courseIds = await getInstructorCourseIds(clerkId);
      if (!courseIds.length) { res.json({ sent: 0 }); return; }
      const enrollments = await db
        .select({ userId: enrollmentsTable.userId })
        .from(enrollmentsTable)
        .where(inArray(enrollmentsTable.courseId, courseIds));
      const studentIds = [...new Set(enrollments.map((e) => e.userId).filter((id) => id !== clerkId))];
      await notifyUsers(studentIds, "announcement", title.trim(), message.trim());
    }

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Error sending announcement");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── GET /api/instructor/reviews ─────────────────────────────────── */
router.get("/instructor/reviews", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const courseIds = await getInstructorCourseIds(clerkId);
    if (!courseIds.length) { res.json([]); return; }

    const reviews = await db
      .select()
      .from(reviewsTable)
      .where(inArray(reviewsTable.courseId, courseIds))
      .orderBy(desc(reviewsTable.createdAt));

    const userIds = [...new Set(reviews.map((r) => r.userId))];
    const users = userIds.length
      ? await db.select({ id: usersTable.id, displayName: usersTable.displayName, email: usersTable.email })
          .from(usersTable).where(inArray(usersTable.id, userIds))
      : [];
    const userMap = Object.fromEntries(users.map((u) => [u.id, u.displayName ?? u.email]));

    const courses = await db
      .select({ id: coursesTable.id, title: coursesTable.title })
      .from(coursesTable)
      .where(inArray(coursesTable.id, courseIds));
    const courseMap = Object.fromEntries(courses.map((c) => [c.id, c.title]));

    res.json(reviews.map((r) => ({
      ...r,
      userName: userMap[r.userId] ?? r.userId,
      courseTitle: courseMap[r.courseId] ?? `Course #${r.courseId}`,
    })));
  } catch (err) {
    req.log.error({ err }, "Error listing instructor reviews");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
