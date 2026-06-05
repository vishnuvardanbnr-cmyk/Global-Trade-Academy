import { Router } from "express";
import { getAuth } from "../lib/auth";
import { db } from "@workspace/db";
import {
  lessonResourcesTable,
  courseAnnouncementsTable,
  lessonsTable,
  coursesTable,
  enrollmentsTable,
  usersTable,
} from "@workspace/db";
import { eq, and, asc, desc } from "drizzle-orm";
import { isEnrolled, ownsCourse } from "../lib/lms";
import { sendBulkEmails } from "../lib/mailer";
import { courseAnnouncementEmail } from "../lib/email-templates";

const router = Router();

async function getUserRole(userId: string): Promise<string | null> {
  const row = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  return row[0]?.role ?? null;
}

/* ─── Lesson Resources ────────────────────────────────────────────── */

// GET /api/lessons/:lessonId/resources
router.get("/lessons/:lessonId/resources", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const lessonId = parseInt(req.params.lessonId);
  if (isNaN(lessonId)) { res.status(400).json({ error: "Invalid lessonId" }); return; }

  const lesson = await db.select().from(lessonsTable).where(eq(lessonsTable.id, lessonId)).limit(1);
  if (!lesson.length) { res.status(404).json({ error: "Lesson not found" }); return; }

  const courseId = lesson[0].courseId;
  const [enrolled, owns] = await Promise.all([
    isEnrolled(userId, courseId),
    ownsCourse(userId, courseId),
  ]);
  if (!enrolled && !owns) { res.status(403).json({ error: "Not enrolled" }); return; }

  const resources = await db
    .select()
    .from(lessonResourcesTable)
    .where(eq(lessonResourcesTable.lessonId, lessonId))
    .orderBy(asc(lessonResourcesTable.createdAt));

  res.json(resources);
});

// POST /api/lessons/:lessonId/resources
router.post("/lessons/:lessonId/resources", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const lessonId = parseInt(req.params.lessonId);
  if (isNaN(lessonId)) { res.status(400).json({ error: "Invalid lessonId" }); return; }

  const lesson = await db.select().from(lessonsTable).where(eq(lessonsTable.id, lessonId)).limit(1);
  if (!lesson.length) { res.status(404).json({ error: "Lesson not found" }); return; }

  const courseId = lesson[0].courseId;
  const [owns, role] = await Promise.all([ownsCourse(userId, courseId), getUserRole(userId)]);
  if (!owns && role !== "admin") { res.status(403).json({ error: "Not authorized" }); return; }

  const { title, url, type = "link" } = req.body ?? {};
  if (!title?.trim() || !url?.trim()) { res.status(400).json({ error: "title and url are required" }); return; }

  const [resource] = await db
    .insert(lessonResourcesTable)
    .values({ lessonId, title: title.trim(), url: url.trim(), type })
    .returning();

  res.status(201).json(resource);
});

// DELETE /api/lessons/:lessonId/resources/:resourceId
router.delete("/lessons/:lessonId/resources/:resourceId", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const lessonId = parseInt(req.params.lessonId);
  const resourceId = parseInt(req.params.resourceId);

  const lesson = await db.select().from(lessonsTable).where(eq(lessonsTable.id, lessonId)).limit(1);
  if (!lesson.length) { res.status(404).json({ error: "Lesson not found" }); return; }

  const courseId = lesson[0].courseId;
  const [owns, role] = await Promise.all([ownsCourse(userId, courseId), getUserRole(userId)]);
  if (!owns && role !== "admin") { res.status(403).json({ error: "Not authorized" }); return; }

  await db.delete(lessonResourcesTable).where(
    and(eq(lessonResourcesTable.id, resourceId), eq(lessonResourcesTable.lessonId, lessonId))
  );
  res.json({ ok: true });
});

/* ─── Course Announcements ────────────────────────────────────────── */

// GET /api/courses/:courseId/announcements
router.get("/courses/:courseId/announcements", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const courseId = parseInt(req.params.courseId);
  if (isNaN(courseId)) { res.status(400).json({ error: "Invalid courseId" }); return; }

  const [enrolled, owns] = await Promise.all([
    isEnrolled(userId, courseId),
    ownsCourse(userId, courseId),
  ]);
  if (!enrolled && !owns) { res.status(403).json({ error: "Not enrolled" }); return; }

  const rows = await db
    .select({
      id: courseAnnouncementsTable.id,
      courseId: courseAnnouncementsTable.courseId,
      instructorId: courseAnnouncementsTable.instructorId,
      title: courseAnnouncementsTable.title,
      content: courseAnnouncementsTable.content,
      createdAt: courseAnnouncementsTable.createdAt,
      instructorName: usersTable.displayName,
    })
    .from(courseAnnouncementsTable)
    .leftJoin(usersTable, eq(courseAnnouncementsTable.instructorId, usersTable.id))
    .where(eq(courseAnnouncementsTable.courseId, courseId))
    .orderBy(desc(courseAnnouncementsTable.createdAt));

  res.json(rows);
});

// POST /api/courses/:courseId/announcements
router.post("/courses/:courseId/announcements", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const courseId = parseInt(req.params.courseId);
  if (isNaN(courseId)) { res.status(400).json({ error: "Invalid courseId" }); return; }

  const [owns, role] = await Promise.all([ownsCourse(userId, courseId), getUserRole(userId)]);
  if (!owns && role !== "admin") { res.status(403).json({ error: "Not authorized" }); return; }

  const { title, content } = req.body ?? {};
  if (!title?.trim() || !content?.trim()) { res.status(400).json({ error: "title and content are required" }); return; }

  const [announcement] = await db
    .insert(courseAnnouncementsTable)
    .values({ courseId, instructorId: userId, title: title.trim(), content: content.trim() })
    .returning();

  // Fire-and-forget email to all enrolled students
  const [course, instructor, enrolled] = await Promise.all([
    db.select({ title: coursesTable.title }).from(coursesTable).where(eq(coursesTable.id, courseId)).limit(1),
    db.select({ displayName: usersTable.displayName }).from(usersTable).where(eq(usersTable.id, userId)).limit(1),
    db.select({ email: usersTable.email, displayName: usersTable.displayName })
      .from(enrollmentsTable)
      .innerJoin(usersTable, eq(enrollmentsTable.userId, usersTable.id))
      .where(and(eq(enrollmentsTable.courseId, courseId), eq(enrollmentsTable.status, "active"))),
  ]);

  const courseTitle = course[0]?.title ?? "Course";
  const instructorName = instructor[0]?.displayName ?? "Instructor";

  sendBulkEmails(
    enrolled.map((e) => ({ email: e.email, name: e.displayName })),
    `[${courseTitle}] ${title.trim()}`,
    (name) => courseAnnouncementEmail({
      recipientName: name,
      courseTitle,
      announcementTitle: title.trim(),
      announcementContent: content.trim(),
      instructorName,
    }),
  ).catch(() => {});

  const [withName] = await db
    .select({
      id: courseAnnouncementsTable.id,
      courseId: courseAnnouncementsTable.courseId,
      instructorId: courseAnnouncementsTable.instructorId,
      title: courseAnnouncementsTable.title,
      content: courseAnnouncementsTable.content,
      createdAt: courseAnnouncementsTable.createdAt,
      instructorName: usersTable.displayName,
    })
    .from(courseAnnouncementsTable)
    .leftJoin(usersTable, eq(courseAnnouncementsTable.instructorId, usersTable.id))
    .where(eq(courseAnnouncementsTable.id, announcement.id));

  res.status(201).json(withName);
});

// DELETE /api/courses/:courseId/announcements/:announcementId
router.delete("/courses/:courseId/announcements/:announcementId", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const courseId = parseInt(req.params.courseId);
  const announcementId = parseInt(req.params.announcementId);

  const [owns, role] = await Promise.all([ownsCourse(userId, courseId), getUserRole(userId)]);
  if (!owns && role !== "admin") { res.status(403).json({ error: "Not authorized" }); return; }

  await db.delete(courseAnnouncementsTable).where(
    and(eq(courseAnnouncementsTable.id, announcementId), eq(courseAnnouncementsTable.courseId, courseId))
  );
  res.json({ ok: true });
});

export default router;
