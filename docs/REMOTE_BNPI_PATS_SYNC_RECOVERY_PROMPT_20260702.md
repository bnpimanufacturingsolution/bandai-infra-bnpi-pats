# Remote BNPI PATS Develop Sync Recovery Prompt

## Purpose

Give a Project Truth agent a recovery-oriented prompt for syncing friend-owned
BNPI PATS app/API `develop` changes into this infra repo without losing VM, GitOps,
device, or runtime behavior.

## Audience

Project Truth implementation agents and owner-operators working from
`bandai-infra` with GitHub, WWG, and VM/runtime responsibilities.

## Summary

The upstream BNPI PATS app/API repos have useful product changes, but they are not
safe to copy wholesale. The agent must fetch, compare, exclude secrets, preserve
local runtime truth, merge in batches, validate, and prove the VM path.

## How It Works

Run the prompt below from the repo root. It forces discovery first, then a
recover/retry loop, allowlisted merge batches, tests, GitOps checks, and
runtime proof.

## Examples

Use this prompt when an agent must sync friend-owned BNPI PATS app/API changes into
Project Truth infrastructure without losing appliance runtime work.

```text
You are working in Project Truth at
C:\Users\anoni\OneDrive\Desktop\PROJECT_TRUTH_HYPERV_FRESH.

Goal:
Sync the latest `develop` changes from:

- https://github.com/bnpimanufacturingsolution/bnpi-pats-app
- https://github.com/bnpimanufacturingsolution/bnpi-pats-api

into the embedded `bnpi-pats-app/` and `bnpi-pats-api/` directories of
`bnpimanufacturingsolution/bandai-infra-bnpi-pats`, while preserving Project Truth
runtime/GitOps/VM behavior.

Hard rules:

1. Start from `AGENTS.md`, `.wwg/reports/wwg-agent-handoff.md`, and
   `Agent-Meta-Prompt-Template.md`.
2. Do not ask for approval for normal repair, fetch, test, commit, push,
   GitHub Actions watch, VM SSH proof, or LAN/Cloudflare verification.
3. Do not bulk overwrite `bnpi-pats-app/` or `bnpi-pats-api/`.
4. Do not import `.env`, cloud keys, Firebase admin JSON, seed credential
   exports, or generated secret material from upstream repos.
5. Preserve local Project Truth runtime files and appliance evidence:
   `gitops/`, `appliance/`, `scripts/`, `.wwg/`, runtime docs, VM tunnel
   behavior, Docker Compose/K3s port contracts, and local device integrations.
6. Treat `/admin/configuration/devices`, ZKTeco, Hikvision, VM, GitOps, and
   runtime repair as admin / `bnpi-pats-admin` work.
7. If a recoverable step fails, try at least three plausible fixes before
   calling it blocked. Examples: full fetch, shallow filtered fetch, GitHub CLI
   archive/clone, alternate IP discovery, `project-truth.ps1 doctor`,
   SSH by config hint, SSH by latest Project Truth IP, LAN/API proof.

Current known evidence from 2026-07-02:

- `gh auth status` is authenticated as `ernestdodz` with repo/workflow access.
- `bnpi-pats-app/develop` remote tip: `0a0332523da8f178ba8f5a1da3c3f7fb434916db`.
- `bnpi-pats-api/develop` remote tip: `d12d67e897fcd4d33ea4342a1aa2b8cfcfa3e48a`.
- Full fetch attempted first and failed with RPC/early EOF. Shallow filtered
  fetch worked:
  `git -c http.version=HTTP/1.1 fetch --depth=1 --filter=blob:none <repo> develop:refs/remotes/<name>/develop`.
- Directory tree drift is large: about 354 changed app paths and 320 changed
  API paths.
- Upstream tree includes secret/environment-looking paths such as `.env`,
  `.env.dev`, `.env.local`, `.env.uat`, Firebase admin JSON, Cloudinary temp
  key paths, and generated seed credential exports. Exclude or quarantine them.
- The embedded local API contains Project Truth runtime/device work that the
  upstream API tree would delete or weaken, including ZKTeco and Hikvision
  appliance paths. Merge selectively.
- Current local dirty files before sync:
  `gitops/runtime-k8s/overlays/dev/runtime.yaml`,
  `bnpi-pats-api/helper/hikvision-event-contract.helper.ts`,
  `bnpi-pats-api/scripts/audit-hikvision-device-events.ts`,
  `bnpi-pats-api/tests/hikvision-event-contract.helper.spec.ts`.
- Those dirty files preserve visible Hikvision biometric verification events
  and DEV watcher port behavior. Do not discard them.
- Local GitOps rendering passed through `project-truth.ps1 verify-gitops-state`
  before remote SSH staging failed.
- Direct Hyper-V cmdlets require elevation in the current shell. Use
  `project-truth.ps1 doctor`, SSH, LAN health, and scripted repair/discovery
  evidence; relaunch elevated only when actually required.
- Previously recorded VM targets `10.184.38.144` and `192.168.254.148` timed
  out on SSH from this shell. Treat VM reachability as drift to recover, not as
  proof of failure.
- Attendance redesign drift is confirmed:
  - upstream app adds `AttendanceFixModal`, attendance date/scope popovers,
    `AttendanceDailyTrendSection`, expanded attendance/timesheet tests, and
    in-place `Fix Attendance` row actions.
  - local app does not currently have those files and browser inspection did
    not show `Fix Attendance` or daily trend signals.
- Theme/font drift is confirmed:
  - upstream app adds `app/styles/tokens.css`, Metropolis font imports, and
    Bandai Europe B2B brand token wiring in `app.css` and `theme.ts`.
  - local app still uses the older Inter/Outfit path.
- API attendance ledger drift is confirmed:
  - upstream API adds attendance correction/backfill services and tests.
  - upstream `attendance-correction.service.ts` uses direct HR correction,
    correction-request, and direct backfill ledger sources.
  - upstream API also changes/deletes device-runtime files, so merge the
    attendance ledger batch without blindly replacing local ZKTeco/Hikvision
    Project Truth runtime work.

Recommended execution:

1. Current-state report:
   - `git status --short --branch`
   - `git remote -v`
   - `gh auth status`
   - `git rev-parse refs/remotes/bnpi-pats-app/develop refs/remotes/bnpi-pats-api/develop`
   - tree-only drift counts:
     `git diff-tree -r --no-commit-id --name-status HEAD:bnpi-pats-app refs/remotes/bnpi-pats-app/develop`
     and same for API.
2. Build an allowlist merge plan:
   - Accept product source, tests, package/schema changes that are needed for
     HR feature parity.
   - Exclude secret/env/generated credential paths.
   - Preserve Project Truth runtime-specific app/API changes unless explicitly
     superseded and revalidated.
   - For the first app batch, prioritize the attendance redesign and theme
     files: `AttendanceFixModal`, date/scope popovers,
     `AttendanceDailyTrendSection`, attendance-management template changes,
     attendance services/hooks/tests, `app/styles/tokens.css`, `app/app.css`,
     `app/lib/config/theme.ts`, and required package dependencies.
   - For the first API batch, prioritize attendance correction/backfill
     services, router/controller wiring, request reconciliation services, and
     the related tests. Reconcile any Prisma/schema requirements explicitly.
   - Keep local Project Truth GitOps/runtime and Hikvision biometric visibility
     edits unless a later tested batch intentionally supersedes them.
3. Apply in small batches:
   - App UI/source batch.
   - API source/schema/test batch.
   - Package lock/dependency batch.
   - Runtime adapter batch only after tests pass.
4. Validate after each batch:
   - app/API package tests relevant to changed files.
   - `git diff --check`.
   - `.\scripts\project-truth.ps1 test-self-heal-contract`.
   - `.\scripts\project-truth.ps1 verify-gitops-state`.
5. Runtime proof:
   - Recover VM reachability.
   - Prove SSH really reaches the VM.
   - Pull/sync `develop` inside the VM.
   - Verify Docker Compose/K3s runtime ports and public `bnpi-pats.tech` paths.
6. Close only with evidence:
   - exact upstream SHAs merged,
   - excluded secret/runtime paths,
   - tests run,
   - GitHub Actions status after push,
   - VM SSH/LAN/public proof,
   - remaining drift and recommendations.
```

## Related Commands or Files

- `Agent-Meta-Prompt-Template.md`
- `AGENTS.md`
- `.wwg/reports/remote-bnpi-pats-sync-drift-20260702.md`
- `.wwg/governance/recommendation-registry.md`
- `.\scripts\project-truth.ps1 test-self-heal-contract`
- `.\scripts\project-truth.ps1 verify-gitops-state -GuestIp <guest-lan-ip>`

## References

- `https://github.com/bnpimanufacturingsolution/bnpi-pats-app`
- `https://github.com/bnpimanufacturingsolution/bnpi-pats-api`
- `https://github.com/bnpimanufacturingsolution/bandai-infra-bnpi-pats`
