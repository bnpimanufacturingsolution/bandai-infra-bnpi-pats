# Terminology

This file defines canonical and observed project language.

Adoption status: INFERRED_FROM_EXISTING_PROJECT
Status: Inferred from repository evidence. Requires human/agent review before becoming accepted project truth.

Update 2026-07-14: Benefit schedule mode terminology (`TIME_BOUND` / `FIXED_INSTALLMENTS` / `RECURRING`) and per-period amount language for recurring payroll adjustments; see observed terms and `docs/BENEFIT_SCHEDULE_MODES.md`.

## Observed Terms

| Observed Term | Where Found | Inferred Meaning | Status |
|---|---|---|---|
| card | app/components/atoms/Card.tsx, app/components/atoms/ChartCard.tsx, app/components/atoms/SummaryCard.tsx, app/components/dashboards/shared/cards/action-needed-card.tsx | Observed project term; confirm canonical meaning before broad use. | INFERRED |
| calendar | app/components/atoms/schedule-calendar.tsx, app/components/dashboards/shared/cards/employee-calendar-card.tsx, app/components/molecules/TimesheetCalendar.tsx, app/components/molecules/TimesheetCalendarApproval.tsx | Observed project term; confirm canonical meaning before broad use. | INFERRED |
| dashboard | source text, README/source text, app/components/dashboards/dashboard-skeleton.tsx, app/components/dashboards/employee-dashboard.tsx | Observed project term; confirm canonical meaning before broad use. | INFERRED |
| modal | app/components/atoms/Modal.tsx, app/components/dashboards/shared/regularization-celebration-modal.tsx, app/components/modals/CandidateDetailsModal.tsx, app/components/modals/ChangePasswordModal.tsx | Observed project term; confirm canonical meaning before broad use. | INFERRED |
| form | app/components/atoms/form/FormFieldGroup.tsx, app/components/atoms/form/form-input.tsx, app/components/atoms/form/form-number-input.tsx, app/components/atoms/form/form-select.tsx | Observed project term; confirm canonical meaning before broad use. | INFERRED |
| timesheet | app/components/atoms/TimesheetDayCell.tsx, app/components/molecules/TimesheetCalendar.tsx, app/components/molecules/TimesheetCalendarApproval.tsx, app/components/molecules/TimesheetDayEditor.tsx | Observed project term; confirm canonical meaning before broad use. | INFERRED |
| request | app/components/dashboards/shared/cards/request-list-card.tsx, app/components/dashboards/shared/request-helpers.ts, app/components/modals/EligibilityRequestModal.tsx, app/components/modals/JobRequisitionRequestModal.tsx | Observed project term; confirm canonical meaning before broad use. | INFERRED |
| leave request prefill | app/lib/utils/requests-route.ts, app/components/organisms/leave-request-modal.tsx | URL-driven initial leave form state (`date`, `startDate`, `endDate`, `leaveType`) passed into the leave request modal. | IMPLEMENTED_FROM_USER_REQUEST |
| honor prefilled dates | app/components/organisms/leave-request-modal.tsx | Timesheet-origin leave flow that keeps the selected past date instead of applying advance-notice date bumps. | IMPLEMENTED_FROM_USER_REQUEST |
| advance notice restriction | app/lib/utils/leave-request-policy.ts | Leave-type date policy applied to vacation and personal leave; sick leave is exempt and may select any calendar day. | IMPLEMENTED_FROM_USER_REQUEST |
| input | app/components/atoms/Input.tsx, app/components/atoms/form/form-input.tsx, app/components/atoms/form/form-number-input.tsx, app/components/molecules/PasswordInput.tsx | Observed project term; confirm canonical meaning before broad use. | INFERRED |
| loading | app/assets/loading-logo.gif, app/assets/loading-logo1.gif, app/assets/loading-logo2.gif, app/assets/loading-logo3.gif | Observed project term; confirm canonical meaning before broad use. | INFERRED |
| status | app/components/atoms/StatusBadge.tsx, app/components/atoms/form/status-button.tsx, app/components/atoms/status-badge.tsx, app/components/dashboards/shared/cards/attendance-status-card.tsx | Observed project term; confirm canonical meaning before broad use. | INFERRED |
| badge | app/components/atoms/Badge.tsx, app/components/atoms/PANBadge.tsx, app/components/atoms/StatusBadge.tsx, app/components/atoms/status-badge.tsx | Observed project term; confirm canonical meaning before broad use. | INFERRED |
| employee | app/components/dashboards/employee-dashboard.tsx, app/components/dashboards/shared/cards/employee-calendar-card.tsx, app/components/molecules/EmployeeTableCell.tsx, app/components/molecules/TimesheetEmployeeCard.tsx | Observed project term; confirm canonical meaning before broad use. | INFERRED |
| field | app/components/PdfFieldMapper.tsx, app/components/atoms/FieldMappingRow.tsx, app/components/atoms/form/FormFieldGroup.tsx, app/components/molecules/FormField.tsx | Observed project term; confirm canonical meaning before broad use. | INFERRED |
| role | app/components/dashboards/shared/role-dashboard-shell.tsx, app/components/dashboards/shared/role-dashboard.config.test.ts, app/components/dashboards/shared/role-dashboard.config.ts, app/components/dashboards/shared/role-dashboard.types.ts | Observed project term; confirm canonical meaning before broad use. | INFERRED |
| button | app/components/atoms/Button.tsx, app/components/atoms/form/status-button.tsx, app/components/atoms/navigation/back-button.tsx | Observed project term; confirm canonical meaning before broad use. | INFERRED |
| HRIS | docs/employee-status-changes-eligibility.md, firebase/README.md, firebase/scripts/manage-firebase-projects.ps1 | Human Resources Information System; the implemented product category indicated by source and Firebase naming. | CONFIRMED |
| HRIS API | ../hris-api/README.md, ../hris-api/package.json, app/services/* | Paired backend API repository at `../hris-api`; owns server-side contracts, authorization enforcement, persistence, schemas, and API tests. | CONFIRMED |
| API contract | app/services/*, docs/testing-strategy.md, ../hris-api/tests/* | Observable app-to-API request/response behavior, including auth, status, validation, and error behavior. API contract execution belongs in `../hris-api` or an approved API harness. | INFERRED |
| isolated test database | docs/testing-strategy.md, docs/testing-coverage-matrix.md | Disposable local or approved non-production DB target for intentional bad-data/fault-injection tests. | CONFIRMED_AS_REQUIRED_BOUNDARY |
| workforce | firebase/README.md, firebase/scripts/manage-firebase-projects.ps1, app/lib/hooks/useWorkforceRecruitmentSettings.ts | Workforce-related project naming and recruitment settings context. | INFERRED |
| attendance | app/routes/hr/attendance.tsx, app/routes/site/attendance.tsx, app/services/attendance.service.ts, tests/perf/hr-attendance.spec.ts | Employee attendance workflows and records. | INFERRED |
| payroll | app/routes/hr/payroll.tsx, app/routes/hr/payroll-settings.tsx, app/services/payroll.service.ts, app/types/payroll.ts | Payroll-related HR workflows, settings, reports, and employee payslip surfaces. | INFERRED |
| PayrollCorrection / PAYROLL_CORRECTION | TimesheetViewModal, TimesheetPayrollCorrectionPanel, useCreatePayrollCorrection, requests-time-requests-template | Post-lock payable delta request/ledger path. UI files from payroll-locked timesheet; domain SOT is API `PayrollCorrection` applied as next-open payroll retro lines (not timesheet day rewrite). | CONFIRMED_FROM_IMPLEMENTATION |
| Request payroll correction (UI) | TimesheetPayrollCorrectionPanel; payroll-correction-form | Multi-select calendar days; proposed **Time In / Time Out**; auto hours type; reason required; submits minute dayDeltas. | CONFIRMED_FROM_IMPLEMENTATION |
| Retro line label | payslip-detail; payroll-management-template; API buildRetroPayslipLabel | e.g. `Retro OT (Period 1 - Jun 2026 correction)` — money for **source** period shown on **apply** period payslip/summary. | CONFIRMED_FROM_IMPLEMENTATION |
| Prior-period corrections (HR summary) | payroll-management-template Payroll summary modal | Accordion + Daily detail category listing dayDeltas and correction totals included in GrossPay. | CONFIRMED_FROM_IMPLEMENTATION |
| Processed in payroll | TimesheetViewModal banner/chip; TimesheetsTab status column | Neutral lock UX label when timesheet is payroll-locked (`lockedAt` / `lockedEmployeePayrollId` / `lockReason`). | CONFIRMED_FROM_IMPLEMENTATION |
| benefit schedule mode | app/components/templates/hr/employee-benefit-form.tsx, app/zod/employee-benefit.zod.ts, docs/BENEFIT_SCHEDULE_MODES.md | Explicit payroll benefit schedule: `TIME_BOUND`, `FIXED_INSTALLMENTS`, or `RECURRING`. Frontend owns field visibility; API owns generation/apply. | CONFIRMED_FROM_IMPLEMENTATION |
| recurring benefit | app/components/templates/hr/employee-benefit-form.tsx, docs/BENEFIT_SCHEDULE_MODES.md | Same per-period amount every payroll period from start until optional end date or cancel/deactivate; no installment count field. | CONFIRMED_FROM_IMPLEMENTATION |
| payroll adjustment (create page) | `/hr/benefits-management/new`, benefits-management-create-template.tsx | Full-page create for employee benefit payroll adjustments; replaces former `?action=create` modal. | CONFIRMED_FROM_IMPLEMENTATION |
| bulk employee benefit create | `POST /api/employeeBenefit/bulk`, EmployeeMultiSelectModal | Apply one benefit schedule/amount/type to many employees; one enrollment row per employee. | CONFIRMED_FROM_IMPLEMENTATION |
| amount per payroll period | benefits create page / edit modal amount label for `RECURRING` | Recurring amount semantic (not a program total). Finite modes still use total amount. | CONFIRMED_FROM_IMPLEMENTATION |
| recruitment | app/routes/hr/recruitment-page.tsx, app/routes/hr/jobs.tsx, app/components/organisms/hr/RecruitmentJobsManager.tsx, app/lib/hooks/useWorkforceRecruitmentSettings.ts | Job and applicant management workflows. | INFERRED |
| onboarding | app/routes/onboarding.tsx, app/routes/hr/onboarding-setup.tsx, tests/document-onboarding-real-scenario.spec.ts, app/components/templates/onboarding-template.tsx | Employee onboarding and document/setup workflows. | INFERRED |
| design system | docs/design-system.md | Repository term for app-side UI visual and interaction standards. | INFERRED |
| categorical field | docs/design-system.md, app/routes/admin/configuration/users.tsx | One-word classification or state field such as status, type, or access status. | INFERRED |

## Canonical Term Candidates

| Concept | Recommended Canonical Term | Also Seen As | Confidence | Evidence |
|---|---|---|---|---|
| card | Card | None detected | MEDIUM | app/components/atoms/Card.tsx, app/components/atoms/ChartCard.tsx, app/components/atoms/SummaryCard.tsx, app/components/dashboards/shared/cards/action-needed-card.tsx |
| calendar | Calendar | None detected | MEDIUM | app/components/atoms/schedule-calendar.tsx, app/components/dashboards/shared/cards/employee-calendar-card.tsx, app/components/molecules/TimesheetCalendar.tsx, app/components/molecules/TimesheetCalendarApproval.tsx |
| dashboard | Dashboard | None detected | MEDIUM | source text, README/source text, app/components/dashboards/dashboard-skeleton.tsx, app/components/dashboards/employee-dashboard.tsx |
| modal | Modal | None detected | MEDIUM | app/components/atoms/Modal.tsx, app/components/dashboards/shared/regularization-celebration-modal.tsx, app/components/modals/CandidateDetailsModal.tsx, app/components/modals/ChangePasswordModal.tsx |
| form | Form | None detected | MEDIUM | app/components/atoms/form/FormFieldGroup.tsx, app/components/atoms/form/form-input.tsx, app/components/atoms/form/form-number-input.tsx, app/components/atoms/form/form-select.tsx |
| timesheet | Timesheet | None detected | MEDIUM | app/components/atoms/TimesheetDayCell.tsx, app/components/molecules/TimesheetCalendar.tsx, app/components/molecules/TimesheetCalendarApproval.tsx, app/components/molecules/TimesheetDayEditor.tsx |
| request | Request | None detected | MEDIUM | app/components/dashboards/shared/cards/request-list-card.tsx, app/components/dashboards/shared/request-helpers.ts, app/components/modals/EligibilityRequestModal.tsx, app/components/modals/JobRequisitionRequestModal.tsx |
| input | Input | None detected | MEDIUM | app/components/atoms/Input.tsx, app/components/atoms/form/form-input.tsx, app/components/atoms/form/form-number-input.tsx, app/components/molecules/PasswordInput.tsx |
| HRIS product category | HRIS / Workforce Management Application | react-app-template | HIGH | docs/employee-status-changes-eligibility.md, app/routes/hr, app/routes/employee, firebase/README.md |
| backend API repository | HRIS API / hris-api | API repo, backend repo | HIGH | ../hris-api/README.md, ../hris-api/package.json |
| people records | Employee | Staff, user | MEDIUM | app/types/employee.ts, app/services/employees.service.ts, app/routes/hr/employees.tsx |
| time records | Attendance, Timesheet | Time corrections, my attendance | MEDIUM | app/services/attendance.service.ts, app/services/timesheet.service.ts, app/routes/hr/timesheets.tsx |
| recruiting workflow | Recruitment, Job, Applicant | HR public, application | MEDIUM | app/routes/hr-public/apply.tsx, app/routes/hr/jobs.tsx, app/zod/job-application.zod.ts |
| UI standards | Design System | style guide, design rules | MEDIUM | docs/design-system.md |

## Organization Hierarchy

| Concept | Canonical Term / Shape | Avoid | Status | Evidence |
|---|---|---|---|---|
| recruitment coverage hierarchy | Department -> Section -> Position -> Level | Department scope as a pseudo-section; target for position level names | CONFIRMED_FOR_RECRUITMENT_COVERAGE | app/components/organisms/settings/WorkforceRecruitmentSettingsModule.tsx, app/lib/workforce-recruitment-coverage.ts |
| missing section display bucket | Positions without section | Unassigned section as a normal section accordion; Department scope | CONFIRMED_FOR_RECRUITMENT_COVERAGE | app/components/organisms/settings/WorkforceRecruitmentSettingsModule.tsx, app/lib/workforce-recruitment-coverage.ts |

## Terminology Conflicts

| Conflict | Evidence | Recommendation |
|---|---|---|
| None confirmed | No direct conflict detected by lightweight audit | Confirm inferred terms before large renames |
| API implementation availability | Earlier testing docs said the API server implementation was not present in this workspace; sibling repo `../hris-api` is now confirmed. | Say "not inside this app repo" for this repository, and point backend tests to `../hris-api`. |

## Rules

- Do not rename core concepts casually.
- If a prompt introduces a synonym, decide whether it is canonical before using it broadly.
- If terminology changes, update this file and reconcile code/docs.
- If terminology changes, reconcile reports, tests, governance files, and generated context too.
- For adopted projects, confirm inferred canonical terms before large renames.
- Keep app/API ownership explicit: this repository owns frontend routes, UI, client payloads, browser E2E, and app-side regressions; `../hris-api` owns backend authorization, persistence, DB invariants, API contracts, load tests, and soak tests.
