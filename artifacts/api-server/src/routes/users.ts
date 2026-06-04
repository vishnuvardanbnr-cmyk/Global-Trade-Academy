import { Router } from "express";
import { getAuth } from "../lib/auth";
import { db } from "@workspace/db";
import {
  usersTable,
  insertUserSchema,
} from "@workspace/db";
import { eq, ilike, or } from "drizzle-orm";

const router = Router();

function buildUserResponse(user: typeof usersTable.$inferSelect) {
  return {
    id: user.id,
    clerkId: user.clerkId,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    role: user.role,
    xp: user.xp,
    badges: user.badges,
    marketFocus: user.marketFocus,
    skillLevel: user.skillLevel,
    createdAt: user.createdAt,
  };
}

// GET /api/users/me
router.get("/users/me", async (req, res): Promise<void> => {
  try {
    const { userId } = getAuth(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const user = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1)
      .then((r) => r[0]);

    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    res.json(buildUserResponse(user));
  } catch (err) {
    req.log.error({ err }, "Error getting current user");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/users/me
router.patch("/users/me", async (req, res): Promise<void> => {
  try {
    const { userId } = getAuth(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const { displayName, bio, marketFocus, skillLevel } = req.body;

    const updated = await db
      .update(usersTable)
      .set({
        ...(displayName !== undefined && { displayName }),
        ...(bio !== undefined && { bio }),
        ...(marketFocus !== undefined && { marketFocus }),
        ...(skillLevel !== undefined && { skillLevel }),
      })
      .where(eq(usersTable.id, userId))
      .returning();

    if (!updated[0]) { res.status(404).json({ error: "User not found" }); return; }

    res.json(buildUserResponse(updated[0]));
  } catch (err) {
    req.log.error({ err }, "Error updating user");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/users
router.get("/users", async (req, res): Promise<void> => {
  try {
    const { role, search } = req.query as { role?: string; search?: string };

    let query = db.select().from(usersTable).$dynamic();
    if (role) {
      query = query.where(eq(usersTable.role, role));
    } else if (search) {
      query = query.where(
        or(
          ilike(usersTable.displayName, `%${search}%`),
          ilike(usersTable.email, `%${search}%`)
        )
      );
    }

    const users = await query.limit(100);
    res.json(users.map(buildUserResponse));
  } catch (err) {
    req.log.error({ err }, "Error listing users");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/users/:userId
router.get("/users/:userId", async (req, res): Promise<void> => {
  try {
    const user = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, req.params.userId))
      .limit(1)
      .then((r) => r[0]);

    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    res.json(buildUserResponse(user));
  } catch (err) {
    req.log.error({ err }, "Error getting user");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
