import { pgTable, text, integer, serial, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const batchesTable = pgTable("batches", {
  id: serial("id").primaryKey(),
  courseId: integer("course_id").notNull(),
  instructorId: text("instructor_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  startDate: timestamp("start_date", { withTimezone: true }),
  endDate: timestamp("end_date", { withTimezone: true }),
  maxStudents: integer("max_students"),
  status: text("status").notNull().default("active"), // active | completed | draft
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const batchStudentsTable = pgTable("batch_students", {
  id: serial("id").primaryKey(),
  batchId: integer("batch_id").notNull(),
  userId: text("user_id").notNull(),
  addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique().on(t.batchId, t.userId)]);

export const insertBatchSchema = createInsertSchema(batchesTable).omit({ id: true, createdAt: true });
export type InsertBatch = z.infer<typeof insertBatchSchema>;
export type Batch = typeof batchesTable.$inferSelect;
export type BatchStudent = typeof batchStudentsTable.$inferSelect;
