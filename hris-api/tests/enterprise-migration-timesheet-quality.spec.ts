import path from "path";
import assert from "node:assert/strict";
import { describe, it } from "mocha";
import {
	buildEnterpriseEmployeePayrollPayload,
} from "../app/migration/enterprise-migration.service";
import { loadEnterpriseMigrationDataFromCsvDir } from "../scripts/migration/enterprise-csv-loader";

const loadSampleData = () =>
	loadEnterpriseMigrationDataFromCsvDir(path.resolve(__dirname, "../docs/csv")).data;

const dateOnly = (value: unknown) => {
	const date = new Date(value as any);
	return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
};

const hoursToMinutes = (value: unknown) => {
	const [hours = "0", minutes = "0"] = String(value || "0:00").split(":");
	return Number(hours) * 60 + Number(minutes);
};

describe("enterprise migration timesheet quality", () => {
	it("keeps approved timesheet headers backed by effective line snapshots", () => {
		const data = loadSampleData();
		const linesByTimesheetCode = new Map<string, typeof data.timesheetLines>();
		for (const line of data.timesheetLines) {
			const key = String(line.timesheetCode || "");
			linesByTimesheetCode.set(key, [...(linesByTimesheetCode.get(key) || []), line]);
		}

		for (const timesheet of data.timesheets) {
			assert.equal(Boolean(timesheet.code), true, `timesheet ${timesheet.employeeId} should have code`);
			if (timesheet.status === "APPROVED") {
				assert.equal(Boolean(timesheet.submittedAt), true, `${timesheet.code} submittedAt`);
				assert.equal(Boolean(timesheet.approvalDate), true, `${timesheet.code} approvalDate`);
				assert.equal(Boolean(timesheet.approvedBy), true, `${timesheet.code} approvedBy`);
			}

			const lines = linesByTimesheetCode.get(timesheet.code || "") || [];
			assert.equal(lines.length > 0, true, `${timesheet.code} should have effective line rows`);

			const lineKeys = new Set<string>();
			for (const line of lines) {
				assert.equal(line.employeeId, timesheet.employeeId, `${timesheet.code} line employee`);
				assert.equal(line.payrollPeriodCode, timesheet.payrollPeriodCode, `${timesheet.code} line period`);
				assert.equal(line.revisionNo >= 1, true, `${timesheet.code} line revision`);
				lineKeys.add(`${line.employeeId}:${dateOnly(line.date)}:${line.revisionNo}`);
			}
			assert.equal(lineKeys.size, lines.length, `${timesheet.code} should not duplicate line revisions`);
		}
	});

	it("reconciles imported attendance rows to timesheet lines by employee and date", () => {
		const data = loadSampleData();
		const attendanceKeys = new Set(
			data.attendances.map((row) => `${row.employeeId}:${dateOnly(row.date)}`),
		);

		for (const line of data.timesheetLines) {
			if (!line.attendanceDate) continue;
			const key = `${line.employeeId}:${dateOnly(line.attendanceDate)}`;
			assert.equal(
				attendanceKeys.has(key),
				true,
				`${line.timesheetCode} line should resolve imported Attendance ledger row ${key}`,
			);
		}
	});

	it("reconciles paid payroll history to effective timesheet line totals", () => {
		const data = loadSampleData();
		const linesByTimesheetCode = new Map<string, typeof data.timesheetLines>();
		for (const line of data.timesheetLines) {
			const key = String(line.timesheetCode || "");
			linesByTimesheetCode.set(key, [...(linesByTimesheetCode.get(key) || []), line]);
		}

		for (const payroll of data.employeePayrolls.filter((row) => row.isPaid)) {
			assert.equal(Boolean(payroll.timesheetCode), true, `${payroll.employeeId} paid payroll timesheetCode`);
			assert.equal(Boolean(payroll.paidAt), true, `${payroll.employeeId} paidAt`);

			const lines = linesByTimesheetCode.get(payroll.timesheetCode || "") || [];
			assert.equal(lines.length > 0, true, `${payroll.timesheetCode} should have timesheet lines`);

			const regularMinutes = lines.reduce((total, line) => total + hoursToMinutes(line.regularHours), 0);
			const overtimeMinutes = lines.reduce((total, line) => total + hoursToMinutes(line.overtimeHours), 0);
			assert.equal(regularMinutes, Number(payroll.regularHours || 0) * 60, `${payroll.timesheetCode} regular`);
			assert.equal(overtimeMinutes, Number(payroll.overtimeHours || 0) * 60, `${payroll.timesheetCode} overtime`);
		}
	});

	it("builds paid payroll snapshots from preserved timesheet totals before imported payroll hour fallbacks", () => {
		const payload = buildEnterpriseEmployeePayrollPayload({
			payroll: {
				employeeId: "EMP-001",
				payrollPeriodCode: "PAY-2099-01A",
				timesheetCode: "TS-2099-01A-0001",
				basicPay: 1000,
				overtimePay: 100,
				nightDiffPay: 0,
				holidayPay: 0,
				allowances: 0,
				bonuses: 0,
				taxAmount: 0,
				sssContribution: 0,
				philHealthContribution: 0,
				pagibigContribution: 0,
				loanDeductions: 0,
				absentDeduction: 0,
				lateDeduction: 0,
				earlyOutDeduction: 0,
				otherDeductions: 0,
				grossPay: 1100,
				totalDeductions: 0,
				netPay: 1100,
				regularHours: 8,
				overtimeHours: 1,
				isPaid: true,
			},
			payrollPeriodId: "period-id",
			timesheetId: "timesheet-id",
			timesheet: {
				totalHoursWorked: "7:30",
				totalRegularHours: "7:00",
				totalOvertimeHours: "0:30",
				totalUndertimeHours: "0:30",
				totalLateHours: "0:15",
				totalEarlyOutHours: "0:00",
				totalDays: 1,
			},
		});

		const snapshot = payload.timesheetSnapshot as Record<string, any>;
		assert.equal(snapshot.totalHoursWorked, "7:30");
		assert.equal(snapshot.totalRegularHours, "7:00");
		assert.equal(snapshot.totalOvertimeHours, "0:30");
		assert.equal(snapshot.metadata.importedRegularHours, 8);
		assert.equal(snapshot.metadata.importedOvertimeHours, 1);
	});
});
