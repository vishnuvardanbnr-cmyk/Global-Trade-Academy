---
name: LMS server-side authorization
description: Authorization rules for the EDU LMS — what every learner/mutating/content route must check beyond authentication.
---

# LMS server-side authorization

**Rule:** Authentication (`getAuth(req).userId` present) is never sufficient on its own for LMS routes. Each route must additionally enforce the relevant ownership/enrollment/unlock check.

**Why:** A code review found four IDOR / paywall-bypass holes that all passed an auth-only check: any user could delete arbitrary enrollments by id, mark lessons complete in courses they weren't enrolled in (farming XP), submit quizzes/complete tasks without enrollment, enroll while skipping prerequisites, and read paid `videoUrl`/`content` on locked lessons without enrolling. Auth-only checks give a false sense of security.

**How to apply (helpers live in `artifacts/api-server/src/lib/lms.ts`):**
- Owner-scoped deletes/updates: filter the mutation by `userId` (e.g. `delete().where(and(eq(id), eq(userId)))`) and 404 when nothing was affected — never delete/update by id alone.
- Instructor CRUD on a course's content: gate with `ownsCourse(userId, courseId)` → 403.
- Learner progress / quiz attempts / task completion: gate with `isEnrolled(userId, courseId)` (free lessons may be exempt) → 403, and for lessons also verify `getUnlockedLessonIds(...)` includes the lesson (drip/free gating) → 403.
- Enrollment creation: enforce prerequisites — every `course_prerequisites.requiredCourseId` must have a `completed` enrollment for the user, else 403.
- Lesson read endpoints: compute a `locked` flag (owner sees all; otherwise free OR unlocked) and strip `videoUrl`/`content` to `null` when locked. The `locked` field is part of the OpenAPI `Lesson` schema.
- Course-completion side effects (`syncCourseCompletion`): guard with `isEnrolled` first, so XP/certificates are never granted to non-enrolled users via free-lesson completion.
