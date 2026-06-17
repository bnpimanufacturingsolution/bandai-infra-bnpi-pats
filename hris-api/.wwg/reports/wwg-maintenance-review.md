# WWG Maintenance Review

WWG STATUS: Critical Alignment Break
Truth Alignment Status: RED / Critical Alignment Break
EXECUTION GATE: Stop

## Plain-English Summary

A recent change appears to conflict with Project Truth, reintroduce a regression, weaken required verification, or touch a high-risk area without proper documentation.

Recommended decision:
Regression / Quality Repair

Why:
- A high-severity finding touches tests, regression, or a high-risk product area.
- Recent reports suggest documentation lag or stale context that may need Project Truth synchronization.
- Low-severity findings are present; review alongside Truth Alignment Status instead of treating them as harmful drift by default.

## Recommended Next Step

Stop implementation and resolve the truth conflict, regression, or verification gap before continuing.

## Recommended Natural Prompt

Tell the agent: "Treat this as a regression or quality gap. Add or update meaningful tests, document the issue, and repair the implementation."

## Backup CLI

wwg regression-check

## Summary

- Total findings: 58
- Critical: 0
- High: 1
- Medium: 0
- Low: 1
- Info: 56
- Safe-to-apply recommendations: 0
- Requires-user-confirmation: 55
- Archive candidates: 1
- Merge candidates: 4
- Rename candidates: 41
- Stale context candidates: 1
- Drift Score: 6/10
- Truth Alignment Status: Critical Alignment Break
- Interpretation: Drift Score 6/10 indicates a critical conflict, regression, missing verification, or high-risk change that needs planning/reconciliation before more implementation.

## Scope

- Target path: .
- Timestamp: 2026-05-16T15:59:17.522Z
- Command: `wwg maintain --target C:\Users\Renz\Documents\hris\hris-api`
- Dry-run status: true
- Safety: no deletes, moves, archives, renames, broad rewrites, or apply behavior were performed.

## Maintenance Model

WWG maintenance has two forms:

1. Continuous Maintenance Awareness: Agents must notice and record maintenance drift during normal truth-loop work.
2. Explicit Maintenance Review: `wwg maintain --target <path>` generates a structured report of maintenance findings and recommendations.

WWG is self-maintaining by doctrine, and maintainable by command.

The truth loop is continuous. The maintenance review is explicit.

## How to Use This Review

This review is advisory and non-destructive.

Use it to decide which recommendations should become:

- immediate edits
- future prompts
- archive/move/rename candidates
- user-confirmation items
- safe generated-section updates
- ignored findings

## Findings by Category

- fragmented-guidance: 4
- generated-artifact-freshness: 1
- naming-drift: 46
- principle-drift: 1
- regression-governance: 1
- report-clutter: 1
- report-policy-drift: 2
- truth-loop-drift: 2

## Truth Alignment Findings

- Level: RED / Critical Alignment Break
- Execution Gate: stop / Stop
- Drift Score: 6/10
- Interpretation: Drift Score 6/10 indicates a critical conflict, regression, missing verification, or high-risk change that needs planning/reconciliation before more implementation.

Category findings:
- Requirement Evolution: none detected.
- Undocumented Requirement Change: none detected.
- Documentation Lag:
  - Recent reports suggest documentation lag or stale context that may need Project Truth synchronization.
  - Low-severity findings are present; review alongside Truth Alignment Status instead of treating them as harmful drift by default.
- Implementation Drift: none detected.
- Regression / Quality Drift:
  - A high-severity finding touches tests, regression, or a high-risk product area.
- Terminology Drift: none detected.

## Continuous Maintenance Awareness Findings

These findings are signals agents should notice during ordinary truth-loop work and either fix when directly related or record for follow-up.

- INFO Potential fragmented guidance: readiness (.wwg/governance/infrastructure-readiness-checklist.md): This is a consolidation candidate only; template, dogfood, docs, and compatibility boundaries must be reviewed before merging guidance.
- INFO Potential fragmented guidance: maintenance (.wwg/governance/README.md): This is a consolidation candidate only; template, dogfood, docs, and compatibility boundaries must be reviewed before merging guidance.
- INFO Potential fragmented guidance: principles (.wwg/governance/recommendation-policy.md): This is a consolidation candidate only; template, dogfood, docs, and compatibility boundaries must be reviewed before merging guidance.
- INFO Potential fragmented guidance: handoff (.wwg/workspace/AGENTS.md): This is a consolidation candidate only; template, dogfood, docs, and compatibility boundaries must be reviewed before merging guidance.
- INFO Governed skill copy policy is current (.wwg/config/skill-manifest.yaml): Core/compatibility-core skill support remains available. Compatibility-domain skills are reference-only recommendations when relevant. Cleanup runs only through explicit --apply-skill-cleanup, and WWG does not activate runtime skills.
- INFO Principle-like guidance exists outside principles (.wwg/workspace/AGENTS.md): Promotion to active principles requires deliberate human or task-level confirmation.
- INFO Report policy drift: Run `wwg reports --target .` and review the Ambiguous / Needs Review section.
- INFO Ambiguous JSON reports need classification (.wwg/reports/adoption-regression-report.json): JSON reports are not promoted by default; classify as compatibility JSON, promoted JSON, routine generated JSON, transient JSON, or ambiguous JSON before committing policy decisions.
- INFO Changelog project memory is present (CHANGELOG.md): No changelog maintenance issue was detected by this review.
- INFO README front door is present (README.md): No README maintenance issue was detected by this review.

## Explicit Maintenance Review Findings

These findings were produced by the explicit `wwg maintain` review. They are recommendations, not automatic cleanup actions or audit/validate hard failures.

- fragmented-guidance: 4
- generated-artifact-freshness: 1
- naming-drift: 46
- principle-drift: 1
- regression-governance: 1
- report-clutter: 1
- report-policy-drift: 2
- truth-loop-drift: 2

## Recommended Create/Edit/Merge/Move/Rename/Archive/Ignore/Delete/Keep Actions

| Path | Category | Issue | Recommended Action | Risk | Can Apply Safely? | Needs User Confirmation? | Reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| .wwg/governance/regression-gaps.md | regression-governance | Critical or high regression governance gaps remain open | review | medium | no | yes | Review `.wwg/governance/regression-gaps.md` and convert safe report-first candidates into real tests or checklists as part of normal implementation work. |
| reports/archive/wwg-doctor-report.md | report-clutter | Root report archive candidates detected | archive-candidate | medium | no | yes | Report archive or movement must wait for an explicit user-approved cleanup workflow. |
| .wwg/governance/infrastructure-readiness-checklist.md | fragmented-guidance | Potential fragmented guidance: readiness | merge | medium | no | yes | This is a consolidation candidate only; template, dogfood, docs, and compatibility boundaries must be reviewed before merging guidance. |
| .wwg/governance/README.md | fragmented-guidance | Potential fragmented guidance: maintenance | merge | medium | no | yes | This is a consolidation candidate only; template, dogfood, docs, and compatibility boundaries must be reviewed before merging guidance. |
| .wwg/governance/recommendation-policy.md | fragmented-guidance | Potential fragmented guidance: principles | merge | medium | no | yes | This is a consolidation candidate only; template, dogfood, docs, and compatibility boundaries must be reviewed before merging guidance. |
| .wwg/workspace/AGENTS.md | fragmented-guidance | Potential fragmented guidance: handoff | merge | medium | no | yes | This is a consolidation candidate only; template, dogfood, docs, and compatibility boundaries must be reviewed before merging guidance. |
| .wwg/config/skill-manifest.yaml | generated-artifact-freshness | Governed skill copy policy is current | keep | low | no | no | Core/compatibility-core skill support remains available. Compatibility-domain skills are reference-only recommendations when relevant. Cleanup runs only through explicit --apply-skill-cleanup, and WWG does not activate runtime skills. |
| .wwg/reports/adoption-audit.md | naming-drift | Report filename has unclear purpose suffix | review | low | no | yes | Ambiguous report names should be indexed or renamed only through a deliberate report policy pass. |
| .wwg/reports/changelog-bump-recommendation.md | naming-drift | Report filename has unclear purpose suffix | review | low | no | yes | Ambiguous report names should be indexed or renamed only through a deliberate report policy pass. |
| .wwg/reports/changelog-preview.md | naming-drift | Report filename has unclear purpose suffix | review | low | no | yes | Ambiguous report names should be indexed or renamed only through a deliberate report policy pass. |
| .wwg/reports/context-skill-quality.md | naming-drift | Report filename has unclear purpose suffix | review | low | no | yes | Ambiguous report names should be indexed or renamed only through a deliberate report policy pass. |
| .wwg/reports/readme-validation.md | naming-drift | Report filename has unclear purpose suffix | review | low | no | yes | Ambiguous report names should be indexed or renamed only through a deliberate report policy pass. |
| docs/API_EMPLOYEE_IMPORT.md | naming-drift | WWG-owned file is not lowercase kebab-case | rename-candidate | medium | no | yes | Naming changes should be reviewed for links, registry references, generated markers, and historical context. |
| docs/APPROVAL_CHAIN_TEST_GUIDE.md | naming-drift | WWG-owned file is not lowercase kebab-case | rename-candidate | medium | no | yes | Naming changes should be reviewed for links, registry references, generated markers, and historical context. |
| docs/ATTENDANCE_DATE_FIX.md | naming-drift | WWG-owned file is not lowercase kebab-case | rename-candidate | medium | no | yes | Naming changes should be reviewed for links, registry references, generated markers, and historical context. |
| docs/ATTENDANCE_FLOW.md | naming-drift | WWG-owned file is not lowercase kebab-case | rename-candidate | medium | no | yes | Naming changes should be reviewed for links, registry references, generated markers, and historical context. |
| docs/COLUMN_CONCAT_GUIDE.md | naming-drift | WWG-owned file is not lowercase kebab-case | rename-candidate | medium | no | yes | Naming changes should be reviewed for links, registry references, generated markers, and historical context. |
| docs/CONSOLIDATED_SCHEMA.md | naming-drift | WWG-owned file is not lowercase kebab-case | rename-candidate | medium | no | yes | Naming changes should be reviewed for links, registry references, generated markers, and historical context. |
| docs/Create a New Service Guide.md | naming-drift | WWG-owned file is not lowercase kebab-case | rename-candidate | medium | no | yes | Naming changes should be reviewed for links, registry references, generated markers, and historical context. |
| docs/CRON_SETUP.md | naming-drift | WWG-owned file is not lowercase kebab-case | rename-candidate | medium | no | yes | Naming changes should be reviewed for links, registry references, generated markers, and historical context. |
| docs/DASHBOARD_SETUP.md | naming-drift | WWG-owned file is not lowercase kebab-case | rename-candidate | medium | no | yes | Naming changes should be reviewed for links, registry references, generated markers, and historical context. |
| docs/DEPLOYMENT_ARCHITECTURE.md | naming-drift | WWG-owned file is not lowercase kebab-case | rename-candidate | medium | no | yes | Naming changes should be reviewed for links, registry references, generated markers, and historical context. |
| docs/DOCKER_SETUP.md | naming-drift | WWG-owned file is not lowercase kebab-case | rename-candidate | medium | no | yes | Naming changes should be reviewed for links, registry references, generated markers, and historical context. |
| docs/EMPLOYEE_IMPORT_COLUMNS.md | naming-drift | WWG-owned file is not lowercase kebab-case | rename-candidate | medium | no | yes | Naming changes should be reviewed for links, registry references, generated markers, and historical context. |
| docs/EMPLOYEE_MIGRATION_REUSABLE_GUIDE.md | naming-drift | WWG-owned file is not lowercase kebab-case | rename-candidate | medium | no | yes | Naming changes should be reviewed for links, registry references, generated markers, and historical context. |
| docs/generated/endpoints/documentation.endpoints.json | naming-drift | WWG-owned file is not lowercase kebab-case | rename-candidate | medium | no | yes | Naming changes should be reviewed for links, registry references, generated markers, and historical context. |
| docs/generated/endpoints/template.endpoints.json | naming-drift | WWG-owned file is not lowercase kebab-case | rename-candidate | medium | no | yes | Naming changes should be reviewed for links, registry references, generated markers, and historical context. |
| docs/generated/postman.collection.json | naming-drift | WWG-owned file is not lowercase kebab-case | rename-candidate | medium | no | yes | Naming changes should be reviewed for links, registry references, generated markers, and historical context. |
| docs/JSON/HRIS-Boarding-Process-Test.postman_collection.json | naming-drift | WWG-owned file is not lowercase kebab-case | rename-candidate | medium | no | yes | Naming changes should be reviewed for links, registry references, generated markers, and historical context. |
| docs/LOCAL_TAILSCALE_DEPLOY.md | naming-drift | WWG-owned file is not lowercase kebab-case | rename-candidate | medium | no | yes | Naming changes should be reviewed for links, registry references, generated markers, and historical context. |
| docs/MD Files/MIGRATION_GUIDE.md | naming-drift | WWG-owned file is not lowercase kebab-case | rename-candidate | medium | no | yes | Naming changes should be reviewed for links, registry references, generated markers, and historical context. |
| docs/MD Files/REFACTORING_SUMMARY.md | naming-drift | WWG-owned file is not lowercase kebab-case | rename-candidate | medium | no | yes | Naming changes should be reviewed for links, registry references, generated markers, and historical context. |
| docs/MD Files/TAX_CALCULATOR_REFACTORING.md | naming-drift | WWG-owned file is not lowercase kebab-case | rename-candidate | medium | no | yes | Naming changes should be reviewed for links, registry references, generated markers, and historical context. |
| docs/MIGRATION_CSV_UPLOAD_TESTING.md | naming-drift | WWG-owned file is not lowercase kebab-case | rename-candidate | medium | no | yes | Naming changes should be reviewed for links, registry references, generated markers, and historical context. |
| docs/MIGRATION_GUIDE.md | naming-drift | WWG-owned file is not lowercase kebab-case | rename-candidate | medium | no | yes | Naming changes should be reviewed for links, registry references, generated markers, and historical context. |
| docs/MIGRATION_TO_SINGLE_TABLE.md | naming-drift | WWG-owned file is not lowercase kebab-case | rename-candidate | medium | no | yes | Naming changes should be reviewed for links, registry references, generated markers, and historical context. |
| docs/models/securitySchemes.yaml | naming-drift | WWG-owned file is not lowercase kebab-case | rename-candidate | medium | no | yes | Naming changes should be reviewed for links, registry references, generated markers, and historical context. |
| docs/openApiOptions.json | naming-drift | WWG-owned file is not lowercase kebab-case | rename-candidate | medium | no | yes | Naming changes should be reviewed for links, registry references, generated markers, and historical context. |
| docs/PAYROLL_CYCLE_RULES_CONFIG.md | naming-drift | WWG-owned file is not lowercase kebab-case | rename-candidate | medium | no | yes | Naming changes should be reviewed for links, registry references, generated markers, and historical context. |
| docs/PAYROLL_SCHEMA_DESIGN.md | naming-drift | WWG-owned file is not lowercase kebab-case | rename-candidate | medium | no | yes | Naming changes should be reviewed for links, registry references, generated markers, and historical context. |
| docs/POSTGRES_MIGRATION_HANDOFF_2026-05-16.md | naming-drift | WWG-owned file is not lowercase kebab-case | rename-candidate | medium | no | yes | Naming changes should be reviewed for links, registry references, generated markers, and historical context. |
| docs/POSTMAN_SETUP.md | naming-drift | WWG-owned file is not lowercase kebab-case | rename-candidate | medium | no | yes | Naming changes should be reviewed for links, registry references, generated markers, and historical context. |
| docs/PRISMA_MONGODB_TO_POSTGRES_PLAN.md | naming-drift | WWG-owned file is not lowercase kebab-case | rename-candidate | medium | no | yes | Naming changes should be reviewed for links, registry references, generated markers, and historical context. |
| docs/REDIS_SETUP.md | naming-drift | WWG-owned file is not lowercase kebab-case | rename-candidate | medium | no | yes | Naming changes should be reviewed for links, registry references, generated markers, and historical context. |
| docs/REQUEST_WORKFLOW_GUIDE.md | naming-drift | WWG-owned file is not lowercase kebab-case | rename-candidate | medium | no | yes | Naming changes should be reviewed for links, registry references, generated markers, and historical context. |
| docs/SCHEDULE_IMPORT_GUIDE.md | naming-drift | WWG-owned file is not lowercase kebab-case | rename-candidate | medium | no | yes | Naming changes should be reviewed for links, registry references, generated markers, and historical context. |
| docs/SECURITY_IMPLEMENTATION.md | naming-drift | WWG-owned file is not lowercase kebab-case | rename-candidate | medium | no | yes | Naming changes should be reviewed for links, registry references, generated markers, and historical context. |
| docs/SECURITY.md | naming-drift | WWG-owned file is not lowercase kebab-case | rename-candidate | medium | no | yes | Naming changes should be reviewed for links, registry references, generated markers, and historical context. |
| docs/SINGLE_VS_SEPARATE_TABLES.md | naming-drift | WWG-owned file is not lowercase kebab-case | rename-candidate | medium | no | yes | Naming changes should be reviewed for links, registry references, generated markers, and historical context. |
| docs/STATUS_API.md | naming-drift | WWG-owned file is not lowercase kebab-case | rename-candidate | medium | no | yes | Naming changes should be reviewed for links, registry references, generated markers, and historical context. |
| docs/TIMESHEET_EDIT_PERMISSION_UI_OPTIONS.md | naming-drift | WWG-owned file is not lowercase kebab-case | rename-candidate | medium | no | yes | Naming changes should be reviewed for links, registry references, generated markers, and historical context. |
| docs/TIMESHEET_EDIT_PERMISSION_WORKFLOW_PRD.md | naming-drift | WWG-owned file is not lowercase kebab-case | rename-candidate | medium | no | yes | Naming changes should be reviewed for links, registry references, generated markers, and historical context. |
| docs/TIMESHEET_UNIFIED_REQUEST_WORKFLOW_PLAN.md | naming-drift | WWG-owned file is not lowercase kebab-case | rename-candidate | medium | no | yes | Naming changes should be reviewed for links, registry references, generated markers, and historical context. |
| .wwg/workspace/AGENTS.md | principle-drift | Principle-like guidance exists outside principles | promote | medium | no | yes | Promotion to active principles requires deliberate human or task-level confirmation. |
|  | report-policy-drift | Report policy drift | review | low | no | yes | Run `wwg reports --target .` and review the Ambiguous / Needs Review section. |
| .wwg/reports/adoption-regression-report.json | report-policy-drift | Ambiguous JSON reports need classification | review | low | no | yes | JSON reports are not promoted by default; classify as compatibility JSON, promoted JSON, routine generated JSON, transient JSON, or ambiguous JSON before committing policy decisions. |
| CHANGELOG.md | truth-loop-drift | Changelog project memory is present | keep | low | no | no | No changelog maintenance issue was detected by this review. |
| README.md | truth-loop-drift | README front door is present | keep | low | no | no | No README maintenance issue was detected by this review. |


## Agent-Brand Drift

- None detected.

Allowlisted references:

- None.

## Stable Docs Phase Pollution

- None detected.

Allowlisted historical references:

- None.

## Report Policy Review

- LOW Root report archive candidates detected (reports/archive/wwg-doctor-report.md): Report archive or movement must wait for an explicit user-approved cleanup workflow.
- INFO Report policy drift: Run `wwg reports --target .` and review the Ambiguous / Needs Review section.
- INFO Ambiguous JSON reports need classification (.wwg/reports/adoption-regression-report.json): JSON reports are not promoted by default; classify as compatibility JSON, promoted JSON, routine generated JSON, transient JSON, or ambiguous JSON before committing policy decisions.

## Naming Drift

- INFO Report filename has unclear purpose suffix (.wwg/reports/adoption-audit.md): Ambiguous report names should be indexed or renamed only through a deliberate report policy pass.
- INFO Report filename has unclear purpose suffix (.wwg/reports/changelog-bump-recommendation.md): Ambiguous report names should be indexed or renamed only through a deliberate report policy pass.
- INFO Report filename has unclear purpose suffix (.wwg/reports/changelog-preview.md): Ambiguous report names should be indexed or renamed only through a deliberate report policy pass.
- INFO Report filename has unclear purpose suffix (.wwg/reports/context-skill-quality.md): Ambiguous report names should be indexed or renamed only through a deliberate report policy pass.
- INFO Report filename has unclear purpose suffix (.wwg/reports/readme-validation.md): Ambiguous report names should be indexed or renamed only through a deliberate report policy pass.
- INFO WWG-owned file is not lowercase kebab-case (docs/API_EMPLOYEE_IMPORT.md): Naming changes should be reviewed for links, registry references, generated markers, and historical context.
- INFO WWG-owned file is not lowercase kebab-case (docs/APPROVAL_CHAIN_TEST_GUIDE.md): Naming changes should be reviewed for links, registry references, generated markers, and historical context.
- INFO WWG-owned file is not lowercase kebab-case (docs/ATTENDANCE_DATE_FIX.md): Naming changes should be reviewed for links, registry references, generated markers, and historical context.
- INFO WWG-owned file is not lowercase kebab-case (docs/ATTENDANCE_FLOW.md): Naming changes should be reviewed for links, registry references, generated markers, and historical context.
- INFO WWG-owned file is not lowercase kebab-case (docs/COLUMN_CONCAT_GUIDE.md): Naming changes should be reviewed for links, registry references, generated markers, and historical context.
- INFO WWG-owned file is not lowercase kebab-case (docs/CONSOLIDATED_SCHEMA.md): Naming changes should be reviewed for links, registry references, generated markers, and historical context.
- INFO WWG-owned file is not lowercase kebab-case (docs/Create a New Service Guide.md): Naming changes should be reviewed for links, registry references, generated markers, and historical context.
- INFO WWG-owned file is not lowercase kebab-case (docs/CRON_SETUP.md): Naming changes should be reviewed for links, registry references, generated markers, and historical context.
- INFO WWG-owned file is not lowercase kebab-case (docs/DASHBOARD_SETUP.md): Naming changes should be reviewed for links, registry references, generated markers, and historical context.
- INFO WWG-owned file is not lowercase kebab-case (docs/DEPLOYMENT_ARCHITECTURE.md): Naming changes should be reviewed for links, registry references, generated markers, and historical context.
- INFO WWG-owned file is not lowercase kebab-case (docs/DOCKER_SETUP.md): Naming changes should be reviewed for links, registry references, generated markers, and historical context.
- INFO WWG-owned file is not lowercase kebab-case (docs/EMPLOYEE_IMPORT_COLUMNS.md): Naming changes should be reviewed for links, registry references, generated markers, and historical context.
- INFO WWG-owned file is not lowercase kebab-case (docs/EMPLOYEE_MIGRATION_REUSABLE_GUIDE.md): Naming changes should be reviewed for links, registry references, generated markers, and historical context.
- INFO WWG-owned file is not lowercase kebab-case (docs/generated/endpoints/documentation.endpoints.json): Naming changes should be reviewed for links, registry references, generated markers, and historical context.
- INFO WWG-owned file is not lowercase kebab-case (docs/generated/endpoints/template.endpoints.json): Naming changes should be reviewed for links, registry references, generated markers, and historical context.
- ... 26 more.

## Context and Skill Freshness

- INFO Governed skill copy policy is current (.wwg/config/skill-manifest.yaml): Core/compatibility-core skill support remains available. Compatibility-domain skills are reference-only recommendations when relevant. Cleanup runs only through explicit --apply-skill-cleanup, and WWG does not activate runtime skills.

## Governed Skill State

- Skill manifest: `.wwg/config/skill-manifest.yaml` (valid/readable)
- Enabled core skills: 6
- Recommended domain skills: 10
- Recommended reference-only skills: business.business-brief, business.decision-memo, business.sop-writing, creative.storytelling, public.public-discovery-maintenance, public.public-surface-update, software.bug-fix, software.feature-implementation, software.runtime-infrastructure, software.web.rendering-strategy
- Creative/Business recommendations: business.business-brief, business.decision-memo, business.sop-writing, creative.storytelling (reference-only; no skill files copied)
- Local project skills: 0
- Disabled skills: 0
- Skill materialization: none 0, reference 11, copied 5, local 0
- Skill policy: manifest present, no policy violations
- Detected domains: business.compliance, business.decision, business.operations, business.strategy, creative.story, game-design, software.api, software.security, software.testing, software.web
- Legacy copied skills: 5 compatibility-core, 0 compatibility-domain
- Runtime activation: not performed by WWG; future Vorter responsibility.

## Legacy Copied Skill Cleanup Review

- Report: .wwg/reports/skill-cleanup-review.md
- JSON: .wwg/reports/skill-cleanup-review.json
- Mode: review
- No files removed: yes
- Files removed: 0
- Manifest updated: no
- Review candidates: 0
- Cleanup applied: 0
- Preserved protected: 5
- Reference-only: 6
- Already clean: 0
- Manual review required: 0
- Preserve required: 5
- Needs manual review: 0
- Already reference-only: 6
- Not applicable: 0
- Recommendation: Cleanup is not required now.
- Apply mode: available through explicit `--apply-skill-cleanup`.

## Principle and Truth Loop Review

- INFO Potential fragmented guidance: readiness (.wwg/governance/infrastructure-readiness-checklist.md): This is a consolidation candidate only; template, dogfood, docs, and compatibility boundaries must be reviewed before merging guidance.
- INFO Potential fragmented guidance: maintenance (.wwg/governance/README.md): This is a consolidation candidate only; template, dogfood, docs, and compatibility boundaries must be reviewed before merging guidance.
- INFO Potential fragmented guidance: principles (.wwg/governance/recommendation-policy.md): This is a consolidation candidate only; template, dogfood, docs, and compatibility boundaries must be reviewed before merging guidance.
- INFO Potential fragmented guidance: handoff (.wwg/workspace/AGENTS.md): This is a consolidation candidate only; template, dogfood, docs, and compatibility boundaries must be reviewed before merging guidance.
- INFO Principle-like guidance exists outside principles (.wwg/workspace/AGENTS.md): Promotion to active principles requires deliberate human or task-level confirmation.
- INFO Changelog project memory is present (CHANGELOG.md): No changelog maintenance issue was detected by this review.
- INFO README front door is present (README.md): No README maintenance issue was detected by this review.

## Handoff and Registry Readiness

- None detected.

## WWG Readiness

Must Have items are required for agent-safe operation. Other Features are recommendations, not automatic authorization to expand task scope.

### Must Have

- [x] WWG workspace present (present)
  - Evidence: `.wwg`
- [x] Project config present (present)
  - Evidence: `.wwg/config/wwg.project.yaml`
- [x] Project Truth present (present)
  - Evidence: `.wwg/wiki/project-truth.md`
- [x] Terminology present (present)
  - Evidence: `.wwg/wiki/terminology.md`
- [x] Principles README present (present)
  - Evidence: `.wwg/wiki/principles/README.md`
- [x] Workspace current task present (present)
  - Evidence: `.wwg/workspace/current-task.md`
- [x] Governance drift guard present (present)
  - Evidence: `.wwg/governance/drift-guard.md`
- [x] Recommendation Registry present (present)
  - Evidence: `.wwg/governance/recommendation-registry.md`
- [x] Reports directory present (present)
  - Evidence: `.wwg/reports`
- [x] Root AGENTS.md present (present)
  - Evidence: `AGENTS.md`
- [x] Test enforcement governance present (present)
  - Evidence: `.wwg/governance/test-enforcement.md`
- [x] Regression guardrail governance present (present)
  - Evidence: `.wwg/governance/regression-guardrail-catalog.md`
- [x] Validation report present (present)
  - Evidence: `.wwg/reports/wwg-validate-report.md`
- [x] Audit report present (present)
  - Evidence: `.wwg/reports/wwg-audit-report.md`
- [x] Agent handoff present (present)
  - Evidence: `.wwg/reports/wwg-agent-handoff.md`, `.wwg/reports/wwg-handoff-to-codex.md`
- [x] Adoption regression baseline present (present)
  - Evidence: `.wwg/governance/regression-manifest.md`, `.wwg/governance/regression-manifest.json`

### Other Features

- [ ] Upgrade or migration review available (available)
  - Reason: Template version drift or migration-pack indicators were detected.
  - Agent action: Review a migration plan before applying upgrade or migration changes.
  - CLI support: `wwg migrations plan --from <current> --to <target>`
  - Evidence: `wwg.template_version`, `migrations/`

### Recommended Next

- [ ] Review relevant Other Features (available)
  - Reason: Only detected gaps or context-relevant actions are shown.
  - Agent action: Treat recommendations as scoped support, not permission to expand the current task.
  - CLI support: `wwg brief`

Agents should follow Must Have items first. Missing Other Features are not blockers unless the current task depends on them.

## Regression Governance Readiness

- Regression baseline: present
- CI readiness: ready
- Open regression gaps: 5 (0 critical, 2 high)
- Traceability: 0 covered, 4 partial, 0 uncovered, 0 unknown
- Safe report-first candidates: 17 (not counted as coverage)
- Regression candidates: 17 total, 0 proposed, 17 confirmed, 0 waived
- Manual evidence confirmed: 0
- Executable evidence detected: 84
- Candidate-only evidence: 0
- Proposed executable tests: 3 (0 eligible to apply, 3 blocked/unsafe)
- Recommended action: Review `.wwg/governance/regression-gaps.md` and convert safe report-first candidates into confirmed tests or checklists during normal implementation work.
- Warnings: 5 open regression gap(s) remain.

## Recommendation Registry Review

- Registry found: Yes
- Policy found: Yes
- Total recommendations: 0

### By Status

No recommendations found.

### By Impact

No recommendations found.

### By Type

No recommendations found.

### Items Needing Review

No items needing review found.

### High-Impact Open Recommendations

No high-impact open recommendations found.

### Stale Review By Items

No stale Review By items found.

### Parsing Warnings

- None.

### Suggested Actions

- Review Proposed recommendations before planning.
- Promote accepted work into Workspace or issue tracker only when intentionally approved.
- Add owners for Accepted or Promoted items.
- Revisit stale Review By dates.
- Keep recommendations in Governance until promoted.

- Automation: maintain summarized the registry only; it did not promote, implement, or rewrite recommendations.

## Follow-Up Modes

- Update truth/governance now
- Create a cleanup prompt
- Archive/move only after approval
- Ignore as intentional
- Convert into a principle/governance rule

## Suggested Next Actions

- Review `.wwg/governance/regression-gaps.md` and convert safe report-first candidates into confirmed tests or checklists during normal implementation work.
- Review medium-or-higher findings before treating the project as freshly maintained.
- Review `.wwg/reports/skill-cleanup-review.md` before applying legacy copied compatibility-domain cleanup.
- Keep all archive, move, rename, delete, and merge recommendations manual unless a dedicated explicit apply flag exists for that workflow.
- Run `wwg reports --target .` before any report archive or promotion work.
- Run `wwg brief --target .` if generic or compatibility agent brief readiness is missing.
- Refresh Workspace/Governance outputs only through explicit generation or refresh commands.
