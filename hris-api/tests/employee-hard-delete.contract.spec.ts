import { expect } from "chai";
import fs from "node:fs";
import path from "node:path";

describe("Employee hard delete API contract", () => {
	const controllerSource = fs.readFileSync(
		path.resolve(__dirname, "../app/employee/employee.controller.ts"),
		"utf8",
	);
	const routerSource = fs.readFileSync(
		path.resolve(__dirname, "../app/employee/employee.router.ts"),
		"utf8",
	);

	it("exposes a preview-first endpoint without changing the legacy delete route", () => {
		expect(routerSource).to.contain('routes.post("/:id/hard-delete-preview"');
		expect(routerSource).to.contain("controller.previewHardDelete");
		expect(routerSource).to.contain('routes.delete("/:id", controller.remove)');
	});

	it("limits employee hard delete preview and execution to HRIS admins", () => {
		expect(controllerSource).to.contain("EMPLOYEE_HARD_DELETE_ADMIN_ROLES");
		expect(controllerSource).to.contain('"hris-admin"');
		expect(controllerSource).to.contain('"admin"');
		expect(controllerSource).to.contain('"super_admin"');
		expect(controllerSource).to.contain("Only HRIS admins can preview or execute employee hard delete.");
	});

	it("checks high-risk payroll, attendance, legal, and history relations before execution", () => {
		[
			"attendanceRecords",
			"attendanceObligations",
			"timesheets",
			"timesheetLines",
			"employeePayrolls",
			"terminations",
			"scheduleOverrides",
			"scheduleHistoryRecords",
			"soaLineItems",
		].forEach((term) => expect(controllerSource).to.contain(term));
		expect(controllerSource).to.contain("forceExecuteAvailable");
		expect(controllerSource).to.contain("Cannot hard delete employee without force confirmation:");
		expect(controllerSource).to.contain("preview.blockers.length > 0 && !force");
	});

	it("reports delete and detach behavior explicitly and allows click-only execute", () => {
		expect(controllerSource).to.contain("requiresConfirmation");
		expect(controllerSource).to.contain('mode: "preview"');
		expect(controllerSource).to.contain('mode: "executed"');
		expect(controllerSource).to.contain("attendanceObligation?.deleteMany");
		expect(controllerSource).to.contain("timesheetline?.deleteMany");
		expect(controllerSource).to.contain("attendance?.deleteMany");
		expect(controllerSource).to.contain("employeePayroll?.deleteMany");
		expect(controllerSource).to.contain("timesheet?.deleteMany");
		expect(controllerSource).to.contain("deviceEvent?.updateMany");
		expect(controllerSource).to.contain("deviceUser?.updateMany");
		expect(controllerSource).to.contain("activityLogging?.updateMany");
		expect(controllerSource).to.contain("auditLogging?.updateMany");
		expect(controllerSource).to.not.contain("Type ${expectedConfirmation} to execute employee hard delete.");
	});
});
