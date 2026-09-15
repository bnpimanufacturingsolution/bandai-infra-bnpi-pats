# BRD - Biometric Tap Truth and Kiosk Resilience

## Executive Summary

Project Truth needs a business-approved product direction for biometric tap
truth, employee kiosk login, and restart-safe device operations. The current
system already has meaningful building blocks: an employee portal with
biometric-claim polling, an admin device-events and sync-center workflow, and
an API layer that can control listeners, process saved events, and run device
mutations. The business gap is not a lack of features in isolation. The gap is
that admins and implementers still struggle to answer one simple question with
confidence: did the employee really tap, and if not, exactly where did the
truth break?

## Business Problem

Project Truth currently operates across physical biometric devices, multiple web
surfaces, a Linux Hyper-V VM runtime, and mixed local/VM/GitOps/public
environments. This creates operational friction in several recurring cases:

- a physical tap occurs but the admin cannot quickly prove whether it reached
  the listener, the API, the saved-event ledger, or the UI;
- the employee portal presents a kiosk biometric journey, but end-to-end claim
  truth is not always validated with the same rigor as device-event truth;
- a long-running copy, sync, import, or reconcile operation is interrupted by
  API restart, VM drift, or a network outage;
- UI-visible synthetic biometric test state risks being confused with real
  device-side biometric enrollment;
- local proof exists, but VM/GitOps/public proof lags behind, causing planning
  and implementation confusion.

The result is slower incident resolution, lower operator confidence, and a
higher risk of repeated manual work or false product claims.

## Desired Business Outcome

Project Truth should become a system where:

- an employee tap can be traced from physical action to BNPI PATS result;
- the employee kiosk experience feels immediate and believable;
- admins can distinguish source unavailable, listener failure, unmatched
  identity, saved-only state, and true success;
- long-running device mutations are durable enough to survive expected runtime
  instability;
- implementation and testing agents work from current operational truth instead
  of screenshots, guesses, or stale environment assumptions.

## Goals and KPIs

- Reduce mean time to prove where a tap was lost.
- Make tap verification evidence-first: endpoint proof first, browser proof
  second, runtime proof third.
- Ensure kiosk biometric polling can be validated against real claim behavior.
- Convert high-value long-running device mutations toward durable, restart-safe
  jobs with history and resumable state.
- Keep synthetic fingerprint/face test state explicitly labeled and separate
  from physical-device truth.

Suggested KPIs:

- time to verify a reported tap event;
- percentage of tap investigations with captured endpoint and browser evidence;
- successful kiosk biometric claim rate in validated environments;
- percentage of long-running device mutations with durable job state;
- rate of partial success retained during multi-device operations;
- percentage of admin investigations that end with a classified failure mode
  instead of "unknown."

## Target Users

Primary:

- BNPI PATS admin / device admin
- onsite implementer validating devices during rollout or troubleshooting

Secondary:

- owner-operator engineering
- support/operations reviewers
- employees using kiosk-style biometric sign-in

## Scope

In scope:

- employee kiosk biometric-login truth and validation;
- admin device-event truth, saved-event visibility, and runtime-path clarity;
- direct endpoint testing patterns for tap-event investigation;
- durable job direction for sync, import, peer copy, reconcile, and similar
  long-running device mutations;
- clear product boundaries between real biometric truth and synthetic FE test
  state;
- local vs VM vs GitOps vs public proof language in product planning.

Out of scope:

- approving raw biometric template custody in general-purpose user models;
- declaring production truth from localhost evidence alone;
- redesigning the full Hyper-V/GitOps platform architecture;
- introducing Windows host runtime ownership;
- destructive biometric erase/reset behavior without explicit backup and
  recovery proof.

## Constraints and Risks

- The real runtime is the Linux Hyper-V VM, not the Windows host.
- The VM-managed Cloudflare tunnel is a protected runtime dependency and must
  stay active during normal work.
- Physical device reachability varies by network location and can block
  otherwise-correct application behavior.
- `DeviceUser` is the durable device identity/enrollment record.
- Some existing device operations still use inline or process-memory execution.
- Synthetic fingerprint/face tallies are useful for FE testing but can become
  dangerous if mislabeled.

## Strategic Direction

1. Treat biometric truth as a chain, not a single success flag.
2. Make evidence collection a first-class product requirement.
3. Keep the employee kiosk journey fast, visible, and credible.
4. Shift long-running device mutations toward durable job semantics.
5. Preserve honest environment boundaries: local, VM, GitOps, and public.

## Decision

Adopt biometric tap truth and kiosk resilience as a cross-surface product theme
that guides upcoming work across `bnpi-pats-emp-app`, `bnpi-pats-app`, and `bnpi-pats-api`.
Narrow feature slices such as copy-to-all performance or device enrollment
should continue, but they should now be evaluated against this larger business
objective.
