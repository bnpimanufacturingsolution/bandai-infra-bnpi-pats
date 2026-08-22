# Recruitment UX Review

Status: ACTIVE_DRAFT
Last reviewed: 2026-06-08

This document preserves the senior-level recruitment journey review and the deferred UI/UX backlog so a later design pass can continue without re-discovery.

## Current Journey

1. Admin or HR configures workforce recruitment settings, coverage rules, and policy behavior.
2. A department manager creates a `DEPARTMENT_JOB_REQUISITION` from the Requests Hub.
3. HR manages job openings and applicant movement in the Recruitment workspace.
4. Public applicants browse `/jobs`, review a job detail modal, and continue to `/jobs/:jobId/apply`.
5. HR advances candidates through screening, interview, offer, onboarding-ready, and hired states.

## Senior Judgment

- The domain workflow is strong and realistic.
- The current UX is operational, but it still feels like separate screens instead of one guided journey.
- The biggest usability gap is discoverability for occasional users, especially around requisition entry and lifecycle visibility.
- The strongest current surface is the HR recruitment board.
- The weakest current surface is requisition creation, which is still hidden inside the Requests Hub.

## Deferred UX Backlog

### Must Fix

- Add a visible lifecycle frame across recruitment surfaces so users can understand `settings -> requisition -> job opening -> applicant -> offer -> hire`.
- Add a clear `New requisition` entry point inside the recruitment workspace, while keeping the Requests Hub path available.
- Split the requisition form into `Basic` and `Advanced` sections so the headcount decision is not buried among optional metadata.
- Unify product terminology across the journey: `policy`, `requisition`, `job opening`, `applicant`, `candidate`, `hire`, and `employee`.

### Should Fix

- Convert the public application form into a multi-step flow with progress, section summaries, and a final review state before submit.
- Reduce modal and drawer stacking in the HR recruitment board by moving more detail into persistent panels or tabs.
- Add clearer contextual guidance for the handoff from `ONBOARDING_READY` to employee creation so HR can see what is blocked.
- Surface policy context more consistently in job and applicant views, not only inside isolated forms.

### Nice To Have

- Add recruiter-facing audit breadcrumbs so users can quickly understand who moved a candidate and why.
- Add applicant-side reassurance cues such as expected response timing, document tips, and concise preparation notes.
- Add optional draft-saving for longer public application sessions.

## Acceptance Direction For The Later UX Pass

- A first-time manager should be able to find requisition creation without knowing the Requests Hub structure in advance.
- A first-time HR operator should be able to explain the lifecycle by looking at the UI, not by reading docs.
- A public applicant should understand progress, effort remaining, and required information at each step.
- Policy warnings should remain informative without feeling like silent blockers.
