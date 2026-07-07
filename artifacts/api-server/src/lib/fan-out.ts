/**
 * fanOutSignal — shared fan-out logic used by both the manual signal route
 * and the mirror poller. Extracted here to avoid circular imports.
 */

import { createHmac } from "crypto";
import { db } from "@workspace/db";
import {
  copySubscriptionsTable,
  copyAccountsTable,
  tradeSignalsTable,
  copyTradesTable,
} from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { decrypt } from "./encrypt";
import { logger } from "./logger";

/* ── Helpers ───────────────────────────────────────────────────── */

/** Shared fetch with a hard 10-second timeout so a hung exchange never stalls fan-out */
async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Map our order type to Binance futures type string + required extra params */
function binanceOrderParams(
  signal: typeof tradeSignalsTable.$inferSelect,
): Record<string, string> {
  const ot = signal.orderType ?? "market";
  const price   = signal.price      ? parseFloat(signal.price      as string).toString() : "";
  const stopPx  = signal.stopPrice  ? parseFloat(signal.stopPrice  as string).toString() : "";

  switch (ot) {
    case "limit":
      return { type: "LIMIT", timeInForce: "GTC", price };
    case "stop":
      return { type: "STOP_MARKET", stopPrice: stopPx };
    case "stop_limit":
      return { type: "STOP", stopPrice: stopPx, price, timeInForce: "GTC" };
    default:
      return { type: "MARKET" };
  }
}

/**
 * Map our order type to Bybit orderType + triggerPrice.
 * triggerDirection: "1" = trigger when price rises to level (buy breakout)
 *                   "2" = trigger when price falls to level (sell stop)
 * Derived from the signal side so sell-stops actually trigger.
 */
function bybitOrderParams(
  signal: typeof tradeSignalsTable.$inferSelect,
): Record<string, string | undefined> {
  const ot = signal.orderType ?? "market";
  const price   = signal.price      ? parseFloat(signal.price      as string).toString() : undefined;
  const stopPx  = signal.stopPrice  ? parseFloat(signal.stopPrice  as string).toString() : undefined;
  // buy action = expecting price to rise  → triggerDirection "1"
  // sell action = expecting price to fall → triggerDirection "2"
  const triggerDir = signal.action === "sell" ? "2" : "1";

  switch (ot) {
    case "limit":
      return { orderType: "Limit", price };
    case "stop":
      return { orderType: "Market", triggerPrice: stopPx, triggerDirection: triggerDir, orderFilter: "StopOrder" };
    case "stop_limit":
      return { orderType: "Limit", price, triggerPrice: stopPx, triggerDirection: triggerDir, orderFilter: "StopOrder" };
    default:
      return { orderType: "Market" };
  }
}

/**
 * Determine which side to use for a CLOSE signal.
 * Checks notes for "long"/"short", then falls back to a safe default.
 * Pass an explicit "close long" or "close short" in notes to guarantee correctness.
 */
function closeSide(signal: typeof tradeSignalsTable.$inferSelect, broker: "binance" | "bybit"): string {
  const notes = (signal.notes ?? "").toLowerCase();
  const isLong = notes.includes("long") || (!notes.includes("short") && false);
  // Notes must contain "long" or "short" explicitly; otherwise we cannot know — throw so the error
  // surfaces in copy_trades.error_message rather than silently trading the wrong side.
  if (!notes.includes("long") && !notes.includes("short")) {
    throw new Error(
      `CLOSE signal #${signal.id}: cannot determine position side. ` +
      `Add 'long' or 'short' to the signal notes (e.g. "close long").`,
    );
  }
  if (broker === "binance") return isLong ? "SELL" : "BUY";
  return isLong ? "Sell" : "Buy";
}

/* ── Binance order ─────────────────────────────────────────────── */
async function executeBinance(
  apiKey: string,
  apiSecret: string,
  signal: typeof tradeSignalsTable.$inferSelect,
  lotMultiplier: number,
): Promise<string> {
  if (signal.action === "modify") return "modify-noop";

  const isClose = signal.action === "close";
  const side = isClose ? closeSide(signal, "binance") : signal.action === "buy" ? "BUY" : "SELL";

  const qty = (parseFloat(signal.quantity as string) * lotMultiplier).toFixed(6);
  const extraParams = binanceOrderParams(signal);

  // Stop order types require the futures endpoint; close always uses futures (reduceOnly)
  const isFutures = isClose || ["stop", "stop_limit"].includes(signal.orderType ?? "market");
  const baseUrl = isFutures
    ? "https://fapi.binance.com/fapi/v1/order"
    : "https://api.binance.com/api/v3/order";

  const params = new URLSearchParams({
    symbol: signal.symbol.toUpperCase(),
    side,
    quantity: qty,
    timestamp: Date.now().toString(),
    ...extraParams,
    ...(isClose ? { reduceOnly: "true" } : {}),
  });
  const hmac = createHmac("sha256", apiSecret).update(params.toString()).digest("hex");
  params.append("signature", hmac);

  const res = await fetchWithTimeout(`${baseUrl}?${params.toString()}`, {
    method: "POST",
    headers: { "X-MBX-APIKEY": apiKey },
  });
  const json = await res.json() as { orderId?: number; msg?: string };
  if (!res.ok) throw new Error(json.msg ?? "Binance error");
  return String(json.orderId);
}

/* ── Bybit order ───────────────────────────────────────────────── */
async function executeBybit(
  apiKey: string,
  apiSecret: string,
  signal: typeof tradeSignalsTable.$inferSelect,
  lotMultiplier: number,
): Promise<string> {
  if (signal.action === "modify") return "modify-noop";

  const timestamp = Date.now().toString();
  const qty = (parseFloat(signal.quantity as string) * lotMultiplier).toFixed(6);
  const isClose = signal.action === "close";
  const side = isClose ? closeSide(signal, "bybit") : signal.action === "buy" ? "Buy" : "Sell";

  const extra = bybitOrderParams(signal);
  const cleanExtra = Object.fromEntries(Object.entries(extra).filter(([, v]) => v !== undefined));

  const body = JSON.stringify({
    category: "linear",
    symbol: signal.symbol.toUpperCase(),
    side,
    qty,
    ...(isClose ? { reduceOnly: true } : {}),
    ...cleanExtra,
  });
  const toSign = `${timestamp}${apiKey}5000${body}`;
  const signature = createHmac("sha256", apiSecret).update(toSign).digest("hex");

  const res = await fetchWithTimeout("https://api.bybit.com/v5/order/create", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-BAPI-API-KEY": apiKey,
      "X-BAPI-TIMESTAMP": timestamp,
      "X-BAPI-SIGN": signature,
      "X-BAPI-RECV-WINDOW": "5000",
    },
    body,
  });
  const json = await res.json() as { result?: { orderId?: string }; retMsg?: string; retCode?: number };
  if (json.retCode !== 0) throw new Error(json.retMsg ?? "Bybit error");
  return json.result?.orderId ?? "unknown";
}

/* ── MT5 bridge order ──────────────────────────────────────────── */
async function executeMt5(
  login: string,
  password: string,
  server: string,
  signal: typeof tradeSignalsTable.$inferSelect,
  lotMultiplier: number,
): Promise<string> {
  const bridgeUrl = process.env.MT5_BRIDGE_URL;
  if (!bridgeUrl) throw new Error("MT5_BRIDGE_URL not configured");

  const res = await fetchWithTimeout(`${bridgeUrl}/signal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      login, password, server,
      symbol: signal.symbol,
      action: signal.action,
      orderType: signal.orderType ?? "market",
      volume: parseFloat(signal.quantity as string) * lotMultiplier,
      price: signal.price      ? parseFloat(signal.price      as string) : 0,
      stopPrice: signal.stopPrice ? parseFloat(signal.stopPrice as string) : 0,
      sl: signal.stopLoss   ? parseFloat(signal.stopLoss   as string) : 0,
      tp: signal.takeProfit ? parseFloat(signal.takeProfit as string) : 0,
      leverage: signal.leverage ?? 1,
    }),
  });
  const json = await res.json() as { orderId?: string; error?: string };
  if (!res.ok) throw new Error(json.error ?? "MT5 bridge error");
  return json.orderId ?? "unknown";
}

/* ══════════════════════════════════════════════════════════════════
   FAN-OUT
══════════════════════════════════════════════════════════════════ */

export async function fanOutSignal(signal: typeof tradeSignalsTable.$inferSelect) {
  const subs = await db
    .select()
    .from(copySubscriptionsTable)
    .where(
      and(
        eq(copySubscriptionsTable.traderId, signal.traderId),
        eq(copySubscriptionsTable.status, "active"),
      ),
    );

  const activeSubs = subs.filter((s) => s.copyAccountId != null);
  if (activeSubs.length === 0) {
    await db
      .update(tradeSignalsTable)
      .set({ status: "executed", executedAt: new Date() })
      .where(eq(tradeSignalsTable.id, signal.id));
    return;
  }

  const accountIds = activeSubs.map((s) => s.copyAccountId!);
  const accounts = await db
    .select()
    .from(copyAccountsTable)
    .where(inArray(copyAccountsTable.id, accountIds));
  const accountMap = Object.fromEntries(accounts.map((a) => [a.id, a]));

  let successCount = 0;
  let failCount = 0;

  await Promise.allSettled(
    activeSubs.map(async (sub) => {
      const account = accountMap[sub.copyAccountId!];
      if (!account) return;
      if (account.role === "master") return;

      const multiplier = parseFloat((sub.lotMultiplier ?? "1") as string);

      const [trade] = await db
        .insert(copyTradesTable)
        .values({
          signalId: signal.id,
          subscriptionId: sub.id,
          userId: sub.userId,
          copyAccountId: account.id,
          status: "pending",
          quantity: (parseFloat(signal.quantity as string) * multiplier).toFixed(6),
        })
        .returning();

      try {
        let brokerOrderId = "";

        if (account.type === "binance") {
          brokerOrderId = await executeBinance(
            decrypt(account.apiKey!),
            decrypt(account.apiSecret!),
            signal,
            multiplier,
          );
        } else if (account.type === "bybit") {
          brokerOrderId = await executeBybit(
            decrypt(account.apiKey!),
            decrypt(account.apiSecret!),
            signal,
            multiplier,
          );
        } else if (account.type === "mt5") {
          brokerOrderId = await executeMt5(
            account.mt5Login!,
            decrypt(account.mt5Password!),
            account.mt5Server!,
            signal,
            multiplier,
          );
        }

        await db
          .update(copyTradesTable)
          .set({ status: "executed", brokerOrderId, executedPrice: signal.price ?? null })
          .where(eq(copyTradesTable.id, trade.id));
        await db
          .update(copyAccountsTable)
          .set({ status: "active", lastError: null })
          .where(eq(copyAccountsTable.id, account.id));

        successCount++;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        logger.error({ err: msg, accountId: account.id }, "fan-out execution error");
        await db
          .update(copyTradesTable)
          .set({ status: "failed", errorMessage: msg })
          .where(eq(copyTradesTable.id, trade.id));
        await db
          .update(copyAccountsTable)
          .set({ status: "error", lastError: msg })
          .where(eq(copyAccountsTable.id, account.id));

        failCount++;
      }
    }),
  );

  // Mark signal executed if at least one copier succeeded; failed if all failed
  const finalStatus = successCount > 0 ? "executed" : failCount > 0 ? "failed" : "executed";
  await db
    .update(tradeSignalsTable)
    .set({ status: finalStatus, executedAt: new Date() })
    .where(eq(tradeSignalsTable.id, signal.id));

  logger.info(
    { signalId: signal.id, successCount, failCount },
    `fan-out complete: ${successCount} succeeded, ${failCount} failed`,
  );
}
