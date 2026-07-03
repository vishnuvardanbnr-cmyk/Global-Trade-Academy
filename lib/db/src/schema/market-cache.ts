import { pgTable, text, jsonb, timestamp } from "drizzle-orm/pg-core";

export const marketCacheTable = pgTable("market_cache", {
  key:       text("key").primaryKey(),
  data:      jsonb("data").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
});
