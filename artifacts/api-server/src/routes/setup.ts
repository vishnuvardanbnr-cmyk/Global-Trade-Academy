import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const router = Router();

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
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

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
      .where(eq(usersTable.id, clerkId))
      .returning({ id: usersTable.id, role: usersTable.role, email: usersTable.email });

    if (!updated.length) {
      res.status(404).json({ error: "User not found. Please visit /dashboard first to create your account." });
      return;
    }

    res.json({ success: true, message: "You are now an admin!", user: updated[0] });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── POST /api/setup/set-role ───────────────────────────────────
   Admin-only: change any user's role by email.
   Used by setup scripts and the Admin Panel.                       */
router.post("/setup/set-role", async (req, res): Promise<void> => {
  try {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const callerRow = await db.select({ role: usersTable.role }).from(usersTable)
      .where(eq(usersTable.id, clerkId)).limit(1).then((r) => r[0]);
    if (callerRow?.role !== "admin") { res.status(403).json({ error: "Admin only" }); return; }

    const { userId, email, role } = req.body;
    if (!["student", "instructor", "admin"].includes(role)) {
      res.status(400).json({ error: "role must be student | instructor | admin" }); return;
    }

    let target;
    if (userId) {
      target = await db.update(usersTable).set({ role })
        .where(eq(usersTable.id, userId)).returning({ id: usersTable.id, email: usersTable.email, role: usersTable.role });
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
   Creates a Clerk sign-in token for demo accounts only.
   No auth required — these are demo credentials.               */
const DEMO_USER_IDS: Record<string, string> = {
  "brightinsight.admin@gmail.com":      "user_3EdOGmdMjsuPDcaT0obAxJk4AB5",
  "brightinsight.instructor@gmail.com": "user_3EdOH3ArsB1MLX9StxB3FbxZWVD",
  "brightinsight.student@gmail.com":    "user_3EdOHAlOOpfu6pw3wB5QJVwi2bU",
};

router.post("/setup/demo-login", async (req, res): Promise<void> => {
  try {
    const { email } = req.body as { email: string };
    const userId = DEMO_USER_IDS[email];
    if (!userId) { res.status(400).json({ error: "Not a demo account" }); return; }

    const clerkRes = await fetch("https://api.clerk.com/v1/sign_in_tokens", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ user_id: userId }),
    });

    if (!clerkRes.ok) {
      const err = await clerkRes.json().catch(() => ({}));
      req.log.error({ err }, "Clerk sign-in token creation failed");
      res.status(500).json({ error: "Could not create demo token" }); return;
    }

    const data = await clerkRes.json() as { token: string; url: string };
    res.json({ token: data.token, url: data.url });
  } catch (err) {
    req.log.error({ err }, "Demo login error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
