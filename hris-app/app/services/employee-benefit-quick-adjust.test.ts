import { describe, expect, it } from "vitest";
import {
	isQuickAdjustPeriodLocked,
	validateQuickAdjustInput,
	validateQuickAdjustRows,
} from "./employee-benefit.service";

describe("quick payroll adjustment input validation", () => {
	it("accepts a valid single-employee addition", () => {
		expect(
			validateQuickAdjustInput({
				employeeIds: ["507f1f77bcf86cd799439011"],
				name: "Good performance",
				amount: 1000,
				payrollPeriodId: "507f1f77bcf86cd799439012",
			}),
		).toBeNull();
	});

	it("requires at least one employee", () => {
		expect(
			validateQuickAdjustInput({
				employeeIds: [],
				name: "Good performance",
				amount: 1000,
				payrollPeriodId: "507f1f77bcf86cd799439012",
			}),
		).toMatch(/employee/i);
	});

	it("requires a named label like Good performance or Equipment destroy", () => {
		expect(
			validateQuickAdjustInput({
				employeeIds: ["507f1f77bcf86cd799439011"],
				name: "   ",
				amount: 1000,
				payrollPeriodId: "507f1f77bcf86cd799439012",
			}),
		).toMatch(/name/i);
	});

	it("rejects zero, negative, and non-numeric amounts", () => {
		for (const amount of [0, -500, NaN, "1000" as unknown as number]) {
			expect(
				validateQuickAdjustInput({
					employeeIds: ["507f1f77bcf86cd799439011"],
					name: "Equipment destroy",
					amount,
					payrollPeriodId: "507f1f77bcf86cd799439012",
				}),
			).toMatch(/amount/i);
		}
	});

	it("requires an open payroll period choice", () => {
		expect(
			validateQuickAdjustInput({
				employeeIds: ["507f1f77bcf86cd799439011"],
				name: "Good performance",
				amount: 1000,
				payrollPeriodId: "",
			}),
		).toMatch(/period/i);
	});
});

describe("multi-row quick payroll adjustment validation", () => {
	const periodId = "507f1f77bcf86cd799439012";
	const employeeIds = ["507f1f77bcf86cd799439011"];

	it("accepts several named rows with positive amounts", () => {
		expect(
			validateQuickAdjustRows({
				employeeIds,
				payrollPeriodId: periodId,
				rows: [
					{ name: "Good performance", amount: 1000 },
					{ name: "Overtime bonus", amount: 500 },
				],
			}),
		).toBeNull();
	});

	it("points at the first row missing a name", () => {
		expect(
			validateQuickAdjustRows({
				employeeIds,
				payrollPeriodId: periodId,
				rows: [
					{ name: "Good performance", amount: 1000 },
					{ name: "   ", amount: 500 },
				],
			}),
		).toEqual({ rowIndex: 1, message: expect.stringMatching(/row 2/i) });
	});

	it("points at the row with a zero or non-numeric amount", () => {
		for (const amount of [0, -250, NaN, "1000" as unknown as number]) {
			expect(
				validateQuickAdjustRows({
					employeeIds,
					payrollPeriodId: periodId,
					rows: [{ name: "Equipment destroy", amount }],
				}),
			).toEqual({ rowIndex: 0, message: expect.stringMatching(/row 1/i) });
		}
	});

	it("rejects an empty row list at modal level", () => {
		expect(
			validateQuickAdjustRows({ employeeIds, payrollPeriodId: periodId, rows: [] }),
		).toEqual({ rowIndex: -1, message: expect.stringMatching(/at least one adjustment/i) });
	});

	it("rejects missing employees and period at modal level", () => {
		expect(
			validateQuickAdjustRows({
				employeeIds: [],
				payrollPeriodId: periodId,
				rows: [{ name: "Good performance", amount: 1000 }],
			}),
		).toEqual({ rowIndex: -1, message: expect.stringMatching(/employee/i) });
		expect(
			validateQuickAdjustRows({
				employeeIds,
				payrollPeriodId: "",
				rows: [{ name: "Good performance", amount: 1000 }],
			}),
		).toEqual({ rowIndex: -1, message: expect.stringMatching(/period/i) });
	});
});

describe("quick adjustment period lock", () => {
	it("stays editable with no entry period (header bulk flow)", () => {
		expect(
			isQuickAdjustPeriodLocked({
				defaultPayrollPeriodId: undefined,
				hasLabel: false,
				hasListMatch: false,
				periodsFetched: true,
			}),
		).toBe(false);
	});

	it("locks when the caller names the entry period", () => {
		expect(
			isQuickAdjustPeriodLocked({
				defaultPayrollPeriodId: "507f1f77bcf86cd799439012",
				hasLabel: true,
				hasListMatch: false,
				periodsFetched: true,
			}),
		).toBe(true);
	});

	it("locks on a periods-list match without a caller label", () => {
		expect(
			isQuickAdjustPeriodLocked({
				defaultPayrollPeriodId: "507f1f77bcf86cd799439012",
				hasLabel: false,
				hasListMatch: true,
				periodsFetched: true,
			}),
		).toBe(true);
	});

	it("stays locked while the list is still loading", () => {
		expect(
			isQuickAdjustPeriodLocked({
				defaultPayrollPeriodId: "507f1f77bcf86cd799439012",
				hasLabel: false,
				hasListMatch: false,
				periodsFetched: false,
			}),
		).toBe(true);
	});

	it("falls back to the dropdown for an unresolvable entry period", () => {
		expect(
			isQuickAdjustPeriodLocked({
				defaultPayrollPeriodId: "507f1f77bcf86cd799439012",
				hasLabel: false,
				hasListMatch: false,
				periodsFetched: true,
			}),
		).toBe(false);
	});
});
