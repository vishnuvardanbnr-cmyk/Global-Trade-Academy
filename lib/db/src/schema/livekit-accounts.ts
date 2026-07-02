import { pgTable, text, integer, serial, boolean, timestamp } from "drizzle-orm/pg-core";

export const livekitAccountsTable = pgTable("livekit_accounts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  apiKey: text("api_key").notNull(),
  apiSecret: text("api_secret").notNull(),
  serverUrl: text("server_url").notNull().default("wss://livekit.cloud"),
  isActive: boolean("is_active").notNull().default(true),
  priority: integer("priority").notNull().default(0),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type LivekitAccount = typeof livekitAccountsTable.$inferSelect;
export type InsertLivekitAccount = typeof livekitAccountsTable.$inferInsert;
