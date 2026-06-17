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
- HR routes: dashboard, approvals, employees, recruitment, attendance, timesheets, payroll, benefits, reports, tasks, requests, settings, onboarding, documents, and HR support surfaces.
- Employee routes: employee dashboard, approvals, benefits, learning, performance, team, messages, notifications, requests, leave calendar, workflows, and employee profile/attendance/payroll/payslip routes.
- Public routes: jobs, job application, onboarding, setup/status/callback, guide, announcements, 403, time logging, and PDF surfaces.

## Client Architecture

- `app/contexts/auth-provider.tsx` owns auth state, current user hydration, login/logout, SSO, handoff token validation, role helpers, scope helpers, and branding color application.
- `app/guards/auth-guard.tsx` provides route guarding and redirects unauthenticated users to login.
- `app/lib/api-client.ts` centralizes API base URL resolution, credentials inclusion, optional bearer-token behavior, and deactivated-account event handling.
- `app/services/*` contains domain-specific service clients for HRIS resources.
- `app/types/*` contains typed domain models for employees, attendance, payroll, requests, leave, auth, job applications, and related domains.

## API Boundary

The frontend talks to backend APIs through runtime base URL helpers.

- Default API base is `/api`.
- `VITE_API_BASE_URL` can override the HRIS API base.
- `VITE_API_ROLES_URL` can override role API base.
- API calls include credentials for cookie/session-based auth.
- Optional localStorage bearer token use is gated by `VITE_AUTH_TOKEN_STORAGE_ENABLED=true`.

Backend implementation is outside the inspected frontend source and should not be inferred beyond the client contracts visible here.

## Domain Service Areas

Observed service areas include auth, employees, attendance, timesheets, payroll, payroll periods, requests, workflows, workflow runtime, recruitment/jobs/applicants, onboarding/boarding, departments, positions, levels, schedules, devices, document types, benefits, reports, announcements, notifications, activity logs, audit logs, and Firebase-related deployment support.

## Test And Tooling Surface

Observed scripts include build, dev server, typecheck, lint/format, route cleanup/refactor utilities, duplicate detection, employee deletion, GitHub deploy config sync, route tests, unreachable route tests, attendance performance test, and Playwright/Vitest suites.

Meaningful behavior changes should preserve or add focused tests, especially for auth, authorization, employee data, attendance, timesheets, payroll, route reachability, and deployment configuration.

## Known Architecture Gaps

- Backend data model and API behavior are not canonicalized in this repository.
- README and package identity still describe a template rather than the HRIS product.
- Authorization intent exists in frontend code, but the complete production permission matrix is not confirmed.
- Some generated WWG contexts were generic before this wiki reconciliation.

