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
  activityTable,
  agentSignalQueueTable,
} from "@workspace/db";
import { notifyUser } from "./notify";
import { eq, and, inArray, desc } from "drizzle-orm";
import { decrypt } from "./encrypt";
import { logger } from "./logger";

/* ── Helpers ───────────────────────────────────────────────────── */

/** Shared fetch with a configurable timeout (default 10s) so a hung exchange never stalls fan-out */
async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 10_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
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

/* ── MetaAPI direct trading API ────────────────────────────────── */

const METAAPI_PROVISION_BASE =
  "https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai";

/** CopyFactory URLs kept for reference / future re-enablement */
const METAAPI_HISTORY_BASE =
  "https://copyfactory-application-history-master-v1.agiliumtrade.agiliumtrade.ai";
const METAAPI_CONFIG_BASE =
  "https://copyfactory-application-configuration-v2.agiliumtrade.agiliumtrade.ai";

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
 * Resolve the correct MetaAPI client API base URL for an account.
 * Queries the provisioning API for the account's region (cached per call).
 */
async function getMetaApiClientBase(metaapiAccountId: string, token: string): Promise<string> {
  try {
    const res = await fetchWithTimeout(
      `${METAAPI_PROVISION_BASE}/users/current/accounts/${metaapiAccountId}`,
      { headers: { "auth-token": token } },
    );
    if (res.ok) {
      const data = await res.json() as { region?: string };
      const region = data.region ?? "london";
      return `https://mt-client-api-v1.${region}.agiliumtrade.ai`;
    }
  } catch { /* fall through */ }
  return "https://mt-client-api-v1.london.agiliumtrade.ai";
}

/**
 * After a successful MetaAPI trade, fetch the actual fill price in the background
 * and update copy_trades.executed_price + copy_trades.pnl (for closes).
 * Fires asynchronously — never blocks the main execution path.
 */
function fetchAndStoreFillPrice(opts: {
  tradeId: number;
  metaapiAccountId: string;
  positionId: string;
  action: string;
  token: string;
}): void {
  const { tradeId, metaapiAccountId, positionId, action, token } = opts;
  // Wait a few seconds for MetaAPI to settle the order before querying
  setTimeout(async () => {
    try {
      const clientBase = await getMetaApiClientBase(metaapiAccountId, token);
      if (action === "close") {
        // Query recent deal history for the close fill price + profit
        const end   = new Date().toISOString();
        const start = new Date(Date.now() - 90_000).toISOString(); // last 90s
        const res = await fetchWithTimeout(
          `${clientBase}/users/current/accounts/${metaapiAccountId}/history-deals/time/${start}/${end}`,
          { headers: { "auth-token": token } },
        );
        if (!res.ok) return;
        const deals = await res.json() as Array<{
          positionId?: string; entryType?: string; price?: number; profit?: number;
        }>;
        const deal = deals.find(
          (d) => d.positionId === positionId && d.entryType === "DEAL_ENTRY_OUT",
        );
        if (deal?.price != null) {
          await db.update(copyTradesTable).set({
            executedPrice: String(deal.price),
            ...(deal.profit != null ? { pnl: String(deal.profit) } : {}),
          }).where(eq(copyTradesTable.id, tradeId));
        }
      } else {
        // Query open positions for the fill (open) price
        const res = await fetchWithTimeout(
          `${clientBase}/users/current/accounts/${metaapiAccountId}/positions`,
          { headers: { "auth-token": token } },
        );
        if (!res.ok) return;
        const positions = await res.json() as Array<{ id?: string; openPrice?: number }>;
        const pos = positions.find((p) => p.id === positionId);
        if (pos?.openPrice != null) {
          await db.update(copyTradesTable).set({
            executedPrice: String(pos.openPrice),
          }).where(eq(copyTradesTable.id, tradeId));
        }
      }
    } catch { /* non-critical — fill price is best-effort */ }
  }, 4_000);
}

/** Background: fetch Binance futures order fill price and store in copy_trades */
function fetchAndStoreBinanceFillPrice(
  tradeId: number, apiKey: string, apiSecret: string, symbol: string, orderId: string,
): void {
  setTimeout(async () => {
    try {
      const params = new URLSearchParams({
        symbol: symbol.toUpperCase(), orderId, timestamp: Date.now().toString(),
      });
      const hmac = createHmac("sha256", apiSecret).update(params.toString()).digest("hex");
      params.append("signature", hmac);
      const res = await fetchWithTimeout(
        `https://fapi.binance.com/fapi/v1/order?${params.toString()}`,
        { headers: { "X-MBX-APIKEY": apiKey } },
      );
      if (!res.ok) return;
      const data = await res.json() as { avgPrice?: string };
      if (data.avgPrice && parseFloat(data.avgPrice) > 0) {
        await db.update(copyTradesTable).set({ executedPrice: data.avgPrice }).where(eq(copyTradesTable.id, tradeId));
      }
    } catch { /* non-critical */ }
  }, 3_000);
}

/** Background: fetch Bybit order fill price and store in copy_trades */
function fetchAndStoreBybitFillPrice(
  tradeId: number, apiKey: string, apiSecret: string, symbol: string, orderId: string,
): void {
  setTimeout(async () => {
    try {
      const timestamp = Date.now().toString();
      const params = new URLSearchParams({ category: "linear", orderId, symbol: symbol.toUpperCase() });
      const toSign = `${timestamp}${apiKey}5000${params.toString()}`;
      const sig = createHmac("sha256", apiSecret).update(toSign).digest("hex");
      const res = await fetchWithTimeout(
        `https://api.bybit.com/v5/order/history?${params.toString()}`,
        { headers: { "X-BAPI-API-KEY": apiKey, "X-BAPI-TIMESTAMP": timestamp, "X-BAPI-SIGN": sig, "X-BAPI-RECV-WINDOW": "5000" } },
      );
      if (!res.ok) return;
      const data = await res.json() as { result?: { list?: Array<{ avgPrice?: string }> } };
      const avgPrice = data.result?.list?.[0]?.avgPrice;
      if (avgPrice && parseFloat(avgPrice) > 0) {
        await db.update(copyTradesTable).set({ executedPrice: avgPrice }).where(eq(copyTradesTable.id, tradeId));
      }
    } catch { /* non-critical */ }
  }, 3_000);
}

/**
 * Execute a trade signal directly on a MetaAPI account via the trading REST API.
 * Replaces the CopyFactory path — works per-copier, fully parallel.
 */
async function executeMetaApiDirect(
  signal: typeof tradeSignalsTable.$inferSelect,
  metaapiAccountId: string,
  copyAccountId: number,
  lotMultiplier: number,
  token: string,
): Promise<string> {
  const clientBase = await getMetaApiClientBase(metaapiAccountId, token);
  const tradeUrl = `${clientBase}/users/current/accounts/${metaapiAccountId}/trade`;

  const rawVol = parseFloat(signal.quantity as string) * lotMultiplier;
  const volume = Math.round(rawVol * 100) / 100;
  if (volume <= 0) throw new Error(`MetaAPI: computed volume ${volume} too small (min 0.01)`);

  /* ── MODIFY ─────────────────────────────────────────────────── */
  if (signal.action === "modify") {
    const openTrade = await db
      .select({ brokerOrderId: copyTradesTable.brokerOrderId })
      .from(copyTradesTable)
      .innerJoin(tradeSignalsTable, eq(copyTradesTable.signalId, tradeSignalsTable.id))
      .where(
        and(
          eq(copyTradesTable.copyAccountId, copyAccountId),
          eq(tradeSignalsTable.traderId, signal.traderId),
          eq(tradeSignalsTable.symbol, signal.symbol),
          eq(copyTradesTable.status, "executed"),
          inArray(tradeSignalsTable.action, ["buy", "sell"]),
        ),
      )
      .orderBy(desc(copyTradesTable.id))
      .limit(1)
      .then((r) => r[0]);

    if (!openTrade?.brokerOrderId) return "modify-noop";

    const body: Record<string, unknown> = {
      actionType: "POSITION_MODIFY",
      positionId: openTrade.brokerOrderId,
    };
    if (signal.stopLoss)   body.stopLoss   = parseFloat(signal.stopLoss   as string);
    if (signal.takeProfit) body.takeProfit = parseFloat(signal.takeProfit as string);

    const res = await fetchWithTimeout(tradeUrl, {
      method: "POST",
      headers: { "auth-token": token, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) { const t = await res.text(); throw new Error(`MetaAPI modify ${res.status}: ${t}`); }
    return openTrade.brokerOrderId;
  }

  /* ── CLOSE ──────────────────────────────────────────────────── */
  if (signal.action === "close") {
    const openTrade = await db
      .select({ brokerOrderId: copyTradesTable.brokerOrderId })
      .from(copyTradesTable)
      .innerJoin(tradeSignalsTable, eq(copyTradesTable.signalId, tradeSignalsTable.id))
      .where(
        and(
          eq(copyTradesTable.copyAccountId, copyAccountId),
          eq(tradeSignalsTable.traderId, signal.traderId),
          eq(tradeSignalsTable.symbol, signal.symbol),
          eq(copyTradesTable.status, "executed"),
          inArray(tradeSignalsTable.action, ["buy", "sell"]),
        ),
      )
      .orderBy(desc(copyTradesTable.id))
      .limit(1)
      .then((r) => r[0]);

    if (!openTrade?.brokerOrderId) throw new Error(`MetaAPI: no open position found to close for account ${copyAccountId}`);

    const res = await fetchWithTimeout(tradeUrl, {
      method: "POST",
      headers: { "auth-token": token, "Content-Type": "application/json" },
      body: JSON.stringify({ actionType: "POSITION_CLOSE_ID", positionId: openTrade.brokerOrderId }),
    });
    if (!res.ok) { const t = await res.text(); throw new Error(`MetaAPI close ${res.status}: ${t}`); }
    return openTrade.brokerOrderId;
  }

  /* ── BUY / SELL ─────────────────────────────────────────────── */
  const actionType = signal.action === "buy" ? "ORDER_TYPE_BUY" : "ORDER_TYPE_SELL";
  const body: Record<string, unknown> = { actionType, symbol: signal.symbol, volume };
  if (signal.stopLoss)   body.stopLoss   = parseFloat(signal.stopLoss   as string);
  if (signal.takeProfit) body.takeProfit = parseFloat(signal.takeProfit as string);
  if (signal.price && signal.orderType !== "market") body.openPrice = parseFloat(signal.price as string);

  const res = await fetchWithTimeout(tradeUrl, {
    method: "POST",
    headers: { "auth-token": token, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) { const t = await res.text(); throw new Error(`MetaAPI trade ${res.status}: ${t}`); }
  const data = await res.json() as { positionId?: string; orderId?: string };
  return data.positionId ?? data.orderId ?? "unknown";
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
const METAAPI_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Poll GET /accounts until an account with matching login+server appears.
 * MetaAPI validates credentials asynchronously and may return AcceptedError
 * on the POST — we must poll for the resulting UUID.
 */
async function pollForMetaApiAccount(login: string, server: string, token: string): Promise<string> {
  const maxAttempts = 8;
  const intervalMs = 15_000; // 15s between polls, up to 120s total

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise((r) => setTimeout(r, intervalMs));

    try {
      const res = await fetchWithTimeout(
        `${METAAPI_PROVISION_BASE}/users/current/accounts?limit=100`,
        { headers: { "auth-token": token } },
        15_000,
      );
      if (!res.ok) continue;

      const accounts = await res.json() as Array<{ id?: string; login?: string | number; server?: string }>;
      const match = accounts.find(
        (a) => String(a.login) === String(login) && a.server === server && a.id && METAAPI_UUID_RE.test(a.id),
      );
      if (match) return match.id!;
    } catch {
      // network hiccup — keep polling
    }
  }

  throw new Error(
    `MetaAPI account validation timed out after ${maxAttempts * intervalMs / 1000}s. ` +
    `The account for login ${login} on ${server} may still be provisioning — try connecting again in a minute.`,
  );
}

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
    60_000,
  );

  // Non-2xx that isn't an AcceptedError means a real failure
  const body = await res.json() as { id?: string | number; error?: string };

  // MetaAPI async validation: account submitted but credentials not yet verified.
  // Poll for the account to appear in the account list.
  if (!res.ok || (body.error === "AcceptedError") || !METAAPI_UUID_RE.test(String(body.id ?? ""))) {
    if (body.error && body.error !== "AcceptedError") {
      throw new Error(`MetaAPI account creation error ${res.status}: ${JSON.stringify(body)}`);
    }
    // Either AcceptedError or non-UUID id — poll for the real account
    return await pollForMetaApiAccount(opts.login, opts.server, token);
  }

  return String(body.id);
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

  // Fetch MetaAPI token once — reused for all metaapi-type copiers
  let metaapiToken: string | null = null;
  const hasMetaapiSubs = activeSubs.some(
    (s) => accountMap[s.copyAccountId!]?.type === "metaapi",
  );
  if (hasMetaapiSubs) {
    try { metaapiToken = await getMetaapiToken(); } catch {
      metaapiToken = null;
    }
  }

  // ── Per-copier fan-out: Binance / Bybit / MT5 / MetaAPI (all parallel) ──
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

        // ── Agent/Safe mode: push directly to VPS, queue as fallback ──
        if (account.executionMode === "agent" || account.executionMode === "safe") {
          const expiresAt = new Date(Date.now() + 60_000); // 60s TTL
          const signalPayload = {
            signal: {
              symbol: signal.symbol,
              action: signal.action,
              price: signal.price,
              quantity: signal.quantity,
              stopLoss: signal.stopLoss,
              takeProfit: signal.takeProfit,
              orderType: signal.orderType,
              notes: signal.notes,
            },
            multiplier,
          };

          // Insert into queue first (always — acts as audit trail + fallback)
          const [queueEntry] = await db.insert(agentSignalQueueTable).values({
            copyAccountId: account.id,
            subscriptionId: sub.id,
            userId: sub.userId,
            signalId: signal.id,
            tradeId: trade.id,
            payload: JSON.stringify(signalPayload),
            expiresAt,
          }).returning();

          // Attempt direct push to VPS (~200ms vs 0-10s polling)
          if (account.agentToken) {
            import("./vps-manager").then(async ({ pushSignalToVps }) => {
              const pushed = await pushSignalToVps({
                copyAccountId: account.id,
                agentToken: account.agentToken!,
                payload: { queueId: queueEntry.id, tradeId: trade.id, signalId: signal.id, ...signalPayload },
              });
              if (pushed) {
                // Mark as executing so the fallback poller doesn't double-pick it
                await db.update(agentSignalQueueTable)
                  .set({ status: "executing" })
                  .where(eq(agentSignalQueueTable.id, queueEntry.id));
                logger.info({ queueId: queueEntry.id }, "Signal pushed directly to VPS");
              } else {
                logger.info({ queueId: queueEntry.id }, "VPS push failed — left in queue for polling fallback");
              }
            }).catch(() => {});
          }

          successCount++; // agent handles execution (push or poll)
          return;         // skip cloud execution below
        }

        if (account.type === "metaapi") {
          if (!metaapiToken) throw new Error("MetaAPI token not configured — set it in Admin → Trading");
          if (!account.metaapiAccountId) throw new Error("MetaAPI account ID missing on copier account");
          brokerOrderId = await executeMetaApiDirect(
            signal,
            account.metaapiAccountId,
            account.id,
            multiplier,
            metaapiToken,
          );
        } else if (account.type === "binance") {
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

        // Background: fetch actual fill price and store it
        if (account.type === "metaapi" && account.metaapiAccountId && brokerOrderId !== "unknown") {
          fetchAndStoreFillPrice({
            tradeId: trade.id,
            metaapiAccountId: account.metaapiAccountId,
            positionId: brokerOrderId,
            action: signal.action,
            token: metaapiToken,
          });
        } else if (account.type === "binance" && account.apiKey && account.apiSecret && brokerOrderId !== "unknown") {
          fetchAndStoreBinanceFillPrice(
            trade.id,
            decrypt(account.apiKey),
            decrypt(account.apiSecret),
            signal.symbol,
            brokerOrderId,
          );
        } else if (account.type === "bybit" && account.apiKey && account.apiSecret && brokerOrderId !== "unknown") {
          fetchAndStoreBybitFillPrice(
            trade.id,
            decrypt(account.apiKey),
            decrypt(account.apiSecret),
            signal.symbol,
            brokerOrderId,
          );
        }
        await db
          .update(copyAccountsTable)
          .set({ status: "active", lastError: null })
          .where(eq(copyAccountsTable.id, account.id));

        // ── Notify the copier ─────────────────────────────────────
        const isClose = signal.action === "close";
        const symbol = signal.symbol.toUpperCase();
        const direction = signal.action === "buy" ? "Buy"
          : signal.action === "sell" ? "Sell"
          : "Close";
        const entryPrice = signal.price
          ? parseFloat(signal.price as string).toFixed(5)
          : "Market";
        const lots = (parseFloat(signal.quantity as string) * multiplier).toFixed(2);

        const notifType = isClose ? "copy_trade_closed" : "copy_trade_executed";
        const notifTitle = isClose
          ? `Trade Closed: ${symbol}`
          : `Trade Executed: ${symbol} ${direction}`;
        const notifMessage = `${symbol} | ${direction} | Entry: ${entryPrice} | Lots: ${lots}`;

        await notifyUser(sub.userId, notifType, notifTitle, notifMessage, String(trade.id));

        // ── Record in Platform Activity ────────────────────────────
        await db.insert(activityTable).values({
          type: "copy_trade",
          userId: sub.userId,
          description: notifTitle,
          metadata: JSON.stringify({
            symbol,
            action: signal.action,
            direction,
            entryPrice,
            lots,
            tradeId: trade.id,
            broker: account.type,
          }),
        }).catch(() => { /* non-critical */ });

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

/* ═══════════════════════════════════════════════════════════════════
   DIRECT CLOSE — close a specific open signal across all its copiers
════════════════════════════════════════════════════════════════════ */

/**
 * Close all executed copy_trades for a specific signal by calling each
 * copier's broker API directly using the stored brokerOrderId.
 * Supports MetaAPI (POSITION_CLOSE_ID), Binance, Bybit.
 * MT5 / agent / safe-mode trades are counted as "skipped" — the VPS handles those.
 */
export async function closeBySignalId(
  signalId: number,
): Promise<{ closed: number; failed: number; skipped: number }> {
  // Fetch the original signal (needed for symbol + direction)
  const [signal] = await db.select().from(tradeSignalsTable)
    .where(eq(tradeSignalsTable.id, signalId)).limit(1);
  if (!signal) throw new Error("Signal not found");

  // Fetch all executed copy_trades for this signal
  const trades = await db.select({
    id:            copyTradesTable.id,
    brokerOrderId: copyTradesTable.brokerOrderId,
    copyAccountId: copyTradesTable.copyAccountId,
    quantity:      copyTradesTable.quantity,
  })
    .from(copyTradesTable)
    .where(and(eq(copyTradesTable.signalId, signalId), eq(copyTradesTable.status, "executed")));

  if (trades.length === 0) return { closed: 0, failed: 0, skipped: 0 };

  // Fetch accounts
  const acctIds = [...new Set(trades.map((t) => t.copyAccountId))];
  const accounts = await db.select().from(copyAccountsTable).where(inArray(copyAccountsTable.id, acctIds));
  const acctMap = new Map(accounts.map((a) => [a.id, a]));

  const metaapiToken = await getMetaapiToken().catch(() => "");
  let closed = 0, failed = 0, skipped = 0;

  await Promise.allSettled(
    trades.map(async (trade) => {
      const acct = acctMap.get(trade.copyAccountId);
      if (!acct) { skipped++; return; }

      // Agent / Safe / MT5 — cannot close remotely via platform; skip
      if (acct.executionMode === "agent" || acct.executionMode === "safe" || acct.type === "mt5") {
        skipped++;
        return;
      }

      if (!trade.brokerOrderId) { skipped++; return; }

      try {
        if (acct.type === "metaapi" && acct.metaapiAccountId && metaapiToken) {
          const clientBase = await getMetaApiClientBase(acct.metaapiAccountId, metaapiToken);
          const res = await fetchWithTimeout(
            `${clientBase}/users/current/accounts/${acct.metaapiAccountId}/trade`,
            {
              method: "POST",
              headers: { "auth-token": metaapiToken, "Content-Type": "application/json" },
              body: JSON.stringify({ actionType: "POSITION_CLOSE_ID", positionId: trade.brokerOrderId }),
            },
          );
          if (!res.ok) { const t = await res.text(); throw new Error(`MetaAPI ${res.status}: ${t}`); }
          await db.update(copyTradesTable).set({ status: "closed" }).where(eq(copyTradesTable.id, trade.id));
          fetchAndStoreFillPrice({
            tradeId: trade.id,
            metaapiAccountId: acct.metaapiAccountId,
            positionId: trade.brokerOrderId,
            action: "close",
            token: metaapiToken,
          });
          closed++;
        } else if (acct.type === "binance" && acct.apiKey && acct.apiSecret) {
          const apiKey    = decrypt(acct.apiKey);
          const apiSecret = decrypt(acct.apiSecret);
          const side      = signal.action === "buy" ? "SELL" : "BUY";
          const qty       = trade.quantity ? parseFloat(trade.quantity as string).toFixed(6) : "0";
          const params    = new URLSearchParams({
            symbol: signal.symbol.toUpperCase(), side, type: "MARKET",
            quantity: qty, reduceOnly: "true", timestamp: Date.now().toString(),
          });
          const hmac = createHmac("sha256", apiSecret).update(params.toString()).digest("hex");
          params.append("signature", hmac);
          const res = await fetchWithTimeout(`https://fapi.binance.com/fapi/v1/order?${params.toString()}`, {
            method: "POST", headers: { "X-MBX-APIKEY": apiKey },
          });
          if (!res.ok) { const t = await res.text(); throw new Error(`Binance close: ${t}`); }
          const json = await res.json() as { orderId?: number };
          await db.update(copyTradesTable).set({ status: "closed" }).where(eq(copyTradesTable.id, trade.id));
          if (json.orderId) {
            fetchAndStoreBinanceFillPrice(trade.id, apiKey, apiSecret, signal.symbol, String(json.orderId));
          }
          closed++;
        } else if (acct.type === "bybit" && acct.apiKey && acct.apiSecret) {
          const apiKey    = decrypt(acct.apiKey);
          const apiSecret = decrypt(acct.apiSecret);
          const side      = signal.action === "buy" ? "Sell" : "Buy";
          const qty       = trade.quantity ? parseFloat(trade.quantity as string).toFixed(6) : "0";
          const timestamp = Date.now().toString();
          const body      = JSON.stringify({
            category: "linear", symbol: signal.symbol.toUpperCase(),
            side, qty, orderType: "Market", reduceOnly: true,
          });
          const toSign = `${timestamp}${apiKey}5000${body}`;
          const sig    = createHmac("sha256", apiSecret).update(toSign).digest("hex");
          const res    = await fetchWithTimeout("https://api.bybit.com/v5/order/create", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-BAPI-API-KEY": apiKey, "X-BAPI-TIMESTAMP": timestamp,
              "X-BAPI-SIGN": sig, "X-BAPI-RECV-WINDOW": "5000",
            },
            body,
          });
          const json = await res.json() as { retCode?: number; retMsg?: string; result?: { orderId?: string } };
          if (json.retCode !== 0) throw new Error(json.retMsg ?? "Bybit error");
          await db.update(copyTradesTable).set({ status: "closed" }).where(eq(copyTradesTable.id, trade.id));
          if (json.result?.orderId) {
            fetchAndStoreBybitFillPrice(trade.id, apiKey, apiSecret, signal.symbol, json.result.orderId);
          }
          closed++;
        } else {
          skipped++;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        await db.update(copyTradesTable)
          .set({ status: "failed", errorMessage: msg })
          .where(eq(copyTradesTable.id, trade.id));
        failed++;
      }
    }),
  );

  return { closed, failed, skipped };
}
