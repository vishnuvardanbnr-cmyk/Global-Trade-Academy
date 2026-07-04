import { Router } from "express";
import { getAuth } from "../lib/auth";
import { db } from "@workspace/db";
import { groupsTable, groupMembersTable, usersTable } from "@workspace/db";
import { eq, and, inArray, desc, notInArray } from "drizzle-orm";

const router = Router();

async function isAdminOrInstructor(userId: string): Promise<boolean> {
  const user = await db.select({ role: usersTable.role })
    .from(usersTable).where(eq(usersTable.id, userId)).limit(1).then((r) => r[0]);
  return !!user && (user.role === "admin" || user.role === "instructor");
}

/* ── GET /api/admin/groups ── */
router.get("/admin/groups", async (req, res): Promise<void> => {
  try {
    const { userId } = getAuth(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
    if (!(await isAdminOrInstructor(userId))) { res.status(403).json({ error: "Forbidden" }); return; }

    const groups = await db.select().from(groupsTable).orderBy(desc(groupsTable.createdAt));
    const groupIds = groups.map((g) => g.id);

    const memberCounts = groupIds.length
      ? await db.select({ groupId: groupMembersTable.groupId })
          .from(groupMembersTable)
          .where(inArray(groupMembersTable.groupId, groupIds))
      : [];

    const countMap: Record<number, number> = {};
    for (const m of memberCounts) countMap[m.groupId] = (countMap[m.groupId] ?? 0) + 1;

    res.json(groups.map((g) => ({ ...g, memberCount: countMap[g.id] ?? 0 })));
  } catch (err) {
    req.log.error({ err }, "Error listing groups");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── POST /api/admin/groups ── */
router.post("/admin/groups", async (req, res): Promise<void> => {
  try {
    const { userId } = getAuth(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
    if (!(await isAdminOrInstructor(userId))) { res.status(403).json({ error: "Forbidden" }); return; }

    const { name, description } = req.body;
    if (!name?.trim()) { res.status(400).json({ error: "name is required" }); return; }

    const inserted = await db.insert(groupsTable).values({
      name: name.trim(),
      description: description?.trim() || null,
      createdBy: userId,
    }).returning();

    res.status(201).json({ ...inserted[0], memberCount: 0 });
  } catch (err) {
    req.log.error({ err }, "Error creating group");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── PATCH /api/admin/groups/:groupId ── */
router.patch("/admin/groups/:groupId", async (req, res): Promise<void> => {
  try {
    const { userId } = getAuth(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
    if (!(await isAdminOrInstructor(userId))) { res.status(403).json({ error: "Forbidden" }); return; }

    const groupId = parseInt(req.params.groupId);
    const { name, description } = req.body;

    const updated = await db.update(groupsTable).set({
      ...(name !== undefined && { name: name.trim() }),
      ...(description !== undefined && { description: description?.trim() || null }),
    }).where(eq(groupsTable.id, groupId)).returning();

    if (!updated.length) { res.status(404).json({ error: "Group not found" }); return; }
    res.json(updated[0]);
  } catch (err) {
    req.log.error({ err }, "Error updating group");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── DELETE /api/admin/groups/:groupId ── */
router.delete("/admin/groups/:groupId", async (req, res): Promise<void> => {
  try {
    const { userId } = getAuth(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
    if (!(await isAdminOrInstructor(userId))) { res.status(403).json({ error: "Forbidden" }); return; }

    const groupId = parseInt(req.params.groupId);
    await db.delete(groupMembersTable).where(eq(groupMembersTable.groupId, groupId));
    await db.delete(groupsTable).where(eq(groupsTable.id, groupId));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Error deleting group");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── GET /api/admin/groups/:groupId/members ── */
router.get("/admin/groups/:groupId/members", async (req, res): Promise<void> => {
  try {
    const { userId } = getAuth(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
    if (!(await isAdminOrInstructor(userId))) { res.status(403).json({ error: "Forbidden" }); return; }

    const groupId = parseInt(req.params.groupId);
    const members = await db.select().from(groupMembersTable)
      .where(eq(groupMembersTable.groupId, groupId))
      .orderBy(groupMembersTable.addedAt);

    const userIds = members.map((m) => m.userId);
    const users = userIds.length
      ? await db.select({ id: usersTable.id, displayName: usersTable.displayName, email: usersTable.email, role: usersTable.role })
          .from(usersTable).where(inArray(usersTable.id, userIds))
      : [];
    const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

    res.json(members.map((m) => ({
      id: m.id,
      groupId: m.groupId,
      userId: m.userId,
      addedAt: m.addedAt,
      displayName: userMap[m.userId]?.displayName ?? null,
      email: userMap[m.userId]?.email ?? null,
      role: userMap[m.userId]?.role ?? null,
    })));
  } catch (err) {
    req.log.error({ err }, "Error listing group members");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── GET /api/admin/groups/:groupId/available-users ── */
router.get("/admin/groups/:groupId/available-users", async (req, res): Promise<void> => {
  try {
    const { userId } = getAuth(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
    if (!(await isAdminOrInstructor(userId))) { res.status(403).json({ error: "Forbidden" }); return; }

    const groupId = parseInt(req.params.groupId);

    const inGroup = await db.select({ userId: groupMembersTable.userId })
      .from(groupMembersTable).where(eq(groupMembersTable.groupId, groupId));
    const inGroupIds = inGroup.map((m) => m.userId);

    const query = db.select({ id: usersTable.id, displayName: usersTable.displayName, email: usersTable.email, role: usersTable.role })
      .from(usersTable);

    const users = inGroupIds.length
      ? await query.where(notInArray(usersTable.id, inGroupIds))
      : await query;

    res.json(users.sort((a, b) => (a.displayName ?? a.email).localeCompare(b.displayName ?? b.email)));
  } catch (err) {
    req.log.error({ err }, "Error listing available users");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── POST /api/admin/groups/:groupId/members ── */
router.post("/admin/groups/:groupId/members", async (req, res): Promise<void> => {
  try {
    const { userId } = getAuth(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
    if (!(await isAdminOrInstructor(userId))) { res.status(403).json({ error: "Forbidden" }); return; }

    const groupId = parseInt(req.params.groupId);
    const { userId: targetUserId } = req.body;
    if (!targetUserId) { res.status(400).json({ error: "userId required" }); return; }

    const inserted = await db.insert(groupMembersTable)
      .values({ groupId, userId: targetUserId, addedBy: userId })
      .onConflictDoNothing().returning();

    res.status(201).json(inserted[0] ?? { groupId, userId: targetUserId });
  } catch (err) {
    req.log.error({ err }, "Error adding member to group");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── DELETE /api/admin/groups/:groupId/members/:targetUserId ── */
router.delete("/admin/groups/:groupId/members/:targetUserId", async (req, res): Promise<void> => {
  try {
    const { userId } = getAuth(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
    if (!(await isAdminOrInstructor(userId))) { res.status(403).json({ error: "Forbidden" }); return; }

    const groupId = parseInt(req.params.groupId);
    await db.delete(groupMembersTable)
      .where(and(eq(groupMembersTable.groupId, groupId), eq(groupMembersTable.userId, req.params.targetUserId)));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Error removing member from group");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── GET /api/me/groups ── (for dashboard display) */
router.get("/me/groups", async (req, res): Promise<void> => {
  try {
    const { userId } = getAuth(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const memberships = await db.select({ groupId: groupMembersTable.groupId })
      .from(groupMembersTable).where(eq(groupMembersTable.userId, userId));

    if (!memberships.length) { res.json([]); return; }

    const groupIds = memberships.map((m) => m.groupId);
    const groups = await db.select({ id: groupsTable.id, name: groupsTable.name })
      .from(groupsTable).where(inArray(groupsTable.id, groupIds));

    res.json(groups);
  } catch (err) {
    req.log.error({ err }, "Error fetching user groups");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
