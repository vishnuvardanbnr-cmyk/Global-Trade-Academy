---
name: Clerk name vs DB displayName
description: How user display names are sourced — Clerk is truth, DB is cache; what breaks when this isn't respected.
---

## Rule
Always use `useUser()` from `@clerk/react` as the primary name source in UI (`clerkUser?.fullName ?? clerkUser?.firstName`). The DB `displayName` is a secondary fallback only. Never derive a display name from the user's email address.

**Why:** The original `users.ts` stored `${clerkId}@edu.app` as a fake fallback email when Clerk's real email wasn't fetched. The dashboard greeting did `email.split("@")[0]`, which produced the raw Clerk user ID (e.g. `user_3Ea5hFRU3KE58wpcaJydY6bGLHF`) as the greeting name.

## How to apply
- Backend `users.ts` (GET /api/users/me): when creating a new user row, call `clerkClient.users.getUser(clerkId)` to fetch `firstName`, `lastName`, and `primaryEmailAddress`. Build `displayName = [firstName, lastName].filter(Boolean).join(" ")`. This requires `import { clerkClient } from "@clerk/express"`.
- Dashboard greeting: `clerkUser?.fullName ?? clerkUser?.firstName ?? user?.displayName ?? "Trader"`.
- DashboardLayout sidebar: already correctly used `user?.fullName || "Trader"` from `useUser()`.
- `CompleteProfileDialog` (in DashboardLayout): fires when `!user?.firstName && !user?.fullName && !me?.displayName`; collects first + last name, calls `PATCH /api/users/me` (useUpdateMe) AND `clerkUser.update({ firstName, lastName })` so Clerk is the source of truth.
