import { pgTable, text, integer, serial, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const lessonsTable = pgTable("lessons", {
  id: serial("id").primaryKey(),
  courseId: integer("course_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  type: text("type").notNull().default("video"), // video | text | quiz
  videoUrl: text("video_url"),
  content: text("content"),
  duration: integer("duration"), // minutes
  order: integer("order").notNull().default(0),
  isFree: boolean("is_free").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const lessonProgressTable = pgTable("lesson_progress", {
  id: serial("id").primaryKey(),
  lessonId: integer("lesson_id").notNull(),
  userId: text("user_id").notNull(),
  completed: boolean("completed").notNull().default(false),
  watchedSeconds: integer("watched_seconds"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertLessonSchema = createInsertSchema(lessonsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLesson = z.infer<typeof insertLessonSchema>;
export type Lesson = typeof lessonsTable.$inferSelect;

export const insertLessonProgressSchema = createInsertSchema(lessonProgressTable).omit({ id: true, updatedAt: true });
export type InsertLessonProgress = z.infer<typeof insertLessonProgressSchema>;
export type LessonProgress = typeof lessonProgressTable.$inferSelect;
