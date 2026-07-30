# Multi-agent job — Merge device users → DECISION 0 + FP gap 0 + FACE gap 0

You are **ROOT** for Project Truth **Merge users** zero-gap loop.

| | |
|---|---|
| **Repo** | `C:\Users\stari\bandai-infra` |
| **Runtime** | K3s **DEV** `http://10.184.37.19:3101` (LAN first) |
| **Mode** | Multi-subagent graph + continuous loop |
| **Goal** | Exact unique IDs + burn until **decision people = 0**, **unique FP residual = 0**, **unique face residual = 0** (or only proven physical_boundary rows remain with table) |

---

## 0. Paste kickoff

```text
Execute docs/00-product/AGENT-PROMPT-merge-users-zero-decision-fp-face-gap-multiagent.md
as ROOT. Spawn multi-agents every cycle. Never invent residual counts.

Scope from LIVE sync-preview only (re-probe; do not use stale IDs from memory):
  Include Main A/B/C/D/E/F when inventory-readable.
  Exclude TEST A/B and unreachable Main Entrance Device 192.168.110.24 unless live proves otherwise.

Loop:
  plan(deviceIds) → residual matrix (decision/FP/face) with per-row IDs
  → recovery review(executionPreview face|fingerprint)
  → dryRun → if wouldWriteCount>0 execute max 50 unique-person wave
  → poll job → replan → burn until KPI zero or only physical_boundary

Card residual is optional_product unless site requires badges.
Owner-scan incomplete = agent-owned export/code, not human enroll.
HEARTBEAT every cycle (min 15). Evidence under .runtime/merge-users-zero-gap-*/.
```

---

## 1. EXIT GATE

Stamp: `.runtime/merge-users-zero-gap-YYYYMMDD-HHMMSS/`

| # | KPI | Pass |
|---|---|---|
| G1 | Live plan with **exact unique ID count** | planId + `unionUsers` / users[] length |
| G2 | **decision_people = 0** | plan users with conflicts length>0 = 0 (or bucket table if UI chip differs) |
| G3 | **unique_face residual = 0** | unique vendorIds with face gap = 0 **or** faceReady burned + residual only physical_boundary table |
| G4 | **unique_fp residual = 0** | same for fingerprint |
| G5 | Every write: preview + dryRun first; verified ≤ wouldWrite | job JSON |
| G6 | Non-assuming residual tables | bucket + sample rows + blocker class |
| G7 | HEARTBEATS ≥ 15 + STATUS.md | stamp |

**Hard bans:** bare residual integers; invent device online; write without dryRun; include TEST while unavailable; claim zero while plan still has unique residual without physical_boundary proof.

---

## 2. Frozen scope (must re-verify live)

From operator UI + sync-preview (2026-07-29 session seed — **re-probe**):

| Device | ID | LAN | Include if |
|---|---|---|---|
| A | `cmrht5s2w00ei7zgsre8y3o5n` | 10.184.37.21 | readable |
| B | `cmpxw13hx002h7zwso7dyedrn` | 10.184.37.20 | readable |
| C | `cmripjwbx00ewl001ihcke210` | 10.184.37.22 | readable (gap burn target) |
| D | `cmripjwkw00ffl0013lfxcbxw` | 10.184.37.23 | readable |
| E | `cmriu5ab102goi001x9o7nfct` | 10.184.37.24 | readable |
| F | `cmrim1zop05ik7zp4zgm2sm4k` | 10.184.37.25 | readable |
| TEST A/B | … | 192.168.254.x | **exclude** while Unavailable |
| Main 192.168.110.24 | `cms5fy4mv000alg3pmu6pzmhc` | | **exclude** while Unavailable |

---

## 3. Graph

```text
A-ROOT (watch + gates)
  ├─ A-SCOPE   freeze deviceIds from live preview
  ├─ A-PLAN    POST /api/device/hikvision/sdk-users/merge/plan
  ├─ A-MATRIX  decision / unique_fp / unique_face + per-row vendorIds
  ├─ A-PREVUE  recovery/review executionPreview face + fingerprint
  ├─ A-DRY     recovery/jobs dryRun=true canaryModality=
  ├─ A-WRITE   recovery/jobs dryRun=false (only wouldWrite>0)
  ├─ A-POLL    job terminal + verified match
  ├─ A-FIX     code/export blockers when wouldWrite=0 but residual>0
  ├─ A-MON     health + job progress heartbeats
  └─ A-DRIFT   protocol / residual honesty
```

Edge: never WRITE before PREVIEW+DRY. Never claim G2–G4 without fresh PLAN.

---

## 4. API contract (DEV)

```text
POST /api/auth/login  {email,password,appCode:hris}
POST /api/device/hikvision/sdk-users/merge/plan  {deviceIds:[...]}
POST /api/device/hikvision/sdk-users/merge/recovery/review  {planId, canaryModality?}
POST /api/device/hikvision/sdk-users/merge/recovery/jobs
  {planId, dryRun:true|false, canaryModality:'face'|'fingerprint', maxVerifiedWrites?:50}
GET  /api/device/hikvision/sdk-users/merge/recovery/jobs/:jobId
POST /api/device/hikvision/sdk-users/merge/jobs  (profile merge apply — only after residual plan validated)
```

Admin: `admin@bandai.local` / `password123` / `appCode=hris`. Never print tokens.

---

## 5. Residual honesty (always)

```text
### Residual: <label> = <N>
| Bucket | Count | What | Blocker class | Next |
### Per-row (≤30 all; else samples)
| vendorId | fields | A vs B… | Why | Next |
### UI/API source
```

Blocker classes: `code_defect` | `export_gap` | `apply_path` | `physical_boundary` | `optional_product`

---

## 6. HEARTBEAT

```text
HEARTBEAT | cycle=N | planId= | uniqueIds= | decision= | uFace= | uFp= | faceReady= | fpReady= | lastJob= | next=
```
