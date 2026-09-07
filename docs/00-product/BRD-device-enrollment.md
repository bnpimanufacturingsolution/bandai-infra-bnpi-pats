# BRD - Admin Device Enrollment and Reconciliation

## Executive Summary

Project Truth needs one safe admin journey for enrolling and reconciling device
users across Hikvision/ZKTeco terminals and HRIS employees. The experience
must turn a technically complex operation into an auditable task: inspect
source devices, preview differences, resolve identity/conflict decisions, apply
only approved changes, and verify the result.

## Business Problem

The current capability is distributed across device management, sync,
user-linking, SDK merge, and enrollment actions. That makes it difficult for an
administrator to answer: what will change, which records are ambiguous, what is
safe to apply, and whether the physical device and HRIS now agree.

## Goals and KPIs

- Reduce successful enrollment/reconciliation to one guided workflow.
- 100% of writes preceded by a visible preview and explicit confirmation.
- Zero silent overwrites of employee links or biometric metadata.
- Show every source, target, skipped, unresolved, failed, and verified count.
- Measure: completion rate, unresolved-conflict rate, failed-write rate,
  median time to complete, and post-apply verification pass rate.

## Target Users

Primary: HRIS administrator or device administrator, usually working under time
pressure after a new hire, transfer, terminal replacement, or sync incident.

Secondary: support/operations engineer reviewing sync history and evidence.

## Scope

In scope: device selection, health/capability preflight, user discovery, HRIS
matching, preview/dry-run, conflict resolution, link/unlink, enrollment to a
audit trail, and accessible responsive UI.
oy
Out of scope: raw fingerprint-template custody redesign, new vendor SDKs,
physical device credential recovery, production deployment, destructive
reset/erase flows, and replacing the existing callback persistence owner.

## Constraints and Risks

- `DeviceUser` is the durable device identity; it may optionally link to
  `Employee`.
- Existing compatibility fields and vendor-specific integrations must continue
  to work.
- Physical device availability and credentials are external dependencies.
- Some sync operations are long-running and must be modeled as jobs.
- Biometric data must not be exposed or overwritten without an approved
  custody design.
- VM/K3s/GitOps/public deployment proof is separate from local hot-reload
  proof.

## Milestones

1. UX contract and state model.
2. Read-only preflight and preview.
3. Review/resolve/apply workflow.
4. Verification and audit evidence.
5. LAN/VM/GitOps rollout proof.

## Decision

Adopt a task-oriented flow named **Device enrollment and reconciliation**. Keep
destructive device reset outside this flow and behind a separate high-risk
action surface.
