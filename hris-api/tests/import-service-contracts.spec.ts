import { expect } from "chai";
import {
	ATTENDANCE_IMPORT_SOURCE_TRUTH_CONTRACT,
	buildAttendanceImportTimesheetKey,
	normalizeAttendanceImportStatus,
} from "../app/attendance/attendance-import.service";
import {
	resolveEmployeeImportExecutionOptions,
	shouldBackfillAttendanceObligationsAfterReportToResolution,
} from "../app/employee/employee-import.service";
import { UpdateEmployeeSchema } from "../zod/employee.zod";

describe("attendance import service contracts", () => {
	it("documents attendance import writes and projections by source of truth", () => {
		expect(ATTENDANCE_IMPORT_SOURCE_TRUTH_CONTRACT).to.deep.equal({
			writeTarget: "Attendance",
			clockLedgerTruth: "Attendance",
			operationalProjection: "AttendanceObligation",
			timesheetGenerationSource: "AttendanceObligation -> Timesheetline.effectiveRows",
			paidPayrollHistory: "EmployeePayroll.timesheetSnapshot",
		});
	});

	it("accepts valid manual statuses case-insensitively", () => {
		expect(normalizeAttendanceImportStatus("present")).to.deep.equal({ status: "PRESENT" });
		expect(normalizeAttendanceImportStatus(" rest_day ")).to.deep.equal({ status: "REST_DAY" });
	});

	it("rejects invalid manual statuses before writing Attendance rows", () => {
		const normalized = normalizeAttendanceImportStatus("holiday");

		expect(normalized.status).to.equal(undefined);
		expect(normalized.error).to.include('Invalid STATUS "HOLIDAY"');
	});

	it("allows omitted manual status so timekeeping can compute ledger status", () => {
		expect(normalizeAttendanceImportStatus(undefined)).to.deep.equal({});
		expect(normalizeAttendanceImportStatus("")).to.deep.equal({});
	});

	it("deduplicates generated timesheets by resolved employee and payroll period", () => {
		const key = buildAttendanceImportTimesheetKey({
			employeeId: "emp-1",
			payrollPeriodId: "period-1",
		});

		expect(key).to.equal("emp-1:period-1");
		expect(
			buildAttendanceImportTimesheetKey({ employeeId: "emp-1", payrollPeriodId: null }),
		).to.equal(null);
	});
});

describe("employee import reportTo backfill contract", () => {
	it("backfills open attendance obligations when reportTo changes after second-pass resolution", () => {
		expect(
			shouldBackfillAttendanceObligationsAfterReportToResolution({
				currentReportToId: null,
				resolvedReportToId: "manager-1",
			}),
		).to.equal(true);

		expect(
			shouldBackfillAttendanceObligationsAfterReportToResolution({
				currentReportToId: "old-manager",
				resolvedReportToId: "manager-1",
			}),
		).to.equal(true);
	});

	it("does not backfill obligations when manager is unresolved or unchanged", () => {
		expect(
			shouldBackfillAttendanceObligationsAfterReportToResolution({
				currentReportToId: null,
				resolvedReportToId: null,
			}),
		).to.equal(false);

		expect(
			shouldBackfillAttendanceObligationsAfterReportToResolution({
				currentReportToId: "manager-1",
				resolvedReportToId: "manager-1",
			}),
		).to.equal(false);
	});
});

describe("employee import side-effect contract", () => {
	it("disables provisioning, credential email, and post-actions only for explicit fast-mode imports", () => {
		expect(resolveEmployeeImportExecutionOptions({ importMode: "fast" })).to.deep.equal({
			enableAccountProvisioning: false,
			enableCredentialEmails: false,
			enablePostActions: false,
		});
	});

	it("keeps full provisioning behavior as the default for employee imports", () => {
		expect(resolveEmployeeImportExecutionOptions({})).to.deep.equal({
			enableAccountProvisioning: true,
			enableCredentialEmails: true,
			enablePostActions: true,
		});
	});

	it("does not run post-actions when account provisioning is explicitly disabled", () => {
		expect(
			resolveEmployeeImportExecutionOptions({
				importMode: "full",
				enableAccountProvisioning: false,
			}),
		).to.deep.equal({
			enableAccountProvisioning: false,
			enableCredentialEmails: false,
			enablePostActions: false,
		});
	});

	it("allows workbook imports to defer post-actions while keeping account provisioning enabled", () => {
		expect(
			resolveEmployeeImportExecutionOptions({
				importMode: "full",
				enableAccountProvisioning: true,
				enableCredentialEmails: false,
				enablePostActions: false,
			}),
		).to.deep.equal({
			enableAccountProvisioning: true,
			enableCredentialEmails: false,
			enablePostActions: false,
		});
	});
});

describe("DM3 opening leave balance employee API contract", () => {
	it("accepts master-data leave codes imported from DM3 instead of the legacy fixed enum", () => {
		const validation = UpdateEmployeeSchema.safeParse({
			leaveBalances: [
				{
					leaveType: "VL",
					totalEntitled: 5,
					used: 0,
					pending: 0,
					available: 5,
					periodStart: "2026-01-01",
					periodEnd: "2026-12-31",
				},
				{
					leaveType: "SL",
					totalEntitled: 15,
					used: 0,
					pending: 0,
					available: 15,
					periodStart: "2026-01-01",
					periodEnd: "2026-12-31",
				},
				{
					leaveType: "ACL",
					totalEntitled: 10,
					used: 0,
					pending: 0,
					available: 10,
					periodStart: "2026-01-01",
					periodEnd: "2026-12-31",
				},
			],
		});

		expect(validation.success).to.equal(true);
	});
});
