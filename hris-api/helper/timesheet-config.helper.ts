import type { PrismaClient } from "../generated/prisma";

export type RoundingMode = "NONE" | "NEAREST" | "UP" | "DOWN";
export type RoundingIncrementMinutes = 1 | 5 | 10 | 15 | 30 | 60;

export interface WorkTimeRoundingRule {
	enabled: boolean;
	incrementMinutes: RoundingIncrementMinutes;
	mode: RoundingMode;
	applyTo: "WORKED_MINUTES" | "PAYABLE_MINUTES";
}

export interface OvertimeQualificationRule {
	enabled: boolean;
	minimumMinutesBeforeQualification: number;
	rounding: {
		enabled: boolean;
		incrementMinutes: RoundingIncrementMinutes;
		mode: Exclude<RoundingMode, "NONE">;
	};
	basis: "POST_SHIFT_EXCESS";
}

export interface PayrollFinalizationRule {
	enabled: boolean;
	lockTimesheetOnCutoffFinalization: boolean;
	allowUnlockWithAuthorizedPayrollRun: boolean;
	freezeComputedValuesOnLock: boolean;
}

export interface TimesheetRulesConfig {
	workTimeRounding: WorkTimeRoundingRule;
	overtimeQualification: OvertimeQualificationRule;
	payrollFinalization: PayrollFinalizationRule;
}

export const DEFAULT_TIMESHEET_RULES_CONFIG: TimesheetRulesConfig = {
	workTimeRounding: {
		enabled: false,
		incrementMinutes: 1,
		mode: "NONE",
		applyTo: "WORKED_MINUTES",
	},
	overtimeQualification: {
		enabled: true,
		minimumMinutesBeforeQualification: 60,
		rounding: {
			enabled: false,
			incrementMinutes: 15,
			mode: "NEAREST",
		},
		basis: "POST_SHIFT_EXCESS",
	},
	payrollFinalization: {
		enabled: true,
		lockTimesheetOnCutoffFinalization: true,
		allowUnlockWithAuthorizedPayrollRun: false,
		freezeComputedValuesOnLock: true,
	},
};

const ALLOWED_INCREMENTS = new Set([1, 5, 10, 15, 30, 60]);
const ROUNDING_MODES = new Set(["NONE", "NEAREST", "UP", "DOWN"]);
const OVERTIME_ROUNDING_MODES = new Set(["NEAREST", "UP", "DOWN"]);

function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function normalizeIncrement(value: unknown, fallback: RoundingIncrementMinutes): RoundingIncrementMinutes {
	const parsed = Number(value);
	return ALLOWED_INCREMENTS.has(parsed) ? (parsed as RoundingIncrementMinutes) : fallback;
}

function normalizeInteger(value: unknown, fallback: number, min = 0): number {
	const parsed = Math.floor(Number(value));
	return Number.isFinite(parsed) ? Math.max(min, parsed) : fallback;
}

export function normalizeTimesheetRulesConfig(value: Partial<TimesheetRulesConfig> | unknown): TimesheetRulesConfig {
	const source = asRecord(value);
	const workTimeRounding = asRecord(source.workTimeRounding);
	const overtimeQualification = asRecord(source.overtimeQualification);
	const overtimeRounding = asRecord(overtimeQualification.rounding);
	const payrollFinalization = asRecord(source.payrollFinalization);

	const workMode = String(workTimeRounding.mode || DEFAULT_TIMESHEET_RULES_CONFIG.workTimeRounding.mode).toUpperCase();
	const overtimeRoundingMode = String(
		overtimeRounding.mode || DEFAULT_TIMESHEET_RULES_CONFIG.overtimeQualification.rounding.mode,
	).toUpperCase();

	return {
		workTimeRounding: {
			enabled: Boolean(workTimeRounding.enabled),
			incrementMinutes: normalizeIncrement(
				workTimeRounding.incrementMinutes,
				DEFAULT_TIMESHEET_RULES_CONFIG.workTimeRounding.incrementMinutes,
			),
			mode: ROUNDING_MODES.has(workMode) ? (workMode as RoundingMode) : "NONE",
			applyTo:
				workTimeRounding.applyTo === "PAYABLE_MINUTES"
					? "PAYABLE_MINUTES"
					: "WORKED_MINUTES",
		},
		overtimeQualification: {
			enabled:
				overtimeQualification.enabled === undefined
					? DEFAULT_TIMESHEET_RULES_CONFIG.overtimeQualification.enabled
					: Boolean(overtimeQualification.enabled),
			minimumMinutesBeforeQualification: normalizeInteger(
				overtimeQualification.minimumMinutesBeforeQualification,
				DEFAULT_TIMESHEET_RULES_CONFIG.overtimeQualification.minimumMinutesBeforeQualification,
			),
			rounding: {
				enabled: Boolean(overtimeRounding.enabled),
				incrementMinutes: normalizeIncrement(
					overtimeRounding.incrementMinutes,
					DEFAULT_TIMESHEET_RULES_CONFIG.overtimeQualification.rounding.incrementMinutes,
				),
				mode: OVERTIME_ROUNDING_MODES.has(overtimeRoundingMode)
					? (overtimeRoundingMode as Exclude<RoundingMode, "NONE">)
					: DEFAULT_TIMESHEET_RULES_CONFIG.overtimeQualification.rounding.mode,
			},
			basis: "POST_SHIFT_EXCESS",
		},
		payrollFinalization: {
			enabled:
				payrollFinalization.enabled === undefined
					? DEFAULT_TIMESHEET_RULES_CONFIG.payrollFinalization.enabled
					: Boolean(payrollFinalization.enabled),
			lockTimesheetOnCutoffFinalization:
				payrollFinalization.lockTimesheetOnCutoffFinalization === undefined
					? DEFAULT_TIMESHEET_RULES_CONFIG.payrollFinalization.lockTimesheetOnCutoffFinalization
					: Boolean(payrollFinalization.lockTimesheetOnCutoffFinalization),
			allowUnlockWithAuthorizedPayrollRun: Boolean(
				payrollFinalization.allowUnlockWithAuthorizedPayrollRun,
			),
			freezeComputedValuesOnLock:
				payrollFinalization.freezeComputedValuesOnLock === undefined
					? DEFAULT_TIMESHEET_RULES_CONFIG.payrollFinalization.freezeComputedValuesOnLock
					: Boolean(payrollFinalization.freezeComputedValuesOnLock),
		},
	};
}

export function mergeTimesheetConfigRules(record: any) {
	const rules = normalizeTimesheetRulesConfig({
		workTimeRounding: record?.workTimeRounding,
		overtimeQualification: record?.overtimeQualification || {
			minimumMinutesBeforeQualification: record?.overtimeFlagThresholdMinutes,
		},
		payrollFinalization: record?.payrollFinalization,
	});

	return {
		...record,
		...rules,
		overtimeFlagThresholdMinutes:
			rules.overtimeQualification.minimumMinutesBeforeQualification,
	};
}

export async function getOrCreateNormalizedTimesheetConfig(
	prisma: PrismaClient,
	organizationId: string,
) {
	let record = await prisma.timesheetConfig.findUnique({ where: { organizationId } });
	const rules = normalizeTimesheetRulesConfig(
		record
			? {
					workTimeRounding: (record as any).workTimeRounding,
					overtimeQualification:
						(record as any).overtimeQualification || {
							minimumMinutesBeforeQualification:
								(record as any).overtimeFlagThresholdMinutes,
						},
					payrollFinalization: (record as any).payrollFinalization,
				}
			: DEFAULT_TIMESHEET_RULES_CONFIG,
	);

	if (!record) {
		record = await prisma.timesheetConfig.create({
			data: {
				organizationId,
				enableAutoApprove: false,
				enableEditBeforeSubmission: true,
				rejectBehavior: "REVISE",
				overtimeFlagThresholdMinutes:
					rules.overtimeQualification.minimumMinutesBeforeQualification,
				requireManagerApprovedOvertime: true,
				workTimeRounding: rules.workTimeRounding as any,
				overtimeQualification: rules.overtimeQualification as any,
				payrollFinalization: rules.payrollFinalization as any,
			},
		});
		return mergeTimesheetConfigRules(record);
	}

	if (
		!(record as any).workTimeRounding ||
		!(record as any).overtimeQualification ||
		!(record as any).payrollFinalization ||
		record.overtimeFlagThresholdMinutes !==
			rules.overtimeQualification.minimumMinutesBeforeQualification
	) {
		record = await prisma.timesheetConfig.update({
			where: { organizationId },
			data: {
				overtimeFlagThresholdMinutes:
					rules.overtimeQualification.minimumMinutesBeforeQualification,
				workTimeRounding: rules.workTimeRounding as any,
				overtimeQualification: rules.overtimeQualification as any,
				payrollFinalization: rules.payrollFinalization as any,
			},
		});
	}

	return mergeTimesheetConfigRules(record);
}
