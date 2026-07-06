---
name: VPS frontend deploy path
description: The correct extraction path for frontend deploys to the VPS; wrong path silently serves stale files.
---

# VPS Frontend Deploy Path

**Rule:** Always extract the frontend tarball at `/opt/brightinsight/artifacts/edu/` — not at `/opt/brightinsight/`.

**Why:** nginx is configured with `root /opt/brightinsight/artifacts/edu/dist/public`. Extracting at the project root (`/opt/brightinsight/`) places files in `/opt/brightinsight/dist/public/` instead, which nginx never serves. The old files stay live silently — no error, no warning.

**How to apply:**
```bash
# On VPS, extract INTO the correct subdirectory:
ssh root@13.140.135.54 "cd /opt/brightinsight/artifacts/edu && tar -xzf /tmp/edu-dist.tar.gz"
```

The tarball is created with `cd artifacts/edu && tar -czf /tmp/edu-dist.tar.gz dist/`, so extracting at `artifacts/edu/` on the VPS recreates `dist/public/` in the right place.

**Verification:** After deploy, check `grep 'admin-' /opt/brightinsight/artifacts/edu/dist/public/sw.js` — the hash should match the locally built `dist/public/assets/admin-*.js`.
