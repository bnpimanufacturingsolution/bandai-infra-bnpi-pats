import { expect } from "chai";
import {
	buildManualPatternEmbeddedSchedule,
	collectShiftTypeIdsFromEmployeeScheduleData,
	copyTemplateToEmployeeEmbeddedSchedule,
	resolveEffectiveShiftFromEmployeeData,
} from "../helper/employee-schedule.helper";
import { CreateEmployeeScheduleSchema } from "../zod/employeeSchedule.zod";

describe("employee-schedule.helper regression", () => {
	const wrappedEmbeddedSchedule = {
		set: {
			templateId: "template-1",
			templateName: "Regular Rotation",
			cycleDays: 1,
			effectiveStartDate: "2026-01-01T00:00:00.000Z",
			pattern: [
				{
					day: 1,
					shiftTypeId: "shift-1",
					shiftSnapshot: {
						code: "REGULAR_DAY",
						name: "Regular Day",
						isOff: false,
						isOvernight: false,
						timeSlots: [
							{ type: "work", label: "AM", startTime: "08:00", endTime: "12:00" },
							{ type: "break", label: "Lunch", startTime: "12:00", endTime: "13:00" },
							{ type: "work", label: "PM", startTime: "13:00", endTime: "17:00" },
						],
					},
				},
			],
		},
	};

	it("unwraps legacy Prisma Json set wrapper when collecting embedded shift ids", () => {
		const ids = collectShiftTypeIdsFromEmployeeScheduleData({
			embeddedSchedule: wrappedEmbeddedSchedule,
		});

		expect(ids).to.deep.equal(["shift-1"]);
	});

	it("unwraps legacy Prisma Json set wrapper when resolving effective shift", () => {
		const shift = resolveEffectiveShiftFromEmployeeData(
			{
				embeddedSchedule: wrappedEmbeddedSchedule,
				employmentStartDate: "2026-01-01T00:00:00.000Z",
				scheduleOverrides: [],
				scheduleHistoryRecords: [],
			},
			new Date("2026-05-20T00:00:00.000Z"),
			new Map(),
		);

		expect(shift?.shiftTypeId).to.equal("shift-1");
		expect(shift?.startTime).to.equal("08:00");
		expect(shift?.endTime).to.equal("17:00");
		expect(shift?.isOff).to.equal(false);
	});

	it("keeps business effective start separate from weekly cycle anchor", () => {
		const embeddedSchedule = copyTemplateToEmployeeEmbeddedSchedule({
			template: {
				id: "template-weekly",
				code: "MON_SUN",
				name: "Weekly Rotation",
				cycleDays: 7,
				pattern: Array.from({ length: 7 }, (_, index) => ({
					day: index + 1,
					shiftTypeId: `shift-${index + 1}`,
					shiftSnapshot: {
						code: `DAY_${index + 1}`,
						name: `Day ${index + 1}`,
						isOff: false,
						isOvernight: false,
						timeSlots: [
							{
								type: "work",
								label: "Work",
								startTime: "08:00",
								endTime: "17:00",
							},
						],
					},
				})),
			},
			effectiveStartDate: new Date("2026-01-01T00:00:00.000Z"),
		});

		expect(new Date(embeddedSchedule.effectiveStartDate).toISOString()).to.equal(
			"2026-01-01T00:00:00.000Z",
		);
		expect(new Date((embeddedSchedule as any).cycleAnchorDate).toISOString()).to.equal(
			"2025-12-29T00:00:00.000Z",
		);

		const beforeHireShift = resolveEffectiveShiftFromEmployeeData(
			{
				embeddedSchedule,
				employmentStartDate: "2026-01-01T00:00:00.000Z",
				scheduleOverrides: [],
				scheduleHistoryRecords: [],
			},
			new Date("2025-12-31T00:00:00.000Z"),
			new Map(),
		);
		expect(beforeHireShift).to.equal(null);

		const hireDateShift = resolveEffectiveShiftFromEmployeeData(
			{
				embeddedSchedule,
				employmentStartDate: "2026-01-01T00:00:00.000Z",
				scheduleOverrides: [],
				scheduleHistoryRecords: [],
			},
			new Date("2026-01-01T00:00:00.000Z"),
			new Map(),
		);

		expect(hireDateShift?.templateDay).to.equal(4);
		expect(hireDateShift?.shiftTypeCode).to.equal("DAY_4");
	});

	it("week-aligns a 14-day template when cycleAnchorDate is missing", () => {
		const embeddedSchedule = {
			cycleDays: 14,
			effectiveStartDate: "2026-08-12T00:00:00.000Z",
			pattern: Array.from({ length: 14 }, (_, index) => ({
				day: index + 1,
				shiftTypeId: `shift-${index + 1}`,
				shiftSnapshot: {
					code: index + 1 === 6 ? "OFF" : index + 1 === 8 ? "NIGHT_SHIFT" : "REGULAR_DAY",
					name: `Day ${index + 1}`,
					isOff: index + 1 === 6,
					isOvernight: index + 1 === 8,
					timeSlots: [
						{ type: "work", label: "Work", startTime: "08:00", endTime: "17:00" },
					],
				},
			})),
		};
		const employee = {
			embeddedSchedule,
			employmentStartDate: "2026-08-12T00:00:00.000Z",
			scheduleOverrides: [],
		};

		const wednesday = resolveEffectiveShiftFromEmployeeData(
			employee,
			new Date("2026-08-12T00:00:00.000Z"),
			new Map(),
		);
		const nextMonday = resolveEffectiveShiftFromEmployeeData(
			employee,
			new Date("2026-08-17T00:00:00.000Z"),
			new Map(),
		);

		expect(wednesday?.templateDay).to.equal(3);
		expect(nextMonday?.templateDay).to.equal(8);
		expect(nextMonday?.shiftTypeCode).to.equal("NIGHT_SHIFT");
		expect(nextMonday?.isOff).to.equal(false);
	});

	it("builds a weekly hours pattern with different Mon/Tue times", () => {
		const monday = new Date("2026-08-24T00:00:00.000Z");
		const embedded = buildManualPatternEmbeddedSchedule({
			startDate: monday,
			pattern: [
				{ day: 1, startTime: "06:00", endTime: "15:00" },
				{ day: 2, startTime: "07:00", endTime: "16:00" },
				{ day: 3, startTime: "08:00", endTime: "17:00" },
				{ day: 4, startTime: "08:00", endTime: "17:00" },
				{ day: 5, startTime: "08:00", endTime: "17:00" },
				{ day: 6, isOff: true },
				{ day: 7, isOff: true },
			],
		});

		expect(embedded.cycleDays).to.equal(7);
		expect(embedded.templateCode).to.equal("WEEKLY_HOURS");
		expect(embedded.pattern[0].shiftSnapshot.timeSlots[0]).to.deep.equal({
			type: "work",
			label: "Work",
			startTime: "06:00",
			endTime: "15:00",
		});
		expect(embedded.pattern[1].shiftSnapshot.timeSlots[0].startTime).to.equal("07:00");
		expect(embedded.pattern[5].shiftSnapshot.isOff).to.equal(true);

		const mondayShift = resolveEffectiveShiftFromEmployeeData(
			{
				embeddedSchedule: embedded,
				employmentStartDate: monday.toISOString(),
				scheduleOverrides: [],
				scheduleHistoryRecords: [],
			},
			monday,
			new Map(),
		);
		const tuesdayShift = resolveEffectiveShiftFromEmployeeData(
			{
				embeddedSchedule: embedded,
				employmentStartDate: monday.toISOString(),
				scheduleOverrides: [],
				scheduleHistoryRecords: [],
			},
			new Date("2026-08-25T00:00:00.000Z"),
			new Map(),
		);
		expect(mondayShift?.startTime).to.equal("06:00");
		expect(mondayShift?.endTime).to.equal("15:00");
		expect(tuesdayShift?.startTime).to.equal("07:00");
		expect(tuesdayShift?.endTime).to.equal("16:00");
	});

	it("accepts a weekly pattern on CreateEmployeeScheduleSchema", () => {
		const parsed = CreateEmployeeScheduleSchema.safeParse({
			employeeId: "emp-1",
			pattern: [
				{ day: 1, startTime: "06:00", endTime: "15:00" },
				{ day: 2, startTime: "07:00", endTime: "16:00" },
				{ day: 3, startTime: "08:00", endTime: "17:00" },
				{ day: 4, startTime: "08:00", endTime: "17:00" },
				{ day: 5, startTime: "08:00", endTime: "17:00" },
				{ day: 6, isOff: true },
				{ day: 7, isOff: true },
			],
		});
		expect(parsed.success).to.equal(true);
	});
});
