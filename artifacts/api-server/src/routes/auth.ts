import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { usersTable, siteSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { signToken, getAuth } from "../lib/auth";
import { randomUUID } from "crypto";
import { generateOtp, verifyOtp, isOtpVerified, clearOtp, generateResetOtp, verifyResetOtp, isResetOtpVerified, clearResetOtp } from "../lib/otp-store";
import { sendEmailLocal } from "../lib/mailer";
import { otpEmail, passwordResetEmail } from "../lib/email-templates";

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

/* ── POST /api/auth/send-otp ────────────────────────────────── */
router.post("/auth/send-otp", async (req, res): Promise<void> => {
  try {
    const { email, firstName } = req.body as { email: string; firstName?: string };
    if (!email) { res.status(400).json({ error: "Email is required" }); return; }

    const regSetting = await db.select({ value: siteSettingsTable.value })
      .from(siteSettingsTable).where(eq(siteSettingsTable.key, "registration_open")).limit(1).then(r => r[0]);
    if (regSetting) {
      try {
        const parsed = JSON.parse(regSetting.value);
        if (parsed === false || parsed === "false") {
          res.status(403).json({ error: "Registration is currently closed. Please contact the administrator." }); return;
        }
      } catch { /* malformed value — treat as open */ }
    }

    const existing = await db.select({ id: usersTable.id }).from(usersTable)
      .where(eq(usersTable.email, email.toLowerCase())).limit(1).then(r => r[0]);
    if (existing) { res.status(409).json({ error: "An account with this email already exists" }); return; }

    const code = generateOtp(email);
    await sendEmailLocal(email, "Your Bright Insight verification code", otpEmail({ name: firstName, code }));
    res.json({ sent: true });
  } catch (err) {
    req.log.error({ err }, "Send OTP error");
    res.status(500).json({ error: "Failed to send verification code" });
  }
});

/* ── POST /api/auth/verify-otp ──────────────────────────────── */
router.post("/auth/verify-otp", async (req, res): Promise<void> => {
  const { email, code } = req.body as { email: string; code: string };
  if (!email || !code) { res.status(400).json({ error: "Email and code are required" }); return; }
  const result = verifyOtp(email, code);
  if (result === "ok") { res.json({ verified: true }); return; }
  if (result === "expired") { res.status(410).json({ error: "Code has expired. Please request a new one." }); return; }
  if (result === "too_many") { res.status(429).json({ error: "Too many attempts. Please request a new code." }); return; }
  res.status(400).json({ error: "Invalid code. Please try again." });
});

/* ── POST /api/auth/register ────────────────────────────────── */
router.post("/auth/register", async (req, res): Promise<void> => {
  try {
    const { email, password, firstName, lastName, country, phone } = req.body as {
      email: string; password: string; firstName?: string; lastName?: string;
      country?: string; phone?: string;
    };

    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required" }); return;
    }

    const regSetting = await db.select({ value: siteSettingsTable.value })
      .from(siteSettingsTable).where(eq(siteSettingsTable.key, "registration_open")).limit(1).then(r => r[0]);
    if (regSetting) {
      try {
        const parsed = JSON.parse(regSetting.value);
        if (parsed === false || parsed === "false") {
          res.status(403).json({ error: "Registration is currently closed. Please contact the administrator." }); return;
        }
      } catch { /* malformed value — treat as open */ }
    }
    if (password.length < 8) {
      res.status(400).json({ error: "Password must be at least 8 characters" }); return;
    }
    if (!isOtpVerified(email)) {
      res.status(403).json({ error: "Email not verified. Please complete OTP verification first." }); return;
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
      status: "pending_approval",
      xp: 0,
      badges: [],
      country: country || null,
      phone: phone || null,
    }).returning();

    const token = signToken({ userId: user.id, email: user.email });
    clearOtp(email);
    setAuthCookie(res, token);
    res.status(201).json({
      token,
      pendingApproval: true,
      user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role, status: user.status },
    });
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

    if (user.status === "suspended") {
      res.status(403).json({ error: "Your account has been suspended. Please contact support." }); return;
    }

    const token = signToken({ userId: user.id, email: user.email });
    setAuthCookie(res, token);

    const pendingApproval = user.status === "pending_approval";
    res.json({
      token,
      pendingApproval,
      user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role, status: user.status },
    });
  } catch (err) {
    req.log.error({ err }, "Login error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/auth/logout", (_req, res): void => {
  clearAuthCookie(res);
  res.json({ success: true });
});

/* ── POST /api/auth/forgot-password ────────────────────────── */
router.post("/auth/forgot-password", async (req, res): Promise<void> => {
  try {
    const { email } = req.body as { email: string };
    if (!email) { res.status(400).json({ error: "Email is required" }); return; }

    const user = await db.select({ id: usersTable.id, displayName: usersTable.displayName })
      .from(usersTable).where(eq(usersTable.email, email.toLowerCase())).limit(1).then(r => r[0]);

    if (!user) {
      res.json({ sent: true }); return;
    }

    const code = generateResetOtp(email);
    await sendEmailLocal(email, "Reset your Bright Insight password", passwordResetEmail({ name: user.displayName ?? undefined, code }));
    res.json({ sent: true });
  } catch (err) {
    req.log.error({ err }, "Forgot password error");
    res.status(500).json({ error: "Failed to send reset code" });
  }
});

/* ── POST /api/auth/reset-password ─────────────────────────── */
router.post("/auth/reset-password", async (req, res): Promise<void> => {
  try {
    const { email, code, newPassword } = req.body as { email: string; code: string; newPassword: string };
    if (!email || !code || !newPassword) { res.status(400).json({ error: "All fields are required" }); return; }
    if (newPassword.length < 8) { res.status(400).json({ error: "Password must be at least 8 characters" }); return; }

    const result = verifyResetOtp(email, code);
    if (result === "expired") { res.status(410).json({ error: "Code has expired. Please request a new one." }); return; }
    if (result === "too_many") { res.status(429).json({ error: "Too many attempts. Please request a new code." }); return; }
    if (result !== "ok") { res.status(400).json({ error: "Invalid code. Please try again." }); return; }

    const hashed = await bcrypt.hash(newPassword, 12);
    const updated = await db.update(usersTable)
      .set({ passwordHash: hashed })
      .where(eq(usersTable.email, email.toLowerCase()))
      .returning({ id: usersTable.id });

    if (!updated.length) { res.status(404).json({ error: "Account not found" }); return; }

    clearResetOtp(email);
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Reset password error");
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ── POST /api/auth/change-password ────────────────────────── */
router.post("/auth/change-password", async (req, res): Promise<void> => {
  try {
    const { userId } = getAuth(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };
    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: "Both current and new password are required" }); return;
    }
    if (newPassword.length < 8) {
      res.status(400).json({ error: "New password must be at least 8 characters" }); return;
    }

    const user = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1).then(r => r[0]);
    if (!user || !user.passwordHash) {
      res.status(400).json({ error: "Account not found or uses social login" }); return;
    }

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      res.status(400).json({ error: "Current password is incorrect" }); return;
    }

    const hashed = await bcrypt.hash(newPassword, 12);
    await db.update(usersTable).set({ passwordHash: hashed }).where(eq(usersTable.id, userId));

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Change password error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/auth/me", async (req, res): Promise<void> => {
  try {
    const { userId } = getAuth(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const user = await db.select().from(usersTable)
      .where(eq(usersTable.id, userId)).limit(1).then(r => r[0]);
    if (!user) { res.status(401).json({ error: "User not found" }); return; }

    res.json({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      status: user.status,
      avatarUrl: user.avatarUrl,
    });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
