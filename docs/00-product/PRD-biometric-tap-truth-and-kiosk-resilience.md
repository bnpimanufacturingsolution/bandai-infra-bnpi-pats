# PRD - Biometric Tap Truth and Kiosk Resilience

## Product Vision

Project Truth should let an operator prove biometric truth quickly and safely:
an employee taps, the system shows where that signal went, the kiosk login flow
can claim it when appropriate, and long-running device operations do not become
opaque or fragile when the runtime drifts.

## Product Outcome

When an admin or implementer investigates biometric behavior, the product
should support one clear chain of truth:

1. device action or biometric claim trigger;
2. listener/callback/runtime ingestion;
3. API classification and persistence;
4. saved event or biometric login claim availability;
5. admin or employee-facing UI update;
6. clear failure classification when any link breaks.

## Personas

- **HRIS admin** - reviews saved events, device status, employee matching, and
  sync results.
- **Onsite implementer** - tests live taps, device reachability, and kiosk
  login behavior while devices are being deployed or repaired.
- **Operations engineer** - verifies runtime state, mutation durability, and
  restart-safe behavior.
- **Employee** - uses the kiosk-like employee portal and expects quick,
  reliable biometric sign-in.

## User Stories

- As an admin, I can prove whether a real biometric tap became a saved HRIS
  event.
- As an admin, I can tell whether failure happened at the device, listener,
  API, saved-event, or UI layer.
- As an implementer, I can test kiosk biometric login without confusing
  synthetic FE test state with real device truth.
- As an operator, I can recover from server/API/runtime restarts without losing
  visibility into long-running sync or mutation work.
- As an employee, I can use kiosk biometric sign-in with manual login fallback.

## Functional Requirements

### FR-01 Kiosk biometric claim flow

The employee portal must support a kiosk biometric login mode that polls for
claimable biometric authentication while the page is visible and no manual
login is active. Manual login remains available as fallback.

### FR-02 Evidence-first tap investigation

The product workflow for biometric/tap validation must prioritize:

1. direct endpoint proof;
2. browser/Playwright proof;
3. runtime/VM/tunnel proof.

Relevant admin and operator documentation should reflect that order.

### FR-03 Saved-event truth model

The admin device-events surface must show enough detail to classify what
happened:

- event category;
- event action;
- runtime path/source;
- HRIS result;
- employee match state;
- observed vs configured device identity when relevant.

### FR-04 Listener/runtime status truth

Admin surfaces must distinguish at least:

- listener active;
- listener unreachable;
- device login failed;
- no armed devices;
- source unavailable;
- event received but not matched;
- event saved successfully.

### FR-05 Synthetic biometric boundary

If the product uses synthetic fingerprint or face tallies for FE testing, those
values must be explicitly distinct from real physical-device biometric truth in
API responses and UI language.

### FR-06 Durable mutation-job direction

Long-running device operations should move toward persisted job semantics with:

- job ID;
- current status;
- per-target or per-device progress;
- partial-success retention;
- resumable or retryable failure handling where practical;
- post-restart visibility.

Priority operations include:

- device log import;
- device-user sync;
- peer biometric copy/converge;
- reconcile/merge flows;
- large import/export execute paths.

### FR-07 Environment-scoped truth

All product evidence and planning artifacts must distinguish:

- local host/hot-reload proof;
- VM/LAN runtime proof;
- GitOps/K3s proof;
- public Cloudflare proof.

### FR-08 Safe testing workflow

Where preview or dry-run is available, the product should expose or preserve it
before destructive mutation. If a safe preview path does not exist for a
high-risk operation, the gap should be called out rather than hidden.

## Non-Functional Requirements

- Reliability: the system should preserve classification and partial results
  even when one peer or device path fails.
- Performance: investigative flows should surface enough proof quickly to avoid
  repeated blind retries.
- Security: raw biometric templates must remain protected and must not be
  normalized into ordinary user data without an explicit custody design.
- Accessibility: status, progress, and failure state should be readable and
  visible in admin and kiosk flows.
- Operational honesty: no "works" claim should be made without naming the
  proven environment.

## Acceptance Criteria

1. A future agent or operator can use project docs to investigate biometric tap
   truth without guessing the first validation step.
2. The employee kiosk journey is documented as a real polling-based biometric
   claim path with manual fallback.
3. The product requirements clearly distinguish synthetic biometric test state
   from physical-device truth.
4. The product direction explicitly prioritizes durable long-running mutation
   jobs.
5. Planning artifacts distinguish local, VM, GitOps, and public proof scopes.

## Current Product Evidence

- Employee kiosk biometric polling exists in
  `hris-emp-app/app/routes/auth.login.tsx`.
- Admin saved-event, listener, and sync-center truth surfaces exist in
  `hris-app/app/routes/admin/devices/events.tsx`.
- Device orchestration, listener control, sync, import/export, copy, and
  synthetic biometric helpers exist in
  `hris-api/app/device/device.controller.ts`.
- Current broader context and AI-agent operating brief exists in
  `docs/PROJECT_TRUTH_AI_AGENT_CONTEXT_20260714.md`.

## Open Questions

- Which long-running device mutations should be promoted first into durable
  restart-safe job infrastructure?
- Which biometric/kiosk validations can be fully automated in Playwright, and
  which will always require live operator/device participation?
- What is the approved long-term custody model for any real biometric template
  export/import workflow?
- Which VM/GitOps/public slices should be promoted first after local truth is
  proven?

## Deployment Boundary

This PRD sets product direction and validation expectations. It does not by
itself prove production rollout. Runtime truth still requires
environment-scoped evidence.
