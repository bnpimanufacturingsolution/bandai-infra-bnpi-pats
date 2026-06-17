# Architecture Context

## Purpose

Compile architecture, integration, security, runtime, and deployment truth.

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

### Deployment Model

Source: `wiki/05-architecture/deployment-model.md`

# Deployment Model
Status: INFERRED_FROM_EXISTING_PROJECT
Last reviewed: 2026-05-28
## Hosting
Firebase Hosting is configured through `firebase.json`.
- Hosting targets: `dev` and `uat`.
- Public directory: `build/client`.
- SPA rewrite: all routes rewrite to `/index.html`.
- The app build output is produced by `react-router build`.
## Environments
Observed Firebase/project naming:
- `hris-workforce-dev-20260416`.
### Security Model

Source: `wiki/05-architecture/security-model.md`

# Security Model
Status: INFERRED_FROM_EXISTING_PROJECT
Sensitivity: HIGH for auth, authorization, employee data, payroll, billing, attendance, timesheets, credentials, and deployment.
## Authentication
The frontend auth context supports:
- Login with credentials.
- SSO login.
- Logout.
- Current-user hydration.
- Password updates.
- Handoff-token validation.
- Deactivated-account handling through auth service responses and browser events.
### System Overview

Source: `wiki/05-architecture/system-overview.md`

# System Overview
Status: INFERRED_FROM_EXISTING_PROJECT
## Application Shape
The project is a TypeScript React Router web application using Vite, React 19, Tailwind CSS 4, Radix UI primitives, TanStack Query, Axios-style service clients, Playwright, and Vitest.
The app is organized around route modules, shared components, service clients, typed domain models, guards, contexts, and utility functions under `app/`.
## Routing Model
Routes are declared centrally in `app/routes.ts`.
Major route groups:
- Auth layout: login.
- Legal/support/profile surfaces: terms, privacy, help, FAQ, notifications, history, profile.
- Admin layout: admin dashboard, configuration, devices, audit/activity logs, messages, notifications, help, and admin profile.
- Unified layout: employee and HR workspaces.
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
