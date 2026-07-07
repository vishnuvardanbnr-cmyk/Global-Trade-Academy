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
  copyAccountId: integer("copy_account_id"),
  status: text("status").notNull().default("active"), // active | paused | stopped
  maxAmount: numeric("max_amount", { precision: 15, scale: 2 }),
  stopLoss: numeric("stop_loss", { precision: 10, scale: 2 }),
  allocatedAmount: numeric("allocated_amount", { precision: 15, scale: 2 }),
  lotMultiplier: numeric("lot_multiplier", { precision: 5, scale: 2 }).default("1.00"),
  currentPnl: numeric("current_pnl", { precision: 15, scale: 2 }).default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const copyAccountsTable = pgTable("copy_accounts", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  role: text("role").notNull().default("copier"),     // "master" | "copier"
  traderId: integer("trader_id"),                      // set when role = "master"
  type: text("type").notNull(), // "binance" | "bybit" | "mt5"
  label: text("label").notNull(),
  apiKey: text("api_key"),        // AES-256-GCM encrypted
  apiSecret: text("api_secret"),  // AES-256-GCM encrypted
  mt5Login: text("mt5_login"),
  mt5Password: text("mt5_password"), // AES-256-GCM encrypted
  mt5Server: text("mt5_server"),
  status: text("status").notNull().default("active"), // active | error | disconnected
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

// Snapshot of each master account's last-known open positions.
// The poller diffs this against live exchange data to detect changes.
export const masterPositionsTable = pgTable("master_positions", {
  id: serial("id").primaryKey(),
  masterAccountId: integer("master_account_id").notNull(), // FK → copy_accounts.id (role=master)
  traderId: integer("trader_id").notNull(),
  symbol: text("symbol").notNull(),
  side: text("side").notNull(),          // "long" | "short" | "buy" | "sell"
  entryPrice: numeric("entry_price", { precision: 20, scale: 8 }).notNull(),
  size: numeric("size", { precision: 20, scale: 8 }).notNull(),  // position size / lots
  stopLoss: numeric("stop_loss", { precision: 20, scale: 8 }),
  takeProfit: numeric("take_profit", { precision: 20, scale: 8 }),
  leverage: integer("leverage").default(1),
  brokerPositionId: text("broker_position_id"), // exchange-side identifier
  market: text("market").notNull().default("crypto"), // "crypto" | "forex"
  openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const tradeSignalsTable = pgTable("trade_signals", {
  id: serial("id").primaryKey(),
  traderId: integer("trader_id").notNull(),
  symbol: text("symbol").notNull(),
  market: text("market").notNull(), // crypto | forex
  action: text("action").notNull(), // buy | sell | close
  orderType: text("order_type").notNull().default("market"), // market | limit | stop | stop_limit
  price: numeric("price", { precision: 20, scale: 8 }),
  stopPrice: numeric("stop_price", { precision: 20, scale: 8 }), // trigger price for stop / stop_limit
  quantity: numeric("quantity", { precision: 20, scale: 8 }),
  stopLoss: numeric("stop_loss", { precision: 20, scale: 8 }),
  takeProfit: numeric("take_profit", { precision: 20, scale: 8 }),
  leverage: integer("leverage").default(1),
  notes: text("notes"),
  status: text("status").notNull().default("pending"), // pending | executed | failed
  executedAt: timestamp("executed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const copyTradesTable = pgTable("copy_trades", {
  id: serial("id").primaryKey(),
  signalId: integer("signal_id").notNull(),
  subscriptionId: integer("subscription_id").notNull(),
  userId: text("user_id").notNull(),
  copyAccountId: integer("copy_account_id").notNull(),
  status: text("status").notNull().default("pending"), // pending | executed | failed | skipped
  executedPrice: numeric("executed_price", { precision: 20, scale: 8 }),
  quantity: numeric("quantity", { precision: 20, scale: 8 }),
  pnl: numeric("pnl", { precision: 15, scale: 2 }),
  brokerOrderId: text("broker_order_id"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
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
