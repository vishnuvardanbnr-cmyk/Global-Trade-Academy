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

/* ── Binance market order ─────────────────────────────────────── */
async function executeBinance(
  apiKey: string,
  apiSecret: string,
  signal: typeof tradeSignalsTable.$inferSelect,
  lotMultiplier: number,
): Promise<string> {
  if (signal.action === "close" || signal.action === "modify") {
    // For close/modify we issue a REDUCE_ONLY market order
    const side = signal.action === "close"
      ? (signal.notes?.includes("long") ? "SELL" : "BUY")  // close long = sell
      : "BUY"; // modify doesn't place an order — handled by update SL/TP endpoint
    if (signal.action === "modify") return "modify-noop";

    const qty = (parseFloat(signal.quantity as string) * lotMultiplier).toFixed(6);
    const params = new URLSearchParams({
      symbol: signal.symbol.toUpperCase(),
      side,
      type: "MARKET",
      quantity: qty,
      reduceOnly: "true",
      timestamp: Date.now().toString(),
    });
    const sig = createHmac("sha256", apiSecret).update(params.toString()).digest("hex");
    params.append("signature", sig);
    const res = await fetch(`https://fapi.binance.com/fapi/v1/order?${params.toString()}`, {
      method: "POST",
      headers: { "X-MBX-APIKEY": apiKey },
    });
    const json = await res.json() as { orderId?: number; msg?: string };
    if (!res.ok) throw new Error(json.msg ?? "Binance close error");
    return String(json.orderId);
  }

  const side = signal.action === "buy" ? "BUY" : "SELL";
  const qty = (parseFloat(signal.quantity as string) * lotMultiplier).toFixed(6);
  const params = new URLSearchParams({
    symbol: signal.symbol.toUpperCase(),
    side,
    type: "MARKET",
    quantity: qty,
    timestamp: Date.now().toString(),
  });
  const sig = createHmac("sha256", apiSecret).update(params.toString()).digest("hex");
  params.append("signature", sig);

  const res = await fetch(`https://api.binance.com/api/v3/order?${params.toString()}`, {
    method: "POST",
    headers: { "X-MBX-APIKEY": apiKey },
  });
  const json = await res.json() as { orderId?: number; msg?: string };
  if (!res.ok) throw new Error(json.msg ?? "Binance error");
  return String(json.orderId);
}

/* ── Bybit market order ────────────────────────────────────────── */
async function executeBybit(
  apiKey: string,
  apiSecret: string,
  signal: typeof tradeSignalsTable.$inferSelect,
  lotMultiplier: number,
): Promise<string> {
  if (signal.action === "modify") return "modify-noop";

  const timestamp = Date.now().toString();
  const qty = (parseFloat(signal.quantity as string) * lotMultiplier).toFixed(6);
  let side = signal.action === "buy" ? "Buy" : "Sell";
  const isClose = signal.action === "close";
  if (isClose) side = signal.notes?.includes("long") ? "Sell" : "Buy";

  const body = JSON.stringify({
    category: "linear",
    symbol: signal.symbol.toUpperCase(),
    side,
    orderType: "Market",
    qty,
    ...(isClose ? { reduceOnly: true } : {}),
  });
  const toSign = `${timestamp}${apiKey}5000${body}`;
  const signature = createHmac("sha256", apiSecret).update(toSign).digest("hex");

  const res = await fetch("https://api.bybit.com/v5/order/create", {
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

  const res = await fetch(`${bridgeUrl}/signal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      login, password, server,
      symbol: signal.symbol,
      action: signal.action,
      volume: parseFloat(signal.quantity as string) * lotMultiplier,
      price: signal.price ? parseFloat(signal.price as string) : 0,
      sl: signal.stopLoss ? parseFloat(signal.stopLoss as string) : 0,
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

  await Promise.allSettled(
    activeSubs.map(async (sub) => {
      const account = accountMap[sub.copyAccountId!];
      if (!account) return;
      // Skip master accounts — don't execute on them
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
      }
    }),
  );

  await db
    .update(tradeSignalsTable)
    .set({ status: "executed", executedAt: new Date() })
    .where(eq(tradeSignalsTable.id, signal.id));
}
