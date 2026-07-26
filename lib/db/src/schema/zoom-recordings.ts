import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const zoomRecordingsTable = pgTable("zoom_recordings", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  videoUrl: text("video_url").notNull(),
  thumbnailUrl: text("thumbnail_url"),
  recordedAt: timestamp("recorded_at", { withTimezone: true }),
  isPublished: boolean("is_published").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ZoomRecording = typeof zoomRecordingsTable.$inferSelect;
