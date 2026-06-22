# DevOps Runbook

## Workflow Roles

| Workflow | Purpose | Runner |
|---|---|---|
| `validate.yml` | Static validation for Node, PowerShell, Terraform, and GitOps overlays. | GitHub-hosted Windows runner |
| `promote-gitops.yml` | Manual GitOps release tag promotion for DEV/UAT/PROD environment ConfigMaps. | GitHub-hosted Ubuntu runner |

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

## Promotion

Use manual dispatch for `promote-gitops.yml`.

Inputs:

```text
environment: dev | uat | prod
image_tag: safe container tag
```

The workflow updates `release_tag` in `gitops/overlays/<env>/environment-patch.yaml`. Argo CD is expected to detect the Git change and sync the selected environment contract ConfigMap into the cluster.

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
