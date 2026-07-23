# Project Truth — Five-Device Live Merge and Root-Cause Owner Loop

You are the owner-operator agent for:

`C:\Users\stari\bandai-infra`

Execute autonomously until the verified five-device merge is physically
completed and post-write evidence is reconciled. Do not stop at a plan,
availability check, queued job, partial browser state, or first error.

Use `AGENTS.md`, WWG, and `Agent-Meta-Prompt-Template.md`:

`discover → report truth → plan → review plan → repair runtime → prove scope → dry-run → review write matrix → execute write → watch logs/job → repair → reread targets → browser proof → truth-sync → commit/push → exact-SHA CI`

## 1. Operator-declared starting truth

The operator reports:

- exactly five physical Main Entrance biometric devices are currently online;
- Main Entrance Device C is not online and is not part of the active merge
  scope;
- earlier UI/API output showing six online conflicts with physical truth.

Treat this as first-class operator evidence, not as permission to hardcode a
result. Verify it. Until reconciled, status is `CONFLICTING`.

Do not:

- report six online because quick health returned six responses;
- include Main C merely because a cached/lightweight endpoint says online;
- replace `inventory-readable` with ambiguous `online`;
- include TEST A/B unless the operator explicitly expands scope and physical
  evidence proves them;
- silently broaden the write scope above the verified five devices.

## 2. Mandatory bootstrap and report

Open the repository-required WWG/AGENTS sources in their mandated order,
including `evidence-over-assumption.md`, the current handoff, this prompt, the
API/app AGENTS files, relevant code/tests, and latest `.runtime` evidence.

Run:

```powershell
powershell -File scripts/verify-grok-wwg-bootstrap.ps1
```

Then publish a Current-State Report containing:

- facts proven now;
- `STALE`, `CONFLICTING`, and `NEEDS_CONFIRMATION` facts;
- exact five-device candidate scope;
- Main C exclusion evidence;
- current ports/processes/DB/tunnels/listener;
- dirty-worktree ownership;
- exact physical-write finish line;
- what will and will not be touched.

Create:

`.runtime/five-device-live-merge-<timestamp>/`

## 3. No-assumption device matrix

For every configured Hikvision device, record these separately:

| Evidence class | Required proof |
|---|---|
| Operator/physical | operator statement or current device-room evidence |
| Power/LAN | current ICMP where meaningful, never sufficient alone |
| Tunnel traffic | host forward carries a protocol response |
| Authentication | current credentialed device/API response |
| Quick health | exact endpoint, timestamp, target, cache state, duration |
| Full inventory | current UserInfo read, IDs read, duration, exact error |
| Listener | service, SDK login, alarm arm, callback receipt, HRIS posting |
| Merge eligibility | exact included/excluded reason |

Never output one unlabeled `online` total.

Expected starting conflict:

- physical/operator: five active, Main C down;
- previous quick endpoint: six transport-positive.

Find the root cause. Check for:

- stale React Query/cache/placeholder data;
- quick-health response caching;
- wrong device-ID-to-tunnel mapping;
- a host port mapped to a different physical IP;
- a proxy/tunnel answering while the intended target is down;
- a health endpoint proving only TCP/generic ISAPI;
- a stale API process with an old tunnel map;
- duplicate frontend/API processes;
- device credential/session behavior;
- a response from the wrong organization/device record.

Do not close this conflict until the original UI journey, direct endpoint,
tunnel target, full read, and verified physical scope agree.

## 4. Every error needs a root cause

For each failure, capture the same time window from:

- Playwright network request/response;
- API logs with route, device ID/name, request ID, stage, duration, and target;
- local tunnel/watchdog logs;
- VM SSH/reverse bridge logs;
- listener `systemd`/wrapper logs;
- device/ISAPI/SDK error body or error code.

`fetch failed`, `Unauthorized`, `timeout`, and `unknown` are symptoms.

If the cause is not known:

1. Treat missing diagnosis as an open defect.
2. Add safe structured logs or correlation IDs.
3. Reproduce the same request.
4. Name the failing layer and cause.
5. Add a regression test.

If existing logs cannot explain the error, insufficient observability is itself
a bug. Never log secrets and never claim a guessed cause.

## 5. Runtime recovery

Prove and repair:

- canonical DEV DB `127.0.0.1:55435`;
- one API process on `3001`;
- one frontend process on `5175`;
- correct forwards for the verified five physical devices;
- no Main C tunnel accidentally mapped to another active device;
- VM `53001 → host 3001`;
- VM curl of `127.0.0.1:53001/health`;
- named Cloudflare service remains active;
- listener dependencies and current SDK/device states.

Startup/watchdog green is necessary but insufficient. Probe forwarded traffic,
device identity, authentication, and full inventory reads.

## 6. Correct the UI/API truth contract

The UI must distinguish:

- physically reported active;
- transport reachable;
- authenticated;
- inventory readable;
- listener armed;
- callback proven;
- excluded, including `Main C — <verified current reason>`.

Rules:

- no cached quick health reused as current full-read evidence;
- no tunnel response marks a physical target online without identity proof;
- preserve saved HRIS values while refreshing;
- show `Checked <time>` and evidence source;
- label stale/conflicting data;
- row Retry runs the exact row query;
- refresh supersedes older scope and ignores late results;
- no indefinite `Checking…`;
- no Close-only recoverable failure.

## 7. Freeze exactly five devices

After reconciling evidence:

1. Produce the exact five IDs, names, and physical targets.
2. Explicitly exclude Main C and TEST/offline devices.
3. Run current quick health and full UserInfo reads for each intended device.
4. Require five current successful inventory reads before a five-device write.
5. Repair and retry any failing intended device.
6. Do not silently downgrade the requested five-device merge to four.
7. Do not silently upgrade it to six.

If a device is genuinely unavailable after distinct recovery attempts, report
the real boundary and never include it in the write.

## 8. Dry-run and logic review

Run the non-mutating merge plan only for the verified five.

Validate:

- requested device IDs equal plan device IDs;
- Main C and TEST devices do not appear;
- IDs read per device are current;
- union, duplicates, conflicts, missing, and write counts reconcile;
- source selections use evidenced records;
- the expected write matrix names source and target;
- reported biometric counts are not treated as portable raw custody;
- no identity or biometric bytes are invented;
- unresolved decisions are explicit;
- execution cannot expand the plan scope.

If the logic is wrong, repair code/tests and regenerate the plan.

## 9. Authorization for the actual merge write

This prompt explicitly authorizes the executing agent to start the real
physical merge write only after Sections 1–8 pass and only for the frozen
verified five-device scope.

The agent must not stop at read-only review.

Before starting:

- save the reviewed plan and write matrix;
- capture pre-write inventories;
- prove execution device IDs, selected unique IDs, choices, and scope hash equal
  the reviewed plan;
- verify rollback/retry behavior;
- exclude unresolved identities and missing biometric custody instead of
  guessing.

Then:

1. Start the merge job.
2. Capture job ID and locked scope.
3. Poll it through terminal state.
4. Watch API, tunnel, listener, and device logs continuously.
5. Report real attempts, successes, failures, skips, and heartbeat.
6. Diagnose and repair recoverable failures.
7. Retry only the safe failed subset.
8. Preserve job evidence before any restart.

## 10. Post-write convergence proof

A `completed` response is not sufficient. Reread all five targets and prove:

- every intended unique ID exists on intended devices;
- selected fields match reviewed sources;
- credential claims match actual custody/results;
- expected writes equal successes plus explained safe skips;
- no writes reached Main C or TEST devices;
- no unintended identities/duplicates were created;
- saved HRIS DeviceUser state reconciles with physical rereads;
- listener and Saved Events remain operational.

Run the exact browser journey:

1. Open Sync Center.
2. Confirm exactly five verified eligible devices and Main C excluded.
3. Refresh without losing values.
4. Open Device Users and completed merge status.
5. Confirm terminal counts and per-device results.
6. Close/reopen and reload.
7. Restart the API using the documented helper.
8. Confirm persisted result truth and that the UI does not return to six.

Capture screenshots, trace, console, failed network requests, logs, and timings.

## 11. Exit gate

Do not stop until:

- [ ] The five-versus-six conflict has a named root cause.
- [ ] Main C is truthfully excluded and not falsely shown online.
- [ ] Exactly five intended devices are authenticated and inventory-readable.
- [ ] Every error has a named cause or explicit real blocker.
- [ ] Logs can explain device/request/stage failures.
- [ ] Five-device dry-run logic reconciles.
- [ ] Execution scope equals reviewed scope.
- [ ] The actual merge write job was started.
- [ ] The job was watched to terminal state.
- [ ] Recoverable failures were repaired and safely retried.
- [ ] Post-write rereads prove convergence on all five.
- [ ] No writes reached Main C or TEST devices.
- [ ] Saved Events and listener remain healthy.
- [ ] API/frontend/runtime tests and Playwright pass.
- [ ] WWG truth is synchronized.
- [ ] Changes are committed and pushed to `develop`.
- [ ] GitHub Actions is green for the exact SHA.

Final status may be `FULFILLED` only when every applicable box passes. A plan,
partial review, queued job, or unexplained error is not completion.

START NOW. Continue through root-cause repair, the reviewed five-device physical
write, terminal job monitoring, post-write rereads, browser proof, truth sync,
push, and exact-SHA CI verification.
