---
name: LiveKit live-room integration
description: Architecture, bugs found, and rules for the LiveKit live classroom feature.
---

## Architecture

- Frontend: `artifacts/edu/src/pages/live-room.tsx`
- Backend token endpoint: `GET /api/live-classes/:classId/token` in `artifacts/api-server/src/routes/live-classes.ts`
- VPS: root@13.140.135.54; LiveKit runs via PM2 (port 7880); nginx proxies `/livekit-ws/` (WS) and `/rtc/` (HTTP) to it
- `LIVEKIT_URL = wss://ba.brightinsight.my/livekit-ws` (env in ecosystem.config.cjs)
- Token TTL: 7200s; staleTime on client: 1h

## LiveKit React rules (useLiveKitRoom internals)

- Room object is created in `useEffect([passedRoom, JSON.stringify(options, replacer)])`. If options JSON changes, a **new Room** is created → old Room's `[room]` cleanup fires `room.disconnect()` → CLIENT_REQUEST_LEAVE.
- **Fix**: `ROOM_OPTIONS` must be a module-level constant, never an inline `{{...}}` object. Same JSON string every render = room never recreated.
- When `connect={false}`, `useLiveKitRoom` **actively calls `room.disconnect()`** in its effect. Do NOT use `connect={false}` with a pre-connected room — it immediately kills the connection.
- **Always use standard `connect` prop** (true/false boolean) with stable `ROOM_OPTIONS`.

## useTracks + adaptiveStream deadlock

- With `adaptiveStream: true`, remote tracks start unsubscribed until a DOM element is visible.
- `onlySubscribed: true` in `useTracks` filters those tracks → no tile mounts → no DOM element → adaptive stream never subscribes → **participant invisible forever**.
- **Fix**: always use `onlySubscribed: false` when `adaptiveStream: true`.

## Token identity

- Identity must be deterministic: use `clerkId` (not `${clerkId}-${randomSuffix}`).
- Random suffix causes ghost participants on page refresh — old session shows as a second "person" until it times out.
- LiveKit server handles reconnects with same identity gracefully (replaces old session).

## Video codec

- `videoCodec: "vp9"` breaks Safari/iOS WebRTC publishing (vp9 encoding not supported).
- Use `videoCodec: "vp8"` (universal support) or omit to let LiveKit negotiate.

## Screen share state

- `isScreenSharing` local state must be synced from `localParticipant?.isScreenShareEnabled` via a `useEffect` to stay accurate after reconnects or external stops.

**Why:** All of the above were confirmed by reading `useLiveKitRoom` source at `.pnpm/node_modules/@livekit/components-react/src/hooks/useLiveKitRoom.ts` and from LiveKit server logs showing `CLIENT_REQUEST_LEAVE` and `numParticipants: 0`.
