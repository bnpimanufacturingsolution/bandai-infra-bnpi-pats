import { type RouteConfig, index, layout, prefix, route } from "@react-router/dev/routes";

const authRoutes = [route("auth/login", "routes/auth/login.tsx")];

const legalRoutes = [
	route("terms", "routes/legal/terms-of-use.tsx"),
	route("privacy", "routes/legal/privacy-policy.tsx"),
];

const supportRoutes = [
	route("help", "routes/support/help-desk.tsx"),
	route("faq", "routes/support/faq.tsx"),
];

const userRoutes = [
	route("home", "routes/profile/home.tsx"),
	route("profile/:id", "routes/profile/user-profile.tsx"),
	route("notifications", "routes/profile/notifications.tsx"),
	...prefix("history", [
		index("routes/profile/history.tsx"),
		route(":id", "routes/profile/history-details.tsx"),
	]),
];

const adminRoutes = [
	route("dashboard", "routes/admin/dashboard.tsx"),
	route("celebrations/birthdays", "routes/admin/celebrations-birthdays.tsx"),
	route("analytics", "routes/admin/analytics.tsx"),
	...prefix("configuration", [
		route("company-profile", "routes/admin/configuration/company-profile.tsx"),
		route("migration", "routes/admin/configuration/migration.tsx"),
		route("departments", "routes/admin/configuration/departments.tsx"),
		route("agencies", "routes/admin/configuration/agencies.tsx"),
		route("positions", "routes/admin/configuration/positions.tsx"),
		route("levels", "routes/admin/configuration/levels.tsx"),
		route("sections", "routes/admin/configuration/sections.tsx"),
		route("employees", "routes/admin/configuration/employees.tsx"),
		route("employees/new", "routes/hr/employees.new.tsx", {
			id: "admin-configuration-employees-new",
		}),
		route("employees/:id/edit", "routes/hr/employees.$id.edit.tsx", {
			id: "admin-configuration-employees-edit",
		}),
		route("users", "routes/admin/configuration/users.tsx"),
		route("shift-types", "routes/admin/configuration/shift-types.tsx"),
		route("schedule-templates", "routes/admin/configuration/schedule-templates.tsx"),
		route("leave-types", "routes/admin/configuration/leave-types.tsx"),
		route("schedules", "routes/admin/configuration/schedules.tsx"),
		route("document-201-types", "routes/admin/configuration/document-201-types.tsx"),
		route("benefit-types", "routes/admin/configuration/benefit-types.tsx"),
		route("devices", "routes/admin/configuration/devices.tsx"),
		route("devices/events", "routes/admin/devices/events.tsx", {
			id: "admin-configuration-devices-events",
		}),
		route("devices/enroll", "routes/admin/devices/enroll.tsx", {
			id: "admin-configuration-devices-enroll",
		}),
		route("loan-types", "routes/admin/configuration/loan-types.tsx"),
		route("calendar-items", "routes/admin/configuration/calendar-items.tsx"),
		route("holidays", "routes/admin/configuration/holidays.tsx"),
		route("payroll-periods", "routes/admin/configuration/payroll-periods.tsx"),
		route("workflows", "routes/admin/configuration/workflows.tsx"),
		route("guide", "routes/admin/configuration/admin-guide-page.tsx"),
	]),
	...prefix("rules-policies", [
		route("payroll", "routes/admin/rules-policies/payroll.tsx"),
		route("leave", "routes/admin/rules-policies/leave.tsx"),
		route("timesheet", "routes/admin/rules-policies/timesheet.tsx"),
		route("recruitment", "routes/admin/rules-policies/recruitment.tsx"),
		route("workflows", "routes/admin/rules-policies/workflows.tsx"),
	]),
	...prefix("devices", [
		route("manage", "routes/admin/devices/manage.tsx"),
		route("manage/:id", "routes/admin/devices/manage.$id.tsx"),
		route("enroll", "routes/admin/devices/enroll.tsx"),
		route("events", "routes/admin/devices/events.tsx"),
	]),
	route("audit-logs", "routes/admin/audit-logs.tsx"),
	route("activity-logs", "routes/admin/activity-logs.tsx"),
	route("settings", "routes/admin/settings.tsx"),
	route("disciplinary-action", "routes/admin/disciplinary-action.tsx"),
	route("messages", "routes/admin/messages.tsx"),
	route("notifications", "routes/admin/notifications.tsx"),
	route("help", "routes/admin/help.tsx"),
	// Profile
	route("profile", "routes/admin/profile.tsx"),
];

const employeeRoutes = [
	...prefix("approvals", [
		route("requests", "routes/employee/approvals.tsx"),
		route("timesheet", "routes/employee/approvals.tsx", {
			id: "employee-approvals-timesheet",
		}),
	]),
	...prefix("benefits", [
		index("routes/employee/benefits.tsx"),
		route(":tab", "routes/employee/benefits.$tab.tsx"),
	]),
	route("learning", "routes/employee/learning.tsx"),
	...prefix("performance", [
		index("routes/employee/performance.tsx"),
		route(":tab", "routes/employee/performance.$tab.tsx"),
	]),
	route("team", "routes/employee/team.tsx"),
	route("team/schedule-calendar", "routes/employee/team-schedule-calendar.tsx"),
	route("messages", "routes/employee/messages.tsx"),
	route("notifications", "routes/employee/notifications.tsx"),
	route("help", "routes/employee/help.tsx"),
	route("requests", "routes/employee/requests.tsx"),
	route("leave-calendar", "routes/employee/leave-calendar.tsx"),
	route("workflows", "routes/hr/workflows-2.tsx", { id: "employee-workflows" }),
	...prefix("test", [route("page", "components/templates/hr-reviewer-template.tsx")]),
	// Dynamic :id routes must come AFTER all static routes
	route(":id", "routes/employee/employee.$id.tsx"),
	route(":id/attendance", "routes/employee/$id.attendance.tsx"),
	route(":id/payroll", "routes/employee/$id.payroll.tsx"),
	route(":id/payroll/:payslipId", "routes/employee/$id.payroll.$payslipId.tsx"),
];

// HR-specific routes (HR Manager + HR User - role-gated in components)
const hrRoutes = [
	...prefix("approvals", [
		route("requests", "routes/employee/approvals.tsx", { id: "hr-approvals-requests" }),
		route("timesheet", "routes/employee/approvals.tsx", {
			id: "hr-approvals-timesheet",
		}),
	]),
	route("dashboard", "routes/hr/dashboard.tsx"),
	route("templates", "routes/hr/boarding-template-builder.tsx"),
	route("onboarding-setup", "routes/hr/onboarding-setup.tsx"),
	route("employees", "routes/hr/employees.tsx"),
	route("employees/new", "routes/hr/employees.new.tsx"),
	route("employees/:id/edit", "routes/hr/employees.$id.edit.tsx"),
	route("employee-profile", "routes/hr/employee-profile.tsx"),
	route("employee-documents", "routes/hr/employee-documents.tsx"),
	route("employee-status-changes", "routes/hr/employee-status-changes.tsx"),
	route("recruitment", "routes/hr/recruitment-page.tsx"),
	route("jobs", "routes/hr/jobs.tsx"),
	route("attendance", "routes/hr/attendance.tsx"),
	route("time-corrections", "routes/hr/time-corrections.tsx"),
	route("performance", "routes/hr/performance.tsx"),
	route("tasks", "routes/hr/tasks.tsx"),
	route("performance/:type", "routes/hr/performance.$type.tsx"),
	route("messages", "routes/hr/messages.tsx"),
	route("notifications", "routes/hr/notifications.tsx"),
	route("payroll", "routes/hr/payroll.tsx"),
	route("hr-payroll", "routes/hr/hr-payroll.tsx"),
	route("billings", "routes/hr/billings.tsx"),
	route("billings/:id", "routes/hr/billings.$id.tsx"),
	route("payroll-periods", "routes/hr/payroll-periods.tsx", {
		id: "hr-payroll-periods-redirect",
	}),
	route("payroll-settings", "routes/hr/payroll-settings.tsx"),
	route("run-payroll", "routes/hr/run-payroll.tsx"),
	route("benefit-types", "routes/hr/benefit-types.tsx"),
	route("benefits-management", "routes/hr/benefits-management.tsx"),
	route("benefit-enrollments", "routes/hr/benefit-enrollments.tsx"),
	route("announcements", "routes/hr/announcements.tsx"),
	route("document-viewer", "routes/hr/document-viewer.tsx"),
	route("add-user", "routes/hr/add-user.tsx"),
	route("reports", "routes/hr/reports.tsx"),
	route("reports/attendance", "routes/hr/reports/attendance.tsx"),
	route("reports/workforce", "routes/hr/reports/workforce.tsx"),
	route("reports/payroll", "routes/hr/reports/payroll.tsx"),
	...prefix("requests", [
		route("tickets", "routes/hr/requests/tickets.tsx"),
		route("documents", "routes/hr/requests/documents.tsx"),
		route("personnel-action", "routes/hr/requests/personnel-action.tsx"),
		route(":type", "routes/hr/requests.$type.tsx"),
	]),
	route("timesheets", "routes/hr/timesheets.tsx"),
	route("timesheet-settings", "routes/hr/timesheet-settings.tsx"),
	route("leave-settings", "routes/hr/leave-settings.tsx"),
	route("request-process", "routes/hr/workflows-2.tsx", { id: "hr-workflows-2" }),
];

const pdfRoutes = [
	route("pdf-mapper", "routes/pdf-mapper.tsx"),
	route("pdf-generator-demo", "routes/pdf-generator-demo.tsx"),
];

const siteRoutes = [
	route("login", "routes/site/login.tsx"),
	index("routes/site/index.tsx"),
	route("leaves", "routes/site/leaves.tsx"),
	route("attendance", "routes/site/attendance.tsx"),
	route("payslip", "routes/site/payslip.tsx"),
];

export default [
	index("routes/landing.tsx"),
	route("public", "routes/public-landing.tsx"),
	route("announcements", "routes/announcements.tsx"),
	route("time-logging", "routes/time-logging.tsx"),
	route("guide", "routes/hr-public/public-guide-page.tsx"),
	route("onboarding", "routes/onboarding.tsx"),
	route("setup", "routes/setup.tsx"),
	route("setup/bootstrap", "routes/setup.bootstrap.tsx"),
	route("callback", "routes/callback.tsx"),
	route("status", "routes/status.tsx"),
	route("403", "routes/403.tsx"),
	...prefix("jobs", [
		index("routes/hr-public/job-page.tsx"),
		route("/:jobId/apply", "routes/hr-public/apply.tsx"),
	]),
	...pdfRoutes,
	...prefix("site", [...siteRoutes]),
	layout("./layouts/auth-layout.tsx", [...authRoutes, ...legalRoutes]),
	layout("./layouts/main-layout.tsx", [...supportRoutes, ...userRoutes]),
	layout("./layouts/admin-layout.tsx", [...prefix("admin", [...adminRoutes])]),
	// Unified layout for employee, hr-manager, hr-user, and manager
	layout("./layouts/unified-layout.tsx", [
		route("dashboard", "routes/dashboard.tsx"),
		route("settings", "routes/settings.tsx"),
		route("calendar", "routes/calendar.tsx"),
		route("celebrations/birthdays", "routes/celebrations/birthdays.tsx"),
		...prefix("employee", [...employeeRoutes]),
		...prefix("hr", [...hrRoutes]),
	]),
	route("*", "routes/not-found.tsx"),
] satisfies RouteConfig;
