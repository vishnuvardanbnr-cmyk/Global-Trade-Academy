---
name: Deriv App ID vs API Token
description: DERIV_APP_ID env var contains an alphanumeric API token, not the numeric app_id required by wss://ws.binaryws.com — always validate before use.
---

## The Rule
Before using `process.env.DERIV_APP_ID` as the Deriv WebSocket app_id, validate that it is purely numeric. If not, fall back to `"1089"` (Deriv's public demo app_id which covers all market data without authentication).

```typescript
function resolveDerivAppId(): string {
  const raw = process.env.DERIV_APP_ID ?? "";
  const n   = parseInt(raw, 10);
  return !isNaN(n) && String(n) === raw.trim() ? raw.trim() : "1089";
}
```

**Why:** The DERIV_APP_ID secret was set to an alphanumeric string (API token format), not the numeric app registration ID Deriv requires in the WebSocket URL. Using the raw value causes the WebSocket to immediately error; falling back to the public demo app_id `1089` allows all market data endpoints (candles, ticks, tick history) to work without authentication.

**How to apply:** Use `resolveDerivAppId()` in any backend code that connects to `wss://ws.binaryws.com`. Market data (ticks_history, candles) does NOT require the API token — only account operations (balance, portfolio, trades) need `{"authorize": TOKEN}`.
