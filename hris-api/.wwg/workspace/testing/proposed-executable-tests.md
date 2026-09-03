# Proposed Executable Tests

These proposals are review drafts. They are not coverage until a real test file exists and the regression governance inventory detects it as executable evidence.

## Summary

- Proposals: 3
- Eligible to apply: 0
- Proposal-only: 0
- Safe to draft: 0
- Unsafe or blocked: 3
- Apply requested: no
- Dry run: no
- Written test files: none

## Safety Notes

- Proposed executable tests are drafts, not coverage.
- Draft content inside `.wwg/workspace/testing/` is not executable evidence.
- WWG writes source test files only when `--write-source-scaffolds` is explicit with `--apply` and safety checks pass.
- This flow never modifies application source files and never overwrites existing tests.
- Non-technical regression candidates should use manual/process checklist evidence.

## Proposals

### proposal-core-feature-workflow-regression - Core feature workflow regression candidate executable test draft

- Candidate: candidate-core-feature-workflow-regression
- Gap: gap-uncovered-behavior-core-feature-workflow
- Traceability: trace-core-feature-workflow
- Type: unit
- Framework: mocha (high)
- Proposed path: tests/candidate-core-feature-workflow-regression-unit.spec.ts
- Safety: unsafe-needs-human
- Apply eligibility: not-eligible
- Reason: Human review is needed before a framework-specific executable draft can be safely created.
- Next action: Have a human or implementation agent wire the outline to the existing test harness.

Source evidence:
- Detected tests do not obviously map to this behavior by path/name.
- README.md: README headings or route files

Expected assertions:
- Confirm core feature workflow remains covered as the project changes. produces the expected local result.
- The test uses local mocks/stubs instead of production integrations.


### proposal-main-entry-point-behavior-regression - Main entry point behavior regression candidate executable test draft

- Candidate: candidate-main-entry-point-behavior-regression
- Gap: gap-uncovered-behavior-main-entry-point-behavior
- Traceability: trace-main-entry-point-behavior
- Type: unit
- Framework: mocha (high)
- Proposed path: tests/candidate-main-entry-point-behavior-regression-unit.spec.ts
- Safety: unsafe-needs-human
- Apply eligibility: not-eligible
- Reason: Human review is needed before a framework-specific executable draft can be safely created.
- Next action: Have a human or implementation agent wire the outline to the existing test harness.

Source evidence:
- Detected tests do not obviously map to this behavior by path/name.
- dist/lib-entry.js: entry point candidate
- app/Rule/index.ts: entry point candidate
- app/activityLogging/index.ts: entry point candidate
- app/agency/index.ts: entry point candidate
- app/applicant/index.ts: entry point candidate
- app/attendance/index.ts: entry point candidate
- app/auditLogging/index.ts: entry point candidate
- app/auth/index.ts: entry point candidate
- app/benefitType/index.ts: entry point candidate
- app/boardingProcess/index.ts: entry point candidate
- app/boardingTemplate/index.ts: entry point candidate

Expected assertions:
- Confirm main entry point behavior remains covered as the project changes. produces the expected local result.
- The test uses local mocks/stubs instead of production integrations.


### proposal-deployment-runtime-readiness-regression - Deployment/runtime readiness regression candidate executable test draft

- Candidate: candidate-deployment-runtime-readiness-regression
- Gap: gap-uncovered-behavior-deployment-runtime-readiness
- Traceability: trace-deployment-runtime-readiness
- Type: unit
- Framework: mocha (high)
- Proposed path: tests/candidate-deployment-runtime-readiness-regression-unit.spec.ts
- Safety: unsafe-needs-human
- Apply eligibility: not-eligible
- Reason: Human review is needed before a framework-specific executable draft can be safely created.
- Next action: Have a human or implementation agent wire the outline to the existing test harness.

Source evidence:
- Detected tests do not obviously map to this behavior by path/name.
- .github/workflows/deploy-local-tailscale.yml: deployment config
- .github/workflows/deploy.yml: deployment config
- .github/workflows/infra-validate.yml: deployment config
- .github/workflows/rollback.yml: deployment config
- Dockerfile: deployment config
- docker-compose.yml: deployment config
- exports/local-infra/docker-compose.yml: deployment config
- infrastructure/onprem/observability/docker-compose.yml: deployment config

Expected assertions:
- Confirm deployment/runtime readiness remains covered as the project changes. produces the expected local result.
- The test uses local mocks/stubs instead of production integrations.


## Warnings

- None.
