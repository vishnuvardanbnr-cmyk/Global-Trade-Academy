import { Router } from "express";
import { getAuth } from "../lib/auth";
import { db } from "@workspace/db";
import {
  usersTable,
  enrollmentsTable,
  liveClassesTable,
  liveClassRegistrationsTable,
  copySubscriptionsTable,
  watchlistTable,
  activityTable,
  coursesTable,
  lessonProgressTable,
} from "@workspace/db";
import { eq, and, gt, gte, desc, sql, inArray } from "drizzle-orm";
import { computeStreak } from "../lib/lms";

const router = Router();

// GET /api/dashboard/summary
router.get("/dashboard/summary", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const now = new Date();
    const [enrolled, completed, upcoming, copySubs, watchlist, user] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(enrollmentsTable).where(eq(enrollmentsTable.userId, clerkId)),
      db.select({ count: sql<number>`count(*)::int` }).from(enrollmentsTable).where(and(eq(enrollmentsTable.userId, clerkId), eq(enrollmentsTable.status, "completed"))),
      db.select({ count: sql<number>`count(*)::int` }).from(liveClassRegistrationsTable).innerJoin(liveClassesTable, eq(liveClassesTable.id, liveClassRegistrationsTable.classId)).where(and(eq(liveClassRegistrationsTable.userId, clerkId), gte(liveClassesTable.scheduledAt, now))),
      db.select({ count: sql<number>`count(*)::int` }).from(copySubscriptionsTable).where(and(eq(copySubscriptionsTable.userId, clerkId), eq(copySubscriptionsTable.status, "active"))),
      db.select({ count: sql<number>`count(*)::int` }).from(watchlistTable).where(eq(watchlistTable.userId, clerkId)),
      db.select({ xp: usersTable.xp }).from(usersTable).where(eq(usersTable.id, clerkId)).limit(1),
    ]);

    const learningStreak = await computeStreak(clerkId);

    res.json({
      enrolledCourses: enrolled[0]?.count ?? 0,
      completedCourses: completed[0]?.count ?? 0,
      totalXp: user[0]?.xp ?? 0,
      upcomingClasses: upcoming[0]?.count ?? 0,
      copySubscriptions: copySubs[0]?.count ?? 0,
      watchlistCount: watchlist[0]?.count ?? 0,
      totalPnl: null,
      learningStreak,
    });
  } catch (err) {
    req.log.error({ err }, "Error getting dashboard summary");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/dashboard/leaderboard
router.get("/dashboard/leaderboard", async (req, res): Promise<void> => {
  try {
    const users = await db
      .select()
      .from(usersTable)
      .where(and(eq(usersTable.role, "student"), gt(usersTable.xp, 0)))
      .orderBy(desc(usersTable.xp))
      .limit(20);

    const userIds = users.map((u) => u.id);
    const completedRows = userIds.length
      ? await db
          .select({ userId: enrollmentsTable.userId, count: sql<number>`count(*)::int` })
          .from(enrollmentsTable)
          .where(and(eq(enrollmentsTable.status, "completed"), inArray(enrollmentsTable.userId, userIds)))
          .groupBy(enrollmentsTable.userId)
      : [];
    const completedMap = new Map(completedRows.map((r) => [r.userId, r.count]));

    res.json(
      users.map((u, idx) => ({
        rank: idx + 1,
        userId: u.id,
        displayName: u.displayName ?? u.email,
        avatarUrl: u.avatarUrl,
        xp: u.xp,
        completedCourses: completedMap.get(u.id) ?? 0,
        badges: u.badges,
      }))
    );
  } catch (err) {
    req.log.error({ err }, "Error getting leaderboard");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/dashboard/activity
router.get("/dashboard/activity", async (req, res): Promise<void> => {
  try {
    const activities = await db
      .select()
      .from(activityTable)
      .orderBy(desc(activityTable.createdAt))
      .limit(30);

    res.json(
      activities.map((a) => ({
        id: a.id,
        type: a.type,
        userId: a.userId,
        userName: null,
        description: a.description,
        metadata: a.metadata,
        createdAt: a.createdAt,
      }))
    );
  } catch (err) {
    req.log.error({ err }, "Error getting activity");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/dashboard/admin
router.get("/dashboard/admin", async (req, res): Promise<void> => {
  try {
    const [totalUsers, totalCourses, totalEnrollments, upcomingClasses] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(usersTable),
      db.select({ count: sql<number>`count(*)::int` }).from(coursesTable),
      db.select({ count: sql<number>`count(*)::int` }).from(enrollmentsTable),
      db.select({ count: sql<number>`count(*)::int` }).from(liveClassesTable).where(eq(liveClassesTable.status, "scheduled")),
    ]);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const newToday = await db.select({ count: sql<number>`count(*)::int` }).from(usersTable).where(gte(usersTable.createdAt, today));

    // Revenue = sum of course price across all enrollments.
    const revenueResult = await db
      .select({ total: sql<number>`coalesce(sum(${coursesTable.price}), 0)::float` })
      .from(enrollmentsTable)
      .innerJoin(coursesTable, eq(coursesTable.id, enrollmentsTable.courseId));

    res.json({
      totalUsers: totalUsers[0]?.count ?? 0,
      totalCourses: totalCourses[0]?.count ?? 0,
      totalEnrollments: totalEnrollments[0]?.count ?? 0,
      activeUsers: totalUsers[0]?.count ?? 0,
      revenue: revenueResult[0]?.total ?? 0,
      newUsersToday: newToday[0]?.count ?? 0,
      pendingInstructors: 0,
      upcomingClasses: upcomingClasses[0]?.count ?? 0,
    });
  } catch (err) {
    req.log.error({ err }, "Error getting admin stats");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
