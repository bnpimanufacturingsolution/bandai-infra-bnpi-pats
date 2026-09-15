# DevOps Runbook

## Workflow Roles

| Workflow | Purpose | Runner |
|---|---|---|
| `ci.yml` | Per-type product checks: bnpi-pats-api, bnpi-pats-app, bnpi-pats-emp-app, hikvision, zkteco, ansible syntax-check, callback-outbox, gitops kustomize. **Not** deploy proof. | GitHub-hosted Ubuntu |
| `observe-deploy.yml` | Per-type GitHub Deployments wait for VM `project-truth-report-github-deploy`. Image envs: `success` can mean **not rebuilt**. On-prem jobs: VM curl of DEV/UAT/PROD `:3000/:3001/:3100/:3101/:3200/:3201`. | GitHub-hosted Ubuntu |
| `validate.yml` | Static validation for Node, PowerShell, Terraform, Packer, installer, self-heal, observability contract, GitOps overlays. **Not** deploy proof. | GitHub-hosted Windows |
| `promote-gitops.yml` | Manual GitOps release tag and runtime image tag promotion for DEV/UAT/PROD. | GitHub-hosted Ubuntu |

Operator map and honesty tables: `.wwg/reports/devops-ci-observe-validate-20260819.md`. Nested package workflows under `bnpi-pats-api/.github` and `bnpi-pats-app/.github` do not run on this monorepo.

On-prem DEV/UAT/PROD ports (LAN vs this PC vs Cloudflare): `docs/ONPREM_PORT_ACCESS.md`.

GitOps schema Job (`bnpi-pats-api-db-init`), seed ban, backups, and why Failed Jobs are left until git is schema-only: `docs/DB_INIT_JOB.md`.

## Validate

Runs on pull request, manual dispatch, and pushes to `main`, `develop`, `uat`, or `production`.

Checks:

```text
node -c app/server.js
PowerShell parser for scripts and installer
terraform fmt/init/validate
kubectl kustomize for dev/uat/prod
packer validate image-factory/packer/ubuntu-hyperv.pkr.hcl
packer validate image-factory/packer/ubuntu-virtualbox.pkr.hcl
PowerShell fallback installer build
temp-path installer install and shortcut contract verification
```

## Appliance auto-roll (DEV + UAT + PROD app/API)

On this single-VM appliance, ansible-pull still tracks Git branch **`develop`**. After it imports rebuilt `bnpi-pats-api-local:develop` / `bnpi-pats-app-local:develop`, it restarts those Deployments in namespaces **`dev`**, **`uat`**, and **`prod`** when the Deployment exists.

That is **not** “GitHub branch `uat`/`prod` auto-deploys.” Creating those branches does not change the puller or Argo `targetRevision` (still `develop`).

Docs-only pushes still do not rebuild or restart. Callback-outbox exists only in **dev** and is skipped in uat/prod.

Revert to old DEV-only app/API restarts:

```text
PROJECT_TRUTH_ROLLOUT_NAMESPACES=dev
```

Report: `.wwg/reports/uat-prod-app-api-auto-roll-20260820.md`.

## DB init Job (do not seed UAT/PROD)

Runtime Argo **Degraded** on `bnpi-pats-api-db-init` Failed does **not** mean Postgres is empty. Live DEV/UAT/PROD APIs can be healthy while that Job is Failed.

| Env | Allowed Job command | Forbidden |
|---|---|---|
| GitOps `dev` / `uat` / `prod` | `npm run prisma-postgres:push` only | `prisma-seed`, `prisma-reset`, `--accept-data-loss` |
| Empty local compose bootstrap | push **and** seed is OK for a blank laptop DB | pointing that compose at UAT/PROD volumes |

Argo runtime apps use `selfHeal: true`. **Do not delete** a Failed `bnpi-pats-api-db-init` Job while `origin/develop` still contains `prisma-seed` — Argo will recreate the seed Job and can delete timesheets.

Operator page + backup paths + after-commit order: `docs/DB_INIT_JOB.md`. Evidence: `.wwg/reports/db-init-repair-20260821.md`.

## Promotion

Use manual dispatch for `promote-gitops.yml`.

Inputs:

```text
environment: dev | uat | prod
image_tag: safe container tag
```

The workflow updates:

```text
gitops/overlays/<env>/environment-patch.yaml
gitops/runtime-k8s/overlays/<env>/kustomization.yaml
```

`release_tag` and `runtime_image_tag` record the selected release in the
environment contract ConfigMap. The runtime kustomization selects the same tag
for `bnpi-pats-api-db-init`, `bnpi-pats-api-local`, and `bnpi-pats-app-local`.

Argo CD is expected to detect the Git change and sync the selected environment.
For the local/offline appliance image path, the selected runtime image tag must
also exist in K3s containerd. Seed or refresh it with:

```powershell
.\scripts\project-truth.ps1 enable-k8s-runtime -GuestIp <vm-lan-ip> -ImageTag <tag>
```

For a registry-backed client path, publish the same tag to the registry and
configure the runtime manifests/imagePullSecrets accordingly before promotion.

Optional registry-backed promotion:

```powershell
gh workflow run promote-gitops.yml `
  -f environment=dev `
  -f image_tag=<tag> `
  -f image_registry=ghcr.io/<org>/<project>
```

## Argo CD Platform

Project Truth pins Argo CD reconciliation instead of relying on the upstream
default:

```text
timeout.reconciliation: 60s
timeout.reconciliation.jitter: 15s
```

Apply or repair that platform setting with:

```powershell
.\scripts\project-truth.ps1 apply-argocd-platform -GuestIp <vm-lan-ip>
```

`repair-appliance-online -Mode GitOpsRefresh` also reapplies the platform
manifests.

For private GitHub repos, configure Argo CD repo credentials on the VM. The
token is applied to the cluster and is not committed:

```powershell
.\scripts\project-truth.ps1 configure-argocd-repo-creds `
  -GuestIp <vm-lan-ip> `
  -GitUsername <github-user> `
  -GitToken <github-token>
```

For optional push-triggered refresh, expose Argo CD only through an approved
ingress/tunnel and set the GitHub webhook secret on the VM:

```powershell
.\scripts\project-truth.ps1 configure-argocd-webhook `
  -GuestIp <vm-lan-ip> `
  -WebhookSecret <shared-secret>
```

Then configure the GitHub webhook payload URL as:

```text
https://<argocd-public-url>/api/webhook
```

Polling remains the default for client appliances that do not expose inbound
ports.

## Image Factory

Normal Hyper-V users consume a released VHDX. VirtualBox clients consume a released VDI/OVA. Maintainers can create and publish the local Hyper-V proof artifact with:

```powershell
.\scripts\project-truth.ps1 build-image
```

That command runs the Packer Hyper-V image factory, publishes the newest produced VHDX to:

```text
C:\ProgramData\ProjectTruth\images\project-truth-node-latest.vhdx
```

It also writes a `.sha256` file, updates Project Truth config, selects the image, and writes `terraform-hyperv\terraform.tfvars`.

If a bootable Project Truth VHDX already exists, publish it without rebuilding:

```powershell
.\scripts\project-truth.ps1 build-image -TargetPlatform hyperv -SkipBuild -BuiltImagePath <path-to-bootable-project-truth.vhdx>
```

Create the VirtualBox client artifact with:

```powershell
.\scripts\project-truth.ps1 build-image -TargetPlatform virtualbox
```

If a bootable Project Truth VDI already exists, publish it without rebuilding:

```powershell
.\scripts\project-truth.ps1 build-image -TargetPlatform virtualbox -SkipBuild -BuiltImagePath <path-to-bootable-project-truth.vdi>
```

Do not use `New-VHD` or empty placeholder disks to bypass the image-factory path. The artifact must be a bootable Project Truth image.

## Watch

```powershell
.\scripts\project-truth.ps1 watch-github-run
gh run list --limit 10
gh run view <run-id> --log-failed
```

For a full ordered watch loop, use [GitOps GitHub Watch Runbook](GITOPS_GH_WATCH_RUNBOOK.md).

Latest local check on 2026-06-16:

```text
Evidence folder: .runtime\overnight\20260616-090206
GitHub auth: PROVEN for ernestdodz.
Recent validation runs: latest listed runs succeeded except the original repository creation run, which remains a historical failure.
Open PR list: logged to gh-prs-open.txt.
```

Current checkout note: this working tree is on `develop`; the older branch names in historical evidence are not the active source branch.

## Required Secrets And Variables

None are required for static validation.

Future image publishing may require:

```text
container registry credentials
image repository
trusted self-hosted runner label, if building locally
```

## Self-Hosted Runner Safety

Use the Hyper-V self-hosted runner only for trusted private repo workflows. Do not run untrusted fork PR code on the Windows Hyper-V host.
