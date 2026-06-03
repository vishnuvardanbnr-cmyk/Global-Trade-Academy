import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import {
  usersTable, coursesTable, enrollmentsTable, lessonsTable,
  lessonProgressTable, quizAttemptsTable, taskCompletionsTable,
  xpEventsTable, activityTable, liveClassesTable, certificatesTable,
  postsTable, commentsTable,
} from "@workspace/db";
import { eq, and, inArray, sql, desc, gte, not } from "drizzle-orm";

const router = Router();

async function isAdmin(clerkId: string): Promise<boolean> {
  const user = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, clerkId)).limit(1).then((r) => r[0]);
  return user?.role === "admin";
}

/* ── GET /api/admin/stats/detailed ─────────────────────────────── */
router.get("/admin/stats/detailed", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId || !(await isAdmin(clerkId))) { res.status(403).json({ error: "Forbidden" }); return; }

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalUsers, totalCourses, totalEnrollments, publishedCourses,
      instructors, admins, newUsersWeek, newUsersMonth,
      activeEnrollments, completedEnrollments, totalLessons,
      totalQuizAttempts, totalCertificates, totalXpAwarded,
    ] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(usersTable),
      db.select({ count: sql<number>`count(*)::int` }).from(coursesTable),
      db.select({ count: sql<number>`count(*)::int` }).from(enrollmentsTable),
      db.select({ count: sql<number>`count(*)::int` }).from(coursesTable).where(eq(coursesTable.status, "published")),
      db.select({ count: sql<number>`count(*)::int` }).from(usersTable).where(eq(usersTable.role, "instructor")),
      db.select({ count: sql<number>`count(*)::int` }).from(usersTable).where(eq(usersTable.role, "admin")),
      db.select({ count: sql<number>`count(*)::int` }).from(usersTable).where(gte(usersTable.createdAt, sevenDaysAgo)),
      db.select({ count: sql<number>`count(*)::int` }).from(usersTable).where(gte(usersTable.createdAt, thirtyDaysAgo)),
      db.select({ count: sql<number>`count(*)::int` }).from(enrollmentsTable).where(eq(enrollmentsTable.status, "active")),
      db.select({ count: sql<number>`count(*)::int` }).from(enrollmentsTable).where(eq(enrollmentsTable.status, "completed")),
      db.select({ count: sql<number>`count(*)::int` }).from(lessonsTable),
      db.select({ count: sql<number>`count(*)::int` }).from(quizAttemptsTable),
      db.select({ count: sql<number>`count(*)::int` }).from(certificatesTable),
      db.select({ total: sql<number>`coalesce(sum(${xpEventsTable.amount}), 0)::int` }).from(xpEventsTable),
    ]);

    res.json({
      totalUsers: totalUsers[0]?.count ?? 0,
      totalCourses: totalCourses[0]?.count ?? 0,
      publishedCourses: publishedCourses[0]?.count ?? 0,
      totalEnrollments: totalEnrollments[0]?.count ?? 0,
      activeEnrollments: activeEnrollments[0]?.count ?? 0,
      completedEnrollments: completedEnrollments[0]?.count ?? 0,
      instructors: instructors[0]?.count ?? 0,
      admins: admins[0]?.count ?? 0,
      newUsersWeek: newUsersWeek[0]?.count ?? 0,
      newUsersMonth: newUsersMonth[0]?.count ?? 0,
      totalLessons: totalLessons[0]?.count ?? 0,
      totalQuizAttempts: totalQuizAttempts[0]?.count ?? 0,
      totalCertificates: totalCertificates[0]?.count ?? 0,
      totalXpAwarded: totalXpAwarded[0]?.total ?? 0,
    });
  } catch (err) {
    req.log.error({ err }, "Error getting detailed admin stats");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── PATCH /api/admin/users/:id/role ────────────────────────────── */
router.patch("/admin/users/:id/role", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId || !(await isAdmin(clerkId))) { res.status(403).json({ error: "Forbidden" }); return; }

    const { role } = req.body;
    if (!["student", "instructor", "admin"].includes(role)) {
      res.status(400).json({ error: "Invalid role" }); return;
    }

    const updated = await db
      .update(usersTable)
      .set({ role, updatedAt: new Date() })
      .where(eq(usersTable.id, req.params.id))
      .returning();

    if (!updated[0]) { res.status(404).json({ error: "User not found" }); return; }
    res.json({ success: true, role: updated[0].role });
  } catch (err) {
    req.log.error({ err }, "Error updating user role");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── PATCH /api/admin/users/:id/xp ─────────────────────────────── */
router.patch("/admin/users/:id/xp", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId || !(await isAdmin(clerkId))) { res.status(403).json({ error: "Forbidden" }); return; }

    const { xp } = req.body;
    if (typeof xp !== "number" || xp < 0) { res.status(400).json({ error: "Invalid xp value" }); return; }

    const updated = await db
      .update(usersTable)
      .set({ xp, updatedAt: new Date() })
      .where(eq(usersTable.id, req.params.id))
      .returning();

    if (!updated[0]) { res.status(404).json({ error: "User not found" }); return; }
    res.json({ success: true, xp: updated[0].xp });
  } catch (err) {
    req.log.error({ err }, "Error updating user XP");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── DELETE /api/admin/users/:id ────────────────────────────────── */
router.delete("/admin/users/:id", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId || !(await isAdmin(clerkId))) { res.status(403).json({ error: "Forbidden" }); return; }
    if (req.params.id === clerkId) { res.status(400).json({ error: "Cannot delete yourself" }); return; }

    await db.delete(usersTable).where(eq(usersTable.id, req.params.id));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Error deleting user");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── GET /api/admin/enrollments ─────────────────────────────────── */
router.get("/admin/enrollments", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId || !(await isAdmin(clerkId))) { res.status(403).json({ error: "Forbidden" }); return; }

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
      .orderBy(desc(enrollmentsTable.enrolledAt))
      .limit(200);

    const userIds = [...new Set(enrollments.map((e) => e.userId))];
    const courseIds = [...new Set(enrollments.map((e) => e.courseId))];

    const [users, courses] = await Promise.all([
      userIds.length ? db.select({ id: usersTable.id, displayName: usersTable.displayName, email: usersTable.email }).from(usersTable).where(inArray(usersTable.id, userIds)) : [],
      courseIds.length ? db.select({ id: coursesTable.id, title: coursesTable.title, instructorId: coursesTable.instructorId }).from(coursesTable).where(inArray(coursesTable.id, courseIds)) : [],
    ]);

    const userMap = Object.fromEntries(users.map((u) => [u.id, u]));
    const courseMap = Object.fromEntries(courses.map((c) => [c.id, c]));

    res.json(enrollments.map((e) => ({
      ...e,
      userName: userMap[e.userId]?.displayName ?? userMap[e.userId]?.email ?? e.userId,
      userEmail: userMap[e.userId]?.email ?? "",
      courseTitle: courseMap[e.courseId]?.title ?? "Unknown",
      instructorId: courseMap[e.courseId]?.instructorId ?? null,
    })));
  } catch (err) {
    req.log.error({ err }, "Error listing admin enrollments");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── POST /api/admin/enroll — grant a user access to any course ─── */
router.post("/admin/enroll", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId || !(await isAdmin(clerkId))) { res.status(403).json({ error: "Forbidden" }); return; }

    const { userId, courseId } = req.body;
    if (!userId || !courseId) { res.status(400).json({ error: "userId and courseId are required" }); return; }

    const course = await db.select({ id: coursesTable.id, title: coursesTable.title })
      .from(coursesTable).where(eq(coursesTable.id, parseInt(courseId))).limit(1).then((r) => r[0]);
    if (!course) { res.status(404).json({ error: "Course not found" }); return; }

    const existing = await db.select({ id: enrollmentsTable.id })
      .from(enrollmentsTable)
      .where(and(eq(enrollmentsTable.courseId, parseInt(courseId)), eq(enrollmentsTable.userId, userId)))
      .limit(1).then((r) => r[0]);

    if (existing) { res.status(409).json({ error: "User is already enrolled in this course" }); return; }

    const inserted = await db.insert(enrollmentsTable).values({
      courseId: parseInt(courseId),
      userId,
      status: "active",
    }).returning();

    res.status(201).json({ success: true, enrollment: inserted[0] });
  } catch (err) {
    req.log.error({ err }, "Error granting course access");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── DELETE /api/admin/enrollments/:id ──────────────────────────── */
router.delete("/admin/enrollments/:id", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId || !(await isAdmin(clerkId))) { res.status(403).json({ error: "Forbidden" }); return; }

    await db.delete(enrollmentsTable).where(eq(enrollmentsTable.id, parseInt(req.params.id)));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Error deleting enrollment");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── GET /api/admin/courses ─────────────────────────────────────── */
router.get("/admin/courses", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId || !(await isAdmin(clerkId))) { res.status(403).json({ error: "Forbidden" }); return; }

    const courses = await db
      .select()
      .from(coursesTable)
      .orderBy(desc(coursesTable.createdAt));

    const courseIds = courses.map((c) => c.id);
    const instructorIds = [...new Set(courses.map((c) => c.instructorId).filter(Boolean))];

    const [enrollCounts, instructors] = await Promise.all([
      courseIds.length ? db.select({ courseId: enrollmentsTable.courseId, count: sql<number>`count(*)::int` })
        .from(enrollmentsTable).where(inArray(enrollmentsTable.courseId, courseIds)).groupBy(enrollmentsTable.courseId) : [],
      instructorIds.length ? db.select({ id: usersTable.id, displayName: usersTable.displayName, email: usersTable.email })
        .from(usersTable).where(inArray(usersTable.id, instructorIds as string[])) : [],
    ]);

    const enrollMap = Object.fromEntries(enrollCounts.map((e) => [e.courseId, e.count]));
    const instructorMap = Object.fromEntries(instructors.map((i) => [i.id, i.displayName ?? i.email]));

    res.json(courses.map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description,
      status: c.status,
      level: c.level,
      category: c.category,
      price: c.price,
      thumbnailUrl: c.thumbnailUrl,
      instructorId: c.instructorId,
      instructorName: instructorMap[c.instructorId ?? ""] ?? "Unknown",
      enrollments: enrollMap[c.id] ?? 0,
      isFeatured: c.isFeatured,
      createdAt: c.createdAt,
    })));
  } catch (err) {
    req.log.error({ err }, "Error listing admin courses");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── PATCH /api/admin/courses/:id/status ────────────────────────── */
router.patch("/admin/courses/:id/status", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId || !(await isAdmin(clerkId))) { res.status(403).json({ error: "Forbidden" }); return; }

    const { status } = req.body;
    if (!["draft", "published", "archived"].includes(status)) {
      res.status(400).json({ error: "Invalid status" }); return;
    }

    const updated = await db.update(coursesTable)
      .set({ status, updatedAt: new Date() })
      .where(eq(coursesTable.id, parseInt(req.params.id)))
      .returning();
    if (!updated[0]) { res.status(404).json({ error: "Course not found" }); return; }
    res.json({ success: true, status: updated[0].status });
  } catch (err) {
    req.log.error({ err }, "Error updating course status");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── PATCH /api/admin/courses/:id/featured ──────────────────────── */
router.patch("/admin/courses/:id/featured", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId || !(await isAdmin(clerkId))) { res.status(403).json({ error: "Forbidden" }); return; }

    const { isFeatured } = req.body;
    const updated = await db.update(coursesTable)
      .set({ isFeatured: Boolean(isFeatured), updatedAt: new Date() })
      .where(eq(coursesTable.id, parseInt(req.params.id)))
      .returning();
    if (!updated[0]) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Error updating featured status");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── DELETE /api/admin/courses/:id ──────────────────────────────── */
router.delete("/admin/courses/:id", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId || !(await isAdmin(clerkId))) { res.status(403).json({ error: "Forbidden" }); return; }

    await db.delete(coursesTable).where(eq(coursesTable.id, parseInt(req.params.id)));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Error deleting course");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── GET /api/admin/activity ────────────────────────────────────── */
router.get("/admin/activity", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId || !(await isAdmin(clerkId))) { res.status(403).json({ error: "Forbidden" }); return; }

    const activities = await db
      .select()
      .from(activityTable)
      .orderBy(desc(activityTable.createdAt))
      .limit(100);

    const userIds = [...new Set(activities.map((a) => a.userId).filter(Boolean))];
    const users = userIds.length
      ? await db.select({ id: usersTable.id, displayName: usersTable.displayName, email: usersTable.email })
          .from(usersTable).where(inArray(usersTable.id, userIds as string[]))
      : [];
    const userMap = Object.fromEntries(users.map((u) => [u.id, u.displayName ?? u.email]));

    res.json(activities.map((a) => ({
      ...a,
      userName: a.userId ? (userMap[a.userId] ?? a.userId) : null,
    })));
  } catch (err) {
    req.log.error({ err }, "Error getting admin activity");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── GET /api/admin/posts ───────────────────────────────────────── */
router.get("/admin/posts", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId || !(await isAdmin(clerkId))) { res.status(403).json({ error: "Forbidden" }); return; }

    const posts = await db
      .select()
      .from(postsTable)
      .orderBy(desc(postsTable.createdAt))
      .limit(200);

    const authorIds = [...new Set(posts.map((p) => p.authorId).filter(Boolean))];
    const authors = authorIds.length
      ? await db.select({ id: usersTable.id, displayName: usersTable.displayName, email: usersTable.email })
          .from(usersTable).where(inArray(usersTable.id, authorIds as string[]))
      : [];
    const authorMap = Object.fromEntries(authors.map((u) => [u.id, u.displayName ?? u.email]));

    const commentCounts = await db
      .select({ postId: commentsTable.postId, cnt: sql<number>`count(*)::int` })
      .from(commentsTable)
      .groupBy(commentsTable.postId);
    const commentMap = Object.fromEntries(commentCounts.map((c) => [c.postId, c.cnt]));

    res.json(posts.map((p) => ({
      ...p,
      authorName: p.authorId ? (authorMap[p.authorId] ?? p.authorId) : null,
      commentCount: commentMap[p.id] ?? 0,
    })));
  } catch (err) {
    req.log.error({ err }, "Error listing admin posts");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── DELETE /api/admin/posts/:id ────────────────────────────────── */
router.delete("/admin/posts/:id", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId || !(await isAdmin(clerkId))) { res.status(403).json({ error: "Forbidden" }); return; }
    const id = parseInt(req.params.id);
    await db.delete(commentsTable).where(eq(commentsTable.postId, id));
    await db.delete(postsTable).where(eq(postsTable.id, id));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Error deleting post");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── PATCH /api/admin/posts/:id/pin ─────────────────────────────── */
router.patch("/admin/posts/:id/pin", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId || !(await isAdmin(clerkId))) { res.status(403).json({ error: "Forbidden" }); return; }
    const id = parseInt(req.params.id);
    const { pinned } = req.body ?? {};
    await db.update(postsTable).set({ isPinned: !!pinned }).where(eq(postsTable.id, id));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Error pinning post");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── DELETE /api/admin/comments/:id ─────────────────────────────── */
router.delete("/admin/comments/:id", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId || !(await isAdmin(clerkId))) { res.status(403).json({ error: "Forbidden" }); return; }
    const id = parseInt(req.params.id);
    await db.delete(commentsTable).where(eq(commentsTable.id, id));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Error deleting comment");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── GET /api/admin/comments ─────────────────────────────────────── */
router.get("/admin/comments", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId || !(await isAdmin(clerkId))) { res.status(403).json({ error: "Forbidden" }); return; }

    const comments = await db
      .select()
      .from(commentsTable)
      .orderBy(desc(commentsTable.createdAt))
      .limit(200);

    const authorIds = [...new Set(comments.map((c) => c.authorId).filter(Boolean))];
    const authors = authorIds.length
      ? await db.select({ id: usersTable.id, displayName: usersTable.displayName, email: usersTable.email })
          .from(usersTable).where(inArray(usersTable.id, authorIds as string[]))
      : [];
    const authorMap = Object.fromEntries(authors.map((u) => [u.id, u.displayName ?? u.email]));

    res.json(comments.map((c) => ({
      ...c,
      authorName: c.authorId ? (authorMap[c.authorId] ?? c.authorId) : null,
    })));
  } catch (err) {
    req.log.error({ err }, "Error listing admin comments");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
