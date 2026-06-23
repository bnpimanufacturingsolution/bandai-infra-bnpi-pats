# GitOps Client And Environment Scaling

Project Truth currently ships explicit Argo CD Applications for:

```text
project-truth-dev
project-truth-uat
project-truth-prod
project-truth-runtime-dev
project-truth-runtime-uat
project-truth-runtime-prod
```

That is the safest small-system shape: one Application per environment path,
one namespace per environment, and one runtime overlay per environment.

For many clients, keep the same rule and add a client segment:

```text
gitops/clients/<client>/overlays/dev
gitops/clients/<client>/overlays/uat
gitops/clients/<client>/overlays/prod
gitops/clients/<client>/runtime-k8s/dev
gitops/clients/<client>/runtime-k8s/uat
gitops/clients/<client>/runtime-k8s/prod
```

Each client/environment should have:

- an Argo Application or generated ApplicationSet item
- a unique namespace, for example `<client>-dev`
- unique LAN host ports when several instances share one VM
- a selected runtime image tag
- a matching image delivery path: local K3s import or registry pull

The starter ApplicationSet template lives at:

```text
gitops/argocd/applicationsets/project-truth-envs.example.yaml
```

It contains separate generated ApplicationSets for environment contracts and
runtime overlays. Do not apply it while the explicit Applications with the same
names are active. Use it as the migration template once the repo has enough
client/environment entries that hand-maintaining Applications becomes noisy.

## Registry-Backed Promotion

The default appliance path uses local images and `imagePullPolicy: Never`.
For registry-backed clients, publish the selected image tag first, then promote
with a registry prefix:

```powershell
gh workflow run promote-gitops.yml `
  -f environment=dev `
  -f image_tag=<tag> `
  -f image_registry=ghcr.io/<org>/<project>
```

That updates the runtime kustomization so Argo selects:

```text
ghcr.io/<org>/<project>/hris-api-local:<tag>
ghcr.io/<org>/<project>/hris-api-db-init:<tag>
ghcr.io/<org>/<project>/hris-app-local:<tag>
```

If the registry is private, create Kubernetes `imagePullSecrets` for the target
namespace and add them to the runtime manifests before promotion.
