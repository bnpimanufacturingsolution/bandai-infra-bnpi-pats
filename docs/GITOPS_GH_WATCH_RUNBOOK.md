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

The base environment contract also records the temporary public-demo tunnel
policy:

```text
experimental_trycloudflare_supported=true
experimental_trycloudflare_default=false
experimental_trycloudflare_flag=EXPERIMENTAL_TRY_CLOUDFLARE
```

This is documentation and drift visibility only. Quick-tunnel URLs are generated
runtime evidence, not GitOps desired state.

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
