import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";

/**
 * Agency workspace UI contract spec (2026-09-14, pages revision).
 *
 * Dedicated /agency/* pages with sidebar navigation (not tabs):
 * dashboard (charts), roster, attendance, timesheets, biometrics.
 */

const read = (p: string) => readFileSync(resolvePath(process.cwd(), p), "utf8");

describe("agency workspace contract", () => {
	it("exposes five dedicated routes under unified-layout", () => {
		const routes = read("app/routes.ts");
		for (const p of [
			'route("dashboard", "routes/agency/dashboard.tsx")',
			'route("roster", "routes/agency/roster.tsx")',
			'route("attendance", "routes/agency/attendance.tsx")',
			'route("timesheets", "routes/agency/timesheets.tsx")',
			'route("biometrics", "routes/agency/biometrics.tsx")',
			'route("reports", "routes/agency/reports.tsx")',
		]) {
			expect(routes).toContain(p);
		}
	});

	it("guards every agency page and redirects /agency to the dashboard", () => {
		const entry = read("app/routes/agency.tsx");
		expect(entry).toContain("AGENCY_ROLES");
		expect(entry).toContain("/agency/dashboard");
		for (const p of ["dashboard.tsx", "roster.tsx", "attendance.tsx", "timesheets.tsx", "biometrics.tsx", "reports.tsx"]) {
			const src = read(`app/routes/agency/${p}`);
			expect(src).toContain("AgencyGuard");
		}
	});

	it("renders sidebar navigation for the agency section", () => {
		const sidebar = read("app/components/organisms/Sidebar.tsx");
		for (const p of [
			"/agency/dashboard",
			"/agency/roster",
			"/agency/attendance",
			"/agency/timesheets",
			"/agency/biometrics",
			"/agency/reports",
		]) {
			expect(sidebar).toContain(p);
		}
	});

	it("dashboard charts from live agency-scoped rows (recharts, no invented data)", () => {
		const dashboard = read("app/routes/agency/dashboard.tsx");
		expect(dashboard).toContain("recharts");
		for (const t of [
			"agency-chart-attendance-trend",
			"agency-chart-timesheet-mix",
			"agency-chart-departments",
		]) {
			expect(dashboard).toContain(t);
		}
		expect(dashboard).toContain("employee.agencyId");
		// Agency-pack summary: absentee + inactive operators.
		expect(dashboard).toContain("Absent (14d)");
		expect(dashboard).toContain("Inactive operators");
		expect(dashboard).toContain("isActiveAgencyMember");
	});

	it("reports page generates Excel from live agency rows (xlsx, no mock)", () => {
		const src = read("app/routes/agency/reports.tsx");
		expect(src).toContain('from "xlsx"');
		expect(src).toContain("json_to_sheet");
		expect(src).toContain('bookType: "xlsx"');
		expect(src).toContain("employee.agencyId");
		expect(src.toLowerCase()).not.toContain("mock");
	});

	it("reports page is charts-and-graphs only (tables removed, export kept)", () => {
		const src = read("app/routes/agency/reports.tsx");
		expect(src).toContain("recharts");
		for (const t of [
			"agency-report-attendance-trend",
			"agency-report-timesheet-mix",
			"agency-report-departments",
			"agency-report-absentee-trend",
			"agency-report-employment-mix",
			"agency-report-date-filter",
			"agency-report-status",
		]) {
			expect(src).toContain(t);
		}
		// No table markup on the reports surface; export unchanged.
		expect(src).not.toContain("<table");
		expect(src).toContain("Export Excel");
		expect(src).toContain("DatePickerWithRange");
		// No report-type picker: the date filter scopes the charts and the export.
		expect(src).not.toContain("REPORT_TYPES");
		expect(src).not.toContain("reportType");
	});

	it("coordinator sidebar drops the generic Dashboard (Overview is their dashboard)", () => {
		const src = read("app/components/organisms/Sidebar.tsx");
		expect(src).toContain('user?.role === "hris-agency" ? [] : [dashboardItem]');
	});

	it("keeps testids unique per page (no strict-mode collisions)", () => {
		const pages = ["dashboard.tsx", "roster.tsx", "attendance.tsx", "timesheets.tsx", "biometrics.tsx", "reports.tsx"].map(
			(p) => read(`app/routes/agency/${p}`),
		);
		const ids = pages.flatMap((src) => [...src.matchAll(/data-testid="([^"]+)"/g)].map((m) => m[1]));
		const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
		expect(dupes).toEqual([]);
	});
});
