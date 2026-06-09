---
name: WebSocket real-time chat architecture
description: How WebSockets are implemented for real-time messaging across all chat surfaces.
---

## Architecture

- **WS endpoint**: `GET /api/ws` (WebSocket upgrade). Handled by `artifacts/api-server/src/lib/ws.ts`.
- **HTTP server**: `index.ts` creates an explicit `createServer(app)` and calls `initWSS(server)` before `server.listen()`.
- **Auth**: Cookie (`auth_token`) read directly from WS handshake headers via `IncomingMessage.headers.cookie`. Falls back to `?token=` query param. Uses `verifyToken()` from `lib/auth.ts`.
- **Transport**: nginx `/api/` location already has `proxy_http_version 1.1` + `Upgrade $http_upgrade` headers → `/api/ws` works without nginx changes.
- **Vite dev proxy**: `/api` proxy has `ws: true` added so WebSocket upgrades pass through in development.

## Topic protocol

Client → Server (after connect):
```json
{ "type": "subscribe", "topics": ["live-class:1:messages", "live-class:1:questions"] }
{ "type": "unsubscribe", "topics": ["live-class:1:messages"] }
```

Server → Client:
```json
{ "type": "connected", "userId": "..." }
{ "type": "event", "topic": "live-class:1:messages", "data": { ...messageObject } }
{ "type": "event", "topic": "live-class:1:polls", "data": null }
```

## Topics and their data strategy

| Topic | Data sent | Client action |
|---|---|---|
| `live-class:{id}:messages` | Full message object | `setQueryData` append (no HTTP) |
| `live-class:{id}:questions` | `null` | `invalidateQueries` (per-user hasUpvoted) |
| `live-class:{id}:polls` | `null` | `invalidateQueries` (per-user myVoteOptionId) |
| `community:{channelId}:posts` | `null` | `invalidateQueries` |
| `community:post:{postId}:comments` | `null` | `invalidateQueries` |

## Broadcast points (backend)

- `POST /live-classes/:id/messages` → after insert
- `POST /live-classes/:id/questions` → after insert
- `PATCH /live-classes/:id/questions/:qid` → after update (answer/pin)
- `POST /live-classes/:id/questions/:qid/upvote` → after vote toggle
- `POST /live-classes/:id/polls` → after insert
- `PATCH /live-classes/:id/polls/:pid` → after open/close
- `POST /live-classes/:id/polls/:pid/vote` → after vote
- `POST /posts` (community) → if channelId != null
- `POST /posts/:id/comments` (community) → after insert

## Frontend hook (artifacts/edu/src/hooks/useWS.ts)

- Module-level singleton WebSocket (one connection per page, shared across all subscribers)
- Auto-reconnects with exponential backoff (2s base, 30s max)
- `useWS(topic, handler)` — subscribes on mount, unsubscribes on unmount
- Handler ref pattern so handler can use fresh closure without re-subscribing

## Polling fallback

All queries keep `refetchInterval: 60_000` as a silent failsafe in case WS drops.

**Why:** Questions/polls have per-user state (hasUpvoted, myVoteOptionId) that differs per client. Pushing the raw DB row to all subscribers would show wrong voted state. Null-signal + invalidate triggers a fresh per-user fetch instead.
