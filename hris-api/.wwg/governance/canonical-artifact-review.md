# Canonical Artifact Review

## Purpose

Explain how to identify, review, and protect canonical artifacts in WWG projects.

## How to Use

Before updating derived context, prompts, skills, or reports, identify which artifact owns the truth.

## Rules

- Canonical artifacts are the primary homes for project truth.
- Do not duplicate truth across multiple files when a link or summary is enough.
- If two canonical artifacts conflict, record the unresolved conflict before choosing a side.
- Derived files should cite or clearly point back to canonical files when practical.
- Distinguish current canonical truth from generated context, reference history, temporary notes, public surfaces, and machine-readable catalogs.

## Canonical Artifact Examples

- Project identity: `02-project`
- Requirements: `03-requirements`
- Decisions: `04-decisions`
- Runtime Truth: `05-architecture/system-overview.md` and `05-architecture/data-model.md`
- Domain rules and product invariants: `06-domain/rules.md`
- Design source of truth: `07-ux`
- Operations and incidents: `08-operations`
- Agent context inputs: `09-agent-context`
- Reusable skills: `10-skills` and workspace skills
- Maintenance policy: `12-maintenance`
- Governance gates: `.wwg/governance`
- Public surface review: `.wwg/governance/public-surface-review.md`
- Regression guardrails: `.wwg/governance/regression-guardrail-catalog.md`
- Generated section policy: `.wwg/workspace/generation-policy.md`
- Public discovery review: `.wwg/governance/public-discovery-review.md`
- Operational readiness: `.wwg/governance/operational-readiness-review.md`
- Evidence standards: `.wwg/governance/evidence-standards.md`
- Canonical context policy: `.wwg/wiki/09-agent-context/canonical-context-policy.md`
- Truth conflict resolution: `.wwg/governance/truth-conflict-resolution.md`
- Enforcement levels: `.wwg/governance/enforcement-levels.md`

## Artifact Metadata

```yaml
wwg:
  artifact_type: canonical-update-on-change
  owner_layer: wiki
  canonical_family: architecture/runtime
  update_policy: update_when_behavior_changes
  generated: false
  profile_scope:
    - base
  related_artifacts:
    - .wwg/wiki/12-maintenance/context-maintenance-matrix.md
```

Valid artifact types: `canonical-update-on-change`, `generated-from-wiki`, `reference-history`, `temporary-working`, `public-surface`, `machine-readable-catalog`.

Valid update policies: `update_when_behavior_changes`, `regenerate_from_wiki`, `append_only`, `manual_review_only`, `do_not_update_unless_promoted`, `approval_required_before_publish`.

Upstream template assets and local project assets are different canonical scopes. Review local project truth before importing upstream template defaults into established project files.

## Generated Section Preservation

Automation may update only content inside matching generated markers:

```md
<!-- WWG_GENERATED:<SECTION_NAME>:START -->
Generated content here.
<!-- WWG_GENERATED:<SECTION_NAME>:END -->
```

Human-written content outside generated markers must be preserved. If a generated section cannot be safely updated, report the issue instead of rewriting the whole file.

## Output Format

Review notes should include canonical artifacts checked, duplicate truth found, unresolved conflicts, and updates made.

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
