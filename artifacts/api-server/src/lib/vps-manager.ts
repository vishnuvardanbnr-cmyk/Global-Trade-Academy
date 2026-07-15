/**
 * Vultr VPS provisioning for managed copy-agent instances.
 * Each copier gets a dedicated $6/month Kuala Lumpur droplet.
 */
import { db } from "@workspace/db";
import { managedVpsTable, siteSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

const VULTR_API    = "https://api.vultr.com/v2";
const REGION       = "kul";           // Kuala Lumpur, Malaysia

// Linux (agent mode — legacy)
const LINUX_PLAN   = "vc2-1c-1gb";   // 1 CPU, 1 GB RAM — $6/month
const LINUX_OS_ID  = 1743;            // Ubuntu 22.04 LTS x64

// Windows (safe mode — MT5 native, no MetaAPI)
const WIN_PLAN     = "vc2-2c-4gb";   // 2 CPU, 4 GB RAM — $24/month (MT5 needs RAM)
const WIN_OS_ID    = 2284;            // Windows Server 2022 Standard x64

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

/* ── Linux cloud-init (agent/legacy mode) ────────────────────────── */
function buildLinuxUserData(agentToken: string): string {
  const script = `#!/bin/bash
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt-get install -y nodejs
npm install -g pm2
mkdir -p /opt/bright-agent
curl -sL "${PLATFORM_URL}/api/copy-agent/script?token=${agentToken}" -o /opt/bright-agent/bright-agent.js
cd /opt/bright-agent
pm2 start bright-agent.js --name bright-agent --env production
pm2 save
env PATH=$PATH:/usr/bin pm2 startup systemd -u root --hp /root | tail -1 | bash
`;
  return Buffer.from(script, "utf-8").toString("base64");
}

/* ── Windows PowerShell cloudbase-init (safe/MT5-direct mode) ─────── */
function buildWindowsUserData(opts: {
  agentToken: string;
  mt5Login: string;
  mt5Password: string;
  mt5Server: string;
  platform?: "mt4" | "mt5";
}): string {
  const { agentToken, mt5Login, mt5Password, mt5Server, platform = "mt5" } = opts;
  const terminalUrl = platform === "mt4"
    ? "https://download.mql5.com/cdn/web/metaquotes.ltd/mt4/mt4setup.exe"
    : "https://download.mql5.com/cdn/web/metaquotes.software.corp/mt5/mt5setup.exe";
  const terminalExe = platform === "mt4" ? "mt4setup.exe" : "mt5setup.exe";
  const script = `#ps1_sysnative
$ErrorActionPreference = "Continue"
$ProgressPreference    = "SilentlyContinue"
$wc = New-Object Net.WebClient

# 1. Create working directory
New-Item -ItemType Directory -Force -Path "C:\\bright-bridge" | Out-Null

# 2. Python 3.11 (silent install)
$wc.DownloadFile("https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe", "C:\\bright-bridge\\py-installer.exe")
Start-Process "C:\\bright-bridge\\py-installer.exe" -ArgumentList "/quiet InstallAllUsers=1 PrependPath=1 Include_test=0" -Wait

# 3. Install MetaTrader5 Python package
& "C:\\Program Files\\Python311\\Scripts\\pip.exe" install --quiet MetaTrader5

# 4. MT terminal (silent install — ${platform.toUpperCase()})
$wc.DownloadFile("${terminalUrl}", "C:\\bright-bridge\\${terminalExe}")
Start-Process "C:\\bright-bridge\\${terminalExe}" -ArgumentList "/auto" -Wait

# 5. Download Python bridge from platform
$wc.DownloadFile("${PLATFORM_URL}/api/copy-agent/bridge-script", "C:\\bright-bridge\\bridge.py")

# 6. Startup batch (env vars baked in)
@"
@echo off
set BRIGHT_TOKEN=${agentToken}
set BRIGHT_URL=${PLATFORM_URL}
set MT5_LOGIN=${mt5Login}
set MT5_PASSWORD=${mt5Password}
set MT5_SERVER=${mt5Server}
cd C:\\bright-bridge
"C:\\Program Files\\Python311\\python.exe" bridge.py >> C:\\bright-bridge\\bridge.log 2>&1
"@ | Out-File -FilePath "C:\\bright-bridge\\start.bat" -Encoding ascii

# 7. Task Scheduler — auto-start + restart on failure
$action   = New-ScheduledTaskAction -Execute "C:\\bright-bridge\\start.bat"
$trigger  = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet \`
  -RestartCount 99 \`
  -RestartInterval (New-TimeSpan -Minutes 2) \`
  -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName "BrightBridge" \`
  -Action $action -Trigger $trigger \`
  -Settings $settings -RunLevel Highest -Force | Out-Null
Start-ScheduledTask -TaskName "BrightBridge"
`;
  return Buffer.from(script, "utf-8").toString("base64");
}

/* ── Internal: create a Vultr instance ───────────────────────────── */
async function createVultrInstance(opts: {
  vpsRecordId: number;
  copyAccountId: number;
  plan: string;
  osId: number;
  label: string;
  userData: string;
  monthlyCost: string;
}): Promise<void> {
  const key = await getVultrKey();
  const res = await fetch(`${VULTR_API}/instances`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      region:      REGION,
      plan:        opts.plan,
      os_id:       opts.osId,
      label:       opts.label,
      hostname:    opts.label,
      user_data:   opts.userData,
      backups:     "disabled",
      enable_ipv6: false,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error ?? `Vultr API error ${res.status}`);
  }

  const data = await res.json() as { instance: { id: string } };
  await db
    .update(managedVpsTable)
    .set({ instanceId: data.instance.id, monthlyCost: opts.monthlyCost })
    .where(eq(managedVpsTable.id, opts.vpsRecordId));

  logger.info({ copyAccountId: opts.copyAccountId, instanceId: data.instance.id }, "VPS provisioned, waiting for boot");
}

/* ── Provision Linux VPS (legacy agent mode) ─────────────────────── */
export async function provisionVps(opts: {
  copyAccountId: number;
  userId: string;
  agentToken: string;
}): Promise<void> {
  const [vpsRecord] = await db.insert(managedVpsTable).values({
    copyAccountId: opts.copyAccountId,
    userId:        opts.userId,
    status:        "provisioning",
    region:        REGION,
    plan:          LINUX_PLAN,
  }).returning();

  try {
    await createVultrInstance({
      vpsRecordId:   vpsRecord.id,
      copyAccountId: opts.copyAccountId,
      plan:          LINUX_PLAN,
      osId:          LINUX_OS_ID,
      label:         `bright-agent-${opts.copyAccountId}`,
      userData:      buildLinuxUserData(opts.agentToken),
      monthlyCost:   "6.00",
    });
  } catch (err) {
    await db.update(managedVpsTable).set({
      status: "error",
      errorMessage: err instanceof Error ? err.message : String(err),
    }).where(eq(managedVpsTable.id, vpsRecord.id));
    logger.error({ err }, "Linux VPS provision failed");
  }
}

/* ── Provision Windows VPS (safe mode — MT5 direct, no MetaAPI) ──── */
export async function provisionSafeVps(opts: {
  copyAccountId: number;
  userId: string;
  agentToken: string;
  mt5Login: string;
  mt5Password: string;   // raw (decrypted) password
  mt5Server: string;
  platform?: "mt4" | "mt5";
}): Promise<void> {
  const [vpsRecord] = await db.insert(managedVpsTable).values({
    copyAccountId: opts.copyAccountId,
    userId:        opts.userId,
    status:        "provisioning",
    region:        REGION,
    plan:          WIN_PLAN,
  }).returning();

  try {
    await createVultrInstance({
      vpsRecordId:   vpsRecord.id,
      copyAccountId: opts.copyAccountId,
      plan:          WIN_PLAN,
      osId:          WIN_OS_ID,
      label:         `bright-safe-${opts.copyAccountId}`,
      userData:      buildWindowsUserData({
        agentToken:   opts.agentToken,
        mt5Login:     opts.mt5Login,
        mt5Password:  opts.mt5Password,
        mt5Server:    opts.mt5Server,
        platform:     opts.platform,
      }),
      monthlyCost:   "24.00",
    });
  } catch (err) {
    await db.update(managedVpsTable).set({
      status: "error",
      errorMessage: err instanceof Error ? err.message : String(err),
    }).where(eq(managedVpsTable.id, vpsRecord.id));
    logger.error({ err }, "Windows VPS provision failed");
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

/* ── Push a signal directly to a running VPS agent ──────────────── */
export async function pushSignalToVps(opts: {
  copyAccountId: number;
  agentToken: string;
  payload: object;
}): Promise<boolean> {
  const vps = await db
    .select({ ipAddress: managedVpsTable.ipAddress, status: managedVpsTable.status })
    .from(managedVpsTable)
    .where(eq(managedVpsTable.copyAccountId, opts.copyAccountId))
    .limit(1)
    .then((r) => r[0]);

  if (!vps?.ipAddress || vps.status !== "running") return false;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3_000); // 3s timeout
    try {
      const res = await fetch(`http://${vps.ipAddress}:7654/execute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-agent-token": opts.agentToken,
        },
        body: JSON.stringify(opts.payload),
        signal: controller.signal,
      });
      return res.ok;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    // VPS unreachable — caller falls back to queue
    return false;
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
