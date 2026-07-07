import { db } from "@workspace/db";
import { platformSubscriptionsTable, siteSettingsTable } from "@workspace/db";
import { eq, and, gte } from "drizzle-orm";
import { logger } from "./logger";

const USDT_BEP20_CONTRACT = "0x55d398326f99059ff775485246999027b3197955";
const POLL_INTERVAL_MS = 60_000;
const PAYMENT_WINDOW_MS = 24 * 60 * 60 * 1000;
export const PLAN_MONTHS: Record<string, number> = { "1m": 1, "3m": 3, "6m": 6, "1y": 12 };

export function startPaymentPoller() {
  logger.info("payment-poller: starting");
  void pollLoop();
}

async function pollLoop() {
  while (true) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    try {
      await pollOnce();
    } catch (err) {
      logger.error({ err }, "payment-poller: error during poll");
    }
  }
}

export async function pollOnce() {
  const row = await db.select().from(siteSettingsTable)
    .where(eq(siteSettingsTable.key, "payment_settings")).limit(1).then((r) => r[0]);
  const settings = row?.value ? (JSON.parse(row.value as string) as Record<string, string>) : {};
  const depositAddress = settings.usdtAddress?.trim();
  const apiKey = settings.bscscanApiKey?.trim() || "YourApiKeyToken";

  if (!depositAddress) return;

  const windowStart = new Date(Date.now() - PAYMENT_WINDOW_MS);
  const pending = await db.select().from(platformSubscriptionsTable)
    .where(and(
      eq(platformSubscriptionsTable.status, "pending_payment"),
      gte(platformSubscriptionsTable.createdAt, windowStart),
    ));

  if (!pending.length) return;

  const url = `https://api.bscscan.com/api?module=account&action=tokentx&address=${depositAddress}&contractaddress=${USDT_BEP20_CONTRACT}&sort=desc&apikey=${apiKey}`;
  const resp = await (fetch as typeof globalThis.fetch)(url, { signal: AbortSignal.timeout(15000) });
  if (!resp.ok) { logger.warn("payment-poller: BscScan API unreachable"); return; }

  const data = await resp.json() as { status: string; result?: Array<Record<string, string>> };
  if (data.status !== "1" || !Array.isArray(data.result)) return;

  const incoming = data.result.filter(
    (t) => t.to?.toLowerCase() === depositAddress.toLowerCase()
      && t.contractAddress?.toLowerCase() === USDT_BEP20_CONTRACT,
  );

  const activatedHashes = new Set<string>();

  for (const sub of pending) {
    const basePrice = parseFloat(sub.priceUsdt as string);
    if (isNaN(basePrice)) continue;
    const expectedWei = BigInt(Math.round(basePrice * 1e18));
    const createdTs = Math.floor(new Date(sub.createdAt).getTime() / 1000);

    const match = incoming.find((t) => {
      if (!t.hash || activatedHashes.has(t.hash)) return false;
      const txTs = parseInt(t.timeStamp ?? "0");
      if (txTs < createdTs) return false;
      const amount = BigInt(t.value ?? "0");
      const diff = amount > expectedWei ? amount - expectedWei : expectedWei - amount;
      const tolerance = expectedWei / BigInt(100);
      return diff <= tolerance;
    });

    if (!match) continue;

    const months = PLAN_MONTHS[sub.plan] ?? 1;
    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + months);

    await db.update(platformSubscriptionsTable).set({
      status: "active", txHash: match.hash, startDate, endDate, updatedAt: new Date(),
    }).where(eq(platformSubscriptionsTable.id, sub.id));

    activatedHashes.add(match.hash);
    logger.info({ subId: sub.id, txHash: match.hash, plan: sub.plan, amount: basePrice },
      "payment-poller: payment detected — subscription activated");
  }
}
