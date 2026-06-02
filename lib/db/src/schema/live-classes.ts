import { pgTable, text, integer, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const liveClassesTable = pgTable("live_classes", {
  id: serial("id").primaryKey(),
  courseId: integer("course_id"),                      // optional link to a course
  title: text("title").notNull(),
  description: text("description"),
  instructorId: text("instructor_id").notNull(),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  duration: integer("duration"), // minutes
  status: text("status").notNull().default("scheduled"), // scheduled | live | completed | cancelled
  roomName: text("room_name"),                         // Jitsi room identifier (auto-generated)
  meetingUrl: text("meeting_url"),
  replayUrl: text("replay_url"),
  category: text("category"),
  maxAttendees: integer("max_attendees"),
  thumbnailUrl: text("thumbnail_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const liveClassRegistrationsTable = pgTable("live_class_registrations", {
  id: serial("id").primaryKey(),
  classId: integer("class_id").notNull(),
  userId: text("user_id").notNull(),
  registeredAt: timestamp("registered_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertLiveClassSchema = createInsertSchema(liveClassesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLiveClass = z.infer<typeof insertLiveClassSchema>;
export type LiveClass = typeof liveClassesTable.$inferSelect;
