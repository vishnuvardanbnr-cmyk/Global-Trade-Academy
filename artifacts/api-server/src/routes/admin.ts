import { Router } from "express";
import { getAuth } from "../lib/auth";
import { db } from "@workspace/db";
import {
  usersTable, coursesTable, enrollmentsTable, lessonsTable,
  lessonProgressTable, quizAttemptsTable, taskCompletionsTable,
  xpEventsTable, activityTable, liveClassesTable, certificatesTable,
  postsTable, commentsTable, eventsTable, siteSettingsTable,
  livekitAccountsTable, groupMembersTable, groupsTable,
  platformSubscriptionsTable, subscriptionPlansTable,
  tradersTable, copyAccountsTable, tradeSignalsTable,
  copySubscriptionsTable, masterPositionsTable, copyTradesTable,
} from "@workspace/db";
import { eq, and, inArray, sql, desc, gte, not, asc } from "drizzle-orm";
import { notifyUsers } from "../lib/notify";
import { sendBulkEmails, isEmailConfigured } from "../lib/mailer";

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

/* ── PATCH /api/admin/users/:id/plan ───────────────────────────── */
router.patch("/admin/users/:id/plan", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId || !(await isAdmin(clerkId))) { res.status(403).json({ error: "Forbidden" }); return; }

    const { plan } = req.body;
    if (!["free", "pro", "premium", "elite"].includes(plan)) {
      res.status(400).json({ error: "Invalid plan. Must be free, pro, premium, or elite" }); return;
    }

    const updated = await db
      .update(usersTable)
      .set({ plan, updatedAt: new Date() })
      .where(eq(usersTable.id, req.params.id))
      .returning();

    if (!updated[0]) { res.status(404).json({ error: "User not found" }); return; }
    res.json({ success: true, plan: updated[0].plan });
  } catch (err) {
    req.log.error({ err }, "Error updating user plan");
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

    const [users, courses, groupMembers] = await Promise.all([
      userIds.length ? db.select({ id: usersTable.id, displayName: usersTable.displayName, email: usersTable.email }).from(usersTable).where(inArray(usersTable.id, userIds)) : [],
      courseIds.length ? db.select({ id: coursesTable.id, title: coursesTable.title, instructorId: coursesTable.instructorId }).from(coursesTable).where(inArray(coursesTable.id, courseIds)) : [],
      userIds.length ? db.select({ userId: groupMembersTable.userId, groupName: groupsTable.name })
        .from(groupMembersTable)
        .innerJoin(groupsTable, eq(groupsTable.id, groupMembersTable.groupId))
        .where(inArray(groupMembersTable.userId, userIds)) : [],
    ]);

    const userMap = Object.fromEntries(users.map((u) => [u.id, u]));
    const courseMap = Object.fromEntries(courses.map((c) => [c.id, c]));
    const groupMap = Object.fromEntries(groupMembers.map((g) => [g.userId, g.groupName]));

    res.json(enrollments.map((e) => ({
      ...e,
      userName: userMap[e.userId]?.displayName ?? userMap[e.userId]?.email ?? e.userId,
      userEmail: userMap[e.userId]?.email ?? "",
      courseTitle: courseMap[e.courseId]?.title ?? "Unknown",
      instructorId: courseMap[e.courseId]?.instructorId ?? null,
      groupName: groupMap[e.userId] ?? null,
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

/* ── GET /api/admin/enrollment-requests ─────────────────────────── */
router.get("/admin/enrollment-requests", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId || !(await isAdmin(clerkId))) { res.status(403).json({ error: "Forbidden" }); return; }

    const requests = await db
      .select({
        id: enrollmentsTable.id,
        userId: enrollmentsTable.userId,
        courseId: enrollmentsTable.courseId,
        status: enrollmentsTable.status,
        enrolledAt: enrollmentsTable.enrolledAt,
      })
      .from(enrollmentsTable)
      .where(eq(enrollmentsTable.status, "pending"))
      .orderBy(desc(enrollmentsTable.enrolledAt));

    const userIds = [...new Set(requests.map((e) => e.userId))];
    const courseIds = [...new Set(requests.map((e) => e.courseId))];
    const [users, courses, groupMembers] = await Promise.all([
      userIds.length ? db.select({ id: usersTable.id, displayName: usersTable.displayName, email: usersTable.email }).from(usersTable).where(inArray(usersTable.id, userIds)) : [],
      courseIds.length ? db.select({ id: coursesTable.id, title: coursesTable.title, instructorId: coursesTable.instructorId }).from(coursesTable).where(inArray(coursesTable.id, courseIds)) : [],
      userIds.length ? db.select({ userId: groupMembersTable.userId, groupName: groupsTable.name })
        .from(groupMembersTable)
        .innerJoin(groupsTable, eq(groupsTable.id, groupMembersTable.groupId))
        .where(inArray(groupMembersTable.userId, userIds)) : [],
    ]);
    const userMap = Object.fromEntries(users.map((u) => [u.id, u]));
    const courseMap = Object.fromEntries(courses.map((c) => [c.id, c]));
    const groupMap = Object.fromEntries(groupMembers.map((g) => [g.userId, g.groupName]));

    res.json(requests.map((e) => ({
      ...e,
      userName: userMap[e.userId]?.displayName ?? userMap[e.userId]?.email ?? e.userId,
      userEmail: userMap[e.userId]?.email ?? "",
      courseTitle: courseMap[e.courseId]?.title ?? "Unknown",
      groupName: groupMap[e.userId] ?? null,
    })));
  } catch (err) {
    req.log.error({ err }, "Error listing enrollment requests");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── POST /api/admin/enrollment-requests/:id/approve ────────────── */
router.post("/admin/enrollment-requests/:id/approve", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId || !(await isAdmin(clerkId))) { res.status(403).json({ error: "Forbidden" }); return; }

    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

    const updated = await db.update(enrollmentsTable).set({ status: "active" }).where(eq(enrollmentsTable.id, id)).returning({ id: enrollmentsTable.id });
    if (updated.length === 0) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Error approving enrollment request");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── POST /api/admin/enrollment-requests/:id/reject ─────────────── */
router.post("/admin/enrollment-requests/:id/reject", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId || !(await isAdmin(clerkId))) { res.status(403).json({ error: "Forbidden" }); return; }

    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

    await db.delete(enrollmentsTable).where(eq(enrollmentsTable.id, id));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Error rejecting enrollment request");
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
      subCategory: c.subCategory ?? null,
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

/* ── GET /api/events (public — students & guests) ──────────────── */
router.get("/events", async (_req, res): Promise<void> => {
  try {
    const events = await db.select().from(eventsTable).orderBy(eventsTable.eventDate);
    res.json(events);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── GET /api/admin/events ─────────────────────────────────────── */
router.get("/admin/events", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId || !(await isAdmin(clerkId))) { res.status(403).json({ error: "Forbidden" }); return; }
    const events = await db.select().from(eventsTable).orderBy(desc(eventsTable.createdAt));
    res.json(events);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── POST /api/admin/events ────────────────────────────────────── */
router.post("/admin/events", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId || !(await isAdmin(clerkId))) { res.status(403).json({ error: "Forbidden" }); return; }
    const { title, description, thumbnailUrl, eventDate, location, type } = req.body as {
      title: string; description?: string; thumbnailUrl?: string; eventDate?: string; location?: string; type?: string;
    };
    if (!title?.trim()) { res.status(400).json({ error: "Title is required" }); return; }
    const [event] = await db.insert(eventsTable).values({
      title: title.trim(),
      description: description?.trim() ?? null,
      thumbnailUrl: thumbnailUrl?.trim() ?? null,
      eventDate: eventDate ? new Date(eventDate) : null,
      location: location?.trim() ?? null,
      type: type ?? "general",
      createdBy: clerkId,
    }).returning();
    res.status(201).json(event);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── DELETE /api/admin/events/:id ──────────────────────────────── */
router.delete("/admin/events/:id", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId || !(await isAdmin(clerkId))) { res.status(403).json({ error: "Forbidden" }); return; }
    await db.delete(eventsTable).where(eq(eventsTable.id, parseInt(req.params.id)));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── POST /api/admin/broadcast ─────────────────────────────────── */
router.post("/admin/broadcast", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId || !(await isAdmin(clerkId))) { res.status(403).json({ error: "Forbidden" }); return; }
    const { title, message, sendEmail: doEmail, audience } = req.body as {
      title: string; message: string; sendEmail?: boolean; audience?: "all" | "students" | "instructors";
    };
    if (!title?.trim() || !message?.trim()) { res.status(400).json({ error: "Title and message required" }); return; }

    const query = db.select({ id: usersTable.id, email: usersTable.email, displayName: usersTable.displayName }).from(usersTable);
    const users = audience === "students"
      ? await query.where(eq(usersTable.role, "student"))
      : audience === "instructors"
        ? await query.where(eq(usersTable.role, "instructor"))
        : await query;

    await notifyUsers(users.map((u) => u.id), "announcement", title.trim(), message.trim());

    let emailResult = { sent: 0, failed: 0, configured: isEmailConfigured() };
    if (doEmail && isEmailConfigured()) {
      const result = await sendBulkEmails(
        users.map((u) => ({ email: u.email, name: u.displayName })),
        title.trim(),
        (name) => `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
          <h2 style="color:#1a1a2e;margin-bottom:8px">Bright Insight</h2>
          <h3 style="color:#333;margin-top:0">${title.trim()}</h3>
          <p>Hi ${name},</p>
          <p style="line-height:1.6;color:#444">${message.trim().replace(/\n/g, "<br>")}</p>
          <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
          <p style="font-size:12px;color:#888">Bright Insight Trading Education</p>
        </div>`,
      );
      emailResult = { ...result, configured: true };
    }

    res.json({ ok: true, notified: users.length, emailResult });
  } catch (err) {
    req.log.error({ err }, "Error sending broadcast");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── GET /api/site-settings/:key  (public — no auth) ─────────── */
router.get("/site-settings/:key", async (req, res): Promise<void> => {
  try {
    const row = await db
      .select()
      .from(siteSettingsTable)
      .where(eq(siteSettingsTable.key, req.params.key))
      .limit(1)
      .then((r) => r[0]);
    if (!row) { res.json({ value: null }); return; }
    res.json({ value: JSON.parse(row.value) });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── PUT /api/admin/site-settings/:key  (admin only) ─────────── */
router.put("/admin/site-settings/:key", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId || !(await isAdmin(clerkId))) { res.status(403).json({ error: "Forbidden" }); return; }
    const { value } = req.body as { value: unknown };
    if (value === undefined) { res.status(400).json({ error: "value required" }); return; }
    await db
      .insert(siteSettingsTable)
      .values({ key: req.params.key, value: JSON.stringify(value) })
      .onConflictDoUpdate({
        target: siteSettingsTable.key,
        set: { value: JSON.stringify(value), updatedAt: new Date() },
      });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ═══════════════════════════════════════════════════════════════════
   PAYMENT SETTINGS (USDT deposit address + BscScan API key)
════════════════════════════════════════════════════════════════════ */

router.get("/admin/payment-settings", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId || !(await isAdmin(clerkId))) { res.status(403).json({ error: "Forbidden" }); return; }
    const row = await db.select().from(siteSettingsTable).where(eq(siteSettingsTable.key, "payment_settings")).limit(1).then((r) => r[0]);
    const settings = row?.value ? (JSON.parse(row.value as string) as Record<string, string>) : {};
    res.json({
      usdtAddress: settings.usdtAddress ?? "",
      bscscanApiKey: settings.bscscanApiKey ?? "",
    });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/payment-settings", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId || !(await isAdmin(clerkId))) { res.status(403).json({ error: "Forbidden" }); return; }
    const { usdtAddress, bscscanApiKey } = req.body as { usdtAddress?: string; bscscanApiKey?: string };
    const value = JSON.stringify({
      usdtAddress: (usdtAddress ?? "").trim(),
      bscscanApiKey: (bscscanApiKey ?? "").trim(),
    });
    await db.insert(siteSettingsTable).values({ key: "payment_settings", value })
      .onConflictDoUpdate({ target: siteSettingsTable.key, set: { value } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── GET /api/admin/integration-settings (admin only) ─────────── */
router.get("/admin/integration-settings", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId || !(await isAdmin(clerkId))) { res.status(403).json({ error: "Forbidden" }); return; }

    const row = await db
      .select()
      .from(siteSettingsTable)
      .where(eq(siteSettingsTable.key, "integration_settings"))
      .limit(1)
      .then((r) => r[0]);

    const stored = row ? (JSON.parse(row.value) as Record<string, string>) : {};

    // Merge: env vars take lowest priority; DB values override
    const metaapiToken    = stored.metaapiToken    ?? process.env.METAAPI_TOKEN    ?? "";
    const metaapiStrategy = stored.metaapiStrategy ?? process.env.METAAPI_STRATEGY_ID ?? "";

    res.json({
      metaapiToken:    metaapiToken    ? `****${metaapiToken.slice(-6)}`    : "",
      metaapiStrategy: metaapiStrategy ? metaapiStrategy : "",
      metaapiTokenSet:    metaapiToken    !== "",
      metaapiStrategySet: metaapiStrategy !== "",
    });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── PUT /api/admin/integration-settings (admin only) ─────────── */
router.put("/admin/integration-settings", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId || !(await isAdmin(clerkId))) { res.status(403).json({ error: "Forbidden" }); return; }

    const { metaapiToken, metaapiStrategy } = req.body as Record<string, string>;

    // Read existing to merge (so partial updates don't wipe other keys)
    const existing = await db
      .select()
      .from(siteSettingsTable)
      .where(eq(siteSettingsTable.key, "integration_settings"))
      .limit(1)
      .then((r) => r[0]);
    const current = existing ? (JSON.parse(existing.value) as Record<string, string>) : {};

    if (metaapiToken    !== undefined) current.metaapiToken    = metaapiToken;
    if (metaapiStrategy !== undefined) current.metaapiStrategy = metaapiStrategy;

    await db
      .insert(siteSettingsTable)
      .values({ key: "integration_settings", value: JSON.stringify(current) })
      .onConflictDoUpdate({
        target: siteSettingsTable.key,
        set: { value: JSON.stringify(current), updatedAt: new Date() },
      });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── GET /api/admin/pending-users ───────────────────────────────── */
router.get("/admin/pending-users", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId || !(await isAdmin(clerkId))) { res.status(403).json({ error: "Forbidden" }); return; }

    const users = await db
      .select({ id: usersTable.id, email: usersTable.email, displayName: usersTable.displayName, role: usersTable.role, status: usersTable.status, createdAt: usersTable.createdAt })
      .from(usersTable)
      .where(eq(usersTable.status, "pending_approval"))
      .orderBy(desc(usersTable.createdAt));

    res.json(users);
  } catch (err) {
    req.log.error({ err }, "Error listing pending users");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── POST /api/admin/users/:id/approve ─────────────────────────── */
router.post("/admin/users/:id/approve", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId || !(await isAdmin(clerkId))) { res.status(403).json({ error: "Forbidden" }); return; }

    const updated = await db
      .update(usersTable)
      .set({ status: "active", updatedAt: new Date() })
      .where(eq(usersTable.id, req.params.id))
      .returning({ id: usersTable.id, email: usersTable.email, status: usersTable.status });

    if (!updated[0]) { res.status(404).json({ error: "User not found" }); return; }
    res.json({ success: true, user: updated[0] });
  } catch (err) {
    req.log.error({ err }, "Error approving user");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── POST /api/admin/users/:id/reject ──────────────────────────── */
router.post("/admin/users/:id/reject", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId || !(await isAdmin(clerkId))) { res.status(403).json({ error: "Forbidden" }); return; }

    await db.delete(usersTable).where(eq(usersTable.id, req.params.id));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Error rejecting user");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── GET /api/admin/livekit-accounts ───────────────────────────── */
router.get("/admin/livekit-accounts", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId || !(await isAdmin(clerkId))) { res.status(403).json({ error: "Forbidden" }); return; }
    const accounts = await db
      .select({
        id: livekitAccountsTable.id,
        name: livekitAccountsTable.name,
        apiKey: livekitAccountsTable.apiKey,
        serverUrl: livekitAccountsTable.serverUrl,
        isActive: livekitAccountsTable.isActive,
        priority: livekitAccountsTable.priority,
        notes: livekitAccountsTable.notes,
        createdAt: livekitAccountsTable.createdAt,
      })
      .from(livekitAccountsTable)
      .orderBy(asc(livekitAccountsTable.priority));
    res.json(accounts);
  } catch (err) {
    req.log.error({ err }, "Error listing livekit accounts");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── POST /api/admin/livekit-accounts ──────────────────────────── */
router.post("/admin/livekit-accounts", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId || !(await isAdmin(clerkId))) { res.status(403).json({ error: "Forbidden" }); return; }
    const { name, apiKey, apiSecret, serverUrl, isActive, priority, notes } = req.body;
    if (!name || !apiKey || !apiSecret || !serverUrl) {
      res.status(400).json({ error: "name, apiKey, apiSecret, serverUrl are required" }); return;
    }
    const [created] = await db.insert(livekitAccountsTable).values({
      name, apiKey, apiSecret, serverUrl,
      isActive: isActive !== false,
      priority: priority ?? 0,
      notes: notes || null,
    }).returning({ id: livekitAccountsTable.id });
    res.json({ success: true, id: created.id });
  } catch (err) {
    req.log.error({ err }, "Error creating livekit account");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── PATCH /api/admin/livekit-accounts/:id ─────────────────────── */
router.patch("/admin/livekit-accounts/:id", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId || !(await isAdmin(clerkId))) { res.status(403).json({ error: "Forbidden" }); return; }
    const id = parseInt(req.params.id);
    const { name, apiKey, apiSecret, serverUrl, isActive, priority, notes } = req.body;
    const patch: Record<string, unknown> = {};
    if (name !== undefined) patch.name = name;
    if (apiKey !== undefined) patch.apiKey = apiKey;
    if (apiSecret !== undefined && apiSecret !== "") patch.apiSecret = apiSecret;
    if (serverUrl !== undefined) patch.serverUrl = serverUrl;
    if (isActive !== undefined) patch.isActive = isActive;
    if (priority !== undefined) patch.priority = priority;
    if (notes !== undefined) patch.notes = notes || null;
    await db.update(livekitAccountsTable).set(patch).where(eq(livekitAccountsTable.id, id));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Error updating livekit account");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── DELETE /api/admin/livekit-accounts/:id ────────────────────── */
router.delete("/admin/livekit-accounts/:id", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId || !(await isAdmin(clerkId))) { res.status(403).json({ error: "Forbidden" }); return; }
    await db.delete(livekitAccountsTable).where(eq(livekitAccountsTable.id, parseInt(req.params.id)));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Error deleting livekit account");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── POST /api/admin/livekit-accounts/:id/test ─────────────────── */
router.post("/admin/livekit-accounts/:id/test", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId || !(await isAdmin(clerkId))) { res.status(403).json({ error: "Forbidden" }); return; }
    const id = parseInt(req.params.id);
    const account = await db.select().from(livekitAccountsTable).where(eq(livekitAccountsTable.id, id)).limit(1).then(r => r[0]);
    if (!account) { res.status(404).json({ error: "Account not found" }); return; }
    try {
      const { RoomServiceClient } = await import("livekit-server-sdk");
      const svc = new RoomServiceClient(account.serverUrl, account.apiKey, account.apiSecret);
      await svc.listRooms();
      res.json({ success: true, message: "Connection successful" });
    } catch (connErr: any) {
      res.json({ success: false, message: connErr?.message ?? "Connection failed" });
    }
  } catch (err) {
    req.log.error({ err }, "Error testing livekit account");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── POST /api/admin/livekit-accounts/:id/set-priority ─────────── */
router.post("/admin/livekit-accounts/:id/set-priority", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId || !(await isAdmin(clerkId))) { res.status(403).json({ error: "Forbidden" }); return; }
    const { priority } = req.body;
    if (typeof priority !== "number") { res.status(400).json({ error: "priority required" }); return; }
    await db.update(livekitAccountsTable)
      .set({ priority })
      .where(eq(livekitAccountsTable.id, parseInt(req.params.id)));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ═══════════════════════════════════════════════════════════════════
   SUBSCRIPTION PLANS (admin sets prices)
════════════════════════════════════════════════════════════════════ */

const DEFAULT_PLANS_ADMIN = [
  { plan: "1m",  label: "1 Month",  durationMonths: 1,  priceUsdt: "49",  priceFiat: "49"  },
  { plan: "3m",  label: "3 Months", durationMonths: 3,  priceUsdt: "129", priceFiat: "129" },
  { plan: "6m",  label: "6 Months", durationMonths: 6,  priceUsdt: "229", priceFiat: "229" },
  { plan: "1y",  label: "1 Year",   durationMonths: 12, priceUsdt: "399", priceFiat: "399" },
];

router.get("/admin/subscription-plans", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId || !(await isAdmin(clerkId))) { res.status(403).json({ error: "Forbidden" }); return; }
    const rows = await db.select().from(subscriptionPlansTable);
    if (!rows.length) {
      res.json(DEFAULT_PLANS_ADMIN.map((p) => ({ ...p, enabled: true })));
      return;
    }
    res.json(rows.map((r) => ({
      plan: r.plan, label: r.label, durationMonths: r.durationMonths,
      priceUsdt: parseFloat(r.priceUsdt as string),
      priceFiat: parseFloat(r.priceFiat as string),
      enabled: r.enabled,
    })));
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/subscription-plans", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId || !(await isAdmin(clerkId))) { res.status(403).json({ error: "Forbidden" }); return; }
    const { plan, label, durationMonths, priceUsdt, priceFiat, enabled } = req.body as {
      plan: string; label: string; durationMonths: number;
      priceUsdt: number; priceFiat: number; enabled?: boolean;
    };
    if (!plan || !label || !durationMonths || priceUsdt == null) {
      res.status(400).json({ error: "plan, label, durationMonths, and priceUsdt are required" }); return;
    }
    const planKey = plan.toLowerCase().replace(/[^a-z0-9_-]/g, "");
    if (!planKey) { res.status(400).json({ error: "Invalid plan key" }); return; }
    await db.insert(subscriptionPlansTable).values({
      plan: planKey, label, durationMonths,
      priceUsdt: priceUsdt.toString(),
      priceFiat: (priceFiat ?? 0).toString(),
      enabled: enabled ?? true,
    });
    res.status(201).json({ ok: true, plan: planKey });
  } catch (err: unknown) {
    const msg = (err as { code?: string })?.code === "23505" ? "A plan with that key already exists" : "Internal server error";
    res.status(msg.startsWith("A plan") ? 409 : 500).json({ error: msg });
  }
});

router.put("/admin/subscription-plans/:plan", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId || !(await isAdmin(clerkId))) { res.status(403).json({ error: "Forbidden" }); return; }
    const { plan } = req.params;
    const { priceUsdt, priceFiat, enabled, label, durationMonths } = req.body as {
      priceUsdt: number; priceFiat: number; enabled: boolean; label?: string; durationMonths?: number;
    };

    const defaults = DEFAULT_PLANS_ADMIN.find((p) => p.plan === plan);
    await db
      .insert(subscriptionPlansTable)
      .values({
        plan,
        label: label ?? defaults?.label ?? plan,
        durationMonths: durationMonths ?? defaults?.durationMonths ?? 1,
        priceUsdt: (priceUsdt ?? parseFloat(defaults?.priceUsdt ?? "0")).toString(),
        priceFiat: (priceFiat ?? parseFloat(defaults?.priceFiat ?? "0")).toString(),
        enabled: enabled ?? true,
      })
      .onConflictDoUpdate({
        target: subscriptionPlansTable.plan,
        set: {
          priceUsdt: (priceUsdt ?? parseFloat(defaults?.priceUsdt ?? "0")).toString(),
          priceFiat: (priceFiat ?? parseFloat(defaults?.priceFiat ?? "0")).toString(),
          enabled: enabled ?? true,
          updatedAt: new Date(),
          ...(label ? { label } : {}),
          ...(durationMonths ? { durationMonths } : {}),
        },
      });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/admin/subscription-plans/:plan", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId || !(await isAdmin(clerkId))) { res.status(403).json({ error: "Forbidden" }); return; }
    const { plan } = req.params;
    await db.delete(subscriptionPlansTable).where(eq(subscriptionPlansTable.plan, plan));
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ═══════════════════════════════════════════════════════════════════
   PLATFORM SUBSCRIPTIONS (admin approves / rejects)
════════════════════════════════════════════════════════════════════ */

router.get("/admin/platform-subscriptions", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId || !(await isAdmin(clerkId))) { res.status(403).json({ error: "Forbidden" }); return; }
    const { status } = req.query as { status?: string };

    let query = db.select().from(platformSubscriptionsTable).$dynamic();
    if (status) query = query.where(eq(platformSubscriptionsTable.status, status));
    const rows = await query.orderBy(desc(platformSubscriptionsTable.createdAt)).limit(200);

    const userIds = [...new Set(rows.map((r) => r.userId))];
    const users = userIds.length
      ? await db.select({ id: usersTable.id, displayName: usersTable.displayName, email: usersTable.email })
          .from(usersTable).where(inArray(usersTable.id, userIds))
      : [];
    const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

    res.json(rows.map((r) => ({
      id: r.id, userId: r.userId,
      userEmail: userMap[r.userId]?.email ?? r.userId,
      userName: userMap[r.userId]?.displayName ?? userMap[r.userId]?.email ?? r.userId,
      plan: r.plan, status: r.status,
      priceUsdt: r.priceUsdt ? parseFloat(r.priceUsdt as string) : null,
      priceFiat: r.priceFiat ? parseFloat(r.priceFiat as string) : null,
      paymentMethod: r.paymentMethod, txHash: r.txHash,
      screenshotUrl: r.screenshotUrl, adminNote: r.adminNote,
      startDate: r.startDate, endDate: r.endDate, createdAt: r.createdAt,
    })));
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

const PLAN_MONTHS: Record<string, number> = { "1m": 1, "3m": 3, "6m": 6, "1y": 12 };

router.patch("/admin/platform-subscriptions/:id", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId || !(await isAdmin(clerkId))) { res.status(403).json({ error: "Forbidden" }); return; }
    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

    const { action, adminNote } = req.body as { action: "approve" | "reject"; adminNote?: string };
    if (!["approve","reject"].includes(action)) { res.status(400).json({ error: "action must be approve or reject" }); return; }

    const sub = await db.select().from(platformSubscriptionsTable).where(eq(platformSubscriptionsTable.id, id)).limit(1).then((r) => r[0]);
    if (!sub) { res.status(404).json({ error: "Not found" }); return; }

    if (action === "approve") {
      const months = PLAN_MONTHS[sub.plan] ?? 1;
      const startDate = new Date();
      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + months);
      await db.update(platformSubscriptionsTable).set({
        status: "active", startDate, endDate,
        adminNote: adminNote ?? null, updatedAt: new Date(),
      }).where(eq(platformSubscriptionsTable.id, id));
    } else {
      await db.update(platformSubscriptionsTable).set({
        status: "rejected", adminNote: adminNote ?? null, updatedAt: new Date(),
      }).where(eq(platformSubscriptionsTable.id, id));
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ═══════════════════════════════════════════════════════════════════
   ADMIN TRADING PANEL
════════════════════════════════════════════════════════════════════ */

/* GET /admin/trading/traders — all trader profiles */
router.get("/admin/trading/traders", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId || !(await isAdmin(clerkId))) { res.status(403).json({ error: "Forbidden" }); return; }

    const traders = await db.select().from(tradersTable).orderBy(desc(tradersTable.createdAt));
    const traderIds = traders.map((t) => t.id);

    const accounts = traderIds.length
      ? await db.select({ traderId: copyAccountsTable.traderId, status: copyAccountsTable.status, type: copyAccountsTable.type })
          .from(copyAccountsTable).where(and(inArray(copyAccountsTable.traderId, traderIds), eq(copyAccountsTable.role, "master")))
      : [];

    const copierCounts = traderIds.length
      ? await db.select({ traderId: copySubscriptionsTable.traderId, count: sql<number>`count(*)` })
          .from(copySubscriptionsTable).where(and(inArray(copySubscriptionsTable.traderId, traderIds), eq(copySubscriptionsTable.status, "active")))
          .groupBy(copySubscriptionsTable.traderId)
      : [];

    const users = traders.length
      ? await db.select({ id: usersTable.id, email: usersTable.email, displayName: usersTable.displayName })
          .from(usersTable).where(inArray(usersTable.id, traders.map((t) => t.userId)))
      : [];
    const userMap = Object.fromEntries(users.map((u) => [u.id, u]));
    const accountMap = Object.fromEntries(accounts.map((a) => [a.traderId, a]));
    const copierMap = Object.fromEntries(copierCounts.map((c) => [c.traderId, c.count]));

    res.json(traders.map((t) => ({
      id: t.id, userId: t.userId,
      displayName: t.displayName ?? userMap[t.userId]?.displayName ?? t.userId,
      email: userMap[t.userId]?.email ?? "",
      avatarUrl: t.avatarUrl,
      status: t.status, verified: t.verified,
      roi: t.roi, winRate: t.winRate, maxDrawdown: t.maxDrawdown,
      totalTrades: t.totalTrades, followers: t.followers,
      monthlyReturn: t.monthlyReturn, riskScore: t.riskScore,
      markets: t.markets, strategy: t.strategy, bio: t.bio,
      masterAccount: accountMap[t.id] ?? null,
      activeCopiers: Number(copierMap[t.id] ?? 0),
      createdAt: t.createdAt,
    })));
  } catch (err) {
    req.log.error({ err }, "admin trading traders");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* PATCH /admin/trading/traders/:id — verify / change status */
router.patch("/admin/trading/traders/:id", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId || !(await isAdmin(clerkId))) { res.status(403).json({ error: "Forbidden" }); return; }

    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

    const { verified, status } = req.body as { verified?: boolean; status?: string };
    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (verified !== undefined) update.verified = verified;
    if (status && ["active","inactive","suspended"].includes(status)) update.status = status;

    await db.update(tradersTable).set(update).where(eq(tradersTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "admin patch trader");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* POST /admin/trading/promote — create a trader profile for a user */
router.post("/admin/trading/promote", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId || !(await isAdmin(clerkId))) { res.status(403).json({ error: "Forbidden" }); return; }

    const { userId, displayName } = req.body as { userId: string; displayName: string };
    if (!userId || !displayName) { res.status(400).json({ error: "userId and displayName required" }); return; }

    const user = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1).then((r) => r[0]);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    const existing = await db.select().from(tradersTable).where(eq(tradersTable.userId, userId)).limit(1).then((r) => r[0]);
    if (existing) { res.json({ ...existing, alreadyExists: true }); return; }

    const [trader] = await db.insert(tradersTable).values({ userId, displayName }).returning();

    // Auto-create a per-trader CopyFactory strategy if MetaAPI is configured.
    // Non-fatal: if token not set yet, admin can set it later and the strategy can be
    // assigned manually via PATCH /admin/trading/traders/:id.
    try {
      const { metaapiCreateStrategy } = await import("../lib/fan-out");
      const strategyId = await metaapiCreateStrategy(displayName);
      await db.update(tradersTable).set({ metaapiStrategyId: strategyId }).where(eq(tradersTable.id, trader.id));
      trader.metaapiStrategyId = strategyId;
      req.log.info({ traderId: trader.id, strategyId }, "CopyFactory strategy created for trader");
    } catch (err) {
      req.log.warn({ err }, "MetaAPI strategy creation skipped (token not configured or API error)");
    }

    res.status(201).json(trader);
  } catch (err) {
    req.log.error({ err }, "admin promote trader");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* DELETE /admin/trading/traders/:id — remove trader profile */
router.delete("/admin/trading/traders/:id", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId || !(await isAdmin(clerkId))) { res.status(403).json({ error: "Forbidden" }); return; }
    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    await db.delete(tradersTable).where(eq(tradersTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "admin delete trader");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* GET /admin/trading/signals — recent trade signals */
router.get("/admin/trading/signals", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId || !(await isAdmin(clerkId))) { res.status(403).json({ error: "Forbidden" }); return; }

    const limit = Math.min(parseInt((req.query.limit as string) ?? "100"), 200);
    const signals = await db.select().from(tradeSignalsTable).orderBy(desc(tradeSignalsTable.createdAt)).limit(limit);

    const traderIds = [...new Set(signals.map((s) => s.traderId).filter(Boolean) as number[])];
    const traders = traderIds.length
      ? await db.select({ id: tradersTable.id, displayName: tradersTable.displayName }).from(tradersTable).where(inArray(tradersTable.id, traderIds))
      : [];
    const traderMap = Object.fromEntries(traders.map((t) => [t.id, t.displayName ?? String(t.id)]));

    const tradeCounts = signals.length
      ? await db.select({ signalId: copyTradesTable.signalId, count: sql<number>`count(*)`, executed: sql<number>`count(*) filter (where status='executed')` })
          .from(copyTradesTable).where(inArray(copyTradesTable.signalId, signals.map((s) => s.id))).groupBy(copyTradesTable.signalId)
      : [];
    const tradeCountMap = Object.fromEntries(tradeCounts.map((tc) => [tc.signalId, tc]));

    res.json(signals.map((s) => ({
      id: s.id, traderId: s.traderId,
      traderName: s.traderId ? (traderMap[s.traderId] ?? String(s.traderId)) : "—",
      symbol: s.symbol, market: s.market, action: s.action,
      orderType: s.orderType, price: s.price, quantity: s.quantity,
      stopLoss: s.stopLoss, takeProfit: s.takeProfit, leverage: s.leverage,
      notes: s.notes, status: s.status, executedAt: s.executedAt,
      totalCopies: Number(tradeCountMap[s.id]?.count ?? 0),
      executedCopies: Number(tradeCountMap[s.id]?.executed ?? 0),
      createdAt: s.createdAt,
    })));
  } catch (err) {
    req.log.error({ err }, "admin trading signals");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* GET /admin/trading/copy-subscriptions — all copier relationships */
router.get("/admin/trading/copy-subscriptions", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId || !(await isAdmin(clerkId))) { res.status(403).json({ error: "Forbidden" }); return; }

    const subs = await db.select().from(copySubscriptionsTable).orderBy(desc(copySubscriptionsTable.createdAt)).limit(200);
    const userIds = [...new Set(subs.map((s) => s.userId))];
    const traderIds = [...new Set(subs.map((s) => s.traderId))];

    const users = userIds.length
      ? await db.select({ id: usersTable.id, email: usersTable.email, displayName: usersTable.displayName })
          .from(usersTable).where(inArray(usersTable.id, userIds))
      : [];
    const traders = traderIds.length
      ? await db.select({ id: tradersTable.id, displayName: tradersTable.displayName }).from(tradersTable).where(inArray(tradersTable.id, traderIds))
      : [];

    const userMap = Object.fromEntries(users.map((u) => [u.id, u]));
    const traderMap = Object.fromEntries(traders.map((t) => [t.id, t]));

    res.json(subs.map((s) => ({
      id: s.id, userId: s.userId, traderId: s.traderId, status: s.status,
      userName: userMap[s.userId]?.displayName ?? userMap[s.userId]?.email ?? s.userId,
      userEmail: userMap[s.userId]?.email ?? "",
      traderName: traderMap[s.traderId]?.displayName ?? String(s.traderId),
      allocatedAmount: s.allocatedAmount, maxAmount: s.maxAmount,
      lotMultiplier: s.lotMultiplier, currentPnl: s.currentPnl,
      createdAt: s.createdAt,
    })));
  } catch (err) {
    req.log.error({ err }, "admin trading copy-subscriptions");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* GET /admin/trading/positions — live master positions snapshot */
router.get("/admin/trading/positions", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId || !(await isAdmin(clerkId))) { res.status(403).json({ error: "Forbidden" }); return; }

    const positions = await db.select().from(masterPositionsTable).orderBy(desc(masterPositionsTable.updatedAt));
    const traderIds = [...new Set(positions.map((p) => p.traderId))];
    const traders = traderIds.length
      ? await db.select({ id: tradersTable.id, displayName: tradersTable.displayName }).from(tradersTable).where(inArray(tradersTable.id, traderIds))
      : [];
    const traderMap = Object.fromEntries(traders.map((t) => [t.id, t.displayName ?? String(t.id)]));

    res.json(positions.map((p) => ({
      id: p.id, traderId: p.traderId,
      traderName: traderMap[p.traderId] ?? String(p.traderId),
      symbol: p.symbol, side: p.side, size: p.size,
      entryPrice: p.entryPrice, stopLoss: p.stopLoss, takeProfit: p.takeProfit,
      leverage: p.leverage, market: p.market,
      brokerPositionId: p.brokerPositionId, updatedAt: p.updatedAt,
    })));
  } catch (err) {
    req.log.error({ err }, "admin trading positions");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

