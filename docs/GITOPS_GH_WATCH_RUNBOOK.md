# GitOps GitHub Watch Runbook

Use this runbook to verify local GitOps state, trigger or observe GitHub Actions, and wait until a workflow reaches a terminal status.

## Current State Checks

```powershell
git status --short
git branch --show-current
git branch -a
git remote -v
gh auth status
gh workflow list
gh run list --limit 10
```

Current checked-out branch in this working tree is `develop`. Remote branches discovered in this repo include `origin/develop` and `origin/main`. `uat` and `production` are workflow trigger names until matching remote branches are created and pushed by an operator.

## Verify GitOps Overlays

```powershell
kubectl kustomize gitops/overlays/dev
kubectl kustomize gitops/overlays/uat
kubectl kustomize gitops/overlays/prod
```

The overlays render environment contract ConfigMaps. The selected release is recorded in:

```text
gitops/overlays/<env>/environment-patch.yaml
```

The base environment contract may contain historical temporary public-demo
tunnel markers:

```text
experimental_trycloudflare_supported=true
experimental_trycloudflare_default=false
experimental_trycloudflare_flag=EXPERIMENTAL_TRY_CLOUDFLARE
```

This is documentation and drift visibility only. The normal public path is the
host-managed named Cloudflare Tunnel for `bnpi-hris.tech`; quick-tunnel URLs are
generated runtime evidence, not GitOps desired state.

## Dispatch Promotion

```powershell
gh workflow run promote-gitops.yml -f environment=dev -f image_tag=<tag>
gh run list --workflow promote-gitops.yml --limit 5
```

Copy the latest run id, then watch it:

```powershell
.\scripts\project-truth.ps1 watch-github-run -RunId <run-id>
```

Or use raw `gh`:

```powershell
gh run watch <run-id>
gh run view <run-id> --json status,conclusion,name,url,updatedAt
gh run view <run-id> --log-failed
```

The promotion updates both the environment contract marker and the selected
runtime image tag for the matching Kubernetes runtime overlay. On local/offline
VMs, make sure the same tag is imported into K3s before expecting the rollout to
start:

```powershell
.\scripts\project-truth.ps1 enable-k8s-runtime -GuestIp <guest-lan-ip> -ImageTag <tag>
```

## Push Watch Loop

For owner-operator repair work on this repo, push `develop` after local validation passes and watch the resulting workflow to a terminal status:

```powershell
git push origin develop
gh run list --branch develop --limit 5
.\scripts\project-truth.ps1 watch-github-run -RunId <run-id>
```

## Observe VM auto-deploy from GitHub Actions

Pushing `develop` starts **Observe VM GitOps deploy**. That job is the public
signal for whether the VM has already pulled the SHA.

| GitHub Actions job | Meaning |
|---|---|
| **CI / hris-api** | API source-truth mocha (`npm run test:regression:payroll-source-truth`) |
| **CI / hris-app** | App vitest payroll-correction (`npm run test:payroll-correction`). Full `npm test` still has Router/typecheck failures. |
| **CI / hris-emp-app** | Employee app tests, or skip if submodule missing |
| **CI / hikvision** | Linux probe unit tests |
| **CI / zkteco** | Linux probe unit tests (`vendor/zkteco-linux/tests`) |
| **CI / ansible** | `ansible-playbook --syntax-check` of `ansible/project-truth-pull.yml` |
| **CI / callback-outbox** | Python syntax |
| **CI / gitops** | `kubectl kustomize` overlays |
| **Observe / ansible-pull** | VM wrote `ansible-pull-state` for this SHA |
| **Observe / hris-api** | DEV API image rebuilt **or** `services=none` this SHA |
| **Observe / hris-app** | DEV app image rebuilt **or** not rebuilt this SHA |
| **Observe / hris-emp-app** | Employee app image rebuilt **or** not rebuilt |
| **Observe / callback-outbox** | Outbox image rebuilt **or** not rebuilt |
| **Observe / onprem-prod-api** | VM `127.0.0.1:3001/health` HTTP 2xx |
| **Observe / onprem-prod-app** | VM `127.0.0.1:3000/auth/login` HTTP 2xx |
| **Observe / onprem-dev-api** | VM `127.0.0.1:3101/health` HTTP 2xx |
| **Observe / onprem-dev-app** | VM `127.0.0.1:3100/auth/login` HTTP 2xx |
| **Observe / onprem-uat-api** | VM `127.0.0.1:3201/health` HTTP 2xx |
| **Observe / onprem-uat-app** | VM `127.0.0.1:3200/auth/login` HTTP 2xx |

`in progress` on Observe = waiting for VM `ansible-pull` (timer every 5 min).
`success` = VM reported that environment. Image jobs can succeed with **not rebuilt this SHA**.

On this appliance, a **rebuild** of hris-api/hris-app now restarts those Deployments in **dev, uat, and prod** (skip if missing). GitHub branches `uat`/`production` are not that trigger. Report: `.wwg/reports/uat-prod-app-api-auto-roll-20260820.md`.

Hard honesty:

- **CI green** is tests, not “deployed”.
- **Observe hris-api success** is not a new API image unless the status description says rebuilt (live `efc86c56` was `services=none`).
- **`/health` healthy** is not a git SHA (`buildSha` is absent).
- **Runtime Argo Synced/Degraded** is usually Failed Job `hris-api-db-init`, not “database wiped”. Do not reseed UAT/PROD. Do not delete that Failed Job until `origin/develop` is schema-only (`prisma-postgres:push` only). Operator page: `docs/DB_INIT_JOB.md`.
- **Validate** is the Windows terraform/packer/installer gate; watching only **CI** misses it.
- Nested Cloud Run / Firebase workflows under `hris-api/.github` and `hris-app/.github` do not run here.

Full map: `.wwg/reports/devops-ci-observe-validate-20260819.md`.

Deployments page environments: `vm-gitops`, `hris-api`, `hris-app`, `hris-emp-app`, `callback-outbox`, plus `onprem-{prod,dev,uat}-{api,app}`.

On-prem URL cheat sheet: `docs/ONPREM_PORT_ACCESS.md`.

```powershell
gh run list --workflow observe-deploy.yml --branch develop --limit 5
gh run watch <run-id>
```

Do not treat **Validate Project Truth Hyper-V Repo** as deploy proof. That job
only validates the repo. VM pull is **Observe VM GitOps deploy**.

For `uat` or `production`, first verify those branches exist locally and remotely:

```powershell
git branch -a
```

Do not create, rename, or push production branches unless that is part of the current Project Truth operations goal.

## VM/Cluster Verification

When a guest VM IP is known:

```powershell
.\scripts\project-truth.ps1 verify-gitops-state -GuestIp <guest-lan-ip>
```

Without a guest IP, verification is limited to local overlay rendering and GitHub Actions status.

## Client Scaling

Keep DEV/UAT/PROD as separate namespaces and separate Argo Applications for a
single client. For many clients, use the same shape per client and consider the
template in [GitOps Client And Environment Scaling](GITOPS_CLIENT_ENV_SCALING.md).
