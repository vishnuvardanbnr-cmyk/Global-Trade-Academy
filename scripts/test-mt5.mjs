/**
 * MT5 Trade Test Script
 * Tests: place → modify (SL/TP) → close on both demo accounts via MetaAPI REST API
 *
 * Usage:
 *   METAAPI_TOKEN=<your_token> node scripts/test-mt5.mjs
 *
 * Accounts under test (MetaQuotes-Demo):
 *   Account A: login 109447406  password -vWi0lOp
 *   Account B: login 5052834158 password 7kGa!sRa
 */

const TOKEN = process.env.METAAPI_TOKEN;
if (!TOKEN) {
  console.error("❌  METAAPI_TOKEN env var is required.");
  console.error("    Run:  METAAPI_TOKEN=your_token node scripts/test-mt5.mjs");
  process.exit(1);
}

const PROVISION_BASE = "https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai";
const CLIENT_BASE    = "https://mt-client-api-v1.london.agiliumtrade.ai";
const SYMBOL         = "XAUUSD";
const VOLUME         = 0.5;
const POLL_MS        = 5_000;
const DEPLOY_TIMEOUT = 180_000; // 3 min max

const ACCOUNTS = [
  { label: "Account A", login: "109447406",  password: "-vWi0lOp", server: "MetaQuotes-Demo", platform: "mt5" },
  { label: "Account B", login: "5052834158", password: "7kGa!sRa", server: "MetaQuotes-Demo", platform: "mt5" },
];

const authHeaders = () => ({
  "auth-token": TOKEN,
  "Content-Type": "application/json",
});

/* ─── HTTP helpers ──────────────────────────────────────────────── */

async function apiFetch(url, opts = {}) {
  const res = await fetch(url, { ...opts, headers: { ...authHeaders(), ...(opts.headers ?? {}) } });
  const txt = await res.text();
  let body;
  try { body = JSON.parse(txt); } catch { body = txt; }
  return { ok: res.ok, status: res.status, body };
}

function log(label, msg, obj) {
  const prefix = `[${label}]`;
  if (obj !== undefined) {
    console.log(prefix, msg, typeof obj === "object" ? JSON.stringify(obj, null, 2) : obj);
  } else {
    console.log(prefix, msg);
  }
}

/* ─── Provisioning ──────────────────────────────────────────────── */

async function findOrCreateAccount(acct) {
  log(acct.label, `🔍  Checking for existing MetaAPI account (login ${acct.login})…`);

  const list = await apiFetch(`${PROVISION_BASE}/users/current/accounts?limit=100`);
  if (!list.ok) throw new Error(`List accounts failed: ${JSON.stringify(list.body)}`);

  const existing = (list.body ?? []).find(
    (a) => a.login === acct.login && a.server === acct.server,
  );
  if (existing) {
    log(acct.label, `✅  Existing MetaAPI account found: ${existing.id}`);
    return existing.id;
  }

  log(acct.label, `➕  Provisioning new MetaAPI account…`);
  const created = await apiFetch(`${PROVISION_BASE}/users/current/accounts`, {
    method: "POST",
    body: JSON.stringify({
      login: acct.login,
      password: acct.password,
      server: acct.server,
      platform: acct.platform,
      name: `BIC Test – ${acct.label}`,
      type: "cloud",
      magic: 0,
      application: "MetaApi",
    }),
  });
  if (!created.ok) throw new Error(`Create account failed: ${JSON.stringify(created.body)}`);
  const id = created.body.id;
  log(acct.label, `✅  Provisioned, MetaAPI account ID: ${id}`);
  return id;
}

/* ─── Wait for DEPLOYED state ───────────────────────────────────── */

async function waitForDeployed(accountId, label) {
  log(label, `⏳  Waiting for account to reach DEPLOYED state…`);
  const start = Date.now();
  while (Date.now() - start < DEPLOY_TIMEOUT) {
    const r = await apiFetch(`${PROVISION_BASE}/users/current/accounts/${accountId}`);
    if (!r.ok) throw new Error(`Get account failed: ${JSON.stringify(r.body)}`);
    const state = r.body.state;
    const conn  = r.body.connectionStatus;
    log(label, `   state=${state}  connectionStatus=${conn}`);
    if (state === "DEPLOYED" && conn === "CONNECTED") {
      log(label, `✅  Connected!`);
      return;
    }
    if (state === "DEPLOYING" || state === "DEPLOYED") {
      // still connecting — keep polling
    } else if (state === "UNDEPLOYED") {
      // deploy it
      log(label, `   Deploying account…`);
      const dep = await apiFetch(
        `${PROVISION_BASE}/users/current/accounts/${accountId}/deploy`,
        { method: "POST" },
      );
      if (!dep.ok && dep.status !== 204)
        throw new Error(`Deploy failed: ${JSON.stringify(dep.body)}`);
    }
    await sleep(POLL_MS);
  }
  throw new Error(`Timeout waiting for ${label} (${accountId}) to connect`);
}

/* ─── Trading operations ────────────────────────────────────────── */

async function placeMarketBuy(accountId, label) {
  log(label, `📈  Placing MARKET BUY ${VOLUME} lot ${SYMBOL}…`);
  const r = await apiFetch(`${CLIENT_BASE}/users/current/accounts/${accountId}/trade`, {
    method: "POST",
    body: JSON.stringify({
      actionType: "ORDER_TYPE_BUY",
      symbol: SYMBOL,
      volume: VOLUME,
    }),
  });
  if (!r.ok) throw new Error(`Place order failed: ${JSON.stringify(r.body)}`);
  log(label, `✅  Order placed`, r.body);
  return r.body;
}

async function getPositions(accountId, label) {
  log(label, `📋  Fetching open positions…`);
  const r = await apiFetch(
    `${CLIENT_BASE}/users/current/accounts/${accountId}/positions`,
  );
  if (!r.ok) throw new Error(`Get positions failed: ${JSON.stringify(r.body)}`);
  log(label, `   ${r.body.length} open position(s)`);
  return r.body;
}

async function getSymbolPrice(accountId, label) {
  const r = await apiFetch(
    `${CLIENT_BASE}/users/current/accounts/${accountId}/symbols/${SYMBOL}/current-price`,
  );
  if (!r.ok) return null;
  return r.body;
}

async function modifyPosition(accountId, positionId, stopLoss, takeProfit, label) {
  log(label, `✏️   Modifying position ${positionId} → SL=${stopLoss} TP=${takeProfit}…`);
  const r = await apiFetch(`${CLIENT_BASE}/users/current/accounts/${accountId}/trade`, {
    method: "POST",
    body: JSON.stringify({
      actionType: "POSITION_MODIFY",
      positionId: String(positionId),
      stopLoss,
      takeProfit,
    }),
  });
  if (!r.ok) throw new Error(`Modify position failed: ${JSON.stringify(r.body)}`);
  log(label, `✅  Modified`, r.body);
  return r.body;
}

async function closePosition(accountId, positionId, label) {
  log(label, `🔴  Closing position ${positionId}…`);
  const r = await apiFetch(`${CLIENT_BASE}/users/current/accounts/${accountId}/trade`, {
    method: "POST",
    body: JSON.stringify({
      actionType: "POSITION_CLOSE_ID",
      positionId: String(positionId),
    }),
  });
  if (!r.ok) throw new Error(`Close position failed: ${JSON.stringify(r.body)}`);
  log(label, `✅  Closed`, r.body);
  return r.body;
}

/* ─── Per-account test sequence ─────────────────────────────────── */

async function runAccountTest(acct) {
  const bar = "═".repeat(60);
  console.log(`\n${bar}`);
  console.log(`  ${acct.label}  |  login: ${acct.login}  |  server: ${acct.server}`);
  console.log(`${bar}`);

  try {
    /* 1. Provision / find account */
    const accountId = await findOrCreateAccount(acct);

    /* 2. Wait for connection */
    await waitForDeployed(accountId, acct.label);

    /* 3. Get current price for sensible SL/TP */
    const price = await getSymbolPrice(accountId, acct.label);
    const bid   = price?.bid ?? 2000;
    const sl    = parseFloat((bid - 5).toFixed(2));
    const tp    = parseFloat((bid + 10).toFixed(2));
    log(acct.label, `💹  ${SYMBOL} bid=${bid}  → planned SL=${sl}  TP=${tp}`);

    /* 4. Place XAUUSD 0.5 lot BUY */
    await placeMarketBuy(accountId, acct.label);
    await sleep(2000);

    /* 5. Confirm position opened */
    let positions = await getPositions(accountId, acct.label);
    const xauPos  = positions.find((p) => p.symbol === SYMBOL);
    if (!xauPos) throw new Error(`No ${SYMBOL} position found after placing order!`);
    log(acct.label, `   Position ID: ${xauPos.id}  volume: ${xauPos.volume}  openPrice: ${xauPos.openPrice}`);

    /* 6. Modify — set SL and TP */
    await modifyPosition(accountId, xauPos.id, sl, tp, acct.label);
    await sleep(2000);

    /* 7. Confirm modification */
    positions = await getPositions(accountId, acct.label);
    const modPos = positions.find((p) => p.id === xauPos.id);
    if (modPos) {
      log(acct.label, `   After modify: SL=${modPos.stopLoss}  TP=${modPos.takeProfit}`);
    }

    /* 8. Close position */
    await closePosition(accountId, xauPos.id, acct.label);
    await sleep(2000);

    /* 9. Confirm closed */
    positions = await getPositions(accountId, acct.label);
    const stillOpen = positions.find((p) => p.id === xauPos.id);
    if (stillOpen) {
      log(acct.label, `⚠️   Position still appears open — may be closing in progress`);
    } else {
      log(acct.label, `✅  Position confirmed closed`);
    }

    console.log(`\n✅  ${acct.label} — ALL STEPS PASSED\n`);
  } catch (err) {
    console.error(`\n❌  ${acct.label} FAILED: ${err.message}\n`);
  }
}

/* ─── Utility ───────────────────────────────────────────────────── */

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ─── Main ──────────────────────────────────────────────────────── */

(async () => {
  console.log("═".repeat(60));
  console.log("  MT5 Trade Test  —  XAUUSD 0.5 lot  via MetaAPI");
  console.log(`  Accounts: ${ACCOUNTS.map((a) => a.label).join(", ")}`);
  console.log("═".repeat(60));

  for (const acct of ACCOUNTS) {
    await runAccountTest(acct);
  }

  console.log("\n🏁  All accounts tested.");
})();
