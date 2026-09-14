import { expect } from "chai";
import {
	resolveZeroPayReason,
	resolveBandaiRegisterBasicPay,
	resolvePathBAbsentDays,
	isMissingPunchDay,
	isMissingPunchWorkDay,
} from "../../helper/payroll-period.helper";

describe("payroll-attendance-cutoff-enforcement", () => {
	describe("isMissingPunchDay / isMissingPunchWorkDay", () => {
		it("flags missing timeIn as missing punch", () => {
			const day = {
				status: "PRESENT",
				date: new Date("2026-09-01T00:00:00.000Z"),
				timeIn: null,
				timeOut: new Date("2026-09-01T17:00:00.000Z"),
				hoursWorked: "8:00",
			};
			expect(isMissingPunchDay(day)).to.equal(true);
			expect(isMissingPunchWorkDay(day)).to.equal(true);
		});

		it("flags missing timeOut as missing punch", () => {
			const day = {
				status: "PRESENT",
				date: new Date("2026-09-01T00:00:00.000Z"),
				timeIn: new Date("2026-09-01T08:00:00.000Z"),
				timeOut: null,
				hoursWorked: "8:00",
			};
			expect(isMissingPunchDay(day)).to.equal(true);
			expect(isMissingPunchWorkDay(day)).to.equal(true);
		});

		it("flags hoursWorked <= 0 as missing punch", () => {
			const day = {
				status: "PRESENT",
				date: new Date("2026-09-01T00:00:00.000Z"),
				timeIn: new Date("2026-09-01T08:00:00.000Z"),
				timeOut: new Date("2026-09-01T08:00:00.000Z"),
				hoursWorked: "0:00",
			};
			expect(isMissingPunchDay(day)).to.equal(true);
			expect(isMissingPunchWorkDay(day)).to.equal(true);
		});

		it("passes complete valid punch pair", () => {
			const day = {
				status: "PRESENT",
				date: new Date("2026-09-01T00:00:00.000Z"),
				timeIn: new Date("2026-09-01T08:00:00.000Z"),
				timeOut: new Date("2026-09-01T17:00:00.000Z"),
				hoursWorked: "8:00",
			};
			expect(isMissingPunchDay(day)).to.equal(false);
			expect(isMissingPunchWorkDay(day)).to.equal(false);
		});
	});

	describe("resolveZeroPayReason", () => {
		it("returns NO_DEVICE_DATA when breakdown is empty", () => {
			const res = resolveZeroPayReason([], []);
			expect(res.hasAttendance).to.equal(false);
			expect(res.zeroPayReason).to.equal("NO_DEVICE_DATA");
		});

		it("returns NO_DEVICE_DATA when effectiveWorkedDays is 0 and no leaves or bucket pay", () => {
			const breakdown = [{ status: "SCHEDULED", date: "2026-09-01" }];
			const validated = [{ status: "SCHEDULED", date: "2026-09-01" }];
			const res = resolveZeroPayReason(breakdown, validated, {
				effectiveWorkedDays: 0,
				paidLeaveDays: 0,
				hasApprovedBucketPay: false,
			});
			expect(res.hasAttendance).to.equal(false);
			expect(res.zeroPayReason).to.equal("NO_DEVICE_DATA");
		});

		it("returns hasAttendance = true when effectiveWorkedDays > 0", () => {
			const breakdown = [{ status: "PRESENT", date: "2026-09-01" }];
			const validated = [{ status: "PRESENT", date: "2026-09-01" }];
			const res = resolveZeroPayReason(breakdown, validated, {
				effectiveWorkedDays: 1,
				paidLeaveDays: 0,
				hasApprovedBucketPay: false,
			});
			expect(res.hasAttendance).to.equal(true);
			expect(res.zeroPayReason).to.equal(null);
		});
	});

	describe("resolveBandaiRegisterBasicPay for Path A (Daily-rated)", () => {
		it("pays only 1 day when employee is present for 1 day", () => {
			const res = resolveBandaiRegisterBasicPay({
				periodBasic: 15000,
				registerDailyRate: 600,
				paidRegularDays: 1,
				presentFallbackDays: 1,
			});
			expect(res.path).to.equal("A");
			expect(res.basicPay).to.equal(600);
			expect(res.paidRegularDays).to.equal(1);
			expect(res.suppressFullDayAbsentDeduction).to.equal(true);
		});

		it("pays 0 when employee has 0 days worked", () => {
			const res = resolveBandaiRegisterBasicPay({
				periodBasic: 15000,
				registerDailyRate: 600,
				paidRegularDays: 0,
				presentFallbackDays: 0,
			});
			expect(res.path).to.equal("A");
			expect(res.basicPay).to.equal(0);
			expect(res.paidRegularDays).to.equal(0);
		});
	});

	describe("resolvePathBAbsentDays for Path B (Salaried Staff)", () => {
		it("charges 11 absent days when employee only worked 1 day of 12 scheduled days", () => {
			const days = [
				{
					status: "PRESENT",
					date: new Date("2026-08-26T00:00:00.000Z"),
					timeIn: new Date("2026-08-26T08:00:00.000Z"),
					timeOut: new Date("2026-08-26T17:00:00.000Z"),
					hoursWorked: "8:00",
				},
				...Array.from({ length: 11 }, (_, i) => ({
					status: "ABSENT",
					date: new Date(`2026-08-${27 + i}T00:00:00.000Z`),
					timeIn: null,
					timeOut: null,
					hoursWorked: "0:00",
				})),
			];
			const absentDays = resolvePathBAbsentDays({
				days,
				totalWorkDays: 12,
				effectiveWorkedDays: 1,
				todayKey: "2026-09-15",
			});
			expect(absentDays).to.equal(11);
		});
	});
});
