# Maintenance Review Checklist

## Purpose

Provide a practical governance checklist for reviewing whether a meaningful change synchronized WWG artifacts.

## How to Use

Use this checklist before commit, release, or handoff for meaningful feature, bug, architecture, UX, governance, or production changes.

## Rules

- Every meaningful change should have a classified change request.
- Design source-of-truth files must be reviewed for meaningful UI/UX changes.
- Known drift must be reported, not hidden.

## Checklist

- Change classification recorded.
- Task routing recorded.
- Execution mode recorded.
- Evidence level recorded for root-cause claims and recommendations.
- Artifact type recorded.
- Canonical family recorded.
- Truth conflict reviewed when code/runtime behavior and docs disagree.
- Generated context refreshed when canonical source truth changed.
- Wiki-first or code-investigation-first decision recorded.
- Canonical artifacts checked.
- Canonical artifacts updated where truth changed.
- Workspace context checked.
- Workspace context updated where agent instructions changed.
- Skills checked.
- Skills created, edited, merged, or deleted where reusable workflows changed.
- Governance checks run.
- Product invariants reviewed.
- Runtime Truth reviewed when source-of-truth or persistence behavior changed.
- Design source of truth reviewed for UI/UX changes.
- Public/user-facing surfaces reviewed.
- Runtime/infrastructure reviewed when deployment, config, secrets, database, workers, queues, caches, or external runtime behavior changed.
- Public discovery reviewed when public routes, metadata, sitemap, robots.txt, llms.txt, structured data, or index/noindex policy changed.
- Monitoring/operations reviewed for production health or operational readiness tasks.
- Approval gate identified for production, compliance, pricing, billing, permissions, security, trust, public notice, data deletion/migration, or irreversible operations.
- Enforcement level recorded.
- Regression guardrail catalog updated when a missed bug or sign-off gap was discovered.
- Generated sections preserved when automation touched generated content.
- Tests or validation performed.
- Report written.
- Commit readiness confirmed.

## Output Format

A maintenance review should list pass/fail/needs-follow-up for each checklist item.

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
