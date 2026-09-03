# Context Maintenance Matrix

## Coverage Matrix

| Change Type | Canonical Updates Required | Validation |
|---|---|---|
| Major feature | Update project truth, workspace task, and impacted governance/docs | `wwg validate`, `wwg audit` |
| Bug fix with canonical behavior impact | Update project truth and regression guardrails/tests | `wwg validate`, tests |
| Architecture/runtime change | Update project truth, architecture context, and drift guard | `wwg validate`, `wwg audit` |
| Data model/persistence change | Update truth, terminology, migration docs, and safety notes | `wwg validate`, migration checks |
| Security/permissions change | Update security truth, governance controls, and approvals | `wwg validate`, security review |
| UI/UX/design system change | Update UX standards and public surface notes as needed | `wwg validate` |
| Public surface update | Update changelog/release-facing artifacts and truth references | `wwg validate`, changelog review |
| Public discovery/SEO/GEO change | Update discovery/public context and governance review | `wwg validate` |
| Public content/release-note change | Update changelog and linked truth/governance docs | `wwg validate` |
| Cloud/deployment/infrastructure change | Update runtime/infra context and readiness governance | `wwg validate`, infra checks |
| Production monitoring/read-only audit | Update monitoring docs and evidence artifacts | `wwg validate`, audit evidence |
| Regression guardrail/signoff learning | Update regression guardrail catalog and tests | `wwg:test-check`, tests |
| Agent behavior/prompt/skill change | Update AGENTS/governance and skill context | `wwg validate` |
| Profile-specific domain rule change | Update domain context and canonical terminology/truth | `wwg validate` |
| Template-vs-instance change | Update boundary docs and migration/upgrade review | `wwg validate`, `wwg audit` |
| Workspace generation | Refresh workspace outputs and report artifacts | `wwg validate` |
| Governance generation | Refresh governance outputs and report artifacts | `wwg validate` |
| Context refresh | Refresh context docs with source-of-truth alignment | `wwg validate` |
| Skill refresh | Refresh skill index/context and revalidate manifest | `wwg validate` |
| Dogfood/self-maintenance change | Update self-maintenance loop and maintenance reports | `wwg validate`, `wwg audit` |
