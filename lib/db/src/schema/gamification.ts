import { pgTable, text, integer, serial, timestamp, date, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/* ── XP Event Ledger (idempotent awards) ─────────────────────────── */
export const xpEventsTable = pgTable("xp_events", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  type: text("type").notNull(), // lesson_complete | quiz_pass | task_complete | course_complete
  refId: text("ref_id").notNull(), // e.g. lesson:12, quiz:3, course:5
  amount: integer("amount").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("xp_events_user_type_ref").on(t.userId, t.type, t.refId),
]);

/* ── Daily Learning Activity (for streaks) ───────────────────────── */
export const learningDaysTable = pgTable("learning_days", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  day: date("day").notNull(),
}, (t) => [
  unique("learning_days_user_day").on(t.userId, t.day),
]);

/* ── Course Prerequisites ────────────────────────────────────────── */
export const coursePrerequisitesTable = pgTable("course_prerequisites", {
  id: serial("id").primaryKey(),
  courseId: integer("course_id").notNull(),
  requiredCourseId: integer("required_course_id").notNull(),
}, (t) => [
  unique("course_prerequisites_pair").on(t.courseId, t.requiredCourseId),
]);

export type XpEvent = typeof xpEventsTable.$inferSelect;
export type LearningDay = typeof learningDaysTable.$inferSelect;

export const insertCoursePrerequisiteSchema = createInsertSchema(coursePrerequisitesTable).omit({ id: true });
export type InsertCoursePrerequisite = z.infer<typeof insertCoursePrerequisiteSchema>;
export type CoursePrerequisite = typeof coursePrerequisitesTable.$inferSelect;
