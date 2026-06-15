# DevOps Runbook

## Workflow Roles

| Workflow | Purpose | Runner |
|---|---|---|
| `validate.yml` | Static validation for Node, PowerShell, Terraform, and GitOps overlays. | GitHub-hosted Windows runner |
| `promote-gitops.yml` | Manual GitOps image tag promotion for DEV/UAT/PROD. | GitHub-hosted Ubuntu runner |

## Validate

Runs on push, pull request, and manual dispatch.

Checks:

```text
node -c app/server.js
PowerShell parser for scripts and installer
terraform fmt/init/validate
kubectl kustomize for dev/uat/prod
packer validate image-factory/packer/ubuntu-hyperv.pkr.hcl
PowerShell fallback installer build
temp-path installer install and shortcut contract verification
```

## Promotion

Use manual dispatch for `promote-gitops.yml`.

Inputs:

```text
environment: dev | uat | prod
image_tag: safe container tag
```

The workflow updates only the selected overlay. Argo CD is expected to detect the Git change and sync it into the cluster.

## Watch

```powershell
.\scripts\project-truth.ps1 watch-github-run
gh run list --limit 10
gh run view <run-id> --log-failed
```

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
