import { pgTable, text, integer, serial, boolean, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const liveClassesTable = pgTable("live_classes", {
  id: serial("id").primaryKey(),
  courseId: integer("course_id"),
  title: text("title").notNull(),
  description: text("description"),
  instructorId: text("instructor_id").notNull(),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  duration: integer("duration"),
  status: text("status").notNull().default("scheduled"),
  roomName: text("room_name"),
  meetingUrl: text("meeting_url"),
  replayUrl: text("replay_url"),
  category: text("category"),
  maxAttendees: integer("max_attendees"),
  thumbnailUrl: text("thumbnail_url"),
  agenda: text("agenda"),
  batchId: integer("batch_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const liveClassRegistrationsTable = pgTable("live_class_registrations", {
  id: serial("id").primaryKey(),
  classId: integer("class_id").notNull(),
  userId: text("user_id").notNull(),
  registeredAt: timestamp("registered_at", { withTimezone: true }).notNull().defaultNow(),
});

export const liveClassMessagesTable = pgTable("live_class_messages", {
  id: serial("id").primaryKey(),
  classId: integer("class_id").notNull(),
  userId: text("user_id").notNull(),
  userName: text("user_name"),
  message: text("message").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const liveClassQuestionsTable = pgTable("live_class_questions", {
  id: serial("id").primaryKey(),
  classId: integer("class_id").notNull(),
  userId: text("user_id").notNull(),
  userName: text("user_name"),
  question: text("question").notNull(),
  isAnswered: boolean("is_answered").notNull().default(false),
  isPinned: boolean("is_pinned").notNull().default(false),
  upvoteCount: integer("upvote_count").notNull().default(0),
  answer: text("answer"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const liveClassQuestionUpvotesTable = pgTable("live_class_question_upvotes", {
  id: serial("id").primaryKey(),
  questionId: integer("question_id").notNull(),
  userId: text("user_id").notNull(),
}, (t) => [unique().on(t.questionId, t.userId)]);

export const liveClassPollsTable = pgTable("live_class_polls", {
  id: serial("id").primaryKey(),
  classId: integer("class_id").notNull(),
  question: text("question").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const liveClassPollOptionsTable = pgTable("live_class_poll_options", {
  id: serial("id").primaryKey(),
  pollId: integer("poll_id").notNull(),
  text: text("text").notNull(),
  voteCount: integer("vote_count").notNull().default(0),
});

export const liveClassPollVotesTable = pgTable("live_class_poll_votes", {
  id: serial("id").primaryKey(),
  pollId: integer("poll_id").notNull(),
  optionId: integer("option_id").notNull(),
  userId: text("user_id").notNull(),
}, (t) => [unique().on(t.pollId, t.userId)]);

export const insertLiveClassSchema = createInsertSchema(liveClassesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLiveClass = z.infer<typeof insertLiveClassSchema>;
export type LiveClass = typeof liveClassesTable.$inferSelect;
