import { db } from "@workspace/db";
import {
  xpEventsTable,
  usersTable,
  learningDaysTable,
  lessonsTable,
  lessonProgressTable,
  enrollmentsTable,
  certificatesTable,
  coursesTable,
} from "@workspace/db";
import { eq, and, sql, inArray, desc } from "drizzle-orm";
import { randomBytes } from "crypto";

export const XP = {
  lessonComplete: 50,
  courseComplete: 200,
} as const;

/** Award XP exactly once per (user, type, refId). Returns amount actually granted (0 if already granted). */
export async function awardXp(userId: string, type: string, refId: string, amount: number): Promise<number> {
  const inserted = await db
    .insert(xpEventsTable)
    .values({ userId, type, refId, amount })
    .onConflictDoNothing()
    .returning();
  if (inserted.length === 0) return 0;
  await db.update(usersTable).set({ xp: sql`${usersTable.xp} + ${amount}` }).where(eq(usersTable.id, userId));
  return amount;
}

/** Record that the user was active today (idempotent per day). Feeds streaks. */
export async function recordLearningDay(userId: string): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  await db.insert(learningDaysTable).values({ userId, day: today }).onConflictDoNothing();
}

/** Consecutive-day streak ending today or yesterday. */
export async function computeStreak(userId: string): Promise<number> {
  const rows = await db
    .select({ day: learningDaysTable.day })
    .from(learningDaysTable)
    .where(eq(learningDaysTable.userId, userId))
    .orderBy(desc(learningDaysTable.day));
  if (rows.length === 0) return 0;

  const days = new Set(rows.map((r) => String(r.day)));
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const today = new Date();
  const cursor = new Date(today);

  // Allow the streak to be "alive" if the user studied today or yesterday.
  if (!days.has(fmt(cursor))) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    if (!days.has(fmt(cursor))) return 0;
  }

  let streak = 0;
  while (days.has(fmt(cursor))) {
    streak++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

/** Issue a certificate once per (user, course). Returns the serial. */
export async function ensureCertificate(userId: string, courseId: number): Promise<string> {
  const existing = await db
    .select()
    .from(certificatesTable)
    .where(and(eq(certificatesTable.userId, userId), eq(certificatesTable.courseId, courseId)))
    .limit(1)
    .then((r) => r[0]);
  if (existing) return existing.serial;

  const serial = `EDU-${courseId}-${randomBytes(4).toString("hex").toUpperCase()}`;
  const inserted = await db
    .insert(certificatesTable)
    .values({ userId, courseId, serial })
    .onConflictDoNothing()
    .returning();
  if (inserted.length) return inserted[0].serial;

  const again = await db
    .select()
    .from(certificatesTable)
    .where(and(eq(certificatesTable.userId, userId), eq(certificatesTable.courseId, courseId)))
    .limit(1)
    .then((r) => r[0]);
  return again?.serial ?? serial;
}

export type CompletionState = {
  completed: boolean;
  certificateSerial: string | null;
  xpAwarded: number;
};

/**
 * Recompute course completion for a user. If every lesson is done, mark the
 * enrollment completed, award completion XP (once), and issue a certificate.
 * If not all lessons are done (e.g. instructor added a lesson), re-open it.
 */
export async function syncCourseCompletion(userId: string, courseId: number): Promise<CompletionState> {
  const lessons = await db
    .select({ id: lessonsTable.id })
    .from(lessonsTable)
    .where(eq(lessonsTable.courseId, courseId));
  const total = lessons.length;
  if (total === 0) return { completed: false, certificateSerial: null, xpAwarded: 0 };

  const lessonIds = lessons.map((l) => l.id);
  const completed = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(lessonProgressTable)
    .where(
      and(
        eq(lessonProgressTable.userId, userId),
        eq(lessonProgressTable.completed, true),
        inArray(lessonProgressTable.lessonId, lessonIds),
      ),
    );
  const done = completed[0]?.count ?? 0;

  if (done < total) {
    // Re-open enrollment if it was previously completed but new lessons appeared.
    await db
      .update(enrollmentsTable)
      .set({ status: "active", completedAt: null })
      .where(
        and(
          eq(enrollmentsTable.userId, userId),
          eq(enrollmentsTable.courseId, courseId),
          eq(enrollmentsTable.status, "completed"),
        ),
      );
    return { completed: false, certificateSerial: null, xpAwarded: 0 };
  }

  await db
    .update(enrollmentsTable)
    .set({ status: "completed", completedAt: new Date() })
    .where(and(eq(enrollmentsTable.userId, userId), eq(enrollmentsTable.courseId, courseId)));

  const xpAwarded = await awardXp(userId, "course_complete", `course:${courseId}`, XP.courseComplete);
  const certificateSerial = await ensureCertificate(userId, courseId);
  return { completed: true, certificateSerial, xpAwarded };
}

/** Whether the authenticated user is the owner (instructor) of the course. */
export async function ownsCourse(userId: string, courseId: number): Promise<boolean> {
  const c = await db
    .select({ instructorId: coursesTable.instructorId })
    .from(coursesTable)
    .where(eq(coursesTable.id, courseId))
    .limit(1)
    .then((r) => r[0]);
  return !!c && c.instructorId === userId;
}

/** Whether the user has an enrollment for the course. */
export async function isEnrolled(userId: string, courseId: number): Promise<boolean> {
  const e = await db
    .select({ id: enrollmentsTable.id })
    .from(enrollmentsTable)
    .where(and(eq(enrollmentsTable.userId, userId), eq(enrollmentsTable.courseId, courseId)))
    .limit(1)
    .then((r) => r[0]);
  return !!e;
}

/**
 * Compute which lessons are unlocked for a user in a course, honoring free
 * previews and drip scheduling relative to the enrollment date.
 */
export async function getUnlockedLessonIds(
  userId: string,
  courseId: number,
  lessons: { id: number; isFree: boolean; dripDays: number }[],
): Promise<number[]> {
  const enrollment = await db
    .select({ enrolledAt: enrollmentsTable.enrolledAt })
    .from(enrollmentsTable)
    .where(and(eq(enrollmentsTable.userId, userId), eq(enrollmentsTable.courseId, courseId)))
    .limit(1)
    .then((r) => r[0]);

  const now = Date.now();
  const unlocked: number[] = [];
  for (const l of lessons) {
    if (l.isFree) {
      unlocked.push(l.id);
      continue;
    }
    if (!enrollment) continue;
    if (l.dripDays <= 0) {
      unlocked.push(l.id);
      continue;
    }
    const releaseAt = new Date(enrollment.enrolledAt).getTime() + l.dripDays * 86400000;
    if (now >= releaseAt) unlocked.push(l.id);
  }
  return unlocked;
}
