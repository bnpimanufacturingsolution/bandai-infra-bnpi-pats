# Operational Readiness Review

## Purpose

Review whether runtime, monitoring, deployment, and support practices are ready for production-grade operation.

## How to Use

Use before releases, after incidents, during runtime changes, and when production monitoring identifies gaps.

## Rules

- Runtime configuration must be explicit, validated, and documented.
- Monitoring evidence must be separated by evidence level.
- Read-only audits must not silently become execution.
- Runtime suspects remain hypotheses until confirmed.
- Runtime context should be updated when deployment, config, worker/queue/cache, or operational truth changes.

## Checklist

- Deployment model reviewed.
- Runtime Truth declarations reviewed.
- Config and secrets validated.
- Database and migrations validated.
- Worker/queue/cache behavior validated if touched.
- Monitoring report available or not required.
- Runbooks current.
- Known issues reviewed.
- Regression guardrails reviewed.
- Approval gates identified.

## Output Format

Report readiness verdict, evidence level, blockers, approval gates, and follow-up workflows.

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
