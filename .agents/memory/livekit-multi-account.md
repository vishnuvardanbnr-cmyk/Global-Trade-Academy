---
name: LiveKit multi-account failover
description: Design of the multi-account auto-switch system for live sessions
---

## Design

`livekit_accounts` table (id, name, apiKey, apiSecret, serverUrl, isActive, priority) plus `livekitAccountId` FK on `live_classes`.

**Account selection order**: active DB accounts ordered by `priority` ASC, then env-var fallback (LIVEKIT_API_KEY / LIVEKIT_API_SECRET / LIVEKIT_URL). If no accounts at all → 503.

## Auto-switch protocol (race-condition safe)

Token endpoint: `GET /api/live-classes/:id/token?switchFrom=<accountId>`

- `switchFrom` matches `cls.livekitAccountId` → this client is the first to request a switch; advance to next account, generate new roomName, save both to DB.
- `switchFrom` does NOT match → another request already switched; return the current DB account without touching it.
- No `switchFrom` → normal path; use `cls.livekitAccountId` or assign the first account.

Response always includes `{ token, url, accountId }`.

**Why compare-and-swap (not a timestamp cooldown):** If 20 participants disconnect simultaneously and all call `?switchFrom=2`, the first DB write changes `livekitAccountId` to 3. All subsequent requests see `switchFrom=2` ≠ DB's `3`, so they use account 3 without switching again. This is an atomic CAS pattern without needing a DB lock.

## Frontend (live-room.tsx)

`switchParams: { version: number; switchFrom: number | null }` drives the token query key. On `RoomEvent.Disconnected` while class is live, set `switching=true`, wait 2.5s, then increment `version` + pass current `accountId` as `switchFrom`. A "Connecting to backup server…" overlay is shown during the switch. Token query clears the overlay when it resolves.

## Admin UI

`Admin → LiveKit` tab: CRUD for accounts (secrets write-only, never returned in GET), test-connection via `RoomServiceClient.listRooms()`, priority up/down reorder. Empty state falls back to env vars.
