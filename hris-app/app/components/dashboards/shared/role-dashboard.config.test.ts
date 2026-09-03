import { describe, expect, it } from "vitest";
import { roleDashboardConfigs } from "./role-dashboard.config";

describe("roleDashboardConfigs", () => {
	it("keeps request leave available in the default top card for employee-facing dashboards", () => {
		expect(roleDashboardConfigs.employee.layout.top).toEqual([
			"time_off",
			"action_needed",
			"quick_actions",
		]);
		expect(roleDashboardConfigs["employee-manager"].layout.top).toEqual([
			"time_off",
			"action_needed",
			"quick_actions",
		]);
	});

	it("keeps time off first for HR dashboards", () => {
		expect(roleDashboardConfigs["hr-user"].layout.top).toEqual([
			"time_off",
			"action_needed",
			"quick_actions",
		]);
		expect(roleDashboardConfigs["hr-manager"].layout.top).toEqual([
			"time_off",
			"action_needed",
			"quick_actions",
		]);
	});

	it("pins My Requests as the bottom-left card for all roles", () => {
		const roles = Object.keys(roleDashboardConfigs) as Array<keyof typeof roleDashboardConfigs>;
		for (const role of roles) {
			expect(roleDashboardConfigs[role].layout.bottomLeft).toBe("my_requests");
		}
	});

	it("assigns role-specific bottom-right cards", () => {
		expect(roleDashboardConfigs.employee.layout.bottomRight).toBe("employee_calendar");
		expect(roleDashboardConfigs["employee-manager"].layout.bottomRight).toBe(
			"employee_calendar",
		);
		expect(roleDashboardConfigs["hr-user"].layout.bottomRight).toBe(
			"hr_operational_queue",
		);
		expect(roleDashboardConfigs["hr-manager"].layout.bottomRight).toBe(
			"hr_operational_queue",
		);
	});
});
