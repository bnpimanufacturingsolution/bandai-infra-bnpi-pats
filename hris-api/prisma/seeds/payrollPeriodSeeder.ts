import { PeriodStatus, Prisma, PrismaClient } from "../../generated/prisma";
import { generatePayrollPeriodCode } from "../../helper/payroll-period-code.helper";
import {
	buildPeriodsFromRange,
	type PayrollCycleConfigLike,
} from "../../app/payrollperiod/payroll-cycle.helper";

export interface EnsurePayrollPeriodsOptions {
	prisma: PrismaClient;
	organizationId: string;
	calculatorId: string;
	year?: number;
	cycleConfig?: PayrollCycleConfigLike | null;
}

export interface EnsurePayrollPeriodsResult {
	period1Id: string;
	period2Id: string;
}

const DEFAULT_SEED_YEAR = new Date().getUTCFullYear();
const DEFAULT_SEED_CYCLE_CONFIG: PayrollCycleConfigLike = {
	defaultPayFrequency: "SEMI_MONTHLY",
	payDateOffsetDays: 5,
	businessDayRule: "NEXT_BUSINESS_DAY",
	includeHolidaysInBusinessDayCheck: true,
	// BNPI default: 11-25 / 26-10 (matches Bandai semi-monthly register cutoffs).
	cycleRules: {
		SEMI_MONTHLY: {
			firstStartDay: 11,
			secondStartDay: 26,
			secondEndDay: 10,
		},
	},
};

function createUtcDateStart(year: number, month: number, day: number): Date {
	return new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
}

function formatDateKey(date: Date): string {
	return date.toISOString().split("T")[0];
}

function getUtcDayWindow(date: Date): { gte: Date; lt: Date } {
	const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
	const end = new Date(start);
	end.setUTCDate(end.getUTCDate() + 1);
	return { gte: start, lt: end };
}

function isUniqueConstraintError(error: unknown): boolean {
	if (error instanceof Prisma.PrismaClientKnownRequestError) {
		return error.code === "P2002";
	}

	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error as { code?: string }).code === "P2002"
	);
}

async function findPayrollPeriodBySeedWindow(params: {
	prisma: PrismaClient;
	organizationId: string;
	startDate: Date;
	endDate: Date;
}) {
	const startWindow = getUtcDayWindow(params.startDate);
	const endWindow = getUtcDayWindow(params.endDate);

	return params.prisma.payrollPeriod.findFirst({
		where: {
			organizationId: params.organizationId,
			startDate: {
				gte: startWindow.gte,
				lt: startWindow.lt,
			},
			endDate: {
				gte: endWindow.gte,
				lt: endWindow.lt,
			},
		},
	});
}

async function findOrCreatePayrollPeriod(params: {
	prisma: PrismaClient;
	organizationId: string;
	calculatorId: string;
	name: string;
	startDate: Date;
	endDate: Date;
	payDate: Date;
	cutoffDay: number;
	periodNumber: number;
	payFrequency: PayrollCycleConfigLike["defaultPayFrequency"];
	status: PeriodStatus;
	notes: string;
	logLabel: string;
	generationMetadata?: Record<string, any>;
}) {
	const existing = await findPayrollPeriodBySeedWindow({
		prisma: params.prisma,
		organizationId: params.organizationId,
		startDate: params.startDate,
		endDate: params.endDate,
	});

	if (existing) {
		if (existing.isDeleted) {
			const code = existing.code || generatePayrollPeriodCode(params.startDate, params.endDate);
			const restored = await params.prisma.payrollPeriod.update({
				where: { id: existing.id },
				data: {
					name: params.name,
					code,
					payDate: params.payDate,
					cutoffDay: params.cutoffDay,
					periodNumber: params.periodNumber,
					payFrequency: params.payFrequency,
					status: params.status,
					notes: params.notes,
					calculatorId: params.calculatorId,
					isDeleted: false,
					generationMetadata: {
						...(params.generationMetadata || {}),
						source: "payrollPeriodSeeder",
						restoredFromDeletedSeedRow: true,
					},
				},
			});

			console.log(
				`   ${params.logLabel}: ${formatDateKey(params.startDate)} to ${formatDateKey(params.endDate)} (restored existing deleted row)`,
			);
			return restored;
		}

		console.log(
			`   ${params.logLabel}: ${formatDateKey(params.startDate)} to ${formatDateKey(params.endDate)} (already exists)`,
		);
		return existing;
	}

	const code = generatePayrollPeriodCode(params.startDate, params.endDate);
	try {
		const period = await params.prisma.payrollPeriod.create({
			data: {
				organizationId: params.organizationId,
				name: params.name,
				code,
				startDate: params.startDate,
				endDate: params.endDate,
				payDate: params.payDate,
				cutoffDay: params.cutoffDay,
				periodNumber: params.periodNumber,
				payFrequency: params.payFrequency,
				status: params.status,
				notes: params.notes,
				calculatorId: params.calculatorId,
				generationMetadata: {
					...(params.generationMetadata || {}),
					source: "payrollPeriodSeeder",
				},
			},
		});

		console.log(
			`   ${params.logLabel} Created: ${formatDateKey(params.startDate)} to ${formatDateKey(params.endDate)}`,
		);
		return period;
	} catch (error) {
		if (!isUniqueConstraintError(error)) {
			throw error;
		}

		const duplicate = await findPayrollPeriodBySeedWindow({
			prisma: params.prisma,
			organizationId: params.organizationId,
			startDate: params.startDate,
			endDate: params.endDate,
		});

		if (!duplicate) {
			throw error;
		}

		console.log(
			`   ${params.logLabel}: ${formatDateKey(params.startDate)} to ${formatDateKey(params.endDate)} (already exists after unique retry)`,
		);
		return duplicate;
	}
}

function resolveSeedPayrollPeriodStatus(period: { startDate: Date }): PeriodStatus {
	const now = new Date();
	const today = createUtcDateStart(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
	return period.startDate > today ? PeriodStatus.DRAFT : PeriodStatus.OPEN;
}

export async function ensureSemiMonthlyPayrollPeriods({
	prisma,
	organizationId,
	calculatorId,
	year = DEFAULT_SEED_YEAR,
	cycleConfig,
}: EnsurePayrollPeriodsOptions): Promise<EnsurePayrollPeriodsResult> {
	console.log(`\n=== Ensuring Payroll Periods for ${year} ===`);

	let period1Id = "";
	let period2Id = "";

	const savedCycleConfig =
		cycleConfig ||
		(await prisma.payrollCycleConfig.findFirst({
			where: { organizationId, isDeleted: false },
		}));
	const effectiveCycleConfig: PayrollCycleConfigLike = {
		...DEFAULT_SEED_CYCLE_CONFIG,
		...(savedCycleConfig || {}),
		cycleRules: savedCycleConfig?.cycleRules || DEFAULT_SEED_CYCLE_CONFIG.cycleRules,
	};
	const seedWindowStart = createUtcDateStart(year - 1, 11, 1);
	const seedWindowEnd = createUtcDateStart(year, 11, 31);
	const yearStart = createUtcDateStart(year, 0, 1);
	const computedPeriods = buildPeriodsFromRange({
		frequency: effectiveCycleConfig.defaultPayFrequency,
		rangeStart: seedWindowStart,
		rangeEnd: seedWindowEnd,
		config: effectiveCycleConfig,
		holidayKeys: new Set<string>(),
	});

	const periodCoveringYearStart = computedPeriods.find(
		(period) => period.startDate <= yearStart && period.endDate >= yearStart,
	);
	const carryInPeriod = periodCoveringYearStart
		? undefined
		: computedPeriods
				.filter((period) => period.endDate < yearStart)
				.sort((a, b) => b.endDate.getTime() - a.endDate.getTime())[0];
	const periodsToSeed = computedPeriods.filter(
		(period) =>
			period.startDate.getUTCFullYear() === year ||
			period.endDate.getUTCFullYear() === year ||
			period === carryInPeriod,
	);

	for (const [index, computedPeriod] of periodsToSeed.entries()) {
		const createdPeriod = await findOrCreatePayrollPeriod({
			prisma,
			organizationId,
			calculatorId,
			name: computedPeriod.name,
			startDate: computedPeriod.startDate,
			endDate: computedPeriod.endDate,
			payDate: computedPeriod.payDate,
			cutoffDay: computedPeriod.cutoffDay || computedPeriod.endDate.getUTCDate(),
			periodNumber: computedPeriod.periodNumber || index + 1,
			payFrequency: computedPeriod.payFrequency,
			status: resolveSeedPayrollPeriodStatus(computedPeriod),
			notes: computedPeriod.notes || "Payroll period generated from payroll cycle settings",
			logLabel:
				computedPeriod === carryInPeriod
					? `Carry-in Payroll Period (${formatDateKey(computedPeriod.startDate)} to ${formatDateKey(computedPeriod.endDate)})`
					: computedPeriod.name,
			generationMetadata: computedPeriod.generationMetadata,
		});

		if (!period1Id && createdPeriod.startDate.getUTCFullYear() === year) {
			period1Id = createdPeriod.id;
			continue;
		}
		if (!period2Id && createdPeriod.startDate.getUTCFullYear() === year) {
			period2Id = createdPeriod.id;
		}
	}

	return { period1Id, period2Id };
}
