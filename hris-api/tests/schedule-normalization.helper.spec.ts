import { expect } from "chai";
import {
	buildNonOverlappingWorkBreakSlots,
	calculateShiftHourFromSlots,
} from "../helper/schedule-normalization.helper";

describe("schedule-normalization.helper", () => {
	it("subtracts break overlap from a single gross work window", () => {
		const hours = calculateShiftHourFromSlots([
			{ type: "work", startTime: "08:00", endTime: "17:00" },
			{ type: "break", startTime: "12:00", endTime: "13:00" },
		]);

		expect(hours).to.equal(8);
	});

	it("does not double-subtract a break between split work windows", () => {
		const hours = calculateShiftHourFromSlots([
			{ type: "work", startTime: "08:00", endTime: "12:00" },
			{ type: "break", startTime: "12:00", endTime: "13:00" },
			{ type: "work", startTime: "13:00", endTime: "17:00" },
		]);

		expect(hours).to.equal(8);
	});

	it("subtracts post-midnight breaks from overnight shifts", () => {
		const hours = calculateShiftHourFromSlots([
			{ type: "work", startTime: "20:00", endTime: "05:00" },
			{ type: "break", startTime: "00:00", endTime: "01:00" },
		]);

		expect(hours).to.equal(8);
	});

	it("builds split work slots around an imported BNPI break", () => {
		const slots = buildNonOverlappingWorkBreakSlots({
			startTime: "08:00",
			endTime: "18:00",
			breakStartTime: "12:00",
			breakEndTime: "13:00",
		});

		expect(slots).to.deep.equal([
			{ type: "work", label: "Work", startTime: "08:00", endTime: "12:00" },
			{ type: "break", label: "Break", startTime: "12:00", endTime: "13:00" },
			{ type: "work", label: "Work", startTime: "13:00", endTime: "18:00" },
		]);
		expect(calculateShiftHourFromSlots(slots)).to.equal(9);
	});

	it("builds split work slots around multiple adjacent BNPI breaks", () => {
		const slots = buildNonOverlappingWorkBreakSlots({
			startTime: "07:00",
			endTime: "16:00",
			breakWindows: [
				{ startTime: "08:30", endTime: "08:45", label: "Lunchbreak" },
				{ startTime: "08:45", endTime: "09:00", label: "Lunchbreak" },
				{ startTime: "12:15", endTime: "12:45", label: "Lunchbreak" },
			],
		});

		expect(slots).to.deep.equal([
			{ type: "work", label: "Work", startTime: "07:00", endTime: "08:30" },
			{ type: "break", label: "Lunchbreak", startTime: "08:30", endTime: "08:45" },
			{ type: "break", label: "Lunchbreak", startTime: "08:45", endTime: "09:00" },
			{ type: "work", label: "Work", startTime: "09:00", endTime: "12:15" },
			{ type: "break", label: "Lunchbreak", startTime: "12:15", endTime: "12:45" },
			{ type: "work", label: "Work", startTime: "12:45", endTime: "16:00" },
		]);
		expect(calculateShiftHourFromSlots(slots)).to.equal(8);
	});

	it("keeps overnight split-shift breaks visible without overlapping work slots", () => {
		const slots = buildNonOverlappingWorkBreakSlots({
			startTime: "07:00",
			endTime: "04:00",
			workWindows: [
				{ startTime: "07:00", endTime: "16:00" },
				{ startTime: "19:00", endTime: "04:00" },
			],
			breakWindows: [
				{ startTime: "08:30", endTime: "08:45", label: "Lunchbreak" },
				{ startTime: "08:45", endTime: "09:00", label: "Lunchbreak" },
				{ startTime: "20:30", endTime: "20:45", label: "1st break" },
				{ startTime: "23:00", endTime: "00:00", label: "AM break" },
				{ startTime: "02:30", endTime: "02:45", label: "PM break" },
				{ startTime: "04:00", endTime: "04:15", label: "PM break" },
			],
		});

		expect(slots).to.deep.equal([
			{ type: "work", label: "Work", startTime: "07:00", endTime: "08:30" },
			{ type: "break", label: "Lunchbreak", startTime: "08:30", endTime: "08:45" },
			{ type: "break", label: "Lunchbreak", startTime: "08:45", endTime: "09:00" },
			{ type: "work", label: "Work", startTime: "09:00", endTime: "16:00" },
			{ type: "work", label: "Work", startTime: "19:00", endTime: "20:30" },
			{ type: "break", label: "1st break", startTime: "20:30", endTime: "20:45" },
			{ type: "work", label: "Work", startTime: "20:45", endTime: "23:00" },
			{ type: "break", label: "AM break", startTime: "23:00", endTime: "00:00" },
			{ type: "work", label: "Work", startTime: "00:00", endTime: "02:30" },
			{ type: "break", label: "PM break", startTime: "02:30", endTime: "02:45" },
			{ type: "work", label: "Work", startTime: "02:45", endTime: "04:00" },
			{ type: "break", label: "PM break", startTime: "04:00", endTime: "04:15" },
		]);
		expect(calculateShiftHourFromSlots(slots)).to.equal(16);
	});
});
