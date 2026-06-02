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
  quizzesTable,
  lessonGatesTable,
} from "@workspace/db";
import { eq, and, sql, inArray, desc, isNull } from "drizzle-orm";
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
  // Course completion (XP + certificate) is only granted to enrolled learners.
  if (!(await isEnrolled(userId, courseId))) {
    return { completed: false, certificateSerial: null, xpAwarded: 0 };
  }

  const lessons = await db
    .select({ id: lessonsTable.id })
    .from(lessonsTable)
    .where(eq(lessonsTable.courseId, courseId));
  const total = lessons.length;
  if (total === 0) return { completed: false, certificateSerial: null, xpAwarded: 0 };

  const lessonIds = lessons.map((l) => l.id);

  // All lessons must be marked complete.
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

  // All required gates (lessons with a linked public quiz) must be approved.
  const gatedQuizzes = await db
    .select({ lessonId: quizzesTable.lessonId })
    .from(quizzesTable)
    .where(
      and(
        inArray(quizzesTable.lessonId, lessonIds),
        isNull(quizzesTable.assignedUserId),
      ),
    );
  const gatedLessonIds = gatedQuizzes.map((q) => q.lessonId).filter(Boolean) as number[];

  if (gatedLessonIds.length > 0) {
    const approvedGates = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(lessonGatesTable)
      .where(
        and(
          eq(lessonGatesTable.userId, userId),
          inArray(lessonGatesTable.lessonId, gatedLessonIds),
          eq(lessonGatesTable.status, "approved"),
        ),
      );
    const approvedCount = approvedGates[0]?.count ?? 0;
    if (approvedCount < gatedLessonIds.length) {
      // Some required gates are not yet approved — cannot complete the course.
      return { completed: false, certificateSerial: null, xpAwarded: 0 };
    }
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
 * previews, drip scheduling, and lesson gate approvals.
 *
 * lessons must be passed in ascending order (by order column).
 * Gate rule: lessons[0] is always unlocked (drip permitting).
 *            lessons[i > 0] additionally requires that lessons[i-1]'s gate is
 *            approved when lessons[i-1] has a linked quiz (gated lesson).
 *            If lessons[i-1] has no linked quiz, no gate is required.
 *            A missing gate row for a gated lesson is treated as BLOCKED
 *            (not approved) — students cannot skip gates that haven't been
 *            created yet by bypassing the lesson completion flow.
 */
export async function getUnlockedLessonIds(
  userId: string,
  courseId: number,
  lessons: { id: number; isFree: boolean; dripDays: number }[],
): Promise<number[]> {
  if (lessons.length === 0) return [];

  const enrollment = await db
    .select({ enrolledAt: enrollmentsTable.enrolledAt })
    .from(enrollmentsTable)
    .where(and(eq(enrollmentsTable.userId, userId), eq(enrollmentsTable.courseId, courseId)))
    .limit(1)
    .then((r) => r[0]);

  const now = Date.now();

  // Step 1: Drip/free eligibility
  const dripUnlocked = new Set<number>();
  for (const l of lessons) {
    if (l.isFree) { dripUnlocked.add(l.id); continue; }
    if (!enrollment) continue;
    if (l.dripDays <= 0) { dripUnlocked.add(l.id); continue; }
    const releaseAt = new Date(enrollment.enrolledAt).getTime() + l.dripDays * 86400000;
    if (now >= releaseAt) dripUnlocked.add(l.id);
  }

  const lessonIds = lessons.map((l) => l.id);

  // Step 2: Which lessons have a linked public quiz (i.e. require a gate)?
  const gatedQuizzes = await db
    .select({ lessonId: quizzesTable.lessonId })
    .from(quizzesTable)
    .where(
      and(
        inArray(quizzesTable.lessonId, lessonIds),
        isNull(quizzesTable.assignedUserId),
      ),
    );
  const gatedLessonIds = new Set(gatedQuizzes.map((q) => q.lessonId).filter(Boolean) as number[]);

  // Step 3: Load existing gate states for this user in this course
  const gates = await db
    .select()
    .from(lessonGatesTable)
    .where(and(eq(lessonGatesTable.userId, userId), inArray(lessonGatesTable.lessonId, lessonIds)));
  const gateByLesson = new Map(gates.map((g) => [g.lessonId, g]));

  // Step 4: Apply sequential gate ordering rule
  const unlocked: number[] = [];
  for (let i = 0; i < lessons.length; i++) {
    const l = lessons[i];
    if (!dripUnlocked.has(l.id)) continue;

    if (i === 0) {
      unlocked.push(l.id);
      continue;
    }

    const prevLesson = lessons[i - 1];
    const prevIsGated = gatedLessonIds.has(prevLesson.id);

    if (!prevIsGated) {
      // Previous lesson has no linked quiz → no gate required
      unlocked.push(l.id);
    } else {
      // Previous lesson IS gated: must have an approved gate row to proceed.
      // Missing gate row (no gate created yet) counts as BLOCKED.
      const prevGate = gateByLesson.get(prevLesson.id);
      if (prevGate?.status === "approved") {
        unlocked.push(l.id);
      }
      // awaiting_quiz | pending_review | rejected | missing → blocked
    }
  }

  return unlocked;
}

/**
 * When a lesson is marked complete, create its gate entry if a default quiz
 * exists for it. Safe to call multiple times — skips if gate already exists.
 */
export async function upsertLessonGate(
  userId: string,
  courseId: number,
  lessonId: number,
): Promise<typeof lessonGatesTable.$inferSelect | null> {
  // Find the standard (non-student-specific) quiz for this lesson
  const quiz = await db
    .select({ id: quizzesTable.id })
    .from(quizzesTable)
    .where(
      and(
        eq(quizzesTable.lessonId, lessonId),
        isNull(quizzesTable.assignedUserId),
      ),
    )
    .limit(1)
    .then((r) => r[0]);

  if (!quiz) return null; // No gate quiz assigned to this lesson

  // Idempotent: only create if gate doesn't already exist
  const existing = await db
    .select()
    .from(lessonGatesTable)
    .where(and(eq(lessonGatesTable.userId, userId), eq(lessonGatesTable.lessonId, lessonId)))
    .limit(1)
    .then((r) => r[0]);

  if (existing) return existing;

  return db
    .insert(lessonGatesTable)
    .values({ userId, courseId, lessonId, requiredQuizId: quiz.id, status: "awaiting_quiz" })
    .returning()
    .then((r) => r[0]);
}

/**
 * After a student passes a quiz, advance their gate (if any) from
 * awaiting_quiz or rejected → pending_review.
 * Returns the new gate status, or null if this quiz isn't a gate quiz.
 */
export async function advanceGateOnPass(
  userId: string,
  quizId: number,
  score: number,
): Promise<string | null> {
  const gate = await db
    .select()
    .from(lessonGatesTable)
    .where(
      and(
        eq(lessonGatesTable.userId, userId),
        eq(lessonGatesTable.requiredQuizId, quizId),
      ),
    )
    .limit(1)
    .then((r) => r[0]);

  if (!gate) return null;
  if (gate.status !== "awaiting_quiz" && gate.status !== "rejected") return gate.status;

  await db
    .update(lessonGatesTable)
    .set({ status: "pending_review", score, submittedAt: new Date() })
    .where(eq(lessonGatesTable.id, gate.id));

  return "pending_review";
}
