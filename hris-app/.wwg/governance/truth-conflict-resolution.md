# Truth Conflict Resolution

## Purpose

Define how WWG resolves conflicts between code, runtime behavior, docs, generated context, public surfaces, and governance artifacts.

## Rule

When code/runtime behavior and docs disagree, do not silently choose one. Classify the conflict, establish evidence, and resolve through the appropriate canonical artifact.

For generated projects, also classify whether the conflict belongs to upstream template defaults, local project truth, generated context, or implementation behavior.

## Conflict Table

| Situation | WWG Rule |
|---|---|
| Runtime/code was intentionally changed | Update canonical docs immediately |
| Runtime/code is accidentally wrong | Fix implementation to match canonical docs |
| Docs are stale but behavior is correct | Update docs and note evidence |
| Docs are correct but behavior drifted | Fix code and add regression coverage |
| Both are ambiguous | Record contradiction and require decision |
| High-risk domain | Use approval-gated mode before changing truth |

## Conflict Workflow

1. Identify the conflicting claims.
2. Establish evidence level for each claim.
3. Identify the canonical family affected.
4. Check the maintenance matrix.
5. Decide whether code or docs should change.
6. Apply the smallest safe correction.
7. Update canonical artifacts.
8. Update generated context if needed.
9. Add validation or regression guardrail if drift could recur.
10. Report the decision and evidence.

## Output Format

Report conflicting claims, evidence level, canonical family, decision, changes made, validation, guardrail updates, and approval status.

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
