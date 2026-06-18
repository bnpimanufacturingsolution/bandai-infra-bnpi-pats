# WWG Adoption Plan

## Summary

Conservative adoption should register existing artifacts before creating new WWG folders.

## Recommended Mode

conservative

## Existing Artifacts to Reuse

| Existing artifact | Classification | Suggested WWG role | Confidence |
|---|---|---|---|
| .react-router/types/app/routes/admin/+types/audit-logs.ts | governance artifact | audit_log | medium |
| .react-router/types/app/routes/legal/+types/privacy-policy.ts | public surface | approval_gated_public_messaging | medium |
| .react-router/types/app/routes/legal/+types/terms-of-use.ts | public surface | approval_gated_public_messaging | medium |
| .react-router/types/app/routes/support/+types/faq.ts | public surface | approval_gated_public_messaging | medium |
| .react-router/types/app/routes/support/+types/help-desk.ts | public surface | approval_gated_public_messaging | medium |
| app/routes/admin/audit-logs.tsx | governance artifact | audit_log | medium |
| app/routes/legal/privacy-policy.tsx | public surface | approval_gated_public_messaging | medium |
| app/routes/legal/terms-of-use.tsx | public surface | approval_gated_public_messaging | medium |
| app/routes/support/faq.tsx | public surface | approval_gated_public_messaging | medium |
| app/routes/support/help-desk.tsx | public surface | approval_gated_public_messaging | medium |
| app/services/audit-logs.service.ts | governance artifact | audit_log | medium |
| build/client/assets/privacy-policy-CNE0q99c.js | public surface | approval_gated_public_messaging | medium |
| build/client/assets/terms-of-use-qn4NvFW0.js | public surface | approval_gated_public_messaging | medium |

## Artifacts to Register

- No mappings inferred.

## Recommended Artifacts for Later Phases

- project_registry: wwg.project.yaml
- changelog: CHANGELOG.md
- project_master_context: docs/ai-context/project-context.md
- maintenance_matrix: docs/ai-context/context-maintenance-matrix.md
- evidence_standards: governance/evidence-standards.md
- public_discovery_context: docs/ai-context/public-discovery-context.md

## Artifacts to Create Later

- wiki/workspace/governance native folders only after a later explicit command exists
- scoped AGENTS.md files only after local ownership is confirmed and a future flag permits creation

## Files Not to Duplicate

- .react-router/types/app/routes/admin/+types/audit-logs.ts
- .react-router/types/app/routes/legal/+types/privacy-policy.ts
- .react-router/types/app/routes/legal/+types/terms-of-use.ts
- .react-router/types/app/routes/support/+types/faq.ts
- .react-router/types/app/routes/support/+types/help-desk.ts
- app/routes/admin/audit-logs.tsx
- app/routes/legal/privacy-policy.tsx
- app/routes/legal/terms-of-use.tsx
- app/routes/support/faq.tsx
- app/routes/support/help-desk.tsx
- app/services/audit-logs.service.ts
- build/client/assets/privacy-policy-CNE0q99c.js
- build/client/assets/terms-of-use-qn4NvFW0.js

## Changelog

- Found: no
- Last version: none detected
- Last date: none detected
- Unreleased present: no
- Weekly cadence detected: no
- Recommended next patch: 0.0.1
- Recommended action: Create a preview first with `wwg changelog generate --target . --from-git --weekly --dry-run`.
- Risk: low: missing project memory should be introduced through dry-run preview first.

## Suggested wwg.project.yaml

```yaml
wwg:
  instance_type: existing-project
  template_version: 0.6.0
  adoption_mode: conservative
  created_by: wwg-cli
  created_at: 2026-05-15
  last_updated_at: 2026-05-15
  registry_owner: wwg
  registry_update_policy: safe_merge
layers:
  wiki:
    root: .
    strategy: mapped-existing
  workspace:
    root: .
    strategy: mapped-existing
  governance:
    root: .react-router/types/app/routes/admin/+types/audit-logs.ts
    strategy: mapped-existing
canonical_artifacts: {}
recommended_artifacts:
  project_registry: wwg.project.yaml
  changelog: CHANGELOG.md
  project_master_context: docs/ai-context/project-context.md
  maintenance_matrix: docs/ai-context/context-maintenance-matrix.md
  evidence_standards: governance/evidence-standards.md
  public_discovery_context: docs/ai-context/public-discovery-context.md
scoped_agents: []
reports:
  adoption_audit: reports/wwg-existing-audit-report.md
  adoption_audit_json: reports/wwg-existing-audit-report.json
  adoption_plan: reports/wwg-adoption-plan.md
  adoption_plan_json: reports/wwg-adoption-plan.json
  adoption_report: reports/wwg-adoption-report.md
  adoption_report_json: reports/wwg-adoption-report.json
  adoption_regression_baseline: .wwg/reports/adoption-regression-report.md
  adoption_regression_baseline_json: .wwg/reports/adoption-regression-report.json
  regression_manifest: .wwg/governance/regression-manifest.md
  regression_manifest_json: .wwg/governance/regression-manifest.json
  regression_gaps: .wwg/governance/regression-gaps.md
  regression_gaps_json: .wwg/governance/regression-gaps.json
  rule_traceability: .wwg/governance/rule-traceability.md
  rule_traceability_json: .wwg/governance/rule-traceability.json
```

## Risk Classification

| Risk | Path | Message | Recommendation |
|---|---|---|---|
| low | wwg.project.yaml | Create or safe-merge a WWG-owned project registry. | Allowed in conservative apply. |
| low | reports | Create audit, adoption plan, adoption report, JSON reports, and registry backups. | Allowed in conservative apply. |
| medium | n/a | Add missing WWG index or generated context files. | Defer until a later explicit init or adoption expansion phase. |
| high | n/a | Move docs, rewrite AGENTS.md, or reorganize context structure. | Do not perform in Phase 2B conservative apply. |
| approval-gated | n/a | Change production config, compliance-sensitive docs, public customer notices, permissions, security, data deletion, or migrations. | Require explicit approval and evidence-backed plan. |

## Rollback Guidance

- Conservative apply creates or safe-merges only `wwg.project.yaml` and WWG reports.
- If an existing registry is updated, a backup is written under `reports/backups/` first.
- Revert by restoring the backup over `wwg.project.yaml` or deleting newly created WWG reports and registry files.

## Next Steps

- wwg adopt --mode conservative --dry-run
