import { Router } from "express";
import { getAuth } from "../lib/auth";
import { db } from "@workspace/db";
import {
  communityChannelsTable, usersTable, coursesTable, batchesTable,
  enrollmentsTable, batchStudentsTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router = Router();

async function getUserRole(clerkId: string): Promise<string | null> {
  const user = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, clerkId)).limit(1).then((r) => r[0]);
  return user?.role ?? null;
}

async function enrichChannel(ch: typeof communityChannelsTable.$inferSelect) {
  const [courseName, batchName] = await Promise.all([
    ch.courseId
      ? db.select({ title: coursesTable.title }).from(coursesTable).where(eq(coursesTable.id, ch.courseId)).limit(1).then((r) => r[0]?.title ?? null)
      : null,
    ch.batchId
      ? db.select({ name: batchesTable.name }).from(batchesTable).where(eq(batchesTable.id, ch.batchId)).limit(1).then((r) => r[0]?.name ?? null)
      : null,
  ]);
  return { ...ch, courseName, batchName };
}

export async function canAccessChannel(
  clerkId: string,
  role: string,
  channel: typeof communityChannelsTable.$inferSelect,
): Promise<boolean> {
  if (role === "admin") return true;
  if (channel.accessType === "common") return true;
  if (channel.accessType === "course" && channel.courseId != null) {
    if (role === "instructor") return true;
    const enrolled = await db.select({ id: enrollmentsTable.id }).from(enrollmentsTable)
      .where(and(eq(enrollmentsTable.courseId, channel.courseId), eq(enrollmentsTable.userId, clerkId)))
      .limit(1).then((r) => r[0]);
    return !!enrolled;
  }
  if (channel.accessType === "batch" && channel.batchId != null) {
    const inBatch = await db.select({ id: batchStudentsTable.id }).from(batchStudentsTable)
      .where(and(eq(batchStudentsTable.batchId, channel.batchId), eq(batchStudentsTable.userId, clerkId)))
      .limit(1).then((r) => r[0]);
    return !!inBatch;
  }
  return false;
}

/* ── GET /api/channels ──────────────────────────────────────── */
router.get("/channels", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const role = await getUserRole(clerkId) ?? "student";

    const all = await db.select().from(communityChannelsTable).orderBy(communityChannelsTable.position, communityChannelsTable.createdAt);
    const accessible = await Promise.all(all.map(async (ch) => {
      const ok = await canAccessChannel(clerkId, role, ch);
      return ok ? enrichChannel(ch) : null;
    }));
    res.json(accessible.filter(Boolean));
  } catch (err) {
    req.log.error({ err }, "Error listing channels");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── POST /api/channels ─────────────────────────────────────── */
router.post("/channels", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const role = await getUserRole(clerkId);
    if (role !== "admin") { res.status(403).json({ error: "Forbidden" }); return; }

    const { name, emoji, slug, description, position, accessType, courseId, batchId } = req.body;
    if (!name || !accessType) { res.status(400).json({ error: "name and accessType required" }); return; }

    const autoSlug = (slug || name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const maxPos = await db.select({ pos: communityChannelsTable.position }).from(communityChannelsTable).orderBy(communityChannelsTable.position).then((r) => (r[r.length - 1]?.pos ?? -1) + 1);

    const inserted = await db.insert(communityChannelsTable).values({
      name: name.trim(),
      emoji: emoji || "💬",
      slug: autoSlug,
      description: description || null,
      position: position ?? maxPos,
      accessType,
      courseId: courseId ?? null,
      batchId: batchId ?? null,
      createdBy: clerkId,
    }).returning();

    res.status(201).json(await enrichChannel(inserted[0]));
  } catch (err: any) {
    if (err?.code === "23505") { res.status(409).json({ error: "Slug already exists" }); return; }
    req.log.error({ err }, "Error creating channel");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── PATCH /api/channels/:channelId ────────────────────────── */
router.patch("/channels/:channelId", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const role = await getUserRole(clerkId);
    if (role !== "admin") { res.status(403).json({ error: "Forbidden" }); return; }

    const id = parseInt(req.params.channelId);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

    const { name, emoji, slug, description, position, accessType, courseId, batchId } = req.body;
    const updated = await db.update(communityChannelsTable).set({
      ...(name !== undefined && { name: name.trim() }),
      ...(emoji !== undefined && { emoji }),
      ...(slug !== undefined && { slug: slug.toLowerCase().replace(/[^a-z0-9]+/g, "-") }),
      ...(description !== undefined && { description }),
      ...(position !== undefined && { position }),
      ...(accessType !== undefined && { accessType }),
      ...(courseId !== undefined && { courseId }),
      ...(batchId !== undefined && { batchId }),
    }).where(eq(communityChannelsTable.id, id)).returning();

    if (!updated[0]) { res.status(404).json({ error: "Channel not found" }); return; }
    res.json(await enrichChannel(updated[0]));
  } catch (err) {
    req.log.error({ err }, "Error updating channel");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── DELETE /api/channels/:channelId ───────────────────────── */
router.delete("/channels/:channelId", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const role = await getUserRole(clerkId);
    if (role !== "admin") { res.status(403).json({ error: "Forbidden" }); return; }

    const id = parseInt(req.params.channelId);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    await db.delete(communityChannelsTable).where(eq(communityChannelsTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Error deleting channel");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
