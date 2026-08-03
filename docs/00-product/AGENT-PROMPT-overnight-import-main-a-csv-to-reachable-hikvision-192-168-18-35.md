# Overnight Agent-Owned Job — Import Main A CSV → Hikvision `192.168.18.35`

You are the **root owner-operator agent** for Project Truth portable SDK package import.

| | |
|---|---|
| **Repo** | `C:\Users\User\Desktop\AZURO\BANDAI\bandai-infra` (also monorepo root `BANDAI`) on `develop` |
| **Runtime** | K3s **DEV only** — VM `project-truth-hris` / `10.184.37.19` |
| **Target device (LAN from Windows host)** | `192.168.18.35` — Hikvision (HTTP **80** open, SDK **8000** open; 443 closed) |
| **Source package** | Device **A** portable CSV (`main-a-device-users.csv`) with raw FP/face blobs |
| **Mode** | Multi-subagent, root-coordinated, continuous graph loop |
| **Forbidden** | Windows npm/Docker as Project Truth runtime; inventing device credentials; full-fleet write without canary; PROD/UAT mutations |

**Goal:** Create (or reuse) a **device row** for `192.168.18.35`, reverse-tunnel it so the **VM/API can reach it**, then **import Main A CSV** via the **existing Sync Center / Device Users** path (`rawPackage`) so fingerprint + face + user metadata land on that panel — proven by SDK/ISAPI reread, not UI claims alone.

There is **no** honest “human re-enroll fingerprints on the panel overnight.”  
That is **agent-owned**: reverse tunnel + device register + CSV→`project-truth.hikvision-device-users.v1` package + import preview + canary execute + full job + reread.

---

## 0. Paste-ready root kickoff

```text
Execute docs/00-product/AGENT-PROMPT-overnight-import-main-a-csv-to-reachable-hikvision-192-168-18-35.md
as ROOT agent. Spawn explore/exec subagents; root owns the loop.
K3s DEV only. Target Hikvision = 192.168.18.35 (reachable from Windows host; reverse-tunnel into VM).
Source package = main-a-device-users.csv (5-col portable: vendorUserId,displayName,userType,rawFingerprintBlob,rawFaceBlob).

Every cycle:
  A path proof (Windows→device + reverse tunnel + VM→loopback)
  → B device row exists in DEV (create if missing)
  → C package normalize + CSV→schema payload
  → D import preview (non-mutating)
  → E canary rawPackage write (1–3 users) + reread
  → F full import job (rawPackage) OR fix named blocker
  → G Sync Center UI path green (React Query mutations already preferred)
  → H evidence + WWG handoff

Loop until EXIT GATE green. Heartbeat every cycle (min 20).
No human homework. Do reverse tunnels yourself. Prefer existing SDK/API paths.
```

---

## 1. EXIT GATE

Stamp: `.runtime/overnight-import-main-a-192-168-18-35-YYYYMMDD-HHMMSS/`

| # | Required | Evidence |
|---|---|---|
| 1 | Windows host can TCP **80** and **8000** to `192.168.18.35` | `01-host-tcp.json` |
| 2 | Reverse tunnel up: VM can reach device via loopback listeners (HTTP+SDK) | `02-reverse-tunnel.json` + VM `curl`/`nc` proof |
| 3 | DEV has Device row for `192.168.18.35` (Hikvision, correct port/creds, not soft-deleted) | `03-device-row.json` |
| 4 | Package is 5-col portable CSV (or JSON v1) with **FPn("...")** FP cells when present | `04-package-audit.json` |
| 5 | Import **preview** succeeds; counts documented; conflicts classified | `05-import-preview.json` |
| 6 | **Canary** rawPackage execute (≤3 users) verified by device reread | `06-canary-*.json` |
| 7 | Full import job completes: planned/imported/failed/skipped truthful | `07-import-job-final.json` |
| 8 | Post reread: FP users / face users / user count not invented | `08-target-reread.json` |
| 9 | Sync Center path works: Device Users → Import CSV → Preview → Execute (`rawPackage`) | Playwright or API+UI contract |
| 10 | STATUS.md + WWG handoff; ≥20 heartbeats; no secrets in git | stamp + chat |

**Hard bans**

- Declaring green from host `ping` alone (ping ≠ ISAPI/SDK).
- Declaring green from reverse tunnel alone without import reread.
- Full import when canary fails.
- Using `sdkPeerCopy` when the **source is a CSV package** (use **`rawPackage`**).
- Fabricating biometric bytes or “fixing” missing_raw_blob by inventing templates.
- Committing blob CSVs (keep under gitignored `templates/`).
- PROD/UAT device writes.

---

## 2. Topology truth (do not invert)

```text
Windows workstation ──TCP 80/8000──► Hikvision 192.168.18.35   (PROVEN reachable)
Windows workstation ──SSH CF/LAN──► VM project-truth-hris (10.184.37.19)
VM ──direct──► 192.168.18.35                                 (OFTEN FAILS — reverse tunnel required)
VM loopback ◄──ssh -R── Windows ──► 192.168.18.35            (REQUIRED path)
API/SDK on VM uses device.address = 127.0.0.1:<mapped> OR host-bridge map
```

**Laws**

1. Host ping success ≠ VM can reach device.
2. Reverse tunnel only exposes chosen TCP ports on VM; it does not make the VM “on the device LAN.”
3. HCNetSDK path needs **SDK port 8000** (and usually HTTP for ISAPI UserInfo/FP).
4. Portable import path is **CSV/JSON package → `/api/device/users/import/preview|execute`** with `biometricTransferMode=rawPackage`.

---

## 3. Source package (Main A)

Prefer durable host templates (gitignored):

```text
# Local Windows
bandai-infra/templates/hikvision-five-device-sdk-packages/main-a-device-users.csv
bandai-infra/templates/hikvision-five-device-sdk-packages-standardized/main-a-device-users.csv
bandai-infra/templates/hikvision-five-device-sdk-packages-standardized/main-a-device-users.NOSTATUS.csv

# VM durable
/var/lib/project-truth/host-templates/hikvision-five-device-sdk-packages/main-a-device-users.csv
```

**Required CSV header (5 columns — no status columns):**

```text
vendorUserId,displayName,userType,rawFingerprintBlob,rawFaceBlob
```

| Blob cell | Meaning |
|---|---|
| `FP1("base64")` / `FP1(...);FP2(...)` | FP enrolled + raw present |
| face base64 (`/9j/...` etc.) | face enrolled + raw present |
| `not_enrolled` | no enrollment |
| `missing_raw_blob` | enrolled on source, no exportable bytes |

**Generator / normalize (if package drifts):**

- `hris-api/scripts/project-five-device-sdk-csv.mjs` — always emit `FPn("...")`
- `.runtime/normalize-host-template-fp.js` + `.runtime/strip-status-columns.js`

Copy package into stamp as `package/main-a-device-users.csv` (do not commit).

---

## 4. Ordered graph (do not skip)

```text
A. Bootstrap
   AGENTS.md → this prompt → hikvision-five-device-sdk-export-packages.md
   → enroll.tsx import UI + devices.service import APIs
   → reverse tunnel scripts
   →
B. Host reachability matrix (Windows)
   ping 192.168.18.35
   TCP 80, 8000 (443 expected fail)
   optional: ISAPI deviceInfo with candidate creds (never invent success)
   →
C. Reverse tunnel (Windows → VM)
   Prefer:
     scripts/start-host-hikvision-vm-ssh-bridge.ps1
       -DeviceIp 192.168.18.35
       -HttpDevicePort 80
       -SdkDevicePort 8000
   or ensure-device-live-path.ps1 / start-hikvision-remote-device-tunnel.ps1 adapted
   Prove FROM VM:
     curl ISAPI via 127.0.0.1:<httpListen>
     SDK port open on 127.0.0.1:<sdkListen>
   →
D. DEV API auth + device inventory
   POST /api/auth/login admin@bandai.local / password123 / appCode=hris
   GET  /api/device (list)
   If no row for 192.168.18.35 (or tunnel address map):
     CREATE device row (Hikvision, name e.g. "Import Target 192.168.18.35",
     address = reachable endpoint FROM API: tunnel loopback or mapped host,
     port = SDK 8000 or configured reverse map, credentials from env/secret — never hardcode new secrets into git)
   Health check device
   →
E. Package → schema payload
   Use existing UI builder path mentally:
     buildDeviceUserImportPayloadFromCsv (enroll.tsx)
   Or offline script that emits schemaVersion project-truth.hikvision-device-users.v1
   Audit: FPn wrap, sentinel consistency, user count
   →
F. Import preview (non-mutating)
   POST /api/device/users/import/preview
   body: { targetDeviceId, payload, execute:false, dryRun:true }
   Capture: newUsers, matchingUsers, conflicts, rawFingerprintBlobCount, rawFaceBlobCount,
            executeAvailable, executeBlockedReason, previewToken
   If conflicts>0: classify; fix package or target; do not execute
   →
G. Canary execute (mutating, small)
   Select ≤3 vendorUserIds that have FP1 present (and face if available)
   POST /api/device/users/import/execute
   {
     targetDeviceId, payload: canarySlice, previewToken,
     confirmation: "IMPORT DEVICE USERS",
     execute: true,
     biometricTransferMode: "rawPackage",
     runAsJob: true
   }
   Poll GET /api/device/users/import/jobs/:jobId
   Reread those users on device (ISAPI UserInfo + FP count / raw capture path)
   →
H. Full import job
   Only if canary verified
   Same execute path with full payload, runAsJob=true
   Poll to terminal status
   →
I. Post proof
   Device users summary counts
   Sample reread of N random IDs
   Sync Center UI: open Device Users for target → Import CSV still works
   →
J. Truth-sync
   STATUS.md in stamp
   .wwg/workspace/current-task.md addendum
   optional .wwg/reports/import-main-a-192-168-18-35-YYYYMMDD.md
   Commit code/docs only (never blobs)
```

---

## 5. Multi-agent ownership (spawn in parallel when independent)

| Agent | Owns | Must not |
|---|---|---|
| **A-path** (execute) | Host TCP matrix + reverse tunnel bind + VM loopback proof | Import writes |
| **B-device** (execute) | Device row create/update/health against tunnel endpoint | Full import |
| **C-package** (read-write) | CSV normalize/audit; build JSON v1 payload; canary slice | Device network |
| **D-import** (execute) | Preview → canary → full job → poll | Invent tokens |
| **E-ui** (execute) | Sync Center / enroll.tsx React Query path polish if broken; contract tests | Skip API proof |
| **F-reread** (execute) | Post-import physical counts + sample reread | Claim green without files |
| **ROOT** | Heartbeat, merge evidence, EXIT GATE, WWG, commit code | Parallel-write same device |

**Parallel OK:** A-path ∥ C-package at start.  
**Serialize:** B-device after tunnel green; D-import after B+C; F after D.

---

## 6. Engineering loop (every cycle)

```text
HEARTBEAT | cycle=N | checklist=X/10 | tunnel=<up|down> | deviceRow=<id|missing>
         | preview=<ok|fail> | canary=<ok|fail|skip> | job=<id|status>
         | next=<one action> | evidence=<stamp path>

discover → measure (API + TCP first) → classify blocker → repair → re-measure →
canary before bulk → reread → only then green
```

**Blocker classes (agent-owned)**

| Code | Symptom | Repair |
|---|---|---|
| TUN-001 | VM curl to 192.168.18.35 times out | Start/rebind reverse tunnel from Windows |
| TUN-002 | Loopback open but ISAPI 401 | Fix device credentials on Device row (secret path) |
| TUN-003 | SDK 8000 closed on host | Wrong IP / panel offline / firewall |
| DEV-001 | No device row | Create Hikvision device pointing at tunnel map |
| DEV-002 | Device points at bare 192.168.18.35 from VM | Point at tunnel loopback / bridge map used by API |
| PKG-001 | CSV still has status columns / plain FP base64 | strip-status + normalize FPn |
| PKG-002 | 0 raw blobs after parse | Wrong file / Excel corrupted quoting |
| IMP-001 | preview conflicts | Diff displayName/userType; resolve or filter |
| IMP-002 | execute without previewToken | Always fresh preview |
| IMP-003 | canary job failed_stale | Keep worker alive; re-preview; smaller slice |
| UI-001 | Import modal defaults sdkPeerCopy | Force/select **Package data (rawPackage)** for CSV blobs |

---

## 7. Existing product surfaces (reuse — do not invent a second import stack)

### API

```text
POST /api/auth/login
GET  /api/device
POST /api/device                    # create if needed
POST /api/device/users/import/preview
POST /api/device/users/import/execute
GET  /api/device/users/import/jobs/:jobId
```

### Frontend (Sync Center / Device Users journey)

```text
/admin/configuration/devices?action=device-users&syncPanel=users
  → select target device
  → "Import device users"
  → CSV upload
  → Preview import
  → biometricTransferMode = rawPackage ("Package data")
  → confirmation IMPORT DEVICE USERS
  → Execute (job)
```

**Code anchors**

| Layer | Path |
|---|---|
| UI journey | `hris-app/app/routes/admin/devices/enroll.tsx` |
| CSV builder | `buildDeviceUserImportPayloadFromCsv` in enroll.tsx |
| React Query mutations | `usePreviewDeviceUserImport`, `useExecuteDeviceUserImport` in `useDevices.ts` |
| Service | `devices.service.ts` → `/api/device/users/import/*` |
| API | `hris-api/app/device/device.controller.ts` + `device.router.ts` |
| Contract tests | `device-user-ui-contract.test.ts` |
| Package docs | `docs/00-product/hikvision-five-device-sdk-export-packages.md` |
| Tunnel | `scripts/start-host-hikvision-vm-ssh-bridge.ps1` |
| Live path helper | `scripts/ensure-device-live-path.ps1` |

### If UI gaps appear overnight (agent-owned polish)

Only if EXIT GATE blocked by UX:

1. Default import transfer mode to **`rawPackage` when CSV contains `FP1(` or face base64**.
2. Keep React Query mutations (no ad-hoc fetch soup).
3. Show preview counts: new / match / conflict / FP blobs / face blobs.
4. Poll import job with existing job query key pattern.
5. Add/extend contract tests — do **not** fork a parallel import page outside Sync Center.

**Dual-app:** this is **HR/admin-only** (Sync Center). No `hris-emp-app` mirror required.

---

## 8. Canary selection rule

From Main A CSV pick users where:

```text
rawFingerprintBlob starts with FP1(
AND vendorUserId is numeric small set (prefer 1..10 that have FP)
```

Write **1–3** only. Reread exact IDs.  
If reread FP count/templates fail → stop bulk; fix TUN/DEV/PKG.

---

## 9. Credentials & secrets

- Login: `admin@bandai.local` / repo DEV password / `appCode=hris` (never print tokens).
- Device username/password: from existing Device secrets / env / appliance seed — **do not invent** and **do not commit**.
- If unknown: probe carefully with known BNPI lab candidates **only if already used in this repo’s device seeds**; otherwise mark `NEEDS_CONFIRMATION` and keep tunnel green while waiting — do not brute-force.

---

## 10. SSH / runtime

```powershell
# Prefer Cloudflare alias when LAN blocked
ssh project-truth-hris "echo SSH_OK; hostname"

# Direct LAN when available
ssh -i "$env:USERPROFILE\.ssh\node-health-appliance_ed25519" infra@10.184.37.19

# Reverse bridge example (adjust listen ports from script output)
cd C:\Users\User\Desktop\AZURO\BANDAI\bandai-infra
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-host-hikvision-vm-ssh-bridge.ps1 `
  -DeviceIp 192.168.18.35 -HttpDevicePort 80 -SdkDevicePort 8000
```

API on VM: `http://127.0.0.1:3101` (DEV) or in-cluster service; public `https://dev-api.bnpi-hris.tech` only if tunnel/auth works.

---

## 11. Evidence layout

```text
.runtime/overnight-import-main-a-192-168-18-35-<stamp>/
  STATUS.md
  HEARTBEAT.log
  01-host-tcp.json
  02-reverse-tunnel.json
  03-device-row.json
  04-package-audit.json
  05-import-preview.json
  06-canary-preview.json
  06-canary-job.json
  06-canary-reread.json
  07-import-job-final.json
  08-target-reread.json
  09-ui-proof.md
  package/main-a-device-users.csv          # gitignored copy
  WAKEUP-REPORT.md
```

---

## 12. Acceptance checklist (operator readable)

- [ ] `192.168.18.35` TCP 80 + 8000 green from Windows
- [ ] Reverse tunnel green from VM loopback
- [ ] DEV Device row exists and health/SDK path uses tunnel map
- [ ] Main A CSV audited (5-col, FPn wrap)
- [ ] Import preview: token present; conflicts understood
- [ ] Canary rawPackage verified by reread
- [ ] Full import job terminal with truthful counts
- [ ] Sync Center Import CSV still the operator path
- [ ] No biometric blobs committed
- [ ] WWG current-task addendum written

---

## 13. Wakeup report template

```markdown
# WAKEUP — Main A CSV → 192.168.18.35

- Stamp: ...
- Tunnel: UP/DOWN (ports …)
- Device row id: …
- Preview: new=… match=… conflict=… fpBlobs=… faceBlobs=…
- Canary: PASS/FAIL (ids …)
- Full job: status=… imported=… failed=…
- Reread: users=… fp=… face=…
- Residual blockers: …
- Next human-only item (only if truly external): …
```

---

## 14. Related prompts / docs

- `docs/00-product/hikvision-five-device-sdk-export-packages.md` — package location + 5-col schema
- `docs/00-product/AGENT-PROMPT-sdk-biometric-count-custody-recovery-loop.md` — rawPackage custody
- `docs/00-product/AGENT-PROMPT-overnight-agent-owned-blocker-fix-and-gap-burn.md` — overnight ownership style
- `docs/00-product/AGENT-PROMPT-device-events-dev-all-green-graph-loop.md` — graph loop style
- `docs/HIKVISION_ENROLLMENT_IDENTITY_FLOW.md` — reverse tunnel laws
- `docs/LOCAL_WINDOWS_REMOTE_DEV_BOOTSTRAP_20260720.md` — host bridge scripts

---

## 15. Done means

**Not** “CSV uploaded.”  
**Done** = reverse path proven + device row correct + preview clean + canary reread green + full job terminal with physical reread evidence under the stamp, and Sync Center remains the supported operator journey for the next import.
