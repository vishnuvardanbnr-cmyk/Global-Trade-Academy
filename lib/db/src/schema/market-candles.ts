import { pgTable, text, integer, real, timestamp, primaryKey } from "drizzle-orm/pg-core";

export const marketCandlesTable = pgTable("market_candles", {
  symbol:    text("symbol").notNull(),
  timeframe: text("timeframe").notNull(),
  epoch:     integer("epoch").notNull(),
  open:      real("open").notNull(),
  high:      real("high").notNull(),
  low:       real("low").notNull(),
  close:     real("close").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.symbol, t.timeframe, t.epoch] })]);
