import { pgTable, text, integer, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const lessonResourcesTable = pgTable("lesson_resources", {
  id: serial("id").primaryKey(),
  lessonId: integer("lesson_id").notNull(),
  title: text("title").notNull(),
  url: text("url").notNull(),
  type: text("type").notNull().default("link"), // pdf | slide | video | link | other
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const courseAnnouncementsTable = pgTable("course_announcements", {
  id: serial("id").primaryKey(),
  courseId: integer("course_id").notNull(),
  instructorId: text("instructor_id").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertLessonResourceSchema = createInsertSchema(lessonResourcesTable).omit({ id: true, createdAt: true });
export type InsertLessonResource = z.infer<typeof insertLessonResourceSchema>;
export type LessonResource = typeof lessonResourcesTable.$inferSelect;

export const insertCourseAnnouncementSchema = createInsertSchema(courseAnnouncementsTable).omit({ id: true, createdAt: true });
export type InsertCourseAnnouncement = z.infer<typeof insertCourseAnnouncementSchema>;
export type CourseAnnouncement = typeof courseAnnouncementsTable.$inferSelect;
