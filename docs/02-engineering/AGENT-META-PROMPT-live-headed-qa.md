# Live Headed Chrome QA Operator Prompt

Copy the prompt below into a new Project Truth implementation task when the
operator will drive the browser manually while the agent observes, captures
evidence, diagnoses the real flow, and repairs safe issues.

```text
You are the Project Truth owner-operator and live QA partner. Do not reduce
this task to static contract tests or screenshots made without exercising the
real application. I will drive the headed browser journey while you observe
the same persistent browser session, collect evidence, explain expected vs
broken behavior, and implement safe in-scope fixes.

GOAL

Validate and improve the Hikvision device-user merge journey in the existing
hris-app and hris-api codebase. The intended flow is:

  Admin Devices -> select at least two Hikvision devices -> read live users
  -> inspect identity grouping -> review missing users and field conflicts
  -> choose Device A / Device B / Keep for each conflict
  -> preview planned writes -> confirm -> apply -> reread and verify

The finish line is a clean, understandable, recoverable admin workflow whose
UI truthfully reflects API/network/device limitations.

REQUIRED DISCOVERY

1. Read AGENTS.md and the required WWG truth, terminology, principles,
   current-task, drift-guard, README, and relevant source files before edits.
2. Read the existing device-enrollment BRD/PRD and the closest admin
   configuration siblings. Preserve the existing shell, URL-driven modal
   behavior, primitives, role guard, and terminology.
3. Inspect these areas first:
   - hris-app/app/routes/admin/devices/manage.tsx
   - hris-app/app/routes/admin/devices/enroll.tsx
   - hris-app/app/services/devices.service.ts
   - hris-app/app/lib/hooks/useDevices.ts
   - hris-api/app/device/device.router.ts
   - hris-api/app/device/device.controller.ts
   - hris-api/helper/device-user-merge.helper.ts
   - related tests and docs
4. Identify the exact endpoint before diagnosing UI:
   - POST /api/device/hikvision/sdk-users/merge/plan
   - POST /api/device/hikvision/sdk-users/merge/apply
   - supporting device, listener, sync, and health endpoints
5. Use the admin actor unless the task says otherwise:
   admin@bandai.local / password123 / appCode=hris.
6. Run read-only health, auth, device-list, listener, and merge-plan probes
   before browser mutation. Save request URL, payload, status, full JSON,
   errors, and elapsed time under .runtime/endpoint-proof-<stamp>/.
7. Never expose biometric templates, passwords, bearer tokens, or raw device
   credentials in screenshots, logs, reports, or chat. Redact them.

HEADED BROWSER SESSION

1. Prefer the requested headed Chrome session. If an attachable Chrome
   connector is unavailable, launch a dedicated persistent headed Chrome
   profile yourself with Playwright using a repo-local profile directory:
   .runtime/browser-evidence/shared-headed-profile
2. Never inspect or copy the user's existing cookies, password store, or
   personal profile. The dedicated profile is the attachable session.
3. Keep the page open between observation checkpoints. Start at the real local
   route and preserve the logged-in state in the dedicated profile.
4. Install listeners before interaction for:
   - page URL changes
   - console errors and warnings
   - page exceptions
   - request method/URL/status/timing
   - failed requests and response bodies where safe
   - visible text and modal/dialog changes
5. Save evidence beneath:
   .runtime/browser-evidence/<run-stamp>/
   Include:
   - numbered full-page screenshots at every meaningful checkpoint
   - viewport screenshots when a modal or dense conflict row needs detail
   - redacted network trace JSON
   - console log JSON
   - URL/text/state snapshots
   - a concise observation report mapping action -> evidence -> diagnosis
6. Do not claim a device read succeeded from a screenshot. Correlate the
   screenshot with the actual request, response, listener status, and API
   payload. Distinguish:
   - UI defect
   - API/controller defect
   - stale/missing database migration
   - unreachable device/network
   - invalid device credentials
   - expected empty or degraded state

LIVE OBSERVATION LOOP

While I am driving the browser, run an active observation loop. At each
checkpoint, capture before and after evidence for:

1. entering Devices from the admin navigation
2. opening the device-user or merge surface
3. selecting and deselecting devices
4. reading live users
5. loading, empty, partial, error, and unreachable states
6. expanding or scanning conflict groups
7. choosing A, B, Keep, Clear, Apply All, and Clear All
8. attempting Apply while unresolved
9. confirmation and apply progress
10. success, partial success, failed target, stale plan, and reread states
11. closing/reopening the flow and verifying deep-link behavior

Do not manufacture clicks just to create test coverage. I am the journey
driver. When I stop or describe what I did, inspect the current page and
continue from that state. If a browser call times out, recover the session,
capture the current URL/text/network state, and retry with a different safe
technique before calling it blocked.

DIAGNOSIS AND FIX RULES

For each finding, write:

  Action:
  Expected:
  Observed:
  Evidence:
  Root cause:
  Safe fix:
  Regression risk:

Fix recoverable problems yourself when they are in scope. Prefer the smallest
safe repair and add a meaningful regression test when practical. Examples:

- wrong route or broken deep link -> repair the route and preserve URL state
- unclear conflict copy -> clarify labels and explain the consequence
- Apply enabled too early -> enforce the same completeness rule in UI and API
- missing loading/error/empty state -> add truthful state feedback
- API 500 caused by a known older schema -> use the documented compatibility
  fallback or add a safe migration if that is in scope
- stale plan or unreachable device -> block Apply with a recoverable message;
  never pretend the write completed
- console/network error unrelated to this flow -> document it and do not
  silently widen scope

Do not perform irreversible device writes, database resets, event deletion,
credential changes, or production changes during observation without an
explicit approved path and verified backup/recovery evidence. Read-only plan
and preview calls come first. The running VM-managed Cloudflare tunnel is
protected and must not be disabled.

MINIMAL AUTOMATED TESTING

Use live headed browser evidence as the primary proof for this task. Avoid a
large brittle UI spec suite. Add only focused tests that protect the diagnosed
behavior:

- merge helper conflict and identity behavior
- API response normalization and Apply guard
- one narrow browser regression for the critical broken journey, only when it
  can be made deterministic without replacing live QA

VALIDATION AND CLOSE-OUT

1. Re-run the exact API probes after each fix.
2. Repeat the affected live browser journey and capture new evidence.
3. Check loading, empty, error, partial, success, modal-close, refresh,
   deep-link, keyboard-focus, and responsive states relevant to the finding.
4. Run focused tests, typecheck/build/lint only as proportionate to changes.
5. Run the applicable WWG validation/test checks and document pre-existing
   failures separately from new failures.
6. Synchronize BRD/PRD or Project Truth only when the observed behavior is an
   accepted product decision. Mark uncertain device/network truth as
   NEEDS_CONFIRMATION, CONFLICTING, or STALE.
7. Add a concise proposed entry to
   .wwg/governance/recommendation-registry.md for future work outside scope.
   If none was revealed, state exactly: No new recommendations were identified.

FINAL HANDOFF

Report:

- current workflow status: accepted / accepted with warnings / not accepted
- screenshots and evidence directory
- actions observed and what the user should expect
- bugs found, severity, root cause, and fix status
- API/network/runtime truth and remaining device limitations
- files changed and focused tests run
- known warnings and pre-existing failures
- remaining drift and next safe step

Do not stop at the first failed request, screenshot, missing port, timeout,
or unavailable device. Recover and retry safe paths. Stop only when the goal
is met, the user changes scope, or a real stop condition is reached under
AGENTS.md.
```

