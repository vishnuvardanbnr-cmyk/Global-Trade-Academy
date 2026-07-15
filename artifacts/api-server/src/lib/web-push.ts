/**
 * Web Push helper — wraps the `web-push` package with VAPID config from env.
 * Falls back gracefully if VAPID keys are not configured.
 */
import webpush from "web-push";
import { db } from "@workspace/db";
import { pushSubscriptionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

let configured = false;

function ensureConfigured() {
  if (configured) return;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:admin@brightinsight.com";
  if (!pub || !priv) return; // not configured — push silently skipped
  webpush.setVapidDetails(subject, pub, priv);
  configured = true;
}

export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY ?? null;
}

/** Send a web push notification to all subscriptions for a user. */
export async function sendWebPush(
  userId: string,
  payload: { title: string; body?: string; data?: Record<string, unknown> },
): Promise<void> {
  ensureConfigured();
  if (!configured) return; // VAPID not set up — skip silently

  let subs: typeof pushSubscriptionsTable.$inferSelect[];
  try {
    subs = await db
      .select()
      .from(pushSubscriptionsTable)
      .where(eq(pushSubscriptionsTable.userId, userId));
  } catch (err) {
    logger.warn({ err }, "web-push: failed to fetch subscriptions");
    return;
  }

  if (subs.length === 0) return;

  const json = JSON.stringify(payload);

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          json,
        );
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          // Subscription expired — remove it
          await db
            .delete(pushSubscriptionsTable)
            .where(eq(pushSubscriptionsTable.id, sub.id))
            .catch(() => {});
        } else {
          logger.warn({ err, endpoint: sub.endpoint }, "web-push: send failed");
        }
      }
    }),
  );
}
