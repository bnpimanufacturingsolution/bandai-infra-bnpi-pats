# Multi-agent job — Apply DEV < UAT < PROD resource ladder

You are **ROOT**. Goal: live K3s limits match **EXPECTED** in  
`docs/00-product/DEV-UAT-PROD-resource-policy.md`.

| | |
|---|---|
| **Repo** | `C:\Users\stari\bandai-infra` `develop` |
| **SSH** | LAN `infra@10.184.37.19` first |
| **Policy** | **DEV < UAT < PROD** CPU/RAM limits |
| **Forbidden** | Disable Cloudflare; invent live limits |

---

## 0. Paste kickoff

```text
Execute docs/00-product/AGENT-PROMPT-apply-dev-uat-prod-resource-ladder.md
as ROOT. Spawn multi-agents. Apply EXPECTED resource ladder DEV<UAT<PROD.
Document CURRENT then EXPECTED. Patch gitops/runtime-k8s/overlays/*/runtime.yaml.
Commit+push develop. Watch Argo/kubectl until live limits match EXPECTED.
Never stop Cloudflare. HEARTBEAT every cycle.
```

---

## 1. EXIT GATE

| # | Check | Evidence |
|---|---|---|
| G1 | Policy doc has CURRENT + EXPECTED tables | `DEV-UAT-PROD-resource-policy.md` |
| G2 | GitOps manifests encode EXPECTED limits | `gitops/runtime-k8s/overlays/{dev,uat,prod}/runtime.yaml` |
| G3 | Pushed to `origin/develop` | git log / gh |
| G4 | Live kubectl limits match EXPECTED (±5%) | SSH probe table |
| G5 | DEV/UAT/PROD api+app+postgres Ready | kubectl get deploy,sts |
| G6 | Cloudflare still active | systemctl |
| G7 | STATUS.md under stamp | `.runtime/resource-ladder-*/` |

---

## 2. Graph

```text
A-ROOT
  ├─ A-DOC      CURRENT + EXPECTED tables
  ├─ A-PATCH    edit runtime.yaml per env
  ├─ A-PUSH     commit + push develop
  ├─ A-SYNC     Argo refresh / ansible-pull / kubectl apply if needed
  ├─ A-WATCH    rollout status + limit re-probe loop
  └─ A-DRIFT    compare live vs EXPECTED table
```

Edges: no PUSH without PATCH; no declare done without live G4.

---

## 3. EXPECTED limit values (authoritative)

| Workload | DEV lim | UAT lim | PROD lim |
|---|---|---|---|
| API | 1250m / 1536Mi | 1500m / 2048Mi | 2000m / 3072Mi |
| App | 300m / 256Mi | 400m / 384Mi | 500m / 512Mi |
| Emp | 200m / 256Mi | 250m / 256Mi | 300m / 384Mi |
| Postgres | 800m / 1280Mi | 1000m / 1536Mi | 1500m / 2048Mi |
| Watcher | 500m / 512Mi | — | — |
| Outbox | 250m / 256Mi | — | — |

API `NODE_OPTIONS=--max-old-space-size=` ≈ 75% of mem limit Mi: DEV 1152, UAT 1536, PROD 2304.

---

## 4. HEARTBEAT

```text
HEARTBEAT | cycle=N | phase=DOC|PATCH|PUSH|WATCH | liveMatch=Y/N | next=
```
