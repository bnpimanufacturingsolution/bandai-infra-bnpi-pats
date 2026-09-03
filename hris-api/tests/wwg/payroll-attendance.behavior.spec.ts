import { expect } from "chai";
import {
	calculatePayrollWithAttendance,
	calculatePayrollFromAttendance,
} from "../../helper/payroll-with-attendance.helper";
import { calculatePayrollBreakdown } from "../../helper/payroll-calculator.helper";

describe("calculatePayrollWithAttendance", () => {
	it("returns structured payroll result", () => {
		const out = calculatePayrollWithAttendance(22000, 22, 22);
		expect(out).to.have.property("netPay");
		expect(out).to.have.property("attendance");
	});

	it("applies absence deduction when present days are fewer", () => {
		const perfect = calculatePayrollWithAttendance(22000, 22, 22);
		const withAbsence = calculatePayrollWithAttendance(22000, 20, 22);
		expect(withAbsence.netPay).to.be.lessThan(perfect.netPay);
	});

	it("computes attendance totals correctly", () => {
		const out = calculatePayrollWithAttendance(22000, 20, 22);
		expect(out.attendance.absentDays).to.equal(2);
	});

	it("keeps adjusted gross less or equal to base salary", () => {
		const out = calculatePayrollWithAttendance(22000, 20, 22);
		expect(out.adjustedGrossIncome).to.be.at.most(22000);
	});

	it("handles full absences", () => {
		const out = calculatePayrollWithAttendance(22000, 0, 22);
		expect(out.attendance.presentDays).to.equal(0);
	});
});

describe("calculatePayrollFromAttendance", () => {
	it("derives present days from records", () => {
		const out = calculatePayrollFromAttendance(22000, ["PRESENT", "ABSENT", "PRESENT"]);
		expect(out.attendance.presentDays).to.equal(2);
	});

	it("derives absent days from records", () => {
		const out = calculatePayrollFromAttendance(22000, ["PRESENT", "ABSENT", "PRESENT"]);
		expect(out.attendance.absentDays).to.equal(1);
	});

	it("sets total working days from input length", () => {
		const out = calculatePayrollFromAttendance(22000, ["PRESENT", "ABSENT", "PRESENT"]);
		expect(out.attendance.totalWorkingDays).to.equal(3);
	});

	it("returns payroll fields including deductions", () => {
		const out = calculatePayrollFromAttendance(22000, ["PRESENT", "PRESENT"]);
		expect(out).to.have.property("deductions");
	});

	it("reduces net pay with more absences", () => {
		const lowAbsence = calculatePayrollFromAttendance(22000, ["PRESENT", "PRESENT", "PRESENT"]);
		const highAbsence = calculatePayrollFromAttendance(22000, ["ABSENT", "ABSENT", "PRESENT"]);
		expect(highAbsence.netPay).to.be.lessThan(lowAbsence.netPay);
	});
});

describe("calculatePayrollBreakdown", () => {
	it("returns null when payroll record is not found", async () => {
		const prisma = {
			employeePayroll: {
				findFirst: async () => null,
			},
		} as any;
		const out = await calculatePayrollBreakdown(prisma, "missing");
		expect(out).to.equal(null);
	});

	it("throws when payroll period is missing", async () => {
		const prisma = {
			employeePayroll: {
				findFirst: async () => ({
					employee: { basicSalary: 1000, payFrequency: "MONTHLY" },
					payrollPeriod: null,
				}),
			},
		} as any;
		let thrown: unknown;
		try {
			await calculatePayrollBreakdown(prisma, "x");
		} catch (error) {
			thrown = error;
		}
		expect(String(thrown)).to.contain("Payroll period not found");
	});

	it("accepts prisma-like dependency object", async () => {
		const prisma = {
			employeePayroll: {
				findFirst: async () => null,
			},
		} as any;
		const out = await calculatePayrollBreakdown(prisma, "x");
		expect(out).to.equal(null);
	});

	it("is async and resolves promise", async () => {
		const prisma = {
			employeePayroll: {
				findFirst: async () => null,
			},
		} as any;
		const promise = calculatePayrollBreakdown(prisma, "x");
		expect(promise).to.have.property("then");
		await promise;
	});

	it("supports string payroll id input", async () => {
		const prisma = {
			employeePayroll: {
				findFirst: async () => null,
			},
		} as any;
		const out = await calculatePayrollBreakdown(prisma, "payroll-id-1");
		expect(out).to.equal(null);
	});
});
