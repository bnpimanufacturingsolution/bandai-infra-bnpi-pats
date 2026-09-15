# Union merge conflicts — stopped per option C

Branch: `import/bnpi-pats-standalone-develop-snapshot`
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

- `bnpi-pats-api/app/device/device.controller.ts`
- `bnpi-pats-api/app/device/device.router.ts`
- `bnpi-pats-api/app/hikvision/controller/access.control.controller.ts`
- `bnpi-pats-api/app/hikvision/controller/callback.controller.ts`
- `bnpi-pats-api/config/hikvision.endpoint.ts`
- `bnpi-pats-api/helper/device-event-realtime.helper.ts`
- `bnpi-pats-api/helper/hikvision-event-contract.helper.ts`
- `bnpi-pats-api/lib/hikvision-client.ts`
- `bnpi-pats-api/prisma/schema-postgres/device.prisma`
- `bnpi-pats-api/prisma/schema/device.prisma`
- `bnpi-pats-api/prisma/seeds/deviceSeeder.ts`
- `bnpi-pats-api/scripts/audit-hikvision-device-events.ts`
- `bnpi-pats-api/tests/device-event-realtime.helper.spec.ts`
- `bnpi-pats-api/tests/dm4-biometric-proof.spec.ts`
- `bnpi-pats-api/tests/hikvision-event-contract.helper.spec.ts`
- `bnpi-pats-api/zod/device.zod.ts`

### api-observability-infra (15)

- `bnpi-pats-api/Dockerfile`
- `bnpi-pats-api/docker-compose.postgres-rw.yml`
- `bnpi-pats-api/helper/logger.helper.ts`
- `bnpi-pats-api/helper/telemetry.ts`
- `bnpi-pats-api/infrastructure/onprem/observability/README.md`
- `bnpi-pats-api/infrastructure/onprem/observability/backup/backup.sh`
- `bnpi-pats-api/infrastructure/onprem/observability/backup/loop.sh`
- `bnpi-pats-api/infrastructure/onprem/observability/docker-compose.yml`
- `bnpi-pats-api/infrastructure/onprem/observability/grafana/provisioning/dashboards/bnpi-pats-container-logs.json`
- `bnpi-pats-api/infrastructure/onprem/observability/grafana/provisioning/datasources/datasources.yml`
- `bnpi-pats-api/infrastructure/onprem/observability/loki/loki-config.yml`
- `bnpi-pats-api/infrastructure/onprem/observability/prometheus/alerts.yml`
- `bnpi-pats-api/infrastructure/onprem/observability/prometheus/prometheus.yml`
- `bnpi-pats-api/infrastructure/onprem/observability/promtail/promtail-config.yml`
- `bnpi-pats-api/utils/auditLogger.ts`

### api-wwg-docs-meta (22)

- `bnpi-pats-api/.wwg/config/wwg.project.yaml`
- `bnpi-pats-api/.wwg/reports/context-skill-quality.json`
- `bnpi-pats-api/.wwg/reports/context-skill-quality.md`
- `bnpi-pats-api/.wwg/reports/runtime-skill-candidates.json`
- `bnpi-pats-api/.wwg/reports/runtime-skill-candidates.md`
- `bnpi-pats-api/.wwg/reports/wwg-agent-handoff.json`
- `bnpi-pats-api/.wwg/reports/wwg-agent-handoff.md`
- `bnpi-pats-api/.wwg/reports/wwg-handoff-to-codex.json`
- `bnpi-pats-api/.wwg/reports/wwg-handoff-to-codex.md`
- `bnpi-pats-api/.wwg/reports/wwg-validate-report.md`
- `bnpi-pats-api/.wwg/wiki/project-truth-summary.md`
- `bnpi-pats-api/.wwg/wiki/project-truth.md`
- `bnpi-pats-api/.wwg/wiki/terminology-summary.md`
- `bnpi-pats-api/.wwg/wiki/terminology.md`
- `bnpi-pats-api/.wwg/workspace/current-task.md`
- `bnpi-pats-api/AGENTS.md`
- `bnpi-pats-api/CHANGELOG.md`
- `bnpi-pats-api/docs/CONSOLIDATED_SCHEMA.md`
- `bnpi-pats-api/docs/Create a New Service Guide.md`
- `bnpi-pats-api/docs/DOCKER_SETUP.md`
- `bnpi-pats-api/docs/PAYROLL_CYCLE_RULES_CONFIG.md`
- `bnpi-pats-api/docs/testing-strategy.md`

### api-product-core (114)

- `bnpi-pats-api/.github/workflows/deploy.yml`
- `bnpi-pats-api/.gitignore`
- `bnpi-pats-api/app/agency/agency.controller.ts`
- `bnpi-pats-api/app/applicant/applicant.controller.ts`
- `bnpi-pats-api/app/attendance/attendance-backfill.service.ts`
- `bnpi-pats-api/app/attendance/attendance-correction.service.ts`
- `bnpi-pats-api/app/attendance/attendance-import.service.ts`
- `bnpi-pats-api/app/attendance/attendance.controller.ts`
- `bnpi-pats-api/app/auth/auth.controller.ts`
- `bnpi-pats-api/app/auth/auth.router.ts`
- `bnpi-pats-api/app/calendar-item/calendar-item.controller.ts`
- `bnpi-pats-api/app/calendar-item/calendar-item.router.ts`
- `bnpi-pats-api/app/celebrations/celebrations.controller.ts`
- `bnpi-pats-api/app/celebrations/celebrations.router.ts`
- `bnpi-pats-api/app/cron/cron.service.ts`
- `bnpi-pats-api/app/documentFolder/documentFolder.controller.ts`
- `bnpi-pats-api/app/documentType/documentType.controller.ts`
- `bnpi-pats-api/app/employee/employee.controller.ts`
- `bnpi-pats-api/app/employee/employee.router.ts`
- `bnpi-pats-api/app/employeeBenefit/employeeBenefit.controller.ts`
- `bnpi-pats-api/app/employeeBenefit/employeeBenefit.router.ts`
- `bnpi-pats-api/app/employeeSchedule/employeeSchedule.controller.ts`
- `bnpi-pats-api/app/employeepayroll/employeepayroll.controller.ts`
- `bnpi-pats-api/app/employeepayroll/employeepayroll.router.ts`
- `bnpi-pats-api/app/leaveSetting/leaveSetting.controller.ts`
- `bnpi-pats-api/app/metrics/metrics.controller.ts`
- `bnpi-pats-api/app/migration/dm4-migration.adapter.ts`
- `bnpi-pats-api/app/migration/migration-dry-run.service.ts`
- `bnpi-pats-api/app/migration/migration.controller.ts`
- `bnpi-pats-api/app/notification/notification.controller.ts`
- `bnpi-pats-api/app/payrollperiod/payrollperiod.controller.ts`
- `bnpi-pats-api/app/position/position.controller.ts`
- `bnpi-pats-api/app/request/request.controller.ts`
- `bnpi-pats-api/app/systemProvisioning/systemProvisioning.controller.ts`
- `bnpi-pats-api/app/systemProvisioning/systemProvisioning.service.ts`
- `bnpi-pats-api/app/template/template.controller.ts`
- `bnpi-pats-api/app/termination/termination.controller.ts`
- `bnpi-pats-api/app/timesheet/timesheet.controller.ts`
- `bnpi-pats-api/app/timesheet/timesheet.router.ts`
- `bnpi-pats-api/app/workflowConfig/workflowConfig.controller.ts`
- `bnpi-pats-api/app/workforceRecruitmentSetting/workforceRecruitmentSetting.controller.ts`
- `bnpi-pats-api/app/workforceRecruitmentSetting/workforceRecruitmentSetting.router.ts`
- `bnpi-pats-api/config/config.ts`
- `bnpi-pats-api/config/constant.ts`
- `bnpi-pats-api/cron-entry.ts`
- `bnpi-pats-api/helper/action-metrics.helper.ts`
- `bnpi-pats-api/helper/attendance-metrics-common.helper.ts`
- `bnpi-pats-api/helper/attendance-metrics-detailed.helper.ts`
- `bnpi-pats-api/helper/attendance-obligation-metrics.helper.ts`
- `bnpi-pats-api/helper/attendance-obligation.helper.ts`
- `bnpi-pats-api/helper/cloudinary.helper.ts`
- `bnpi-pats-api/helper/eligibility.helper.ts`
- `bnpi-pats-api/helper/employee-benefit-program.helper.ts`
- `bnpi-pats-api/helper/leave-balance-metrics.helper.ts`
- `bnpi-pats-api/helper/leave-policy.helper.ts`
- `bnpi-pats-api/helper/manpower-distribution-reference.helper.ts`
- `bnpi-pats-api/helper/notification-dispatch.helper.ts`
- `bnpi-pats-api/helper/payroll-period.helper.ts`
- `bnpi-pats-api/helper/payslip-pdf.helper.ts`
- `bnpi-pats-api/helper/timekeeping.helper.ts`
- `bnpi-pats-api/helper/timesheet-config.helper.ts`
- `bnpi-pats-api/helper/timesheet-line-version.helper.ts`
- `bnpi-pats-api/helper/timesheet.helper.ts`
- `bnpi-pats-api/helper/workflow-config.helper.ts`
- `bnpi-pats-api/helper/workforce-recruitment.helper.ts`
- `bnpi-pats-api/index.ts`
- `bnpi-pats-api/middleware/verifyToken.ts`
- `bnpi-pats-api/prisma/schema-postgres/bootstrap.sql`
- `bnpi-pats-api/prisma/schema-postgres/employee.prisma`
- `bnpi-pats-api/prisma/schema-postgres/employeebenefit.prisma`
- `bnpi-pats-api/prisma/schema-postgres/employeepayroll.prisma`
- `bnpi-pats-api/prisma/schema-postgres/payrollperiod.prisma`
- `bnpi-pats-api/prisma/schema-postgres/request.prisma`
- `bnpi-pats-api/prisma/schema-postgres/timesheet.prisma`
- `bnpi-pats-api/prisma/schema/employee.prisma`
- `bnpi-pats-api/prisma/schema/employeebenefit.prisma`
- `bnpi-pats-api/prisma/schema/employeepayroll.prisma`
- `bnpi-pats-api/prisma/schema/payrollperiod.prisma`
- `bnpi-pats-api/prisma/schema/request.prisma`
- `bnpi-pats-api/prisma/schema/timesheet.prisma`
- `bnpi-pats-api/prisma/seed.ts`
- `bnpi-pats-api/prisma/seeds/benefitTypeSeeder.ts`
- `bnpi-pats-api/prisma/seeds/defaultProjectSeeder.ts`
- `bnpi-pats-api/prisma/seeds/generalEmployeeSeeder.shared.ts`
- `bnpi-pats-api/prisma/seeds/requestWorkflowCatalog.ts`
- `bnpi-pats-api/scripts/cleanup-emitted-js.cjs`
- `bnpi-pats-api/scripts/dry-run-attendance-clock-contract.ts`
- `bnpi-pats-api/scripts/ensure-dev-port-ownership.cjs`
- `bnpi-pats-api/scripts/ensure-local-dev-services.cjs`
- `bnpi-pats-api/scripts/profile-attendance-metrics.ts`
- `bnpi-pats-api/tests/attendance-backfill.service.spec.ts`
- `bnpi-pats-api/tests/db/isolated-db-faults.spec.ts`
- `bnpi-pats-api/tests/db/isolated-prisma.integration.spec.ts`
- `bnpi-pats-api/tests/leaveType.controller.spec.ts`
- `bnpi-pats-api/tests/payslip-pdf.helper.spec.ts`
- `bnpi-pats-api/tests/section.controller.spec.ts`
- `bnpi-pats-api/tests/seed-and-qa-script-safety.spec.ts`
- `bnpi-pats-api/tests/wwg/app-module-contract.behavior.spec.ts`
- `bnpi-pats-api/tests/wwg/function-coverage.explicit.spec.ts`
- `bnpi-pats-api/tests/wwg/request-workforce-cache-auth.behavior.spec.ts`
- `bnpi-pats-api/tests/wwg/tax-timekeeping.behavior.spec.ts`
- `bnpi-pats-api/webpack.config.js`
- `bnpi-pats-api/wiki-template/base/08-operations/monitoring.md`
- `bnpi-pats-api/zod/celebrations.zod.ts`
- `bnpi-pats-api/zod/employee.zod.ts`
- `bnpi-pats-api/zod/employeebenefit.zod.ts`
- `bnpi-pats-api/zod/employeepayroll.zod.ts`
- `bnpi-pats-api/zod/metrics.zod.ts`
- `bnpi-pats-api/zod/notification.zod.ts`
- `bnpi-pats-api/zod/payrollperiod.zod.ts`
- `bnpi-pats-api/zod/position.zod.ts`
- `bnpi-pats-api/zod/request.zod.ts`
- `bnpi-pats-api/zod/timesheet.zod.ts`
- `bnpi-pats-api/zod/timesheetconfig.zod.ts`

### api-lock-package (2)

- `bnpi-pats-api/package-lock.json`
- `bnpi-pats-api/package.json`

### app-device-admin (7)

- `bnpi-pats-app/app/lib/hooks/use-hikvision.ts`
- `bnpi-pats-app/app/lib/hooks/useDevices.ts`
- `bnpi-pats-app/app/routes/admin/devices/enroll.tsx`
- `bnpi-pats-app/app/routes/admin/devices/events.tsx`
- `bnpi-pats-app/app/routes/admin/devices/manage.tsx`
- `bnpi-pats-app/app/services/devices.service.ts`
- `bnpi-pats-app/app/services/hikvision.service.ts`

### app-product-ui (208)

- `bnpi-pats-app/.dockerignore`
- `bnpi-pats-app/.gitignore`
- `bnpi-pats-app/DOCUMENTATION_INDEX.md`
- `bnpi-pats-app/Dockerfile`
- `bnpi-pats-app/app/app.css`
- `bnpi-pats-app/app/assets/bandai_logo.png`
- `bnpi-pats-app/app/components/atoms/Avatar.tsx`
- `bnpi-pats-app/app/components/atoms/Card.tsx`
- `bnpi-pats-app/app/components/atoms/DataTable.test.tsx`
- `bnpi-pats-app/app/components/atoms/DataTable.tsx`
- `bnpi-pats-app/app/components/atoms/FieldMappingRow.tsx`
- `bnpi-pats-app/app/components/atoms/Input.tsx`
- `bnpi-pats-app/app/components/atoms/LoadingScreen.tsx`
- `bnpi-pats-app/app/components/atoms/Modal.tsx`
- `bnpi-pats-app/app/components/atoms/Select.tsx`
- `bnpi-pats-app/app/components/atoms/SummaryCard.tsx`
- `bnpi-pats-app/app/components/atoms/TimesheetDayCell.test.tsx`
- `bnpi-pats-app/app/components/atoms/TimesheetDayCell.tsx`
- `bnpi-pats-app/app/components/dashboards/dashboard-skeleton.tsx`
- `bnpi-pats-app/app/components/dashboards/employee-dashboard.tsx`
- `bnpi-pats-app/app/components/dashboards/hr-manager-dashboard.tsx`
- `bnpi-pats-app/app/components/dashboards/hr-user-dashboard.tsx`
- `bnpi-pats-app/app/components/dashboards/manager-dashboard.tsx`
- `bnpi-pats-app/app/components/dashboards/shared/cards/action-needed-card.tsx`
- `bnpi-pats-app/app/components/dashboards/shared/cards/employee-calendar-card.tsx`
- `bnpi-pats-app/app/components/dashboards/shared/cards/hr-queue-card.tsx`
- `bnpi-pats-app/app/components/dashboards/shared/cards/profile-header-card.tsx`
- `bnpi-pats-app/app/components/dashboards/shared/cards/quick-actions-card.tsx`
- `bnpi-pats-app/app/components/dashboards/shared/cards/request-list-card.tsx`
- `bnpi-pats-app/app/components/dashboards/shared/cards/time-off-card.tsx`
- `bnpi-pats-app/app/components/dashboards/shared/request-helpers.ts`
- `bnpi-pats-app/app/components/dashboards/shared/role-dashboard-shell.tsx`
- `bnpi-pats-app/app/components/dashboards/shared/role-dashboard.types.ts`
- `bnpi-pats-app/app/components/debug/LoginDebug.tsx`
- `bnpi-pats-app/app/components/modals/ChangePasswordModal.tsx`
- `bnpi-pats-app/app/components/modals/JobRequisitionRequestModal.test.tsx`
- `bnpi-pats-app/app/components/molecules/AttendanceScopeFilterPopover.tsx`
- `bnpi-pats-app/app/components/molecules/DepartmentSelect.stories.tsx`
- `bnpi-pats-app/app/components/molecules/EmployeeTableCell.test.tsx`
- `bnpi-pats-app/app/components/molecules/EmployeeTableCell.tsx`
- `bnpi-pats-app/app/components/molecules/ExitClearanceSection.tsx`
- `bnpi-pats-app/app/components/molecules/HrDataTableFilters.tsx`
- `bnpi-pats-app/app/components/molecules/RequestReviewModal.tsx`
- `bnpi-pats-app/app/components/molecules/TagInput.tsx`
- `bnpi-pats-app/app/components/molecules/TimesheetCalendar.test.tsx`
- `bnpi-pats-app/app/components/molecules/TimesheetCalendar.tsx`
- `bnpi-pats-app/app/components/molecules/TimesheetCalendarApproval.tsx`
- `bnpi-pats-app/app/components/molecules/TimesheetDayTooltipContent.test.tsx`
- `bnpi-pats-app/app/components/molecules/TimesheetDayTooltipContent.tsx`
- `bnpi-pats-app/app/components/molecules/TimesheetHoursOverview.tsx`
- `bnpi-pats-app/app/components/molecules/calendars/create-item-calendar.tsx`
- `bnpi-pats-app/app/components/molecules/calendars/event-details-modal.tsx`
- `bnpi-pats-app/app/components/molecules/employee/SystemAccessForm.tsx`
- `bnpi-pats-app/app/components/molecules/guide/sidebar-item.tsx`
- `bnpi-pats-app/app/components/molecules/index.ts`
- `bnpi-pats-app/app/components/molecules/job-management/job-tag-list.tsx`
- `bnpi-pats-app/app/components/molecules/shared/AdminTabs.tsx`
- `bnpi-pats-app/app/components/molecules/shared/JourneyTimeline.tsx`
- `bnpi-pats-app/app/components/molecules/shared/Navigation.tsx`
- `bnpi-pats-app/app/components/molecules/shared/WorkScheduleForm.tsx`
- `bnpi-pats-app/app/components/organisms/Sidebar.tsx`
- `bnpi-pats-app/app/components/organisms/TimesheetView.tsx`
- `bnpi-pats-app/app/components/organisms/TimesheetViewModal.test.tsx`
- `bnpi-pats-app/app/components/organisms/TimesheetViewModal.tsx`
- `bnpi-pats-app/app/components/organisms/calendars/calendar-view-page.tsx`
- `bnpi-pats-app/app/components/organisms/employee-detail/employee-document-action-modal.tsx`
- `bnpi-pats-app/app/components/organisms/employee-detail/employment-details-tab.tsx`
- `bnpi-pats-app/app/components/organisms/employee-detail/personal-info-tab.tsx`
- `bnpi-pats-app/app/components/organisms/hr-public/applicant-card.tsx`
- `bnpi-pats-app/app/components/organisms/index.ts`
- `bnpi-pats-app/app/components/organisms/leave-request-modal.tsx`
- `bnpi-pats-app/app/components/organisms/settings/WorkforceRecruitmentSettingsModule.test.tsx`
- `bnpi-pats-app/app/components/organisms/settings/WorkforceRecruitmentSettingsModule.tsx`
- `bnpi-pats-app/app/components/organisms/timesheet-modal.tsx`
- `bnpi-pats-app/app/components/shared/EmployeeDirectoryView.tsx`
- `bnpi-pats-app/app/components/shared/EmployeeList.test.tsx`
- `bnpi-pats-app/app/components/shared/EmployeeList.tsx`
- `bnpi-pats-app/app/components/templates/add-employee-template.tsx`
- `bnpi-pats-app/app/components/templates/common/attendance-management-template.tsx`
- `bnpi-pats-app/app/components/templates/common/attendance-template.tsx`
- `bnpi-pats-app/app/components/templates/common/billings-template.tsx`
- `bnpi-pats-app/app/components/templates/common/payroll-management-template.tsx`
- `bnpi-pats-app/app/components/templates/common/payroll-template.tsx`
- `bnpi-pats-app/app/components/templates/common/profile-template.tsx`
- `bnpi-pats-app/app/components/templates/common/run-payroll-template.tsx`
- `bnpi-pats-app/app/components/templates/employee-form.tsx`
- `bnpi-pats-app/app/components/templates/employee/payslip-detail-template.tsx`
- `bnpi-pats-app/app/components/templates/guide-layout.tsx`
- `bnpi-pats-app/app/components/templates/guide-template-page.tsx`
- `bnpi-pats-app/app/components/templates/guide-template.tsx`
- `bnpi-pats-app/app/components/templates/hr/benefit-types-template.tsx`
- `bnpi-pats-app/app/components/templates/hr/benefits-management-template.tsx`
- `bnpi-pats-app/app/components/templates/my-pages/requests-hub-template.tsx`
- `bnpi-pats-app/app/components/templates/my-pages/requests-time-requests-template.tsx`
- `bnpi-pats-app/app/components/templates/requests/expense-reimbursement-template.tsx`
- `bnpi-pats-app/app/components/templates/requests/leave-template.tsx`
- `bnpi-pats-app/app/components/ui/calendar.tsx`
- `bnpi-pats-app/app/components/ui/dropdown-menu.tsx`
- `bnpi-pats-app/app/components/ui/input.tsx`
- `bnpi-pats-app/app/components/ui/tooltip.tsx`
- `bnpi-pats-app/app/contexts/auth-provider.tsx`
- `bnpi-pats-app/app/examples/boardingTemplateWithItemsExample.tsx`
- `bnpi-pats-app/app/examples/job-application-form-examples.tsx`
- `bnpi-pats-app/app/guard/TimeLoggingGuard.tsx`
- `bnpi-pats-app/app/guards/auth-guard.tsx`
- `bnpi-pats-app/app/hooks/useLevelsByPosition.ts`
- `bnpi-pats-app/app/hooks/useTagManager.ts`
- `bnpi-pats-app/app/layouts/admin-layout.tsx`
- `bnpi-pats-app/app/layouts/unified-layout.tsx`
- `bnpi-pats-app/app/lib/api-client.ts`
- `bnpi-pats-app/app/lib/api-url.helper.test.ts`
- `bnpi-pats-app/app/lib/api-url.helper.ts`
- `bnpi-pats-app/app/lib/bir-2316-mock-data.ts`
- `bnpi-pats-app/app/lib/ci-cd-quality-gates.test.ts`
- `bnpi-pats-app/app/lib/document-request-handler.ts`
- `bnpi-pats-app/app/lib/form-validation.ts`
- `bnpi-pats-app/app/lib/hooks/useEmployeeBenefits.ts`
- `bnpi-pats-app/app/lib/hooks/useEmployeePayroll.ts`
- `bnpi-pats-app/app/lib/hooks/useEmployees.ts`
- `bnpi-pats-app/app/lib/hooks/useMetrics.ts`
- `bnpi-pats-app/app/lib/hooks/useRequests.ts`
- `bnpi-pats-app/app/lib/hooks/useTimesheets.test.tsx`
- `bnpi-pats-app/app/lib/hooks/useTimesheets.ts`
- `bnpi-pats-app/app/lib/hooks/useWorkforceRecruitmentSettings.ts`
- `bnpi-pats-app/app/lib/mock-data.ts`
- `bnpi-pats-app/app/lib/notification-navigation.ts`
- `bnpi-pats-app/app/lib/pdfGenerator.ts`
- `bnpi-pats-app/app/lib/runtime-api-base.ts`
- `bnpi-pats-app/app/lib/status-config.ts`
- `bnpi-pats-app/app/lib/utils/manpower-distribution-links.test.ts`
- `bnpi-pats-app/app/lib/utils/manpower-distribution-links.ts`
- `bnpi-pats-app/app/lib/workforce-recruitment-coverage.test.ts`
- `bnpi-pats-app/app/lib/workforce-recruitment-coverage.ts`
- `bnpi-pats-app/app/root.tsx`
- `bnpi-pats-app/app/routes.ts`
- `bnpi-pats-app/app/routes/admin/configuration/positions.tsx`
- `bnpi-pats-app/app/routes/admin/configuration/users.test.tsx`
- `bnpi-pats-app/app/routes/admin/configuration/users.tsx`
- `bnpi-pats-app/app/routes/admin/dashboard.tsx`
- `bnpi-pats-app/app/routes/admin/rules-policies/workflows.tsx`
- `bnpi-pats-app/app/routes/announcements.tsx`
- `bnpi-pats-app/app/routes/auth/login.tsx`
- `bnpi-pats-app/app/routes/celebrations/birthdays.tsx`
- `bnpi-pats-app/app/routes/employee/$id.attendance.tsx`
- `bnpi-pats-app/app/routes/employee/approvals.$type.tsx`
- `bnpi-pats-app/app/routes/employee/approvals.tsx`
- `bnpi-pats-app/app/routes/employee/dashboard/TimesheetsTab.test.tsx`
- `bnpi-pats-app/app/routes/employee/dashboard/TimesheetsTab.tsx`
- `bnpi-pats-app/app/routes/employee/employee.$id.tsx`
- `bnpi-pats-app/app/routes/employee/leave/index.ts`
- `bnpi-pats-app/app/routes/employee/team/OrganizationChartTab.tsx`
- `bnpi-pats-app/app/routes/employee/team/TeamSchedulesTab.tsx`
- `bnpi-pats-app/app/routes/hr/approvals.$type.tsx`
- `bnpi-pats-app/app/routes/hr/approvals/EmployeeRequestsTab.tsx`
- `bnpi-pats-app/app/routes/hr/boarding-template-builder.tsx`
- `bnpi-pats-app/app/routes/hr/employee-documents.tsx`
- `bnpi-pats-app/app/routes/hr/employee-import.tsx`
- `bnpi-pats-app/app/routes/hr/employee-status-changes.tsx`
- `bnpi-pats-app/app/routes/hr/employees.tsx`
- `bnpi-pats-app/app/routes/hr/leave/index.ts`
- `bnpi-pats-app/app/routes/hr/payroll.tsx`
- `bnpi-pats-app/app/routes/hr/recruitment-page.tsx`
- `bnpi-pats-app/app/routes/hr/reports/BIRReportTab.tsx`
- `bnpi-pats-app/app/routes/hr/reports/attendance.tsx`
- `bnpi-pats-app/app/routes/hr/reports/components/ReportEmployeeCell.tsx`
- `bnpi-pats-app/app/routes/hr/reports/payroll.tsx`
- `bnpi-pats-app/app/routes/hr/reports/tabs/DailyManpowerTab.tsx`
- `bnpi-pats-app/app/routes/hr/reports/tabs/DirectIndirectLaborTab.tsx`
- `bnpi-pats-app/app/routes/hr/reports/tabs/LeaveBalanceTab.tsx`
- `bnpi-pats-app/app/routes/hr/reports/tabs/ManpowerDistributionTab.tsx`
- `bnpi-pats-app/app/routes/hr/reports/tabs/NoWorkReportTab.tsx`
- `bnpi-pats-app/app/routes/hr/reports/tabs/OvertimeTab.tsx`
- `bnpi-pats-app/app/routes/hr/reports/tabs/TardinessUndetimeTab.tsx`
- `bnpi-pats-app/app/routes/hr/timesheets.tsx`
- `bnpi-pats-app/app/routes/landing.tsx`
- `bnpi-pats-app/app/routes/setup.tsx`
- `bnpi-pats-app/app/routes/time-logging.tsx`
- `bnpi-pats-app/app/services/applicant.service.ts`
- `bnpi-pats-app/app/services/auth-service.ts`
- `bnpi-pats-app/app/services/employee-benefit.service.ts`
- `bnpi-pats-app/app/services/employees.service.test.ts`
- `bnpi-pats-app/app/services/employees.service.ts`
- `bnpi-pats-app/app/services/leave.service.ts`
- `bnpi-pats-app/app/services/metrics.service.test.ts`
- `bnpi-pats-app/app/services/metrics.service.ts`
- `bnpi-pats-app/app/services/payroll-periods.service.ts`
- `bnpi-pats-app/app/services/payroll.service.ts`
- `bnpi-pats-app/app/services/reports.service.ts`
- `bnpi-pats-app/app/services/requests.service.test.ts`
- `bnpi-pats-app/app/services/requests.service.ts`
- `bnpi-pats-app/app/services/timesheet.service.ts`
- `bnpi-pats-app/app/services/workflow-configs.service.ts`
- `bnpi-pats-app/app/services/workforce-recruitment-settings.service.ts`
- `bnpi-pats-app/app/test/setup.ts`
- `bnpi-pats-app/app/types/calendar.ts`
- `bnpi-pats-app/app/types/employee-payroll.ts`
- `bnpi-pats-app/app/types/index.ts`
- `bnpi-pats-app/app/types/workSchedule.ts`
- `bnpi-pats-app/app/zod/employee-benefit.zod.ts`
- `bnpi-pats-app/app/zod/notification.ts`
- `bnpi-pats-app/app/zod/position.zod.ts`
- `bnpi-pats-app/playwright.smoke.config.ts`
- `bnpi-pats-app/react-router.config.ts`
- `bnpi-pats-app/scripts/admin-config-pattern-intelligence.ts`
- `bnpi-pats-app/scripts/delete-employee-with-relations.ts`
- `bnpi-pats-app/scripts/fix-route-references.ts`
- `bnpi-pats-app/vite.config.ts`
- `bnpi-pats-app/vitest.config.ts`

### app-wwg-docs-meta (36)

- `bnpi-pats-app/.wwg/config/wwg.project.yaml`
- `bnpi-pats-app/.wwg/governance/development-operating-model.md`
- `bnpi-pats-app/.wwg/governance/drift-guard.md`
- `bnpi-pats-app/.wwg/governance/recommendation-registry.md`
- `bnpi-pats-app/.wwg/reports/context-skill-quality.json`
- `bnpi-pats-app/.wwg/reports/context-skill-quality.md`
- `bnpi-pats-app/.wwg/reports/generated-project-upgrade-review.json`
- `bnpi-pats-app/.wwg/reports/generated-project-upgrade-review.md`
- `bnpi-pats-app/.wwg/reports/runtime-skill-candidates.json`
- `bnpi-pats-app/.wwg/reports/runtime-skill-candidates.md`
- `bnpi-pats-app/.wwg/reports/wwg-agent-handoff.json`
- `bnpi-pats-app/.wwg/reports/wwg-agent-handoff.md`
- `bnpi-pats-app/.wwg/reports/wwg-audit-report.json`
- `bnpi-pats-app/.wwg/reports/wwg-audit-report.md`
- `bnpi-pats-app/.wwg/reports/wwg-handoff-to-codex.json`
- `bnpi-pats-app/.wwg/reports/wwg-handoff-to-codex.md`
- `bnpi-pats-app/.wwg/reports/wwg-refresh-context-report.json`
- `bnpi-pats-app/.wwg/reports/wwg-refresh-context-report.md`
- `bnpi-pats-app/.wwg/reports/wwg-validate-report.md`
- `bnpi-pats-app/.wwg/wiki/03-requirements/functional-requirements.md`
- `bnpi-pats-app/.wwg/wiki/06-domain/entities.md`
- `bnpi-pats-app/.wwg/wiki/06-domain/rules.md`
- `bnpi-pats-app/.wwg/wiki/06-domain/workflows.md`
- `bnpi-pats-app/.wwg/wiki/07-ux/screens.md`
- `bnpi-pats-app/.wwg/wiki/index.md`
- `bnpi-pats-app/.wwg/wiki/project-truth-summary.md`
- `bnpi-pats-app/.wwg/wiki/project-truth.md`
- `bnpi-pats-app/.wwg/wiki/terminology-summary.md`
- `bnpi-pats-app/.wwg/wiki/terminology.md`
- `bnpi-pats-app/.wwg/workspace/agents/codex.md`
- `bnpi-pats-app/.wwg/workspace/context/chain-state-template.md`
- `bnpi-pats-app/.wwg/workspace/current-task.md`
- `bnpi-pats-app/.wwg/workspace/prompts/chain-pass-template.md`
- `bnpi-pats-app/AGENTS.md`
- `bnpi-pats-app/docs/design-system.md`
- `bnpi-pats-app/docs/testing-strategy.md`

### app-lock-package (2)

- `bnpi-pats-app/package-lock.json`
- `bnpi-pats-app/package.json`

## Skipped junk

- `bnpi-pats-api/.cloudinary-api-key.tmp`
- `bnpi-pats-api/.cloudinary-api-secret.tmp`
- `bnpi-pats-api/.cloudinary-cloud-name.tmp`
- `bnpi-pats-api/.env copy`
- `bnpi-pats-api/.env.backup-neon-20260609-092951`
- `bnpi-pats-api/.fix-temp.txt`
- `bnpi-pats-api/.gitignore copy`

## Env took develop

- `bnpi-pats-api/.env`
- `bnpi-pats-api/.env.dev`
- `bnpi-pats-api/.env.example`
- `bnpi-pats-api/.env.uat`
- `bnpi-pats-api/infrastructure/onprem/observability/.env.example`
