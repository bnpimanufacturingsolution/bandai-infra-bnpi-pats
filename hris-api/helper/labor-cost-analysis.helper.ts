/**
 * Labor Cost Analysis Helper (spec gap M1.4)
 * Aggregates payroll register money per department with Direct/Agency split.
 * Money source: EmployeePayroll register rows within PayrollPeriod(s).
 */

import { PrismaClient } from "../generated/prisma";

export interface LaborCostRow {
	departmentId: string;
	department: string;
	headcount: number;
	directHeadcount: number;
	agencyHeadcount: number;
	basicPay: number;
	overtimePay: number;
	allowances: number;
	grossPay: number;
	totalDeductions: number;
	netPay: number;
	directGrossPay: number;
	agencyGrossPay: number;
}

export interface LaborCostSplit {
	headcount: number;
	grossPay: number;
}

export interface LaborCostAnalysisResponse {
	periodCount: number;
	headcount: number;
	basicPay: number;
	overtimePay: number;
	allowances: number;
	grossPay: number;
	totalDeductions: number;
	netPay: number;
	split: {
		direct: LaborCostSplit;
		agency: LaborCostSplit;
	};
	rows: LaborCostRow[];
}

const round2 = (value: number) => Math.round(value * 100) / 100;

const normalizeWorkforceSource = (value: unknown): "DIRECT" | "AGENCY" =>
	String(value || "").trim().toUpperCase() === "AGENCY" ? "AGENCY" : "DIRECT";

export async function calculateLaborCostAnalysis(
	prisma: PrismaClient,
	organizationId: string,
	startDate: Date,
	endDate: Date,
	departmentId?: string,
	payrollPeriodId?: string,
	workforceSource?: string,
): Promise<LaborCostAnalysisResponse> {
	const periodWhere: any = { organizationId, isDeleted: false };
	if (payrollPeriodId) {
		periodWhere.id = payrollPeriodId;
	} else {
		periodWhere.payDate = { gte: startDate, lte: endDate };
	}

	const employeeWhere: any = {};
	if (departmentId) {
		employeeWhere.departmentId = departmentId;
	}

	const periods = await prisma.payrollPeriod.findMany({
		where: periodWhere,
		select: {
			id: true,
			code: true,
			employeePayrolls: {
				where: { isDeleted: false, employee: employeeWhere },
				select: {
					basicPay: true,
					overtimePay: true,
					allowances: true,
					grossPay: true,
					totalDeductions: true,
					netPay: true,
					employee: {
						select: {
							id: true,
							workforceSource: true,
							department: { select: { id: true, name: true } },
						},
					},
				},
			},
		},
	});

	type Acc = Omit<LaborCostRow, "department" | "directHeadcount" | "agencyHeadcount" | "directGrossPay" | "agencyGrossPay"> & {
		directHeadcount: number;
		agencyHeadcount: number;
		directGrossPay: number;
		agencyGrossPay: number;
	};
	const byDepartment = new Map<string, Acc>();
	const seenEmployees = new Set<string>();
	const splitAcc = {
		direct: { headcount: 0, grossPay: 0 },
		agency: { headcount: 0, grossPay: 0 },
	};
	const totals = {
		basicPay: 0,
		overtimePay: 0,
		allowances: 0,
		grossPay: 0,
		totalDeductions: 0,
		netPay: 0,
	};

	const emptyAcc = (departmentIdKey: string): Acc => ({
		departmentId: departmentIdKey,
		headcount: 0,
		directHeadcount: 0,
		agencyHeadcount: 0,
		basicPay: 0,
		overtimePay: 0,
		allowances: 0,
		grossPay: 0,
		totalDeductions: 0,
		netPay: 0,
		directGrossPay: 0,
		agencyGrossPay: 0,
	});

	for (const period of periods) {
		for (const payroll of period.employeePayrolls) {
			const emp = payroll.employee;
			const source = normalizeWorkforceSource(emp.workforceSource);
			const deptKey = emp.department?.id || "no-department";
			if (!byDepartment.has(deptKey)) {
				byDepartment.set(deptKey, emptyAcc(deptKey));
			}
			const acc = byDepartment.get(deptKey)!;

			// Headcount = unique employees with a register row across the range
			const empKey = emp.id;
			if (!seenEmployees.has(`${deptKey}:${empKey}`)) {
				seenEmployees.add(`${deptKey}:${empKey}`);
				acc.headcount += 1;
			}
			if (!seenEmployees.has(`split:${empKey}`)) {
				seenEmployees.add(`split:${empKey}`);
				splitAcc[source === "AGENCY" ? "agency" : "direct"].headcount += 1;
			}

			acc.basicPay += payroll.basicPay;
			acc.overtimePay += payroll.overtimePay;
			acc.allowances += payroll.allowances;
			acc.grossPay += payroll.grossPay;
			acc.totalDeductions += payroll.totalDeductions;
			acc.netPay += payroll.netPay;

			totals.basicPay += payroll.basicPay;
			totals.overtimePay += payroll.overtimePay;
			totals.allowances += payroll.allowances;
			totals.grossPay += payroll.grossPay;
			totals.totalDeductions += payroll.totalDeductions;
			totals.netPay += payroll.netPay;

			splitAcc[source === "AGENCY" ? "agency" : "direct"].grossPay += payroll.grossPay;
			if (source === "DIRECT") {
				acc.directHeadcount += 1;
				acc.directGrossPay += payroll.grossPay;
			} else {
				acc.agencyHeadcount += 1;
				acc.agencyGrossPay += payroll.grossPay;
			}
		}
	}

	// Department names come from the payroll rows' employee.department snapshot
	const deptNameByKey = new Map<string, string>();
	for (const period of periods) {
		for (const payroll of period.employeePayrolls) {
			const dept = payroll.employee.department;
			if (dept?.id && !deptNameByKey.has(dept.id)) {
				deptNameByKey.set(dept.id, dept.name);
			}
		}
	}

	const rows: LaborCostRow[] = Array.from(byDepartment.values())
		.map((acc) => ({
			departmentId: acc.departmentId,
			department: deptNameByKey.get(acc.departmentId) || "No Department",
			headcount: acc.headcount,
			directHeadcount: acc.directHeadcount,
			agencyHeadcount: acc.agencyHeadcount,
			basicPay: round2(acc.basicPay),
			overtimePay: round2(acc.overtimePay),
			allowances: round2(acc.allowances),
			grossPay: round2(acc.grossPay),
			totalDeductions: round2(acc.totalDeductions),
			netPay: round2(acc.netPay),
			directGrossPay: round2(acc.directGrossPay),
			agencyGrossPay: round2(acc.agencyGrossPay),
		}))
		.sort((a, b) => b.grossPay - a.grossPay);

	return {
		periodCount: periods.length,
		headcount: splitAcc.direct.headcount + splitAcc.agency.headcount,
		basicPay: round2(totals.basicPay),
		overtimePay: round2(totals.overtimePay),
		allowances: round2(totals.allowances),
		grossPay: round2(totals.grossPay),
		totalDeductions: round2(totals.totalDeductions),
		netPay: round2(totals.netPay),
		split: {
			direct: {
				headcount: splitAcc.direct.headcount,
				grossPay: round2(splitAcc.direct.grossPay),
			},
			agency: {
				headcount: splitAcc.agency.headcount,
				grossPay: round2(splitAcc.agency.grossPay),
			},
		},
		rows,
	};
}
