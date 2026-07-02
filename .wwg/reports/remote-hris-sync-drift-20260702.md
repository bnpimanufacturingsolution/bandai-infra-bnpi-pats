# Remote HRIS Sync Drift Report - 2026-07-02

## Task Mode

Mixed runtime/source drift discovery and recovery planning.

## Current-State Report

- Working repo: `C:\Users\anoni\OneDrive\Desktop\PROJECT_TRUTH_HYPERV_FRESH`.
- Branch: `develop`, tracking `origin/develop`.
- GitHub auth: authenticated as `ernestdodz` with repo/workflow access.
- Embedded HRIS directories are normal Git trees inside `bandai-infra`, not
  submodules.
- Pre-existing dirty files:
  - `gitops/runtime-k8s/overlays/dev/runtime.yaml`
  - `hris-api/helper/hikvision-event-contract.helper.ts`
  - `hris-api/scripts/audit-hikvision-device-events.ts`
  - `hris-api/tests/hikvision-event-contract.helper.spec.ts`

## Remote Evidence

- `hris-app/develop`: `0a0332523da8f178ba8f5a1da3c3f7fb434916db`.
- `hris-api/develop`: `d12d67e897fcd4d33ea4342a1aa2b8cfcfa3e48a`.
- Full fetch attempts failed with RPC/early EOF after pack transfer.
- Shallow filtered fetch with HTTP/1.1 succeeded for both upstream repos.

## Drift Summary

- `hris-app` has about 354 tree path changes versus embedded `HEAD:hris-app`.
- `hris-api` has about 320 tree path changes versus embedded `HEAD:hris-api`.
- A working-tree comparison against the extracted upstream app archive found
  larger file-level drift after excluding obvious generated/secret paths:
  `added=118`, `changed=1197`, `deleted=19`, `common=1225`.
- High-signal app drift is concentrated in attendance/timesheet UI,
  attendance services/hooks, common templates, and theme/font files.
- Upstream app/API trees contain secret/environment-looking paths that should
  not be imported blindly:
  - `.env`, `.env.dev`, `.env.local`, `.env.test`, `.env.uat`
  - Firebase admin JSON paths
  - Cloudinary temp key paths
  - generated seed credential export paths
- Upstream API differs materially from local Project Truth runtime/device work.
  A blind replacement would delete or weaken local ZKTeco/Hikvision appliance
  paths and tests that are currently part of Project Truth runtime evidence.

## Attendance / Theme Findings

- The upstream app contains a redesigned direct HR attendance correction flow
  that is not present locally:
  - new `AttendanceFixModal`
  - new attendance date/scope filter popovers
  - new `AttendanceDailyTrendSection`
  - new/expanded attendance and timesheet tests
  - direct row action text changed from the older time-correction journey to
    an in-place `Fix Attendance` modal flow
- Local `hris-app` still lacks:
  - `app/components/organisms/hr/AttendanceFixModal.tsx`
  - `app/components/molecules/AttendanceDateFilterPopover.tsx`
  - `app/components/molecules/AttendanceScopeFilterPopover.tsx`
  - `app/components/templates/common/AttendanceDailyTrendSection.tsx`
  - `app/styles/tokens.css`
- Upstream theme drift includes Metropolis font imports, Bandai Europe B2B
  brand tokens, RGB brand red/accent values, and `app.css` token wiring.
  Local app still loads Inter/Outfit and does not have the upstream token file.

## API Attendance Findings

- Upstream API adds attendance correction/backfill services and tests:
  - `app/attendance/attendance-backfill.service.ts`
  - `app/attendance/attendance-correction.service.ts`
  - `tests/attendance-backfill.service.spec.ts`
  - `tests/attendance-correction.service.spec.ts`
- Upstream API also deletes or moves ZKTeco files and changes Hikvision files.
  Those changes must be reconciled with local Project Truth device/runtime
  work instead of copied wholesale.
- Targeted inspection of upstream `attendance-correction.service.ts` confirms
  a ledger-oriented model with `HR_DIRECT_CORRECTION`,
  `ATTENDANCE_CORRECTION_REQUEST`, and `HR_DIRECT_BACKFILL` sources.

## VM / Runtime Evidence

- `project-truth.ps1 doctor` passed core tools but warned this shell is not
  elevated, so direct Hyper-V control is not available here.
- `Get-VM` failed due Hyper-V authorization from the unelevated shell.
- SSH and API probes to previously recorded targets timed out:
  - `10.184.38.144:22`
  - `192.168.254.148:22`
  - `http://10.184.38.144:3101/health`
- `project-truth.ps1 verify-gitops-state -GuestIp 192.168.254.148` rendered
  local GitOps overlays successfully, then failed when it could not stage the
  remote script over SSH.
- Public DEV probes returned Cloudflare 530:
  - `https://dev.bnpi-hris.tech/`
  - `https://dev.bnpi-hris.tech/auth/login`
  - `https://dev.bnpi-hris.tech/api/system-provisioning/status`
  - `https://dev-api.bnpi-hris.tech/health`
- No host-local HRIS app ports were listening on `3000`, `3100`, or `3200`.
- Known VM/LAN app targets timed out from this shell:
  - `http://192.168.254.148:3100/auth/login`
  - `http://10.184.38.144:3100/auth/login`

## Browser Evidence

- `agent-browser 0.31.1` was available after setting the Project Truth Chrome
  stability flags.
- Local frontend was started at `http://localhost:4177` with
  `VITE_E2E_AUTH_BOOTSTRAP=true` for browser-only inspection.
- An E2E `hris-admin` user state was injected into local storage to reach
  `/hr/attendance` without production credentials.
- Browser evidence showed the current local route renders the existing
  attendance summary shell and does not expose upstream signals:
  `hasFixAttendance=false`, `hasDailyTrend=false`.
- Row-level action proof could not be completed because the local route stayed
  in `Loading department attendance...` even with a disposable mock API row.
  Screenshots were saved under `.runtime/browser-evidence/screenshots/`.

## Decision

Bulk sync was not applied. The safe next step is an allowlisted, batch merge
that excludes secret/generated credential paths and preserves Project Truth
runtime/device work until each change is tested.

## Outcome

The remote drift was confirmed and documented. The upstream app/API refs were
fetched, the unsafe bulk-sync risks were identified, and a reusable recovery
prompt was created. No app/API source files were overwritten.

## Evidence

- Remote refs:
  - `hris-app@0a0332523da8f178ba8f5a1da3c3f7fb434916db`
  - `hris-api@d12d67e897fcd4d33ea4342a1aa2b8cfcfa3e48a`
- Drift counts:
  - about 354 app tree path changes
  - about 320 API tree path changes
- Secret/generated credential path examples were present in upstream tree
  comparisons.
- VM SSH probes to the two known historical targets timed out from this shell.
- Current local browser proof did not show the upstream direct
  `Fix Attendance` flow or daily trend section.

## Validation Performed

- `git status --short --branch`: PASS, showed four pre-existing dirty files.
- `gh auth status`: PASS.
- `git ls-remote --heads` for app/API develop: PASS.
- shallow filtered fetch for app/API develop: PASS after full fetch recovery.
- `project-truth.ps1 doctor`: PASS/WARN, not elevated.
- `project-truth.ps1 verify-gitops-state -GuestIp 192.168.254.148`:
  PARTIAL, local renders passed; SSH staging failed.
- `git diff --check`: PASS.
- `project-truth.ps1 test-self-heal-contract`: PASS, 184 checks.
- Focused API test:
  `npx tsx node_modules/mocha/bin/mocha --no-config tests/hikvision-event-contract.helper.spec.ts`:
  PASS, 22 tests.
- Focused app attendance service test:
  `npx vitest run app/services/attendance.service.test.ts --passWithNoTests`:
  PASS, 6 tests.
- Accidental broad API test through `npm run test -- tests/...`:
  FAIL on unrelated isolated DB/controller/tax expectation failures because
  the package script appended `tests/**/*.spec.ts` and ran the whole suite.
- Initial app Vitest command with `--runInBand`: FAIL because Vitest does not
  support that option.
- `wwg test-check --format plain`: PASS.
- `wwg validate`: PASS.

## Risks

- Blindly copying upstream app/API roots could import secret material.
- Blindly replacing `hris-api/` could remove or weaken local Project Truth
  ZKTeco/Hikvision runtime work.
- VM start/state cannot be proven from this unelevated shell through Hyper-V
  cmdlets; SSH also timed out to the two known targets.
- Browser row-action proof needs a real or more complete mocked API state; the
  local shell alone is enough to prove the remote attendance redesign is not
  currently applied, but not enough to validate the full post-merge user
  journey.

## Next Action

Run the prompt in `docs/REMOTE_HRIS_SYNC_RECOVERY_PROMPT_20260702.md` for a
batch-by-batch allowlisted merge, then recover VM reachability and prove SSH,
GitOps, LAN, and public `bnpi-hris.tech` behavior before pushing.

Recommended merge posture:

- Keep local Project Truth runtime/GitOps files and current Hikvision
  biometric visibility changes.
- Merge upstream attendance UI/theme in a focused app batch.
- Merge upstream attendance correction/backfill API services and tests in a
  focused API batch.
- Reconcile, do not bulk replace, upstream device/runtime API differences.

## Detailed Notes

- Full `git fetch` failed with RPC/early EOF; shallow filtered fetch with
  HTTP/1.1 succeeded.
- Tree-only diff commands were more reliable than blob-hydrating full diffs
  after the filtered fetch.
- Temporary partial-clone config entries were removed after fetch recovery.

## Files Changed or Files Reviewed

- Changed: `.wwg/reports/remote-hris-sync-drift-20260702.md`
- Changed: `docs/REMOTE_HRIS_SYNC_RECOVERY_PROMPT_20260702.md`
- Changed: `.wwg/governance/recommendation-registry.md`
- Reviewed: `AGENTS.md`
- Reviewed: `Agent-Meta-Prompt-Template.md`
- Reviewed: `.wwg/wiki/project-truth-summary.md`
- Reviewed: `.wwg/wiki/project-truth.md`
- Reviewed: `.wwg/wiki/terminology.md`
- Reviewed: `.wwg/workspace/current-task.md`
- Reviewed: `.wwg/governance/drift-guard.md`

## WWG Truth Synchronization

- Task mode: mixed source/runtime drift discovery.
- New truth detected: yes, remote sync is not safe as a blind copy because of
  secret-looking upstream files and local runtime/device divergence.
- Wiki updated: no.
- Workspace updated: no.
- Governance review completed: yes.
- Drift status: HIGH.
- Canonical files changed:
  - `.wwg/reports/remote-hris-sync-drift-20260702.md`
  - `docs/REMOTE_HRIS_SYNC_RECOVERY_PROMPT_20260702.md`
  - `.wwg/governance/recommendation-registry.md`
- Implementation discoveries synced:
  - Remote SHAs, fetch recovery path, drift counts, VM reachability status.
- Remaining stale context:
  - VM current IP/start state needs elevated or recovered runtime proof.
  - Upstream app/API changes need allowlisted batch merge and validation.

## Recommendation Capture

New recommendation recorded as `REC-20260702-REMOTE-HRIS-SYNC-GUARD`.
