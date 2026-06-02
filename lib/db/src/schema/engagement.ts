import { pgTable, text, integer, serial, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/* ── Course Reviews / Ratings ────────────────────────────────────── */
export const reviewsTable = pgTable("reviews", {
  id: serial("id").primaryKey(),
  courseId: integer("course_id").notNull(),
  userId: text("user_id").notNull(),
  rating: integer("rating").notNull(), // 1-5
  comment: text("comment"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  unique("reviews_course_user").on(t.courseId, t.userId),
]);

/* ── Lesson Notes (timestamped) ──────────────────────────────────── */
export const notesTable = pgTable("notes", {
  id: serial("id").primaryKey(),
  lessonId: integer("lesson_id").notNull(),
  courseId: integer("course_id").notNull(),
  userId: text("user_id").notNull(),
  content: text("content").notNull(),
  timestampSeconds: integer("timestamp_seconds"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

/* ── Lesson Bookmarks ────────────────────────────────────────────── */
export const bookmarksTable = pgTable("bookmarks", {
  id: serial("id").primaryKey(),
  lessonId: integer("lesson_id").notNull(),
  courseId: integer("course_id").notNull(),
  userId: text("user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("bookmarks_lesson_user").on(t.lessonId, t.userId),
]);

/* ── Certificates ────────────────────────────────────────────────── */
export const certificatesTable = pgTable("certificates", {
  id: serial("id").primaryKey(),
  courseId: integer("course_id").notNull(),
  userId: text("user_id").notNull(),
  serial: text("serial").notNull().unique(), // public verifiable code
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("certificates_course_user").on(t.courseId, t.userId),
]);

export const insertReviewSchema = createInsertSchema(reviewsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertReview = z.infer<typeof insertReviewSchema>;
export type Review = typeof reviewsTable.$inferSelect;

export const insertNoteSchema = createInsertSchema(notesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertNote = z.infer<typeof insertNoteSchema>;
export type Note = typeof notesTable.$inferSelect;

export type Bookmark = typeof bookmarksTable.$inferSelect;
export type Certificate = typeof certificatesTable.$inferSelect;
