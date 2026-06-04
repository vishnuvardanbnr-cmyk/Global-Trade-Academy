import { Router } from "express";
import { getAuth } from "../lib/auth";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { signToken } from "../lib/auth";

const router = Router();

const COOKIE_OPTS = [
  "HttpOnly",
  "Path=/",
  "SameSite=Lax",
  `Max-Age=${30 * 24 * 60 * 60}`,
  ...(process.env.NODE_ENV === "production" ? ["Secure"] : []),
].join("; ");

/* ── GET /api/setup/status ──────────────────────────────────────
   Returns whether the platform has been bootstrapped (has an admin).
   Public — no auth required.                                       */
router.get("/setup/status", async (_req, res): Promise<void> => {
  try {
    const adminCount = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(usersTable)
      .where(eq(usersTable.role, "admin"))
      .then((r) => r[0]?.count ?? 0);
    res.json({ bootstrapped: adminCount > 0, adminCount });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── POST /api/setup/bootstrap ──────────────────────────────────
   Promotes the calling user to admin.
   Only works if NO admins exist yet (first-time setup).            */
router.post("/setup/bootstrap", async (req, res): Promise<void> => {
  try {
    const { userId } = getAuth(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const adminCount = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(usersTable)
      .where(eq(usersTable.role, "admin"))
      .then((r) => r[0]?.count ?? 0);

    if (adminCount > 0) {
      res.status(409).json({ error: "Platform already has an admin. Use Admin Panel → Users to change roles." });
      return;
    }

    const updated = await db
      .update(usersTable)
      .set({ role: "admin" })
      .where(eq(usersTable.id, userId))
      .returning({ id: usersTable.id, role: usersTable.role, email: usersTable.email });

    if (!updated.length) {
      res.status(404).json({ error: "User not found. Please register first." });
      return;
    }

    res.json({ success: true, message: "You are now an admin!", user: updated[0] });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── POST /api/setup/set-role ───────────────────────────────────
   Admin-only: change any user's role by email.                    */
router.post("/setup/set-role", async (req, res): Promise<void> => {
  try {
    const { userId } = getAuth(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const callerRow = await db.select({ role: usersTable.role }).from(usersTable)
      .where(eq(usersTable.id, userId)).limit(1).then((r) => r[0]);
    if (callerRow?.role !== "admin") { res.status(403).json({ error: "Admin only" }); return; }

    const { userId: targetUserId, email, role } = req.body;
    if (!["student", "instructor", "admin"].includes(role)) {
      res.status(400).json({ error: "role must be student | instructor | admin" }); return;
    }

    let target;
    if (targetUserId) {
      target = await db.update(usersTable).set({ role })
        .where(eq(usersTable.id, targetUserId)).returning({ id: usersTable.id, email: usersTable.email, role: usersTable.role });
    } else if (email) {
      target = await db.update(usersTable).set({ role })
        .where(eq(usersTable.email, email)).returning({ id: usersTable.id, email: usersTable.email, role: usersTable.role });
    } else {
      res.status(400).json({ error: "userId or email required" }); return;
    }

    if (!target?.length) { res.status(404).json({ error: "User not found" }); return; }
    res.json({ success: true, user: target[0] });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── POST /api/setup/demo-login ─────────────────────────────────
   Creates a session for demo accounts (no Clerk needed).          */
const DEMO_ACCOUNTS = [
  { email: "brightinsight.admin@gmail.com",      role: "admin",      name: "Demo Admin" },
  { email: "brightinsight.instructor@gmail.com", role: "instructor", name: "Demo Instructor" },
  { email: "brightinsight.student@gmail.com",    role: "student",    name: "Demo Student" },
];

router.post("/setup/demo-login", async (req, res): Promise<void> => {
  try {
    const { email } = req.body as { email: string };
    const demo = DEMO_ACCOUNTS.find(a => a.email === email);
    if (!demo) { res.status(400).json({ error: "Not a demo account" }); return; }

    let user = await db.select().from(usersTable)
      .where(eq(usersTable.email, email)).limit(1).then(r => r[0]);

    if (!user) {
      const id = randomUUID();
      const hashed = await bcrypt.hash("demo-password-" + id, 10);
      const [inserted] = await db.insert(usersTable).values({
        id,
        clerkId: id,
        email,
        displayName: demo.name,
        passwordHash: hashed,
        role: demo.role,
        xp: 0,
        badges: [],
      }).returning();
      user = inserted;
    }

    const token = signToken({ userId: user.id, email: user.email });
    res.setHeader("Set-Cookie", `auth_token=${encodeURIComponent(token)}; ${COOKIE_OPTS}`);
    res.json({ success: true, redirectUrl: "/dashboard" });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
