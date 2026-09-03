# Self Maintenance Loop

## Purpose

Keep WWG truth, workspace, governance, and reports aligned with implementation reality.

## Maintenance Matrix Coverage

| Change Type | Required Self-Maintenance Action |
|---|---|
| Major feature | Sync project truth, terminology, workspace task, and tests |
| Bug fix with canonical behavior impact | Add regression tests and update truth if behavior changed |
| Architecture/runtime change | Update architecture truth/context and drift controls |
| Data model/persistence change | Update persistence truth, migrations, and safety notes |
| Security/permissions change | Update security governance and approval records |
| UI/UX/design system change | Update UX guidance and any public-facing docs |
| Public surface update | Update changelog/public surface artifacts |
| Public discovery/SEO/GEO change | Update discovery context and governance checks |
| Public content/release-note change | Update release-note artifacts and linked truth |
| Cloud/deployment/infrastructure change | Update runtime/infrastructure context and readiness |
| Production monitoring/read-only audit | Update monitoring docs and evidence references |
| Regression guardrail/signoff learning | Update guardrail catalog and signoff notes |
| Agent behavior/prompt/skill change | Update AGENTS and skill/context governance |
| Profile-specific domain rule change | Update profile/domain truth and terms |
| Template-vs-instance change | Update boundary docs and upgrade notes |
| Workspace generation | Refresh workspace outputs |
| Governance generation | Refresh governance outputs |
| Context refresh | Refresh context artifacts from canonical truth |
| Skill refresh | Refresh skill metadata/index outputs |
| Dogfood/self-maintenance change | Update this loop and maintenance reports |

## Loop

1. Read canonical truth and current task.
2. Execute work and validations.
3. Synchronize discovered truth and governance context.
4. Re-run `wwg validate` and `wwg audit` before closeout.
