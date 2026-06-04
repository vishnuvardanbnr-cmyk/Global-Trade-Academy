import jwt from "jsonwebtoken";
import type { Request } from "express";

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-me";
const JWT_EXPIRES_IN = "30d";

export interface JwtPayload {
  userId: string;
  email: string;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

export function getTokenFromRequest(req: Request): string | null {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  const cookie = req.headers.cookie;
  if (cookie) {
    const match = cookie.match(/(?:^|;\s*)auth_token=([^;]+)/);
    if (match) return decodeURIComponent(match[1]);
  }
  return null;
}

export function getAuth(req: Request): { userId: string | null } {
  const token = getTokenFromRequest(req);
  if (!token) return { userId: null };
  const payload = verifyToken(token);
  return { userId: payload?.userId ?? null };
}
