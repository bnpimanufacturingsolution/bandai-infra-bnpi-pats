# HRIS API

Backend API for HRIS, built with TypeScript, Express, and Prisma.

## Quick Start

```bash
npm install
npm run dev
```

`npm run dev`, `npm start`, `npm test`, and `npm run build` now auto-generate the local Prisma client in `generated/prisma` when it is missing or stale.

## Common Commands

```bash
npm run build
npm run test
npm run prisma-generate
```

If Prisma generation fails during bootstrap, run `npx prisma generate --schema prisma/schema-postgres/schema.combined.prisma` to inspect the underlying Prisma error directly.

## Postgres Migration Commands

```bash
npm run prisma-generate
npm run prisma-postgres:generate
npm run prisma-postgres:push
npm run migrate:mongo-to-postgres
npm run verify:mongo-postgres-parity
```
## For Agents

If you are an AI coding agent working in this repository:

- Start with `AGENTS.md`.
- Use WWG canonical context under `.wwg/`.
- Prefer `npm run wwg:status`, `npm run wwg:test-check`, and `npm run wwg:validate` before major changes.

## Documentation

Core docs:

- `docs/POSTGRES_MIGRATION_HANDOFF_2026-05-16.md`
- `docs/PRISMA_MONGODB_TO_POSTGRES_PLAN.md`
- `docs/REQUEST_WORKFLOW_GUIDE.md`
- `docs/SECURITY.md`
- `docs/SECURITY_IMPLEMENTATION.md`
- `docs/REDIS_SETUP.md`
- `docs/READ_WRITE_SPLIT_ARCHITECTURE_HANDOFF.md`
