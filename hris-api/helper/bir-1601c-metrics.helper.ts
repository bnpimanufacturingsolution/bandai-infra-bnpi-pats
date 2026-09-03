import { PrismaClient } from "../generated/prisma";
import { TAX_CONFIG } from "../config/payroll.config";

export interface Bir1601CEmployeeBreakdown {
	employeeId: string;
	employeeCode: string;
	employeeName: string;
	department: string;
	isMwe: boolean;
	basicNet: number;
	overtimeHolidayHazard: number;
	deMinimis: number;
	contributions: number;
	withholdingTax: number;
	totalCompensation: number;
}

export interface Bir1601CMetricsResult {
	period: {
		month: number;
		year: number;
		dateFrom: string;
		dateTo: string;
		payDateBasis: true;
		mweMonthlyThreshold: number;
		totalPayrollPeriods: number;
		totalPayrollRows: number;
	};
	fields: {
		"14": number;
		"15": number;
		"16": number;
		"18": number;
		"19": number;
		"21": number;
		"22": number;
		"25": number;
	};
	breakdown: {
		employees: Bir1601CEmployeeBreakdown[];
		totals: {
			mweEmployees: number;
			nonMweEmployees: number;
			allowancesMappedAsDeMinimis: number;
		};
	};
}

function roundToCentavo(value: number): number {
	return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function getEmployeeName(employee: any): string {
	const firstName = employee?.person?.personalInfo?.firstName || "";
	const middleName = employee?.person?.personalInfo?.middleName || "";
	const lastName = employee?.person?.personalInfo?.lastName || "";
	const fullName = [firstName, middleName, lastName].filter(Boolean).join(" ").trim();
	return fullName || employee?.employeeId || employee?.id || "Unknown";
}

export async function calculateBir1601CMetrics(
	prisma: PrismaClient,
	params: {
		organizationId: string;
		month: number;
		year: number;
		departmentId?: string;
		reportToId?: string;
		employeeId?: string;
	},
): Promise<Bir1601CMetricsResult> {
	const { organizationId, month, year, departmentId, reportToId, employeeId } = params;

	if (!month || month < 1 || month > 12) {
		throw new Error("month must be between 1 and 12");
	}

	if (!year || year < 2000 || year > 3000) {
		throw new Error("year must be a valid year");
	}

	const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
	const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

	const employeeWhere: any = {
		isDeleted: false,
		...(departmentId ? { departmentId } : {}),
		...(reportToId ? { reportToId } : {}),
		...(employeeId ? { id: employeeId } : {}),
	};

	const payrollRows = await prisma.employeePayroll.findMany({
		where: {
			organizationId,
			isDeleted: false,
			payrollPeriod: {
				organizationId,
				isDeleted: false,
				payDate: {
					gte: startDate,
					lte: endDate,
				},
			},
			employee: employeeWhere,
		},
		select: {
			id: true,
			basicPay: true,
			overtimePay: true,
			nightDiffPay: true,
			holidayPay: true,
			allowances: true,
			bonuses: true,
			grossPay: true,
			taxAmount: true,
			sssContribution: true,
			philHealthContribution: true,
			pagibigContribution: true,
			absentDeduction: true,
			lateDeduction: true,
			earlyOutDeduction: true,
			employee: {
				select: {
					id: true,
					employeeId: true,
					basicSalary: true,
					department: {
						select: {
							name: true,
						},
					},
					person: {
						select: {
							personalInfo: true,
						},
					},
				},
			},
			payrollPeriod: {
				select: {
					id: true,
				},
			},
		},
	});

	const uniquePeriodIds = new Set(payrollRows.map((row) => row.payrollPeriod?.id).filter(Boolean));
	const mweMonthlyThreshold = TAX_CONFIG.minimumWageThreshold;

	const employees: Bir1601CEmployeeBreakdown[] = payrollRows.map((row) => {
		const allowances = Number(row.allowances || 0);
		const bonuses = Number(row.bonuses || 0);
		const grossPay = Number(row.grossPay || 0);
		const contributions = roundToCentavo(
			Number(row.sssContribution || 0) +
				Number(row.philHealthContribution || 0) +
				Number(row.pagibigContribution || 0),
		);
		const overtimeHolidayHazard = roundToCentavo(
			Number(row.overtimePay || 0) + Number(row.holidayPay || 0) + Number(row.nightDiffPay || 0),
		);
		const basicNet = roundToCentavo(
			Number(row.basicPay || 0) -
				Number(row.absentDeduction || 0) -
				Number(row.lateDeduction || 0) -
				Number(row.earlyOutDeduction || 0),
		);
		const totalCompensation = roundToCentavo(grossPay + allowances + bonuses);
		const isMwe = Number(row.employee?.basicSalary || 0) <= mweMonthlyThreshold;

		return {
			employeeId: row.employee.id,
			employeeCode: row.employee.employeeId || "-",
			employeeName: getEmployeeName(row.employee),
			department: row.employee?.department?.name || "N/A",
			isMwe,
			basicNet: Math.max(0, basicNet),
			overtimeHolidayHazard,
			deMinimis: allowances,
			contributions,
			withholdingTax: Number(row.taxAmount || 0),
			totalCompensation,
		};
	});

	const field14 = roundToCentavo(
		employees.reduce((sum, item) => sum + Number(item.totalCompensation || 0), 0),
	);
	const field15 = roundToCentavo(
		employees
			.filter((item) => item.isMwe)
			.reduce((sum, item) => sum + Number(item.basicNet || 0), 0),
	);
	const field16 = roundToCentavo(
		employees
			.filter((item) => item.isMwe)
			.reduce((sum, item) => sum + Number(item.overtimeHolidayHazard || 0), 0),
	);
	const field18 = roundToCentavo(
		employees.reduce((sum, item) => sum + Number(item.deMinimis || 0), 0),
	);
	const field19 = roundToCentavo(
		employees.reduce((sum, item) => sum + Number(item.contributions || 0), 0),
	);
	const field21 = roundToCentavo(field15 + field16 + field18 + field19);
	const field22 = roundToCentavo(Math.max(0, field14 - field21));
	const field25 = roundToCentavo(
		employees.reduce((sum, item) => sum + Number(item.withholdingTax || 0), 0),
	);

	const mweEmployees = employees.filter((item) => item.isMwe).length;

	return {
		period: {
			month,
			year,
			dateFrom: startDate.toISOString().split("T")[0],
			dateTo: endDate.toISOString().split("T")[0],
			payDateBasis: true,
			mweMonthlyThreshold,
			totalPayrollPeriods: uniquePeriodIds.size,
			totalPayrollRows: payrollRows.length,
		},
		fields: {
			"14": field14,
			"15": field15,
			"16": field16,
			"18": field18,
			"19": field19,
			"21": field21,
			"22": field22,
			"25": field25,
		},
		breakdown: {
			employees,
			totals: {
				mweEmployees,
				nonMweEmployees: Math.max(0, employees.length - mweEmployees),
				allowancesMappedAsDeMinimis: field18,
			},
		},
	};
}

