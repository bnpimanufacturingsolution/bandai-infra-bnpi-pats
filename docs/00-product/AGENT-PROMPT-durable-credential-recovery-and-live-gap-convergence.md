# Project Truth — Durable Credential Recovery and Live Gap Convergence

You are the single owner-operator agent for:

`C:\Users\stari\bandai-infra`

Your job is to replace the misleading planner-only `Recovery queued` state with
a durable, observable recovery-and-write pipeline, then prove that safe
fingerprint and face gaps visibly decrease from physical-device reread truth.

This is an implementation and explicitly authorized five-device physical
credential convergence job. A read-only plan is the safety gate, not the finish
line. Continue autonomously through implementation, tests, deployment,
canaries, bounded execution, failure repair, physical reread, browser proof,
truth synchronization, commit/push, and exact-SHA CI.

Do not assume any current count, device state, active job, source identity,
portable biometric byte, writer capability, runtime route, or timing result.
Read, measure, name uncertainty, act, and prove.

Follow:

- `AGENTS.md`
- `.grok/rules/*.md`
- the mandatory WWG reading order
- `Agent-Meta-Prompt-Template.md`
- `docs/00-product/HIKVISION_CREDENTIAL_RECOVERY_ARCHITECTURE.md`
- `docs/00-product/HIKVISION_CREDENTIAL_MERGE_EXECUTION_STANDARD.md`

## 1. Fixed physical scope

First revalidate these database IDs, names, addresses, authentication, and
full-inventory readability. Do not trust this table without rereading current
code/config/database/runtime evidence.

Include exactly:

| Device | ID | Historical address |
|---|---|---|
| Main Entrance Device B | `cmpxw13hx002h7zwso7dyedrn` | `10.184.37.20` |
| Main Entrance Device A | `cmrht5s2w00ei7zgsre8y3o5n` | `10.184.37.21` |
| Main Entrance Device F | `cmrim1zop05ik7zp4zgm2sm4k` | `10.184.37.25` |
| Main Entrance Device D | `cmripjwkw00ffl0013lfxcbxw` | `10.184.37.23` |
| Main Entrance Device E | `cmriu5ab102goi001x9o7nfct` | `10.184.37.24` |

Exclude from every write:

- Main Entrance Device C `cmripjwbx00ewl001ihcke210`
- TEST A `cmrlgqsjv000oob01165tbd8n`
- TEST B `cmrv02vam004cnxekd57dsjh8`

If current evidence contradicts the table, mark it `CONFLICTING`, root-cause it,
and do not silently substitute a different device or widen the scope.

## 2. Historical baseline — not current truth

The operator screenshot on 2026-07-24 showed:

- 3,257 potential operations;
- 505 fingerprint, 2,630 face, and 122 card operations;
- `Ready now 0`;
- `Recovery queued 3,237`;
- headline physical action 20;
- backend stage physical identity action 18.

Treat every number above as historical only. The 18-versus-20 classification is
`CONFLICTING`. Capture a fresh API plan before making any implementation or
runtime claim.

## 3. Non-negotiable truth rules

1. `Recovery queued` is currently a planner classification, not proof of an
   executing queue. Do not repeat that label unless a durable recovery job,
   worker lease, heartbeat, and resume cursor exist.
2. `Ready now 0` means zero presently selectable reviewed operations. It does
   not mean zero gaps and does not prove anything is being recovered.
3. Enrollment counts identify gaps; they do not prove portable biometric bytes.
4. Never invent, synthesize, convert, or guess a fingerprint or face template.
5. Never choose between different same-slot biometric checksums without
   evidence-backed identity adjudication.
6. Never overwrite a credential owned by another physical user.
7. Never decrement a gap from a queue transition, HTTP 200, SDK acceptance, or
   write attempt. Only a physical reread may close it.
8. Keep exactly one fleet-wide physical-write owner. Use one API replica until
   the distributed lease is proved.
9. Do not restart/deploy the API while a physical writer is active.
10. Keep the VM-managed named Cloudflare tunnel active.

## 4. Ordered execution

### Phase 0 — Bootstrap and current-state report

1. Open every required WWG/README/template file in the mandated order.
2. Open the current router, controller, merge helper/service, schema, worker,
   frontend, tests, latest `.runtime` evidence, and latest handoff.
3. Inspect the exact endpoint the page calls and run it directly as
   `admin@bandai.local` in its safe read-only mode.
4. Capture raw request/response, elapsed time, plan ID, scope hash, source
   device results, and errors under a new stamped `.runtime` directory.
5. Check for any active recovery, merge, import, SDK-copy, or other physical
   writer. If one exists, monitor it; do not overlap it or restart its API.
6. Publish a Current-State Report containing:
   - confirmed present truth;
   - `STALE`, `CONFLICTING`, and `NEEDS_CONFIRMATION` facts;
   - exact finish line;
   - files/runtime surfaces you will and will not touch.
7. Classify the task as high-risk persistence/device-write work.

### Phase 1 — Prove the stall and establish timing

1. Trace `Ready now`, `Recovery queued`, every recovery stage, and physical
   action totals from backend response to UI rendering.
2. Prove whether any worker currently consumes those rows. Search routes,
   services, job stores, timers, queues, database tables, and runtime logs.
3. Time the existing biometric backfill primitive for representative
   fingerprint and face source rows without widening scope.
4. Break down:
   - plan/read time;
   - queue and lease wait;
   - source capture;
   - checksum/source resolution;
   - writer probe;
   - device write;
   - single-user physical reread;
   - full reread/replan.
5. Capture CPU, memory, event-loop delay, database-pool wait, SDK worker
   utilization, and device concurrency, but do not call CPU the cause unless
   correlated evidence proves it.
6. Name the dominant delay and preserve the measurements.

### Phase 2 — Design and plan review

1. Produce a task graph that deduplicates source custody by:

   `(sourceDeviceId, vendorUserId, modality)`

2. Model separate source-capture, source-resolution, capability-attestation,
   duplicate-owner, target-write, and physical-reread tasks.
3. Define durable job/task state, plan lineage, scope hash, owner, leases,
   heartbeat, resume cursor, attempts, errors, and terminal state.
4. Define one backend-owned reason-code/classification contract. Remove the
   frontend's competing regex-based physical-action count.
5. Define ordered per-device leases, bounded source-read concurrency, serial
   writes per target, and concurrency across independent targets.
6. Define live counters and event payloads before building the UI.
7. Review the plan against identity safety, restart survival, rollout safety,
   device deadlocks, retry idempotency, and physical reread truth. Revise it
   before editing.

### Phase 3 — Implement the durable recovery backend

1. Add the durable recovery job/task persistence required by the reviewed
   design. Use migrations and repository conventions; do not use process-local
   memory as job truth.
2. Add start/list/get/resume-safe status endpoints with admin authorization.
3. Freeze the exact reviewed plan/scope/byte hashes at start.
4. Lease and process deduplicated source tasks.
5. Replan or incrementally derive eligibility from recovered custody without
   losing plan lineage.
6. Make individual safe target writes eligible as soon as their prerequisites
   pass; do not wait for all recovery tasks.
7. Share device locks with merge/other physical writers.
8. Persist stage timings, per-attempt errors, heartbeats, and progress events.
9. Recover after a worker/API restart without duplicating successful writes.
10. Fail closed on stale plan hashes, changed source bytes, duplicate owners,
    missing custody, unsupported writer/build, or lost device identity.

### Phase 4 — Implement honest live UI

1. Before a job exists, rename `Recovery queued` to `Recovery needed`.
2. Once a durable worker owns tasks, show:
   - recovering now;
   - ready to write;
   - writing;
   - awaiting physical reread;
   - physically verified remaining;
   - succeeded;
   - failed/retrying;
   - physical action required.
3. Display job ID, active stage, current source/target, last advancement,
   elapsed time, throughput, measured bottleneck, and latest named error.
4. Poll backend truth and survive modal close/reopen and page reload.
5. Use one backend classification contract for headline and stage totals.
6. Explain `Ready now 0` in plain language and provide the recovery start action
   only when the reviewed scope is safe.
7. Update verified counters immediately after each successful physical reread,
   without waiting for a full-plan refresh.
8. Do not animate estimated or queued work as completed progress.

### Phase 5 — Tests before physical execution

Add and pass meaningful regression tests for:

- no `queued` label without a durable job;
- one source capture unlocking multiple target operations;
- task deduplication and idempotent resume;
- no duplicate write after restart;
- single-writer and ordered device-lock enforcement;
- bounded concurrency across different devices;
- exact frozen-scope enforcement and exclusions;
- source-byte hash change rejection;
- duplicate-owner refusal;
- one backend-owned physical-action total;
- per-stage timing/heartbeat/error status;
- modal close/reopen and browser reload;
- gap decrement only after physical reread;
- face writer failure remaining visible and not counted complete.

Run focused backend/frontend/C++ tests, typechecks/lint applicable to changed
files, schema/migration validation, and `git diff --check`. Do not weaken an
existing safety assertion to obtain green.

### Phase 6 — Promote the exact implementation

1. Commit and push the reviewed implementation to `develop`.
2. Watch GitHub Actions to exact-SHA green.
3. Let the documented GitOps path promote that exact SHA into the Hyper-V VM
   K3s DEV runtime.
4. Prove the running source/image SHA, database migration, one API replica,
   worker state, device routes, listener health, and named Cloudflare tunnel.
5. Do not start a physical job until the deployed runtime matches the reviewed
   code and no overlapping writer exists.

### Phase 7 — Fresh dry run and frozen scope

1. Reauthenticate as admin and call the exact deployed plan endpoint directly.
2. Require all five selected devices to be current, authenticated,
   full-inventory-readable, and free of plan read errors.
3. Preserve a pre-write inventory/custody/owner snapshot and rollback evidence.
4. Validate every exclusion, source choice, target, modality, expected byte
   hash, writer capability, duplicate-owner result, and expected write matrix.
5. Freeze the plan and refuse scope expansion.
6. If rows remain unsafe, recover what software can recover. Convert only
   genuinely absent/different identity truth or proven firmware limits into
   physical-action boundaries.

### Phase 8 — Fingerprint canary and measured wave

1. Select the smallest conflict-free fingerprint canary on a proven target.
2. Start the authorized recovery/write job through the first-class endpoint.
3. Watch durable state and correlated logs through source capture, write, and
   physical reread.
4. Require the UI's physically verified fingerprint gap to decrease after the
   reread.
5. If successful, run bounded waves with at most one write per target and
   concurrent writes across independent targets.
6. Measure reductions in 10–20 second windows. Target 5–10 verified reductions
   per window only when at least that many independent safe operations and
   device latency permit it.
7. If the target is missed, optimize the measured dominant stage, rerun the
   canary/wave, and preserve before/after timing. Never fake the counter.

### Phase 9 — Face canary before face scale

1. Treat face throughput as `NEEDS_CONFIRMATION`; prior attempts are not proof.
2. Select one conflict-free face source/target with current raw custody and a
   build-attested writer.
3. Run one canary and require physical reread retention.
4. On failure, correlate SDK/ISAPI status, device progress, source format,
   firmware/capability, and runtime logs to a named cause.
5. Repair software-recoverable causes and repeat bounded canaries.
6. Scale face waves only after the canary is physically proven. A failed face
   attempt must not reduce the face gap.

### Phase 10 — Finish all recoverable work

1. Continue recovery and bounded waves while technically recoverable rows
   remain.
2. Retry only failed safe scope; do not rerun already verified writes.
3. Reread all five devices and regenerate a final plan.
4. Reconcile source records, peer copy attempts, successful writes, failed
   writes, and physically verified gaps.
5. Investigate every evidence conflict or leave it explicitly unresolved with
   the exact missing proof.
6. Confirm Main C and TEST A/B received zero writes.
7. Confirm listener and Saved Events behavior remains healthy.

### Phase 11 — Browser and closeout proof

1. Use direct API/network proof first, then headless Playwright.
2. Prove the job remains visible after modal close/reopen and page reload.
3. Capture screenshots and network/console evidence showing live stage
   advancement and physically verified fingerprint/face reductions.
4. Update Project Truth, terminology, workspace, governance, and handoff with
   accepted behavior, timings, evidence paths, remaining physical boundaries,
   deployed SHA, and CI result.
5. Commit/push any final truth-sync changes and re-prove exact-SHA CI/runtime.

## 5. Recovery policy

Recoverable failures are agent-owned. For substantial device/runtime work,
attempt and document at least five different plausible recoveries before
calling a path blocked. Continue every unblocked path while one path is
constrained.

Do not stop because a port is down, a service is warming, a tunnel/forward
needs repair, a dependency needs rebuilding, a test is flaky, a rollout has not
started, or the browser needs rerunning.

Stop only for the repository's Real Stop Conditions: repeated evidenced
failure after distinct recoveries, irreversible data risk without rollback,
missing irrecoverable credential/device/network access, or a need to invent
secrets or biometric/identity evidence.

## 6. Required progress updates

During the run, publish concise evidence-backed updates at least every 5
minutes and at each phase boundary:

- current phase and job ID;
- current verified remaining fingerprint/face gaps;
- recovered/ready/writing/rereading/verified/failed counts;
- last real advancement time;
- measured throughput and dominant delay;
- latest named error and recovery attempt;
- whether any physical writer is active;
- evidence directory.

Do not report percentage complete unless its denominator and verification class
are explicit.

## 7. Acceptance checklist

- [ ] Fresh five-device scope and exclusions are physically revalidated.
- [ ] Historical screenshot counts are not reused as current truth.
- [ ] `Recovery queued` no longer implies a nonexistent worker.
- [ ] A durable recovery job has scope hash, owner, lease, heartbeat, cursor,
      counters, errors, and restart-safe state.
- [ ] Source custody tasks are deduplicated by source/user/modality.
- [ ] One recovered source can unlock multiple safe target operations.
- [ ] Physical writers are serial per target and concurrent across independent
      targets under shared ordered locks.
- [ ] Headline and stage physical-action counts use one backend contract.
- [ ] UI visibly advances from recovery through physical verification and
      survives modal/browser closure.
- [ ] Fingerprint canary and bounded wave reduce the physically verified gap.
- [ ] Face canary is physically retained before any face scale claim.
- [ ] A gap decreases only after physical target reread.
- [ ] Every failed attempt has a named cause or explicit unresolved
      observability defect.
- [ ] No Main C or TEST write occurred.
- [ ] Listener and Saved Events remain healthy.
- [ ] Focused tests, typechecks/lint, migration checks, browser proof, and
      `git diff --check` pass.
- [ ] Changes and truth sync are pushed to `develop`.
- [ ] Exact-SHA CI and DEV GitOps runtime are proven.

`FULFILLED` is allowed only when the architecture is deployed and the runtime
evidence shows honest, physically reread gap reductions for every proven
modality, with every remaining row either being actively/recoverably processed
or carrying current evidence for a genuine physical/firmware boundary.

## 8. Start now

Begin with Phase 0. Do not ask the operator to restart, refresh, click Sync, run
the job, or watch it for you when the agent can perform that step. Do not stop
at `Ready now 0`; make the recovery path real, observable, safe, and physically
verified.
