---
name: Custom auth system (Clerk replacement)
description: Clerk was removed and replaced with JWT+bcrypt custom auth. Key files, patterns, and constraints.
---

## Rule

Clerk has been fully removed. All authentication is custom JWT+bcrypt.

**Backend:**
- `artifacts/api-server/src/lib/auth.ts` — `getAuth(req)` shim reads JWT from `Authorization: Bearer <token>` header or `auth_token` HttpOnly cookie. `signToken` / `verifyToken` use `JWT_SECRET` env var. 30-day expiry.
- `artifacts/api-server/src/routes/auth.ts` — `/api/auth/register`, `/api/auth/login`, `/api/auth/logout`, `/api/auth/me` endpoints.
- All route files use `const { userId } = getAuth(req)` — same pattern as before (shim is API-compatible).
- `clerkId` column in DB is set equal to `id` (UUID) for backward compatibility.

**Frontend:**
- `artifacts/edu/src/lib/authContext.tsx` — `AuthProvider`, `useUser()`, `useClerk()` hooks (Clerk-compatible API shape).
- `artifacts/edu/src/lib/auth.ts` — `login()`, `register()`, `logout()`, `getMe()` API helpers.
- `artifacts/edu/src/pages/sign-in.tsx` and `sign-up.tsx` — Clerk-style UI with framer-motion animations, step indicators, password strength meter.
- JWT stored as HttpOnly cookie (`auth_token`) server-side; also returned in JSON body for header use.

**Ports:**
- Frontend: port 5000 (Replit webview requirement)
- API: port 3000
- Vite proxy: `/api` → `http://localhost:3000`

**Why:** User explicitly requested replacing Clerk with a custom auth system that matches Clerk's visual style, so no Clerk API keys are needed.

**How to apply:** Never re-introduce `@clerk/clerk-react`, `@clerk/express`, or any Clerk imports. Use `useUser()` from `@/lib/authContext` on the frontend. Use `getAuth(req)` from `../../lib/auth` on the backend.
