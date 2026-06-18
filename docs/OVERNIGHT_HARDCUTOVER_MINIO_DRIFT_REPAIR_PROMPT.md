# CODEX OVERNIGHT GOAL: Project Truth HRIS Docker Bridge + MinIO Drift Cutover

Date: 2026-06-18

## Codex Autopilot Mode

This is a Codex proof/self-repair run, not a PowerShell-script-driven run.

Use Codex directly as the repair agent. The PowerShell files in `scripts/` are optional helpers for gathering evidence only; they are not the source of truth, and they must not replace live inspection, logs, code reading, rebuilds, browser proof, and API proof.

Primary execution command:

```powershell
Get-Content -Raw .\docs\OVERNIGHT_HARDCUTOVER_MINIO_DRIFT_REPAIR_PROMPT.md | codex exec --cd "C:\Users\anoni\OneDrive\Desktop\PROJECT_TRUTH_HYPERV_FRESH" --dangerously-bypass-approvals-and-sandbox
```

If the run needs a transcript/final-message file:

```powershell
$runRoot = ".runtime\overnight-docker-bridge-minio-truth\$(Get-Date -Format yyyyMMdd-HHmmss)"
New-Item -ItemType Directory -Force $runRoot | Out-Null
Get-Content -Raw .\docs\OVERNIGHT_HARDCUTOVER_MINIO_DRIFT_REPAIR_PROMPT.md |
  codex exec --cd "C:\Users\anoni\OneDrive\Desktop\PROJECT_TRUTH_HYPERV_FRESH" --dangerously-bypass-approvals-and-sandbox --output-last-message "$runRoot\codex-final-message.md" *> "$runRoot\codex-exec.log"
```

Codex must actively inspect the real system. Do not stop at static docs or launcher output. Watch logs, inspect running processes/containers/VM state, test live LAN URLs, repair the code/config/runtime, rebuild, restart, and verify again.

If blocked by a real technical unknown, search the web for current best practices and official/primary documentation relevant to the exact blocker, then continue with the safest applicable fix. Record what was researched and why.

Workspace:

```text
C:\Users\anoni\OneDrive\Desktop\PROJECT_TRUTH_HYPERV_FRESH
```

Original HRIS source/reference:

```text
C:\Users\anoni\OneDrive\Desktop\HRIS-PROJECT
```

Current bridged LAN target:

| Environment | App | API |
| --- | --- | --- |
| PROD | http://192.168.1.54:3000 | http://192.168.1.54:3001 |
| DEV | http://192.168.1.54:3100 | http://192.168.1.54:3101 |
| UAT | http://192.168.1.54:3200 | http://192.168.1.54:3201 |

Known working user/org truth:

```text
Organization: Bandai Namco
Organization code: bnei
Logo path expected by profile API: /app/assets/bandai_logo.png
Known local source logo:
C:\Users\anoni\OneDrive\Desktop\HRIS-PROJECT\hris-app\app\assets\bandai_logo.png
```

## Main Goal

Make the HRIS project truthfully run inside the VM/Docker bridged LAN environment with no cloud dependency drift.

The final system must use local/LAN services only:

- Frontend served on bridged LAN.
- Backend served on bridged LAN.
- Docker bridge networking working correctly inside the VM.
- MinIO used for avatars, logos, employee files, contracts, uploads, and object reads.
- No Cloudinary dependency required for normal HRIS operation.
- Bandai logo renders correctly.
- Avatar upload/read contract works from browser and API.
- FE and BE contracts match the live runtime, not just source files.

Do not call the work done unless the live browser/API on `192.168.1.54` proves it.

## Current Failure

The live bridged browser shows avatar upload/read failure:

```json
{
  "status": "error",
  "message": "Cloudinary is not configured",
  "code": 500
}
```

Failing contract:

```text
PATCH http://192.168.1.54:3101/api/auth/me/avatar
Content-Type: multipart/form-data
field name: avatar
```

The backend must not route this through Cloudinary. It must store/read through MinIO or a documented local fallback.

## Ordered Execution Plan

### 1. Create Evidence Folder

Create:

```text
.runtime/overnight-docker-bridge-minio-truth/<timestamp>/
```

Save every command output, screenshot, browser proof, API proof, Docker state, and final report there.

### 2. Snapshot Repo And Runtime Truth

Capture:

```powershell
git status --short
git diff --stat
docker ps
docker compose ls
netstat -ano | Select-String ':3000|:3001|:3100|:3101|:3200|:3201|:9000|:9001'
Get-VM
```

Do not reset or discard user changes.

### 3. Build The Truth Map Before Fixing

For the live service at `192.168.1.54`, identify:

- What VM owns the IP.
- What Docker containers serve app/API/MinIO/Postgres.
- Which compose file is actually running.
- Which image/container is serving `3100`.
- Which image/container is serving `3101`.
- Which env vars are loaded inside the live API container.
- Whether `STORAGE_PROVIDER=minio`.
- Whether any `CLOUDINARY_*` variables or Cloudinary code paths are still active.
- Whether MinIO is reachable from inside the API container.
- Whether MinIO is reachable from the LAN if needed.

Record source truth vs built image truth vs running container truth.

The live bridged runtime is the acceptance target. A repo edit, local build, localhost test, or Docker Compose file edit does not count unless the change is synced into the process/image/VM/container/pod that is actually serving `http://192.168.1.54:*`.

### 3A. Watch Real Logs And Runtime Behavior

Codex must watch the live failure while repairing it.

Collect and keep updating evidence from the actual runtime owner:

```text
docker logs / docker compose logs when Docker is available
journalctl when systemd owns a service
pm2 logs when PM2 owns a process
container inspect/env output when containers own the runtime
VM console/SSH logs when the service is inside the bridged VM
browser Network/Console logs for the live LAN page
API request/response logs around avatar upload/read
```

Do not infer storage behavior from source alone. Prove the running API process either calls Cloudinary, calls MinIO, or fails before storage selection. Then repair the exact failing layer.

If host Docker is unavailable because Docker Desktop is stopped or the runtime is inside the VM, do not mark the run done. Discover the VM path, SSH/console path, or documented appliance commands and inspect from there. If access is impossible, final status must be `BLOCKED` with the missing access named exactly.

### 3B. Blocker Research Rule

When stuck on a concrete blocker for more than one repair loop, Codex must research current best practice before continuing. Use web research only for the blocker being handled, and prefer official/primary sources.

Examples:

```text
MinIO S3-compatible upload/read configuration
Express/Nest multipart upload handling to S3-compatible storage
Docker Compose networking between API and MinIO
LAN-safe object URL design behind a private VM
React/browser image handling for relative API-proxied avatar URLs
```

After research, record:

```text
blocker
sources checked
decision taken
why it applies to this runtime
files/config changed
proof after change
```

### 4. Copy/Sync Bandai Logo If Missing

Verify this source file exists:

```text
C:\Users\anoni\OneDrive\Desktop\HRIS-PROJECT\hris-app\app\assets\bandai_logo.png
```

Ensure the running app/API image or mounted volume contains:

```text
/app/assets/bandai_logo.png
```

The admin profile response already expects:

```json
"logo": "/app/assets/bandai_logo.png"
```

If the app serves static assets differently, fix the FE/BE contract so the browser can actually render the logo over LAN.

### 5. Locate All Storage Paths

Search both repos for:

```text
Cloudinary
cloudinary
STORAGE_PROVIDER
MINIO
S3
avatar
upload
logo
contract
attachment
```

Fix the actual backend path used by:

```text
PATCH /api/auth/me/avatar
GET /api/auth/me/avatar
```

Expected behavior:

- Accept multipart field `avatar`.
- Store object in MinIO.
- Save stable reference in DB.
- Return usable browser URL or API-proxied URL.
- Read avatar without Cloudinary.
- Never return `Cloudinary is not configured` when MinIO is configured.

### 6. Verify MinIO Runtime

Inside Docker/VM prove:

```text
MinIO container is running
Bucket exists
API container can reach MinIO endpoint
API has correct access key/secret/bucket/endpoint
Uploaded object exists after avatar PATCH
Browser can read the object through approved URL/path
```

If MinIO console/API is exposed:

```text
http://192.168.1.54:9000
http://192.168.1.54:9001
```

Verify it, but do not require public internet.

### 7. Rebuild And Restart The Real Runtime

After source/config fixes, rebuild the actual images used by the bridged VM.

Do not stop after editing source.

Prove rebuild/restart with:

- Container IDs before/after.
- Image IDs/digests before/after.
- Restart timestamps.
- Docker Compose command used.
- Env vars inside the restarted API container.

### 8. Browser And API Acceptance Tests

From host/LAN, verify:

```powershell
curl.exe -i http://192.168.1.54:3100/auth/login
curl.exe -i http://192.168.1.54:3101/health
curl.exe -i http://192.168.1.54:3101/api/auth/me
```

With a fresh valid token, verify:

```powershell
curl.exe -i `
  -X PATCH "http://192.168.1.54:3101/api/auth/me/avatar" `
  -H "Authorization: Bearer <fresh-token>" `
  -F "avatar=@C:\path\to\test-avatar.jpg"

curl.exe -i `
  "http://192.168.1.54:3101/api/auth/me/avatar" `
  -H "Authorization: Bearer <fresh-token>"
```

Browser proof required:

- Open `http://192.168.1.54:3100/settings`.
- Upload avatar.
- Save.
- Refresh page.
- Confirm avatar remains visible.
- Confirm Network tab has no `Cloudinary is not configured`.
- Confirm Bandai logo renders without broken image UI.

### 9. FE/BE Contract Drift Check

Confirm frontend uses the correct API base URL:

```text
http://192.168.1.54:3101
```

Confirm no frontend path assumes Cloudinary.

Confirm avatar upload request uses:

```text
PATCH /api/auth/me/avatar
multipart field: avatar
```

Confirm backend response shape is what frontend expects.

If the backend returns a relative path, frontend must resolve it correctly over LAN.

### 10. Final Report

Write:

```text
.runtime/overnight-docker-bridge-minio-truth/<timestamp>/FINAL_REPORT.md
```

Final status must be one of:

```text
PASS
PARTIAL
BLOCKED
FAIL
```

Only use `PASS` if all are true:

- Docker/VM bridge runtime identified.
- App loads on `192.168.1.54:3100`.
- API health passes on `192.168.1.54:3101`.
- Bandai logo renders.
- Avatar upload works.
- Avatar read works after refresh.
- MinIO stores the object.
- No Cloudinary runtime error remains.
- Source, built image, running container, and browser behavior are synced.

If the browser still shows `Cloudinary is not configured`, final status must not be PASS.
