# DEV Runtime Serving Truth - 2026-07-02

## Task Mode

Docs-only runtime truth capture after SSH/LAN serving-path check.

## Goal

Document what currently serves the DEV HRIS URL:

```text
http://10.184.38.138:3100/admin/configuration/devices/events?view=saved
```

and distinguish K3s, Docker Compose, VM source checkout, and local feature-branch
state before further sync or merge work.

## Current-State Report

### Agent Instructions

- Files applied: root `AGENTS.md`, WWG truth/governance operating rules, and the
  active `Agent-Meta-Prompt-Template.md` loop requested by the user.
- Notes: this pass did not rebuild, merge, push, or deploy. It only recorded
  observed runtime truth.

### WWG Status

- Status: available.
- Notes: this report is evidence. Canonical compact runtime summary was updated
  separately in `.wwg/wiki/project-truth-summary.md`.

### Existing State

- Windows repo branch at inspection time:
  `sync/upstream-hris-dryrun-20260702`.
- Local feature branch head:
  `0b88e12bcd53869a1f6072911c876654658c0692`.
- Local `develop` and `origin/develop`:
  `b1a8678e74229e10f5cfd2f1a1e5e658319c69af`.
- VM source checkout:
  `/var/lib/project-truth/ansible-pull`.
- VM source branch/status:
  `develop...origin/develop`.
- VM source head:
  `b1a8678e74229e10f5cfd2f1a1e5e658319c69af`.

### Task-Relevant Context

- The DEV LAN route `10.184.38.138:3100` is K3s-backed.
- The DEV LAN API route `10.184.38.138:3101` is K3s-backed.
- Docker Compose is not serving the HRIS app/API on `3100` or `3101`.
- Local feature-branch UI/API changes do not appear on `10.184.38.138:3100`
  unless the VM source/image path is updated and the K3s image is rebuilt or
  imported.

## Runtime Evidence

### K3s DEV

Observed DEV pods:

```text
hris-api-c8d85d58c-smm8d        READY 1/1  Running
hris-app-7fdc4d448f-nlzp9       READY 1/1  Running
hris-hikvision-watcher-...      READY 1/1  Running
hris-postgres-0                 READY 1/1  Running
```

Observed DEV deployments:

```text
hris-api  image hris-api-local:develop
hris-app  image hris-app-local:develop
```

Observed image IDs:

```text
hris-app-local:develop -> docker.io/library/hris-app-local@sha256:fe173af302361462277f589b110a07e19fd52b400d05e3c24a8610fa604ad3a9
hris-api-local:develop -> docker.io/library/hris-api-local@sha256:58ea075e8a30ad68309301894e4a122d82218cc8bf6fa80e3563f70bea6aab9c
```

Observed DEV services:

```text
hris-app  ClusterIP  10.43.150.6  3000/TCP
hris-api  ClusterIP  10.43.36.35   3001/TCP
```

The app and API are exposed to the LAN through host ports declared in the DEV
runtime manifest:

```text
app containerPort 3000 -> hostPort 3100
api containerPort 3001 -> hostPort 3101
```

### Docker Compose

Docker containers did not show HRIS app/API serving `3100` or `3101`.

Observed matching Docker ports were only observability-related:

```text
hris-grafana 0.0.0.0:53000->3000/tcp
hris-loki    0.0.0.0:3110->3100/tcp
```

This means the HRIS DEV app/API URL in question is not Docker Compose app/API
traffic.

### HTTP Probes From VM

```text
http://127.0.0.1:3100/admin/configuration/devices/events?view=saved
  HTTP 200, text/html

http://127.0.0.1:3100/auth/login
  HTTP 200, text/html

http://127.0.0.1:3101/health
  HTTP 200, application/json
```

API health body:

```json
{"status":"healthy","message":"SLA monitoring is active"}
```

## Source / Runtime Drift

- The VM source checkout is `develop@b1a8678`.
- The Windows local feature branch is
  `sync/upstream-hris-dryrun-20260702@0b88e12`.
- Therefore the DEV runtime URL does not automatically preview the feature sync
  branch.
- To make the DEV URL show the feature branch, Project Truth needs a deliberate
  VM sync/rebuild/import path, or the branch must be merged/promoted into the
  VM's source branch and then rebuilt into K3s images.

## Affected Areas

Observed serving path:

```text
Windows host browser
-> 10.184.38.138:3100
-> K3s dev/hris-app pod
-> hris-app-local:develop image
-> K3s dev/hris-api via service/hostPort 3101 when API is needed
```

Not the serving path:

```text
Docker Compose hris-app-dev/hris-api-dev
Local Windows npm dev server
Local feature branch without VM image rebuild/import
```

## Validation Performed

- SSH to `infra@10.184.38.138` with the repo-documented key: PASS.
- K3s DEV pod/deployment/service inspection: PASS.
- Docker container/port inspection: PASS.
- VM-local HTTP probe for saved-events route: PASS.
- VM-local HTTP probe for DEV login: PASS.
- VM-local HTTP probe for DEV API health: PASS.

## Warnings / Risks

- Public `https://dev.bnpi-hris.tech` may still need separate Cloudflare/browser
  validation. This report only proves the LAN/VM serving path for
  `10.184.38.138:3100` and `10.184.38.138:3101`.
- The runtime image tag is generic (`develop`), so image digest evidence matters
  more than the tag name when diagnosing stale UI.
- The VM has untracked source/runtime folders:
  `ansible/.kube/`, `vendor/hikvision-bio/`, and `vendor/zkteco-sdk/`.
  These were not modified.

## Truth Synchronization

- Task mode: docs-only runtime truth capture.
- New truth detected: yes.
- Wiki updated: yes, compact summary only.
- Workspace updated: no.
- Governance review completed: yes.
- Drift status: medium.
- Canonical files changed:
  - `.wwg/wiki/project-truth-summary.md`
  - `.wwg/reports/dev-runtime-serving-truth-20260702.md`
- Implementation discoveries synced:
  - DEV LAN serving path is K3s-backed.
  - Docker Compose is not serving HRIS app/API on `3100`/`3101`.
  - VM source is `develop@b1a8678`, while the local feature sync branch is
    `0b88e12`.
- Remaining stale context:
  - Full `.wwg/wiki/project-truth.md` still contains older LAN target evidence
    and should be reconciled in a larger runtime-truth maintenance pass if this
    IP remains current.

## Recommendation Capture

No new recommendations were identified. Existing recommendation
`REC-20260701-PUBLIC-RUNTIME-SERVING-GUARD` already covers adding a repeatable
guard command for active serving path, image hash, app/API origins, and browser
network proof.

