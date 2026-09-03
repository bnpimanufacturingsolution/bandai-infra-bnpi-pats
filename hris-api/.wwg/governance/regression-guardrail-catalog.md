# Regression Guardrail Catalog

## Purpose

Capture bugs, incidents, sign-off misses, and validation blind spots so future runs can catch them reliably.

## How to Use

Add an entry when a missed bug, incident, sign-off gap, repeated regression, or validation blind spot is discovered.

## Rules

- Not every regression updates product truth. Some regressions update sign-off workflow truth, testing truth, or operational guardrails only.
- Guardrails should be specific, repeatable, owned, and tied to validation.
- Markdown is the default guardrail catalog format. Add machine-readable representation only when the project has a clear consumer for it.
- Missed-by reasons and future guardrails should include evidence level when possible.

## Workflow

```txt
Incident / missed bug / sign-off gap discovered
  ->
Capture symptom
  ->
Capture missed-by reason
  ->
Define future guardrail
  ->
Record evidence paths
  ->
Update machine-readable catalog or catalog section
  ->
Refresh human workflow docs
  ->
Update wiki/context only if product truth changed
  ->
Run validation
```

## Entry Fields

| Field | Description |
|---|---|
| id | Stable guardrail identifier |
| date | Date discovered |
| area | Product, system, or workflow area |
| change_category | Related change category |
| symptom | What failed or was missed |
| missed_by_reason | Why existing checks missed it |
| future_guardrail | What should catch it next time |
| evidence_paths | Code, docs, logs, tests, or report paths |
| required_validation | Validation expected before signoff |
| owner | Responsible person or role |
| status | proposed, active, retired |

## Starter Catalog

| id | date | area | change_category | symptom | missed_by_reason | future_guardrail | evidence_paths | required_validation | owner | status |
|---|---|---|---|---|---|---|---|---|---|---|
| TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | proposed |

## Future Machine-Readable Shape

```yaml
guardrails:
  - id: TBD
    date: TBD
    area: TBD
    change_category: TBD
    symptom: TBD
    missed_by_reason: TBD
    future_guardrail: TBD
    evidence_paths: []
    required_validation: []
    owner: TBD
    status: proposed
```

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
