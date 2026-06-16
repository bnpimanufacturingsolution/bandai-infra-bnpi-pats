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

## Image Factory

Normal users consume a released VHDX. Maintainers can create and publish the local proof artifact with:

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
.\scripts\project-truth.ps1 build-image -SkipBuild -BuiltImagePath <path-to-bootable-project-truth.vhdx>
```

Do not use `New-VHD` to bypass the image-factory path. An empty VHDX is not a bootable Project Truth image.

## Watch

```powershell
.\scripts\project-truth.ps1 watch-github-run
gh run list --limit 10
gh run view <run-id> --log-failed
```

Latest local check on 2026-06-16:

```text
Evidence folder: .runtime\overnight\20260616-090206
GitHub auth: PROVEN for ernestdodz.
Recent validation runs: latest listed runs succeeded except the original repository creation run, which remains a historical failure.
Open PR list: logged to gh-prs-open.txt.
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
