import { pgTable, text, integer, serial, boolean, timestamp, jsonb, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/* ── Quizzes ─────────────────────────────────────────────────────── */
export const quizzesTable = pgTable("quizzes", {
  id: serial("id").primaryKey(),
  courseId: integer("course_id").notNull(),
  lessonId: integer("lesson_id"), // null = course/chapter-level quiz
  assignedUserId: text("assigned_user_id"), // null = standard; set = per-student replacement quiz on rejection
  title: text("title").notNull(),
  description: text("description"),
  passingScore: integer("passing_score").notNull().default(70), // percent
  xpReward: integer("xp_reward").notNull().default(100),
  order: integer("order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const quizQuestionsTable = pgTable("quiz_questions", {
  id: serial("id").primaryKey(),
  quizId: integer("quiz_id").notNull(),
  question: text("question").notNull(),
  options: text("options").array().notNull(),
  correctIndex: integer("correct_index").notNull(),
  explanation: text("explanation"),
  order: integer("order").notNull().default(0),
});

export const quizAttemptsTable = pgTable("quiz_attempts", {
  id: serial("id").primaryKey(),
  quizId: integer("quiz_id").notNull(),
  userId: text("user_id").notNull(),
  score: integer("score").notNull(), // percent
  passed: boolean("passed").notNull().default(false),
  answers: jsonb("answers").notNull(), // number[]
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ── Lesson Gate ─────────────────────────────────────────────────── */
// One row per (userId, lessonId). Tracks approval state for lesson progression.
// Status machine: awaiting_quiz → pending_review → approved | rejected → pending_review (retry) → approved
export const lessonGatesTable = pgTable("lesson_gates", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  courseId: integer("course_id").notNull(),
  lessonId: integer("lesson_id").notNull(),
  requiredQuizId: integer("required_quiz_id").notNull(),
  status: text("status").notNull().default("awaiting_quiz"),
  // awaiting_quiz | pending_review | approved | rejected
  score: integer("score"), // passing score that triggered pending_review
  reviewNote: text("review_note"),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  unique("lesson_gates_user_lesson").on(t.userId, t.lessonId),
]);

/* ── Practical Tasks / Assignments ───────────────────────────────── */
export const tasksTable = pgTable("tasks", {
  id: serial("id").primaryKey(),
  courseId: integer("course_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  xpReward: integer("xp_reward").notNull().default(50),
  order: integer("order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const taskCompletionsTable = pgTable("task_completions", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").notNull(),
  userId: text("user_id").notNull(),
  submission: text("submission"),
  fileUrl: text("file_url"),
  fileName: text("file_name"),
  // status: pending_review | approved | rejected
  status: text("status").notNull().default("pending_review"),
  reviewNote: text("review_note"),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("task_completions_task_user").on(t.taskId, t.userId),
]);

export const insertQuizSchema = createInsertSchema(quizzesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertQuiz = z.infer<typeof insertQuizSchema>;
export type Quiz = typeof quizzesTable.$inferSelect;

export const insertQuizQuestionSchema = createInsertSchema(quizQuestionsTable).omit({ id: true });
export type InsertQuizQuestion = z.infer<typeof insertQuizQuestionSchema>;
export type QuizQuestion = typeof quizQuestionsTable.$inferSelect;

export type QuizAttempt = typeof quizAttemptsTable.$inferSelect;

export type LessonGate = typeof lessonGatesTable.$inferSelect;

export const insertTaskSchema = createInsertSchema(tasksTable).omit({ id: true, createdAt: true });
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasksTable.$inferSelect;

export type TaskCompletion = typeof taskCompletionsTable.$inferSelect;
