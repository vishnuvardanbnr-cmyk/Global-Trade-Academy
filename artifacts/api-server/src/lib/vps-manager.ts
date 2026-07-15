/**
 * Vultr VPS provisioning for managed copy-agent instances.
 * Each copier gets a dedicated $6/month Kuala Lumpur droplet.
 */
import { db } from "@workspace/db";
import { managedVpsTable, siteSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

const VULTR_API   = "https://api.vultr.com/v2";
const REGION      = "kul";           // Kuala Lumpur, Malaysia
const PLAN        = "vc2-1c-1gb";   // 1 CPU, 1 GB RAM — $6/month
const OS_ID       = 1743;            // Ubuntu 22.04 LTS x64
const PLATFORM_URL = process.env.PLATFORM_URL ?? "https://brightinsight.app";

/* ── Read Vultr key from DB (integration_settings) ───────────────── */
export async function getVultrKey(): Promise<string> {
  const row = await db
    .select()
    .from(siteSettingsTable)
    .where(eq(siteSettingsTable.key, "integration_settings"))
    .limit(1)
    .then((r) => r[0]);
  const stored = row ? (JSON.parse(row.value) as Record<string, string>) : {};
  const key = stored.vultrApiKey ?? process.env.VULTR_API_KEY ?? "";
  if (!key) throw new Error("Vultr API key not configured — set it in Admin → Trading → Vultr");
  return key;
}

/* ── Cloud-init startup script (base64) ─────────────────────────── */
function buildUserData(agentToken: string): string {
  const script = `#!/bin/bash
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt-get install -y nodejs
npm install -g pm2
mkdir -p /opt/bright-agent
curl -sL "${PLATFORM_URL}/api/copy-agent/script?token=${agentToken}" -o /opt/bright-agent/bright-agent.js
cd /opt/bright-agent
pm2 start bright-agent.js --name bright-agent \\
  --env production \\
  -- --token "${agentToken}" --url "${PLATFORM_URL}"
pm2 save
env PATH=$PATH:/usr/bin pm2 startup systemd -u root --hp /root | tail -1 | bash
`;
  return Buffer.from(script, "utf-8").toString("base64");
}

/* ── Provision a new VPS for a copier account ────────────────────── */
export async function provisionVps(opts: {
  copyAccountId: number;
  userId: string;
  agentToken: string;
}): Promise<void> {
  const key = await getVultrKey();

  // Create DB record immediately so UI shows "provisioning"
  const [vpsRecord] = await db
    .insert(managedVpsTable)
    .values({
      copyAccountId: opts.copyAccountId,
      userId: opts.userId,
      status: "provisioning",
      region: REGION,
      plan: PLAN,
    })
    .returning();

  try {
    const res = await fetch(`${VULTR_API}/instances`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        region: REGION,
        plan: PLAN,
        os_id: OS_ID,
        label: `bright-agent-${opts.copyAccountId}`,
        hostname: `bright-agent-${opts.copyAccountId}`,
        user_data: buildUserData(opts.agentToken),
        backups: "disabled",
        enable_ipv6: false,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(err.error ?? `Vultr API error ${res.status}`);
    }

    const data = await res.json() as {
      instance: { id: string; main_ip: string; status: string };
    };

    await db
      .update(managedVpsTable)
      .set({ instanceId: data.instance.id })
      .where(eq(managedVpsTable.id, vpsRecord.id));

    logger.info(
      { copyAccountId: opts.copyAccountId, instanceId: data.instance.id },
      "VPS provisioned, waiting for boot",
    );
  } catch (err) {
    await db
      .update(managedVpsTable)
      .set({
        status: "error",
        errorMessage: err instanceof Error ? err.message : String(err),
      })
      .where(eq(managedVpsTable.id, vpsRecord.id));
    logger.error({ err }, "VPS provision failed");
    // Don't rethrow — account was already created successfully
  }
}

/* ── Destroy a VPS ───────────────────────────────────────────────── */
export async function destroyVps(copyAccountId: number): Promise<void> {
  const vps = await db
    .select()
    .from(managedVpsTable)
    .where(eq(managedVpsTable.copyAccountId, copyAccountId))
    .limit(1)
    .then((r) => r[0]);

  if (!vps?.instanceId) return;

  try {
    const key = await getVultrKey();
    await fetch(`${VULTR_API}/instances/${vps.instanceId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${key}` },
    });
    await db
      .update(managedVpsTable)
      .set({ status: "destroyed" })
      .where(eq(managedVpsTable.id, vps.id));
    logger.info({ instanceId: vps.instanceId }, "VPS destroyed");
  } catch (err) {
    logger.warn({ err }, "VPS destroy failed");
  }
}

/* ── Reboot the agent on a running VPS (Vultr reboot) ────────────── */
export async function rebootVps(instanceId: string): Promise<void> {
  const key = await getVultrKey();
  await fetch(`${VULTR_API}/instances/${instanceId}/reboot`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
  });
}

/* ── Poll Vultr for provisioning → running transitions ──────────── */
export async function pollVpsStatuses(): Promise<void> {
  const provisioning = await db
    .select()
    .from(managedVpsTable)
    .where(eq(managedVpsTable.status, "provisioning"));

  if (provisioning.length === 0) return;

  let key: string;
  try { key = await getVultrKey(); } catch { return; }

  for (const vps of provisioning) {
    if (!vps.instanceId) continue;
    try {
      const res = await fetch(`${VULTR_API}/instances/${vps.instanceId}`, {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!res.ok) continue;

      const data = await res.json() as {
        instance: { status: string; main_ip: string };
      };
      const { status, main_ip } = data.instance;

      if (status === "active" && main_ip && main_ip !== "0.0.0.0") {
        await db
          .update(managedVpsTable)
          .set({ status: "running", ipAddress: main_ip })
          .where(eq(managedVpsTable.id, vps.id));
        logger.info({ vpsId: vps.id, ip: main_ip }, "VPS now running");
      }
    } catch (err) {
      logger.warn({ err, vpsId: vps.id }, "VPS status poll error");
    }
  }
}
