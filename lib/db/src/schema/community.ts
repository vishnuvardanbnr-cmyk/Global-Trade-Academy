import { pgTable, text, integer, serial, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/* ─── Community Channels ─────────────────────────────────────── */
export const communityChannelsTable = pgTable("community_channels", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  emoji: text("emoji").notNull().default("💬"),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  position: integer("position").notNull().default(0),
  accessType: text("access_type").notNull().default("common"), // common | course | batch
  courseId: integer("course_id"),   // set when accessType = "course"
  batchId: integer("batch_id"),     // set when accessType = "batch"
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertChannelSchema = createInsertSchema(communityChannelsTable).omit({ id: true, createdAt: true });
export type InsertChannel = z.infer<typeof insertChannelSchema>;
export type CommunityChannel = typeof communityChannelsTable.$inferSelect;

/* ─── Posts ──────────────────────────────────────────────────── */
export const postsTable = pgTable("posts", {
  id: serial("id").primaryKey(),
  channelId: integer("channel_id"),
  authorId: text("author_id").notNull(),
  title: text("title").notNull(),
  content: text("content"),
  category: text("category").notNull().default("general"),
  imageUrl: text("image_url"),
  likes: integer("likes").notNull().default(0),
  isPinned: boolean("is_pinned").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const commentsTable = pgTable("comments", {
  id: serial("id").primaryKey(),
  postId: integer("post_id").notNull(),
  authorId: text("author_id").notNull(),
  content: text("content").notNull(),
  likes: integer("likes").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const postLikesTable = pgTable("post_likes", {
  id: serial("id").primaryKey(),
  postId: integer("post_id").notNull(),
  userId: text("user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPostSchema = createInsertSchema(postsTable).omit({ id: true, likes: true, createdAt: true, updatedAt: true });
export type InsertPost = z.infer<typeof insertPostSchema>;
export type Post = typeof postsTable.$inferSelect;

export const insertCommentSchema = createInsertSchema(commentsTable).omit({ id: true, likes: true, createdAt: true });
export type InsertComment = z.infer<typeof insertCommentSchema>;
export type Comment = typeof commentsTable.$inferSelect;
