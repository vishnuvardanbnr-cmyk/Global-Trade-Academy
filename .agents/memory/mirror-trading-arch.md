---
name: Mirror trading poller architecture
description: How the mirror/copy trading auto-detection system works — poller, fan-out split, schema, VPS deploy steps.
---

# Mirror trading poller

## Schema
- `copy_accounts` now has `role TEXT DEFAULT 'copier'` ("master"|"copier") and `trader_id INTEGER` (set when role=master).
- New `master_positions` table — snapshot of each master's open positions; updated by the poller every 5s.

## Files
- `artifacts/api-server/src/lib/mirror-poller.ts` — background setInterval poller; fetches Binance futures, Bybit linear, or MT5 bridge positions; diffs vs `master_positions`; auto-fires open/close/modify/partial-close signals.
- `artifacts/api-server/src/lib/fan-out.ts` — shared fan-out logic (extracted from trading.ts); skips accounts with role=master to avoid self-execution.
- `artifacts/api-server/src/lib/encrypt.ts` — needed by both fan-out and poller; was missing from VPS `/opt/brightinsight/artifacts/api-server/src/lib/` — must be copied on deploy.

## API routes added
- `GET/POST /api/master-accounts` — manage master exchange accounts linked to a trader profile
- `DELETE /api/master-accounts/:id` — deletes positions snapshot too
- `GET /api/master-positions?traderId=X` — read-only live snapshot

## Poller lifecycle
- Starts on `server.listen()` callback via `startMirrorPoller()` in `index.ts`.
- Runs every 5s; silently returns when no master accounts exist.
- Logs `mirror-poller: starting` on boot (visible in PM2 logs to confirm active).

## VPS deploy steps (order matters)
1. `scp` changed `.ts` source files to `/opt/brightinsight/...`
2. `psql $DATABASE_URL` — ALTER TABLE / CREATE TABLE for schema changes
3. `pnpm --filter @workspace/api-server run build` on VPS
4. `pm2 restart brightinsight-api`

**Why:** VPS has no `db push` integration; migrations must be manual SQL. `encrypt.ts` was not on VPS initially — always verify lib files are present after adding new imports.
