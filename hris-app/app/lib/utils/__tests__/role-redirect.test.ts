import { afterEach, describe, expect, it, vi } from "vitest";
import {
	getAllRoles,
	getRedirectPathByRole,
	getRoleConfig,
	getRoleDisplayName,
	hasRoleAccess,
	type UserRole,
} from "../role-redirect";

describe("role redirect utilities", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("maps admin-like roles to the admin dashboard", () => {
		expect(getRedirectPathByRole("admin")).toBe("/admin/dashboard");
		expect(getRedirectPathByRole("hris-admin")).toBe("/admin/dashboard");
		expect(getRedirectPathByRole("super_admin")).toBe("/admin/dashboard");
	});

	it("maps HR and employee roles to the shared dashboard", () => {
		expect(getRedirectPathByRole("hris-hr-manager")).toBe("/dashboard");
		expect(getRedirectPathByRole("hris-hr-user")).toBe("/dashboard");
		expect(getRedirectPathByRole("hris-employee-manager")).toBe("/dashboard");
		expect(getRedirectPathByRole("hris-employee")).toBe("/dashboard");
	});

	it("maps timekeeper users to the time logging surface", () => {
		expect(getRedirectPathByRole("hris-timekeeper")).toBe("/time-logging");
	});

	it("maps agency users to the agency workspace", () => {
		expect(getRedirectPathByRole("hris-agency")).toBe("/agency");
		expect(getRoleDisplayName("hris-agency")).toBe("Agency");
		expect(hasRoleAccess("hris-agency", "/agency")).toBe(true);
		expect(hasRoleAccess("hris-agency", "/agency/roster")).toBe(true);
		expect(hasRoleAccess("hris-employee", "/agency")).toBe(false);
	});

	it("falls back to the shared dashboard for unknown roles", () => {
		const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		expect(getRedirectPathByRole("unknown_role" as UserRole)).toBe("/dashboard");
		expect(consoleSpy).toHaveBeenCalledWith(
			"Unknown role: unknown_role, defaulting to dashboard",
		);
	});

	it("returns role configuration for known roles only", () => {
		expect(getRoleConfig("hris-admin")).toEqual(
			expect.objectContaining({
				role: "hris-admin",
				redirectPath: "/admin/dashboard",
			}),
		);
		expect(getRoleConfig("unknown_role" as UserRole)).toBeNull();
	});

	it("returns display names for all current HRIS roles", () => {
		expect(getRoleDisplayName("admin")).toBe("System Administrator");
		expect(getRoleDisplayName("hris-admin")).toBe("HRIS Administrator");
		expect(getRoleDisplayName("hris-hr-manager")).toBe("HR Manager");
		expect(getRoleDisplayName("hris-hr-user")).toBe("HR User");
		expect(getRoleDisplayName("hris-employee-manager")).toBe("Employee Manager");
		expect(getRoleDisplayName("hris-line-leader")).toBe("Line Leader");
		expect(getRoleDisplayName("hris-employee")).toBe("Employee");
		expect(getRoleDisplayName("hris-timekeeper")).toBe("Time Keeper");
		expect(getRoleDisplayName("super_admin")).toBe("Super Administrator");
	});

	it("allows authenticated roles to access the shared dashboard", () => {
		for (const role of getAllRoles()) {
			expect(hasRoleAccess(role, "/dashboard")).toBe(true);
			expect(hasRoleAccess(role, "/dashboard/requests")).toBe(true);
		}
	});

	it("keeps admin routes limited to admin-like roles", () => {
		expect(hasRoleAccess("admin", "/admin/dashboard")).toBe(true);
		expect(hasRoleAccess("hris-admin", "/admin/configuration")).toBe(true);
		expect(hasRoleAccess("super_admin", "/admin/users")).toBe(true);

		expect(hasRoleAccess("hris-hr-manager", "/admin/dashboard")).toBe(false);
		expect(hasRoleAccess("hris-hr-user", "/admin/dashboard")).toBe(false);
		expect(hasRoleAccess("hris-employee", "/admin/dashboard")).toBe(false);
	});

	it("keeps time logging limited to the timekeeper redirect surface", () => {
		expect(hasRoleAccess("hris-timekeeper", "/time-logging")).toBe(true);
		expect(hasRoleAccess("hris-employee", "/time-logging")).toBe(false);
	});

	it("denies unknown roles for non-dashboard paths", () => {
		expect(hasRoleAccess("unknown_role" as UserRole, "/admin/dashboard")).toBe(false);
		expect(hasRoleAccess("unknown_role" as UserRole, "/time-logging")).toBe(false);
	});
});
