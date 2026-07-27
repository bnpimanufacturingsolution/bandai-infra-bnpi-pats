export type PayrollBenefitDirection = "COMPENSATION" | "DEDUCTION";

export type PayrollBenefitInstallmentInput = {
	id: string;
	amount: number;
	scheduledDate: Date | string;
	status: "SCHEDULED" | "DEDUCTED" | "FAILED" | "WAIVED";
	payrollCutOffId?: string | null;
};

export type PayrollBenefitSourceInput = {
	id: string;
	organizationId: string;
	employeeId: string;
	/** Enrollment / payroll adjustment display name (EmployeeBenefit.name). */
	name?: string | null;
	benefitType?: {
		code?: string | null;
		name?: string | null;
		payrollDirection?: PayrollBenefitDirection | null;
		reconciliationAction?: string | null;
		isTaxable?: boolean | null;
		isDeleted?: boolean | null;
	} | null;
	amount?: number | null;
	totalAmount?: number | null;
	startDate?: Date | string | null;
	endDate?: Date | string | null;
	payrollPeriodId?: string | null;
	payrollPeriodCode?: string | null;
	status?: string | null;
	isActive?: boolean | null;
	isDeleted?: boolean | null;
	installments?: PayrollBenefitInstallmentInput[] | null;
};

export type PayrollBenefitSourcePeriod = {
	id: string;
	startDate: Date;
	endDate: Date;
};

export type PayrollBenefitSource = {
	id: string;
	employeeId: string;
	code: string | null;
	/** Primary display label: enrollment name, else benefit type name. */
	name: string;
	/** Benefit type name used as category and register name matching. */
	benefitTypeName: string | null;
	direction: PayrollBenefitDirection;
	reconciliationAction: string | null;
	isTaxable: boolean;
	amount: number;
	installmentIds: string[];
	startDate: Date | null;
	endDate: Date | null;
	payrollPeriodId: string | null;
	payrollPeriodCode: string | null;
};

const ACTIVE_STATUSES = new Set(["ACTIVE", "APPROVED"]);

const finitePositive = (value: unknown): number | null => {
	const numeric = Number(value);
	return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
};

const asDate = (value: Date | string | null | undefined): Date | null => {
	if (!value) return null;
	const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
};

export function resolvePayrollBenefitSource(
	benefit: PayrollBenefitSourceInput,
	period: PayrollBenefitSourcePeriod,
): PayrollBenefitSource | null {
	if (
		!benefit.employeeId ||
		benefit.isDeleted === true ||
		benefit.isActive !== true ||
		!ACTIVE_STATUSES.has(String(benefit.status || "").toUpperCase())
	) {
		return null;
	}

	const direction = benefit.benefitType?.payrollDirection;
	if (direction !== "COMPENSATION" && direction !== "DEDUCTION") return null;
	if (benefit.benefitType?.isDeleted === true) return null;
	if (benefit.payrollPeriodId && benefit.payrollPeriodId !== period.id) return null;

	const startDate = asDate(benefit.startDate);
	const endDate = asDate(benefit.endDate);
	if (!startDate || startDate > period.endDate || (endDate && endDate < period.startDate)) {
		return null;
	}

	const installments = Array.isArray(benefit.installments) ? benefit.installments : [];
	let amount: number | null = null;
	let installmentIds: string[] = [];

	if (installments.length > 0) {
		const dueInstallments = installments.filter((installment) => {
			const scheduledDate = asDate(installment.scheduledDate);
			return (
				((installment.status === "SCHEDULED" &&
					(!installment.payrollCutOffId || installment.payrollCutOffId === period.id)) ||
					(installment.status === "DEDUCTED" && installment.payrollCutOffId === period.id)) &&
				scheduledDate !== null &&
				scheduledDate >= period.startDate &&
				scheduledDate <= period.endDate &&
				finitePositive(installment.amount) !== null
			);
		});

		if (dueInstallments.length === 0) return null;
		amount = dueInstallments.reduce((sum, installment) => sum + Number(installment.amount), 0);
		installmentIds = dueInstallments.map((installment) => installment.id);
	} else {
		amount = finitePositive(benefit.amount);
		if (amount === null) return null;
	}

	const benefitTypeName = benefit.benefitType?.name ? String(benefit.benefitType.name).trim() : "";
	const enrollmentName = benefit.name ? String(benefit.name).trim() : "";
	const displayName = enrollmentName || benefitTypeName || "Employee benefit";

	return {
		id: benefit.id,
		employeeId: benefit.employeeId,
		code: benefit.benefitType?.code || null,
		name: displayName,
		benefitTypeName: benefitTypeName || null,
		direction,
		reconciliationAction: benefit.benefitType?.reconciliationAction || null,
		isTaxable: benefit.benefitType?.isTaxable === true,
		amount: Math.round((amount + Number.EPSILON) * 100) / 100,
		installmentIds,
		startDate,
		endDate,
		payrollPeriodId: benefit.payrollPeriodId || null,
		payrollPeriodCode: benefit.payrollPeriodCode || null,
	};
}

export function resolvePayrollBenefitSources(
	benefits: PayrollBenefitSourceInput[],
	period: PayrollBenefitSourcePeriod,
): PayrollBenefitSource[] {
	return benefits
		.map((benefit) => resolvePayrollBenefitSource(benefit, period))
		.filter((source): source is PayrollBenefitSource => source !== null);
}
