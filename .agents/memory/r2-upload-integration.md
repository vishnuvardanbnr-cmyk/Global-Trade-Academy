---
name: R2 upload integration
description: Cloudflare R2 object storage via native node:https and AWS Sig V4 — two critical gotchas.
---

## The integration

- `POST /api/upload/image` — multer memoryStorage → Sig V4 PUT to R2 → returns `/api/r2/<key>` URL
- `GET /api/r2/*key` — proxies objects from R2 (no public R2 access needed); `Cache-Control: immutable`
- Local disk fallback when `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` env vars are absent
- Zero npm deps: signing via `node:crypto` WebCrypto (`crypto.subtle`), transport via `import https from "https"` (top-level ESM import, NOT inline `require`)

## Gotcha 1: Express 5 wildcard params are arrays

In Express 5 (`path-to-regexp` v8), `router.get("/r2/*key", ...)` captures multi-segment paths as an **array**.  
`req.params.key` for `/r2/images/foo.png` is `["images", "foo.png"]`, which stringifies as `"images,foo.png"` — producing a 403 from R2 (bad key in signature).

**Fix:**
```js
const rawKey = (req.params as Record<string, string | string[]>).key;
const key = Array.isArray(rawKey) ? rawKey.join("/") : (rawKey ?? "");
```

## Gotcha 2: nginx regex intercepts /api/r2/*.png

nginx's `location ~* \.(png|jpg|...)$` has higher priority than a plain prefix `location /api/`.  
Result: `/api/r2/images/foo.png` is served as a static file (404) instead of being proxied to Express.

**Fix:** Use `^~` modifier on the API location — it tells nginx to stop checking regex locations:
```nginx
location ^~ /api/ {
    proxy_pass http://127.0.0.1:3000;
    ...
}
```

## Gotcha 3: Don't use inline `require("https")` in esbuild bundles

`const https = require("https")` inside an async function in an esbuild ESM bundle can misbehave  
(it runs through `globalThis.require` set by the banner, which may produce a different module instance).  
Always use a **top-level ESM import**: `import https from "https";`

## Sig V4 notes

- GET requests must NOT include `Content-Type` in signed headers — omit it to avoid 403
- Signing order: `kDate = HMAC("AWS4"+secret, dateStamp)` → `kRegion` → `kService` → `kSigning`
- R2 region is always `"auto"`, endpoint is `https://<accountId>.r2.cloudflarestorage.com`
- For PUT, include `Content-Length` in actual request headers (not in signed headers)
