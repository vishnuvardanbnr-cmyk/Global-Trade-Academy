import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { signToken, getAuth } from "../lib/auth";
import { randomUUID } from "crypto";

const router = Router();

const COOKIE_OPTS = [
  "HttpOnly",
  "Path=/",
  "SameSite=Lax",
  `Max-Age=${30 * 24 * 60 * 60}`,
  ...(process.env.NODE_ENV === "production" ? ["Secure"] : []),
].join("; ");

function setAuthCookie(res: import("express").Response, token: string) {
  res.setHeader("Set-Cookie", `auth_token=${encodeURIComponent(token)}; ${COOKIE_OPTS}`);
}

function clearAuthCookie(res: import("express").Response) {
  res.setHeader("Set-Cookie", "auth_token=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0");
}

router.post("/auth/register", async (req, res): Promise<void> => {
  try {
    const { email, password, firstName, lastName } = req.body as {
      email: string; password: string; firstName?: string; lastName?: string;
    };

    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required" }); return;
    }
    if (password.length < 8) {
      res.status(400).json({ error: "Password must be at least 8 characters" }); return;
    }

    const existing = await db.select({ id: usersTable.id }).from(usersTable)
      .where(eq(usersTable.email, email.toLowerCase())).limit(1).then(r => r[0]);
    if (existing) {
      res.status(409).json({ error: "An account with this email already exists" }); return;
    }

    const hashed = await bcrypt.hash(password, 12);
    const userId = randomUUID();
    const displayName = [firstName, lastName].filter(Boolean).join(" ").trim() || null;

    const [user] = await db.insert(usersTable).values({
      id: userId,
      clerkId: userId,
      email: email.toLowerCase(),
      displayName,
      passwordHash: hashed,
      role: "student",
      xp: 0,
      badges: [],
    }).returning();

    const token = signToken({ userId: user.id, email: user.email });
    setAuthCookie(res, token);
    res.status(201).json({ token, user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role } });
  } catch (err) {
    req.log.error({ err }, "Register error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/auth/login", async (req, res): Promise<void> => {
  try {
    const { email, password } = req.body as { email: string; password: string };
    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required" }); return;
    }

    const user = await db.select().from(usersTable)
      .where(eq(usersTable.email, email.toLowerCase())).limit(1).then(r => r[0]);

    if (!user || !user.passwordHash) {
      res.status(401).json({ error: "Invalid email or password" }); return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Invalid email or password" }); return;
    }

    const token = signToken({ userId: user.id, email: user.email });
    setAuthCookie(res, token);
    res.json({ token, user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role } });
  } catch (err) {
    req.log.error({ err }, "Login error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/auth/logout", (_req, res): void => {
  clearAuthCookie(res);
  res.json({ success: true });
});

router.get("/auth/me", async (req, res): Promise<void> => {
  try {
    const { userId } = getAuth(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const user = await db.select().from(usersTable)
      .where(eq(usersTable.id, userId)).limit(1).then(r => r[0]);
    if (!user) { res.status(401).json({ error: "User not found" }); return; }

    res.json({ id: user.id, email: user.email, displayName: user.displayName, role: user.role, avatarUrl: user.avatarUrl });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
