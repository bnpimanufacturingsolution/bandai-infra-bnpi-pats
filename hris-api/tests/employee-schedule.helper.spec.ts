import { expect } from "chai";
import {
	collectShiftTypeIdsFromEmployeeScheduleData,
	copyTemplateToEmployeeEmbeddedSchedule,
	resolveEffectiveShiftFromEmployeeData,
} from "../helper/employee-schedule.helper";

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
});
