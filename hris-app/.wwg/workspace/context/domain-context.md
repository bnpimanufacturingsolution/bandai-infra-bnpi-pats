# Domain Context

## Purpose

Compile domain entities, workflows, edge cases, rules, and requirements.

## Source Wiki Artifacts

- No canonical source found yet.

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
### Domain Entities

Source: `wiki/06-domain/entities.md`

# Domain Entities
Status: INFERRED_FROM_EXISTING_PROJECT
## Organization And Access
- Organization: tenant or company context associated with users and branding.
- User: authenticated account with person data, organization data, metadata, roles, scope, and possible password-change requirement.
- Role: access identity such as admin, HR manager, HR user, employee manager, employee, timekeeper, or super admin.
- Permission: named access capability associated with role or scope.
## Workforce Structure
- Employee: workforce member with personal data, employee ID, department, position, level, manager/team relationships, employment status/type, hire date, work location, salary/pay frequency, schedules, role flags, and documents.
- Department: organizational unit used for employee assignment and HR role derivation.
- Position: job title or assignment used in employee records.
- Level: seniority/management classification used in employee role derivation.
### Domain Rules

Source: `wiki/06-domain/rules.md`

# Domain Rules
Status: INFERRED_FROM_EXISTING_PROJECT
## Role Derivation Rules
- HR department membership is detected through department names `HR` and `HUMAN RESOURCES`.
- Manager classification is inferred from levels such as Director, Senior Manager, Manager, and Lead.
- Non-manager classification is inferred from levels such as Senior, Mid, Junior, and Entry.
- HR department plus manager level maps toward HR manager role.
- HR department plus non-manager level maps toward HR user role.
- Non-HR manager level maps toward employee manager role.
- Non-HR non-manager level maps toward employee role.
- Final role labels and authorization effects require owner confirmation.
## Route Access Rules
### Domain Workflows

Source: `wiki/06-domain/workflows.md`

# Domain Workflows
Status: INFERRED_FROM_EXISTING_PROJECT
## Authentication And Routing
1. User opens the app.
2. Auth provider hydrates current-user state from the API.
3. Unauthenticated users are redirected to `/auth/login`.
4. Authenticated users are redirected by role to admin dashboard, dashboard, or time logging.
5. Deactivated users trigger error handling and auth state cleanup.
## Role Dashboard Use
1. User lands on a role-appropriate dashboard.
2. Dashboard cards show role-specific queues, metrics, quick actions, requests, calendars, approvals, or operational items.
3. User follows quick actions into employee, HR, manager, payroll, document, request, or report surfaces.
<!-- WWG_GENERATED:COMPILED_CONTEXT:END -->

## Maintenance Notes

- Refresh this file with `wwg refresh-context` after canonical Wiki truth changes.
- Do not edit generated content directly; edit Wiki truth first.

## Related Files

- `.wwg/config/wwg.project.yaml`
- `.wwg/wiki/12-maintenance/context-maintenance-matrix.md`
- `.wwg/wiki/12-maintenance/maintenance-contract.md`
