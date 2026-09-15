# On-prem port access — 2026-08-20

| Field | Value |
|---|---|
| Status | `CONFIRMED_LIVE` |
| Operator doc | `docs/ONPREM_PORT_ACCESS.md` |
| Question | Are DEV/UAT/PROD still accessible via on-prem ports? |
| Answer | **Yes on the VM.** **No from this Windows home Wi‑Fi.** Public Cloudflare is the same instance. |

## Residual

| Bucket | Count | What it is | Blocker class | Next |
|---|---:|---|---|---|
| VM bind up | 6 | `:3000/:3001/:3100/:3101/:3200/:3201` HTTP 200 on `127.0.0.1` | none | use class A or C from this PC |
| This PC LAN | 6 | `10.184.37.19` all tcp=false | `physical_boundary` (`host_not_on_lan`) | office LAN or Cloudflare |
| Public tunnel | 3 APIs | DEV/UAT/prod `/health` 200 | none | `https://*-api.bnpi-pats.tech/health` |
| Observe onprem | 6 jobs | run 32325378487 success | none | Actions → Observe `onprem-*` |

## Live probes

### Class A — VM loopback (SSH `project-truth-bnpi-pats`)

| Name | URL | HTTP |
|---|---|---:|
| prod-app | `http://127.0.0.1:3000/auth/login` | 200 |
| prod-api | `http://127.0.0.1:3001/health` | 200 |
| dev-app | `http://127.0.0.1:3100/auth/login` | 200 |
| dev-api | `http://127.0.0.1:3101/health` | 200 |
| uat-app | `http://127.0.0.1:3200/auth/login` | 200 |
| uat-api | `http://127.0.0.1:3201/health` | 200 |

### Class B — this PC to LAN IP

| Target | ping | tcp |
|---|---|---|
| `10.184.37.19:3000` | false | false |
| `10.184.37.19:3001` | false | false |
| `10.184.37.19:3100` | false | false |
| `10.184.37.19:3101` | false | false |
| `10.184.37.19:3200` | false | false |
| `10.184.37.19:3201` | false | false |

This host: Wi‑Fi `192.168.1.26`, default gw `192.168.1.1`, no `10.184.37.x` address. Same `host_not_on_lan` as LAN SSH timeout.

### Class C — public

| URL | HTTP |
|---|---:|
| `https://dev-api.bnpi-pats.tech/health` | 200 |
| `https://uat-api.bnpi-pats.tech/health` | 200 |
| `https://api.bnpi-pats.tech/health` | 200 |

`/health` still has no `buildSha`. Tunnel liveness only.

## Observe

Push `afd817fb` Observe [32325378487](https://github.com/bnpimanufacturingsolution/bandai-infra/actions/runs/32325378487): `onprem-prod-app`, `onprem-prod-api`, `onprem-dev-app`, `onprem-dev-api`, `onprem-uat-app`, `onprem-uat-api` all **success**. Reporter curls class A after ansible-pull. GitHub cannot open class B.

## Related

- `docs/ONPREM_PORT_ACCESS.md`
- `.wwg/reports/devops-ci-observe-validate-20260819.md`
- Tunnel map: `cloudflared-bnpi-pats.yml` (`hostname → 10.184.37.19:<port>`)
