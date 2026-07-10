---
name: MetaAPI direct trading (fan-out)
description: CopyFactory is broken; fan-out now uses direct trading REST API per copier account in parallel.
---

## Rule
Use `mt-client-api-v1.{region}.agiliumtrade.ai/users/current/accounts/{id}/trade` (POST) for all MetaAPI copier trades. Do NOT use CopyFactory domains — they have expired SSL certs and broken routes.

## How to apply
- `executeMetaApiDirect()` in fan-out.ts handles BUY/SELL/CLOSE/MODIFY per account.
- Region resolved at call time via provisioning API (`getMetaApiClientBase()`); defaults to `london`.
- Token fetched once per signal (`getMetaapiToken()`) then reused across all copiers.
- All copiers (metaapi + binance + bybit + mt5) now go through one `Promise.allSettled` loop → fully parallel.
- CLOSE/MODIFY look up `brokerOrderId` from prior `copy_trades` row for same trader+symbol.
- `metaapiStrategyId` / CopyFactory strategy code paths still exist in DB/routes but are unused for fan-out.

**Why:** CopyFactory `copyfactory-application-history-master-v1` and `copyfactory-application-configuration-v2` domains have expired SSL; `copyfactory-api-v1.london` returns 404. Direct trading API is stable.

## Action types
- BUY → `ORDER_TYPE_BUY`, SELL → `ORDER_TYPE_SELL`
- CLOSE → `POSITION_CLOSE_ID` (needs `positionId` from prior copy_trade)
- MODIFY → `POSITION_MODIFY` (needs `positionId`)
