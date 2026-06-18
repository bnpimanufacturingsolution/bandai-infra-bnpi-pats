# Project Context

## Purpose

Provide project orientation, requirements routing, and current canonical project truth for agents.

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

### Project Brief

Source: `wiki/02-project/project-brief.md`

# Project Brief
Status: INFERRED_FROM_EXISTING_PROJECT
Review status: NEEDS_CONFIRMATION for final product name, production boundaries, and role naming.
## Product Identity
- Working product name: HRIS Workforce System / hris-app.
- Canonical product name: NEEDS_CONFIRMATION.
- Package name currently says `react-app-template`; this is STALE relative to source, routes, docs, and Firebase project naming.
- Product category: CONFIRMED as HRIS / workforce management application.
- Primary delivery surface: React Router web application backed by external HRIS APIs.
## Product Purpose
The application supports workforce administration across employee records, attendance, timesheets, leave, requests, approvals, recruitment, onboarding, payroll, reporting, and administrative configuration.
The system appears designed for an organization running HR operations with role-specific workspaces for administrators, HR users, HR managers, employees, employee managers, and timekeepers.
### Functional Requirements

Source: `wiki/03-requirements/functional-requirements.md`

# Functional Requirements
Status: INFERRED_FROM_EXISTING_PROJECT
Source basis: route map, service clients, type models, tests, docs, Firebase configuration, and package scripts.
## Status Key
- CONFIRMED: Directly represented by source, docs, tests, or configuration.
- INFERRED: Strongly implied by implementation shape, but not yet accepted as product truth by a human owner.
- NEEDS_CONFIRMATION: Requires owner review before being used as final requirement language.
## Authentication And Access
- CONFIRMED: Provide login at `/auth/login`.
- CONFIRMED: Hydrate current user through auth service calls.
- CONFIRMED: Support logout, SSO login, password update, and handoff-token validation.
- CONFIRMED: Redirect unauthenticated users to login through `AuthGuard`.
### WWG Wiki Index

Source: `wiki/index.md`

# WWG Wiki Index
Status: ACTIVE
## Orientation
- Project truth summary: `project-truth-summary.md`
- Terminology summary: `terminology-summary.md`
- Project truth: `project-truth.md`
- Terminology: `terminology.md`
- Principles: `principles/README.md`
## Context Areas
- Project brief: `02-project/project-brief.md`
- Functional requirements: `03-requirements/functional-requirements.md`
- System overview: `05-architecture/system-overview.md`
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
