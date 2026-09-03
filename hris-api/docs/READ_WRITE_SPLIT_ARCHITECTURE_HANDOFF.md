# Read/Write Split Architecture Handoff

## Overview

This API now supports PostgreSQL read/write split with:

- `master/primary` for all writes and transactional/root Prisma operations
- `read replicas` for read-only queries
- request-scoped read-after-write stickiness (if a request writes once, later reads in the same request use primary)
- replica round-robin selection across healthy replicas
- lag-aware fallback to primary when replica lag is above threshold or replica is unhealthy

## Files Changed

- `config/config.ts`
- `config/database.ts`
- `index.ts` (middleware to initialize request DB context)

## Environment Variables

### Required

- `WRITE_DATABASE_URL`: primary PostgreSQL DSN for writes.
  - Fallback chain in code: `WRITE_DATABASE_URL` -> `PG_DATABASE_URL` -> `DATABASE_URL`

### Optional (read replicas)

- `ENABLE_READ_REPLICA`: `true`/`false`
- `READ_DATABASE_URL`: single replica DSN
- `READ_DATABASE_URLS`: comma-separated replica DSNs (preferred for multi-replica)
  - Example: `postgresql://rep1,...,postgresql://rep2,...,postgresql://rep3,...`
- `READ_REPLICA_LAG_THRESHOLD_SECONDS`: max acceptable replica lag before fallback to primary (default `5`)
- `READ_REPLICA_HEALTHCHECK_INTERVAL_MS`: health check interval (default `10000`)

## Effective Behavior

1. Read-only request:
   - routed to a healthy replica in round-robin order.
   - if no healthy replica exists, routed to primary.

2. Write request:
   - routed to primary.

3. Read+write request:
   - first write marks request context as primary-only for subsequent reads.
   - all following reads in that same request go to primary to avoid stale reads.

## Replica Health and Lag Checks

Health query executed per replica:

```sql
SELECT
  pg_is_in_recovery() AS is_replica,
  EXTRACT(EPOCH FROM (now() - pg_last_xact_replay_timestamp())) AS lag_seconds
```

Replica is considered healthy only when:

- `pg_is_in_recovery() = true`, and
- `lag_seconds <= READ_REPLICA_LAG_THRESHOLD_SECONDS` (or lag is `NULL`)

If not healthy, reads fall back to primary.

## Production Topology Recommendation

- 1 primary PostgreSQL instance
- 3 read replicas
- Optional: place replicas behind a read LB/proxy if your infra requires centralized routing
- Continue using sticky read-after-write in app layer for consistency

## Example Env (3 replicas)

```env
WRITE_DATABASE_URL=postgresql://app_rw:***@primary.example.com:5432/hris
ENABLE_READ_REPLICA=true
READ_DATABASE_URLS=postgresql://app_ro:***@replica1.example.com:5432/hris,postgresql://app_ro:***@replica2.example.com:5432/hris,postgresql://app_ro:***@replica3.example.com:5432/hris
READ_REPLICA_LAG_THRESHOLD_SECONDS=5
READ_REPLICA_HEALTHCHECK_INTERVAL_MS=10000
```

## Local Deployment (1 Primary + 3 Replicas)

1. Start local PostgreSQL cluster:

```bash
docker compose -f docker-compose.postgres-rw.yml up -d
```

2. Ensure local `.env` contains:

- `WRITE_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/hris`
- `ENABLE_READ_REPLICA=true`
- `READ_DATABASE_URLS=postgresql://postgres:postgres@localhost:5433/hris,postgresql://postgres:postgres@localhost:5434/hris,postgresql://postgres:postgres@localhost:5435/hris`

3. Start API locally:

```bash
npm run dev
```

4. Stop local PostgreSQL cluster:

```bash
docker compose -f docker-compose.postgres-rw.yml down
```

## Operational Notes

- Replication sync is handled by PostgreSQL (WAL streaming), not by app logic.
- App-level fallback protects availability and consistency when replicas lag.
- Prisma root methods (`$transaction`, `$connect`, etc.) are always executed on primary by design.
- If you run with no replica env vars, behavior is effectively primary-only.

## Verification Checklist

1. Start API with primary + replica env vars.
2. Confirm startup logs show replica count and lag threshold.
3. Run read endpoint load and verify reads distribute across replicas.
4. Trigger write then immediate read in same request path and confirm primary consistency.
5. Artificially lag/stop a replica and verify reads fall back to primary.
