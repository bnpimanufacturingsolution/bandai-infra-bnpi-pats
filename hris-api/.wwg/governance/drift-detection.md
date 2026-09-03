# Drift Detection

## Purpose

Define a governance artifact for WWG projects.

## How to Use

Fill this file from requirements, architecture, domain rules, and selected profiles.

## Rules

Checks must be observable, evidence-based, and tied to approval expectations.

Classify drift with Truth Alignment Status instead of treating all change as bad drift.

Use these categories:

- Requirement Evolution
- Undocumented Requirement Change
- Documentation Lag
- Implementation Drift
- Regression / Quality Drift
- Terminology Drift

Keep any existing drift score or `Drift status: NONE / LOW / MEDIUM / HIGH`, but interpret it alongside Truth Alignment Status.

First-pass detection should use explainable signals. Prefer specific reasons such as undocumented major scope, terminology shifts, missing verification for meaningful behavior changes, regression language, failed core checks, or high-risk behavior changes without matching Project Truth and governance updates.

Truth Alignment Status tells what changed. Execution Gate tells what the agent should do next:

- GREEN maps to `allow`.
- YELLOW maps to `warn`.
- ORANGE maps to `pause_for_plan` by default, with a documentation-lag-only exception that may remain `warn`.
- RED maps to `stop`.

Execution gates should not block normal requirement evolution. They should pause or stop only for meaningful risk.

STOP is reserved for meaningful risk: direct Project Truth contradiction, reintroduced regression, high-risk domain change without truth/governance update, removed or weakened verification, destructive or irreversible behavior, or wholesale canonical truth overwrite attempts.

PAUSE_FOR_PLAN is for major scope, architecture, terminology/persona, docs/report mismatch, quality-coverage gap, or conflicting requirement changes that need a planning/reconciliation review before implementation continues.

## Truth Sync Decisions

When YELLOW, ORANGE, or RED alignment appears, recommend one decision path before CLI commands:

- Accept as New Truth: promote intentional requirement evolution into Project Truth, terminology, requirements, decisions, current-task, and history docs.
- Reconcile to Existing Truth: correct recent docs, reports, copy, implementation, or tests back toward current Project Truth.
- Investigate / Plan First: generate a planning/reconciliation review for high-risk or large changes before canonical truth is rewritten.
- Regression / Quality Repair: add or update meaningful tests, document the issue, and repair implementation or quality gates.

Natural-language agent guidance should appear before backup CLI commands.

Practical backup commands:

- `npm run wwg -- align-check --target .`
- `npm run wwg -- update-truth --target .`
- `npm run wwg -- reconcile --target .`
- `npm run wwg -- plan --target .`
- `npm run wwg -- regression-check --target .`

## Output Format

Owners, checks, evidence, status, and follow-up actions.

## Generated Governance Context

<!-- WWG_GENERATED:SELECTED_PROFILE_GATES:START -->
- No profile-specific governance source found yet.
<!-- WWG_GENERATED:SELECTED_PROFILE_GATES:END -->

<!-- WWG_GENERATED:APPROVAL_GATED_AREAS:START -->
- Governance level: standard
- Production configuration, compliance-sensitive behavior, pricing, billing, permissions, security posture, legal/trust messaging, public customer notices, data deletion/migration, and irreversible operations require approval-gated handling.
- Selected profiles reviewed: None
<!-- WWG_GENERATED:APPROVAL_GATED_AREAS:END -->

<!-- WWG_GENERATED:EVIDENCE_STANDARDS_SUMMARY:START -->
Claims about root cause, fixes, operational state, drift, release readiness, and approval decisions must cite code paths, logs, tests, config, database state, deployment output, source artifacts, or reproduction evidence.
<!-- WWG_GENERATED:EVIDENCE_STANDARDS_SUMMARY:END -->
