import { expect } from "chai";
import {
	buildTimesheetBreakdownFromObligations,
	deriveAttendanceObligationDisplayStatus,
} from "../helper/attendance-obligation.helper";

describe("attendance-obligation.helper regression", () => {
	it("shows EXPECTED as NOT_CLOCKED_IN for today's business date", () => {
		const now = new Date("2026-05-15T04:00:00.000Z");
		const status = deriveAttendanceObligationDisplayStatus(
			{ status: "EXPECTED", businessDate: "2026-05-15" },
			now,
		);
		expect(status).to.equal("NOT_CLOCKED_IN");
	});

	it("regression: EXPECTED status becomes ABSENT for past business dates", () => {
		const now = new Date("2026-05-15T04:00:00.000Z");
		const status = deriveAttendanceObligationDisplayStatus(
			{ status: "EXPECTED", businessDate: "2026-05-14" },
			now,
		);
		expect(status).to.equal("ABSENT");
	});

	it("shows EXPECTED as SCHEDULED for future business dates", () => {
		const now = new Date("2026-05-15T04:00:00.000Z");
		const status = deriveAttendanceObligationDisplayStatus(
			{ status: "EXPECTED", businessDate: "2026-05-16" },
			now,
		);
		expect(status).to.equal("SCHEDULED");
	});

	it("preserves non-EXPECTED stored statuses instead of recalculating them", () => {
		const now = new Date("2026-05-15T04:00:00.000Z");
		for (const storedStatus of ["PRESENT", "INCOMPLETE", "LEAVE", "REST_DAY", "HOLIDAY", "CANCELLED"]) {
			const status = deriveAttendanceObligationDisplayStatus(
				{ status: storedStatus, businessDate: "2026-05-14" },
				now,
			);
			expect(status).to.equal(storedStatus);
		}
	});

	it("regression failure-path: EXPECTED status must not stay EXPECTED in timesheet snapshot", () => {
		const breakdown = buildTimesheetBreakdownFromObligations(
			[
				{
					id: "obligation-1",
					date: new Date("2026-05-14T00:00:00.000Z"),
					businessDate: "2026-05-14",
					status: "EXPECTED",
					hoursWorked: "0:00",
					regularHours: "0:00",
					overtimeHours: "0:00",
					undertimeHours: "0:00",
					lateHours: "0:00",
					earlyOutHours: "0:00",
					isDeleted: false,
				},
			],
			new Date("2026-05-15T04:00:00.000Z"),
		);

		expect(breakdown).to.have.length(1);
		expect(breakdown[0].storedStatus).to.equal("EXPECTED");
		expect(breakdown[0].status).to.equal("ABSENT");
		expect(breakdown[0].status).to.not.equal("EXPECTED");
		expect(breakdown[0].isVirtual).to.equal(true);
	});

	it("filters deleted obligations and sorts active obligations by business date", () => {
		const breakdown = buildTimesheetBreakdownFromObligations(
			[
				{
					id: "obligation-2",
					date: new Date("2026-05-16T00:00:00.000Z"),
					businessDate: "2026-05-16",
					status: "EXPECTED",
					isDeleted: false,
				},
				{
					id: "deleted-obligation",
					date: new Date("2026-05-14T00:00:00.000Z"),
					businessDate: "2026-05-14",
					status: "EXPECTED",
					isDeleted: true,
				},
				{
					id: "obligation-1",
					date: new Date("2026-05-15T00:00:00.000Z"),
					businessDate: "2026-05-15",
					status: "EXPECTED",
					isDeleted: false,
				},
			],
			new Date("2026-05-15T04:00:00.000Z"),
		);

		expect(breakdown.map((day) => day.metadata.obligationId)).to.deep.equal([
			"obligation-1",
			"obligation-2",
		]);
	});

	it("marks obligation-backed snapshot metadata with the attendance obligation source", () => {
		const [day] = buildTimesheetBreakdownFromObligations(
			[
				{
					id: "obligation-1",
					date: new Date("2026-05-15T00:00:00.000Z"),
					businessDate: "2026-05-15",
					status: "EXPECTED",
					metadata: { reason: "PayrollPeriodOpened" },
					isDeleted: false,
				},
			],
			new Date("2026-05-15T04:00:00.000Z"),
		);

		expect(day.metadata.sourceOfTruth).to.equal("ATTENDANCE_OBLIGATION");
		expect(day.metadata.obligationId).to.equal("obligation-1");
		expect(day.metadata.storedStatus).to.equal("EXPECTED");
		expect(day.metadata.reason).to.equal("PayrollPeriodOpened");
	});

	it("carries schedule break metadata into the timesheet breakdown", () => {
		const [day] = buildTimesheetBreakdownFromObligations(
			[
				{
					id: "obligation-1",
					date: new Date("2026-05-15T00:00:00.000Z"),
					businessDate: "2026-05-15",
					status: "PRESENT",
					scheduleSnapshot: {
						breakMinutes: 45,
						timeSlots: [{ type: "break", startTime: "12:00", endTime: "12:45" }],
					},
					isDeleted: false,
				},
			],
			new Date("2026-05-15T04:00:00.000Z"),
		);

		expect(day.breakMinutes).to.equal(45);
		expect(day.metadata.breakMinutes).to.equal(45);
		expect(day.metadata.breakDisplay).to.equal("12:00 - 12:45");
	});

	it("recomputes worked time from clock evidence before snapshotting", () => {
		const [day] = buildTimesheetBreakdownFromObligations(
			[
				{
					id: "clocked-obligation",
					date: new Date("2026-05-14T00:00:00.000Z"),
					businessDate: "2026-05-14",
					status: "PRESENT",
					timeIn: new Date("2026-05-14T03:45:00.000Z"),
					timeOut: new Date("2026-05-14T09:00:00.000Z"),
					hoursWorked: "8:00",
					regularHours: "8:00",
					breakMinutes: 60,
					scheduleSnapshot: {
						timeSlots: [
							{ type: "work", startTime: "08:00", endTime: "12:00" },
							{ type: "break", startTime: "12:00", endTime: "13:00" },
							{ type: "work", startTime: "13:00", endTime: "17:00" },
						],
					},
					isDeleted: false,
				},
			],
			new Date("2026-05-15T04:00:00.000Z"),
		);

		expect(day.hoursWorked).to.equal("4:15");
		expect(day.regularHours).to.equal("4:15");
		expect(day.breakMinutes).to.equal(60);
		expect(day.metadata.totalMinutes).to.equal(255);
	});

	it("uses clock evidence business date when a stale obligation is linked to the prior day", () => {
		const breakdown = buildTimesheetBreakdownFromObligations(
			[
				{
					id: "stale-june-7-obligation",
					date: new Date("2026-06-07T00:00:00.000Z"),
					businessDate: "2026-06-07",
					status: "PRESENT",
					attendanceId: "attendance-june-8",
					timeIn: new Date("2026-06-08T15:50:19.000Z"),
					timeOut: new Date("2026-06-08T15:53:13.377Z"),
					hoursWorked: "0:03",
					regularHours: "0:00",
					overtimeHours: "0:03",
					lateHours: "22:30",
					isDeleted: false,
				},
				{
					id: "empty-june-8-obligation",
					date: new Date("2026-06-08T00:00:00.000Z"),
					businessDate: "2026-06-08",
					status: "EXPECTED",
					attendanceId: "attendance-june-8",
					timeIn: null,
					timeOut: null,
					hoursWorked: "0:00",
					regularHours: "0:00",
					overtimeHours: "0:00",
					lateHours: "0:00",
					isDeleted: false,
				},
			],
			new Date("2026-06-09T00:00:00.000Z"),
		);

		expect(breakdown).to.have.length(2);
		expect(breakdown[0].businessDate).to.equal("2026-06-07");
		expect(breakdown[0].status).to.equal("ABSENT");
		expect(breakdown[0].metadata.shiftedClockBusinessDate).to.equal("2026-06-08");
		expect(breakdown[0].timeIn).to.equal(null);
		expect(breakdown[1].businessDate).to.equal("2026-06-08");
		expect(breakdown[1].metadata.businessDate).to.equal("2026-06-08");
		expect(breakdown[1].metadata.obligationId).to.equal("stale-june-7-obligation");
		expect(breakdown[1].hoursWorked).to.equal("0:03");
		expect(breakdown[1].timeIn.toISOString()).to.equal("2026-06-08T15:50:19.000Z");
	});

	it("uses non-work stored statuses as the primary marker", () => {
		const breakdown = buildTimesheetBreakdownFromObligations(
			[
				{
					id: "leave-obligation",
					date: new Date("2026-05-15T00:00:00.000Z"),
					businessDate: "2026-05-15",
					status: "LEAVE",
					isDeleted: false,
				},
				{
					id: "holiday-obligation",
					date: new Date("2026-05-16T00:00:00.000Z"),
					businessDate: "2026-05-16",
					status: "HOLIDAY",
					isDeleted: false,
				},
			],
			new Date("2026-05-15T04:00:00.000Z"),
		);

		expect(breakdown.map((day) => day.primaryMarker)).to.deep.equal(["LEAVE", "HOLIDAY"]);
	});
});

