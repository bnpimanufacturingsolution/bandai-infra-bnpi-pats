# Hikvision Credential Merge Execution Standard

## Purpose

This is the stable operating contract for copying real Hikvision identity and
biometric credentials between physical panels. It applies to live Device Users
merge jobs and to any agent or operator that can start an SDK write.

## Core ownership rule

Exactly one operator-owned API job may write to the physical fleet at a time.
The owner freezes the scope, reviews the write matrix, starts the job, watches
it to terminal state, and owns any failed-subset retry.

Other Codex sessions or agents may inspect code, run read-only plans, monitor
logs, reconcile evidence, test, and prepare documentation. They must not start
another SDK copy, restart or deploy the API during the job, or directly mutate
the same panels.

Keep the credential-writing API at one replica until the active-job guard uses
a durable cross-process lease. The current in-process guard and durable job
snapshot protect one API process; they are not a distributed lock.

## Execution location

Run physical credential writes from the DEV K3s API inside the Hyper-V VM with:

```text
PROJECT_TRUTH_HIKVISION_RUNTIME_LOCATION=vm-container
```

This is faster and more stable than routing raw-device work through the Windows
host or a public Cloudflare path. The browser or host may use an API forward for
control and status, but raw templates stay on the VM/device path.

`vm-container` still crosses the current same-VM internal SSH boundary. Only a
future native `vm-host` control service is truly SSH-free. Do not describe the
current container path as having no SSH.

## Safe concurrency

Parallelize across different physical target panels. Serialize all writes to
the same target panel.

```text
one job owner
  -> bounded work scheduler
     -> Main A queue: one active write
     -> Main B queue: one active write
     -> Main D queue: one active write
     -> Main E queue: one active write
     -> Main F queue: one active write
```

An eight-worker scheduler is only a scheduling bound. With five targets and a
per-target lock, physical write concurrency is at most five. Increasing worker
count does not authorize concurrent writes to one panel.

Raw fingerprint writes currently use the per-target lock. SDK-probe/fallback
work, especially face copy, must remain serial until it uses the same
deterministic device locking. Do not bulk-parallelize face or
`sdk_probe_required` rows under the fingerprint standard.

## Required gates

Before a real write:

1. Prove the exact device IDs, physical targets, authentication, and current
   full UserInfo reads.
2. Explicitly exclude unavailable, TEST, and operator-excluded devices.
3. Generate a non-mutating plan and preserve its scope hash and write matrix.
4. Prove raw biometric custody. Counts alone never authorize a copy.
5. Preserve pre-write inventory and durable job evidence.
6. Verify no other active write job or rollout can contend with this job.

Expand in separate modality waves:

1. One fingerprint copy to an empty target.
2. One partial-target copy proving only missing slots are attempted.
3. One duplicate-owner case proving it is blocked or quarantined.
4. Reread the physical target after every canary.
5. Expand fingerprint work gradually and stop on a repeated systemic error.
6. Run a separate serial face canary; fingerprint success does not prove face
   portability.

Never mix first-wave fingerprint and face writes.

## Error and retry rules

HCNetSDK/ISAPI progress status `5` with another employee number means the
biometric is already owned by that other identity on the target. It is a
biometric identity conflict, not a transport retry. Do not overwrite, remap, or
guess. Quarantine the row for explicit identity resolution.

Panel busy, authentication, timeout, tunnel, and SDK-session failures require
correlated logs and a named cause. Stop expansion on a repeated systemic class.
Retry only a freshly planned safe failed subset; never replay the original
matrix blindly.

An HTTP-accepted write is not success. Success requires a physical UserInfo or
credential reread showing the intended retained count/slots.

## Runtime and rollout safety

- Do not restart the API, deploy a new image, or allow GitOps rollout while a
  credential job is active.
- Keep the named Cloudflare service active.
- Preserve the durable job snapshot and logs before any recovery restart.
- After terminal state, reread every frozen target before planning another wave.
- Do not run two jobs to make a slow job appear faster.

## Required closeout evidence

Record:

- frozen device IDs, exclusions, plan ID, scope hash, and selected operations;
- pre-write inventory and raw-custody source per operation;
- job ID, timestamps, heartbeat, attempts, successes, failures, and skips;
- per-error target, employee, SDK/ISAPI status, and named cause;
- post-write physical rereads and remaining gaps;
- listener/Saved Events health;
- browser state after reload and API restart;
- pushed commit SHA and exact-SHA CI result.

The status is not fulfilled while a face/fingerprint gap is represented only by
a count, while a duplicate owner is unresolved, or while post-write physical
rereads are missing.

