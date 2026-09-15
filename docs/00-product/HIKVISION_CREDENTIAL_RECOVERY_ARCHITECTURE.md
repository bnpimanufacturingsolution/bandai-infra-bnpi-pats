# Hikvision Credential Recovery and Live Convergence Architecture

## Purpose

This document records what the current Device Users credential-convergence
surface really does, why a large `Recovery queued` count can remain unchanged
for hours, and the architecture required for visible, physically verified
progress.

This is an evidence-based design record. It does not authorize a physical
credential write by itself. Live writes remain governed by
`HIKVISION_CREDENTIAL_MERGE_EXECUTION_STANDARD.md`.

## Current-state report — 2026-07-24

### What is confirmed

The operator-provided Merge device users screenshot showed this historical
snapshot:

| Metric | Screenshot value |
|---|---:|
| Unique IDs | 865 |
| Device ID records | 4,325 |
| Needs review | 712 |
| Potential operations | 3,257 |
| Fingerprint operations | 505 |
| Face operations | 2,630 |
| Card operations | 122 |
| Ready now | 0 |
| Recovery queued | 3,237 |
| Physical action required | 20 |

The stage summary in the same screenshot showed 2,614
`queued_source_custody_recovery`, 569 `exporting_source_credential`, 56
`comparing_sources`, and 18 `physical_identity_action_required`.

These numbers are a dated screenshot baseline, not reusable current truth.
Every later run must obtain a fresh plan and retain its plan ID, scope hash,
timestamp, device-read result, and raw JSON.

### What `Ready now 0` means

The frontend selects a credential operation only when all of these are true:

- the planner recommends it;
- `executionEligibility` is `ready_from_raw_blob`;
- the frontend does not classify it as requiring physical action.

Therefore `Ready now 0` means the displayed plan contains zero operations that
the current UI will allow the operator to select. It does not mean there are no
credential gaps, and it does not prove recovery is running.

Evidence:

- `bnpi-pats-app/app/routes/admin/devices/enroll.tsx`
  (`sdkMergeSelectableCredentialWrites`)
- `bnpi-pats-api/app/device/device.controller.ts`
  (`ready_from_raw_blob` and `ready_to_write`)

### What `Recovery queued` means today

`Recovery queued` is not a durable backend queue.

The backend normalizes each planned write into a `recoveryStage`. For example,
`missing_raw_blob` becomes `queued_source_custody_recovery`, while
`source_conflict` becomes `comparing_sources`. The frontend then calculates
`Recovery queued` as every operation that is neither currently selectable nor
classified by the frontend as requiring physical action.

The device router exposes:

- one-user raw fingerprint and face capture;
- per-device biometric metadata backfill;
- merge plan, review, start, and job-status routes.

It does not expose a recovery-job route or a worker that consumes the displayed
recovery-stage population. A count can therefore remain unchanged indefinitely
unless another actor explicitly performs custody capture, replans, and starts
eligible writes.

This is the central defect: the UI presents a work-state noun (`queued`) for a
planner classification that has no executing queue, lease, heartbeat, cursor,
or worker.

### How rows have become ready

The existing software recovery path is:

1. Call `POST /api/device/:id/users/biometric-metadata/backfill` with an exact
   selected source-device/user scope and `execute=true`.
2. Capture current raw biometric custody for the requested modality and retain
   it in the governed encrypted custody representation.
3. Regenerate the merge plan.
4. Let the planner verify source checksum/equality or strict-superset rules,
   ownership, duplicate protection, and current target capability.
5. Mark only passing operations `ready_from_raw_blob` /
   `ready_to_write`.
6. Review and execute those operations through the guarded merge job.
7. Reread the physical target before reducing the retained-gap count.

Historical evidence proves selected recovery batches can work:

- `.runtime/zero-gap-overnight-20260724-025148/b-owner-scan-209-exec/summary.json`
  reports 209 requested, 209 cached, and 0 failed.
- `.runtime/zero-gap-overnight-20260724-025148/f-owner-scan-232/remaining-new-21-exec/summary.json`
  reports 21 requested, 21 cached, and 0 failed.

That evidence proves a callable recovery primitive. It does not prove an
automatic queue or acceptable end-to-end throughput.

### Count conflict

The screenshot reports 20 under the headline `Physical action required`, while
the backend recovery-stage summary reports 18
`physical_identity_action_required`.

Status: `CONFLICTING`.

The frontend independently reclassifies some `source_conflict` rows as physical
action by matching blocking reasons and recommendation text. The backend stage
summary counts the backend's explicit recovery stages. These are different
classification systems, so the totals can diverge. The product must replace
this with one backend-owned, reason-coded classification contract.

## Why progress has appeared stalled

The evidence does not support blaming CPU usage first. The dominant problems
are architectural:

- no recovery worker is consuming the displayed population;
- recovery is invoked in selected external batches rather than from the merge
  plan itself;
- the plan expands one missing source credential into several target
  operations before deduplicating source capture work;
- UI totals are plan snapshots instead of live job counters;
- readiness and physical verification require a replan/reread cycle before the
  operator sees a reduction;
- fingerprint SDK writes are device-latency-bound, and the face path is not yet
  proven scalable.

Historical successful fingerprint-write timing was roughly 19 seconds median,
with substantial device variance: approximately 9.7 seconds on B, 18.9 seconds
on F, and about 28–100 seconds on slower A/D/E paths. These are historical
measurements, not service-level guarantees. Two recorded face attempts failed,
so face throughput is `NEEDS_CONFIRMATION` until a physical canary and reread
succeed.

CPU, memory, event-loop delay, database pool wait, and worker saturation still
belong in the telemetry. They are supporting signals, not substitutes for
per-stage and per-device timings.

## Required architecture

### 1. Durable recovery job

Introduce a durable `CredentialRecoveryJob` with a frozen scope, scope hash,
plan lineage, owner, state, heartbeat, resume cursor, counters, latest named
error, and terminal result.

The job must survive:

- the operator closing the modal or browser;
- the operator laptop disconnecting;
- an API process restart;
- a recoverable worker crash.

Do not show `queued` unless a durable job and worker lease exist. Before a job
starts, use `Recovery needed` or an equally honest non-running label.

### 2. Deduplicated recovery task graph

Do not create one source-capture task for every target gap. Deduplicate custody
work by:

```text
(sourceDeviceId, vendorUserId, modality)
```

One successful source capture may unlock as many as four target writes in the
five-device scope. The task graph should separate:

1. source custody capture;
2. checksum comparison and safest-source resolution;
3. target writer capability attestation, keyed by target and deployed build;
4. duplicate-owner scan;
5. reviewed target write;
6. physical target reread and retained verification.

Each target operation must retain the exact reviewed byte hash and source
lineage. Deduplication must never widen identity scope or reuse bytes across
different people.

### 3. Scheduling for visible convergence

Prioritize work by verified unlock amplification, then by the largest safe gap
class. With the screenshot baseline this would suggest face work first, but
only after a face canary proves capture, write, and reread. Until then,
fingerprints with proven writers are the highest-confidence throughput path.

Use:

- bounded concurrency for independent source reads;
- one physical writer at a time per target device;
- concurrency across different target devices;
- ordered device leases to prevent deadlocks;
- fairness so fingerprints/cards do not starve behind a large face backlog;
- immediate write eligibility when an individual task becomes ready, without
  waiting for the entire recovery population.

The desired operator experience is 5–10 physically verified gap reductions in
each 10–20 second interval when enough independent, safe device operations and
measured device latency make that achievable. This is a throughput target, not
permission to fabricate progress. If the devices cannot sustain it, the UI
must show the measured ceiling and the constraining stage.

### 4. Physical verification owns the gap counter

A successful SDK/ISAPI response is not convergence. A gap decreases only after
a current physical reread proves the expected credential is retained by the
target and still belongs to the intended user.

Maintain separate counters:

- recovery needed;
- recovering now;
- ready to write;
- writing;
- awaiting physical reread;
- physically verified remaining gaps;
- succeeded writes;
- failed writes;
- physical action required.

Never subtract queued, attempted, HTTP-accepted, or SDK-accepted work from the
physically verified remaining count.

### 5. Pollable observability contract

Every job-status response and correlated log stream must expose:

- job ID, frozen scope hash, plan lineage, and owner;
- worker heartbeat and resume cursor;
- current source device, user, modality, target, and stage;
- queue wait and lease wait;
- source capture duration and result;
- checksum comparison/source-decision duration and result;
- target capability probe and writer-build attestation;
- SDK/ISAPI write duration, status, and device-reported progress;
- single-user reread duration and result;
- bounded terminal full-reread duration and result;
- attempts, succeeded, failed, skipped, retried, and latest recoverable error;
- CPU, memory, event-loop delay, database wait, and worker saturation.

The UI must poll this backend-owned state. It must not infer a running job from
planner rows, animate estimated progress as truth, or maintain a competing
physical-action classifier.

### 6. Runtime and rollout safety

Keep one credential-writing API replica until a distributed lease is proven.
Use a shared per-device lock across recovery, merge, and any other physical
writer. Do not restart or roll out the API while an active physical write is in
flight. Preserve the VM-managed Cloudflare tunnel. Execute device work from the
documented VM/K3s path, not through the Windows host runtime.

## Implementation boundary

This document records the architecture and truth discovered from code,
runtime evidence, and the operator screenshot. The implementation is separate
work governed by:

`AGENT-PROMPT-durable-credential-recovery-and-live-gap-convergence.md`

Until that work is implemented and physically proven:

- `Recovery queued` must not be interpreted as active background work;
- `Ready now 0` must not be presented as an unexplained dead end;
- screenshot counts must not be reused as current truth;
- face throughput and zero-gap completion remain `NEEDS_CONFIRMATION`;
- the 18-versus-20 physical-action total remains `CONFLICTING`.
