# Observability Proof - 2026-06-22

This proof was captured against the Hyper-V VM `PROJECT-TRUTH-NODE` at LAN IP `192.168.100.89`.

## Result

Observability is reachable from the Windows host after repairing live VM drift in the stale image copy.

| Service | URL | Result |
| --- | --- | --- |
| Grafana | `http://192.168.100.89:53000/api/health` | HTTP 200, database ok |
| Prometheus | `http://192.168.100.89:9091/-/ready` | HTTP 200, ready |
| Loki | `http://192.168.100.89:3110/ready` | HTTP 200, ready |
| Tempo | `http://192.168.100.89:3202/ready` | HTTP 200, ready |
| cAdvisor | `http://192.168.100.89:8088/healthz` | HTTP 200, ok |

Grafana login was validated with:

```text
username: admin
password: admin123
```

`admin/admin123` returned HTTP 200 from the Grafana login API. `admin/admin` returned HTTP 401.

## Screenshots

Screenshot evidence was saved under:

```text
.runtime\observability-proof\20260622-221002
```

Important files:

- `grafana-01-login.png`
- `grafana-02-after-login.png`
- `grafana-03-datasources.png`
- `grafana-04-dashboards.png`
- `grafana-05-hris-observability-folder.png`
- `grafana-06-first-dashboard.png`

The screenshots show:

- Grafana login page
- Authenticated Grafana home page
- Provisioned datasources: Alertmanager, Loki, Prometheus, Tempo
- `HRIS Observability` dashboard folder
- `HRIS Container Logs` dashboard

## Drift Found And Repaired Live

The repo already contains the correct observability network and Tempo port configuration, but the running VM artifact had stale files.

Live VM drift repaired:

1. `/opt/project-truth/hris-api/infrastructure/onprem/observability/docker-compose.yml` had:

   ```yaml
   networks:
     observability:
       name: hris-observability
   ```

   It was patched live to:

   ```yaml
   networks:
     observability:
       external: true
       name: hris-observability
   ```

2. The live VM observability compose published Tempo on host port `3200`, colliding with the UAT HRIS app. It was patched live to publish Tempo on host port `3202`, matching the current repo.

These are live VM artifact drift repairs, not new repo source changes.

## Remaining Notes

- The observability backup helper container was restarting during proof capture and should be investigated separately.
- The first opened dashboard, `HRIS Container Logs`, loaded but showed `No data` for the selected time range. The observability stack itself is reachable and Grafana datasources are provisioned.
- The current proof does not prove that a fresh rebuilt VHDX already contains these fixes. It proves the current live VM after drift repair.

