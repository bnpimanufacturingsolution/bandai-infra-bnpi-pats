# Hikvision callback outbox (K3s + SQLite)

Last updated: 2026-07-29

## Why

ACS must not require `bnpi-pats-api` to be healthy at the exact millisecond of the
device callback. Product truth still lives only in Postgres `device_events`
via `/api/hikvision/callback`.

## Architecture

```text
Host SDK listener (systemd, HCNetSDK)
  → prefers http://127.0.0.1:30108  (NodePort)
K3s watcher (bnpi-pats-hikvision-watcher)
  → http://bnpi-pats-callback-outbox:8080
        │
        ▼
bnpi-pats-callback-outbox (Deployment, 1 replica)
  SQLite: hostPath /var/lib/project-truth/callback-outbox/outbox.db
  indexes: status+time, device_id, serial_no
        │
        │ drain loop (and optional immediate drain)
        ▼
bnpi-pats-api:3001/api/hikvision/callback
        │
        ▼
Postgres device_events + socket emit
```

## Drop-in path

Outbox accepts the **same** path the C++ service already uses:

`POST {base}/api/hikvision/callback`

So producers do not need a new contract.

## Status

`GET http://127.0.0.1:30108/status` → pending / done / dead counts + recent rows.

## Not this

- Outbox is **not** the Device Events ledger.
- Do not dual-write Postgres from C++.
- Host listener file spool under `/tmp` remains a secondary local buffer;
  K3s outbox is the durable indexed queue for cluster producers + preferred
  host path when NodePort is healthy.
