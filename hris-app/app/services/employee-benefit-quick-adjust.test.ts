import { describe, expect, it } from "vitest";
import { validateQuickAdjustInput } from "./employee-benefit.service";

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
