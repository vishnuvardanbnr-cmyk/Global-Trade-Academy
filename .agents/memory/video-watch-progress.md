---
name: Video watch-progress persistence
description: How lesson video watch position (maxWatched) is tracked, persisted, and kept monotonic across client/server.
---

Lesson video watch position ("furthest point reached") is tracked client-side for the seek guard (can't skip ahead past it) and is also persisted server-side via `watchedSeconds` on `lessonProgressTable`, synced by a heartbeat every 5s during playback (`PATCH /lessons/:id/progress` with only `watchedSeconds`, no `completed`).

**Why:** Previously watch position lived only in localStorage, so it reset/was lost across devices or browsers, and there was no live sync — only saved on-device.

**How to apply:**
- Client seeds initial position as `max(localStorage, server watchedSeconds)` on lesson load/switch (`resolveInitialWatched`), never regressing.
- Server also enforces monotonicity independently: `watchedSeconds` update takes `Math.max(incoming, existing)` — never trust the client alone, since heartbeats can arrive out of order.
- Heartbeat calls must never send `completed: false` explicitly (would downgrade an already-completed lesson) — `completed` is optional in `LessonProgressUpdate`; omit it entirely for heartbeat-only pings.
- All three player implementations (Hls/Direct via shared `useSeekGuard`, and the separate YouTube IFrame poller) each need this wired independently — they don't share a single video element.
