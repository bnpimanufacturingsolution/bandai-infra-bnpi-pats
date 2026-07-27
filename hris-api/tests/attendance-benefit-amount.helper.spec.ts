import assert from "node:assert/strict";
import {
	computeAttendanceBenefitAmount,
	countAttendanceBenefitDaysFromBreakdown,
	deriveAttendanceBenefitMetrics,
} from "../helper/attendance-benefit-amount.helper";

describe("attendance-benefit-amount.helper", () => {
	it("derives present days as scheduled minus ABSENT only", () => {
		assert.deepEqual(
			deriveAttendanceBenefitMetrics({ scheduledWorkDays: 11, absentDays: 2 }),
			{ scheduledWorkDays: 11, absentDays: 2, presentDays: 9 },
		);
	});

	it("clamps absent days so present never goes negative", () => {
		assert.deepEqual(
			deriveAttendanceBenefitMetrics({ scheduledWorkDays: 5, absentDays: 9 }),
			{ scheduledWorkDays: 5, absentDays: 5, presentDays: 0 },
		);
	});

	it("computes PER_DAY as rate × present days", () => {
		assert.equal(
			computeAttendanceBenefitAmount({
				basis: "PER_DAY",
				enrolledAmount: 50,
				scheduledWorkDays: 11,
				absentDays: 2,
			}),
			450,
		);
	});

	it("computes PER_CUTOFF as full × present/scheduled", () => {
		assert.equal(
			computeAttendanceBenefitAmount({
				basis: "PER_CUTOFF",
				enrolledAmount: 500,
				scheduledWorkDays: 10,
				absentDays: 2,
			}),
			400,
		);
	});

	it("returns 0 for PER_CUTOFF when scheduled work days is 0", () => {
		assert.equal(
			computeAttendanceBenefitAmount({
				basis: "PER_CUTOFF",
				enrolledAmount: 500,
				scheduledWorkDays: 0,
				absentDays: 0,
			}),
			0,
		);
	});

	it("returns 0 when enrolled amount is not positive", () => {
		assert.equal(
			computeAttendanceBenefitAmount({
				basis: "PER_DAY",
				enrolledAmount: 0,
				scheduledWorkDays: 10,
				absentDays: 0,
			}),
			0,
		);
	});

	it("returns full cut-off amount when there are no absences", () => {
		assert.equal(
			computeAttendanceBenefitAmount({
				basis: "PER_CUTOFF",
				enrolledAmount: 500,
				scheduledWorkDays: 11,
				absentDays: 0,
			}),
			500,
		);
	});

	it("returns 0 for PER_DAY when fully absent", () => {
		assert.equal(
			computeAttendanceBenefitAmount({
				basis: "PER_DAY",
				enrolledAmount: 50,
				scheduledWorkDays: 10,
				absentDays: 10,
			}),
			0,
		);
	});

	it("counts breakdown days excluding REST_DAY and treating only ABSENT as absence", () => {
		const metrics = countAttendanceBenefitDaysFromBreakdown([
			{ status: "PRESENT" },
			{ status: "PRESENT" },
			{ status: "ABSENT" },
			{ status: "REST_DAY" },
			{ status: "LEAVE" },
			{ status: "PRESENT" },
		]);

		assert.deepEqual(metrics, {
			scheduledWorkDays: 5,
			absentDays: 1,
			presentDays: 4,
		});
	});

	it("rounds PER_CUTOFF money to centavos", () => {
		// 500 * (2/3) = 333.333... → 333.33
		assert.equal(
			computeAttendanceBenefitAmount({
				basis: "PER_CUTOFF",
				enrolledAmount: 500,
				scheduledWorkDays: 3,
				absentDays: 1,
			}),
			333.33,
		);
	});
});
