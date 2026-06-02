import { pgTable, text, integer, serial, boolean, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tradersTable = pgTable("traders", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().unique(),
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),
  bio: text("bio"),
  roi: numeric("roi", { precision: 10, scale: 2 }).notNull().default("0"),
  winRate: numeric("win_rate", { precision: 5, scale: 2 }).notNull().default("0"),
  maxDrawdown: numeric("max_drawdown", { precision: 10, scale: 2 }).notNull().default("0"),
  totalTrades: integer("total_trades").notNull().default(0),
  followers: integer("followers").notNull().default(0),
  status: text("status").notNull().default("active"), // active | inactive | suspended
  verified: boolean("verified").notNull().default(false),
  markets: text("markets").array().notNull().default([]),
  strategy: text("strategy"),
  monthlyReturn: numeric("monthly_return", { precision: 10, scale: 2 }),
  riskScore: integer("risk_score"), // 1-10
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const copySubscriptionsTable = pgTable("copy_subscriptions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  traderId: integer("trader_id").notNull(),
  status: text("status").notNull().default("active"), // active | paused | stopped
  maxAmount: numeric("max_amount", { precision: 15, scale: 2 }),
  stopLoss: numeric("stop_loss", { precision: 10, scale: 2 }),
  allocatedAmount: numeric("allocated_amount", { precision: 15, scale: 2 }),
  currentPnl: numeric("current_pnl", { precision: 15, scale: 2 }).default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const watchlistTable = pgTable("watchlist", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  symbol: text("symbol").notNull(),
  market: text("market").notNull(), // forex | crypto | stock | commodity
  displayName: text("display_name"),
  alertPrice: numeric("alert_price", { precision: 20, scale: 8 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const activityTable = pgTable("activity", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(), // enrollment | lesson_complete | live_class | post | copy_trade | achievement
  userId: text("user_id"),
  description: text("description").notNull(),
  metadata: text("metadata"), // JSON string
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTraderSchema = createInsertSchema(tradersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTrader = z.infer<typeof insertTraderSchema>;
export type Trader = typeof tradersTable.$inferSelect;

export const insertCopySubscriptionSchema = createInsertSchema(copySubscriptionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCopySubscription = z.infer<typeof insertCopySubscriptionSchema>;
export type CopySubscription = typeof copySubscriptionsTable.$inferSelect;

export const insertWatchlistSchema = createInsertSchema(watchlistTable).omit({ id: true, createdAt: true });
export type InsertWatchlist = z.infer<typeof insertWatchlistSchema>;
export type WatchlistItem = typeof watchlistTable.$inferSelect;
