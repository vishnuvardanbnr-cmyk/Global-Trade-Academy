/**
 * Copy-Agent API
 * VPS agents authenticate with a unique token and poll this endpoint
 * for pending trade signals, then execute from their own IP.
 */
import { Router } from "express";
import { db } from "@workspace/db";
import {
  copyAccountsTable, agentSignalQueueTable, copyTradesTable,
} from "@workspace/db";
import { eq, and, lt, inArray } from "drizzle-orm";
import { notifyUser } from "../lib/notify";
import { activityTable } from "@workspace/db";

const router = Router();

/* ── helpers ─────────────────────────────────────────────────────── */
async function getAccountByToken(token: string) {
  if (!token) return null;
  const rows = await db
    .select()
    .from(copyAccountsTable)
    .where(eq(copyAccountsTable.agentToken, token))
    .limit(1);
  return rows[0] ?? null;
}

async function getMetaapiToken(): Promise<string> {
  // Reuse the same helper logic as fan-out: env var first, then DB
  const token = process.env.METAAPI_TOKEN_NEW ?? process.env.METAAPI_TOKEN ?? "";
  if (!token) throw new Error("METAAPI_TOKEN not configured");
  return token;
}

/* ── GET /api/copy-agent/auth ─────────────────────────────────────
   Agent calls this on startup. Returns account config incl. MetaAPI
   credentials so the agent can call MetaAPI directly from the VPS.  */
router.get("/copy-agent/auth", async (req, res): Promise<void> => {
  const token = req.query.token as string | undefined;
  const account = await getAccountByToken(token ?? "");
  if (!account) { res.status(401).json({ error: "Invalid agent token" }); return; }
  if (account.executionMode !== "agent") {
    res.status(403).json({ error: "Account is not in agent mode" }); return;
  }

  try {
    const metaapiToken = await getMetaapiToken();

    // Update lastSeen
    await db
      .update(copyAccountsTable)
      .set({ agentLastSeen: new Date() })
      .where(eq(copyAccountsTable.id, account.id));

    res.json({
      accountId: account.id,
      label: account.label,
      metaapiAccountId: account.metaapiAccountId,
      metaapiToken,
      metaapiBase: "https://mt-client-api-v1.london.agiliumtrade.ai",
    });
  } catch (err) {
    req.log.error({ err }, "copy-agent auth error");
    res.status(500).json({ error: "Server error" });
  }
});

/* ── GET /api/copy-agent/pending ──────────────────────────────────
   Agent polls this every 2s. Returns pending (not expired) signals.
   Marks returned signals as "executing" to prevent duplicate pickup. */
router.get("/copy-agent/pending", async (req, res): Promise<void> => {
  const token = req.query.token as string | undefined;
  const account = await getAccountByToken(token ?? "");
  if (!account) { res.status(401).json({ error: "Invalid agent token" }); return; }

  try {
    // Touch lastSeen
    await db
      .update(copyAccountsTable)
      .set({ agentLastSeen: new Date() })
      .where(eq(copyAccountsTable.id, account.id));

    // Expire stale signals
    await db
      .update(agentSignalQueueTable)
      .set({ status: "expired" })
      .where(
        and(
          eq(agentSignalQueueTable.copyAccountId, account.id),
          eq(agentSignalQueueTable.status, "pending"),
          lt(agentSignalQueueTable.expiresAt, new Date()),
        ),
      );

    const pending = await db
      .select()
      .from(agentSignalQueueTable)
      .where(
        and(
          eq(agentSignalQueueTable.copyAccountId, account.id),
          eq(agentSignalQueueTable.status, "pending"),
        ),
      )
      .limit(10);

    if (pending.length > 0) {
      await db
        .update(agentSignalQueueTable)
        .set({ status: "executing" })
        .where(inArray(agentSignalQueueTable.id, pending.map((p) => p.id)));
    }

    res.json(pending.map((p) => ({
      queueId: p.id,
      tradeId: p.tradeId,
      signalId: p.signalId,
      ...JSON.parse(p.payload),
    })));
  } catch (err) {
    req.log.error({ err }, "copy-agent pending error");
    res.status(500).json({ error: "Server error" });
  }
});

/* ── POST /api/copy-agent/result ──────────────────────────────────
   Agent reports execution outcome after attempting the trade.        */
router.post("/copy-agent/result", async (req, res): Promise<void> => {
  const token = req.query.token as string | undefined;
  const account = await getAccountByToken(token ?? "");
  if (!account) { res.status(401).json({ error: "Invalid agent token" }); return; }

  const { queueId, tradeId, success, brokerOrderId, errorMessage, symbol, direction, entryPrice, lots } =
    req.body as {
      queueId: number; tradeId: number; success: boolean;
      brokerOrderId?: string; errorMessage?: string;
      symbol?: string; direction?: string; entryPrice?: string; lots?: string;
    };

  if (!queueId || !tradeId) {
    res.status(400).json({ error: "queueId and tradeId required" }); return;
  }

  try {
    // Update queue entry
    await db
      .update(agentSignalQueueTable)
      .set({
        status: success ? "executed" : "failed",
        result: JSON.stringify({ brokerOrderId, errorMessage }),
      })
      .where(
        and(
          eq(agentSignalQueueTable.id, queueId),
          eq(agentSignalQueueTable.copyAccountId, account.id),
        ),
      );

    // Update copy_trades record
    await db
      .update(copyTradesTable)
      .set(
        success
          ? { status: "executed", brokerOrderId: brokerOrderId ?? null }
          : { status: "failed", errorMessage: errorMessage ?? "Agent execution failed" },
      )
      .where(eq(copyTradesTable.id, tradeId));

    // Notify user
    if (success && symbol) {
      const isClose = direction?.toLowerCase() === "close";
      const notifType = isClose ? "copy_trade_closed" : "copy_trade_executed";
      const notifTitle = isClose ? `Trade Closed: ${symbol}` : `Trade Executed: ${symbol} ${direction}`;
      const notifMsg = `${symbol} | ${direction} | Entry: ${entryPrice ?? "Market"} | Lots: ${lots ?? "?"}`;
      await notifyUser(account.userId, notifType, notifTitle, notifMsg, String(tradeId));
      await db.insert(activityTable).values({
        type: "copy_trade",
        userId: account.userId,
        description: notifTitle,
        metadata: JSON.stringify({ symbol, direction, entryPrice, lots, tradeId, mode: "agent" }),
      }).catch(() => {});
    }

    // Update account status
    await db
      .update(copyAccountsTable)
      .set(
        success
          ? { status: "active", lastError: null }
          : { status: "error", lastError: errorMessage ?? "Execution failed" },
      )
      .where(eq(copyAccountsTable.id, account.id));

    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "copy-agent result error");
    res.status(500).json({ error: "Server error" });
  }
});

/* ── GET /api/copy-agent/script ───────────────────────────────────
   Serves the downloadable agent Node.js script.                     */
router.get("/copy-agent/script", async (req, res): Promise<void> => {
  const token = req.query.token as string | undefined;
  // Token is optional here — but we add it pre-filled if present
  const script = buildAgentScript(token ?? "YOUR_AGENT_TOKEN");
  res.setHeader("Content-Type", "application/javascript");
  res.setHeader("Content-Disposition", `attachment; filename="bright-agent.js"`);
  res.send(script);
});

/* ── Agent script template ────────────────────────────────────────── */
function buildAgentScript(token: string): string {
  return `#!/usr/bin/env node
/**
 * Bright Insight Copy Trading Agent
 * Run on your own VPS to execute trades from your IP.
 *
 * Requirements: Node.js 18+
 * Usage:  node bright-agent.js
 *
 * Set these environment variables (or edit the defaults below):
 *   BRIGHT_TOKEN  - Your agent token (pre-filled)
 *   BRIGHT_URL    - Platform URL (pre-filled)
 */

const TOKEN = process.env.BRIGHT_TOKEN || ${JSON.stringify(token)};
const BASE  = process.env.BRIGHT_URL  || "https://brightinsight.app";
const POLL_MS = 2000; // poll every 2 seconds

let metaapiToken = null;
let metaapiAccountId = null;
let metaapiBase = "https://mt-client-api-v1.london.agiliumtrade.ai";

/* ── Auth ──────────────────────────────────────────────────────── */
async function authenticate() {
  const r = await fetch(\`\${BASE}/api/copy-agent/auth?token=\${TOKEN}\`);
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error("Auth failed: " + (e.error || r.status));
  }
  const d = await r.json();
  metaapiToken     = d.metaapiToken;
  metaapiAccountId = d.metaapiAccountId;
  metaapiBase      = d.metaapiBase || metaapiBase;
  console.log("[bright-agent] Authenticated — account:", d.label, "| MetaAPI ID:", metaapiAccountId);
}

/* ── Get broker client URL ─────────────────────────────────────── */
async function getClientBase() {
  const r = await fetch(
    \`https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai/users/current/accounts/\${metaapiAccountId}\`,
    { headers: { "auth-token": metaapiToken } }
  );
  if (!r.ok) throw new Error("Could not fetch account details: " + r.status);
  const d = await r.json();
  const region = (d.region || "london").toLowerCase();
  return \`https://mt-client-api-v1.\${region}.agiliumtrade.ai\`;
}

/* ── Execute one trade signal via MetaAPI ──────────────────────── */
async function executeTrade(item) {
  const { signal, multiplier } = item;
  const rawVol = parseFloat(signal.quantity) * parseFloat(String(multiplier || 1));
  const volume = Math.round(rawVol * 100) / 100;
  if (volume <= 0) throw new Error("Volume too small: " + volume);

  const clientBase = await getClientBase();
  const tradeUrl = \`\${clientBase}/users/current/accounts/\${metaapiAccountId}/trade\`;

  const action = signal.action === "close" ? "ORDER_TYPE_SELL" // simplified close
    : signal.action === "buy"  ? "ORDER_TYPE_BUY"
    : "ORDER_TYPE_SELL";

  const body = {
    actionType: action,
    symbol:     signal.symbol,
    volume,
    ...(signal.price     ? { openPrice: parseFloat(signal.price) }      : {}),
    ...(signal.stopLoss  ? { stopLoss:  parseFloat(signal.stopLoss) }   : {}),
    ...(signal.takeProfit? { takeProfit:parseFloat(signal.takeProfit) }  : {}),
  };

  const r = await fetch(tradeUrl, {
    method: "POST",
    headers: { "auth-token": metaapiToken, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const d = await r.json().catch(() => ({}));
  if (!r.ok && r.status !== 200) throw new Error(d.message || d.error || ("MetaAPI error " + r.status));
  return d.orderId || d.positionId || "ok";
}

/* ── Report result back to platform ───────────────────────────── */
async function reportResult(item, success, brokerOrderId, errorMessage) {
  const signal = item.signal || {};
  const multiplier = parseFloat(String(item.multiplier || 1));
  const lots = (parseFloat(signal.quantity || "0") * multiplier).toFixed(2);

  await fetch(\`\${BASE}/api/copy-agent/result?token=\${TOKEN}\`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      queueId:      item.queueId,
      tradeId:      item.tradeId,
      success,
      brokerOrderId,
      errorMessage,
      symbol:       signal.symbol,
      direction:    signal.action,
      entryPrice:   signal.price,
      lots,
    }),
  }).catch(() => {});
}

/* ── Poll loop ─────────────────────────────────────────────────── */
async function poll() {
  try {
    const r = await fetch(\`\${BASE}/api/copy-agent/pending?token=\${TOKEN}\`);
    if (!r.ok) { console.error("[bright-agent] Poll error:", r.status); return; }
    const items = await r.json();
    if (!Array.isArray(items) || items.length === 0) return;

    console.log(\`[bright-agent] \${items.length} signal(s) received\`);

    for (const item of items) {
      try {
        const orderId = await executeTrade(item);
        console.log("[bright-agent] Executed:", item.signal?.symbol, item.signal?.action, "→ order", orderId);
        await reportResult(item, true, orderId, undefined);
      } catch (err) {
        console.error("[bright-agent] Execution failed:", err.message);
        await reportResult(item, false, undefined, err.message);
      }
    }
  } catch (err) {
    console.error("[bright-agent] Poll error:", err.message);
  }
}

/* ── Entry point ───────────────────────────────────────────────── */
(async () => {
  console.log("[bright-agent] Starting… platform:", BASE);
  try {
    await authenticate();
  } catch (err) {
    console.error("[bright-agent] Fatal:", err.message);
    process.exit(1);
  }
  console.log("[bright-agent] Polling every", POLL_MS, "ms");
  setInterval(poll, POLL_MS);
})();
`;
}

/* ── GET /api/copy-agent/vps-status ──────────────────────────────
   Returns VPS status for all agent-mode accounts belonging to the
   authenticated user (no agent token needed — uses session auth).  */
router.get("/copy-agent/vps-status", async (req, res): Promise<void> => {
  try {
    const { getAuth } = await import("../lib/auth");
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const { managedVpsTable } = await import("@workspace/db");
    const rows = await db
      .select({
        copyAccountId: managedVpsTable.copyAccountId,
        status:        managedVpsTable.status,
        ipAddress:     managedVpsTable.ipAddress,
      })
      .from(managedVpsTable)
      .where(eq(managedVpsTable.userId, clerkId));

    // keyed by copyAccountId for easy lookup
    const map: Record<number, { status: string; ipAddress: string | null }> = {};
    for (const row of rows) {
      map[row.copyAccountId] = { status: row.status, ipAddress: row.ipAddress };
    }
    res.json(map);
  } catch (err) {
    req.log.error({ err }, "vps-status error");
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
