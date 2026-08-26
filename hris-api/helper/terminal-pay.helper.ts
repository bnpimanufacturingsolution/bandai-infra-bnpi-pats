/**
 * Terminal pay / last pay computation engine (spec gaps M8.1 + M1.1).
 *
 * Preview-only engine: it never writes. Every money component is derived
 * from existing HRIS truth and labeled with its source. Company-policy items
 * that need operator confirmation are flagged `NEEDS_CONFIRMATION` instead of
 * being silently assumed.
 *
 * Component sources:
 *  - Unpaid final payroll net   → latest non-paid EmployeePayroll row covering lastDay
 *  - Pro-rated 13th month       → basicSalary / 12 × months worked in the year (PH standard)
 *  - Leave monetization         → available balance of monetizable types × BNPI 313-basis daily rate
 *  - Outstanding loans          → EmployeeLoan.balance (PENDING/APPROVED/ACTIVE)
 */
import type { PrismaClient } from "../generated/prisma";

const round2 = (value: number) => Math.round(Number(value || 0) * 100) / 100;

export const MONETIZABLE_LEAVE_TYPES = ["VACATION_LEAVE", "PERSONAL"];
const BNPI_WORKING_DAYS_PER_YEAR = 313;

export interface TerminalPayLine {
	key: string;
	label: string;
	amount: number;
	source: string;
	needsConfirmation?: boolean;
}

export function computeThirteenthMonthProRata(
	basicSalary: number,
	hireDate: Date | null,
	lastDay: Date,
): { monthsThisYear: number; amount: number } {
	const yearStart = new Date(Date.UTC(lastDay.getUTCFullYear(), 0, 1));
	const effectiveStart =
		hireDate && hireDate > yearStart ? hireDate : yearStart;
	const months =
		(lastDay.getUTCFullYear() - effectiveStart.getUTCFullYear()) * 12 +
		(lastDay.getUTCMonth() - effectiveStart.getUTCMonth()) +
		(lastDay.getUTCDate() >= effectiveStart.getUTCDate() ? 1 : 0);
	const monthsThisYear = Math.min(Math.max(months, 0), 12);
	return {
		monthsThisYear,
		amount: round2((round2(basicSalary) / 12) * monthsThisYear),
	};
}

export function bnpiDailyRate(basicSalary: number): number {
	return round2((round2(basicSalary) * 12) / BNPI_WORKING_DAYS_PER_YEAR);
}

export async function computeTerminalPayPreview(
	prisma: PrismaClient,
	params: { organizationId: string; employeeId: string; lastDay?: string },
) {
	const lastDay = params.lastDay ? new Date(params.lastDay) : new Date();
	if (Number.isNaN(lastDay.getTime())) throw new Error("lastDay is not a valid date");

	const employee = await prisma.employee.findFirst({
		where: { id: params.employeeId, organizationId: params.organizationId, isDeleted: false },
		select: {
			id: true,
			employeeId: true,
			basicSalary: true,
			employmentHireDate: true,
			leaveBalances: true,
			person: { select: { personalInfo: true } },
		},
	});
	if (!employee) throw new Error("Employee not found");

	const personalInfo = (employee.person?.personalInfo as any) || {};
	const lines: TerminalPayLine[] = [];
	const notes: string[] = [];

	// 1) Final unpaid payroll net (if the separating cutoff was generated but not paid)
	const yearStart = new Date(Date.UTC(lastDay.getUTCFullYear(), 0, 1));
	const periods = await prisma.payrollPeriod.findMany({
		where: { organizationId: params.organizationId, isDeleted: false, startDate: { gte: yearStart } },
		select: { id: true, startDate: true, endDate: true, name: true },
		orderBy: { startDate: "desc" },
		take: 24,
	});
	let unpaidNet = 0;
	let unpaidLabel = "No unpaid final-period register found";
	for (const period of periods) {
		if (period.endDate > lastDay) continue;
		const register = await prisma.employeePayroll.findFirst({
			where: {
				organizationId: params.organizationId,
				isDeleted: false,
				payrollPeriodId: period.id,
				employeeId: employee.id,
			},
			select: { netPay: true, isPaid: true },
		});
		if (register && !register.isPaid) {
			unpaidNet = round2(register.netPay);
			unpaidLabel = `Unpaid net from ${period.name}`;
			break;
		}
	}
	lines.push({
		key: "unpaid_final_payroll",
		label: "Final payroll (unpaid net)",
		amount: unpaidNet,
		source: unpaidLabel,
	});

	// 2) Pro-rated 13th month
	const hireDate = employee.employmentHireDate ? new Date(employee.employmentHireDate) : null;
	const thirteenth = computeThirteenthMonthProRata(
		Number(employee.basicSalary || 0),
		hireDate,
		lastDay,
	);
	lines.push({
		key: "thirteenth_month_pro_rata",
		label: `13th month pro-rata (${thirteenth.monthsThisYear}/12 months)`,
		amount: thirteenth.amount,
		source: "basicSalary ÷ 12 × months this year",
	});

	// 3) Leave monetization on BNPI 313 basis
	const balances = Array.isArray(employee.leaveBalances)
		? (employee.leaveBalances as any[])
		: [];
	const dailyRate = bnpiDailyRate(Number(employee.basicSalary || 0));
	let monetizableDays = 0;
	for (const balance of balances) {
		if (!MONETIZABLE_LEAVE_TYPES.includes(String(balance.leaveType))) continue;
		monetizableDays += Number(balance.available || 0);
	}
	monetizableDays = round2(monetizableDays);
	const leaveCash = round2(monetizableDays * dailyRate);
	lines.push({
		key: "leave_monetization",
		label: `Leave conversion (${monetizableDays} day(s) × ${dailyRate})`,
		amount: leaveCash,
		source: `available ${MONETIZABLE_LEAVE_TYPES.join("/")} × BNPI 313-basis daily rate`,
	});

	const grossTerminal = round2(
		lines.reduce((sum, line) => sum + Math.max(0, line.amount), 0),
	);

	// 4) Outstanding loan deductions
	const loans = await prisma.employeeLoan.findMany({
		where: {
			organizationId: params.organizationId,
			employeeId: employee.id,
			isDeleted: false,
			status: { in: ["PENDING", "APPROVED", "ACTIVE"] },
		},
		select: { id: true, status: true, balance: true },
	});
	const loansTotal = round2(loans.reduce((sum, loan) => sum + Number(loan.balance || 0), 0));

	const netTerminal = round2(grossTerminal - loansTotal);

	lines.push({
		key: "outstanding_loans",
		label: `Less outstanding loans (${loans.length} active)`,
		amount: -loansTotal,
		source: "EmployeeLoan.balance (PENDING/APPROVED/ACTIVE)",
	});
	lines.push({
		key: "withholding_tax",
		label: "Withholding tax on terminal pay",
		amount: 0,
		source: "BIR 1604-C treatment",
		needsConfirmation: true,
	});

	notes.push(
		"NEEDS_CONFIRMATION: whether BNPI monetizes SIL/other leave types beyond " +
			MONETIZABLE_LEAVE_TYPES.join("/") +
			" in terminal pay.",
	);
	notes.push(
		"NEEDS_CONFIRMATION: final withholding tax computation basis for terminal pay (BIR 1604-C).",
	);

	return {
		employee: {
			id: employee.id,
			code: employee.employeeId,
			name: `${personalInfo.firstName || ""} ${personalInfo.lastName || ""}`.trim(),
			basicSalary: round2(employee.basicSalary),
		},
		lastDay: lastDay.toISOString().slice(0, 10),
		lines,
		grossTerminalPay: grossTerminal,
		totalDeductions: loansTotal,
		netTerminalPay: netTerminal,
		notes,
	};
}
