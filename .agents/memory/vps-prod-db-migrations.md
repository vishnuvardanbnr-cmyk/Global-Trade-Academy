---
name: VPS production DB migrations
description: pnpm db push only targets the Replit dev DB; VPS production DB needs manual ALTER TABLE via SSH after every schema change.
---

# VPS production DB migrations

**Rule:** `pnpm --filter @workspace/db run push` targets the `DATABASE_URL` set in the Replit environment (dev DB). The VPS production database (`postgresql://brightinsight:bi_prod_2024@localhost:5432/brightinsight` on 13.140.135.54) is completely separate and never receives these pushes automatically.

**Why:** Every time a new column is added to the Drizzle schema and pushed via `db push`, the VPS API immediately starts crashing with `column "xyz" does not exist` errors — breaking every endpoint that touches that table for all users.

**How to apply:** After every `db push`, run the equivalent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...` on the VPS via SSH:

```bash
ssh -i /home/runner/.ssh/vps_key -o StrictHostKeyChecking=no root@13.140.135.54 "
  PGPASSWORD='bi_prod_2024' psql -h localhost -U brightinsight -d brightinsight -c \"
    ALTER TABLE <table> ADD COLUMN IF NOT EXISTS <column> <type>;
  \"
"
```

Past incidents:
- `sub_category text` on `courses` table
- `expires_at timestamptz` on `enrollments` table

Both caused a full production outage (all course/enrollment API calls returning 500) until patched manually.
