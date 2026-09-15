# Drift Guard

This file protects the project from context drift.

## Existing Project Adoption Rule

For existing projects, code/docs/config are evidence of current reality, not automatically final truth.

Adoption should:
- capture observed reality
- infer initial truth
- mark uncertainty
- identify conflicts
- create open questions
- avoid changing source code unless requested

Drift is not always bad. Healthy requirement evolution is accepted when documented; documentation lag should usually warn; implementation drift, terminology drift, regression/quality drift, high-risk contradictions, unsafe overwrites, and weakened tests require stronger action.

## Required Reading

Before modifying code, read:

1. `.wwg/wiki/project-truth-summary.md` when present
2. `.wwg/wiki/terminology-summary.md` when present
3. `.wwg/wiki/project-truth.md`
4. `.wwg/wiki/terminology.md`
5. `.wwg/wiki/principles/README.md`
6. Relevant `.wwg/wiki/principles/*.md` files when the task may affect durable reasoning
7. `.wwg/workspace/current-task.md`
8. `.wwg/governance/drift-guard.md`
9. `README.md`
10. Relevant source files

## Principle Drift Guard

When a change affects product architecture, naming, positioning, agent behavior, governance behavior, project structure, UX philosophy, or long-term design direction, agents must check whether relevant principle files in `.wwg/wiki/principles/` need to be updated.

Principles are high-friction mutable. Do not rewrite active principles casually.

A principle update is appropriate when:

- the user explicitly identifies a new or changed principle
- an accepted architecture or product decision changes durable reasoning
- terminology or positioning changes the way future agents should understand the project
- governance rules change how agents should behave
- repeated task behavior becomes a durable standard

A principle update is not appropriate for:

- one-off implementation details
- temporary experiments
- small bug fixes
- ambiguous user statements
- assistant speculation
- task-local preferences

If uncertain, add a candidate principle or record the issue in the handoff/report.

## Role Drift Guard

- Admin configuration surfaces, runtime health checks, VM/GitOps runtime drift, and repair operations are admin / `bnpi-pats-admin` work. (The old `/admin/configuration/devices` + ZKTeco device-event surfaces were retired 2026-09-15.)
- Do not infer `bnpi-pats-hr-manager` for admin configuration tasks just because BNPI PATS contains HR manager routes, tests, or seed credentials.
- `bnpi-pats-hr-manager` remains valid only where the task explicitly targets HR workflows or existing code/docs require that role.
- If a role is unclear, prefer the route/workflow owner in Project Truth and mark the uncertainty instead of substituting a convenient seeded login.

## Host-Local VM First Guard

- For host-local VM, LAN, DB, GitOps, and runtime drift work from the
  Windows host, collect direct LAN evidence first through
  `ssh -i %USERPROFILE%\.ssh\node-health-appliance_ed25519 infra@10.184.37.19`.
- Use `ssh project-truth-bnpi-pats` as fallback evidence when the direct LAN path is
  not routable from the current workstation, or as explicit public Cloudflare
  SSH proof when the task asks for public/remote access.
- Do not confuse local-first evidence with disabling Cloudflare. The
  VM-managed tunnel must remain active while agents prefer direct LAN proof for
  host-local drift.

## Cloudflare Tunnel Safety Guard

- Treat the running VM-managed `bnpi-pats` Cloudflare Tunnel as a protected
  runtime dependency for public BNPI PATS, Grafana, DB Access TCP helpers, and
  `ssh project-truth-bnpi-pats`.
- Agents must not disable, stop, mask, remove, or toggle off
  `cloudflared-bnpi-pats.service` on the running server during normal repair,
  pruning, VHDX, GitOps, observability, image, or documentation work.
- Agents must not add default-local/cloud-mode guards that prevent the live
  server from starting the named Cloudflare Tunnel on boot.
- Any requested tunnel outage must be explicit, time-bounded, and paired with a
  verified recovery path before execution.
- If Cloudflare behavior drifts, prefer additive repair that preserves current
  SSH/public access and record connector state before changing tunnel config.

## Test Enforcement

- Meaningful feature behavior requires meaningful tests.
- Bug fixes require regression tests whenever practical.
- Tests should verify behavior, not only file existence, static structure, or build smoke.
- Non-software work may use decision logs, manual verification, approval checklists, or Project Truth updates when software tests are not the right evidence.

## Real Endpoint Dry-Run Guard

Before UI/browser diagnosis or code guessing, agents must find the exact
endpoint used by the page, hook, or service and run that endpoint directly with
the same expected actor.

- For local BNPI PATS admin/configuration checks, default to admin /
  `bnpi-pats-admin`: `admin@bandai.local`, `password123`, `appCode='bnpi-pats'`.
- Prefer non-mutating endpoint modes first: `execute=false`, `dryRun=true`,
  preview endpoints, `?preview=true`, or the documented equivalent.
- Time the call with `Measure-Command` and capture full JSON response,
  request URL, payload, status, errors, and elapsed seconds into
  `.runtime/<task-stamp>/...json`.
- Use the API/network result to choose the patch order. Browser screenshots are
  supporting evidence, not the first source of truth.
- If a mutating endpoint has no safe preview/dry-run mode, inspect and patch a
  safe path when in scope, or stop before irreversible mutation unless the user
  explicitly approved it and a recovery path is verified.

Canonical local PowerShell pattern:

```powershell
$loginBody = @{ email='admin@bandai.local'; password='password123'; appCode='bnpi-pats' } | ConvertTo-Json
$login = Invoke-RestMethod -Method Post 'http://localhost:3001/api/auth/login' -ContentType 'application/json' -Body $loginBody
$headers = @{ Authorization = "Bearer $($login.data.token)" }
$body = @{ execute=$false } | ConvertTo-Json
Measure-Command {
  # Replace with the exact preview/dry-run endpoint the page uses (verify it exists in bnpi-pats-api first)
  $result = Invoke-RestMethod -Method Post 'http://localhost:3001/api/<admin-preview-endpoint>' -Headers $headers -ContentType 'application/json' -Body $body
  $result | ConvertTo-Json -Depth 6
} | Select-Object TotalSeconds
```

## Evidence Conflict Guard

- Record status counts by evidence class: reachable, transport-online,
  authenticated, data-readable.
- If any two classes disagree, status is `CONFLICTING`; do not publish one
  ambiguous “online” total.
- Correlate browser, API, tunnel, and service logs by request and time.
- A symptom without a named root cause remains an open defect.
- If logs are insufficient to determine cause, add request/stage/error
  observability and reproduce before closeout.
- Re-run the original failing journey after repair; weaker substitute probes do
  not close the conflict.

## Authorized Write-Job Guard

- When a user explicitly authorizes an actual sync/write, require a
  reviewed dry-run first, then execute the frozen safe scope.
- Assert that execution scope equals reviewed scope before starting.
- Monitor real writes and errors to terminal state; repair and retry safe failed
  scope where possible.
- Reread every target after completion and compare with the plan.
- Do not count a plan, queued job, progress badge, or API 200 as completed
  writes.

## Browser Verification Guard

- Temporary 2026-07-09 local rule: browser verification should prefer headless
  Playwright first because the Vercel `agent-browser` path is currently
  unreliable in this environment.
- Required evidence order is direct API/network probes first, then Playwright
  network/console/URL/text/screenshot evidence, then `agent-browser` only as a
  fallback or when a task explicitly targets that tool.
- Missing Playwright browsers, stale dev servers, closed ports, or expired auth
  state are recoverable issues. Repair or restart the local verification path
  before treating browser verification as blocked.
- On this Windows host, if `agent-browser` is used as fallback, agents should
  carry stable Chrome flags through the command chain:
  `AGENT_BROWSER_ARGS=--no-sandbox,--disable-gpu,--disable-dev-shm-usage`.
- For CORS, proxy, Cloudflare, and login drift, screenshots are supporting
  evidence only. Required evidence is network/API behavior: health checks, auth
  POST result, CORS preflight result, browser network failures, and the resolved
  API base path or host.
- For Project Truth public BNPI PATS checks, record whether the browser used
  same-host `/api`, a paired public API hostname such as
  `dev-api.bnpi-pats.tech`, or LAN app-to-API port mapping.

## Output Guidance

- Natural-language next steps should appear before CLI backup commands.
- Red outputs must clearly say stop.
- Orange outputs must clearly say pause or plan.
- Yellow outputs should guide review or sync.
- Green outputs should not over-warn.

## Drift Result

- Drift status: LOW
- Drift found:
  - RESOLVED-IN-PASS (2026-09-15): rules/docs/wiki described a live device lane
    and `bnpi-pats-emp-app` after the runtime retirement; this governance pass
    retired the rules, banners/compacted the wiki, and corrected live-state rows.
  - REMAINING (accepted): prisma `Device*` models + one legacy migration in
    `bnpi-pats-api`; historical device rows in
    `appliance/seeds/dev-current/dev-current.dump`; dated reports/audits left
    read-only by policy.
- Files synchronized:
  - `AGENTS.md`, `CLAUDE.md`, `.grok/rules/*`, root `README.md`, `docs/**`,
    `.wwg/wiki/*`, `.wwg/wiki/principles/*`, `.wwg/workspace/current-task.md`,
    `.wwg/governance/recommendation-registry.md`, this file.
- Remaining follow-ups:
  - Pass 4 submodule decision on legacy prisma `Device*` models (see
    `.wwg/workspace/current-task.md`); contract count 226 → 217 recorded in
    `.wwg/reports/wwg-agent-handoff.md`.
