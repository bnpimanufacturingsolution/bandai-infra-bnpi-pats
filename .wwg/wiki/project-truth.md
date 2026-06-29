# Project Truth

Adoption status: INFERRED_FROM_EXISTING_PROJECT
Status: Inferred from repository evidence. Requires human/agent review before becoming accepted project truth.
Truth confidence: HIGH
Last adoption audit: 2026-06-29

This file was populated from existing code, documentation, package metadata, configuration, and observed implementation.

Items marked `INFERRED`, `NEEDS_CONFIRMATION`, `CONFLICTING`, or `STALE` should be reviewed before major future work.

If this file conflicts with lower-priority reports, generated notes, task files, or stale documentation, this file wins once confirmed.

Project Truth must not be silently overwritten. Requirement evolution is allowed when documented and accepted.

## Product Identity

- Product name: project_truth_hyperv_fresh
- Status: INFERRED
- Evidence: package.json (package name)

## Product Category

- Category: Web application
- Status: INFERRED
- Evidence: package/source (frontend framework or route folders detected)

## One-Line Description

- Description: project_truth_hyperv_fresh appears to be a web application.
- Status: INFERRED
- Evidence: package.json (package name); package/source (frontend framework or route folders detected)

## Primary Users and Roles

- Role: admin / hris-admin
  - Status: CONFIRMED
  - Evidence: User correction 2026-06-29; admin device/configuration routes under `hris-app/app/routes/admin`; ZKTeco device work occurs under `/admin/configuration/devices`.
  - Rule: Device management, device event review, runtime health checks, and ZKTeco repair/operations are admin-role work. Do not infer `hris-hr-manager` for `/admin` device or configuration tasks.
- Role: hris-hr-manager
  - Status: CONFIRMED_WITH_BOUNDARY
  - Evidence: Existing HRIS role tests and HR route code.
  - Rule: HR manager is valid for HR workflows where the code/docs explicitly require it, but it is not the default actor for admin configuration, device operations, GitOps, VM, or ZKTeco runtime drift work.
- Role: hris-hr-user, hris-employee-manager, hris-employee
  - Status: OBSERVED
  - Evidence: Existing HRIS role tests and app role types.

## Canonical Scope

Currently includes:

- Feature: Current Working Branch, Main Documents, Normal CLI Flow, VHDX Autopilot, Target Architecture, Target Repo Shape, Image Format Targets, Ownership Rules, app/server
  - Status: INFERRED
  - Evidence: README.md (README headings or route files)

Currently does not include unless approved:

- Boundary: mock/demo files detected
  - Status: INFERRED
  - Evidence: README/source/package (safety boundary indicators)

## Canonical Terminology

See `.wwg/wiki/terminology.md`.

Critical terms:

- Term: flow
  - Meaning: Observed project term; confirm canonical meaning before broad use.
  - Status: INFERRED
  - Evidence: README heading
- Term: package
  - Meaning: Observed project term; confirm canonical meaning before broad use.
  - Status: INFERRED
  - Evidence: app/package-lock.json, app/package.json
- Term: target
  - Meaning: Observed project term; confirm canonical meaning before broad use.
  - Status: INFERRED
  - Evidence: README heading
- Term: truth
  - Meaning: Observed project term; confirm canonical meaning before broad use.
  - Status: INFERRED
  - Evidence: package/name, README heading
- Term: architecture
  - Meaning: Observed project term; confirm canonical meaning before broad use.
  - Status: NEEDS_CONFIRMATION
  - Evidence: README heading

## Architecture Truth

Accepted or observed architecture:

- Item: source folders: app
  - Status: INFERRED
  - Evidence: source/config (folders and package metadata)
- Item: ZKTeco runtime uses the Windows Standalone SDK sidecar under `appliance/zkteco-standalone-sdk`; the Node.js bridge under `appliance/zkteco-bridge` is retired from active Docker, K3s, and GitOps runtime paths.
  - Status: CONFIRMED
  - Evidence: docs/ZKTECO_RUNTIME_TRUTH.md; .wwg/reports/zkteco-node-bridge-retirement-20260629.md

Do not introduce without approval:

- Auth/security changes beyond appliance/bin/project-truth-console-session-hook.sh, hris-api/.wwg/governance/security-review.md, hris-api/app/auth/auth.controller.ts, hris-api/app/auth/auth.router.ts, hris-api/app/auth/index.ts, hris-api/config/security.ts, hris-api/docs/MD Files/auth-api.md, hris-api/docs/SECURITY.md
  - Status: NEEDS_CONFIRMATION
  - Evidence: Existing project adoption audit
- Payment/billing changes beyond hris-app/.react-router/types/app/routes/hr/+types/billings.$id.ts, hris-app/.react-router/types/app/routes/hr/+types/billings.ts, hris-app/app/components/templates/common/billings-template.tsx, hris-app/app/lib/mock-soa-billings.ts, hris-app/app/routes/hr/billings.$id.tsx, hris-app/app/routes/hr/billings.tsx, hris-app/build/client/assets/billings-aJ54d_bS.js, hris-app/build/client/assets/billings._id-sRB6gk7r.js
  - Status: NEEDS_CONFIRMATION
  - Evidence: Existing project adoption audit
- Deployment changes beyond .github/workflows/promote-gitops.yml, .github/workflows/validate.yml, app/Dockerfile, appliance/docker-compose.yml, appliance/zkteco-bridge/Dockerfile, hris-api/Dockerfile, hris-api/docker-compose.yml, hris-api/infrastructure/onprem/observability/docker-compose.yml, hris-app/Dockerfile, hris-app/firebase.json
  - Status: NEEDS_CONFIRMATION
  - Evidence: Existing project adoption audit

## Safety and Production Boundaries

Current boundaries:

- Boundary: mock/demo files detected
  - Status: INFERRED
  - Evidence: README/source/package (safety boundary indicators)

Mock/demo-only areas:

- Area: No mock/demo-only area confirmed
  - Status: NEEDS_CONFIRMATION
  - Evidence: Lightweight audit did not confirm explicit mock/demo areas.

Do not claim production readiness for:

- Capability: appliance/bin/project-truth-console-session-hook.sh, hris-api/.wwg/governance/security-review.md, hris-api/app/auth/auth.controller.ts, hris-api/app/auth/auth.router.ts, hris-api/app/auth/index.ts, hris-api/config/security.ts, hris-api/docs/MD Files/auth-api.md, hris-api/docs/SECURITY.md
  - Status: CONFIRMED
  - Evidence: appliance/bin/project-truth-console-session-hook.sh (auth/security indicator)
- Capability: hris-app/.react-router/types/app/routes/hr/+types/billings.$id.ts, hris-app/.react-router/types/app/routes/hr/+types/billings.ts, hris-app/app/components/templates/common/billings-template.tsx, hris-app/app/lib/mock-soa-billings.ts, hris-app/app/routes/hr/billings.$id.tsx, hris-app/app/routes/hr/billings.tsx, hris-app/build/client/assets/billings-aJ54d_bS.js, hris-app/build/client/assets/billings._id-sRB6gk7r.js
  - Status: CONFIRMED
  - Evidence: hris-app/.react-router/types/app/routes/hr/+types/billings.$id.ts (payments/billing indicator)

## Current Product Direction

Current direction:

- Direction: Current Working Branch, Main Documents, Normal CLI Flow, VHDX Autopilot, Target Architecture, Target Repo Shape, Image Format Targets, Ownership Rules, app/server
  - Status: INFERRED
  - Evidence: README.md (README headings or route files)

Avoid drifting into:

- Drift risk: package metadata vs actual stack
  - Status: NEEDS_CONFIRMATION
  - Evidence: JS/TS source detected without package dependencies.

## Open Questions

- Question: Confirm product category.
  - Why it matters: Category affects profile selection, architecture defaults, and governance gates.
  - Evidence / uncertainty: INFERRED: Web application
- Question: Confirm remaining non-admin role boundaries.
  - Why it matters: Roles affect permissions, UX, terminology, and task routing.
  - Evidence / uncertainty: Admin device/configuration ownership is confirmed; remaining HR/employee sub-role boundaries remain code-observed unless separately reviewed.

## Update Rules

Update this file when:
- product category changes
- user roles change
- canonical terminology changes
- architecture boundaries change
- safety boundaries change
- production-readiness boundaries change
- major product decisions become accepted truth
- high-risk behavior, production claims, approval requirements, or verification expectations change

For adopted projects, do not treat inferred truth as final confirmed truth until reviewed.
