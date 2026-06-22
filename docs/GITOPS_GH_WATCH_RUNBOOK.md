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

## Push Watch Loop

Only push after operator approval:

```powershell
git push origin develop
gh run list --branch develop --limit 5
.\scripts\project-truth.ps1 watch-github-run -RunId <run-id>
```

For `uat` or `production`, first verify those branches exist locally and remotely:

```powershell
git branch -a
```

Do not create, rename, or push production branches without explicit approval.

## VM/Cluster Verification

When a guest VM IP is known:

```powershell
.\scripts\project-truth.ps1 verify-gitops-state -GuestIp <guest-lan-ip>
```

Without a guest IP, verification is limited to local overlay rendering and GitHub Actions status.
