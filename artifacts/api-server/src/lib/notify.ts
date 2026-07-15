import { db } from "@workspace/db";
import { notificationsTable } from "@workspace/db";
import { sendWebPush } from "./web-push";

export async function notifyUser(
  userId: string,
  type: string,
  title: string,
  message?: string,
  relatedId?: string,
) {
  try {
    await db.insert(notificationsTable).values({ userId, type, title, message: message ?? null, relatedId: relatedId ?? null });
  } catch {
    // non-critical — never crash a request due to notification failure
  }
  // Fire web push in background — never blocks caller
  sendWebPush(userId, { title, body: message, data: { type, relatedId } }).catch(() => {});
}

export async function notifyUsers(
  userIds: string[],
  type: string,
  title: string,
  message?: string,
  relatedId?: string,
) {
  if (!userIds.length) return;
  try {
    await db.insert(notificationsTable).values(
      userIds.map((userId) => ({ userId, type, title, message: message ?? null, relatedId: relatedId ?? null })),
    );
  } catch {
    // non-critical
  }
  // Web push per user in background
  for (const userId of userIds) {
    sendWebPush(userId, { title, body: message, data: { type, relatedId } }).catch(() => {});
  }
}
