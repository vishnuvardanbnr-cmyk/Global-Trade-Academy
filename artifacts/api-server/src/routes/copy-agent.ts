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
   Serves the Node.js agent script (Linux legacy mode).              */
router.get("/copy-agent/script", async (req, res): Promise<void> => {
  const token = req.query.token as string | undefined;
  const script = buildAgentScript(token ?? "YOUR_AGENT_TOKEN");
  res.setHeader("Content-Type", "application/javascript");
  res.setHeader("Content-Disposition", `attachment; filename="bright-agent.js"`);
  res.send(script);
});

/* ── GET /api/copy-agent/bridge-script ───────────────────────────
   Serves the Python bridge downloaded by the Windows VPS on boot.
   No token auth — the startup script supplies creds via env vars.  */
router.get("/copy-agent/bridge-script", async (_req, res): Promise<void> => {
  res.setHeader("Content-Type", "text/x-python");
  res.send(buildBridgeScript());
});

/* ── Python bridge template ───────────────────────────────────────── */
function buildBridgeScript(): string {
  return `#!/usr/bin/env python3
"""
Bright Insight MT5 Bridge
Connects to locally running MT5 terminal and executes trades directly.
No MetaAPI involved — broker sees this VPS IP.

Push server: listens on port 7654 for signals pushed by platform (~200ms)
Poll loop:   fallback every 10s to catch any missed signals
"""
import os, json, time, logging, threading
import urllib.request, urllib.error
import http.server, socketserver
import MetaTrader5 as mt5

TOKEN    = os.environ.get("BRIGHT_TOKEN", "")
BASE_URL = os.environ.get("BRIGHT_URL",   "https://brightinsight.app")
MT5_LOGIN    = int(os.environ.get("MT5_LOGIN",    "0"))
MT5_PASSWORD =     os.environ.get("MT5_PASSWORD", "")
MT5_SERVER   =     os.environ.get("MT5_SERVER",   "")
PUSH_PORT    = 7654
POLL_INTERVAL = 10  # seconds

logging.basicConfig(level=logging.INFO, format="%(asctime)s [bright-bridge] %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger(__name__)

# ── MT5 init with retry ─────────────────────────────────────────────
def mt5_connect(retries=10, delay=15):
    for attempt in range(retries):
        if mt5.initialize():
            if mt5.login(MT5_LOGIN, password=MT5_PASSWORD, server=MT5_SERVER):
                info = mt5.account_info()
                log.info(f"MT5 connected — account {info.login} on {info.server} | balance {info.balance}")
                return True
            log.warning(f"MT5 login failed: {mt5.last_error()}")
        else:
            log.warning(f"MT5 init failed (attempt {attempt+1}/{retries}): {mt5.last_error()}")
        time.sleep(delay)
    raise RuntimeError(f"Could not connect to MT5 after {retries} attempts")

# ── Execute one trade ────────────────────────────────────────────────
def execute_trade(item):
    signal     = item.get("signal", {})
    multiplier = float(item.get("multiplier", 1))
    symbol     = signal.get("symbol", "")
    action     = signal.get("action", "buy").lower()
    volume     = round(float(signal.get("quantity", 0)) * multiplier, 2)

    if volume <= 0:
        raise ValueError(f"Volume too small: {volume}")

    # Ensure symbol is available
    if not mt5.symbol_select(symbol, True):
        raise ValueError(f"Symbol not available: {symbol}")

    tick = mt5.symbol_info_tick(symbol)
    if not tick:
        raise ValueError(f"No tick data for {symbol}")

    if action == "close":
        # Close all positions for this symbol
        positions = mt5.positions_get(symbol=symbol)
        if not positions:
            raise ValueError(f"No open positions found for {symbol}")
        closed = 0
        for pos in positions:
            close_type  = mt5.ORDER_TYPE_SELL if pos.type == 0 else mt5.ORDER_TYPE_BUY
            close_price = tick.bid if close_type == mt5.ORDER_TYPE_SELL else tick.ask
            req = {
                "action":   mt5.TRADE_ACTION_DEAL,
                "symbol":   symbol,
                "volume":   pos.volume,
                "type":     close_type,
                "position": pos.ticket,
                "price":    close_price,
                "deviation": 20,
                "magic":    234000,
                "comment":  "bright-bridge close",
                "type_time":    mt5.ORDER_TIME_GTC,
                "type_filling": mt5.ORDER_FILLING_IOC,
            }
            result = mt5.order_send(req)
            if result and result.retcode == mt5.TRADE_RETCODE_DONE:
                closed += 1
        return f"closed-{closed}"

    order_type  = mt5.ORDER_TYPE_BUY  if action == "buy"  else mt5.ORDER_TYPE_SELL
    order_price = tick.ask            if action == "buy"  else tick.bid

    req = {
        "action":   mt5.TRADE_ACTION_DEAL,
        "symbol":   symbol,
        "volume":   volume,
        "type":     order_type,
        "price":    order_price,
        "deviation": 20,
        "magic":    234000,
        "comment":  "bright-bridge",
        "type_time":    mt5.ORDER_TIME_GTC,
        "type_filling": mt5.ORDER_FILLING_IOC,
    }
    if signal.get("stopLoss"):
        req["sl"] = float(signal["stopLoss"])
    if signal.get("takeProfit"):
        req["tp"] = float(signal["takeProfit"])

    result = mt5.order_send(req)
    if not result or result.retcode != mt5.TRADE_RETCODE_DONE:
        code = result.retcode if result else -1
        comment = result.comment if result else "no result"
        raise RuntimeError(f"MT5 order failed: retcode={code} ({comment})")

    return str(result.order)

# ── Report result to platform ────────────────────────────────────────
def report_result(item, success, broker_order_id=None, error_message=None):
    signal = item.get("signal", {})
    mult   = float(item.get("multiplier", 1))
    lots   = f"{float(signal.get('quantity', 0)) * mult:.2f}"
    payload = json.dumps({
        "queueId":      item.get("queueId"),
        "tradeId":      item.get("tradeId"),
        "success":      success,
        "brokerOrderId": broker_order_id,
        "errorMessage": error_message,
        "symbol":       signal.get("symbol"),
        "direction":    signal.get("action"),
        "entryPrice":   signal.get("price"),
        "lots":         lots,
    }).encode()
    try:
        req = urllib.request.Request(
            f"{BASE_URL}/api/copy-agent/result?token={TOKEN}",
            data=payload, headers={"Content-Type": "application/json"}, method="POST")
        urllib.request.urlopen(req, timeout=10)
    except Exception as e:
        log.warning(f"Report failed: {e}")

# ── Handle one item ──────────────────────────────────────────────────
def handle_item(item, source):
    sym = item.get("signal", {}).get("symbol", "?")
    act = item.get("signal", {}).get("action", "?")
    try:
        order_id = execute_trade(item)
        log.info(f"[{source}] Executed {sym} {act} → {order_id}")
        report_result(item, True, order_id)
    except Exception as e:
        log.error(f"[{source}] Failed {sym}: {e}")
        report_result(item, False, error_message=str(e))

# ── Push server (port 7654) ──────────────────────────────────────────
class PushHandler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/execute":
            self.send_response(404); self.end_headers(); return
        if self.headers.get("x-agent-token") != TOKEN:
            self.send_response(401); self.end_headers(); return
        length = int(self.headers.get("Content-Length", 0))
        body   = self.rfile.read(length)
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"ok":true}')
        try:
            item = json.loads(body)
            threading.Thread(target=handle_item, args=(item, "PUSH"), daemon=True).start()
        except Exception as e:
            log.error(f"Push parse error: {e}")
    def log_message(self, *args): pass  # silence

# ── Fallback poll loop ───────────────────────────────────────────────
def poll_loop():
    while True:
        try:
            req = urllib.request.Request(f"{BASE_URL}/api/copy-agent/pending?token={TOKEN}")
            with urllib.request.urlopen(req, timeout=15) as r:
                items = json.loads(r.read())
            if items:
                log.info(f"[POLL] {len(items)} missed signal(s)")
                for item in items:
                    handle_item(item, "POLL")
        except Exception as e:
            log.debug(f"Poll error: {e}")
        time.sleep(POLL_INTERVAL)

# ── Entry point ──────────────────────────────────────────────────────
if __name__ == "__main__":
    log.info(f"Starting — platform: {BASE_URL} | MT5 login: {MT5_LOGIN}@{MT5_SERVER}")
    mt5_connect()
    threading.Thread(target=poll_loop, daemon=True).start()
    with socketserver.TCPServer(("0.0.0.0", PUSH_PORT), PushHandler) as server:
        log.info(f"Ready. Push :{PUSH_PORT} | Poll every {POLL_INTERVAL}s")
        server.serve_forever()
`;
}

/* ── Agent script template ────────────────────────────────────────── */
function buildAgentScript(token: string): string {
  return `#!/usr/bin/env node
/**
 * Bright Insight Copy Trading Agent
 *
 * Two-mode execution:
 *   PUSH  — platform pushes signal directly to port 7654 (~200ms latency)
 *   POLL  — fallback every 10s to catch any missed signals
 *
 * Requirements: Node.js 18+
 * Env vars:
 *   BRIGHT_TOKEN  — your agent token (pre-filled below)
 *   BRIGHT_URL    — platform URL (pre-filled below)
 */

const http  = require("http");
const TOKEN = process.env.BRIGHT_TOKEN || ${JSON.stringify(token)};
const BASE  = process.env.BRIGHT_URL   || "https://brightinsight.app";
const PUSH_PORT = 7654;
const POLL_MS   = 10_000; // fallback poll every 10 s

let metaapiToken     = null;
let metaapiAccountId = null;

/* ── Auth ──────────────────────────────────────────────────────── */
async function authenticate() {
  const r = await fetch(\`\${BASE}/api/copy-agent/auth?token=\${TOKEN}\`);
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error("Auth failed: " + (e.error || r.status)); }
  const d = await r.json();
  metaapiToken     = d.metaapiToken;
  metaapiAccountId = d.metaapiAccountId;
  console.log("[bright-agent] Auth OK — account:", d.label, "| MT ID:", metaapiAccountId);
}

/* ── Get MetaAPI client base URL for this account ──────────────── */
let _clientBase = null;
async function getClientBase() {
  if (_clientBase) return _clientBase;
  const r = await fetch(
    \`https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai/users/current/accounts/\${metaapiAccountId}\`,
    { headers: { "auth-token": metaapiToken } }
  );
  if (!r.ok) throw new Error("Provisioning API error: " + r.status);
  const d = await r.json();
  const region = (d.region || "london").toLowerCase();
  _clientBase = \`https://mt-client-api-v1.\${region}.agiliumtrade.ai\`;
  return _clientBase;
}

/* ── Execute one trade signal via MetaAPI ──────────────────────── */
async function executeTrade(item) {
  const { signal, multiplier } = item;
  const rawVol = parseFloat(signal.quantity) * parseFloat(String(multiplier || 1));
  const volume = Math.round(rawVol * 100) / 100;
  if (volume <= 0) throw new Error("Volume too small: " + volume);

  const clientBase = await getClientBase();
  const tradeUrl   = \`\${clientBase}/users/current/accounts/\${metaapiAccountId}/trade\`;

  const actionType = signal.action === "buy" ? "ORDER_TYPE_BUY" : "ORDER_TYPE_SELL";
  const body = {
    actionType,
    symbol: signal.symbol,
    volume,
    ...(signal.price      ? { openPrice:  parseFloat(signal.price) }       : {}),
    ...(signal.stopLoss   ? { stopLoss:   parseFloat(signal.stopLoss) }    : {}),
    ...(signal.takeProfit ? { takeProfit: parseFloat(signal.takeProfit) }  : {}),
  };

  const r = await fetch(tradeUrl, {
    method: "POST",
    headers: { "auth-token": metaapiToken, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.message || d.error || ("MetaAPI error " + r.status));
  return d.positionId || d.orderId || "ok";
}

/* ── Report result back to platform ───────────────────────────── */
async function reportResult(item, success, brokerOrderId, errorMessage) {
  const signal     = item.signal || {};
  const multiplier = parseFloat(String(item.multiplier || 1));
  const lots       = (parseFloat(signal.quantity || "0") * multiplier).toFixed(2);
  await fetch(\`\${BASE}/api/copy-agent/result?token=\${TOKEN}\`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      queueId: item.queueId, tradeId: item.tradeId,
      success, brokerOrderId, errorMessage,
      symbol: signal.symbol, direction: signal.action,
      entryPrice: signal.price, lots,
    }),
  }).catch(() => {});
}

/* ── Handle one queued item ────────────────────────────────────── */
async function handleItem(item, source) {
  try {
    const orderId = await executeTrade(item);
    console.log(\`[bright-agent] [\${source}] Executed \${item.signal?.symbol} \${item.signal?.action} → \${orderId}\`);
    await reportResult(item, true, orderId, undefined);
  } catch (err) {
    console.error(\`[bright-agent] [\${source}] Failed:\`, err.message);
    await reportResult(item, false, undefined, err.message);
  }
}

/* ── PUSH server — platform sends signal directly here ─────────── */
function startPushServer() {
  const server = http.createServer((req, res) => {
    if (req.method !== "POST" || req.url !== "/execute") {
      res.writeHead(404); res.end(); return;
    }
    // Authenticate via header
    if (req.headers["x-agent-token"] !== TOKEN) {
      res.writeHead(401); res.end(JSON.stringify({ error: "Unauthorized" })); return;
    }
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      // ACK immediately so platform doesn't wait on execution
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      // Execute in background
      try {
        const item = JSON.parse(body);
        handleItem(item, "PUSH").catch(() => {});
      } catch { /* bad JSON — ignore */ }
    });
  });
  server.listen(PUSH_PORT, "0.0.0.0", () => {
    console.log(\`[bright-agent] Push server listening on :\${PUSH_PORT}\`);
  });
}

/* ── POLL loop — safety fallback every 10 s ────────────────────── */
async function poll() {
  try {
    const r = await fetch(\`\${BASE}/api/copy-agent/pending?token=\${TOKEN}\`);
    if (!r.ok) { console.error("[bright-agent] Poll error:", r.status); return; }
    const items = await r.json();
    if (!Array.isArray(items) || items.length === 0) return;
    console.log(\`[bright-agent] [POLL] \${items.length} missed signal(s)\`);
    for (const item of items) await handleItem(item, "POLL");
  } catch (err) {
    console.error("[bright-agent] Poll error:", err.message);
  }
}

/* ── Entry point ───────────────────────────────────────────────── */
(async () => {
  console.log("[bright-agent] Starting — platform:", BASE);
  try { await authenticate(); } catch (err) {
    console.error("[bright-agent] Fatal:", err.message); process.exit(1);
  }
  startPushServer();
  setInterval(poll, POLL_MS);
  console.log(\`[bright-agent] Ready. Push on :\${PUSH_PORT} | Poll every \${POLL_MS/1000}s\`);
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
        errorMessage:  managedVpsTable.errorMessage,
      })
      .from(managedVpsTable)
      .where(eq(managedVpsTable.userId, clerkId));

    // keyed by copyAccountId for easy lookup
    const map: Record<number, { status: string; ipAddress: string | null; errorMessage: string | null }> = {};
    for (const row of rows) {
      map[row.copyAccountId] = { status: row.status, ipAddress: row.ipAddress, errorMessage: row.errorMessage };
    }
    res.json(map);
  } catch (err) {
    req.log.error({ err }, "vps-status error");
    res.status(500).json({ error: "Server error" });
  }
});

/* ── POST /api/copy-agent/retry-vps/:copyAccountId ──────────────────
   Clears the error record and re-triggers VPS provisioning.          */
router.post("/copy-agent/retry-vps/:copyAccountId", async (req, res): Promise<void> => {
  try {
    const { getAuth } = await import("../lib/auth");
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const copyAccountId = parseInt(req.params.copyAccountId);
    if (isNaN(copyAccountId)) { res.status(400).json({ error: "Invalid ID" }); return; }

    const { copyAccountsTable } = await import("@workspace/db");
    const account = await db.select().from(copyAccountsTable)
      .where(and(eq(copyAccountsTable.id, copyAccountId), eq(copyAccountsTable.userId, clerkId)))
      .limit(1).then((r) => r[0]);
    if (!account) { res.status(404).json({ error: "Account not found" }); return; }

    // Only delete error records — no instance_id means no real VPS was created
    await db.delete(managedVpsTable)
      .where(and(
        eq(managedVpsTable.copyAccountId, copyAccountId),
        eq(managedVpsTable.status, "error"),
      ));

    // Re-trigger provisioning
    const { provisionVps, provisionSafeVps } = await import("../lib/vps-manager");
    if (account.executionMode === "safe") {
      provisionSafeVps({
        userId:      clerkId,
        copyAccountId,
        agentToken:  account.agentToken  ?? "",
        mt5Login:    account.mt5Login    ?? "",
        mt5Password: account.mt5Password ?? "",
        mt5Server:   account.mt5Server   ?? "",
      }).catch((err: unknown) => req.log.error({ err }, "VPS retry (safe) failed"));
    } else {
      provisionVps({
        userId:       clerkId,
        copyAccountId,
        agentToken:   account.agentToken ?? "",
      }).catch((err: unknown) => req.log.error({ err }, "VPS retry (agent) failed"));
    }

    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "retry-vps error");
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
