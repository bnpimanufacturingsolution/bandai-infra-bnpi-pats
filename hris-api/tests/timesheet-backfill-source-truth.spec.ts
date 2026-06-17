import { expect } from "chai";
import {
	buildTimesheetLineBackfillInput,
	selectTimesheetLineBackfillPeriods,
	TIMESHEET_LINE_BACKFILL_SOURCE_TRUTH_CONTRACT,
	toDateOnlyUtc,
} from "../scripts/backfill-timesheet-lines";
import { buildTimesheetDaySnapshotMetadata } from "../helper/timesheet-line-version.helper";

describe("timesheet line backfill source-of-truth contract", () => {
	it("documents the binding attendance/timesheet/payroll truth split", () => {
		expect(TIMESHEET_LINE_BACKFILL_SOURCE_TRUTH_CONTRACT).to.deep.equal({
			liveOperationalAttendance: "AttendanceObligation",
			clockLedger: "Attendance",
			pastSubmittedApprovedPayrollReadyTotals: "Timesheetline.effectiveRows",
			paidPayrollHistory: "EmployeePayroll.timesheetSnapshot",
		});
	});

	it("selects completed periods plus the current period by default", () => {
		const today = toDateOnlyUtc("2026-05-26");
		const periods = [
			{ id: "future", startDate: toDateOnlyUtc("2026-06-01"), endDate: toDateOnlyUtc("2026-06-15") },
			{ id: "current", startDate: toDateOnlyUtc("2026-05-16"), endDate: toDateOnlyUtc("2026-05-31") },
			{ id: "completed-2", startDate: toDateOnlyUtc("2026-05-01"), endDate: toDateOnlyUtc("2026-05-15") },
			{ id: "completed-1", startDate: toDateOnlyUtc("2026-04-16"), endDate: toDateOnlyUtc("2026-04-30") },
			{ id: "older", startDate: toDateOnlyUtc("2026-04-01"), endDate: toDateOnlyUtc("2026-04-15") },
		];

		const selected = selectTimesheetLineBackfillPeriods(periods, {
			today,
			completedPeriods: 2,
			hasExplicitRange: false,
		});

		expect(selected.map((period) => period.id)).to.deep.equal([
			"completed-2",
			"completed-1",
			"current",
		]);
	});

	it("preserves explicit date-range period selection", () => {
		const periods = [
			{ id: "older", startDate: toDateOnlyUtc("2026-04-01"), endDate: toDateOnlyUtc("2026-04-15") },
			{ id: "current", startDate: toDateOnlyUtc("2026-05-16"), endDate: toDateOnlyUtc("2026-05-31") },
		];

		const selected = selectTimesheetLineBackfillPeriods(periods, {
			today: toDateOnlyUtc("2026-05-26"),
			completedPeriods: 1,
			hasExplicitRange: true,
		});

		expect(selected).to.equal(periods);
	});

	it("caps current-period materialization at yesterday", () => {
		const input = buildTimesheetLineBackfillInput({
			organizationId: "org-1",
			employeeId: "emp-1",
			payrollPeriodId: "period-current",
			timesheetId: "timesheet-1",
			periodStartDate: toDateOnlyUtc("2026-05-16"),
			periodEndDate: toDateOnlyUtc("2026-05-31"),
			today: toDateOnlyUtc("2026-05-26"),
		});

		expect(input.fromDate.toISOString()).to.equal("2026-05-16T00:00:00.000Z");
		expect(input.toDate.toISOString()).to.equal("2026-05-25T00:00:00.000Z");
		expect(input.sourceOfTruth).to.equal("ATTENDANCE_OBLIGATION");
		expect(input.targetTruth).to.equal("TIMESHEETLINE_EFFECTIVE_ROWS");
	});

	it("uses the completed period end date for historical periods", () => {
		const input = buildTimesheetLineBackfillInput({
			organizationId: "org-1",
			employeeId: "emp-1",
			payrollPeriodId: "period-closed",
			timesheetId: "timesheet-1",
			periodStartDate: toDateOnlyUtc("2026-05-01"),
			periodEndDate: toDateOnlyUtc("2026-05-15"),
			today: toDateOnlyUtc("2026-05-26"),
		});

		expect(input.toDate.toISOString()).to.equal("2026-05-15T00:00:00.000Z");
	});

	it("pins generated timesheet day metadata to AttendanceObligation snapshots", () => {
		const metadata = buildTimesheetDaySnapshotMetadata({
			baseMetadata: { breakMinutes: 60 },
			source: {
				type: "ATTENDANCE_OBLIGATION",
				id: "obl-1",
				status: "PRESENT",
				reason: "PayrollPeriodOpened",
				requestId: null,
			},
			marker: "HOURS",
			schedule: { shiftTypeCode: "DAY" },
			snapshottedAt: new Date("2026-05-26T00:00:00.000Z"),
		});

		expect(metadata.snapshotType).to.equal("TIMESHEET_DAY");
		expect(metadata.source).to.deep.equal({
			type: "ATTENDANCE_OBLIGATION",
			id: "obl-1",
			status: "PRESENT",
			reason: "PayrollPeriodOpened",
			requestId: null,
		});
		expect(metadata.day.schedule).to.deep.equal({ shiftTypeCode: "DAY" });
		expect(metadata.primaryMarker).to.equal("HOURS");
	});
});
