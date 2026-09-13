import { describe, it, expect } from "vitest";

/**
 * Agency workspace UI contract spec (2026-09-14)
 *
 * Verifies structural contract, not backend response data (contracts built
 * in parallel). Tests the workspace renders with AGENCY_ROLES guard, has the
 * correct tabs/icons/labels, handles graceful endpoint errors, and shows the
 * import section without inventing import results.
 */

describe("agency workspace contract", () => {
	it("route module uses AGENCY_ROLES and renders workspace shell", () => {
		const fs = require("node:fs");
		const path = require("node:path");
		const routeSource = fs.readFileSync(
			path.resolve(process.cwd(), "hris-app/app/routes/agency.tsx"),
			"utf8",
		);
		const workspaceSource = fs.readFileSync(
			path.resolve(process.cwd(), "hris-app/app/components/pages/agency-workspace/AgencyWorkspace.tsx"),
			"utf8",
		);

		// Route: AGENCY_ROLES guard + redirect on missing role.
		expect(routeSource).toContain('AGENCY_ROLES');
		expect(routeSource).toContain('hris-agency');
		expect(routeSource).toContain('hris-admin');
		expect(routeSource).toContain('/403');

		// Workspace: shell + identity header + 5 tab buttons + graceful ready state.
		expect(workspaceSource).toContain('agency-workspace');
		expect(workspaceSource).toContain('agency-identity-header');
		expect(workspaceSource).toContain('Dashboard');
		expect(workspaceSource).toContain('Roster');
		expect(workspaceSource).toContain('Timesheets');
		expect(workspaceSource).toContain('Biometrics');
		expect(workspaceSource).toContain('GET /api/employee?filter=agencyId');
		expect(workspaceSource).toContain('GET /api/timesheet?filter=employee.agencyId');
		expect(workspaceSource).toContain('POST /api/agency/');
		expect(workspaceSource).toContain('Endpoint not permitted');
		expect(workspaceSource).toContain('Endpoint not ready');
		expect(workspaceSource).toContain('No fabricated');
		expect(workspaceSource).toContain('Agency members');
		expect(workspaceSource).toContain('Today active');
		expect(workspaceSource).toContain('Pending approvals');
		expect(workspaceSource).toContain('Attendance import');

		// No invented data patterns (bare numeric counts without context strings).
		// We verify by absence of suspicious patterns rather than behavior.
		const suspiciousPatterns = [
			"value={Number(",
			"value={total}",
			"value={count}",
		];
		for (const p of suspiciousPatterns) {
			expect(routeSource).not.toContain(p);
			expect(workspaceSource).not.toContain(p);
		}
	});

	it("uses SummaryCard and DataTable patterns and includes icons with labels", () => {
		const fs = require("node:fs");
		const path = require("node:path");
		const workspaceSource = fs.readFileSync(
			path.resolve(process.cwd(), "hris-app/app/components/pages/agency-workspace/AgencyWorkspace.tsx"),
			"utf8",
		);

		// SHE / icon + label checks.
		expect(workspaceSource).toContain('icon={Users}');
		expect(workspaceSource).toContain('icon={Clock}');
		expect(workspaceSource).toContain('icon={FileText}');
		expect(workspaceSource).toContain('icon={Upload}');
		expect(workspaceSource).toContain('Agency members');
		expect(workspaceSource).toContain('Today active');
		expect(workspaceSource).toContain('Pending approvals');
		expect(workspaceSource).toContain('Attendance import');

		// DataTable for roster; column labels present.
		expect(workspaceSource).toContain('Agency members'); // DataTable title used
		expect(workspaceSource).toContain('Code');
		expect(workspaceSource).toContain('Name');
		expect(workspaceSource).toContain('Department');
		expect(workspaceSource).toContain('Labor');
		expect(workspaceSource).toContain('Status');
	});

	it("includes graceful endpoint-not-ready message and graceful-not-ready flag", () => {
		const workspaceSource = require("node:fs").readFileSync(
			require("node:path").resolve(process.cwd(), "hris-app/app/components/pages/agency-workspace/AgencyWorkspace.tsx"),
			"utf8",
		);
		expect(workspaceSource).toContain('gracefulNotReady');
		expect(workspaceSource).toContain('Endpoint not ready');
		expect(workspaceSource).toContain('Endpoint not permitted');
		expect(workspaceSource).toContain('No fabricated');
		// Import component (separate file) defines success message; workspace only embeds it.
		const importFs = require("node:fs");
		const importPath = require("node:path");
		const importComponentSource = importFs.readFileSync(
			importPath.resolve(process.cwd(), "hris-app/app/components/pages/agency-workspace/BiometricsImport.tsx"),
			"utf8",
		);
		expect(importComponentSource).toContain('Import accepted');
		expect(importComponentSource).toContain('Endpoint not permitted');
	});
});
