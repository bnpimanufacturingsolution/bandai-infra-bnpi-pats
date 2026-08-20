# UAT/PROD app+API auto-roll on develop rebuild (2026-08-20)

| Field | Value |
|---|---|
| Status | `IMPLEMENTED` in `ansible/project-truth-pull.yml` |
| Operator ask | Auto-update UAT/PROD app and API, not only DEV; document well |
| Trigger | **Not** a new Git branch. Still `git push origin develop` → ansible-pull rebuild |
| What changed | After `k3s ctr images import`, restart `hris-api` / `hris-app` / `hris-callback-outbox` in **every namespace that has that Deployment**: `dev`, `uat`, `prod` |
| Old behavior | `env_name=dev` only for those deployments |
| Unchanged | Docs-only `services=none` still does **not** roll. `hris-emp-app` already rolled all three NS. `promote-gitops.yml` still exists for **tag** promotion / registry clients |
| Revert | Set VM env `PROJECT_TRUTH_ROLLOUT_NAMESPACES=dev` on the ansible-pull unit |

## Blast radius (this appliance)

All three live on **one VM**. Images are `*:develop` + `imagePullPolicy: Never`.

| Push content | DEV `:3100/:3101` | UAT `:3200/:3201` | PROD `:3000/:3001` |
|---|---|---|---|
| `hris-api/` or `hris-app/` (or compose / hikvision-linux that builds API) | rebuild + restart | **restart** (same `:develop` import) | **restart** |
| `services/callback-outbox/` | restart outbox (DEV only — UAT/PROD have no that Deployment) | skip | skip |
| `hris-emp-app/` | emp-app all NS (already) | emp-app | emp-app |
| docs / CI YAML only | no image, no roll | no | no |

Creating GitHub branches `uat` / `production` is **still not** the trigger. Argo `targetRevision` remains `develop`.

## Self-heal contract

`scripts/test-self-heal-contract.ps1` used to require `env_name=dev` (DEV-only restart). That check is now the default `PROJECT_TRUTH_ROLLOUT_NAMESPACES:-dev uat prod`, the namespace loop, skip-if-missing, and **no** hardcoded `env_name=dev` assignment.

## Skip-safe

`kubectl get deploy` per namespace: UAT/PROD do not have `hris-callback-outbox` or `hris-hikvision-watcher`. Those are skipped, not failed.

## How to watch

Observe: `ansible-pull` plus `onprem-{dev,uat,prod}-{api,app}`.  
Port green ≠ SHA. After an **app/api** rebuild, UAT/PROD pods should pick the imported `:develop` image because of the new restarts.

## Revert to DEV-only rolls

```text
# systemd drop-in or /etc/project-truth/os-sync.env
PROJECT_TRUTH_ROLLOUT_NAMESPACES=dev
```

Then restart `project-truth-ansible-pull.service` once (or wait for the timer).
