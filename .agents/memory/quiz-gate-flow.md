---
name: Quiz gate flow
description: End-to-end flow for per-lesson quiz approval gating — how gates are created, advanced, and resolved.
---

## Status machine
`awaiting_quiz` → (student passes gate quiz) → `pending_review` → (instructor approves) → `approved`
                                                                  → (instructor rejects) → `rejected` → (student retakes new quiz) → `pending_review` → ...

## Key implementation files
- DB: `lib/db/src/schema/assessments.ts` — `lessonGatesTable` (unique on userId+lessonId), `quizzesTable.lessonId` + `quizzesTable.assignedUserId`
- Gate creation: `lib/api-server/src/lib/lms.ts` → `ensureGateExists(userId, lessonId)` — creates the gate row when first needed
- Gate advance: `lms.ts` → `advanceGateOnPass(userId, quizId, score)` — called by quiz submit when `passed=true`; moves gate from `awaiting_quiz`/`rejected` → `pending_review`
- Quiz submit: `artifacts/api-server/src/routes/assessments.ts` POST `/quizzes/:quizId/attempts` — calls `advanceGateOnPass` if `passed`; returns `gateStatus` in response
- Instructor routes: `artifacts/api-server/src/routes/gates.ts` — approve, reject (reject creates a per-student replacement quiz with `assignedUserId` set)
- Course unlock: `lms.ts` → `getUnlockedLessonIds` checks `lessonGatesTable` for `status="approved"` rows
- Completion sync: `approve` route calls `syncCourseCompletion` — gate approval may be the last step needed to earn a certificate

## Gating in the course player (frontend)
- `course-detail.tsx`: `useGetLessonGate(lessonId)` fetches current gate; `LessonGateBanner` shows status; `QuizTab` separates gate quiz from regular quizzes and highlights it
- Instructor panel: `ReviewQueueCard` lists `pending_review` gates; `RejectDialog` posts to `rejectGate` with `reviewNote` + `newQuiz` body

## How to add a gate quiz to a lesson (instructor)
In CourseContentManager → Quizzes tab → Add Quiz → "Link to lesson" dropdown → select a lesson. This sets `quizzesTable.lessonId`. On first student visit/progress call, `ensureGateExists` creates the gate row.
