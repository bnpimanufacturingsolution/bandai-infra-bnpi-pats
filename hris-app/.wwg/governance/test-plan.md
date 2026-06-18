# Test Plan

## Purpose

Define a governance artifact for WWG projects.

## How to Use

Fill this file from requirements, architecture, domain rules, and selected profiles.

## Rules

Checks must be observable, evidence-based, and tied to approval expectations.

## Regression Guardrails

Regression tests should reference known misses and guardrails where possible. When a bug or sign-off gap is discovered, update the regression guardrail catalog with symptom, missed-by reason, future guardrail, evidence paths, and required validation.

Not every regression updates product truth. Some regressions update sign-off workflow truth, testing truth, or operational guardrails only.

## Meaningful Change Verification

Meaningful implementation changes should include meaningful verification by default.

Meaningful changes include behavior, business rules, state management, parsing, payments, auth/security, persistence, workflows, prior bug fixes, and user-visible feature behavior.

For these changes, WWG expects one of:

- new or updated tests
- an updated regression test
- an explicit documented reason why tests were not added

Missing required verification is Regression / Quality Drift under Truth Alignment Status.

## Test Plan Required

For meaningful implementation tasks, task outputs and reports should include:

```md
## Test Plan

- Behavior changed:
- Unit tests added/updated:
- Regression tests added/updated:
- Manual verification:
- Test command run:
- Result:
- If no tests were added, reason:
```

Use `test-enforcement.md` to classify the obligation as No Test Required, Test Recommended, Test Required, or Regression Test Required.

Weak or superficial tests should be called out when behavior changed but tests only check file existence, static copy, static structure, or build smoke.

`wwg regression-check --target .` may be used as a report-first helper for detecting meaningful behavior changes without test changes, previously fixed issues that appear again, removed or weakened tests, missing quality gates, and missing lint/typecheck/check scripts when standards require them.

`wwg test-check --target .` may be used as a report-first helper for detecting changed behavior areas, expected test types, tests found, missing tests, weak tests, and regression coverage gaps.

## Runtime Validation

Runtime-related tests or checks should cover config present at runtime, secrets loaded correctly, database connection, migration/schema state, worker/queue flow if touched, cache/projection consistency, startup paths, request-time paths, and normal backend/API flows.

## Evidence Standard

Test reports should distinguish confirmed failures from likely issues, hypotheses, and unknowns.

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
