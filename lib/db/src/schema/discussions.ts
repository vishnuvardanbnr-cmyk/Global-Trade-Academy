import { pgTable, serial, integer, text, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { lessonsTable } from "./lessons";
import { usersTable } from "./users";

export const lessonQuestionsTable = pgTable(
  "lesson_questions",
  {
    id: serial("id").primaryKey(),
    lessonId: integer("lesson_id").notNull().references(() => lessonsTable.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    resolved: boolean("resolved").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("lesson_questions_lesson_idx").on(t.lessonId)],
);

export const lessonAnswersTable = pgTable(
  "lesson_answers",
  {
    id: serial("id").primaryKey(),
    questionId: integer("question_id").notNull().references(() => lessonQuestionsTable.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    isInstructor: boolean("is_instructor").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("lesson_answers_question_idx").on(t.questionId)],
);

export const insertLessonQuestionSchema = createInsertSchema(lessonQuestionsTable).omit({ id: true, resolved: true, createdAt: true });
export const insertLessonAnswerSchema = createInsertSchema(lessonAnswersTable).omit({ id: true, isInstructor: true, createdAt: true });
