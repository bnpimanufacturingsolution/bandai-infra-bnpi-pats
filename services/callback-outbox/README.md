# bnpi-pats-callback-outbox (K3s SQLite outbox)

Durable, **indexed** buffer for Hikvision ACS payloads when `bnpi-pats-api` is slow/down.

## Architecture (Project Truth)

```text
Host SDK listener (systemd)  ──┐
                               ├──► bnpi-pats-callback-outbox:8080  (this pod)
K3s bnpi-pats-hikvision-watcher  ───┘         │
                                         │ SQLite /data/outbox.db  (hostPath)
                                         ▼
                                   POST bnpi-pats-api:3001/api/hikvision/callback
                                         ▼
                                   Postgres device_events  (product truth)
```

- **Outbox** = pending queue (SQLite indexes: status, device, serial, time)
- **Ledger** = only via API callback (dedupe, match, socket, attendance)

## HTTP

| Method | Path | Role |
|---|---|---|
| GET | `/health` | probe |
| GET | `/status` | pending/done/dead + recent rows |
| POST | `/api/hikvision/callback` | **drop-in** enqueue (+ optional immediate drain) |
| POST | `/enqueue` | same |
| POST | `/drain` | force batch drain |

## K3s (DEV)

Manifest lives in `gitops/runtime-k8s/overlays/dev/runtime.yaml`:

- Deployment `bnpi-pats-callback-outbox`
- Service ClusterIP + NodePort **30108** (host listener can use `http://127.0.0.1:30108`)
- hostPath `/var/lib/project-truth/callback-outbox`

## Build / import

```bash
docker build -t bnpi-pats-callback-outbox:develop services/callback-outbox
# on VM:
k3s ctr -n k8s.io images import <tar>
kubectl -n dev apply -k gitops/runtime-k8s/overlays/dev
```

## Host listener

Prefer outbox when healthy (see `scripts/project-truth-hikvision-hot-reload-listener.sh`):

`http://127.0.0.1:3108` as `LOCAL_API_BASE` so C++ posts to  
`{base}/api/hikvision/callback` on the outbox.
