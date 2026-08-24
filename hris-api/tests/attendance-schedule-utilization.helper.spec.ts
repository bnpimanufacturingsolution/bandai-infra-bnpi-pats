import { expect } from "chai";
import {
	applyScheduledDayArrivalToRows,
	buildPeriodRollupAttendanceRow,
	buildVirtualScheduledAttendanceRow,
	summarizeScheduledDepartmentBreakdown,
	summarizeScheduledDayTimekeeping,
	summarizeScheduledEmployeeBreakdown,
	pickScheduledDepartmentPreviewDays,
	pickScheduledDepartmentPreviewEmployees,
	eachBusinessDate,
	mergeScheduledAttendanceRecords,
	pageMergedScheduledAttendanceRecords,
	summarizeRegularScheduleUtilization,
} from "../helper/attendance-schedule-utilization.helper";

const monday = new Date("2026-08-10T00:00:00.000Z");
const thursday = new Date("2026-08-13T00:00:00.000Z");

const regularShift = {
	id: "shift-regular",
	isOff: false,
	code: "REGULAR_DAY",
	name: "Regular Day Shift",
};
const restShift = {
	id: "shift-rest",
	isOff: true,
	code: "REST",
	name: "Rest Day",
};

function employeeOnDate(params: {
	id: string;
	date: Date;
	shiftType: { id: string; isOff: boolean; code: string; name: string };
	attendances?: Array<{ date?: Date; timeIn?: Date | null; timeOut?: Date | null; status?: string }>;
}) {
	return {
		id: params.id,
		employmentStartDate: new Date("2024-01-01T00:00:00.000Z"),
		embeddedSchedule: { templateCode: "TEST", pattern: [] },
		scheduleOverrides: [
			{
				date: params.date,
				isDeleted: false,
				shiftTypeId: params.shiftType.id,
				shiftType: params.shiftType,
			},
		],
		attendances: params.attendances || [],
	};
}

describe("regular-schedule utilization denominator", () => {
	const shiftTypeById = new Map([
		["shift-regular", regularShift],
		["shift-rest", restShift],
	]);

	it("counts every employee with a regular work day before anyone clocks in", () => {
		const summary = summarizeRegularScheduleUtilization({
			employees: [
				employeeOnDate({ id: "a", date: thursday, shiftType: regularShift }),
				employeeOnDate({ id: "b", date: thursday, shiftType: regularShift }),
			],
			shiftTypeById,
			dates: [thursday],
		});

		expect(summary.scheduledWorkDays).to.equal(2);
		expect(summary.clockedInOnScheduledDays).to.equal(0);
		expect(summary.notClockedInOnScheduledDays).to.equal(2);
	});

	it("does not grow the scheduled count when someone clocks in", () => {
		const before = summarizeRegularScheduleUtilization({
			employees: [
				employeeOnDate({ id: "a", date: thursday, shiftType: regularShift }),
				employeeOnDate({ id: "b", date: thursday, shiftType: regularShift }),
			],
			shiftTypeById,
			dates: [thursday],
		});
		const after = summarizeRegularScheduleUtilization({
			employees: [
				employeeOnDate({
					id: "a",
					date: thursday,
					shiftType: regularShift,
					attendances: [
						{
							date: thursday,
							timeIn: new Date("2026-08-13T00:10:00.000Z"),
							status: "PRESENT",
						},
					],
				}),
				employeeOnDate({ id: "b", date: thursday, shiftType: regularShift }),
			],
			shiftTypeById,
			dates: [thursday],
		});

		expect(before.scheduledWorkDays).to.equal(2);
		expect(after.scheduledWorkDays).to.equal(2);
		expect(after.clockedInOnScheduledDays).to.equal(1);
		expect(after.notClockedInOnScheduledDays).to.equal(1);
	});

	it("ignores rest-day employees and check-ins that only exist because someone punched", () => {
		const summary = summarizeRegularScheduleUtilization({
			employees: [
				employeeOnDate({
					id: "rest",
					date: thursday,
					shiftType: restShift,
					attendances: [
						{
							date: thursday,
							timeIn: new Date("2026-08-13T00:10:00.000Z"),
							status: "PRESENT",
						},
					],
				}),
				{
					id: "no-schedule",
					employmentStartDate: new Date("2024-01-01T00:00:00.000Z"),
					embeddedSchedule: null,
					attendances: [
						{
							date: thursday,
							timeIn: new Date("2026-08-13T00:10:00.000Z"),
							status: "PRESENT",
						},
					],
				},
			],
			shiftTypeById,
			dates: [thursday],
		});

		expect(summary.scheduledWorkDays).to.equal(0);
		expect(summary.clockedInOnScheduledDays).to.equal(0);
		expect(summary.restDays).to.equal(1);
		expect(summary.missingScheduleDays).to.equal(1);
	});

	it("does not use a Monday-only regular shift in Thursday's scheduled total", () => {
		const summary = summarizeRegularScheduleUtilization({
			employees: [employeeOnDate({ id: "mon-only", date: monday, shiftType: regularShift })],
			shiftTypeById,
			dates: [thursday],
		});

		expect(summary.scheduledWorkDays).to.equal(0);
		expect(monday.getUTCDay()).to.equal(1);
	});

	it("does not count the next Manila day when the request ends at UTC end-of-day", () => {
		const dates = eachBusinessDate(
			new Date("2026-08-17T00:00:00.000Z"),
			new Date("2026-08-17T23:59:59.999Z"),
		);
		expect(dates.map((date) => date.toISOString().slice(0, 10))).to.deep.equal(["2026-08-17"]);

		const summary = summarizeRegularScheduleUtilization({
			employees: [
				{
					id: "two-day",
					employmentStartDate: new Date("2024-01-01T00:00:00.000Z"),
					embeddedSchedule: { templateCode: "TEST", pattern: [] },
					scheduleOverrides: [
						{
							date: new Date("2026-08-17T00:00:00.000Z"),
							isDeleted: false,
							shiftTypeId: regularShift.id,
							shiftType: regularShift,
						},
						{
							date: new Date("2026-08-18T00:00:00.000Z"),
							isDeleted: false,
							shiftTypeId: regularShift.id,
							shiftType: regularShift,
						},
					],
					attendances: [],
				},
			],
			shiftTypeById,
			dates,
		});

		expect(summary.scheduledWorkDays).to.equal(1);
		expect(summary.notClockedInOnScheduledDays).to.equal(1);
	});

	it("pages the scheduled not-clocked-in population, not leftover obligation rows", () => {
		const summary = summarizeRegularScheduleUtilization({
			employees: [
				employeeOnDate({ id: "a", date: thursday, shiftType: regularShift }),
				employeeOnDate({ id: "b", date: thursday, shiftType: regularShift }),
				employeeOnDate({
					id: "c",
					date: thursday,
					shiftType: regularShift,
					attendances: [
						{
							date: thursday,
							timeIn: new Date("2026-08-13T00:10:00.000Z"),
							status: "PRESENT",
						},
					],
				}),
			],
			shiftTypeById,
			dates: [thursday],
		});
		const existing = [
			{
				employeeRefId: "a",
				date: "2026-08-13",
				employeeName: "A",
				status: "NOT_CLOCKED_IN",
			},
		];
		const merged = mergeScheduledAttendanceRecords(existing, summary.scheduledDays);
		const page = pageMergedScheduledAttendanceRecords({
			existingRows: existing,
			scheduledDays: summary.scheduledDays,
			page: 1,
			limit: 1,
		});

		expect(summary.notClockedInOnScheduledDays).to.equal(2);
		expect(merged).to.have.length(2);
		expect(merged.some((row: any) => String(row.id || "").startsWith("scheduled:b:"))).to.equal(
			true,
		);
		expect(page.totalRecords).to.equal(2);
		expect(page.records).to.have.length(1);
		const leftover = pageMergedScheduledAttendanceRecords({
			existingRows: [
				...existing,
				{
					employeeRefId: "not-scheduled",
					date: "2026-08-13",
					employeeName: "Z Leftover",
					status: "NOT_CLOCKED_IN",
				},
			],
			scheduledDays: summary.scheduledDays,
			page: 1,
			limit: 10,
		});
		expect(leftover.totalRecords).to.equal(2);

		const clockedPage = pageMergedScheduledAttendanceRecords({
			existingRows: [],
			scheduledDays: summary.scheduledDays,
			page: 1,
			limit: 10,
			mode: "clocked_in",
		});
		expect(clockedPage.totalRecords).to.equal(1);
		expect(clockedPage.records[0].employeeRefId).to.equal("c");
		expect(clockedPage.records[0].status).to.equal("PRESENT");
	});

	it("shows late minutes on a scheduled clock-in row from the shift start", () => {
		const summary = summarizeRegularScheduleUtilization({
			employees: [
				employeeOnDate({
					id: "zen",
					date: thursday,
					shiftType: {
						...regularShift,
						startTime: "08:00",
						endTime: "17:00",
						timeSlots: [{ type: "work", startTime: "08:00", endTime: "17:00" }],
					},
					attendances: [
						{
							date: thursday,
							timeIn: new Date("2026-08-13T05:40:00.000Z"),
							status: "INCOMPLETE",
						},
					],
				}),
			],
			shiftTypeById: new Map([
				[
					"shift-regular",
					{
						...regularShift,
						startTime: "08:00",
						endTime: "17:00",
						timeSlots: [{ type: "work", startTime: "08:00", endTime: "17:00" }],
					},
				],
			]),
			dates: [thursday],
		});
		const row = buildVirtualScheduledAttendanceRow(summary.scheduledDays[0]);
		expect(row.lateHours).to.equal("5:40");
		expect(row.computationMeta.evaluatedFromSchedule).to.equal(true);
		expect(row.computationMeta.withinGrace).to.equal(false);
		expect(row.behaviorFlags).to.include("TARDINESS");

		const staleRestSnapshot = pageMergedScheduledAttendanceRecords({
			existingRows: [
				{
					employeeRefId: "zen",
					date: "2026-08-13",
					employeeName: "Zen",
					timeIn: "2026-08-13T05:40:00.000Z",
					lateHours: "0:00",
					behaviorFlags: [],
					scheduleSnapshot: { isOff: true },
				},
			],
			scheduledDays: summary.scheduledDays,
			page: 1,
			limit: 10,
			mode: "clocked_in",
		});
		expect(staleRestSnapshot.records[0].lateHours).to.equal("5:40");
		expect(staleRestSnapshot.records[0].computationMeta.evaluatedFromSchedule).to.equal(true);
	});

	it("fills undertime and hours worked on a scheduled clock-out row", () => {
		const dayShift = {
			...regularShift,
			startTime: "08:00",
			endTime: "17:00",
			timeSlots: [{ type: "work", startTime: "08:00", endTime: "17:00" }],
		};
		const summary = summarizeRegularScheduleUtilization({
			employees: [
				employeeOnDate({
					id: "zen",
					date: thursday,
					shiftType: dayShift,
					attendances: [
						{
							date: thursday,
							timeIn: new Date("2026-08-13T05:40:00.000Z"),
							timeOut: new Date("2026-08-13T06:55:00.000Z"),
							status: "PRESENT",
						},
					],
				}),
			],
			shiftTypeById: new Map([["shift-regular", dayShift]]),
			dates: [thursday],
		});
		const row = buildVirtualScheduledAttendanceRow(summary.scheduledDays[0]);
		expect(row.lateHours).to.equal("5:40");
		expect(row.earlyOutHours).to.equal("2:05");
		expect(row.hoursWorked).to.equal("1:15");
	});

	it("rolls department PRES from real scheduled clock-ins and previews those first", () => {
		const dayShift = {
			...regularShift,
			startTime: "08:00",
			endTime: "17:00",
			timeSlots: [{ type: "work", startTime: "08:00", endTime: "17:00" }],
		};
		const summary = summarizeRegularScheduleUtilization({
			employees: [
				{
					...employeeOnDate({
						id: "clocked",
						date: thursday,
						shiftType: dayShift,
						attendances: [
							{
								date: thursday,
								timeIn: new Date("2026-08-13T00:05:00.000Z"),
								status: "INCOMPLETE",
							},
						],
					}),
					departmentId: "prod",
					department: { id: "prod", name: "Production" },
				},
				{
					...employeeOnDate({
						id: "waiting",
						date: thursday,
						shiftType: dayShift,
					}),
					departmentId: "prod",
					department: { id: "prod", name: "Production" },
				},
			],
			shiftTypeById: new Map([["shift-regular", dayShift]]),
			dates: [thursday],
		});
		const depts = summarizeScheduledDepartmentBreakdown(summary.scheduledDays);
		expect(depts).to.have.length(1);
		expect(depts[0].present).to.equal(1);
		expect(depts[0].scheduled).to.equal(2);
		const preview = pickScheduledDepartmentPreviewDays(summary.scheduledDays, 5);
		expect(preview[0].employeeRefId).to.equal("clocked");
		expect(preview[0].clockedIn).to.equal(true);
	});

	it("counts late and undertime for overview cards from scheduled clock-ins", () => {
		const dayShift = {
			...regularShift,
			startTime: "08:00",
			endTime: "17:00",
			timeSlots: [{ type: "work", startTime: "08:00", endTime: "17:00" }],
		};
		const summary = summarizeRegularScheduleUtilization({
			employees: [
				employeeOnDate({
					id: "zen",
					date: thursday,
					shiftType: dayShift,
					attendances: [
						{
							date: thursday,
							timeIn: new Date("2026-08-13T05:40:00.000Z"),
							timeOut: new Date("2026-08-13T06:55:00.000Z"),
							status: "PRESENT",
						},
					],
				}),
				employeeOnDate({
					id: "on-time",
					date: thursday,
					shiftType: dayShift,
					attendances: [
						{
							date: thursday,
							timeIn: new Date("2026-08-13T00:00:00.000Z"),
							timeOut: new Date("2026-08-13T09:00:00.000Z"),
							status: "PRESENT",
						},
					],
				}),
			],
			shiftTypeById: new Map([["shift-regular", dayShift]]),
			dates: [thursday],
		});
		const timekeeping = summarizeScheduledDayTimekeeping(summary.scheduledDays);
		expect(timekeeping.lateCount).to.equal(1);
		expect(timekeeping.onTimeCount).to.equal(1);
		expect(timekeeping.undertimeCount).to.equal(1);
		expect(timekeeping.clockedOutCount).to.equal(2);
	});

	it("applies scheduled-day late/UT/hours to all-status obligation rows", () => {
		const dayShift = {
			...regularShift,
			startTime: "08:00",
			endTime: "17:00",
			timeSlots: [{ type: "work", startTime: "08:00", endTime: "17:00" }],
		};
		const summary = summarizeRegularScheduleUtilization({
			employees: [
				employeeOnDate({
					id: "zen",
					date: thursday,
					shiftType: dayShift,
					attendances: [
						{
							date: thursday,
							timeIn: new Date("2026-08-13T05:40:00.000Z"),
							timeOut: new Date("2026-08-13T06:55:00.000Z"),
							status: "PRESENT",
						},
					],
				}),
			],
			shiftTypeById: new Map([["shift-regular", dayShift]]),
			dates: [thursday],
		});
		const [enriched] = applyScheduledDayArrivalToRows(
			[
				{
					employeeRefId: "zen",
					date: "2026-08-13",
					employeeName: "Zen",
					timeIn: "2026-08-13T05:40:00.000Z",
					timeOut: "2026-08-13T06:55:00.000Z",
					lateHours: "0:00",
					earlyOutHours: "0:00",
					hoursWorked: "0:00",
					behaviorFlags: [],
					scheduleSnapshot: { isOff: true },
				},
			],
			summary.scheduledDays,
		);
		expect(enriched.lateHours).to.equal("5:40");
		expect(enriched.earlyOutHours).to.equal("2:05");
		expect(enriched.hoursWorked).to.equal("1:15");
	});

	it("does not treat a 1970 sentinel termination as already separated", () => {
		const summary = summarizeRegularScheduleUtilization({
			employees: [
				{
					...employeeOnDate({ id: "zen", date: thursday, shiftType: regularShift }),
					employmentStatus: "ONBOARDING",
					employmentTerminationDate: "1970-01-01T00:00:00.000Z",
				},
			],
			shiftTypeById,
			dates: [thursday],
		});

		expect(summary.scheduledWorkDays).to.equal(1);
		expect(summary.notClockedInOnScheduledDays).to.equal(1);
	});

	it("totals present late undertime and absent days per employee across a range", () => {
		const dayShift = {
			...regularShift,
			startTime: "08:00",
			endTime: "17:00",
			timeSlots: [{ type: "work", startTime: "08:00", endTime: "17:00" }],
		};
		const summary = summarizeRegularScheduleUtilization({
			employees: [
				{
					...employeeOnDate({
						id: "zen",
						date: monday,
						shiftType: dayShift,
						attendances: [
							{
								date: monday,
								timeIn: new Date("2026-08-10T05:40:00.000Z"),
								timeOut: new Date("2026-08-10T06:55:00.000Z"),
								status: "PRESENT",
							},
							{
								date: thursday,
								timeIn: new Date("2026-08-13T00:00:00.000Z"),
								timeOut: new Date("2026-08-13T09:00:00.000Z"),
								status: "PRESENT",
							},
						],
					}),
					scheduleOverrides: [
						{
							date: monday,
							isDeleted: false,
							shiftTypeId: dayShift.id,
							shiftType: dayShift,
						},
						{
							date: thursday,
							isDeleted: false,
							shiftTypeId: dayShift.id,
							shiftType: dayShift,
						},
						{
							date: new Date("2026-08-11T00:00:00.000Z"),
							isDeleted: false,
							shiftTypeId: dayShift.id,
							shiftType: dayShift,
						},
					],
					departmentId: "gahr",
					department: { id: "gahr", name: "GA/HR" },
				},
			],
			shiftTypeById: new Map([["shift-regular", dayShift]]),
			dates: [monday, new Date("2026-08-11T00:00:00.000Z"), thursday],
		});

		const [zen] = summarizeScheduledEmployeeBreakdown(summary.scheduledDays);
		expect(zen.scheduled).to.equal(3);
		expect(zen.present).to.equal(2);
		expect(zen.late).to.equal(1);
		expect(zen.undertime).to.equal(1);
		expect(zen.absent).to.equal(1);

		const dayPreview = pickScheduledDepartmentPreviewDays(summary.scheduledDays, 5);
		expect(dayPreview.length).to.equal(3);
		const employeePreview = pickScheduledDepartmentPreviewEmployees([zen], 5);
		expect(employeePreview).to.have.length(1);
		expect(employeePreview[0].employeeRefId).to.equal("zen");

		const row = buildPeriodRollupAttendanceRow(zen);
		expect(row.isPeriodRollup).to.equal(true);
		expect(row.periodTotals.present).to.equal(2);
		expect(row.periodTotals.late).to.equal(1);
		expect(row.periodTotals.undertime).to.equal(1);
		expect(row.id).to.equal("period-rollup:zen");
	});
});
