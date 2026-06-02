import { pgTable, text, integer, serial, boolean, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const coursesTable = pgTable("courses", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  instructorId: text("instructor_id").notNull(),
  category: text("category").notNull(), // forex | crypto | futures | options | stocks
  level: text("level").notNull(), // beginner | intermediate | advanced
  status: text("status").notNull().default("draft"), // draft | published | archived
  thumbnailUrl: text("thumbnail_url"),
  price: numeric("price", { precision: 10, scale: 2 }),
  duration: integer("duration"), // total minutes
  isFeatured: boolean("is_featured").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCourseSchema = createInsertSchema(coursesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCourse = z.infer<typeof insertCourseSchema>;
export type Course = typeof coursesTable.$inferSelect;
