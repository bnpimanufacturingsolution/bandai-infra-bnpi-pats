# Project Truth Agent Operating Rules

This repo is Project Truth. Treat work here as owner-operator engineering, not a passive checklist.

## Session Bootstrap Rule (mandatory every session / every meaningful turn)

Grok auto-loads this `AGENTS.md` file and `.grok/rules/*.md`. It does **not** auto-load WWG wiki content.
You must **open the files with tools** before planning, coding, diagnosing, or claiming status.

### Hard ban on assumption / hallucination

- Do **not** invent product truth, device counts, filter names, runtime IPs, API shapes, or "done" status from memory.
- Do **not** answer architecture or Device Events / Sync logs questions from training data alone.
- If a fact is not in opened WWG, code, config, or `.runtime` evidence, label it `NEEDS_CONFIRMATION` or go read the file.
- Prefer: **read → quote path → act → prove**. Never: **assume → invent → declare done**.
- **Hikvision callback / socket person id:** do **not** claim panel create/enroll always delivers plain `employeeNo` on the first ACS callback or first socket. Trace `vendor/hikvision-linux/src/hikvision_bio/acs.cpp` (`alarm_callback` → `dwEmployeeNo` → `build_hikvision_callback_json` → POST) and live `.runtime` / DeviceEvent payloads. Major=3 often has **empty** person; major=5 taps often have plain; logSearch often has **opaque** tokens. Time GET/SET is `src/hikvision_bio/time.cpp`. See `.grok/rules/02-sdk-callback-wire-truth.md` and principle `evidence-over-assumption.md`.
- **Residual counts (decision / gap / ready chips):** never answer with a bare integer (`decision=16`, `unique_fp=9`, burn deltas) without: bucket table, per-row or samples (vendor id, fields, A vs B), UI/API source of the label, blocker class (`code_defect` | `export_gap` | `apply_path` | `physical_boundary` | `optional_product`), and next agent step. Prefer “planner/UI/code gate inflated residual” when true. Always-on: `.grok/rules/03-residual-count-detail.md`.

### Required open order before first substantive action

Use the Read tool (or equivalent). Do not skip because "you already know this project."

WWG operating-contract order (first occurrences must stay in this sequence):

1. `.wwg/wiki/project-truth.md` (sections relevant to the task)
2. `.wwg/wiki/terminology.md` (terms relevant to the task)
3. `.wwg/wiki/principles/README.md` and relevant principles when architecture/UX/governance reasoning is involved (especially `evidence-over-assumption.md`)
4. `.wwg/workspace/current-task.md`
5. `.wwg/governance/drift-guard.md`
6. `README.md`
7. Relevant source files, tests, and latest `.runtime/*` / `.wwg/reports/*` evidence for the task

Also open compact active surfaces when present (do not reorder the contract list above):

- `.wwg/wiki/project-truth-summary.md`
- `.wwg/wiki/terminology-summary.md` (if present)
- `.wwg/reports/wwg-agent-handoff.md`
- `Agent-Meta-Prompt-Template.md` for multi-step, drift, device, VM/GitOps, or repair work

After opening, write a short **Current-State Report** (chat or `.runtime` stamp) with:

- what the files say is true now
- what is `STALE` / `CONFLICTING` / `NEEDS_CONFIRMATION`
- the finish line for this turn
- what you will touch and what you will not

Only then plan or edit.

### Layer map (Claude / Codex style)

| Layer | Path | Who loads it | Purpose |
|---|---|---|---|
| Behavior rules | `AGENTS.md` (this file) | Auto by Grok | Autonomy, safety, bootstrap, non-stop |
| Extra Grok rules | `.grok/rules/*.md` | Auto by Grok | Short hard rules, anti-hallucination |
| Product truth | `.wwg/wiki/*` | Agent must Read | What is true |
| How to think | `.wwg/wiki/principles/*` | Agent must Read | Durable reasoning |
| What to do now | `.wwg/workspace/current-task.md` | Agent must Read | Active task |
| Governance | `.wwg/governance/*` | Agent must Read | Drift / tests / recommendations |
| Handoff | `.wwg/reports/wwg-agent-handoff.md` | Agent must Read | Latest validation / next actions |

WWG is Project Truth's governed memory pack. Opening it is not optional for meaningful work.

## Non-Stop Execution Rule (no early idle end)

For any task that includes an acceptance checklist, finish line, verification, repair, Sync logs redesign, device truth, VM/GitOps, or “keep going until done”:

1. **Do not end the turn** because a partial step worked, one file was edited, one test passed, or a minute of work elapsed.
2. Keep looping: discover → plan → implement → prove (API then browser when needed) → fix → re-prove → truth-sync → commit/push when green.
3. **Recoverable issues are agent-owned.** Examples: Docker/VM off, port down, warm-up, missing PATH tool, failed install, dirty git you can isolate, flaky test, workflow not started, need regenerate/build. Research, fix, retry. At least **3 different plausible recoveries** before labeling that sub-path blocked.
4. **Only report a real blocker** when Real Stop Conditions below apply (3 failed distinct recoveries with evidence, irreversible data risk without backup, missing irrecoverable credentials/device/network, or would require inventing secrets/evidence).
5. When blocked on one path, **immediately continue every other unblocked path**. Never sit idle waiting for the user on recoverable work.
6. Before ending, re-check the acceptance checklist. If any required box is open and not a real blocker, continue.
7. Headless/long jobs: use enough turns and auto-approve tool execution so permission prompts do not fake-stop the run.

Operator tip: early “stops in seconds” are usually permission prompts waiting for you, headless `--max-turns` too low, or a vague prompt without a checklist. Use a checklist finish line + keep-going wording + auto-approve.

Re-verify bootstrap anytime:

```powershell
powershell -File scripts/verify-grok-wwg-bootstrap.ps1
```

## Autonomy Rule

Do not ask for approval for normal development or operations progress. Recover, repair, commit, push `develop`, watch GitHub Actions, verify VM/GitOps/LAN state, and start tunnels to verified targets when those steps are part of the requested Project Truth goal.

Keep going by default.

### Agent-owned by default (no user “continue” required)

The human does **not** need to re-prompt “do it yourself” or “continue.” On every
meaningful task you already own:

- Restarting local API/app (`npm.cmd` on Windows), polling health, fixing PATH/DB ports
- Hitting real admin endpoints, starting Sync jobs, polling import progress
- Running Playwright/contract tests and writing `.runtime/` evidence
- Committing and pushing `develop` when green
- Opening marathon/nonstop job cards **internally** for multi-surface Sync logs /
  device truth work without waiting for the user to paste them

Do not end with a “What you should do next” list for recoverable work. Execute it.

## Running Cloudflare Tunnel Safety Rule

The running Project Truth server depends on the VM-managed named Cloudflare
Tunnel for public BNPI PATS and for `ssh project-truth-bnpi-pats`.

Agents are banned from disabling, stopping, masking, removing, toggling off, or
adding a default-local/cloud-mode guard around the running
`cloudflared-bnpi-pats.service` unless the user explicitly requests a
time-bounded tunnel outage and a verified recovery path is already documented.

For normal runtime, image, cleanup, pruning, VHDX, GitOps, or observability
work, keep the VM-managed `bnpi-pats` tunnel active. If tunnel behavior must be
changed, first preserve working SSH/public access, record the current connector
state, and prefer additive repair over mode toggles. Never make "cloud mode off"
the default for the already-running server.

## Host-Local VM First Rule

When the user is on the Windows host or asks about host-local VM, LAN, device,
DB, GitOps, or runtime drift, check the canonical direct LAN path before using a
public/Cloudflare SSH alias:

```powershell
ssh -i %USERPROFILE%\.ssh\node-health-appliance_ed25519 infra@10.184.37.19
```

Use `ssh project-truth-bnpi-pats` only as a fallback when direct LAN SSH is not
routable from the current workstation, or when the task specifically needs to
prove public Cloudflare SSH/browser access. Keeping the VM-managed tunnel active
is still required; local-first means direct evidence first, not disabling
Cloudflare.

## Local Windows Host + Hyper-V VM Architecture Rule

For this Windows workstation, the clean local Project Truth architecture is
host plus one Linux Hyper-V VM. The Windows host must not become the Project
Truth runtime.

```text
Windows Host
  - Hyper-V only
  - Wi-Fi / LAN access
  - SSH client
  - Browser
  - No Project Truth Docker runtime
  - No Project Truth WSL runtime

Hyper-V VM: project-truth-local-vhdx-proof
  - Owns Project Truth runtime
  - Has one stable VM IP
  - Runs Docker Engine inside Linux
  - Runs BNPI PATS app/API/Postgres/device services
  - Reaches Hikvision/ZKTeco devices from inside VM

Docker Inside VM
  - Uses Linux Docker bridge networks
  - Containers talk to each other internally
  - Publishes required ports on VM IP

Devices
  - Hikvision/ZKTeco reachable from VM
  - Device SDK/listeners run in VM or VM Docker containers

Host Access
  - Host pings VM IP
  - Host SSHs into VM
  - Host opens BNPI PATS URLs using VM IP
```

Do not run Project Truth through Windows Docker Desktop. Do not depend on WSL
for Project Truth runtime. Do not bridge Docker Desktop or WSL adapters into the
Project Truth path. Do not create multiple ProjectTruth Hyper-V switches. Do
not assign occupied gateway IPs such as `10.184.37.254` to the host or VM.

The clean host network target is:

```text
Windows Wi-Fi/LAN
        |
Hyper-V VM network
        |
Linux VM IP, for example:
  10.184.37.241 or DHCP-assigned LAN IP
        |
Docker inside VM
  bnpi-pats-app
  bnpi-pats-api
  postgres
  hikvision service
  zkteco service
```

The Windows host should only need:

```powershell
ping <VM_IP>
ssh infra@<VM_IP>
http://<VM_IP>:3000
http://<VM_IP>:3001/health
```

Everything else belongs inside the VM. If `vEthernet (WSL (Hyper-V firewall))`
appears on this workstation, treat it as WSL/Docker Desktop host drift and not
as a Project Truth network dependency. Removing it means disabling/removing the
WSL/Docker Desktop host path, while preserving Hyper-V and the VM switch needed
for `project-truth-local-vhdx-proof`.

For Windows-host localhost hot reload, the canonical DEV database is the K3s DEV
Postgres forward on `127.0.0.1:55435` (`dev/bnpi-pats-postgres`, service
`10.43.130.9:5432`). Do not silently switch localhost dev to compose DEV
`10.184.37.19:15433`: that is a duplicate drift-prone diagnostic database and
has previously shown only the stale `192.168.18.39` device while the real DEV
runtime had 7 devices including TEST A at `192.168.254.102`. If `55435` is down,
recover K3s/disk pressure/forwarding first, or require an explicit
`PROJECT_TRUTH_ALLOW_COMPOSE_DEV_DB_FALLBACK=true` diagnostic override.

## Banned Fake Blockers

Do not stop just because:

- Docker is off.
- The Hyper-V VM is off.
- A port is down.
- A service is warming up.
- A workflow has not started yet.
- A tunnel needs to be opened to a verified target.
- `agent-browser` is missing from PATH.
- Code needs to be committed or pushed to `develop`.
- Dependencies or generated files need a normal repo-documented install/build/regenerate step.
- “About 10 minutes elapsed” or any wall-clock alone — time is not a finish line.
- Wanting the human to hard-refresh, restart the API, open Sync logs, or click Sync
  when you can do those steps yourself.

Research, recover, retry, and capture evidence before calling anything blocked.

## Operator Steps Are Agent Steps

Never close a multi-step truth/repair task with homework for the operator when the
work is recoverable. You restart API/app (`npm.cmd` on Windows), poll health, login,
hit endpoints, run Playwright, write `.runtime/` evidence, and commit/push `develop`
when green. Forbidden exit pattern: “What you should do next: hard-refresh / restart
API / click Sync.” For long Sync logs jobs, use
`docs/00-product/AGENT-PROMPT-sync-logs-truth-3hr-marathon.md` (EXIT GATE, min
heartbeats, dual-source live proof, high max-turns).

## Real Endpoint Dry-Run Rule

Before diagnosing from UI screenshots or guessing from code, identify the exact
endpoint used by the page, hook, or service and run that endpoint directly with
the same role the page should use.

For local BNPI PATS admin/device/configuration checks, the default actor is
`admin@bandai.local` / `password123` with `appCode='bnpi-pats'`, unless the task
explicitly targets another role. Use a non-mutating mode first: `execute=false`,
`dryRun=true`, a preview endpoint, `?preview=true`, or the endpoint's documented
equivalent. Wrap the call in `Measure-Command`, capture full JSON
(`ConvertTo-Json -Depth 6` or deeper when needed), request URL, payload, status,
errors, and elapsed seconds into `.runtime/<task-stamp>/...json`.

Use this PowerShell shape as the canonical local pattern and adapt only the
endpoint/body to the page being investigated:

```powershell
$loginBody = @{ email='admin@bandai.local'; password='password123'; appCode='bnpi-pats' } | ConvertTo-Json
$login = Invoke-RestMethod -Method Post 'http://localhost:3001/api/auth/login' -ContentType 'application/json' -Body $loginBody
$headers = @{ Authorization = "Bearer $($login.data.token)" }
$body = @{ execute=$false; deviceId='all'; source='all'; status='all'; dateField='eventTime'; includeLinkedAttendance=$true } | ConvertTo-Json
Measure-Command {
  $result = Invoke-RestMethod -Method Post 'http://localhost:3001/api/device/events/reset' -Headers $headers -ContentType 'application/json' -Body $body
  $result | ConvertTo-Json -Depth 6
} | Select-Object TotalSeconds
```

For longer investigations, create a stamped evidence directory first:

```powershell
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$dir = Join-Path '.runtime' "endpoint-proof-$stamp"
New-Item -ItemType Directory -Force -Path $dir | Out-Null
```

If the endpoint has no safe dry-run/preview mode, do not invent safety. Inspect
the implementation and add a safe preview/dry-run path when that is in scope, or
stop before irreversible mutation unless the user explicitly approved the
destructive action and a backup/recovery path is verified. Browser proof comes
after API/network proof.

## Long-Running Job Observability Rule

Any admin/device job that can take more than a few seconds must expose an honest
watchable contract before the UI presents it as running. The API must let an
operator answer: what scope is locked, what source is being used, what target is
being attempted, what stage is active, when the backend last advanced, how many
real writes succeeded or failed, and what the latest recoverable error is.

If the backend cannot explain the job through pollable state, progress events,
or a dry-run/plan that matches execution, the implementation is wrong and should
be refactored. The UI must not guess, inflate progress, or show editable preview
controls after a job scope is frozen. Use explicit labels such as stale,
estimated, queued, applying, rereading, completed, failed, or needs attention.
Counts must distinguish selected unique IDs, source records, peer copy attempts,
successful writes, failed writes, and biometric evidence/gaps.

## Evidence Conflict and Root-Cause Closure Rule

Never collapse conflicting evidence into the most convenient status. If the
operator, physical room, device screen, quick-health endpoint, full-read
endpoint, saved database state, browser, or logs disagree, mark the claim
`CONFLICTING` and investigate the disagreement itself.

- Ping, TCP, SSH, a listening tunnel, cached success, and lightweight quick
  health are transport evidence only. They do not prove authentication, full
  inventory readability, listener arm state, or callback delivery.
- A device count must name the evidence class: physically powered/reachable,
  transport-online, authenticated, inventory-readable, listener-armed, or
  callback-proven. Never shorten one class to the ambiguous word `online`.
- Operator physical evidence is a first-class source. It does not get silently
  overwritten by a cached or weaker endpoint response.
- Every observed error must be traced to a named cause or remain an explicit
  unresolved defect. “Unknown,” “intermittent,” “fetch failed,” and “probably
  network” are symptoms, not root causes.
- Read the exact API/server/tunnel/listener/device logs for the same request and
  timestamp. If logs lack enough identifiers or stages to explain the failure,
  insufficient observability is itself a bug to repair.
- After a repair, reproduce the original conflict and prove the sources now
  agree. Do not declare green from a different, easier probe.

## Authorized Write-Job Completion Rule

When the user explicitly requests an actual sync/merge/write job, a read-only
plan is a safety gate, not the finish line.

1. Discover and freeze the exact verified device and record scope.
2. Run the non-mutating plan and validate its logic, exclusions, conflicts,
   source selections, and expected write matrix.
3. Preserve a rollback/evidence snapshot and refuse scope expansion.
4. Start the authorized write using the reviewed scope.
5. Watch pollable job state and correlated logs until terminal.
6. Repair recoverable failures and retry only the failed safe scope.
7. Reread source and targets and prove convergence; a `completed` badge alone
   is not write proof.

Do not stop at preview merely because preview passed. Do not start writes for
unreviewed identities, unresolved conflicts, unavailable devices, or invented
biometric bytes.

## Recoverable Credential Blocker Rule

Device merge labels such as `missing_raw_blob`, `source_conflict`,
`credential_only_card_not_supported`, and `target_write_unsupported` are
diagnosis categories, not automatic stop conditions.

- Recover missing custody from current physical source reads and classify the
  exact bytes/capability before replanning.
- Resolve equal raw-template sources by checksum and strict supersets by
  evidenced custody; do not leave them as ambiguous "No source" rows.
- Implement missing card/face writers when the current device exposes a safe
  SDK/ISAPI capability, then prove retention by physical reread.
- Convert only genuinely different same-slot biometrics, duplicate owners,
  absent source bytes, or unsupported firmware into explicit physical/firmware
  boundaries. Never guess or fabricate biometric truth to make a counter zero.
- A software-recoverable blocker remains agent-owned work under the Non-Stop
  Execution Rule.
- A completed writer must not remain permanently hidden behind a manual
  operator toggle. Keep it fail-closed while its build, capability probe, and
  serial physical canary are unproven; after those gates pass, make supported
  targets automatically actionable from current per-target capability
  evidence. Retain target/user-scoped canary gates, duplicate-owner refusal,
  shared device locks, reviewed-byte hashes, and physical reread proof.

## Browser Verification Tool

Temporary 2026-07-09 local rule: prefer headless Playwright for Project Truth
browser verification until the Vercel `agent-browser` path is repaired on this
Windows host. Use direct API/network probes first, then Playwright console,
network, URL/text, and screenshot evidence. Use `agent-browser` only as a
fallback or when a task explicitly targets that tool.

On this Windows host the npm global prefix is:

```text
C:\home\izu\.npm-global
```

If `agent-browser` is not found, repair it instead of stopping:

```powershell
npm install -g agent-browser@latest
$npmGlobal = (npm config get prefix).Trim()
if (($env:Path -split ';') -notcontains $npmGlobal) {
  $env:Path = "$npmGlobal;$env:Path"
  $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  if (($userPath -split ';') -notcontains $npmGlobal) {
    [Environment]::SetEnvironmentVariable('Path', "$npmGlobal;$userPath", 'User')
  }
}
agent-browser --version
```

For Project Truth browser verification, use headless browser evidence by
default. Do not require a visible browser window unless the user explicitly asks
for one.

Before using `agent-browser` on this Windows host, set stable Chrome launch
flags for the whole command chain/session:

```powershell
$env:AGENT_BROWSER_ARGS='--no-sandbox,--disable-gpu,--disable-dev-shm-usage'
$env:AGENT_BROWSER_SCREENSHOT_DIR=(Join-Path (Get-Location) '.runtime\browser-evidence\screenshots')
New-Item -ItemType Directory -Force -Path $env:AGENT_BROWSER_SCREENSHOT_DIR | Out-Null
```

If `agent-browser doctor` reports `DevToolsActivePort` or Chrome exits early,
do not treat browser verification as blocked. Prefer the current Playwright
path, and document any `agent-browser` recovery attempts separately.

For login, CORS, Cloudflare, and gateway checks, collect evidence in this order:

1. Network/API proof: health URL, auth login POST, CORS preflight, and failed
   browser requests from Playwright network capture or equivalent HTTP probes.
2. Browser proof: headless Playwright navigation, login form interaction,
   post-login URL/text extraction, console errors, and screenshots.
3. Runtime proof: VM state, LAN app/API ports, Cloudflare tunnel process/config,
   and public host checks.

Screenshots alone are not enough for CORS/proxy claims. Network evidence must
show whether the app used same-host `/api`, a paired `*-api.bnpi-pats.tech`
host, or direct LAN app-to-API port mapping.

## Real Stop Conditions

Stop only when continuing is technically impossible or risks irreversible loss without a known recovery path:

- The same failure remains after at least 3 documented recovery attempts using different plausible fixes.
- The next action could destroy, overwrite, or leak client/user data and there is no verified backup or rollback path.
- Required credentials, physical device access, or network access are absent and cannot be recovered from documented local/VM/GitOps procedures.
- A command would require guessing unknown production secrets or inventing evidence.

Everything else is agent-owned work.

## Execution Loop Template

Use `Agent-Meta-Prompt-Template.md` for substantial or drift-sensitive work. Start with discovery, read AGENTS/WWG context, produce a current-state report, plan, review the plan, execute in loops, validate, correct mismatches, and only close out with evidence.

Do not call a task done because one local command passed. Keep going until the requested finish line is met, a real stop condition above is reached, or the user explicitly changes scope.

For prompts that mention drift, device truth, VM/GitOps state, LAN state, production evidence, or multi-step repair, agents must use the template's phase loop:

- Discovery/current-state report first.
- Plan and plan review before edits.
- Execute in passes.
- Validate against the requested finish line, not just local convenience.
- Retry or recover through at least 5 documented plausible fixes before calling a recoverable issue blocked.
- Record evidence and remaining drift in the handoff.

When WWG exists, start from `.wwg/reports/wwg-agent-handoff.md`, then use `Agent-Meta-Prompt-Template.md` to structure the actual execution prompt.

## Project Truth Finish Line

Host-local Docker health is only a diagnostic. The Project Truth finish line is:

```text
Windows host repo
-> GitHub push / GitHub Actions
-> GitOps manifests
-> Argo CD inside the bridged Hyper-V VM
-> K3s/appliance runtime inside the VM
-> LAN-reachable BNPI PATS app/API
-> named Cloudflare Tunnel for verified public `bnpi-pats.tech` targets
```

Do not declare the architecture complete from host-local Docker alone unless the VM path is proven impossible with evidence.

## Canonical Role Guard

Admin device/configuration work is admin-role work. For `/admin/configuration/devices`, ZKTeco device events, runtime health, VM/GitOps drift, and repair operations, use admin / `bnpi-pats-admin` as the actor and mental model. Do not default to `bnpi-pats-hr-manager` for these surfaces unless the task explicitly targets an HR workflow or the relevant code/docs require the HR manager role.

<!-- WWG_GENERATED:EXISTING_PROJECT_ADOPTION_RULE:START -->
## Existing Project Adoption Rule

For new projects:
- Wiki leads code.

For existing projects:
- Code/docs/config reveal operational reality.
- WWG converts that reality into governed truth.
- Inferred truth must be labeled.
- Unclear or conflicting reality must be marked as `NEEDS_CONFIRMATION`, `CONFLICTING`, or `STALE`.

Do not treat adopted wiki content as fully confirmed until reviewed.

Developers may prompt naturally. Agents must execute structurally.

## Required WWG Reading Order

This is required at **session start and before every meaningful plan/edit**, not only “before merge.” See also **Session Bootstrap Rule** at the top of this file.

Before modifying code, read compact active surfaces when present, then full canonical sources in this WWG operating-contract order: `.wwg/wiki/project-truth.md`, `.wwg/wiki/terminology.md`, `.wwg/wiki/principles/README.md`, relevant `.wwg/wiki/principles/*.md` files when the task may affect durable reasoning, `.wwg/workspace/current-task.md`, `.wwg/governance/drift-guard.md`, `README.md`, and Relevant source files. Compact orientation surfaces when present: `.wwg/wiki/project-truth-summary.md`, `.wwg/wiki/terminology-summary.md`, and `.wwg/reports/wwg-agent-handoff.md`.

Grok auto-loads `AGENTS.md` and `.grok/rules/*.md`. Grok does **not** auto-load `.wwg/wiki/*`. Opening WWG with tools is mandatory so agents do not hallucinate product truth.

## Principle Management

Principles live in `.wwg/wiki/principles/`.

Principles are durable, high-friction mutable guidance documents that explain why the project is designed a certain way and how agents should reason about future work.

Project Truth tells agents what is true. Principles tell agents how to think. Governance tells agents what to check. Workspace tells agents what to do now.

Before making changes that affect product architecture, naming, positioning, agent behavior, governance, project structure, UX philosophy, or long-term design direction, review relevant principle files.

Explicit principle updates are required when the user says something like:

- "This is a principle."
- "Add this to our guiding principles."
- "Save this as design doctrine."
- "This should guide future architecture."
- "This is how agents should think about the project."
- "This should be maintained going forward."

Implicit principle review is required when a task affects durable reasoning, such as changing product architecture, naming or terminology, major system relationships, governance behavior, agent behavior, positioning, project structure, or cross-project reusable rules.

Agents must not casually rewrite active principles for one-off implementation details, bug fixes, temporary experiments, or ambiguous user comments.

If a possible principle change is uncertain, record it as a candidate principle or mention it in a handoff/report instead of modifying an active principle directly.

## Task Mode Classification

Classify each meaningful change before implementation as copy-only, docs-only, meaningful feature, bug fix, regression repair, high-risk, non-software, or mixed.

If the request contradicts Project Truth or touches payment, auth, authorization, security, persistence, database/user data, production deployment, destructive actions, or compliance-sensitive behavior, pause and plan before implementation.

## Wiki-First Flow

Use for features, architecture, product decisions, UX standards, governance, and unclear requests.

## Code-Discovery Flow

Use for bugs, regressions, incidents, performance issues, and root-cause analysis.

## Truth Synchronization Rule

Sync code, Wiki, Workspace, Governance, and reports when implementation reveals product truth. Project Truth must not be silently overwritten, terminology changes require terminology docs, and accepted behavior changes require Project Truth or requirements updates.

## Non-Negotiable Close-Out Rule

Do not close out while relevant canonical truth, terminology, mock/demo boundaries, or governance review remain stale.

## Test Enforcement

Meaningful feature behavior requires meaningful tests. Bug fixes require regression tests whenever practical. Removed or weakened tests must be flagged. If no tests are added for meaningful work, document why. Non-software work may use decision logs, manual verification, approval checklists, or Project Truth updates when software tests are not the right evidence.

## Recommendation Capture

Before closing out meaningful work, check whether the task revealed future work outside the approved scope. If yes, add or update `.wwg/governance/recommendation-registry.md`, keep the entry concise and evidence-based, leave status as `Proposed` unless explicitly instructed otherwise, and do not implement it unless it belongs to the current task. If no, state: "No new recommendations were identified." Recommendations are candidate work only; they are not accepted project truth, active Workspace tasks, or commitments until reviewed and promoted.

## Natural Prompt Preference

Users may prompt naturally, for example: "Sync Project Truth with the latest docs and reports.", "Reconcile this implementation back to Project Truth.", "Pause and create a planning review before implementation.", or "Add meaningful regression tests for the fixed bug." CLI commands are backup for technical users.
<!-- WWG_GENERATED:EXISTING_PROJECT_ADOPTION_RULE:END -->
