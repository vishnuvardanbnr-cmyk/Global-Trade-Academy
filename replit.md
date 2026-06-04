# Bright Insight

A trading-education LMS (Learning Management System) for serious traders — structured courses, quiz engine, XP/progress tracking, live classes, and instructor tooling.

## Run & Operate

- **Frontend** — workflow `artifacts/edu: web` (Replit injects `PORT`; Vite reads it)
- **API** — workflow `artifacts/api-server: API Server` (Replit injects `PORT`; Express reads it)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

**Demo accounts** (password: `Demo1234!`): `student@brightinsight.com`, `instructor@brightinsight.com`, `admin@brightinsight.com`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- DB schema (source of truth): `lib/db/src/schema/*.ts` (courses, lessons, enrollments, quizzes, quiz_questions, quiz_attempts, tasks, task_completions, certificates, reviews, notes, bookmarks, course_prerequisites, xp_events, learning_days)
- API contract (source of truth): `lib/api-spec/openapi.yaml` → codegen → `lib/api-client-react/src/generated/`
- Server routes: `artifacts/api-server/src/routes/*.ts`; shared LMS logic: `artifacts/api-server/src/lib/lms.ts`
- Frontend (React+Vite): `artifacts/edu/src/pages/*` + `artifacts/edu/src/components/layout/`
- Seed: `artifacts/api-server/src/seed.ts`

## Architecture decisions

- Contract-first: DB schema → OpenAPI spec → `pnpm --filter @workspace/api-spec run codegen` → typed Orval hooks + Zod schemas. Always update the spec and regenerate when changing response shapes.
- Auth: Clerk. `getAuth(req).userId` (clerkId) is used directly as the primary key in `users.id` and as `userId` FKs everywhere.
- XP is an idempotent ledger: `awardXp(userId, type, refId, amount)` inserts into `xp_events` with `onConflictDoNothing`, so each (user, type, refId) grants XP at most once. Level = floor(xp/500)+1 (XP_PER_LEVEL=500).
- Content gating (paywall + drip) is enforced server-side in `lib/lms.ts` (`isEnrolled`, `ownsCourse`, `getUnlockedLessonIds`). Lesson read endpoints strip `videoUrl`/`content` and set `locked: true` for non-unlocked lessons. Course owners see everything.

## Product

EDU is a trading-education LMS with 4 tiers: (1) course player with persisted progress, completion + XP; (2) quiz engine + practical tasks with XP rewards; (3) certificates, reviews, notes, bookmarks, prerequisites, learning-day streaks; (4) instructor course/content CRUD (lessons, quizzes, tasks, drip scheduling) + analytics.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Every mutating/learner route must gate on enrollment + unlock state, not just authentication. See the security topic in `.agents/memory/`.
- `seed.ts` is NOT idempotent (no truncate) — re-running duplicates courses/lessons. To add demo data to an already-seeded DB, insert directly via SQL for existing course IDs instead of re-running the full seed.
- After changing any API response shape, run codegen before typechecking the frontend, or generated types will be stale.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
