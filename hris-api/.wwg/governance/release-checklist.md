# Release Checklist

## Purpose

Define a governance artifact for WWG projects.

## How to Use

Fill this file from requirements, architecture, domain rules, and selected profiles.

## Rules

Checks must be observable, evidence-based, and tied to approval expectations.

## Release Signoff Checks

- Public-surface review completed for user-facing changes.
- Regression guardrail catalog reviewed for active guardrails in affected areas.
- Signoff learnings reviewed for repeated misses.
- Generated sections updated only within matching markers.
- Draft public copy remains unpublished unless approved.
- Public discovery review completed for public route, metadata, sitemap, robots.txt, llms.txt, or structured data changes.
- Operational readiness reviewed for runtime/infrastructure changes.
- Evidence standards applied to release risks and recommendations.

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
