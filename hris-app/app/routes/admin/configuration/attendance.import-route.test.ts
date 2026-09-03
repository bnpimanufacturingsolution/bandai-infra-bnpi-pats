import { describe, expect, it } from "vitest";
import {
	ATTENDANCE_IMPORT_ALLOWED_STATUSES,
	ATTENDANCE_IMPORT_ROUTE_SOURCE_TRUTH_CONTRACT,
	ATTENDANCE_IMPORT_TEMPLATE_COLUMNS,
	buildAttendanceImportTemplateCsv,
} from "./attendance";

describe("attendance import route contract", () => {
	it("documents the source-of-truth split for the backfill-facing import route", () => {
		expect(ATTENDANCE_IMPORT_ROUTE_SOURCE_TRUTH_CONTRACT).toEqual({
			importWriteTarget: "Attendance",
			clockLedgerTruth: "Attendance",
			operationalProjection: "AttendanceObligation",
			timesheetTallySource: "Timesheetline.effectiveRows",
			paidPayrollHistory: "EmployeePayroll.timesheetSnapshot",
		});
	});

	it("keeps the route template aligned to the backend attendance import columns", () => {
		expect(ATTENDANCE_IMPORT_TEMPLATE_COLUMNS).toEqual([
			"EMPLOYEE_ID",
			"DATE",
			"TIME_IN",
			"TIME_OUT",
			"STATUS",
			"NOTES",
		]);
	});

	it("keeps route guidance aligned to backend-supported statuses", () => {
		expect(ATTENDANCE_IMPORT_ALLOWED_STATUSES).toEqual([
			"PRESENT",
			"LEAVE",
			"INCOMPLETE",
			"ABSENT",
			"REST_DAY",
		]);
	});

	it("builds a downloadable CSV template with attendance ledger examples", () => {
		const template = buildAttendanceImportTemplateCsv();
		const lines = template.split("\n");

		expect(lines[0]).toBe("EMPLOYEE_ID,DATE,TIME_IN,TIME_OUT,STATUS,NOTES");
		expect(template).toContain("PRESENT,On time");
		expect(template).toContain("LEAVE,Annual leave");
		expect(template).toContain("ABSENT,No clock record");
		expect(template).toContain("REST_DAY,Scheduled rest day");
	});
});
