---
name: Replit artifact routing vs port-based routing
description: How the Replit Helium microVM routes external traffic; why duplicate [[ports]] entries cause 502; how the artifact system fixes it.
---

## The rule

Use the Replit **artifact system** (`kind: web` and `kind: api`) for external routing — do NOT rely on `[[ports]]` entries alone. Duplicate `externalPort` values in `[[ports]]` cause unresolvable 502s that persist even after the file is fixed.

**Why:** In Replit Helium (microVM), pid1 reads `.replit` at startup and caches the port→external-port routing table. If two `[[ports]]` entries share the same `externalPort` (e.g., both `5000→80` and `8080→80`), pid1 caches a stale/conflicting route and `127.0.0.1:80` (pid1's local proxy) returns 502 permanently. Editing `.replit` after the fact doesn't force pid1 to reload.

**How to apply:** Register artifacts via `verifyAndReplaceDotReplit` (which triggers Replit's artifact detection). Then run the auto-generated `artifacts/<name>: web` and `artifacts/<name>: API Server` workflows. These use Replit's artifact routing infrastructure which bypasses the broken `[[ports]]` mechanism entirely.

## Port assignment for artifact workflows

- Web artifact (`artifacts/edu: web`): Replit injects `PORT=23624` automatically; Vite reads `process.env.PORT`.
- API artifact (`artifacts/api-server: API Server`): Replit injects its own port; server reads `process.env.PORT`.
- The old `[[ports]]` entries remain in `.replit` but are effectively ignored by the artifact routing layer.

## Signs of the duplicate-port bug

- `curl http://127.0.0.1:80/` → 502 (pid1's proxy can't reach its cached backend port)
- `curl http://127.0.0.1:18080/` → 502 (second stale route for old duplicate)
- `curl http://localhost:5000/` → 200 (app IS running, but pid1 routes to wrong port)
- `getWorkflowStatus().openPorts` returns `[80]` not `[5000]`

## Fix applied

1. Called `verifyAndReplaceDotReplit` → Replit detected `artifacts/edu` and `artifacts/api-server` → created artifact workflows.
2. Started `artifacts/edu: web` (Vite on port 23624) and `artifacts/api-server: API Server`.
3. Artifact routing: dev domain → port 23624 (web), `/api` → artifact API server.
