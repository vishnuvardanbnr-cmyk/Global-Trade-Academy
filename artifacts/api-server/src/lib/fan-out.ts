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
  siteSettingsTable,
  tradersTable,
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

/* ── MetaAPI CopyFactory external signal ───────────────────────── */

const METAAPI_HISTORY_BASE =
  "https://copyfactory-application-history-master-v1.agiliumtrade.agiliumtrade.ai";
const METAAPI_CONFIG_BASE =
  "https://copyfactory-application-configuration-v2.agiliumtrade.agiliumtrade.ai";

const METAAPI_PROVISION_BASE =
  "https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai";

/** Read MetaAPI platform token from DB (integration_settings) with env-var fallback */
async function getMetaapiToken(): Promise<string> {
  const row = await db
    .select()
    .from(siteSettingsTable)
    .where(eq(siteSettingsTable.key, "integration_settings"))
    .limit(1)
    .then((r) => r[0]);

  const stored = row ? (JSON.parse(row.value) as Record<string, string>) : {};
  const token = stored.metaapiToken ?? process.env.METAAPI_TOKEN ?? "";
  if (!token) throw new Error("METAAPI_TOKEN not configured — set it in Admin → Trading");
  return token;
}

/**
 * Create a new CopyFactory strategy for a trader.
 * Called once when a user is promoted to trader.
 * Returns the new strategy ID.
 */
export async function metaapiCreateStrategy(name: string): Promise<string> {
  const token = await getMetaapiToken();
  const res = await fetchWithTimeout(
    `${METAAPI_CONFIG_BASE}/users/current/configuration/strategies`,
    {
      method: "POST",
      headers: { "auth-token": token, "Content-Type": "application/json" },
      body: JSON.stringify({ name, type: "ACCOUNT" }),
    },
  );
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`MetaAPI create strategy ${res.status}: ${txt}`);
  }
  const data = await res.json() as { id: string };
  if (!data.id) throw new Error("MetaAPI did not return a strategy ID");
  return data.id;
}

/**
 * Create a MetaAPI broker account from the copier's MT credentials.
 * Fully handled server-side — copier never visits app.metaapi.cloud.
 * Returns the MetaAPI account ID.
 */
export async function metaapiCreateAccount(opts: {
  login: string;
  password: string;
  server: string;
  platform: "mt4" | "mt5";
  name: string;
}): Promise<string> {
  const token = await getMetaapiToken();

  const res = await fetchWithTimeout(
    `${METAAPI_PROVISION_BASE}/users/current/accounts`,
    {
      method: "POST",
      headers: { "auth-token": token, "Content-Type": "application/json" },
      body: JSON.stringify({
        login: opts.login,
        password: opts.password,
        server: opts.server,
        platform: opts.platform,
        name: opts.name,
        type: "cloud",
        magic: 0,
        application: "MetaApi",
      }),
    },
  );

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`MetaAPI account creation error ${res.status}: ${txt}`);
  }

  const data = await res.json() as { id: string };
  if (!data.id) throw new Error("MetaAPI did not return an account ID");
  return data.id;
}

/**
 * Subscribe a MetaAPI copier account to a specific trader's CopyFactory strategy.
 * Called when the copier subscribes to a trader (not when they add their account).
 * strategyId is per-trader — each trader has their own CopyFactory strategy.
 */
export async function metaapiSubscribe(
  metaapiAccountId: string,
  label: string,
  lotMultiplier: number,
  strategyId: string,
): Promise<void> {
  const token = await getMetaapiToken();

  const res = await fetchWithTimeout(
    `${METAAPI_CONFIG_BASE}/users/current/configuration/subscribers/${metaapiAccountId}`,
    {
      method: "PUT",
      headers: { "auth-token": token, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: label,
        subscriptions: [
          {
            strategyId,
            multiplier: lotMultiplier,
            skipPendingOrders: false,
            mode: "TRADE_COPYING_MODE_TRADE_SIZE_SCALING",
          },
        ],
      }),
    },
  );
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`MetaAPI subscribe error ${res.status}: ${txt}`);
  }
}

/**
 * Unsubscribe a MetaAPI copier account from a specific trader's CopyFactory strategy.
 * Called when the copier unsubscribes from a trader.
 */
export async function metaapiUnsubscribe(metaapiAccountId: string, strategyId: string): Promise<void> {
  let token: string;
  try { token = await getMetaapiToken(); } catch { return; } // non-fatal if not configured

  await fetchWithTimeout(
    `${METAAPI_CONFIG_BASE}/users/current/configuration/subscribers/${metaapiAccountId}/strategies/${strategyId}`,
    {
      method: "DELETE",
      headers: { "auth-token": token },
    },
  ).catch(() => {
    // best-effort
  });
}

/**
 * Push one external signal to MetaAPI CopyFactory.
 * MetaAPI fans it out to ALL subscribers of the strategy automatically.
 */
async function executeMetaApi(
  signal: typeof tradeSignalsTable.$inferSelect,
  strategyId: string,
): Promise<string> {
  const token = await getMetaapiToken();

  if (signal.action === "modify") return "modify-noop";

  const externalSignalId = `bi-${signal.id}`;

  if (signal.action === "close") {
    // Remove the open signal so MetaAPI closes positions for all subscribers
    const res = await fetchWithTimeout(
      `${METAAPI_HISTORY_BASE}/users/current/strategies/${strategyId}/external-signals/${externalSignalId}`,
      {
        method: "DELETE",
        headers: { "auth-token": token, "Content-Type": "application/json" },
        body: JSON.stringify({ time: new Date().toISOString() }),
      },
    );
    // 404 means signal was already removed — not an error
    if (!res.ok && res.status !== 404) {
      const txt = await res.text();
      throw new Error(`MetaAPI remove signal ${res.status}: ${txt}`);
    }
    return `metaapi-close-${externalSignalId}`;
  }

  const type = signal.action === "buy" ? "POSITION_TYPE_BUY" : "POSITION_TYPE_SELL";
  const volume = parseFloat(signal.quantity as string);

  const body: Record<string, unknown> = {
    symbol: signal.symbol,
    type,
    time: new Date().toISOString(),
    volume,
  };
  if (signal.stopLoss)   body.stopLoss   = parseFloat(signal.stopLoss   as string);
  if (signal.takeProfit) body.takeProfit = parseFloat(signal.takeProfit as string);
  if (signal.price && signal.orderType !== "market") {
    body.openPrice = parseFloat(signal.price as string);
  }

  const res = await fetchWithTimeout(
    `${METAAPI_HISTORY_BASE}/users/current/strategies/${strategyId}/external-signals/${externalSignalId}`,
    {
      method: "PUT",
      headers: { "auth-token": token, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`MetaAPI signal error ${res.status}: ${txt}`);
  }
  return externalSignalId;
}

/* ── MT5 bridge order ──────────────────────────────────────────── */
async function executeMt5(
  login: string,
  password: string,
  server: string,
  signal: typeof tradeSignalsTable.$inferSelect,
  lotMultiplier: number,
): Promise<string> {
  // Modify signals are noop on Binance/Bybit; treat the same for MT5
  if (signal.action === "modify") return "modify-noop";

  const bridgeUrl = process.env.MT5_BRIDGE_URL;
  if (!bridgeUrl) throw new Error("MT5_BRIDGE_URL not configured");

  // MT5 lot sizes go to 2 decimal places (0.01 step). Round to avoid broker rejection.
  const rawVol = parseFloat(signal.quantity as string) * lotMultiplier;
  const volume = Math.round(rawVol * 100) / 100;
  if (volume <= 0) throw new Error(`MT5: computed volume ${volume} is too small (min 0.01 lots)`);

  // For CLOSE signals the bridge must know which side to counter-trade.
  // Derive it from notes the same way the closeSide() helper works for Binance/Bybit.
  const isClose = signal.action === "close";
  let side: "buy" | "sell";
  if (isClose) {
    const notes = (signal.notes ?? "").toLowerCase();
    if (!notes.includes("long") && !notes.includes("short")) {
      throw new Error(
        `MT5 CLOSE signal #${signal.id}: cannot determine position side. ` +
        `Add 'long' or 'short' to the signal notes (e.g. "close long").`,
      );
    }
    // Closing a long → SELL; closing a short → BUY
    side = notes.includes("long") ? "sell" : "buy";
  } else {
    side = signal.action as "buy" | "sell";
  }

  const res = await fetchWithTimeout(`${bridgeUrl}/signal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      login, password, server,
      symbol: signal.symbol,
      action: signal.action,  // keep raw action for bridge routing logic
      side,                   // explicit counter-trade side for open/close
      orderType: signal.orderType ?? "market",
      volume,
      price:     signal.price      ? parseFloat(signal.price      as string) : 0,
      stopPrice: signal.stopPrice  ? parseFloat(signal.stopPrice  as string) : 0,
      sl:        signal.stopLoss   ? parseFloat(signal.stopLoss   as string) : 0,
      tp:        signal.takeProfit ? parseFloat(signal.takeProfit as string) : 0,
      leverage:  signal.leverage ?? 1,
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

  // ── MetaAPI: fire ONE external signal covering all MetaAPI subscribers ──
  // MetaAPI's CopyFactory handles fan-out to all subscribers automatically,
  // so we only need one API call regardless of how many MetaAPI copiers exist.
  const metaapiSubs = activeSubs.filter(
    (s) => accountMap[s.copyAccountId!]?.type === "metaapi",
  );
  const nonMetaapiSubs = activeSubs.filter(
    (s) => accountMap[s.copyAccountId!]?.type !== "metaapi",
  );

  // Look up this trader's per-trader CopyFactory strategy ID
  const traderRow = await db
    .select({ metaapiStrategyId: tradersTable.metaapiStrategyId })
    .from(tradersTable)
    .where(eq(tradersTable.id, signal.traderId))
    .limit(1)
    .then((r) => r[0]);
  const traderStrategyId = traderRow?.metaapiStrategyId ?? null;

  if (metaapiSubs.length > 0) {
    if (!traderStrategyId) {
      // Trader has no CopyFactory strategy — log and skip MetaAPI fan-out
      logger.warn({ traderId: signal.traderId }, "MetaAPI signal skipped — trader has no CopyFactory strategy configured");
      const msg = "Trader has no CopyFactory strategy. Admin must promote the trader after setting METAAPI_TOKEN.";
      await Promise.all(
        metaapiSubs.map((sub) =>
          db.insert(copyTradesTable).values({
            signalId: signal.id, subscriptionId: sub.id, userId: sub.userId,
            copyAccountId: sub.copyAccountId!, status: "failed",
            quantity: signal.quantity ? String(signal.quantity) : null,
            errorMessage: msg,
          }),
        ),
      );
      failCount += metaapiSubs.length;
    } else {
    // Insert copy_trade rows for all MetaAPI subscribers (pending), then resolve them together
    const metaaTrades = await Promise.all(
      metaapiSubs.map((sub) =>
        db
          .insert(copyTradesTable)
          .values({
            signalId: signal.id,
            subscriptionId: sub.id,
            userId: sub.userId,
            copyAccountId: sub.copyAccountId!,
            status: "pending",
            quantity: signal.quantity ? String(signal.quantity) : null,
          })
          .returning()
          .then((r) => ({ trade: r[0], sub })),
      ),
    );

    try {
      const brokerOrderId = await executeMetaApi(signal, traderStrategyId);
      // Mark all MetaAPI copy_trades as executed
      await Promise.all(
        metaaTrades.map(({ trade, sub }) =>
          Promise.all([
            db
              .update(copyTradesTable)
              .set({ status: "executed", brokerOrderId, executedPrice: signal.price ?? null })
              .where(eq(copyTradesTable.id, trade.id)),
            db
              .update(copyAccountsTable)
              .set({ status: "active", lastError: null })
              .where(eq(copyAccountsTable.id, sub.copyAccountId!)),
          ]),
        ),
      );
      successCount += metaapiSubs.length;
      logger.info({ signalId: signal.id, brokerOrderId }, "MetaAPI signal dispatched");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "MetaAPI unknown error";
      logger.error({ err: msg }, "MetaAPI fan-out error");
      await Promise.all(
        metaaTrades.map(({ trade, sub }) =>
          Promise.all([
            db
              .update(copyTradesTable)
              .set({ status: "failed", errorMessage: msg })
              .where(eq(copyTradesTable.id, trade.id)),
            db
              .update(copyAccountsTable)
              .set({ status: "error", lastError: msg })
              .where(eq(copyAccountsTable.id, sub.copyAccountId!)),
          ]),
        ),
      );
      failCount += metaapiSubs.length;
    }
    } // end else (traderStrategyId exists)
  }

  // ── Per-copier fan-out for Binance / Bybit / MT5 ────────────────────────
  await Promise.allSettled(
    nonMetaapiSubs.map(async (sub) => {
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
