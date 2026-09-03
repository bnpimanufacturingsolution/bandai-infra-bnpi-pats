# Context Maintenance Matrix

Status: ACTIVE

## Maintenance Rule

When repository truth changes, update the most specific canonical wiki file first, then run `wwg refresh-context`, `wwg brief`, and `wwg validate`.

## Matrix

| Change Area | Canonical Wiki Surface | Generated Surface | Verification |
|---|---|---|---|
| Product name, audience, category, purpose | `project-truth.md`, `project-truth-summary.md`, `02-project/project-brief.md` | `workspace/context/project-context.md` | `wwg refresh-context`, `wwg brief`, `wwg validate` |
| Terms, role labels, domain names | `terminology.md`, `terminology-summary.md` | all generated contexts and handoff reports | `wwg refresh-context`, review generated handoff |
| Functional requirements | `03-requirements/functional-requirements.md` | project and domain context | `wwg refresh-context`, focused tests for behavior changes |
| Architecture/API/runtime | `05-architecture/system-overview.md` | architecture context | `wwg refresh-context`, typecheck/build where code changed |
| Deployment/secrets/infrastructure | `05-architecture/deployment-model.md`, `05-architecture/security-model.md` | architecture and governance context | `wwg infra check`, approval before deploy or secret changes |
| Domain entities/rules/workflows | `06-domain/*.md` | domain context | `wwg refresh-context`, regression tests for behavior changes |
| UX screens/journeys | `07-ux/*.md` | UX context | route review, UI tests where behavior changes |
| Open questions/context gaps | `11-synthesis/*.md`, recommendation registry | handoff and reports | owner review, promote decisions into project truth |
| Governance rules | `.wwg/governance/*.md`, `12-maintenance/*.md` | governance context | `wwg validate`, `wwg status` |

## Close-Out Requirement

Do not close out a context-changing task until generated context is refreshed or the reason for skipping refresh is documented in the workspace current task.

