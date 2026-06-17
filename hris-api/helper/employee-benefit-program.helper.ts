type AnyRecord = Record<string, any>;

const DEFAULT_INSTALLMENTS = 6;
const DEFAULT_PAYROLL_CYCLE_DAYS = 15;

export const BENEFIT_PROGRAM_ACTIVE_STATUSES = new Set(["APPROVED", "ACTIVE"]);

const roundMoney = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

const toNumber = (value: unknown, fallback = 0): number => {
	const numeric = Number(value);
	return Number.isFinite(numeric) ? numeric : fallback;
};

const addDays = (date: Date, days: number): Date => {
	const d = new Date(date);
	d.setDate(d.getDate() + days);
	return d;
};

export const normalizeEmployeeBenefitPayload = (payload: AnyRecord): AnyRecord => {
	const totalAmount = roundMoney(toNumber(payload.totalAmount ?? payload.amount, 0));
	const totalInstallments = Math.max(
		1,
		Math.floor(toNumber(payload.totalInstallments, DEFAULT_INSTALLMENTS)),
	);
	const installmentAmount = roundMoney(
		payload.installmentAmount !== undefined
			? toNumber(payload.installmentAmount, 0)
			: totalAmount / totalInstallments,
	);
	const remainingBalance = roundMoney(
		payload.remainingBalance !== undefined
			? toNumber(payload.remainingBalance, 0)
			: totalAmount,
	);
	const startPayrollCutOff = payload.startPayrollCutOff ?? payload.startDate;
	const endPayrollCutOff = payload.endPayrollCutOff ?? payload.endDate;
	const status =
		payload.status ??
		(payload.isActive === false ? "CANCELLED" : totalAmount > 0 ? "PENDING" : "COMPLETED");

	return {
		organizationId: payload.organizationId,
		employeeId: payload.employeeId,
		benefitTypeId: payload.benefitTypeId,
		payrollPeriodId: payload.payrollPeriodId ?? undefined,
		name: payload.name ?? null,
		description: payload.description ?? null,
		totalAmount,
		currency: payload.currency ?? "USD",
		totalInstallments,
		installmentAmount,
		remainingBalance,
		amount: payload.amount !== undefined ? toNumber(payload.amount, totalAmount) : totalAmount,
		startDate: payload.startDate ?? startPayrollCutOff ?? undefined,
		endDate: payload.endDate ?? endPayrollCutOff ?? undefined,
		startPayrollCutOff: startPayrollCutOff ?? undefined,
		endPayrollCutOff: endPayrollCutOff ?? undefined,
		agreedToTerms: payload.agreedToTerms ?? false,
		agreedAt: payload.agreedAt ?? undefined,
		agreedByIp: payload.agreedByIp ?? undefined,
		status,
		isActive: payload.isActive ?? true,
		approvedById: payload.approvedById ?? payload.approvedBy ?? undefined,
		approvedAt: payload.approvedAt ?? undefined,
		notes: payload.notes ?? undefined,
		remarks: payload.remarks ?? payload.notes ?? undefined,
		isDeleted: payload.isDeleted ?? false,
	};
};

export const buildBenefitInstallments = (
	benefitId: string,
	benefit: AnyRecord,
): Array<{
	employeeBenefitId: string;
	installmentNumber: number;
	amount: number;
	scheduledDate: Date;
	status: "SCHEDULED";
}> => {
	if (!benefit.startPayrollCutOff || !benefit.totalInstallments || benefit.totalInstallments < 1) {
		return [];
	}

	const start = new Date(benefit.startPayrollCutOff);
	if (Number.isNaN(start.getTime())) {
		return [];
	}

	const totalInstallments = Math.max(1, Math.floor(toNumber(benefit.totalInstallments, 1)));
	const totalAmount = roundMoney(toNumber(benefit.totalAmount, 0));
	const baseInstallment = roundMoney(toNumber(benefit.installmentAmount, 0));

	let allocated = 0;
	const rows: Array<{
		employeeBenefitId: string;
		installmentNumber: number;
		amount: number;
		scheduledDate: Date;
		status: "SCHEDULED";
	}> = [];

	for (let i = 1; i <= totalInstallments; i += 1) {
		const amount =
			i === totalInstallments ? roundMoney(totalAmount - allocated) : roundMoney(baseInstallment);
		allocated = roundMoney(allocated + amount);
		rows.push({
			employeeBenefitId: benefitId,
			installmentNumber: i,
			amount: amount < 0 ? 0 : amount,
			scheduledDate: addDays(start, (i - 1) * DEFAULT_PAYROLL_CYCLE_DAYS),
			status: "SCHEDULED",
		});
	}

	return rows;
};
