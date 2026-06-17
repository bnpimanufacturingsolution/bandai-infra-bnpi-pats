# Quality Gates

## Purpose

Define a governance artifact for WWG projects.

## How to Use

Fill this file from requirements, architecture, domain rules, and selected profiles.

## Rules

Checks must be observable, evidence-based, and tied to approval expectations.

## Product Invariant Gates

- Product invariants reviewed for this change.
- No implementation violates declared invariants.
- Conflicts with invariants are documented before implementation proceeds.

## Runtime Truth Gates

- Authoritative systems remain authoritative.
- Derived systems, caches, queues, pub/sub, and projections are not used as hidden sources of truth.
- Persistence-critical flows remain attached to declared authoritative storage.
- Audit history source is documented for changes that affect reviewability.

## Execution and Learning Gates

- Natural prompts were classified and routed.
- Execution mode was recorded.
- Truth Alignment Status was considered alongside any drift score or drift status.
- Requirement evolution was documented when accepted.
- Undocumented requirement changes, documentation lag, implementation drift, regression/quality drift, and terminology drift were surfaced for follow-up.
- Public/user-facing surfaces were reviewed for meaningful behavior changes.
- Regression guardrail catalog was updated when a missed bug, incident, or sign-off gap was discovered.
- Generated sections were preserved when automation touched generated content.
- Runtime/infrastructure impact reviewed when deployment, config, secrets, database, workers, queues, caches, or external runtime behavior changed.
- Public discovery reviewed when public routes, metadata, sitemap, robots.txt, llms.txt, structured data, or index/noindex policy changed.
- Evidence level recorded for root-cause claims and operational recommendations.
- Artifact type and canonical family identified for meaningful maintenance changes.
- Truth conflicts resolved through canonical artifacts instead of silently choosing docs or code.
- Enforcement level recorded for meaningful governance checks.
- Template-vs-instance impact reviewed for changes in the WWG template repository.
- Project Truth was not silently overwritten.
- Governance changes were merged or added through clear generated sections instead of overwriting existing meaningful guidance.
- Natural-language next step appears before CLI backup commands in completion or report output when governance alignment matters.

## Meaningful Verification Gates

Meaningful implementation changes must include meaningful verification by default.

Meaningful changes include behavior, business rules, state management, parsing, payments, auth/security, persistence, workflows, prior bug fixes, and user-visible feature behavior.

For these changes, the close-out evidence should include one of:

- new or updated tests
- an updated regression test
- an explicit documented reason why tests were not added

This is standard WWG practice and should not depend on the user explicitly requesting tests.

Use `test-enforcement.md` to classify the test obligation:

- No Test Required for copy-only, comments, cosmetic-only styling, or documentation-only changes.
- Test Recommended for minor UI behavior, small helper changes, or low-risk state changes.
- Test Required for new feature behavior, state management, parsing, validation, business rules, persistence, API/client seams, payment/auth/security/workflow behavior, and bug fixes.
- Regression Test Required for previously fixed bugs, reintroduced bugs, debugging edge cases, high-risk failures, and issues that should never return.

Before close-out, agents must identify behavior changed, unit tests added/updated, regression tests added/updated, manual verification, test command run, result, and the reason if no tests were added.

Weak tests should be flagged when they only check file existence, static copy, structure, or build smoke after behavior changed.

Non-software changes should use the right verification form. Business, process, policy, operations, legal/trust, or organizational changes may need decision logs, manual verification, approval checklists, sign-off notes, or Project Truth updates instead of software unit tests. Copy-only changes should not be over-governed.

High-risk changes need stronger verification and planning before close-out. High-risk areas include payment, auth, authorization, security, persistence, database or user data, production deployment, destructive or irreversible actions, and regulated or compliance-sensitive behavior.

## Truth Alignment Detection Gates

- Truth Alignment detector output reviewed when a report or completion banner is generated.
- Detector reasons are specific and actionable.
- Drift Score is preserved and interpreted alongside Truth Alignment Status.
- Recommended decision path is included when status is not GREEN: Accept as New Truth, Reconcile to Existing Truth, Investigate / Plan First, or Regression / Quality Repair.
- Natural-language next step appears before CLI backup commands.
- Truth Alignment includes Execution Gate guidance. RED is reserved for meaningful risk: Project Truth contradiction, regression, high-risk undocumented changes, weakened verification, destructive behavior, or canonical truth overwrite attempts.
- Green outputs should not over-warn. Yellow outputs should guide review or sync. Orange outputs must clearly say pause or plan. Red outputs must clearly say stop.

## Regression / Quality Drift Gates

- Meaningful behavior changes without test changes are reported.
- Previously documented fixed issues that appear again are reported.
- Removed or weakened tests are treated as quality drift.
- Missing Test Recommended coverage maps to YELLOW / warn.
- Missing Test Required coverage maps to ORANGE / pause_for_plan.
- Missing Regression Test Required coverage maps to RED / stop.
- Missing lint, typecheck, check, or test scripts are surfaced when project standards require them.
- Regression repair adds or updates meaningful tests, documents the issue, and updates governance/reporting when a quality gate was missing.

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
