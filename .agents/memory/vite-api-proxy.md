---
name: Vite proxy for API routes
description: The EDU frontend Vite config must proxy /api to the API server; without it browser API calls receive SPA HTML instead of JSON.
---

## Rule

`artifacts/edu/vite.config.ts` must include a `server.proxy` block forwarding `/api` to `http://localhost:5000`.

```typescript
server: {
  proxy: {
    "/api": {
      target: "http://localhost:5000",
      changeOrigin: false,
    },
  },
},
```

**Why:** In the Replit dev environment the browser accesses the frontend via the Vite dev server port. Without a proxy, relative `/api/...` fetch calls hit Vite, which returns the SPA `index.html` (200 OK, `text/html`). The `customFetch` wrapper sees a successful 200 response with a text content-type and returns the raw HTML string. Any component that calls `.map()` on the result immediately crashes with `".map is not a function"`. This is silent — no 4xx/5xx error is thrown.

**How to apply:** Any time the EDU frontend is touched or a new Vite config is written for this project, confirm the `/api` proxy entry is present.
