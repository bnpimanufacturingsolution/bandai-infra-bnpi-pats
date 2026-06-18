# Prisma Migration Plan: MongoDB to PostgreSQL

## Goal

Migrate this API from MongoDB-backed Prisma to PostgreSQL-backed Prisma with minimal downtime and no data loss.

## Confirmed Migration Decisions

- ID format in PostgreSQL: `String @id @default(cuid())`
- Rollout mode: Dual-run migration
- Data strategy: Full MongoDB backfill to PostgreSQL
- Cutover mode: Short write freeze during final switch
- Schema strategy for Mongo composite types: convert to `Json` columns in PostgreSQL
- Dual schema layout: keep Mongo at `prisma/schema`, maintain Postgres target at `prisma/schema-postgres`

## Current State (Verified)

- Prisma datasource provider is MongoDB in `prisma/schema/schema.prisma`.
- Schema files are heavily Mongo-specific (`@db.ObjectId`, `@default(auto())`, `@map("_id")`).
- Codebase contains Mongo-specific assumptions in:
  - Prisma datasource validation helper
  - migration/maintenance scripts using `mongodb` driver
  - route/docs text referencing ObjectId format
  - some controller logic that detects 24-hex ObjectId input

## Target State

- Prisma datasource provider switched to PostgreSQL.
- IDs use PostgreSQL-compatible strategy (recommended: `String @id @default(cuid())` for backward-compatible string IDs).
- No `@db.ObjectId`, `@map("_id")`, or `@default(auto())` remaining in Prisma schema.
- App logic no longer depends on ObjectId shape.

## Strategy

Use an incremental, low-risk migration in 6 phases.

### Phase 1: Postgres Readiness (No Runtime Cutover)

- Accept PostgreSQL datasource URLs in config validation.
- Add this migration plan and track blockers.
- Keep runtime on MongoDB.

### Phase 2: Prisma Schema Conversion (Dual Schema)

- Keep Mongo runtime schema unchanged at `prisma/schema`.
- Maintain PostgreSQL target schema at `prisma/schema-postgres`.
- In `prisma/schema-postgres`:
  - datasource provider is `postgresql`
  - ID/relations use `String` IDs with `@default(cuid())`
  - remove Mongo-only annotations (`@db.ObjectId`, `_id` mapping, `auto()`)
  - convert Mongo composite `type` structures to `Json` fields
- Re-check unique/index definitions for relational DB behavior.
- Validate with:
  - `npx prisma validate --schema prisma/schema-postgres`

### Phase 3: Application Compatibility Updates

- Remove ObjectId-specific branching in controllers/services.
- Keep endpoint contracts stable (`id` stays string).
- Update OpenAPI descriptions from “MongoDB ObjectId format” to generic “record ID”.

### Phase 4: Data Migration Tooling

- Build one-time migration script:
  - read from MongoDB
  - write to PostgreSQL in dependency-safe order
  - preserve original IDs as strings
  - preserve timestamps and soft-delete fields
- Add idempotency and resume support.
- Add table-level checkpoints and row counts for restart safety.

### Phase 5: Dual Validation + Cutover

- Run parity checks (counts + sampled record comparisons + key business flows).
- Enable short write freeze window:
  - stop write endpoints/jobs
  - run final incremental sync
  - run final parity checks
- Switch runtime `DATABASE_URL` to PostgreSQL and deploy.
- Keep MongoDB read-only for rollback window.

### Phase 6: Cleanup

- Retire Mongo-only scripts and env vars when no longer needed.
- Update docs, runbooks, and seed flows.

## High-Risk Areas to Handle Explicitly

- Timesheet/attendance/payroll flows with deep cross-model references
- Any script that directly uses `mongodb` driver (`scripts/*`)
- Routes currently documenting ObjectId patterns
- Seeder assumptions tied to Mongo collection behavior

## Acceptance Criteria

- `npx prisma generate` succeeds with PostgreSQL provider.
- Core tests pass against PostgreSQL.
- Data parity checks pass for critical entities.
- Production deployment runs with PostgreSQL `DATABASE_URL`.

## Immediate Next Step

Proceed with Phase 3 and Phase 4 implementation:

1. Replace ObjectId-specific runtime checks in app code with generic string ID handling.
2. Implement Mongo->Postgres backfill scripts with deterministic ordering and checkpointing.
3. Add parity validation scripts and cutover checklist automation.

## Implemented Commands (Dual-Run)

- Generate PostgreSQL Prisma client:
  - `npm run prisma-postgres:generate`
- Push PostgreSQL schema (non-migration mode):
  - `npm run prisma-postgres:push`
- Backfill MongoDB -> PostgreSQL:
  - `npm run migrate:mongo-to-postgres`
- Count parity check:
  - `npm run verify:mongo-postgres-parity`

Note:
- Current Postgres CLI execution uses `prisma/schema-postgres` as the schema-folder entrypoint. Keep generated all-in-one `.prisma` files out of `prisma/schema-postgres` so folder validation does not load duplicate models.
