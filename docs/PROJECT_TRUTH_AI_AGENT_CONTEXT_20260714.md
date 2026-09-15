# Project Truth AI Agent Context

Last updated: 2026-07-14
Status: Working context for AI agents
Audience: Business/planning agents, research agents, implementation agents

## Purpose

Use this document as the high-signal context pack for any AI agent working on
Project Truth BNPI PATS, especially work involving:

- the employee portal kiosk/biometric login journey;
- Hikvision tap-event ingestion and saved-event truth;
- device-user sync, fingerprint/facial enrollment sync, and peer copy;
- mutation/job durability when the API, VM, or runtime restarts;
- VM/LAN/GitOps/runtime drift research and recovery.

This is not a marketing brief. It is an operator-truth handoff for agents that
must keep researching, validating, and repairing the real system.

## Executive Context

Project Truth is a VM-first BNPI PATS runtime on a Linux Hyper-V appliance with
three main product surfaces:

- `bnpi-pats-app`: admin BNPI PATS and device-management app
- `bnpi-pats-api`: API and device/runtime orchestration layer
- `bnpi-pats-emp-app`: employee self-service portal with kiosk-style biometric login

The clean target architecture is:

- Windows host for Hyper-V, browser, and SSH only
- one Linux Hyper-V VM for the real Project Truth runtime
- Docker/K3s/Argo/GitOps inside the VM
- LAN-reachable BNPI PATS app/API/employee portal from the Windows host
- VM-managed named Cloudflare tunnel kept active for public access and SSH

Current canonical LAN/runtime target:

- VM IP: `10.184.37.19`
- PROD app: `http://10.184.37.19:3000/auth/login`
- PROD API: `http://10.184.37.19:3001/health`
- PROD employee app: `http://10.184.37.19:3300/auth/login`
- DEV employee app: `http://10.184.37.19:3310/auth/login`
- UAT employee app: `http://10.184.37.19:3320/auth/login`

Public tunnel targets currently include:

- `https://bnpi-pats.tech/auth/login`
- `https://api.bnpi-pats.tech/health`
- `https://emp.bnpi-pats.tech/auth/login`
- `https://dev-emp.bnpi-pats.tech/auth/login`
- `https://uat-emp.bnpi-pats.tech/auth/login`

## Business Context

The business need is not just "biometric integration." The business need is:

1. Employees must be able to tap on physical biometric devices and have those
   taps appear reliably in BNPI PATS without guesswork.
2. The employee portal kiosk experience must support fast biometric-driven
   sign-in and safe fallback manual login.
3. Admins must be able to see truthful device status, event truth, saved-event
   outcomes, sync gaps, and failure reasons.
4. Device-user identity, fingerprint, and face propagation across terminals
   must be manageable without pretending local UI state equals physical-device
   truth.
5. Long-running sync and mutation work must survive process restarts, API
   restarts, VM drift, and server outages as safely as practical.
6. The system must keep producing operational truth even when infrastructure is
   unstable, partially down, or cross-network paths are broken.

## Current Product Truth

### Employee portal

- `bnpi-pats-emp-app/app/routes/auth.login.tsx` already implements a kiosk-style
  login screen.
- It polls once per second for biometric kiosk login claims through
  `authService.claimBiometricKioskLogin(...)`.
- Polling only runs when the page is visible, the user is not already signed
  in, manual login is not open, and no manual submit is in flight.
- Manual login remains available as fallback.

### Device/admin surface

- `bnpi-pats-app/app/routes/admin/devices/events.tsx` already exposes a rich admin
  device-events and sync-center surface.
- The admin UI already models:
  - live vs saved event views;
  - listener status and control;
  - device sync previews;
  - import jobs and progress;
  - event taxonomy and runtime-path truth;
  - realtime saved-event updates.

### API/device orchestration

- `bnpi-pats-api/app/device/device.controller.ts` already contains substantial
  device orchestration logic.
- It supports device events, health, Hikvision listener status/control,
  device-user sync, import/export, reset, attendance import, merge planning,
  peer copy, synthetic biometric tallies, and job polling.
- Some job flows already expose IDs and polling, but several important
  mutation/sync paths still rely on process memory or inline execution rather
  than durable restart-safe jobs.

### Device identity model

- `DeviceUser` is the durable per-device identity/enrollment record.
- `DeviceEvent` resolution should prefer `DeviceUser` before legacy
  `Employee.deviceEmpId`.
- `DeviceUser.vendorMetadata` is additive metadata and may include useful
  vendor user details, but raw biometric template custody is still a guarded
  boundary.

## Critical Truths And Boundaries

### Truthfulness boundaries

- A synthetic fingerprint tally is not the same as a real physical fingerprint
  template on the device.
- UI/demo/test convenience must not be mislabeled as physical-device truth.
- Saved-event UI proof is weaker than endpoint proof.
- Screenshot proof alone is not enough for network, CORS, callback, or tap
  claims.

### Current known good direction

- Use direct endpoint proof first.
- Use Playwright/headless browser proof second.
- Use runtime/VM/tunnel proof third.
- Keep the VM-managed Cloudflare tunnel active during normal work.
- Use direct LAN SSH to `10.184.37.19` first when validating host-local VM
  truth.

### Hikvision biometric boundary

- Linux/VM-owned HCNetSDK listener plus queued reconcile worker is the target
  architecture.
- The active service must post alarm-derived events to
  `/api/hikvision/callback`, with BNPI PATS remaining the owner of saved-event
  persistence and attendance/timesheet projection.
- Do not claim raw fingerprint template custody or browser-side fingerprint
  matching until encryption, security, and retention rules are explicitly
  designed and proven.

## Specific User Intent To Preserve

The owner wants the system to support a very practical field workflow:

- Develop the employee portal around real biometric/kiosk behavior, not just
  static auth screens.
- Use known employee/device evidence such as `ernest` when that identity is
  actually present in current runtime truth.
- Poll, detect, save, and verify tap events quickly enough that the admin can
  trust the system during live testing.
- Use Playwright and direct endpoint checks to prove whether tap events really
  appeared.
- Continue researching truth when a server goes down instead of stopping early.
- Improve long-running mutations/sync so work can survive restarts and outages.

## BRD Context

### Problem statement

Project Truth currently has strong partial building blocks but still suffers
from drift between:

- UI truth and physical-device truth
- local dev truth and VM/GitOps truth
- short request/response mutations and long-running device-sync work
- successful saved-event capture and durable end-to-end biometric lifecycle
  management

This creates operational pain whenever:

- a Hikvision/ZKTeco device is reachable only from certain networks;
- a listener is running but device login fails;
- a tap occurs but the admin cannot quickly prove where it was lost;
- a copy/sync/mutation is interrupted by restart or runtime drift;
- the employee portal appears kiosk-ready but biometric sign-in truth is not
  fully validated end to end.

### Business goals

1. Make biometric/tap truth observable and trustworthy.
2. Make employee kiosk login feel immediate and operationally credible.
3. Reduce false negatives when validating whether a tap happened.
4. Reduce operational damage from server restarts or partial outages.
5. Make device-user/fingerprint sync auditable, resumable, and easier to
   recover.

### Success metrics

- A real or clearly labeled synthetic biometric login/tap can be traced from
  trigger to saved event.
- An admin can verify tap arrival through API proof and browser proof within a
  few minutes, without guessing.
- Biometric kiosk polling produces timely login claims when the backend has a
  claim to deliver.
- Long-running device mutations expose durable progress/history and can resume
  or fail truthfully after restart.
- The system distinguishes:
  - source unavailable
  - listener running but login failed
  - event saved but unmatched
  - physical biometric missing
  - synthetic UI-only test state

### Primary stakeholders

- HR/admin operators
- onsite implementers validating physical biometric devices
- employees using kiosk-style sign-in
- owner/operator engineering responsible for runtime truth

## PRD Context

### Product area

Biometric attendance and employee-portal authentication across:

- Hikvision devices
- admin device-event and sync-center tooling
- employee kiosk login
- VM/GitOps/runtime truth surfaces

### Core requirements

1. Kiosk biometric polling
   - Employee portal must poll for biometric login claims safely and
     continuously while visible.
   - Manual login must remain available.

2. Tap-event observability
   - A tap must be provable through direct API or device-event evidence.
   - Saved events must show runtime path, event taxonomy, BNPI PATS result, and
     match state.

3. Listener status truth
   - Admin surfaces must distinguish:
     - listener active
     - listener unreachable
     - device login failed
     - no armed devices
     - source unavailable

4. Device-user sync truth
   - Device-user identity sync is separate from device-log attendance sync.
   - Sync previews must estimate unsaved, skipped, failed, and in-sync states.

5. Synthetic vs real biometric honesty
   - Synthetic fingerprint/face counts can exist for FE test support, but they
     must stay explicitly separate from real physical-device biometric counts.

6. Durable mutation jobs
   - Long-running copy, sync, reconcile, import, and biometric mutation paths
     should move toward persisted, restart-safe jobs with history and resumable
     progress.

7. Evidence-first validation
   - For any investigation, identify the exact endpoint, run it directly in
     safe mode first, capture JSON and timing, then run Playwright/browser
     proof.

### Non-goals

- Pretending browser state alone proves device truth
- Storing raw fingerprint templates in ordinary user records
- Treating synthetic fingerprint counts as real device enrollments
- Declaring success from local host Docker only without VM/runtime evidence

### Important known open gaps

- Some Hikvision flows still depend on device/network reachability that is not
  guaranteed from every runtime location.
- Some mutation/sync paths are still inline or process-memory-backed.
- VM/GitOps/public promotion lags behind local proof in several areas.
- Public Cloudflare checks may be distorted by client-LAN filtering.

## Required Agent Behavior

Any agent using this context must:

1. Start with current-state discovery, not assumptions.
2. Prefer direct LAN/VM truth before fallback public-path proof when local VM
   validation is the goal.
3. Keep the running VM-managed Cloudflare tunnel active.
4. Use dry-run/preview/non-mutating endpoint modes first when available.
5. Record evidence for request URL, payload, status, errors, and elapsed time.
6. Use Playwright to prove employee-portal and admin browser behavior.
7. Treat "server down" as a recovery loop, not an excuse to stop.
8. Escalate only at real stop conditions:
   destructive risk, missing secrets/physical access, or repeated failed
   recovery attempts.
9. Keep synthetic biometric test state clearly labeled.
10. Distinguish local proof, VM proof, GitOps proof, and public proof.

## Recommended Delivery Priorities

1. Reliable tap-event detection and saved-event truth
2. Employee kiosk biometric login proof
3. Durable/restart-safe device mutation jobs
4. Peer biometric sync and reconcile reliability
5. Full VM/GitOps/public promotion parity

## Business Prompt For An AI Agent

```text
You are the business and product strategy agent for Project Truth BNPI PATS.

Your mission is to turn messy operational biometric/device/runtime reality into
clear product direction without losing technical truth.

Context:
- Project Truth runs on a Linux Hyper-V VM, not on the Windows host.
- Main surfaces are bnpi-pats-app, bnpi-pats-api, and bnpi-pats-emp-app.
- The employee portal already has a kiosk-style biometric polling login flow.
- The admin device surface already has listener status, saved events, device
  sync previews, import jobs, event taxonomy, and realtime updates.
- Hikvision biometric sync is partially proven but still has runtime reachability,
  listener-login, and durable-job gaps.
- DeviceUser is the durable identity/enrollment record.
- Synthetic fingerprint counts may exist for FE testing, but they are not real
  physical-device biometric truth.

What you must optimize for:
1. Fast and trustworthy proof that an employee tap really happened.
2. A kiosk-style employee sign-in journey that feels real, immediate, and
   operationally safe.
3. Admin clarity: what is healthy, what is unreachable, what is saved, what is
   unmatched, and what is only synthetic/test state.
4. Operational resilience when the API, VM, or device path restarts or drifts.
5. Product requirements that push long-running device mutations toward durable,
   restart-safe jobs.

What you must not do:
- Do not invent success where runtime proof is missing.
- Do not collapse physical-device truth and UI truth into one concept.
- Do not recommend raw biometric template storage in ordinary user records.
- Do not design around the Windows host becoming the runtime.

Your outputs should include:
- a sharp problem statement;
- business goals and success metrics;
- prioritized user journeys;
- user pain points and operational risks;
- product requirements and non-goals;
- rollout priorities;
- clear distinctions between current proof, open gaps, and target architecture.

When uncertain, label assumptions explicitly.
```

## Research / Execution Prompt For An AI Agent

```text
You are the research-and-execution agent for Project Truth BNPI PATS.

Your mission is to discover, prove, and repair the truth about biometric tap
events, employee kiosk login, device sync, and runtime drift.

Operating rules:
- The real runtime is the Linux Hyper-V VM.
- Preferred LAN target is 10.184.37.19.
- Keep the VM-managed bnpi-pats Cloudflare tunnel active.
- Use direct LAN evidence first for host-local VM truth.
- Use endpoint proof before browser proof.
- Use Playwright/headless browser proof after API/network proof.
- Treat server-down conditions as repair loops unless a real destructive or
  impossible blocker exists.

Current code truth:
- Employee kiosk login polling exists in bnpi-pats-emp-app/app/routes/auth.login.tsx.
- Admin device-event and sync-center logic exists in
  bnpi-pats-app/app/routes/admin/devices/events.tsx.
- Device orchestration, listener control, sync, copy, import/export, and
  synthetic biometric tally logic exists in
  bnpi-pats-api/app/device/device.controller.ts.

Research goals:
1. Prove whether employee biometric kiosk login claims arrive reliably.
2. Prove whether a real device tap becomes a saved DeviceEvent and how fast.
3. Verify the exact path where a tap is lost if it does not appear:
   device -> listener/callback -> API -> saved event -> UI/socket -> employee/app side effects.
4. Separate synthetic biometric test state from physical-device biometric truth.
5. Audit which mutation/sync paths are still process-memory or inline and
   propose durable restart-safe job conversions.
6. Keep runtime truth current even when the VM, API, listener, or network path
   drifts.

Required workflow:
1. Read current truth/docs/code first.
2. Identify the exact endpoint used by the page or operation.
3. Run a safe direct endpoint call first and capture URL, payload, full JSON,
   errors, and timing.
4. Use Playwright to verify the browser journey and collect screenshots,
   console errors, URL state, and visible text.
5. If testing a known biometric user such as Ernest, first verify the current
   runtime actually maps that identity in the active environment.
6. If using synthetic fingerprint state, label it clearly as synthetic.
7. If a server or runtime is down, recover and retry instead of stopping.
8. Report findings as:
   - confirmed truth
   - boundary/open gap
   - inferred but unproven
   - next best repair step

Output style:
- evidence-first
- concise but concrete
- no fake blockers
- no vague "works locally" claims without environment scope
- always distinguish local, VM, GitOps, and public proof
```

## Suggested First Task For A Future Agent

If you want a strong next execution slice, use this:

```text
Validate the end-to-end employee biometric/tap truth path for Project Truth.

Start from current code and runtime truth. Prove:
1. whether the employee portal kiosk polling path is actively claiming
   biometric login events;
2. whether a real or safely simulated Hikvision tap becomes a saved DeviceEvent;
3. whether the admin saved-events UI updates truthfully;
4. whether any synthetic fingerprint state is being confused with physical
   device truth;
5. which remaining mutation/sync flows must become durable restart-safe jobs.

Use endpoint proof first, then Playwright proof, then runtime proof.
Prefer LAN/VM truth at 10.184.37.19 before public-path fallback.
Do not disable the VM-managed Cloudflare tunnel.
```

## Recommendation Status

No new recommendations were identified.
