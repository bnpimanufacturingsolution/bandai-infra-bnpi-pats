import { expect } from "chai";
import {
	MISSING_PUNCH_NO_PAY_REASON,
	calculateBandaiApprovedBucketDayPay,
	calculateBandaiApprovedBucketPay,
	isMissingPunchDay,
	isMissingPunchWorkDay,
} from "../helper/payroll-period.helper";

describe("missing-punch no-pay day rule", () => {
	it("flags a day with no time-in", () => {
		expect(
			isMissingPunchDay({ status: "INCOMPLETE", timeIn: null, timeOut: "18:00", hoursWorked: "0:00" }),
		).to.equal(true);
	});

	it("flags a day with no time-out", () => {
		expect(
			isMissingPunchDay({ status: "INCOMPLETE", timeIn: "06:32", timeOut: null, hoursWorked: "0:00" }),
		).to.equal(true);
	});

	it("flags a single duplicated punch (in == out, zero worked minutes)", () => {
		expect(
			isMissingPunchDay({ status: "PRESENT", timeIn: "06:45", timeOut: "06:45", hoursWorked: "0:00" }),
		).to.equal(true);
	});

	it("does not flag a complete punch pair with worked time", () => {
		expect(
			isMissingPunchDay({ status: "PRESENT", timeIn: "06:45", timeOut: "15:00", hoursWorked: "8:00" }),
		).to.equal(false);
	});

	it("does not flag non-object input", () => {
		expect(isMissingPunchDay(null)).to.equal(false);
		expect(isMissingPunchDay(undefined)).to.equal(false);
	});

	it("exposes the HR-facing no-pay reason", () => {
		expect(MISSING_PUNCH_NO_PAY_REASON).to.be.a("string");
		expect(MISSING_PUNCH_NO_PAY_REASON.length).to.be.greaterThan(0);
	});
});

describe("strict no-pay rule for missing-punch workdays (operator 2026-09-08)", () => {
	const bucketDay = (overrides: Record<string, unknown> = {}) => ({
		status: "PRESENT",
		timeIn: "06:45",
		timeOut: null,
		hoursWorked: "0:00",
		isRestDay: false,
		metadata: {
			bandaiPayrollSourceRepair: {
				approvedBuckets: { regularDays: 1, regOtHrs: 2 },
			},
		},
		...overrides,
	});
	const bucketPay = {
		hourlyRate: 70,
		sourceRegularDays: 8,
		specialHolidayWorkMultiplier: 0.3,
	} as any;

	it("flags clock-in without clock-out on a workday", () => {
		expect(isMissingPunchWorkDay(bucketDay())).to.equal(true);
	});

	it("flags clock-out without clock-in on a workday", () => {
		expect(
			isMissingPunchWorkDay(
				bucketDay({ status: "INCOMPLETE", timeIn: null, timeOut: "18:00" }),
			),
		).to.equal(true);
	});

	it("does not flag a complete punch pair on a workday", () => {
		expect(
			isMissingPunchWorkDay(
				bucketDay({ timeOut: "15:45", hoursWorked: "8:00" }),
			),
		).to.equal(false);
	});

	it("keeps existing rest-day and leave behavior (not a strict no-pay day)", () => {
		expect(isMissingPunchWorkDay(bucketDay({ isRestDay: true }))).to.equal(false);
		expect(isMissingPunchWorkDay(bucketDay({ status: "LEAVE" }))).to.equal(false);
		expect(isMissingPunchWorkDay(bucketDay({ status: "ABSENT" }))).to.equal(false);
	});

	it("bucket day pay returns null for a missing-punch workday even with file hours", () => {
		expect(calculateBandaiApprovedBucketDayPay(bucketDay(), bucketPay, 7500)).to.equal(
			null,
		);
	});

	it("bucket day pay still pays a complete workday", () => {
		const paid = calculateBandaiApprovedBucketDayPay(
			bucketDay({ timeOut: "15:45", hoursWorked: "8:00" }),
			bucketPay,
			7500,
		);
		expect(paid).to.not.equal(null);
		expect(paid?.regularPay).to.be.greaterThan(0);
	});

	it("bucket totals exclude missing-punch workdays", () => {
		const totals = calculateBandaiApprovedBucketPay(
			[
				bucketDay({ timeOut: "15:45", hoursWorked: "8:00" }),
				bucketDay(),
			],
			7500,
			null,
		);
		expect(totals).to.not.equal(null);
		expect(totals?.hours?.regularDays).to.equal(1);
		expect(totals?.sourceDayCount).to.equal(1);
	});
});
