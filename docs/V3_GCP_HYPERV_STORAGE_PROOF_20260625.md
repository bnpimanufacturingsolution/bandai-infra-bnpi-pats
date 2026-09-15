# V3 GCP Hyper-V Storage Proof - 2026-06-25

## Result

```text
PROVEN
```

Project Truth was rebuilt on Google Compute from `develop`, visually verified in
GCompute with the fixed clean console login screen, boot-verified as a fresh VM,
exposed through temporary TryCloudflare URLs, and exported to public Cloud
Storage as a Hyper-V VHDX under the v3 prefix.

## Repo State

```text
Branch: develop
Pushed commit: af106c0
```

Supporting commits:

```text
62157b9 Expose GCP image build helpers
af106c0 Harden GCP boot proof SSH script execution
```

## Build Artifact

```text
GCP image:
  project-truth-node-gcp-1782354447

Build proof root:
  .runtime\gcp-image-build-v3\20260625-085534

Packer result:
  Build finished after 12 minutes 8 seconds.
```

## GCompute Visual Proof

```text
Proof instance:
  project-truth-gcp-boot-proof-1782384007

Internal IP:
  10.148.0.57

External IP:
  35.187.238.80

Screenshot:
  .runtime\gcp-image-build-v3\20260625-085534\boot-proof-rerun\display-screenshot-final.jpg
```

The screenshot shows a clean Project Truth BNPI PATS appliance console, the detected
LAN/IP address, and explicit guidance to type `infra` only when the prompt ends
with `login:`. This verifies the console login-loop fix in GCompute.

## Runtime Proof

```text
Proof log:
  .runtime\gcp-image-build-v3\20260625-085534\boot-proof-rerun\ssh-proof-01.log
```

Verified in the fresh GCompute VM:

```text
K3s node:
  Ready

Argo CD pods:
  argocd-application-controller, applicationset-controller, dex, notifications,
  redis, repo-server, and server all Running

Project Truth services:
  project-truth-firstboot-identity.service SUCCESS
  project-truth-lan-summary.service SUCCESS
  project-truth-clean-console.service SUCCESS
  project-truth-bnpi-pats.service SUCCESS

Endpoint probes:
  PROD API  http://127.0.0.1:3001/health      healthy
  PROD app  http://127.0.0.1:3000/auth/login  200
  DEV API   http://127.0.0.1:3101/health      healthy
  DEV app   http://127.0.0.1:3100/auth/login  200
  UAT API   http://127.0.0.1:3201/health      healthy
  UAT app   http://127.0.0.1:3200/auth/login  200
  Grafana   http://127.0.0.1:53000/api/health 200

ZKTeco target:
  ZKTECO_WEBHOOK_URL=http://10.148.0.57:3001/api/zkteco/events
```

## Temporary Public Cloud URLs

The running GCompute VM generated temporary TryCloudflare URLs. These rotate
when tunnels restart.

```text
PROD app:
  https://contribute-bench-nation-kit.trycloudflare.com/auth/login

PROD API:
  https://refused-answering-scripting-programming.trycloudflare.com/health

DEV app:
  https://endif-recipient-nova-location.trycloudflare.com/auth/login

DEV API:
  https://reasoning-collected-qualification-soup.trycloudflare.com/health

UAT app:
  https://punch-monitors-gamecube-fur.trycloudflare.com/auth/login

UAT API:
  https://investigators-fog-rob-cups.trycloudflare.com/health

Grafana:
  https://truck-nokia-politics-presentations.trycloudflare.com/api/health

Prometheus:
  https://citations-initiative-computer-chapter.trycloudflare.com/-/ready

Loki:
  https://players-aviation-take-moses.trycloudflare.com/ready
```

Public check evidence:

```text
.runtime\gcp-image-build-v3\20260625-085534\trycloudflare-public-checks.txt
```

## V3 Hyper-V VHDX Export

```text
Cloud Build ID:
  2673afcb-e2c9-4b6f-b719-2293d606d3a2

GCS:
  gs://project-truth-image-export-bnpi-pats-492904-161377059311/public/project-truth/hyperv/v3/latest/project-truth-node-gcp-1782354447.vhdx

Public URL:
  https://storage.googleapis.com/project-truth-image-export-bnpi-pats-492904-161377059311/public/project-truth/hyperv/v3/latest/project-truth-node-gcp-1782354447.vhdx

Size:
  14,168,358,912 bytes
  about 13.2 GiB
```

Public HTTP verification returned:

```text
HTTP/1.1 200 OK
Content-Length: 14168358912
```

Export evidence:

```text
.runtime\gcp-image-build-v3\20260625-085534\v3-vhdx-export
```
