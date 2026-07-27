# Union merge conflicts — stopped per option C

Branch: `import/hris-standalone-develop-snapshot`
Base: standalone snapshot `272dc5d`
Incoming folder source: `bandai-infra` `develop` `7cc4c64`

## Completed without conflict

| Action | Count |
|--------|------:|
| Restored develop-only files | 219 |
| Skipped junk/tmp | 7 |
| Kept standalone-only files | 224 |
| Env files took develop | 5 |
| Clean line-merges | 0 |
| **Conflicts (stopped)** | **422** |

## Conflict categories

### api-device-hikvision-zkteco (16)

- `hris-api/app/device/device.controller.ts`
- `hris-api/app/device/device.router.ts`
- `hris-api/app/hikvision/controller/access.control.controller.ts`
- `hris-api/app/hikvision/controller/callback.controller.ts`
- `hris-api/config/hikvision.endpoint.ts`
- `hris-api/helper/device-event-realtime.helper.ts`
- `hris-api/helper/hikvision-event-contract.helper.ts`
- `hris-api/lib/hikvision-client.ts`
- `hris-api/prisma/schema-postgres/device.prisma`
- `hris-api/prisma/schema/device.prisma`
- `hris-api/prisma/seeds/deviceSeeder.ts`
- `hris-api/scripts/audit-hikvision-device-events.ts`
- `hris-api/tests/device-event-realtime.helper.spec.ts`
- `hris-api/tests/dm4-biometric-proof.spec.ts`
- `hris-api/tests/hikvision-event-contract.helper.spec.ts`
- `hris-api/zod/device.zod.ts`

### api-observability-infra (15)

- `hris-api/Dockerfile`
- `hris-api/docker-compose.postgres-rw.yml`
- `hris-api/helper/logger.helper.ts`
- `hris-api/helper/telemetry.ts`
- `hris-api/infrastructure/onprem/observability/README.md`
- `hris-api/infrastructure/onprem/observability/backup/backup.sh`
- `hris-api/infrastructure/onprem/observability/backup/loop.sh`
- `hris-api/infrastructure/onprem/observability/docker-compose.yml`
- `hris-api/infrastructure/onprem/observability/grafana/provisioning/dashboards/hris-container-logs.json`
- `hris-api/infrastructure/onprem/observability/grafana/provisioning/datasources/datasources.yml`
- `hris-api/infrastructure/onprem/observability/loki/loki-config.yml`
- `hris-api/infrastructure/onprem/observability/prometheus/alerts.yml`
- `hris-api/infrastructure/onprem/observability/prometheus/prometheus.yml`
- `hris-api/infrastructure/onprem/observability/promtail/promtail-config.yml`
- `hris-api/utils/auditLogger.ts`

### api-wwg-docs-meta (22)

- `hris-api/.wwg/config/wwg.project.yaml`
- `hris-api/.wwg/reports/context-skill-quality.json`
- `hris-api/.wwg/reports/context-skill-quality.md`
- `hris-api/.wwg/reports/runtime-skill-candidates.json`
- `hris-api/.wwg/reports/runtime-skill-candidates.md`
- `hris-api/.wwg/reports/wwg-agent-handoff.json`
- `hris-api/.wwg/reports/wwg-agent-handoff.md`
- `hris-api/.wwg/reports/wwg-handoff-to-codex.json`
- `hris-api/.wwg/reports/wwg-handoff-to-codex.md`
- `hris-api/.wwg/reports/wwg-validate-report.md`
- `hris-api/.wwg/wiki/project-truth-summary.md`
- `hris-api/.wwg/wiki/project-truth.md`
- `hris-api/.wwg/wiki/terminology-summary.md`
- `hris-api/.wwg/wiki/terminology.md`
- `hris-api/.wwg/workspace/current-task.md`
- `hris-api/AGENTS.md`
- `hris-api/CHANGELOG.md`
- `hris-api/docs/CONSOLIDATED_SCHEMA.md`
- `hris-api/docs/Create a New Service Guide.md`
- `hris-api/docs/DOCKER_SETUP.md`
- `hris-api/docs/PAYROLL_CYCLE_RULES_CONFIG.md`
- `hris-api/docs/testing-strategy.md`

### api-product-core (114)

- `hris-api/.github/workflows/deploy.yml`
- `hris-api/.gitignore`
- `hris-api/app/agency/agency.controller.ts`
- `hris-api/app/applicant/applicant.controller.ts`
- `hris-api/app/attendance/attendance-backfill.service.ts`
- `hris-api/app/attendance/attendance-correction.service.ts`
- `hris-api/app/attendance/attendance-import.service.ts`
- `hris-api/app/attendance/attendance.controller.ts`
- `hris-api/app/auth/auth.controller.ts`
- `hris-api/app/auth/auth.router.ts`
- `hris-api/app/calendar-item/calendar-item.controller.ts`
- `hris-api/app/calendar-item/calendar-item.router.ts`
- `hris-api/app/celebrations/celebrations.controller.ts`
- `hris-api/app/celebrations/celebrations.router.ts`
- `hris-api/app/cron/cron.service.ts`
- `hris-api/app/documentFolder/documentFolder.controller.ts`
- `hris-api/app/documentType/documentType.controller.ts`
- `hris-api/app/employee/employee.controller.ts`
- `hris-api/app/employee/employee.router.ts`
- `hris-api/app/employeeBenefit/employeeBenefit.controller.ts`
- `hris-api/app/employeeBenefit/employeeBenefit.router.ts`
- `hris-api/app/employeeSchedule/employeeSchedule.controller.ts`
- `hris-api/app/employeepayroll/employeepayroll.controller.ts`
- `hris-api/app/employeepayroll/employeepayroll.router.ts`
- `hris-api/app/leaveSetting/leaveSetting.controller.ts`
- `hris-api/app/metrics/metrics.controller.ts`
- `hris-api/app/migration/dm4-migration.adapter.ts`
- `hris-api/app/migration/migration-dry-run.service.ts`
- `hris-api/app/migration/migration.controller.ts`
- `hris-api/app/notification/notification.controller.ts`
- `hris-api/app/payrollperiod/payrollperiod.controller.ts`
- `hris-api/app/position/position.controller.ts`
- `hris-api/app/request/request.controller.ts`
- `hris-api/app/systemProvisioning/systemProvisioning.controller.ts`
- `hris-api/app/systemProvisioning/systemProvisioning.service.ts`
- `hris-api/app/template/template.controller.ts`
- `hris-api/app/termination/termination.controller.ts`
- `hris-api/app/timesheet/timesheet.controller.ts`
- `hris-api/app/timesheet/timesheet.router.ts`
- `hris-api/app/workflowConfig/workflowConfig.controller.ts`
- `hris-api/app/workforceRecruitmentSetting/workforceRecruitmentSetting.controller.ts`
- `hris-api/app/workforceRecruitmentSetting/workforceRecruitmentSetting.router.ts`
- `hris-api/config/config.ts`
- `hris-api/config/constant.ts`
- `hris-api/cron-entry.ts`
- `hris-api/helper/action-metrics.helper.ts`
- `hris-api/helper/attendance-metrics-common.helper.ts`
- `hris-api/helper/attendance-metrics-detailed.helper.ts`
- `hris-api/helper/attendance-obligation-metrics.helper.ts`
- `hris-api/helper/attendance-obligation.helper.ts`
- `hris-api/helper/cloudinary.helper.ts`
- `hris-api/helper/eligibility.helper.ts`
- `hris-api/helper/employee-benefit-program.helper.ts`
- `hris-api/helper/leave-balance-metrics.helper.ts`
- `hris-api/helper/leave-policy.helper.ts`
- `hris-api/helper/manpower-distribution-reference.helper.ts`
- `hris-api/helper/notification-dispatch.helper.ts`
- `hris-api/helper/payroll-period.helper.ts`
- `hris-api/helper/payslip-pdf.helper.ts`
- `hris-api/helper/timekeeping.helper.ts`
- `hris-api/helper/timesheet-config.helper.ts`
- `hris-api/helper/timesheet-line-version.helper.ts`
- `hris-api/helper/timesheet.helper.ts`
- `hris-api/helper/workflow-config.helper.ts`
- `hris-api/helper/workforce-recruitment.helper.ts`
- `hris-api/index.ts`
- `hris-api/middleware/verifyToken.ts`
- `hris-api/prisma/schema-postgres/bootstrap.sql`
- `hris-api/prisma/schema-postgres/employee.prisma`
- `hris-api/prisma/schema-postgres/employeebenefit.prisma`
- `hris-api/prisma/schema-postgres/employeepayroll.prisma`
- `hris-api/prisma/schema-postgres/payrollperiod.prisma`
- `hris-api/prisma/schema-postgres/request.prisma`
- `hris-api/prisma/schema-postgres/timesheet.prisma`
- `hris-api/prisma/schema/employee.prisma`
- `hris-api/prisma/schema/employeebenefit.prisma`
- `hris-api/prisma/schema/employeepayroll.prisma`
- `hris-api/prisma/schema/payrollperiod.prisma`
- `hris-api/prisma/schema/request.prisma`
- `hris-api/prisma/schema/timesheet.prisma`
- `hris-api/prisma/seed.ts`
- `hris-api/prisma/seeds/benefitTypeSeeder.ts`
- `hris-api/prisma/seeds/defaultProjectSeeder.ts`
- `hris-api/prisma/seeds/generalEmployeeSeeder.shared.ts`
- `hris-api/prisma/seeds/requestWorkflowCatalog.ts`
- `hris-api/scripts/cleanup-emitted-js.cjs`
- `hris-api/scripts/dry-run-attendance-clock-contract.ts`
- `hris-api/scripts/ensure-dev-port-ownership.cjs`
- `hris-api/scripts/ensure-local-dev-services.cjs`
- `hris-api/scripts/profile-attendance-metrics.ts`
- `hris-api/tests/attendance-backfill.service.spec.ts`
- `hris-api/tests/db/isolated-db-faults.spec.ts`
- `hris-api/tests/db/isolated-prisma.integration.spec.ts`
- `hris-api/tests/leaveType.controller.spec.ts`
- `hris-api/tests/payslip-pdf.helper.spec.ts`
- `hris-api/tests/section.controller.spec.ts`
- `hris-api/tests/seed-and-qa-script-safety.spec.ts`
- `hris-api/tests/wwg/app-module-contract.behavior.spec.ts`
- `hris-api/tests/wwg/function-coverage.explicit.spec.ts`
- `hris-api/tests/wwg/request-workforce-cache-auth.behavior.spec.ts`
- `hris-api/tests/wwg/tax-timekeeping.behavior.spec.ts`
- `hris-api/webpack.config.js`
- `hris-api/wiki-template/base/08-operations/monitoring.md`
- `hris-api/zod/celebrations.zod.ts`
- `hris-api/zod/employee.zod.ts`
- `hris-api/zod/employeebenefit.zod.ts`
- `hris-api/zod/employeepayroll.zod.ts`
- `hris-api/zod/metrics.zod.ts`
- `hris-api/zod/notification.zod.ts`
- `hris-api/zod/payrollperiod.zod.ts`
- `hris-api/zod/position.zod.ts`
- `hris-api/zod/request.zod.ts`
- `hris-api/zod/timesheet.zod.ts`
- `hris-api/zod/timesheetconfig.zod.ts`

### api-lock-package (2)

- `hris-api/package-lock.json`
- `hris-api/package.json`

### app-device-admin (7)

- `hris-app/app/lib/hooks/use-hikvision.ts`
- `hris-app/app/lib/hooks/useDevices.ts`
- `hris-app/app/routes/admin/devices/enroll.tsx`
- `hris-app/app/routes/admin/devices/events.tsx`
- `hris-app/app/routes/admin/devices/manage.tsx`
- `hris-app/app/services/devices.service.ts`
- `hris-app/app/services/hikvision.service.ts`

### app-product-ui (208)

- `hris-app/.dockerignore`
- `hris-app/.gitignore`
- `hris-app/DOCUMENTATION_INDEX.md`
- `hris-app/Dockerfile`
- `hris-app/app/app.css`
- `hris-app/app/assets/bandai_logo.png`
- `hris-app/app/components/atoms/Avatar.tsx`
- `hris-app/app/components/atoms/Card.tsx`
- `hris-app/app/components/atoms/DataTable.test.tsx`
- `hris-app/app/components/atoms/DataTable.tsx`
- `hris-app/app/components/atoms/FieldMappingRow.tsx`
- `hris-app/app/components/atoms/Input.tsx`
- `hris-app/app/components/atoms/LoadingScreen.tsx`
- `hris-app/app/components/atoms/Modal.tsx`
- `hris-app/app/components/atoms/Select.tsx`
- `hris-app/app/components/atoms/SummaryCard.tsx`
- `hris-app/app/components/atoms/TimesheetDayCell.test.tsx`
- `hris-app/app/components/atoms/TimesheetDayCell.tsx`
- `hris-app/app/components/dashboards/dashboard-skeleton.tsx`
- `hris-app/app/components/dashboards/employee-dashboard.tsx`
- `hris-app/app/components/dashboards/hr-manager-dashboard.tsx`
- `hris-app/app/components/dashboards/hr-user-dashboard.tsx`
- `hris-app/app/components/dashboards/manager-dashboard.tsx`
- `hris-app/app/components/dashboards/shared/cards/action-needed-card.tsx`
- `hris-app/app/components/dashboards/shared/cards/employee-calendar-card.tsx`
- `hris-app/app/components/dashboards/shared/cards/hr-queue-card.tsx`
- `hris-app/app/components/dashboards/shared/cards/profile-header-card.tsx`
- `hris-app/app/components/dashboards/shared/cards/quick-actions-card.tsx`
- `hris-app/app/components/dashboards/shared/cards/request-list-card.tsx`
- `hris-app/app/components/dashboards/shared/cards/time-off-card.tsx`
- `hris-app/app/components/dashboards/shared/request-helpers.ts`
- `hris-app/app/components/dashboards/shared/role-dashboard-shell.tsx`
- `hris-app/app/components/dashboards/shared/role-dashboard.types.ts`
- `hris-app/app/components/debug/LoginDebug.tsx`
- `hris-app/app/components/modals/ChangePasswordModal.tsx`
- `hris-app/app/components/modals/JobRequisitionRequestModal.test.tsx`
- `hris-app/app/components/molecules/AttendanceScopeFilterPopover.tsx`
- `hris-app/app/components/molecules/DepartmentSelect.stories.tsx`
- `hris-app/app/components/molecules/EmployeeTableCell.test.tsx`
- `hris-app/app/components/molecules/EmployeeTableCell.tsx`
- `hris-app/app/components/molecules/ExitClearanceSection.tsx`
- `hris-app/app/components/molecules/HrDataTableFilters.tsx`
- `hris-app/app/components/molecules/RequestReviewModal.tsx`
- `hris-app/app/components/molecules/TagInput.tsx`
- `hris-app/app/components/molecules/TimesheetCalendar.test.tsx`
- `hris-app/app/components/molecules/TimesheetCalendar.tsx`
- `hris-app/app/components/molecules/TimesheetCalendarApproval.tsx`
- `hris-app/app/components/molecules/TimesheetDayTooltipContent.test.tsx`
- `hris-app/app/components/molecules/TimesheetDayTooltipContent.tsx`
- `hris-app/app/components/molecules/TimesheetHoursOverview.tsx`
- `hris-app/app/components/molecules/calendars/create-item-calendar.tsx`
- `hris-app/app/components/molecules/calendars/event-details-modal.tsx`
- `hris-app/app/components/molecules/employee/SystemAccessForm.tsx`
- `hris-app/app/components/molecules/guide/sidebar-item.tsx`
- `hris-app/app/components/molecules/index.ts`
- `hris-app/app/components/molecules/job-management/job-tag-list.tsx`
- `hris-app/app/components/molecules/shared/AdminTabs.tsx`
- `hris-app/app/components/molecules/shared/JourneyTimeline.tsx`
- `hris-app/app/components/molecules/shared/Navigation.tsx`
- `hris-app/app/components/molecules/shared/WorkScheduleForm.tsx`
- `hris-app/app/components/organisms/Sidebar.tsx`
- `hris-app/app/components/organisms/TimesheetView.tsx`
- `hris-app/app/components/organisms/TimesheetViewModal.test.tsx`
- `hris-app/app/components/organisms/TimesheetViewModal.tsx`
- `hris-app/app/components/organisms/calendars/calendar-view-page.tsx`
- `hris-app/app/components/organisms/employee-detail/employee-document-action-modal.tsx`
- `hris-app/app/components/organisms/employee-detail/employment-details-tab.tsx`
- `hris-app/app/components/organisms/employee-detail/personal-info-tab.tsx`
- `hris-app/app/components/organisms/hr-public/applicant-card.tsx`
- `hris-app/app/components/organisms/index.ts`
- `hris-app/app/components/organisms/leave-request-modal.tsx`
- `hris-app/app/components/organisms/settings/WorkforceRecruitmentSettingsModule.test.tsx`
- `hris-app/app/components/organisms/settings/WorkforceRecruitmentSettingsModule.tsx`
- `hris-app/app/components/organisms/timesheet-modal.tsx`
- `hris-app/app/components/shared/EmployeeDirectoryView.tsx`
- `hris-app/app/components/shared/EmployeeList.test.tsx`
- `hris-app/app/components/shared/EmployeeList.tsx`
- `hris-app/app/components/templates/add-employee-template.tsx`
- `hris-app/app/components/templates/common/attendance-management-template.tsx`
- `hris-app/app/components/templates/common/attendance-template.tsx`
- `hris-app/app/components/templates/common/billings-template.tsx`
- `hris-app/app/components/templates/common/payroll-management-template.tsx`
- `hris-app/app/components/templates/common/payroll-template.tsx`
- `hris-app/app/components/templates/common/profile-template.tsx`
- `hris-app/app/components/templates/common/run-payroll-template.tsx`
- `hris-app/app/components/templates/employee-form.tsx`
- `hris-app/app/components/templates/employee/payslip-detail-template.tsx`
- `hris-app/app/components/templates/guide-layout.tsx`
- `hris-app/app/components/templates/guide-template-page.tsx`
- `hris-app/app/components/templates/guide-template.tsx`
- `hris-app/app/components/templates/hr/benefit-types-template.tsx`
- `hris-app/app/components/templates/hr/benefits-management-template.tsx`
- `hris-app/app/components/templates/my-pages/requests-hub-template.tsx`
- `hris-app/app/components/templates/my-pages/requests-time-requests-template.tsx`
- `hris-app/app/components/templates/requests/expense-reimbursement-template.tsx`
- `hris-app/app/components/templates/requests/leave-template.tsx`
- `hris-app/app/components/ui/calendar.tsx`
- `hris-app/app/components/ui/dropdown-menu.tsx`
- `hris-app/app/components/ui/input.tsx`
- `hris-app/app/components/ui/tooltip.tsx`
- `hris-app/app/contexts/auth-provider.tsx`
- `hris-app/app/examples/boardingTemplateWithItemsExample.tsx`
- `hris-app/app/examples/job-application-form-examples.tsx`
- `hris-app/app/guard/TimeLoggingGuard.tsx`
- `hris-app/app/guards/auth-guard.tsx`
- `hris-app/app/hooks/useLevelsByPosition.ts`
- `hris-app/app/hooks/useTagManager.ts`
- `hris-app/app/layouts/admin-layout.tsx`
- `hris-app/app/layouts/unified-layout.tsx`
- `hris-app/app/lib/api-client.ts`
- `hris-app/app/lib/api-url.helper.test.ts`
- `hris-app/app/lib/api-url.helper.ts`
- `hris-app/app/lib/bir-2316-mock-data.ts`
- `hris-app/app/lib/ci-cd-quality-gates.test.ts`
- `hris-app/app/lib/document-request-handler.ts`
- `hris-app/app/lib/form-validation.ts`
- `hris-app/app/lib/hooks/useEmployeeBenefits.ts`
- `hris-app/app/lib/hooks/useEmployeePayroll.ts`
- `hris-app/app/lib/hooks/useEmployees.ts`
- `hris-app/app/lib/hooks/useMetrics.ts`
- `hris-app/app/lib/hooks/useRequests.ts`
- `hris-app/app/lib/hooks/useTimesheets.test.tsx`
- `hris-app/app/lib/hooks/useTimesheets.ts`
- `hris-app/app/lib/hooks/useWorkforceRecruitmentSettings.ts`
- `hris-app/app/lib/mock-data.ts`
- `hris-app/app/lib/notification-navigation.ts`
- `hris-app/app/lib/pdfGenerator.ts`
- `hris-app/app/lib/runtime-api-base.ts`
- `hris-app/app/lib/status-config.ts`
- `hris-app/app/lib/utils/manpower-distribution-links.test.ts`
- `hris-app/app/lib/utils/manpower-distribution-links.ts`
- `hris-app/app/lib/workforce-recruitment-coverage.test.ts`
- `hris-app/app/lib/workforce-recruitment-coverage.ts`
- `hris-app/app/root.tsx`
- `hris-app/app/routes.ts`
- `hris-app/app/routes/admin/configuration/positions.tsx`
- `hris-app/app/routes/admin/configuration/users.test.tsx`
- `hris-app/app/routes/admin/configuration/users.tsx`
- `hris-app/app/routes/admin/dashboard.tsx`
- `hris-app/app/routes/admin/rules-policies/workflows.tsx`
- `hris-app/app/routes/announcements.tsx`
- `hris-app/app/routes/auth/login.tsx`
- `hris-app/app/routes/celebrations/birthdays.tsx`
- `hris-app/app/routes/employee/$id.attendance.tsx`
- `hris-app/app/routes/employee/approvals.$type.tsx`
- `hris-app/app/routes/employee/approvals.tsx`
- `hris-app/app/routes/employee/dashboard/TimesheetsTab.test.tsx`
- `hris-app/app/routes/employee/dashboard/TimesheetsTab.tsx`
- `hris-app/app/routes/employee/employee.$id.tsx`
- `hris-app/app/routes/employee/leave/index.ts`
- `hris-app/app/routes/employee/team/OrganizationChartTab.tsx`
- `hris-app/app/routes/employee/team/TeamSchedulesTab.tsx`
- `hris-app/app/routes/hr/approvals.$type.tsx`
- `hris-app/app/routes/hr/approvals/EmployeeRequestsTab.tsx`
- `hris-app/app/routes/hr/boarding-template-builder.tsx`
- `hris-app/app/routes/hr/employee-documents.tsx`
- `hris-app/app/routes/hr/employee-import.tsx`
- `hris-app/app/routes/hr/employee-status-changes.tsx`
- `hris-app/app/routes/hr/employees.tsx`
- `hris-app/app/routes/hr/leave/index.ts`
- `hris-app/app/routes/hr/payroll.tsx`
- `hris-app/app/routes/hr/recruitment-page.tsx`
- `hris-app/app/routes/hr/reports/BIRReportTab.tsx`
- `hris-app/app/routes/hr/reports/attendance.tsx`
- `hris-app/app/routes/hr/reports/components/ReportEmployeeCell.tsx`
- `hris-app/app/routes/hr/reports/payroll.tsx`
- `hris-app/app/routes/hr/reports/tabs/DailyManpowerTab.tsx`
- `hris-app/app/routes/hr/reports/tabs/DirectIndirectLaborTab.tsx`
- `hris-app/app/routes/hr/reports/tabs/LeaveBalanceTab.tsx`
- `hris-app/app/routes/hr/reports/tabs/ManpowerDistributionTab.tsx`
- `hris-app/app/routes/hr/reports/tabs/NoWorkReportTab.tsx`
- `hris-app/app/routes/hr/reports/tabs/OvertimeTab.tsx`
- `hris-app/app/routes/hr/reports/tabs/TardinessUndetimeTab.tsx`
- `hris-app/app/routes/hr/timesheets.tsx`
- `hris-app/app/routes/landing.tsx`
- `hris-app/app/routes/setup.tsx`
- `hris-app/app/routes/time-logging.tsx`
- `hris-app/app/services/applicant.service.ts`
- `hris-app/app/services/auth-service.ts`
- `hris-app/app/services/employee-benefit.service.ts`
- `hris-app/app/services/employees.service.test.ts`
- `hris-app/app/services/employees.service.ts`
- `hris-app/app/services/leave.service.ts`
- `hris-app/app/services/metrics.service.test.ts`
- `hris-app/app/services/metrics.service.ts`
- `hris-app/app/services/payroll-periods.service.ts`
- `hris-app/app/services/payroll.service.ts`
- `hris-app/app/services/reports.service.ts`
- `hris-app/app/services/requests.service.test.ts`
- `hris-app/app/services/requests.service.ts`
- `hris-app/app/services/timesheet.service.ts`
- `hris-app/app/services/workflow-configs.service.ts`
- `hris-app/app/services/workforce-recruitment-settings.service.ts`
- `hris-app/app/test/setup.ts`
- `hris-app/app/types/calendar.ts`
- `hris-app/app/types/employee-payroll.ts`
- `hris-app/app/types/index.ts`
- `hris-app/app/types/workSchedule.ts`
- `hris-app/app/zod/employee-benefit.zod.ts`
- `hris-app/app/zod/notification.ts`
- `hris-app/app/zod/position.zod.ts`
- `hris-app/playwright.smoke.config.ts`
- `hris-app/react-router.config.ts`
- `hris-app/scripts/admin-config-pattern-intelligence.ts`
- `hris-app/scripts/delete-employee-with-relations.ts`
- `hris-app/scripts/fix-route-references.ts`
- `hris-app/vite.config.ts`
- `hris-app/vitest.config.ts`

### app-wwg-docs-meta (36)

- `hris-app/.wwg/config/wwg.project.yaml`
- `hris-app/.wwg/governance/development-operating-model.md`
- `hris-app/.wwg/governance/drift-guard.md`
- `hris-app/.wwg/governance/recommendation-registry.md`
- `hris-app/.wwg/reports/context-skill-quality.json`
- `hris-app/.wwg/reports/context-skill-quality.md`
- `hris-app/.wwg/reports/generated-project-upgrade-review.json`
- `hris-app/.wwg/reports/generated-project-upgrade-review.md`
- `hris-app/.wwg/reports/runtime-skill-candidates.json`
- `hris-app/.wwg/reports/runtime-skill-candidates.md`
- `hris-app/.wwg/reports/wwg-agent-handoff.json`
- `hris-app/.wwg/reports/wwg-agent-handoff.md`
- `hris-app/.wwg/reports/wwg-audit-report.json`
- `hris-app/.wwg/reports/wwg-audit-report.md`
- `hris-app/.wwg/reports/wwg-handoff-to-codex.json`
- `hris-app/.wwg/reports/wwg-handoff-to-codex.md`
- `hris-app/.wwg/reports/wwg-refresh-context-report.json`
- `hris-app/.wwg/reports/wwg-refresh-context-report.md`
- `hris-app/.wwg/reports/wwg-validate-report.md`
- `hris-app/.wwg/wiki/03-requirements/functional-requirements.md`
- `hris-app/.wwg/wiki/06-domain/entities.md`
- `hris-app/.wwg/wiki/06-domain/rules.md`
- `hris-app/.wwg/wiki/06-domain/workflows.md`
- `hris-app/.wwg/wiki/07-ux/screens.md`
- `hris-app/.wwg/wiki/index.md`
- `hris-app/.wwg/wiki/project-truth-summary.md`
- `hris-app/.wwg/wiki/project-truth.md`
- `hris-app/.wwg/wiki/terminology-summary.md`
- `hris-app/.wwg/wiki/terminology.md`
- `hris-app/.wwg/workspace/agents/codex.md`
- `hris-app/.wwg/workspace/context/chain-state-template.md`
- `hris-app/.wwg/workspace/current-task.md`
- `hris-app/.wwg/workspace/prompts/chain-pass-template.md`
- `hris-app/AGENTS.md`
- `hris-app/docs/design-system.md`
- `hris-app/docs/testing-strategy.md`

### app-lock-package (2)

- `hris-app/package-lock.json`
- `hris-app/package.json`

## Skipped junk

- `hris-api/.cloudinary-api-key.tmp`
- `hris-api/.cloudinary-api-secret.tmp`
- `hris-api/.cloudinary-cloud-name.tmp`
- `hris-api/.env copy`
- `hris-api/.env.backup-neon-20260609-092951`
- `hris-api/.fix-temp.txt`
- `hris-api/.gitignore copy`

## Env took develop

- `hris-api/.env`
- `hris-api/.env.dev`
- `hris-api/.env.example`
- `hris-api/.env.uat`
- `hris-api/infrastructure/onprem/observability/.env.example`
