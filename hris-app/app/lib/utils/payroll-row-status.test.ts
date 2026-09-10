import { describe, expect, it } from "vitest";
import { resolvePayrollRowStatus } from "./payroll-row-status";

describe("resolvePayrollRowStatus", () => {
	it("marks paid rows Paid with no reason", () => {
		expect(
			resolvePayrollRowStatus({ isPaid: true, grossPay: 0, netPay: 0 }),
		).toEqual({ key: "paid", label: "Paid", reason: null });
	});

	it("marks rows with pay as Unpaid with no reason", () => {
		expect(
			resolvePayrollRowStatus({
				isPaid: false,
				basicPay: 0,
				grossPay: 6000,
				netPay: 5400,
				employee: { basicSalary: 12000 },
			}),
		).toEqual({ key: "unpaid", label: "Unpaid", reason: null });
	});

	it("treats basicPay alone as pay", () => {
		expect(
			resolvePayrollRowStatus({
				basicPay: 100,
				grossPay: 0,
				netPay: 0,
				employee: { basicSalary: 12000 },
			}).key,
		).toBe("unpaid");
	});

	it("explains missing basic salary first", () => {
		expect(
			resolvePayrollRowStatus({
				isPaid: false,
				basicPay: 0,
				grossPay: 0,
				netPay: 0,
				employee: { basicSalary: 0 },
				timesheetSnapshot: { totalDays: 10, daysPresent: 0, daysAbsent: 10 },
			}),
		).toEqual({
			key: "no-salary",
			label: "No salary",
			reason: "No basic salary on file",
		});
	});

	it("explains a missing timesheet", () => {
		expect(
			resolvePayrollRowStatus({
				basicPay: 0,
				grossPay: 0,
				netPay: 0,
				employee: { basicSalary: 15000 },
				timesheet: null,
				timesheetSnapshot: null,
			}).reason,
		).toBe("No timesheet for this period");
	});

	it("explains a day-less timesheet", () => {
		expect(
			resolvePayrollRowStatus({
				basicPay: 0,
				grossPay: 0,
				netPay: 0,
				employee: { basicSalary: 15000 },
				timesheetSnapshot: { totalDays: 0, daysPresent: 0, daysAbsent: 0 },
			}).reason,
		).toBe("Timesheet has no days");
	});

	it("explains full-period absence with the day count", () => {
		expect(
			resolvePayrollRowStatus({
				basicPay: 0,
				grossPay: 0,
				netPay: 0,
				employee: { basicSalary: 15000 },
				timesheetSnapshot: { totalDays: 12, daysPresent: 0, daysAbsent: 9 },
			}).reason,
		).toBe("Absent all 9 scheduled days");
	});

	it("uses singular day for one absence", () => {
		expect(
			resolvePayrollRowStatus({
				basicPay: 0,
				grossPay: 0,
				netPay: 0,
				employee: { basicSalary: 15000 },
				timesheetSnapshot: { totalDays: 12, daysPresent: 0, daysAbsent: 1 },
			}).reason,
		).toBe("Absent all 1 scheduled day");
	});

	it("falls back to the generic zero-pay reason", () => {
		expect(
			resolvePayrollRowStatus({
				basicPay: 0,
				grossPay: 0,
				netPay: 0,
				employee: { basicSalary: 15000 },
				timesheetSnapshot: { totalDays: 12, daysPresent: 5, daysAbsent: 0 },
			}).reason,
		).toBe("Computed pay is zero — open the record for the breakdown");
	});

	it("handles a null row without throwing", () => {
		expect(resolvePayrollRowStatus(null).key).toBe("no-salary");
	});
});
