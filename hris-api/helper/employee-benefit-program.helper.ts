import {
	isRecurringPeriodEligible,
	normalizeRecurrenceFrequency,
	type BenefitRecurrenceFrequency,
} from "./benefit-recurrence.helper";

type AnyRecord = Record<string, any>;

const DEFAULT_INSTALLMENTS = 6;
const DEFAULT_PAYROLL_CYCLE_DAYS = 15;

export const BENEFIT_PROGRAM_ACTIVE_STATUSES = new Set(["APPROVED", "ACTIVE"]);

export type BenefitSchedulePeriod = {
	id: string;
	startDate: Date;
	endDate: Date;
	periodNumber?: number | null;
	payFrequency?: string | null;
	/** True when this is the only non-deleted org period in the period end's calendar month. */
	isOnlyPeriodInMonth?: boolean;
	/** Org fiscal year start month 1–12 (from cycleRules.ANNUALLY.startMonth). */
	fiscalYearStartMonth?: number | null;
};

export type RecurringInstallmentEnsureInput = {
	id: string;
	scheduleMode?: string | null;
	recurrenceFrequency?: string | null;
	status?: string | null;
	isActive?: boolean | null;
	isDeleted?: boolean | null;
	startDate?: Date | string | null;
	endDate?: Date | string | null;
	startPayrollCutOff?: Date | string | null;
	endPayrollCutOff?: Date | string | null;
	payrollPeriodId?: string | null;
	amount?: number | null;
	totalAmount?: number | null;
	installmentAmount?: number | null;
	attendanceBased?: boolean | null;
	attendanceAmountBasis?: string | null;
	eligibilityMode?: string | null;
	eligibilityDisqualifyOnAbsent?: boolean | null;
	eligibilityDisqualifyOnLate?: boolean | null;
	eligibilityDisqualifyOnUndertime?: boolean | null;
	eligibilityDisqualifyOnLeave?: boolean | null;
	/** When set, overrides enrolled installment amount for create (attendance-computed). */
	computedPeriodAmount?: number | null;
	installments?: Array<{
		id: string;
		installmentNumber?: number | null;
		amount: number;
		scheduledDate: Date | string;
		status: string;
		payrollCutOffId?: string | null;
	}> | null;
};

export type RecurringInstallmentEnsureResult =
	| { action: "skipped"; reason: string }
	| {
			action: "existing";
			installment: {
				id: string;
				amount: number;
				scheduledDate: Date;
				status: string;
				payrollCutOffId?: string | null;
			};
			/** When true, ensure should persist installment.amount (mass-upload amount correction). */
			shouldUpdateAmount?: boolean;
	  }
	| {
			action: "create";
			row: {
				employeeBenefitId: string;
				installmentNumber: number;
				amount: number;
				scheduledDate: Date;
				status: "SCHEDULED";
			};
	  };

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

const asDate = (value: Date | string | null | undefined): Date | null => {
	if (!value) return null;
	const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
};

const isExplicitScheduleMode = (scheduleMode: unknown): boolean =>
	scheduleMode === "FIXED_INSTALLMENTS" ||
	scheduleMode === "TIME_BOUND" ||
	scheduleMode === "RECURRING";

export const normalizeEmployeeBenefitPayload = (payload: AnyRecord): AnyRecord => {
	const totalAmount = roundMoney(toNumber(payload.totalAmount ?? payload.amount, 0));
	const isExplicitSchedule = isExplicitScheduleMode(payload.scheduleMode);
	const attendanceBased = payload.attendanceBased === true;
	const attendanceAmountBasis = attendanceBased
		? payload.attendanceAmountBasis === "PER_DAY" || payload.attendanceAmountBasis === "PER_CUTOFF"
			? payload.attendanceAmountBasis
			: null
		: null;
	const eligibilityMode =
		String(payload.eligibilityMode || "")
			.trim()
			.toUpperCase() === "ATTENDANCE_QUALIFIED"
			? "ATTENDANCE_QUALIFIED"
			: "ENROLLED_ALWAYS";
	const eligibilityDisqualifyOnAbsent =
		payload.eligibilityDisqualifyOnAbsent === undefined ||
		payload.eligibilityDisqualifyOnAbsent === null
			? true
			: payload.eligibilityDisqualifyOnAbsent === true;
	const eligibilityDisqualifyOnLate = payload.eligibilityDisqualifyOnLate === true;
	const eligibilityDisqualifyOnUndertime = payload.eligibilityDisqualifyOnUndertime === true;
	const eligibilityDisqualifyOnLeave = payload.eligibilityDisqualifyOnLeave === true;
	const requestedInstallments = toNumber(payload.totalInstallments, Number.NaN);
	const totalInstallments =
		payload.scheduleMode === "RECURRING"
			? 0
			: payload.scheduleMode === "TIME_BOUND"
				? Number.isInteger(requestedInstallments) && requestedInstallments >= 0
					? requestedInstallments
					: undefined
				: isExplicitSchedule
					? Number.isInteger(requestedInstallments) && requestedInstallments > 0
						? requestedInstallments
						: undefined
					: Math.max(1, Math.floor(toNumber(payload.totalInstallments, DEFAULT_INSTALLMENTS)));
	// Attendance-based amounts are rate or full cut-off (not a multi-period program total).
	// RECURRING always mirrors enrolled amount as the per-period base before attendance math.
	const installmentAmount = roundMoney(
		payload.installmentAmount !== undefined
			? toNumber(payload.installmentAmount, 0)
			: payload.scheduleMode === "RECURRING" || attendanceBased
				? totalAmount
				: totalAmount / (totalInstallments && totalInstallments > 0 ? totalInstallments : 1),
	);
	const remainingBalance = roundMoney(
		payload.remainingBalance !== undefined
			? toNumber(payload.remainingBalance, 0)
			: payload.scheduleMode === "RECURRING"
				? totalAmount
				: totalAmount,
	);
	const startPayrollCutOff = payload.startPayrollCutOff ?? payload.startDate;
	const endPayrollCutOff = payload.endPayrollCutOff ?? payload.endDate;
	const status =
		payload.status ??
		(payload.isActive === false ? "CANCELLED" : totalAmount > 0 ? "PENDING" : "COMPLETED");
	const recurrenceFrequency = normalizeRecurrenceFrequency(
		payload.scheduleMode,
		payload.recurrenceFrequency,
	);

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
		scheduleMode: payload.scheduleMode ?? undefined,
		recurrenceFrequency,
		attendanceBased,
		attendanceAmountBasis,
		eligibilityMode,
		eligibilityDisqualifyOnAbsent,
		eligibilityDisqualifyOnLate,
		eligibilityDisqualifyOnUndertime,
		eligibilityDisqualifyOnLeave,
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
	periods?: BenefitSchedulePeriod[],
): Array<{
	employeeBenefitId: string;
	installmentNumber: number;
	amount: number;
	scheduledDate: Date;
	status: "SCHEDULED";
}> => {
	// Recurring benefits are ensured lazily per payroll period, not bulk-generated.
	if (benefit.scheduleMode === "RECURRING") {
		return [];
	}

	const startPayrollCutOff = benefit.startPayrollCutOff ?? benefit.startDate;
	if (!startPayrollCutOff) {
		return [];
	}

	const start = new Date(startPayrollCutOff);
	if (Number.isNaN(start.getTime())) {
		return [];
	}

	const scheduleMode = benefit.scheduleMode;
	const isExplicitSchedule =
		scheduleMode === "FIXED_INSTALLMENTS" || scheduleMode === "TIME_BOUND";
	let scheduledDates: Date[];

	if (scheduleMode === "TIME_BOUND") {
		const endPayrollCutOff = benefit.endPayrollCutOff ?? benefit.endDate;
		if (!endPayrollCutOff || !periods?.length) {
			return [];
		}

		const end = new Date(endPayrollCutOff);
		if (Number.isNaN(end.getTime()) || start > end) {
			return [];
		}

		scheduledDates = periods
			.map((period) => ({
				startDate: new Date(period.startDate),
				endDate: new Date(period.endDate),
			}))
			.filter(
				(period) =>
					!Number.isNaN(period.startDate.getTime()) &&
					!Number.isNaN(period.endDate.getTime()) &&
					period.startDate <= period.endDate &&
					period.startDate <= end &&
					period.endDate >= start,
			)
			.sort((left, right) => left.startDate.getTime() - right.startDate.getTime())
			.map((period) => period.startDate);

		if (!scheduledDates.length) {
			return [];
		}
	} else {
		const requestedInstallments = toNumber(benefit.totalInstallments, 0);
		if (!Number.isInteger(requestedInstallments) || requestedInstallments < 1) {
			return [];
		}

		scheduledDates = Array.from(
			{ length: requestedInstallments },
			(_, index) => addDays(start, index * DEFAULT_PAYROLL_CYCLE_DAYS),
		);
	}

	const totalInstallments = scheduledDates.length;
	const totalAmount = roundMoney(toNumber(benefit.totalAmount, 0));
	const attendanceBased = benefit.attendanceBased === true;
	// Attendance-based shells use enrolled amount as a placeholder; payroll overwrites
	// the due installment with the attendance-computed amount.
	const enrolledPlaceholder = roundMoney(
		toNumber(benefit.installmentAmount ?? benefit.amount ?? benefit.totalAmount, totalAmount),
	);
	const baseInstallment = attendanceBased
		? enrolledPlaceholder
		: isExplicitSchedule
			? Math.floor(Math.round(totalAmount * 100) / totalInstallments) / 100
			: roundMoney(toNumber(benefit.installmentAmount, 0));

	let allocated = 0;
	const rows: Array<{
		employeeBenefitId: string;
		installmentNumber: number;
		amount: number;
		scheduledDate: Date;
		status: "SCHEDULED";
	}> = [];

	for (let i = 1; i <= totalInstallments; i += 1) {
		const amount = attendanceBased
			? enrolledPlaceholder
			: i === totalInstallments
				? roundMoney(totalAmount - allocated)
				: roundMoney(baseInstallment);
		allocated = roundMoney(allocated + amount);
		rows.push({
			employeeBenefitId: benefitId,
			installmentNumber: i,
			amount: amount < 0 ? 0 : amount,
			scheduledDate: scheduledDates[i - 1],
			status: "SCHEDULED",
		});
	}

	return rows;
};

/**
 * Pure decision helper for lazy recurring installment creation.
 * Payroll wiring uses this before resolvePayrollBenefitSource.
 */
export const planRecurringInstallmentForPeriod = (
	benefit: RecurringInstallmentEnsureInput,
	period: BenefitSchedulePeriod,
): RecurringInstallmentEnsureResult => {
	if (benefit.scheduleMode !== "RECURRING") {
		return { action: "skipped", reason: "not_recurring" };
	}
	if (benefit.isDeleted === true) {
		return { action: "skipped", reason: "deleted" };
	}
	if (benefit.isActive !== true) {
		return { action: "skipped", reason: "inactive" };
	}
	if (!BENEFIT_PROGRAM_ACTIVE_STATUSES.has(String(benefit.status || "").toUpperCase())) {
		return { action: "skipped", reason: "status" };
	}
	if (benefit.payrollPeriodId && benefit.payrollPeriodId !== period.id) {
		return { action: "skipped", reason: "pinned_period" };
	}

	const startDate = asDate(benefit.startPayrollCutOff ?? benefit.startDate);
	const endDate = asDate(benefit.endPayrollCutOff ?? benefit.endDate);
	if (!startDate || startDate > period.endDate) {
		return { action: "skipped", reason: "before_start" };
	}
	if (endDate && endDate < period.startDate) {
		return { action: "skipped", reason: "after_end" };
	}

	const frequency =
		normalizeRecurrenceFrequency(benefit.scheduleMode, benefit.recurrenceFrequency) ||
		("EVERY_CUTOFF" as BenefitRecurrenceFrequency);
	if (
		!isRecurringPeriodEligible({
			frequency,
			periodNumber: period.periodNumber,
			periodEndDate: period.endDate,
			payFrequency: period.payFrequency,
			isOnlyPeriodInMonth: period.isOnlyPeriodInMonth,
			fiscalYearStartMonth: period.fiscalYearStartMonth,
		})
	) {
		return { action: "skipped", reason: "recurrence_frequency" };
	}

	const installments = Array.isArray(benefit.installments) ? benefit.installments : [];
	const existing = installments.find((installment) => {
		const scheduledDate = asDate(installment.scheduledDate);
		return (
			scheduledDate !== null &&
			scheduledDate >= period.startDate &&
			scheduledDate <= period.endDate
		);
	});

	const desiredAmount = roundMoney(
		toNumber(
			benefit.computedPeriodAmount ??
				benefit.installmentAmount ??
				benefit.amount ??
				benefit.totalAmount,
			0,
		),
	);

	if (existing) {
		const scheduledDate = asDate(existing.scheduledDate);
		if (!scheduledDate) {
			return { action: "skipped", reason: "invalid_existing" };
		}
		// When enrollment amount was corrected (e.g. mass-upload ABS multi-row sum),
		// keep a single installment but refresh amount on writable SCHEDULED rows.
		const status = String(existing.status || "").toUpperCase();
		const canRefreshAmount =
			status === "SCHEDULED" &&
			desiredAmount > 0 &&
			Math.abs(Number(existing.amount) - desiredAmount) > 0.005;
		return {
			action: "existing",
			installment: {
				id: existing.id,
				amount: canRefreshAmount ? desiredAmount : Number(existing.amount),
				scheduledDate,
				status: existing.status,
				payrollCutOffId: existing.payrollCutOffId,
			},
			...(canRefreshAmount ? { shouldUpdateAmount: true as const } : {}),
		};
	}

	const amount = desiredAmount;
	if (!(amount > 0)) {
		return { action: "skipped", reason: "invalid_amount" };
	}

	const maxNumber = installments.reduce((max, row) => {
		const n = Number(row.installmentNumber);
		return Number.isInteger(n) && n > max ? n : max;
	}, 0);

	return {
		action: "create",
		row: {
			employeeBenefitId: benefit.id,
			installmentNumber: maxNumber + 1,
			amount,
			scheduledDate: period.startDate,
			status: "SCHEDULED",
		},
	};
};

const findInstallmentInPeriod = (
	installments: NonNullable<RecurringInstallmentEnsureInput["installments"]>,
	period: BenefitSchedulePeriod,
) =>
	installments.find((installment) => {
		const scheduledDate = asDate(installment.scheduledDate);
		return (
			scheduledDate !== null &&
			scheduledDate >= period.startDate &&
			scheduledDate <= period.endDate
		);
	});

const isWritableInstallmentForPeriod = (
	installment: { status: string; payrollCutOffId?: string | null },
	period: BenefitSchedulePeriod,
): boolean => {
	const status = String(installment.status || "").toUpperCase();
	if (status === "SCHEDULED") return true;
	if (status === "DEDUCTED" && installment.payrollCutOffId === period.id) return true;
	return false;
};

/**
 * Pure eligibility for creating/updating a period installment for attendance-based benefits.
 * TIME_BOUND / RECURRING may create a period row; FIXED only updates an existing due row.
 */
export type PlanPeriodBenefitAmountOptions = {
	/** When true (default), require attendanceBased === true. Set false for eligibility recompute. */
	requireAttendanceBased?: boolean;
	/** When true, allow computed amount 0 (eligibility fail / full absence). Default false. */
	allowZero?: boolean;
};

export const planAttendanceBenefitInstallmentForPeriod = (
	benefit: RecurringInstallmentEnsureInput,
	period: BenefitSchedulePeriod,
	computedAmount: number,
	options?: PlanPeriodBenefitAmountOptions,
):
	| { action: "skipped"; reason: string }
	| {
			action: "update";
			installment: {
				id: string;
				amount: number;
				scheduledDate: Date;
				status: string;
				payrollCutOffId?: string | null;
			};
			amount: number;
	  }
	| {
			action: "create";
			row: {
				employeeBenefitId: string;
				installmentNumber: number;
				amount: number;
				scheduledDate: Date;
				status: "SCHEDULED";
			};
	  } => {
	const requireAttendanceBased = options?.requireAttendanceBased !== false;
	const allowZero = options?.allowZero === true;

	if (requireAttendanceBased && benefit.attendanceBased !== true) {
		return { action: "skipped", reason: "not_attendance_based" };
	}
	if (benefit.isDeleted === true) {
		return { action: "skipped", reason: "deleted" };
	}
	if (benefit.isActive !== true) {
		return { action: "skipped", reason: "inactive" };
	}
	if (!BENEFIT_PROGRAM_ACTIVE_STATUSES.has(String(benefit.status || "").toUpperCase())) {
		return { action: "skipped", reason: "status" };
	}
	if (benefit.payrollPeriodId && benefit.payrollPeriodId !== period.id) {
		return { action: "skipped", reason: "pinned_period" };
	}

	const startDate = asDate(benefit.startPayrollCutOff ?? benefit.startDate);
	const endDate = asDate(benefit.endPayrollCutOff ?? benefit.endDate);
	if (!startDate || startDate > period.endDate) {
		return { action: "skipped", reason: "before_start" };
	}
	if (endDate && endDate < period.startDate) {
		return { action: "skipped", reason: "after_end" };
	}

	// RECURRING + frequency filters apply even when amount is attendance-computed.
	if (String(benefit.scheduleMode || "").toUpperCase() === "RECURRING") {
		const frequency =
			normalizeRecurrenceFrequency(benefit.scheduleMode, benefit.recurrenceFrequency) ||
			("EVERY_CUTOFF" as BenefitRecurrenceFrequency);
		if (
			!isRecurringPeriodEligible({
				frequency,
				periodNumber: period.periodNumber,
				periodEndDate: period.endDate,
				payFrequency: period.payFrequency,
				isOnlyPeriodInMonth: period.isOnlyPeriodInMonth,
				fiscalYearStartMonth: period.fiscalYearStartMonth,
			})
		) {
			return { action: "skipped", reason: "recurrence_frequency" };
		}
	}

	const amount = roundMoney(toNumber(computedAmount, 0));
	if (allowZero) {
		if (!(amount >= 0) || !Number.isFinite(amount)) {
			return { action: "skipped", reason: "invalid_amount" };
		}
	} else if (!(amount > 0)) {
		return { action: "skipped", reason: "invalid_amount" };
	}

	const installments = Array.isArray(benefit.installments) ? benefit.installments : [];
	const existing = findInstallmentInPeriod(installments, period);

	if (existing) {
		if (!isWritableInstallmentForPeriod(existing, period)) {
			return { action: "skipped", reason: "installment_not_writable" };
		}
		const scheduledDate = asDate(existing.scheduledDate);
		if (!scheduledDate) {
			return { action: "skipped", reason: "invalid_existing" };
		}
		return {
			action: "update",
			installment: {
				id: existing.id,
				amount: Number(existing.amount),
				scheduledDate,
				status: existing.status,
				payrollCutOffId: existing.payrollCutOffId,
			},
			amount,
		};
	}

	const scheduleMode = String(benefit.scheduleMode || "").toUpperCase();
	// FIXED_INSTALLMENTS only pays rows already generated at create time.
	if (scheduleMode === "FIXED_INSTALLMENTS") {
		return { action: "skipped", reason: "no_due_fixed_installment" };
	}

	// RECURRING / TIME_BOUND / mode-less: lazy-create a period installment shell.
	const maxNumber = installments.reduce((max, row) => {
		const n = Number(row.installmentNumber);
		return Number.isInteger(n) && n > max ? n : max;
	}, 0);

	return {
		action: "create",
		row: {
			employeeBenefitId: benefit.id,
			installmentNumber: maxNumber + 1,
			amount,
			scheduledDate: period.startDate,
			status: "SCHEDULED",
		},
	};
};

/**
 * Ensures attendance-based benefits have a period installment with the computed amount.
 * Mutates `benefit.installments` in-memory for subsequent resolve.
 */
export const ensureAttendanceBenefitInstallmentForPeriod = async (
	prisma: {
		employeeBenefitInstallment: {
			create: (args: { data: AnyRecord }) => Promise<AnyRecord>;
			update: (args: { where: { id: string }; data: AnyRecord }) => Promise<AnyRecord>;
		};
	},
	benefit: RecurringInstallmentEnsureInput,
	period: BenefitSchedulePeriod,
	computedAmount: number,
	options?: PlanPeriodBenefitAmountOptions,
): Promise<
	| { action: "skipped"; reason: string }
	| {
			action: "existing";
			installment: {
				id: string;
				amount: number;
				scheduledDate: Date;
				status: string;
				payrollCutOffId?: string | null;
			};
	  }
> => {
	const plan = planAttendanceBenefitInstallmentForPeriod(
		benefit,
		period,
		computedAmount,
		options,
	);
	if (plan.action === "skipped") {
		return plan;
	}

	if (plan.action === "update") {
		if (roundMoney(Number(plan.installment.amount)) !== plan.amount) {
			await prisma.employeeBenefitInstallment.update({
				where: { id: plan.installment.id },
				data: { amount: plan.amount },
			});
		}
		if (Array.isArray(benefit.installments)) {
			const row = benefit.installments.find((item) => item.id === plan.installment.id);
			if (row) {
				row.amount = plan.amount;
			}
		}
		return {
			action: "existing",
			installment: {
				...plan.installment,
				amount: plan.amount,
			},
		};
	}

	const created = await prisma.employeeBenefitInstallment.create({ data: plan.row });
	const installment = {
		id: String(created.id),
		installmentNumber: plan.row.installmentNumber,
		amount: plan.row.amount,
		scheduledDate: plan.row.scheduledDate,
		status: "SCHEDULED" as const,
		payrollCutOffId: null,
	};

	if (!Array.isArray(benefit.installments)) {
		benefit.installments = [];
	}
	benefit.installments.push(installment);

	return {
		action: "existing",
		installment: {
			id: installment.id,
			amount: installment.amount,
			scheduledDate: installment.scheduledDate,
			status: installment.status,
			payrollCutOffId: installment.payrollCutOffId,
		},
	};
};

/**
 * Idempotently ensures a SCHEDULED installment exists for a RECURRING benefit in the given period.
 * Mutates `benefit.installments` in-memory so subsequent resolve can see the new row.
 */
export const ensureRecurringBenefitInstallmentForPeriod = async (
	prisma: {
		employeeBenefitInstallment: {
			create: (args: { data: AnyRecord }) => Promise<AnyRecord>;
			update?: (args: { where: { id: string }; data: AnyRecord }) => Promise<AnyRecord>;
		};
	},
	benefit: RecurringInstallmentEnsureInput,
	period: BenefitSchedulePeriod,
): Promise<RecurringInstallmentEnsureResult> => {
	const plan = planRecurringInstallmentForPeriod(benefit, period);
	if (plan.action === "skipped") {
		return plan;
	}
	if (plan.action === "existing") {
		if (plan.shouldUpdateAmount && prisma.employeeBenefitInstallment.update) {
			await prisma.employeeBenefitInstallment.update({
				where: { id: plan.installment.id },
				data: { amount: plan.installment.amount },
			});
			// Keep in-memory installments aligned for resolve in the same request.
			if (Array.isArray(benefit.installments)) {
				const hit = benefit.installments.find((i) => i.id === plan.installment.id);
				if (hit) hit.amount = plan.installment.amount;
			}
		}
		return plan;
	}

	const created = await prisma.employeeBenefitInstallment.create({ data: plan.row });
	const installment = {
		id: String(created.id),
		installmentNumber: plan.row.installmentNumber,
		amount: plan.row.amount,
		scheduledDate: plan.row.scheduledDate,
		status: "SCHEDULED" as const,
		payrollCutOffId: null,
	};

	if (!Array.isArray(benefit.installments)) {
		benefit.installments = [];
	}
	benefit.installments.push(installment);

	return {
		action: "existing",
		installment: {
			id: installment.id,
			amount: installment.amount,
			scheduledDate: installment.scheduledDate,
			status: installment.status,
			payrollCutOffId: installment.payrollCutOffId,
		},
	};
};
