import { pollVpsStatuses } from "./vps-manager";
import { logger } from "./logger";

const INTERVAL_MS = 30_000; // 30 seconds

export function startVpsPoller(): void {
  setInterval(async () => {
    try {
      await pollVpsStatuses();
    } catch (err) {
      logger.warn({ err }, "VPS poller error");
    }
  }, INTERVAL_MS);

  logger.info("VPS poller started (30s interval)");
}
