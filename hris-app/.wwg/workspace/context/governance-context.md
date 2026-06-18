# Governance Context

## Purpose

Compile evidence, approval, drift, release, and quality expectations for agent work.

## Source Wiki Artifacts

- wiki/principles/README.md

## Compiled Context

<!-- WWG_GENERATED:COMPILED_CONTEXT:START -->
- Project: hris-app
- Slug: hris-app
- Status: adopted-inferred
- Primary agent: codex
- Governance level: standard
- Wiki root: .wwg/wiki
- Workspace root: .wwg/workspace
- Governance root: .wwg/governance
- Selected profiles: None

### Context Maintenance Matrix

Source: `wiki/12-maintenance/context-maintenance-matrix.md`

# Context Maintenance Matrix
Status: ACTIVE
## Maintenance Rule
When repository truth changes, update the most specific canonical wiki file first, then run `wwg refresh-context`, `wwg brief`, and `wwg validate`.
## Matrix
## Close-Out Requirement
Do not close out a context-changing task until generated context is refreshed or the reason for skipping refresh is documented in the workspace current task.
### Drift Policy

Source: `wiki/12-maintenance/drift-policy.md`

# Drift Policy
Status: ACTIVE
## Drift Definition
Drift exists when code, docs, configuration, wiki truth, generated context, governance reports, or README/package identity disagree in a way that could mislead an agent or human maintainer.
## Current Known Drift
- README and package name still describe `react-app-template`.
- WWG product name is inferred as `hris-app`; final product name needs confirmation.
- Backend API repository is confirmed at `../hris-api`; backend API behavior remains canonical there, not in this frontend repository.
- Payroll, permission matrix, leave policy, retention policy, and Firebase credential handling remain unconfirmed.
## Drift Severity
- RED: Contradiction affects security, credentials, production deployment, payroll/billing, data deletion, legal/compliance notices, or employee privacy.
- ORANGE: Contradiction affects product identity, role names, domain rules, user workflows, or release/recommendation text.
### Maintenance Contract

Source: `wiki/12-maintenance/maintenance-contract.md`

# Maintenance Contract
Status: ACTIVE
## Contract
Agents must keep canonical wiki truth, generated workspace context, governance recommendations, and current task state aligned.
## Required Flow
1. Read the WWG files in `AGENTS.md` order before meaningful changes.
2. Classify the task mode and risk level.
3. Gather source evidence before changing truth.
4. Update canonical wiki files when product, domain, architecture, UX, governance, or operational truth changes.
5. Keep inferred, confirmed, stale, conflicting, and needs-confirmation labels explicit.
6. Run `wwg refresh-context` after wiki changes that affect agent orientation.
7. Run `wwg brief` after major context changes.
### Principles

Source: `wiki/principles/README.md`

# Principles
This folder contains durable Principle Briefs for this project.
Principles explain how agents should reason about product direction, architecture, governance, positioning, UX, and long-term design choices.
Principles are not the same as project truth.
- Use `../project-truth.md` for canonical facts.
- Use `../terminology.md` for official names and definitions.
- Use `../decisions/` for specific decisions and rationale.
- Use `../../workspace/` for current task state.
- Use `../../governance/` for enforcement rules, drift checks, and validation behavior.
Recommended default frontmatter for active Principle Briefs:
type: principle-brief
status: active
<!-- WWG_GENERATED:COMPILED_CONTEXT:END -->

## Maintenance Notes

- Refresh this file with `wwg refresh-context` after canonical Wiki truth changes.
- Do not edit generated content directly; edit Wiki truth first.

## Related Files

- `.wwg/config/wwg.project.yaml`
- `.wwg/wiki/12-maintenance/context-maintenance-matrix.md`
- `.wwg/wiki/12-maintenance/maintenance-contract.md`
