import { describe, expect, it } from "vitest";
import { isAdminViewportFillPath } from "./admin-viewport-fill";

describe("isAdminViewportFillPath", () => {
	it("fills configuration list tables", () => {
		expect(isAdminViewportFillPath("/admin/configuration/users")).toBe(true);
		expect(isAdminViewportFillPath("/admin/configuration/employees")).toBe(true);
		expect(isAdminViewportFillPath("/admin/configuration/departments")).toBe(true);
		expect(isAdminViewportFillPath("/admin/configuration/sections")).toBe(true);
		expect(isAdminViewportFillPath("/admin/configuration/positions")).toBe(true);
		expect(isAdminViewportFillPath("/admin/configuration/levels")).toBe(true);
		expect(isAdminViewportFillPath("/admin/configuration/schedule-templates")).toBe(true);
		expect(isAdminViewportFillPath("/admin/configuration/employee-schedules")).toBe(true);
		expect(isAdminViewportFillPath("/admin/configuration/leave-types")).toBe(true);
		expect(isAdminViewportFillPath("/admin/configuration/holidays")).toBe(true);
		expect(isAdminViewportFillPath("/admin/configuration/agencies")).toBe(true);
		expect(isAdminViewportFillPath("/admin/configuration/benefit-types")).toBe(true);
		expect(isAdminViewportFillPath("/admin/configuration/payroll-periods")).toBe(true);
		expect(isAdminViewportFillPath("/admin/configuration/devices")).toBe(true);
	});

	it("fills logging and device list tables", () => {
		expect(isAdminViewportFillPath("/admin/audit-logs")).toBe(true);
		expect(isAdminViewportFillPath("/admin/activity-logs")).toBe(true);
		expect(isAdminViewportFillPath("/admin/devices/manage")).toBe(true);
		expect(isAdminViewportFillPath("/admin/devices/events")).toBe(true);
		expect(isAdminViewportFillPath("/admin/configuration/users/abc/activity-logs")).toBe(
			true,
		);
	});

	it("keeps page scroll for forms and non-list pages", () => {
		expect(isAdminViewportFillPath("/admin/dashboard")).toBe(false);
		expect(isAdminViewportFillPath("/admin/configuration/company-profile")).toBe(false);
		expect(isAdminViewportFillPath("/admin/configuration/migration")).toBe(false);
		expect(isAdminViewportFillPath("/admin/configuration/employees/new")).toBe(false);
		expect(isAdminViewportFillPath("/admin/configuration/employees/emp-1")).toBe(false);
		expect(isAdminViewportFillPath("/admin/devices/manage/dev-1")).toBe(false);
		expect(isAdminViewportFillPath("/admin/rules-policies/payroll")).toBe(false);
	});
});
