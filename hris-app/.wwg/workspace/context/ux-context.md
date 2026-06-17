# UX Context

## Purpose

Compile UX principles, content standards, screens, journeys, and public surface considerations.

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

### Screens And Routes

Source: `wiki/07-ux/screens.md`

# Screens And Routes
Status: INFERRED_FROM_EXISTING_PROJECT
## Auth, Legal, Support, And Profile
- Login: `/auth/login`.
- Legal: `/terms`, `/privacy`.
- Support: `/help`, `/faq`.
- Profile/user utilities: `/home`, `/profile/:id`, `/notifications`, `/history`.
## Admin Workspace
Admin routes include:
- Dashboard.
- Celebrations and birthdays.
- Analytics.
### User Journeys

Source: `wiki/07-ux/user-journeys.md`

# User Journeys
Status: INFERRED_FROM_EXISTING_PROJECT
## Admin Configures The System
1. Admin logs in.
2. Admin lands on the admin dashboard.
3. Admin configures organization structures such as departments, agencies, positions, levels, users, employees, schedules, holidays, workflows, devices, and guide content.
4. Admin reviews audit/activity logs for operational traceability.
5. Admin avoids production deployment, deletion, or secret actions unless explicitly approved.
## HR Manager Reviews Operations
1. HR manager logs in and lands on the role dashboard.
2. HR manager reviews approvals, operational queues, reports, employee status changes, attendance exceptions, recruitment, and payroll readiness.
3. HR manager approves, rejects, revises, or assigns work according to configured workflows.
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
