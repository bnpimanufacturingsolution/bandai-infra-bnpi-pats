# HRIS App Documentation Index

Status: ACTIVE
Last reviewed: 2026-06-29

This repository is the React Router frontend for the HRIS / workforce management system. Keep active docs in `docs/`, WWG-governed truth in `.wwg/`, and old one-off notes in `docs/archive/`.

## Core App Docs

- [README.md](./README.md) - app scope, quality gates, development commands, and safety notes.
- [docs/design-system.md](./docs/design-system.md) - app-side UI standards and categorical-field styling rules.
- [docs/github-ticket-image-evidence.md](./docs/github-ticket-image-evidence.md) - workflow for turning local screenshots into GitHub-rendered image embeds for tickets, project updates, and review comments.

## Design Foundation Docs

- [docs/design-audits/bandai-design-parity-report.md](./docs/design-audits/bandai-design-parity-report.md) - local Bandai Europe B2B parity audit and affected file map.
- [docs/design-audits/bandai-design-report.md](./docs/design-audits/bandai-design-report.md) - local Bandai design token evidence and source-value research.
- [docs/phase-1-design-token-prompts/source-plan.md](./docs/phase-1-design-token-prompts/source-plan.md) - WWG-ready source plan for the Bandai Europe B2B design token foundation pass.
- [docs/phase-1-design-token-prompts/chain-run.md](./docs/phase-1-design-token-prompts/chain-run.md) - coordinator chain for the Phase 1 design token implementation passes.

## Testing Docs

- [docs/testing-strategy.md](./docs/testing-strategy.md) - app/API test ownership split and local quality gates.
- [docs/testing-coverage-matrix.md](./docs/testing-coverage-matrix.md) - domain-by-domain test coverage expectations.
- [docs/testing-maturity-audit.md](./docs/testing-maturity-audit.md) - testing maturity roadmap.

## Domain-Specific Docs

- [docs/superpowers/plans/2026-06-26-attendance-fix-attendance-front-door.md](./docs/superpowers/plans/2026-06-26-attendance-fix-attendance-front-door.md) - implementation plan for the HR `Fix Attendance` front door, backfill path, and locked-period fallback.
- [docs/attendance-time-correction-implementation-plan.md](./docs/attendance-time-correction-implementation-plan.md) - verified attendance correction workflow, consolidation plan, and open questions for the first assigned attendance item.
- [docs/attendance-correction-feature-summary.md](./docs/attendance-correction-feature-summary.md) - concise feature summary covering the direct and approval-side correction journeys, behavior, and rationale.
- [docs/attendance-time-correction-context.md](./docs/attendance-time-correction-context.md) - compact WWG handoff context pack with confirmed behavior, real-world setup recommendation, open questions, and a new-chat starter prompt.
- [docs/phase-attendance-time-correction-prompts/chain-run.md](./docs/phase-attendance-time-correction-prompts/chain-run.md) - WWG phase prompt pack for the attendance time correction consolidation chain.
- [docs/employee-status-changes-eligibility.md](./docs/employee-status-changes-eligibility.md) - employee status-change eligibility context.

## Governed Truth

- [.wwg/wiki/project-truth-summary.md](./.wwg/wiki/project-truth-summary.md)
- [.wwg/wiki/terminology-summary.md](./.wwg/wiki/terminology-summary.md)
- [.wwg/wiki/project-truth.md](./.wwg/wiki/project-truth.md)
- [.wwg/wiki/terminology.md](./.wwg/wiki/terminology.md)
- [.wwg/workspace/current-task.md](./.wwg/workspace/current-task.md)
- [.wwg/governance/drift-guard.md](./.wwg/governance/drift-guard.md)

## Archived Notes

Legacy root-level markdown and generated route reports were moved to [docs/archive/legacy-root-docs](./docs/archive/legacy-root-docs/README.md). Treat archived notes as historical context only; verify against code, active docs, and WWG truth before using them for implementation.
