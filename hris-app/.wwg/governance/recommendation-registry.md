# WWG Recommendation Registry

This registry captures useful future work discovered by agents, humans, audits, reviews, maintenance runs, retrospectives, and implementation closeouts.

Recommendations are not project truth until accepted.
Recommendations are not active work until promoted into the workspace backlog, current task, proposal, issue, or implementation plan.
Agents may add recommendations, but they must not treat recommendations as authorization to expand scope.

## Status Lifecycle

| Status | Meaning |
|---|---|
| Proposed | Captured but not reviewed |
| Accepted | Reviewed and considered useful future work |
| Promoted | Moved into backlog, proposal, issue, or current task |
| In Progress | Actively being worked on |
| Done | Completed and reconciled into relevant WWG files |
| Deferred | Useful, but intentionally postponed |
| Rejected | Reviewed and intentionally declined |
| Superseded | Replaced by another recommendation |

## Recommendation Registry

| ID | Name | Type | Source | Reason | Suggested Timing | Impact | Effort | Risk If Ignored | Status | Owner | Created | Review By | Links |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| REC-0001 | Reconcile stale template identity | Documentation | WWG adoption readiness review | README.md and package.json still identify the project as `react-app-template`, while source/docs/Firebase naming show an HRIS/workforce application. | Before public release or next major agent handoff | High | Medium | Agents and humans may plan from stale product identity and produce wrong docs, prompts, or release notes. | Proposed | Unassigned | 2026-05-15 | 2026-05-22 | `.wwg/wiki/project-truth.md`, `README.md`, `package.json` |
| REC-0002 | Review Firebase admin SDK JSON files | Security | WWG adoption readiness review | Firebase admin SDK JSON filenames are present under `firebase/` and `firebase/scripts/`; contents were not inspected. | Immediate security triage | High | Medium | Potential secret material may remain in the repo, creating credential exposure risk if committed or shared. | Proposed | Unassigned | 2026-05-15 | 2026-05-16 | `firebase/`, `.wwg/wiki/project-truth.md` |
| REC-0003 | Track WWG generator missing test-enforcement file | Governance | WWG adoption readiness review | `wwg status` requires `.wwg/governance/test-enforcement.md`, but `wwg generate-governance` in package version 0.6.0 did not create it from the shipped template. | Next WWG package review | Medium | Low | Future adopted projects may remain not-ready until the file is restored manually. | Proposed | Unassigned | 2026-05-15 | 2026-05-22 | `.wwg/governance/test-enforcement.md`, `.wwg/reports/wwg-generate-governance-report.md` |
| REC-0004 | Owner-review expanded WWG context | Governance | Context completeness reconciliation | New wiki docs now describe HRIS product, domain, architecture, security, deployment, and UX context from repository evidence, but several items remain inferred. | Before treating generated agent context as accepted truth | High | Low | Agents may rely on inferred payroll, permission, product-name, or policy details as final truth. | Proposed | Unassigned | 2026-05-15 | 2026-05-22 | `.wwg/wiki/11-synthesis/context-completeness-review.md`, `.wwg/wiki/11-synthesis/open-questions.md` |
| REC-0005 | Track validate quality-report self-check | Governance | Context completeness reconciliation | `wwg validate` in package version 0.6.0 can flag a previously generated `.wwg/reports/context-skill-quality.md` as missing WWG Truth Synchronization fields before rewriting that same report. | Next WWG package review | Medium | Low | Repeated validation runs may report a false high failure unless the stale generated quality report is removed first or the CLI excludes it consistently. | Proposed | Unassigned | 2026-05-15 | 2026-05-22 | `.wwg/reports/context-skill-quality.md`, `.wwg/reports/wwg-validate-report.md` |
| REC-0006 | Rotate and remove tracked Firebase service-account keys | Security | Firebase credential triage | Two Firebase admin SDK JSON files are tracked in the Git index by filename. Contents were not inspected. Workflows no longer use fallback files, but tracked key files should be treated as exposed until rotated/removed. | Immediate security triage with project owner | High | Medium | Potential service-account credentials may remain in repository history and on developer machines. | Proposed | Unassigned | 2026-05-15 | 2026-05-16 | `.wwg/reports/firebase-credential-triage.md`, `.wwg/wiki/05-architecture/security-model.md`, `.github/workflows/firebase-hosting-develop.yml`, `.github/workflows/firebase-hosting-pull-request.yml` |
| REC-0007 | Restore app/API test-suite confidence gates | Quality | Test suite confidence audit | 2026-06-01 audit found app `quality:ci` and API `test:ci:source-truth` red, with app/API lint, broad typecheck, route/full E2E, broad API tests, function coverage, and live reliability layers not yet credible production gates. | Before production-readiness claim or release-candidate hardening | High | High | Passing focused tests may be mistaken for system confidence while auth, authorization, employee data, attendance, timesheet, payroll, billing, migration, persistence, and release-hardening risks remain under-tested. | Proposed | Unassigned | 2026-06-01 | 2026-06-15 | `output/reports/test-suite-confidence-audit-2026-06-01.md`, `docs/testing-maturity-audit.md`, `../hris-api/docs/testing-maturity-audit.md` |

## Entry Guidance

Each recommendation should answer:

- What is being recommended?
- Why was it discovered?
- What evidence supports it?
- When should it be revisited?
- What is the risk if ignored?
- Should it become a backlog item, proposal, ADR, regression test, documentation update, or governance rule?

## Promotion Rule

A recommendation may only become active work when it is explicitly promoted into one of the following:

- `.wwg/workspace/current-task.md`
- a backlog or planning artifact
- a proposal under `docs/proposals` or `.wwg/proposals` if present
- an issue tracker item
- an implementation prompt
- an accepted governance rule
- a regression test plan
