---
name: Sections reorder naming fix
description: Orval generates duplicate Zod schema names for inline request body objects; use named $ref schemas.
---

When an OpenAPI path uses an inline `schema:` object directly in `requestBody.content.application/json.schema`, Orval generates a Zod schema named from the operationId (e.g. `reorderCourseSectionsBody`). If two operations have similarly-structured inline bodies, the generated names collide and codegen crashes.

**Rule:** Every request body must reference a named component schema via `$ref: "#/components/schemas/XxxInput"`. Never use inline schemas for request bodies.

**Why:** Orval 7.x names Zod schemas from the operationId when the schema is inline; two operations with the same generated name produce a duplicate-export error in the Zod output file.

**How to apply:** After any OpenAPI change, run `pnpm --filter @workspace/api-spec run codegen`. If you see "duplicate identifier" or similar in the Zod output, find the inline request body and extract it to a named schema in `components/schemas`.
