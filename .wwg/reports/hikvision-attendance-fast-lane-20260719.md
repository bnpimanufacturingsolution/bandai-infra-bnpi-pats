# Hikvision Attendance Fast-Lane Repair — 2026-07-19

## Status

`READY_WITH_WARNING`: implementation, focused tests, Linux compile, managed listener rebuild, and runtime lane evidence passed. A physical attendance tap after deployment remains `NEEDS_CONFIRMATION`.

## Root Cause

The callback queue used priority ordering but only one `hris_post_loop`. When that worker had already entered empty-person inventory/UserInfo enrichment across 341–342 device users, a later major-5 attendance event could not preempt it. Callback HTTP and spool replay also held `callback_spool_mutex` across retrying network requests, creating a second possible cross-worker head-of-line block. A shared condition variable used `notify_one` for workers with different queue predicates, which could wake the wrong consumer and defer work to its polling timeout.

There was no intentional attendance sleep in the HRIS callback controller. The observed wait came from listener-side synchronous work and lock scope.

## Implementation

- Route major-5 and `attendance_*` jobs into `hris_immediate_event_queue`.
- Run two bounded `hris_immediate_post_loop` workers that never call SDK enrichment.
- Keep lifecycle/operation jobs in a separate `hris_enrichment_event_queue` and worker.
- Use `notify_all` for the shared condition variable's predicate-specific consumers.
- Bound immediate live HTTP delivery to one five-second attempt; retain the durable spool for replay.
- Do not hold `callback_spool_mutex` during HTTP.
- Track callback files in flight so replay cannot duplicate an active direct post.
- Add a monotonic token to spool filenames to prevent concurrent filename collisions.

## Validation

- `python -m unittest discover -s vendor/hikvision-linux/tests -p 'test_*.py' -v`: 14 passed.
- Linux HCNetSDK `g++ -std=c++17 -pthread ...`: passed; produced an x86-64 ELF.
- Source SHA-256 in repo staging, `/opt/project-truth`, and managed worktree: `c2493e7630c33cff14aad070ff74838a584104ec31cebdf62893abc14c7e249d`.
- Managed service: `project-truth-hikvision-hot-reload-listener.service` active after rebuild.
- Host API reverse health: `http://127.0.0.1:53001/health` healthy from the VM.
- Cloudflare safety: `cloudflared-bnpi-hris.service` remained active.
- Running binary contains `callback_immediate_ready` and `hris_immediate_event_queue`.
- Live operation callbacks serial `3979` (minor 122) and `3980` (minor 112) were logged as `lane=enrichment`, proving slow device scans are isolated from the immediate queue.

## Remaining Boundary

No physical major-5 attendance callback arrived during the post-deploy observation window. The next TEST A tap should be verified for the sequence `hris_device_event_queued lane=immediate` → `callback_immediate_ready sdkReads=0` → `hikvision_callback_post_result ok=true`, while enrichment is active. The existing listener hot-reload/shutdown recommendation remains relevant because the old process required systemd's bounded stop before rebuilding; it no longer determines attendance delivery latency after this separation.
