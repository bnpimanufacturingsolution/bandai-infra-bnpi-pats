import { Prisma, PrismaClient } from "../../generated/prisma";
import { buildAttendanceEmployeeSnapshotFields } from "../../helper/attendance.helper";
import { getLogger } from "../../helper/logger.helper";
import {
	buildSafeUserName,
	DEFAULT_MIGRATION_EMPLOYEE_ROLE,
	ensureLocalUserAccount,
	isValidEmailAddress,
	resolveMigrationDefaultPassword,
} from "../../helper/local-user-account.helper";
import { setWorkflowConfigInBranding } from "../../helper/workflow-config.helper";
import {
	ENTERPRISE_MIGRATION_STAGE_ORDER,
	type EnterpriseMigrationData,
	type EnterpriseMigrationRequest,
	type EnterpriseMigrationStage,
	resolveEnterpriseMigrationStageOrder,
} from "../../zod/migration.zod";
import type { EnterpriseCsvRowSource } from "../../scripts/migration/enterprise-csv-loader";

const logger = getLogger();
const enterpriseMigrationLogger = logger.child({ module: "enterprise-migration" });

export interface EnterpriseMigrationStageResult {
	stage: EnterpriseMigrationStage;
	status: "success" | "failed" | "skipped";
	counts: {
		created: number;
		updated: number;
		skipped: number;
		failed: number;
	};
	validations: string[];
	warnings: string[];
	errors: string[];
	reconciliation: Record<string, any>;
	startedAt: string;
	completedAt: string;
	durationMs: number;
}

export interface EnterpriseMigrationResult {
	success: boolean;
	manifest: {
		runLabel: string;
		sourceSystem: string;
		cutoffAt: string;
		dryRun: boolean;
		requestedStages: EnterpriseMigrationStage[];
		executedStages: EnterpriseMigrationStage[];
		operator?: string;
	};
	stageResults: EnterpriseMigrationStageResult[];
	globalWarnings: string[];
	globalErrors: string[];
	goNoGo: {
		decision: "GO" | "NO_GO";
		reasons: string[];
	};
	reconciliation: Record<string, any>;
}

type MutableStageResult = EnterpriseMigrationStageResult;

interface ExecutionContext {
	prisma: PrismaClient;
	input: EnterpriseMigrationRequest;
	dryRun: boolean;
	globalWarnings: string[];
	globalErrors: string[];
	dryRunState?: DryRunState;
}

interface LookupBundle {
	organization: any | null;
	agenciesByCode: Map<string, any>;
	calculatorsByCode: Map<string, any>;
	calculatorsByName: Map<string, any>;
	payrollPeriodsByCode: Map<string, any>;
	payrollPeriodsByRange: Map<string, any>;
	departmentsByCode: Map<string, any>;
	levelsByName: Map<string, any>;
	positionsByCode: Map<string, any>;
	shiftTypesByCode: Map<string, any>;
	scheduleTemplatesByCode: Map<string, any>;
	documentTypesByCode: Map<string, any>;
	benefitTypesByName: Map<string, any>;
	loanTypesByName: Map<string, any>;
	personsByEmployeeId: Map<string, any>;
	personsByUserId: Map<string, any>;
	employeesByEmployeeId: Map<string, any>;
	timesheetsByCode: Map<string, any>;
	employeeBenefitsByCompositeKey: Map<string, any>;
	workflowInstancesByCode: Map<string, any>;
	workflowInstancesBySourceKey: Map<string, any>;
	requestsByCode: Map<string, any>;
	requestsBySourceKey: Map<string, any>;
	soasByNumber: Map<string, any>;
}

interface DryRunState {
	lookups: LookupBundle;
	documentFoldersByKey: Map<string, any>;
	documentsByKey: Map<string, any>;
	employeeScheduleHistoriesByKey: Map<string, any>;
	scheduleOverridesByKey: Map<string, any>;
	attendancesByKey: Map<string, any>;
	workflowStepExecutionsByKey: Map<string, any>;
	requestTransactionsByKey: Map<string, any>;
	soaRemittancesByKey: Map<string, any>;
	terminationsByNumber: Map<string, any>;
}

interface EmploymentAccountSummary {
	created: number;
	reused: number;
	skippedMissingEmail: number;
	linkedEmployees: number;
}

const emptyCounts = () => ({ created: 0, updated: 0, skipped: 0, failed: 0 });
const emptyEmploymentAccountSummary = (): EmploymentAccountSummary => ({
	created: 0,
	reused: 0,
	skippedMissingEmail: 0,
	linkedEmployees: 0,
});

const beginStage = (stage: EnterpriseMigrationStage): MutableStageResult => ({
	stage,
	status: "success",
	counts: emptyCounts(),
	validations: [],
	warnings: [],
	errors: [],
	reconciliation: {},
	startedAt: new Date().toISOString(),
	completedAt: new Date().toISOString(),
	durationMs: 0,
});

const finishStage = (stageResult: MutableStageResult): EnterpriseMigrationStageResult => {
	stageResult.completedAt = new Date().toISOString();
	stageResult.durationMs =
		new Date(stageResult.completedAt).getTime() - new Date(stageResult.startedAt).getTime();
	if (stageResult.errors.length > 0) {
		stageResult.status = "failed";
	}
	return stageResult;
};

const normalizeCode = (value: unknown) => String(value || "").trim().toUpperCase();
const normalizeName = (value: unknown) => String(value || "").trim();
const deriveCodeFromName = (value: unknown) =>
	normalizeName(value)
		.toUpperCase()
		.replace(/[^A-Z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "")
		.slice(0, 64);
const dateOnlyKey = (value: unknown) => {
	const date = new Date(value as any);
	return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
};
const payrollRangeKey = (startDate: unknown, endDate: unknown) =>
	`${dateOnlyKey(startDate)}::${dateOnlyKey(endDate)}`;
const benefitCompositeKey = (employeeId: string, benefitTypeId: string, startDate?: unknown) =>
	`${employeeId}::${benefitTypeId}::${dateOnlyKey(startDate)}`;
const documentFolderKey = (employeeId: string, name: string) => `${employeeId}::${normalizeName(name)}`;
const documentKey = (employeeId: string, number: string, type: string) =>
	`${employeeId}::${normalizeCode(number)}::${normalizeCode(type)}`;
const scheduleOverrideKey = (employeeId: string, date: unknown) =>
	`${employeeId}::${dateOnlyKey(date)}`;
const employeeScheduleHistoryKey = (employeeId: string, action: string, effectiveAt?: unknown) =>
	`${employeeId}::${normalizeCode(action)}::${dateOnlyKey(effectiveAt)}`;
const attendanceKey = (employeeId: string, date: unknown) => `${employeeId}::${dateOnlyKey(date)}`;
const workflowStepExecutionKey = (requestId: string, stepNumber: number) => `${requestId}::${stepNumber}`;
const requestTransactionKey = (requestId: string, sequenceNumber: number) =>
	`${requestId}::${sequenceNumber}`;
const soaRemittanceKey = (statementOfAccountId: string, referenceNumber: unknown, paymentDate: unknown) =>
	`${statementOfAccountId}::${normalizeCode(referenceNumber)}::${dateOnlyKey(paymentDate)}`;

const cloneLookupBundle = (lookups: LookupBundle): LookupBundle => ({
	organization: lookups.organization,
	agenciesByCode: new Map(lookups.agenciesByCode),
	calculatorsByCode: new Map(lookups.calculatorsByCode),
	calculatorsByName: new Map(lookups.calculatorsByName),
	payrollPeriodsByCode: new Map(lookups.payrollPeriodsByCode),
	payrollPeriodsByRange: new Map(lookups.payrollPeriodsByRange),
	departmentsByCode: new Map(lookups.departmentsByCode),
	levelsByName: new Map(lookups.levelsByName),
	positionsByCode: new Map(lookups.positionsByCode),
	shiftTypesByCode: new Map(lookups.shiftTypesByCode),
	scheduleTemplatesByCode: new Map(lookups.scheduleTemplatesByCode),
	documentTypesByCode: new Map(lookups.documentTypesByCode),
	benefitTypesByName: new Map(lookups.benefitTypesByName),
	loanTypesByName: new Map(lookups.loanTypesByName),
	personsByEmployeeId: new Map(lookups.personsByEmployeeId),
	personsByUserId: new Map(lookups.personsByUserId),
	employeesByEmployeeId: new Map(lookups.employeesByEmployeeId),
	timesheetsByCode: new Map(lookups.timesheetsByCode),
	employeeBenefitsByCompositeKey: new Map(lookups.employeeBenefitsByCompositeKey),
	workflowInstancesByCode: new Map(lookups.workflowInstancesByCode),
	workflowInstancesBySourceKey: new Map(lookups.workflowInstancesBySourceKey),
	requestsByCode: new Map(lookups.requestsByCode),
	requestsBySourceKey: new Map(lookups.requestsBySourceKey),
	soasByNumber: new Map(lookups.soasByNumber),
});

const buildDryRunState = (lookups: LookupBundle): DryRunState => ({
	lookups: cloneLookupBundle(lookups),
	documentFoldersByKey: new Map(),
	documentsByKey: new Map(),
	employeeScheduleHistoriesByKey: new Map(),
	scheduleOverridesByKey: new Map(),
	attendancesByKey: new Map(),
	workflowStepExecutionsByKey: new Map(),
	requestTransactionsByKey: new Map(),
	soaRemittancesByKey: new Map(),
	terminationsByNumber: new Map(),
});

const buildDryRunId = (kind: string, key: string) => `dryrun:${kind}:${key}`;

const getCsvSource = (row: unknown): EnterpriseCsvRowSource | undefined =>
	row && typeof row === "object" ? ((row as any)._csvSource as EnterpriseCsvRowSource | undefined) : undefined;

const appendCsvSource = (message: string, row?: unknown, field?: string) => {
	const source = getCsvSource(row);
	if (!source) return message;
	const location = `${source.fileName} row ${source.rowNumber}`;
	return `${message} (source: ${location}${field ? ` field ${field}` : ""}).`;
};

const pushStageError = (
	ctx: ExecutionContext,
	stageResult: MutableStageResult,
	message: string,
	options?: {
		row?: unknown;
		field?: string;
		failedCount?: number;
	},
) => {
	const finalMessage = appendCsvSource(message, options?.row, options?.field);
	stageResult.errors.push(finalMessage);
	ctx.globalErrors.push(finalMessage);
	stageResult.counts.failed += options?.failedCount ?? 1;
};

const pushStageWarning = (
	ctx: ExecutionContext,
	stageResult: MutableStageResult,
	message: string,
	options?: {
		row?: unknown;
		field?: string;
	},
) => {
	const finalMessage = appendCsvSource(message, options?.row, options?.field);
	stageResult.warnings.push(finalMessage);
	ctx.globalWarnings.push(finalMessage);
};

const asRecord = (value: unknown): Record<string, any> =>
	value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};

const getContactEmail = (contactInfo: unknown): string => {
	const email = asRecord(contactInfo).email;
	return typeof email === "string" ? email.trim().toLowerCase() : "";
};

const getPersonalName = (personalInfo: unknown, field: "firstName" | "lastName"): string => {
	const value = asRecord(personalInfo)[field];
	return typeof value === "string" ? value.trim() : "";
};

const ensureArrayUnique = (
	values: string[],
	label: string,
	stageResult: MutableStageResult,
	ctx: ExecutionContext,
) => {
	const seen = new Set<string>();
	for (const value of values) {
		if (!value) continue;
		if (seen.has(value)) {
			const message = `${label} contains duplicate key "${value}".`;
			stageResult.errors.push(message);
			ctx.globalErrors.push(message);
		}
		seen.add(value);
	}
};

const detectReportingCycles = (
	lines: Array<{ employeeId?: string; reportToEmployeeId?: string }>,
): string[] => {
	const adjacency = new Map<string, string>();
	for (const line of lines) {
		if (!line.employeeId || !line.reportToEmployeeId) continue;
		adjacency.set(line.employeeId, line.reportToEmployeeId);
	}

	const visited = new Set<string>();
	const visiting = new Set<string>();
	const cycles: string[] = [];

	const walk = (node: string, trail: string[]) => {
		if (!node) return;
		if (visiting.has(node)) {
			cycles.push([...trail, node].join(" -> "));
			return;
		}
		if (visited.has(node)) return;
		visiting.add(node);
		const next = adjacency.get(node);
		if (next) {
			walk(next, [...trail, node]);
		}
		visiting.delete(node);
		visited.add(node);
	};

	for (const node of Array.from(adjacency.keys())) {
		walk(node, []);
	}

	return cycles;
};

const detectOverlappingPeriods = (periods: Array<{ startDate: Date; endDate: Date; label: string }>) => {
	const sorted = [...periods].sort((left, right) => left.startDate.getTime() - right.startDate.getTime());
	const overlaps: string[] = [];
	for (let index = 1; index < sorted.length; index += 1) {
		const previous = sorted[index - 1];
		const current = sorted[index];
		if (current.startDate.getTime() <= previous.endDate.getTime()) {
			overlaps.push(`${previous.label} overlaps ${current.label}`);
		}
	}
	return overlaps;
};

const mergeBrandingMetadata = (branding: any, nextData: Record<string, any>) => {
	const base =
		branding && typeof branding === "object" && !Array.isArray(branding) ? { ...branding } : {};
	return {
		...base,
		migrationMetadata: {
			...(base.migrationMetadata && typeof base.migrationMetadata === "object"
				? base.migrationMetadata
				: {}),
			...nextData,
		},
	};
};

export const buildEnterpriseAttendancePayload = (params: {
	attendance: EnterpriseMigrationData["attendances"][number];
	employee: any;
}) => {
	const { attendance, employee } = params;
	const snapshotFields = buildAttendanceEmployeeSnapshotFields(employee);
	const baseMetadata =
		attendance.metadata && typeof attendance.metadata === "object" && !Array.isArray(attendance.metadata)
			? { ...(attendance.metadata as Record<string, any>) }
			: {};

	const deviceInfo = attendance.deviceEmpId
		? ({
				deviceEmpId: attendance.deviceEmpId,
				source: "enterprise-csv-migration",
				...(Object.keys(baseMetadata).length > 0 ? { importContext: baseMetadata } : {}),
			} as Record<string, any>)
		: undefined;

	return {
		timeIn: attendance.timeIn ? new Date(attendance.timeIn as any) : null,
		timeBreak: attendance.timeBreak ? new Date(attendance.timeBreak as any) : null,
		timeOut: attendance.timeOut ? new Date(attendance.timeOut as any) : null,
		status: (attendance.status || "PRESENT") as any,
		notes: attendance.notes,
		scheduleSnapshot: attendance.scheduleSnapshot,
		...(deviceInfo ? { deviceInfo } : {}),
		...snapshotFields,
	};
};

const roundToCentavo = (value: number) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const formatPayrollHourSummary = (value: number | null | undefined): string => {
	const numericValue = Number(value ?? 0);
	if (!Number.isFinite(numericValue) || numericValue <= 0) {
		return "0:00";
	}
	const hours = Math.trunc(numericValue);
	const minutes = Math.round((numericValue - hours) * 60);
	if (minutes === 60) {
		return `${hours + 1}:00`;
	}
	return `${hours}:${String(minutes).padStart(2, "0")}`;
};

export const buildEnterpriseEmployeePayrollPayload = (params: {
	payroll: EnterpriseMigrationData["employeePayrolls"][number];
	payrollPeriodId: string;
	timesheetId?: string | null;
	timesheet?: any | null;
}) => {
	const { payroll, payrollPeriodId, timesheetId, timesheet } = params;
	const metadata =
		payroll.metadata && typeof payroll.metadata === "object" && !Array.isArray(payroll.metadata)
			? { ...(payroll.metadata as Record<string, any>) }
			: {};

	const taxableIncome = roundToCentavo(
		Number(payroll.grossPay || 0) -
			(Number(payroll.sssContribution || 0) +
				Number(payroll.philHealthContribution || 0) +
				Number(payroll.pagibigContribution || 0)),
	);

	const timesheetSnapshot = {
		totalHoursWorked:
			(timesheet && typeof timesheet.totalHoursWorked === "string" ? timesheet.totalHoursWorked : null) ||
			formatPayrollHourSummary(payroll.regularHours) ||
			"0:00",
		totalRegularHours:
			(timesheet && typeof timesheet.totalRegularHours === "string" ? timesheet.totalRegularHours : null) ||
			formatPayrollHourSummary(payroll.regularHours) ||
			"0:00",
		totalOvertimeHours:
			(timesheet && typeof timesheet.totalOvertimeHours === "string" ? timesheet.totalOvertimeHours : null) ||
			formatPayrollHourSummary(payroll.overtimeHours) ||
			"0:00",
		totalUndertimeHours:
			(timesheet && typeof timesheet.totalUndertimeHours === "string"
				? timesheet.totalUndertimeHours
				: null) || "0:00",
		totalLateHours:
			(timesheet && typeof timesheet.totalLateHours === "string" ? timesheet.totalLateHours : null) ||
			"0:00",
		totalEarlyOutHours:
			(timesheet && typeof timesheet.totalEarlyOutHours === "string"
				? timesheet.totalEarlyOutHours
				: null) || "0:00",
		totalDays: typeof timesheet?.totalDays === "number" ? timesheet.totalDays : null,
		metadata: {
			importedRegularHours: payroll.regularHours ?? null,
			importedOvertimeHours: payroll.overtimeHours ?? null,
			sourceSystem: "enterprise-csv-migration",
			...(Object.keys(metadata).length > 0 ? { importContext: metadata } : {}),
		},
	} as Prisma.InputJsonValue;

	const payload = {
		payrollPeriodId,
		timesheetId: timesheetId || null,
		basicPay: payroll.basicPay,
		overtimePay: payroll.overtimePay,
		nightDiffPay: payroll.nightDiffPay,
		holidayPay: payroll.holidayPay,
		allowances: payroll.allowances,
		bonuses: payroll.bonuses,
		taxAmount: payroll.taxAmount,
		sssContribution: payroll.sssContribution,
		philHealthContribution: payroll.philHealthContribution,
		pagibigContribution: payroll.pagibigContribution,
		loanDeductions: payroll.loanDeductions,
		absentDeduction: payroll.absentDeduction,
		lateDeduction: payroll.lateDeduction,
		earlyOutDeduction: payroll.earlyOutDeduction,
		otherDeductions: payroll.otherDeductions,
		grossPay: payroll.grossPay,
		taxableIncome,
		totalDeductions: payroll.totalDeductions,
		netPay: payroll.netPay,
		timesheetSnapshot,
		metadata: {
			...metadata,
			sourceSystem: "enterprise-csv-migration",
		} as Prisma.InputJsonValue,
		isPaid: payroll.isPaid,
		paidAt: payroll.paidAt ? new Date(payroll.paidAt as any) : null,
		paymentMethod: payroll.paymentMethod,
		referenceNumber: payroll.referenceNumber,
		notes: payroll.notes,
	} satisfies Omit<Prisma.EmployeePayrollUncheckedCreateInput, "organizationId" | "employeeId">;

	return payload;
};

const buildLookups = async (prisma: PrismaClient, organizationId: string): Promise<LookupBundle> => {
	const [
		organization,
		agencies,
		calculators,
		payrollPeriods,
		departments,
		levels,
		positions,
		shiftTypes,
		scheduleTemplates,
		documentTypes,
		benefitTypes,
		loanTypes,
		persons,
		employees,
		timesheets,
		employeeBenefits,
		workflowInstances,
		requests,
		soas,
	] = await Promise.all([
		prisma.organization.findFirst({ where: { id: organizationId, isDeleted: false } }),
		prisma.agency.findMany({ where: { organizationId, isDeleted: false } }),
		prisma.calculator.findMany({ where: { organizationId, isDeleted: false } }),
		prisma.payrollPeriod.findMany({ where: { organizationId, isDeleted: false } }),
		prisma.department.findMany({ where: { organizationId, isDeleted: false } }),
		prisma.level.findMany({ where: { organizationId, isDeleted: false } }),
		prisma.position.findMany({ where: { organizationId, isDeleted: false } }),
		prisma.shiftType.findMany({ where: { organizationId, isDeleted: false } }),
		prisma.scheduleTemplate.findMany({ where: { organizationId, isDeleted: false } }),
		prisma.documentType.findMany({ where: { organizationId, isDeleted: false } }),
		prisma.benefitType.findMany({ where: { organizationId, isDeleted: false } }),
		prisma.loanType.findMany({ where: { organizationId, isDeleted: false } }),
		prisma.person.findMany({ where: { organizationId, isDeleted: false } }),
		prisma.employee.findMany({ where: { organizationId, isDeleted: false } }),
		prisma.timesheet.findMany({ where: { organizationId, isDeleted: false } }),
		prisma.employeeBenefit.findMany({ where: { organizationId, isDeleted: false } }),
		prisma.workflowInstance.findMany({ where: { organizationId, isDeleted: false } }),
		prisma.request.findMany({ where: { organizationId, isDeleted: false } }),
		prisma.statementOfAccount.findMany({ where: { organizationId, isDeleted: false } }),
	]);

	return {
		organization,
		agenciesByCode: new Map(agencies.map((row) => [normalizeCode(row.code), row])),
		calculatorsByCode: new Map(calculators.map((row) => [normalizeCode(row.code), row])),
		calculatorsByName: new Map(calculators.map((row) => [normalizeName(row.name), row])),
		payrollPeriodsByCode: new Map(
			payrollPeriods.map((row) => [normalizeCode(row.code || row.name), row]),
		),
		payrollPeriodsByRange: new Map(
			payrollPeriods.map((row) => [payrollRangeKey(row.startDate, row.endDate), row]),
		),
		departmentsByCode: new Map(departments.map((row) => [normalizeCode(row.code), row])),
		levelsByName: new Map(levels.map((row) => [normalizeName(row.name), row])),
		positionsByCode: new Map(positions.map((row) => [normalizeCode(row.code), row])),
		shiftTypesByCode: new Map(shiftTypes.map((row) => [normalizeCode(row.code), row])),
		scheduleTemplatesByCode: new Map(
			scheduleTemplates.map((row) => [normalizeCode(row.code), row]),
		),
		documentTypesByCode: new Map(documentTypes.map((row) => [normalizeCode(row.code), row])),
		benefitTypesByName: new Map(benefitTypes.map((row) => [normalizeName(row.name), row])),
		loanTypesByName: new Map(loanTypes.map((row) => [normalizeName(row.name), row])),
		personsByEmployeeId: new Map(
			persons
				.filter((row) => row.employeeId)
				.map((row) => [String(row.employeeId), row]),
		),
		personsByUserId: new Map(
			persons
				.filter((row) => row.userId)
				.map((row) => [String(row.userId), row]),
		),
		employeesByEmployeeId: new Map(employees.map((row) => [String(row.employeeId), row])),
		timesheetsByCode: new Map(
			timesheets
				.filter((row) => row.code)
				.map((row) => [normalizeCode(row.code), row]),
		),
		employeeBenefitsByCompositeKey: new Map(
			employeeBenefits.map((row) => [
				benefitCompositeKey(String(row.employeeId || ""), String(row.benefitTypeId || ""), row.startDate),
				row,
			]),
		),
		workflowInstancesByCode: new Map(
			workflowInstances
				.filter((row) => row.code)
				.map((row) => [normalizeCode(row.code), row]),
		),
		workflowInstancesBySourceKey: new Map<string, any>(),
		requestsByCode: new Map(
			requests
				.filter((row) => row.code)
				.map((row) => [normalizeCode(row.code), row]),
		),
		requestsBySourceKey: new Map<string, any>(
			requests
				.filter((row) => row.metadata && typeof row.metadata === "object")
				.map((row) => [String((row.metadata as any).sourceRequestKey || ""), row] as const)
				.filter(([key]) => Boolean(key)),
		),
		soasByNumber: new Map(soas.map((row) => [normalizeCode(row.soaNumber), row])),
	};
};

const getActiveLookups = async (ctx: ExecutionContext): Promise<LookupBundle> => {
	if (!ctx.dryRun) {
		return buildLookups(ctx.prisma, ctx.input.config.organizationId);
	}
	if (!ctx.dryRunState) {
		const baseLookups = await buildLookups(ctx.prisma, ctx.input.config.organizationId);
		ctx.dryRunState = buildDryRunState(baseLookups);
	}
	return ctx.dryRunState.lookups;
};

const refreshLookups = async (ctx: ExecutionContext): Promise<LookupBundle> => {
	if (ctx.dryRun) {
		return getActiveLookups(ctx);
	}
	return buildLookups(ctx.prisma, ctx.input.config.organizationId);
};

const requireOrganization = async (
	ctx: ExecutionContext,
	stageResult: MutableStageResult,
): Promise<LookupBundle> => {
	const lookups = await getActiveLookups(ctx);
	if (!lookups.organization) {
		const message = `Organization ${ctx.input.config.organizationId} was not found.`;
		stageResult.errors.push(message);
		ctx.globalErrors.push(message);
		throw new Error(message);
	}
	return lookups;
};

const registerDryRunAgency = (ctx: ExecutionContext, agency: EnterpriseMigrationData["agencies"][number]) => {
	if (!ctx.dryRunState) return;
	const key = normalizeCode(agency.code);
	const existing = ctx.dryRunState.lookups.agenciesByCode.get(key);
	ctx.dryRunState.lookups.agenciesByCode.set(key, {
		...existing,
		id: existing?.id || buildDryRunId("agency", key),
		code: agency.code,
		name: agency.name,
		status: agency.status || existing?.status || "ACTIVE",
	});
};

const registerDryRunCalculator = (
	ctx: ExecutionContext,
	calculator: EnterpriseMigrationData["calculators"][number],
) => {
	if (!ctx.dryRunState) return;
	const codeKey = normalizeCode(calculator.code || calculator.name);
	const nameKey = normalizeName(calculator.name);
	const existing =
		ctx.dryRunState.lookups.calculatorsByCode.get(codeKey) ||
		ctx.dryRunState.lookups.calculatorsByName.get(nameKey);
	const record = {
		...existing,
		id: existing?.id || buildDryRunId("calculator", codeKey || nameKey),
		code: calculator.code,
		name: calculator.name,
	};
	ctx.dryRunState.lookups.calculatorsByCode.set(codeKey, record);
	ctx.dryRunState.lookups.calculatorsByName.set(nameKey, record);
};

const registerDryRunPayrollPeriod = (
	ctx: ExecutionContext,
	payrollPeriod: EnterpriseMigrationData["payrollPeriods"][number],
	calculatorId?: string | null,
) => {
	if (!ctx.dryRunState) return;
	const codeKey = normalizeCode(payrollPeriod.code || payrollPeriod.name);
	const rangeKey = payrollRangeKey(payrollPeriod.startDate, payrollPeriod.endDate);
	const existing =
		ctx.dryRunState.lookups.payrollPeriodsByCode.get(codeKey) ||
		ctx.dryRunState.lookups.payrollPeriodsByRange.get(rangeKey);
	const record = {
		...existing,
		id: existing?.id || buildDryRunId("payroll-period", codeKey || rangeKey),
		code: payrollPeriod.code,
		name: payrollPeriod.name,
		startDate: new Date(payrollPeriod.startDate as any),
		endDate: new Date(payrollPeriod.endDate as any),
		payDate: new Date(payrollPeriod.payDate as any),
		calculatorId: calculatorId || existing?.calculatorId || null,
	};
	ctx.dryRunState.lookups.payrollPeriodsByCode.set(codeKey, record);
	ctx.dryRunState.lookups.payrollPeriodsByRange.set(rangeKey, record);
};

const registerDryRunDocumentType = (
	ctx: ExecutionContext,
	documentType: EnterpriseMigrationData["documentTypes"][number],
) => {
	if (!ctx.dryRunState) return;
	const key = normalizeCode(documentType.code);
	const existing = ctx.dryRunState.lookups.documentTypesByCode.get(key);
	ctx.dryRunState.lookups.documentTypesByCode.set(key, {
		...existing,
		id: existing?.id || buildDryRunId("document-type", key),
		code: documentType.code,
		name: documentType.name,
	});
};

const registerDryRunBenefitType = (
	ctx: ExecutionContext,
	benefitType: EnterpriseMigrationData["benefitTypes"][number],
) => {
	if (!ctx.dryRunState) return;
	const key = normalizeName(benefitType.name);
	const existing = ctx.dryRunState.lookups.benefitTypesByName.get(key);
	ctx.dryRunState.lookups.benefitTypesByName.set(key, {
		...existing,
		id: existing?.id || buildDryRunId("benefit-type", key),
		code: normalizeCode(benefitType.code) || deriveCodeFromName(benefitType.name),
		name: benefitType.name,
	});
};

const registerDryRunLoanType = (ctx: ExecutionContext, loanType: EnterpriseMigrationData["loanTypes"][number]) => {
	if (!ctx.dryRunState) return;
	const key = normalizeName(loanType.name);
	const existing = ctx.dryRunState.lookups.loanTypesByName.get(key);
	ctx.dryRunState.lookups.loanTypesByName.set(key, {
		...existing,
		id: existing?.id || buildDryRunId("loan-type", key),
		name: loanType.name,
	});
};

const registerDryRunShiftType = (
	ctx: ExecutionContext,
	shiftType: EnterpriseMigrationData["shiftTypes"][number],
) => {
	if (!ctx.dryRunState) return;
	const key = normalizeCode(shiftType.code);
	const existing = ctx.dryRunState.lookups.shiftTypesByCode.get(key);
	ctx.dryRunState.lookups.shiftTypesByCode.set(key, {
		...existing,
		id: existing?.id || buildDryRunId("shift-type", key),
		code: shiftType.code,
		name: shiftType.name,
	});
};

const registerDryRunScheduleTemplate = (
	ctx: ExecutionContext,
	template: EnterpriseMigrationData["scheduleTemplates"][number],
) => {
	if (!ctx.dryRunState) return;
	const key = normalizeCode(template.code);
	const existing = ctx.dryRunState.lookups.scheduleTemplatesByCode.get(key);
	ctx.dryRunState.lookups.scheduleTemplatesByCode.set(key, {
		...existing,
		id: existing?.id || buildDryRunId("schedule-template", key),
		code: template.code,
		name: template.name,
	});
};

const registerDryRunLevel = (ctx: ExecutionContext, level: EnterpriseMigrationData["levels"][number]) => {
	if (!ctx.dryRunState) return;
	const key = normalizeName(level.name);
	const existing = ctx.dryRunState.lookups.levelsByName.get(key);
	ctx.dryRunState.lookups.levelsByName.set(key, {
		...existing,
		id: existing?.id || buildDryRunId("level", key),
		name: level.name,
		rank: level.rank,
	});
};

const registerDryRunDepartment = (
	ctx: ExecutionContext,
	department: EnterpriseMigrationData["departments"][number],
) => {
	if (!ctx.dryRunState) return;
	const key = normalizeCode(department.code);
	const existing = ctx.dryRunState.lookups.departmentsByCode.get(key);
	ctx.dryRunState.lookups.departmentsByCode.set(key, {
		...existing,
		id: existing?.id || buildDryRunId("department", key),
		code: department.code,
		name: department.name,
		parentCode: department.parentCode,
	});
};

const registerDryRunPosition = (
	ctx: ExecutionContext,
	position: EnterpriseMigrationData["positions"][number],
) => {
	if (!ctx.dryRunState) return;
	const key = normalizeCode(position.code);
	const existing = ctx.dryRunState.lookups.positionsByCode.get(key);
	ctx.dryRunState.lookups.positionsByCode.set(key, {
		...existing,
		id: existing?.id || buildDryRunId("position", key),
		code: position.code,
		title: position.title,
		minSalary: position.minSalary,
		maxSalary: position.maxSalary,
	});
};

const registerDryRunPerson = (ctx: ExecutionContext, person: EnterpriseMigrationData["persons"][number]) => {
	if (!ctx.dryRunState) return;
	const record = {
		id: buildDryRunId("person", normalizeCode(person.employeeId || person.userId || person.sourcePersonKey || "row")),
		employeeId: person.employeeId,
		userId: person.userId,
		personalInfo: person.personalInfo,
		contactInfo: person.contactInfo,
		identification: person.identification,
		metadata: person.metadata,
	};
	if (person.employeeId) {
		ctx.dryRunState.lookups.personsByEmployeeId.set(String(person.employeeId), record);
	}
	if (person.userId) {
		ctx.dryRunState.lookups.personsByUserId.set(String(person.userId), record);
	}
};

const registerDryRunEmployee = (params: {
	ctx: ExecutionContext;
	employee: EnterpriseMigrationData["employees"][number];
	departmentId: string;
	positionId: string;
	levelId?: string | null;
	personId: string;
	agencyId?: string | null;
}) => {
	const { ctx, employee, departmentId, positionId, levelId, personId, agencyId } = params;
	if (!ctx.dryRunState) return;
	const existing = ctx.dryRunState.lookups.employeesByEmployeeId.get(employee.employeeId);
	ctx.dryRunState.lookups.employeesByEmployeeId.set(employee.employeeId, {
		...existing,
		id: existing?.id || buildDryRunId("employee", employee.employeeId),
		employeeId: employee.employeeId,
		departmentId,
		positionId,
		levelId: levelId || null,
		personId,
		agencyId: agencyId || null,
		role: employee.role,
	});
};

const registerDryRunEmployeeBenefit = (params: {
	ctx: ExecutionContext;
	employeeId: string;
	benefitTypeId: string;
	benefit: EnterpriseMigrationData["employeeBenefits"][number];
}) => {
	const { ctx, employeeId, benefitTypeId, benefit } = params;
	if (!ctx.dryRunState) return;
	const key = benefitCompositeKey(employeeId, benefitTypeId, benefit.startDate);
	const existing = ctx.dryRunState.lookups.employeeBenefitsByCompositeKey.get(key);
	ctx.dryRunState.lookups.employeeBenefitsByCompositeKey.set(key, {
		...existing,
		id: existing?.id || buildDryRunId("employee-benefit", key),
		employeeId,
		benefitTypeId,
		startDate: benefit.startDate ? new Date(benefit.startDate as any) : null,
	});
};

const findDryRunEmployeeBenefit = (ctx: ExecutionContext, employeeId: string, benefitTypeId: string) => {
	if (!ctx.dryRunState) return null;
	for (const benefit of Array.from(ctx.dryRunState.lookups.employeeBenefitsByCompositeKey.values())) {
		if (benefit.employeeId === employeeId && benefit.benefitTypeId === benefitTypeId) {
			return benefit;
		}
	}
	return null;
};

const registerDryRunTimesheet = (
	ctx: ExecutionContext,
	timesheet: EnterpriseMigrationData["timesheets"][number],
	employeeId: string,
	payrollPeriodId: string,
) => {
	if (!ctx.dryRunState || !timesheet.code) return;
	const key = normalizeCode(timesheet.code);
	const existing = ctx.dryRunState.lookups.timesheetsByCode.get(key);
	ctx.dryRunState.lookups.timesheetsByCode.set(key, {
		...existing,
		id: existing?.id || buildDryRunId("timesheet", key),
		code: timesheet.code,
		employeeId,
		payrollPeriodId,
	});
};

const registerDryRunWorkflowInstance = (
	ctx: ExecutionContext,
	instance: EnterpriseMigrationData["workflowInstances"][number],
) => {
	if (!ctx.dryRunState) return;
	const record = {
		id: buildDryRunId(
			"workflow-instance",
			normalizeCode(instance.code || instance.sourceWorkflowKey || instance.name || "row"),
		),
		code: instance.code,
		sourceWorkflowKey: instance.sourceWorkflowKey,
		domain: instance.domain,
	};
	if (instance.code) {
		ctx.dryRunState.lookups.workflowInstancesByCode.set(normalizeCode(instance.code), record);
	}
	if (instance.sourceWorkflowKey) {
		ctx.dryRunState.lookups.workflowInstancesBySourceKey.set(instance.sourceWorkflowKey, record);
	}
};

const registerDryRunRequest = (params: {
	ctx: ExecutionContext;
	request: EnterpriseMigrationData["requests"][number];
	requesterId: string;
	targetEmployeeId?: string | null;
	workflowInstanceId?: string | null;
}) => {
	const { ctx, request, requesterId, targetEmployeeId, workflowInstanceId } = params;
	if (!ctx.dryRunState) return;
	const record = {
		id: buildDryRunId("request", normalizeCode(request.code || request.sourceRequestKey || request.description)),
		code: request.code,
		requesterId,
		targetEmployeeId: targetEmployeeId || null,
		workflowInstanceId: workflowInstanceId || null,
		metadata: {
			...((request.metadata as Record<string, any>) || {}),
			sourceRequestKey: request.sourceRequestKey || undefined,
		},
	};
	if (request.code) {
		ctx.dryRunState.lookups.requestsByCode.set(normalizeCode(request.code), record);
	}
	if (request.sourceRequestKey) {
		ctx.dryRunState.lookups.requestsBySourceKey.set(request.sourceRequestKey, record);
	}
};

const registerDryRunSoa = (
	ctx: ExecutionContext,
	soa: EnterpriseMigrationData["statementsOfAccount"][number],
) => {
	if (!ctx.dryRunState) return;
	const key = normalizeCode(soa.soaNumber);
	const existing = ctx.dryRunState.lookups.soasByNumber.get(key);
	ctx.dryRunState.lookups.soasByNumber.set(key, {
		...existing,
		id: existing?.id || buildDryRunId("soa", key),
		soaNumber: soa.soaNumber,
	});
};

const upsertOrganizationFoundation = async (
	ctx: ExecutionContext,
	stageResult: MutableStageResult,
	lookups: LookupBundle,
) => {
	const organizationPayload = ctx.input.data.organization;
	if (!organizationPayload) {
		stageResult.status = "skipped";
		stageResult.reconciliation.organization = "No organization foundation payload supplied.";
		return;
	}

	stageResult.validations.push("Organization foundation payload supplied.");

	if (ctx.dryRun) {
		stageResult.counts.updated += 1;
		stageResult.reconciliation.organization = {
			code: organizationPayload.code,
			name: organizationPayload.name,
			branches: organizationPayload.branches?.length || 0,
			sites: organizationPayload.sites?.length || 0,
		};
		return;
	}

	const nextBranding = mergeBrandingMetadata(lookups.organization?.branding, {
		foundationMaster: {
			branches: organizationPayload.branches || [],
			sites: organizationPayload.sites || [],
			currencies: organizationPayload.currencies || [],
			workforceSources: organizationPayload.workforceSources || [],
		},
		...((organizationPayload.branding as Record<string, any>) || {}),
	});

	await ctx.prisma.organization.update({
		where: { id: ctx.input.config.organizationId },
		data: {
			name: organizationPayload.name,
			description: organizationPayload.description,
			branding: nextBranding,
		},
	});
	stageResult.counts.updated += 1;
	stageResult.reconciliation.organization = {
		id: ctx.input.config.organizationId,
		code: organizationPayload.code,
		name: organizationPayload.name,
	};
};

const runPreMigrationControls = async (
	ctx: ExecutionContext,
	stageResult: MutableStageResult,
) => {
	await requireOrganization(ctx, stageResult);
	stageResult.validations.push("Organization exists and is active.");
	stageResult.validations.push("Manifest cutoff and run label captured.");

	ensureArrayUnique(
		ctx.input.data.departments.map((row) => normalizeCode(row.code)),
		"Departments",
		stageResult,
		ctx,
	);
	ensureArrayUnique(
		ctx.input.data.positions.map((row) => normalizeCode(row.code)),
		"Positions",
		stageResult,
		ctx,
	);
	ensureArrayUnique(
		ctx.input.data.employees.map((row) => row.employeeId),
		"Employees",
		stageResult,
		ctx,
	);

	const payrollOverlaps = detectOverlappingPeriods(
		ctx.input.data.payrollPeriods.map((row) => ({
			startDate: new Date(row.startDate),
			endDate: new Date(row.endDate),
			label: row.code || row.name,
		})),
	);
	if (payrollOverlaps.length > 0) {
		stageResult.errors.push(...payrollOverlaps);
		ctx.globalErrors.push(...payrollOverlaps);
	} else {
		stageResult.validations.push("Incoming payroll periods do not overlap.");
	}

	const cycles = detectReportingCycles(ctx.input.data.reportingLines);
	if (cycles.length > 0) {
		const messages = cycles.map((cycle) => `Reporting cycle detected: ${cycle}`);
		stageResult.errors.push(...messages);
		ctx.globalErrors.push(...messages);
	} else {
		stageResult.validations.push("Incoming reporting lines have no cycles.");
	}

	stageResult.reconciliation = {
		hashTotals: ctx.input.manifest.hashTotals || {},
		baselineCounts: ctx.input.manifest.baselineCounts || {},
		requestedRows: {
			calculators: ctx.input.data.calculators.length,
			payrollPeriods: ctx.input.data.payrollPeriods.length,
			departments: ctx.input.data.departments.length,
			persons: ctx.input.data.persons.length,
			employees: ctx.input.data.employees.length,
			requests: ctx.input.data.requests.length,
		},
	};
};

const runFoundationMaster = async (ctx: ExecutionContext, stageResult: MutableStageResult) => {
	const lookups = await requireOrganization(ctx, stageResult);
	await upsertOrganizationFoundation(ctx, stageResult, lookups);

	for (const agency of ctx.input.data.agencies) {
		const key = normalizeCode(agency.code);
		const existing = lookups.agenciesByCode.get(key);
		if (ctx.dryRun) {
			stageResult.counts[existing ? "updated" : "created"] += 1;
			registerDryRunAgency(ctx, agency);
			continue;
		}
		if (existing) {
			await ctx.prisma.agency.update({
				where: { id: existing.id },
				data: {
					name: agency.name,
					code: agency.code,
					status: agency.status || existing.status,
					metadata: agency.description
						? { ...(((existing.metadata as Record<string, any>) || {}) as Record<string, any>), description: agency.description }
						: existing.metadata,
				},
			});
			stageResult.counts.updated += 1;
		} else {
			await ctx.prisma.agency.create({
				data: {
					organizationId: ctx.input.config.organizationId,
					name: agency.name,
					code: agency.code,
					status: agency.status || "ACTIVE",
					metadata: agency.description ? { description: agency.description } : undefined,
				} as any,
			});
			stageResult.counts.created += 1;
		}
	}

	for (const item of ctx.input.data.calendarItems) {
		if (ctx.dryRun) {
			stageResult.counts.created += 1;
			continue;
		}

		const existing = await ctx.prisma.calendarItem.findFirst({
			where: {
				organizationId: ctx.input.config.organizationId,
				title: item.title,
				type: item.type as any,
				startDate: new Date(item.startDate as any),
			},
		});

		if (existing) {
			await ctx.prisma.calendarItem.update({
				where: { id: existing.id },
				data: {
					description: item.description,
					endDate: new Date(item.endDate as any),
					isAllDay: item.isAllDay,
					timezone: item.timezone,
					year: item.year,
					recurrence: item.recurrence,
					metadata: item.metadata,
					tags: item.tags,
					status: item.status as any,
				},
			});
			stageResult.counts.updated += 1;
		} else {
			await ctx.prisma.calendarItem.create({
				data: {
					organizationId: ctx.input.config.organizationId,
					title: item.title,
					description: item.description,
					type: item.type as any,
					startDate: new Date(item.startDate as any),
					endDate: new Date(item.endDate as any),
					isAllDay: item.isAllDay,
					timezone: item.timezone,
					year: item.year,
					recurrence: item.recurrence,
					metadata: item.metadata,
					tags: item.tags,
					status: item.status as any,
				},
			});
			stageResult.counts.created += 1;
		}
	}

	stageResult.reconciliation = {
		agencies: ctx.input.data.agencies.length,
		calendarItems: ctx.input.data.calendarItems.length,
	};
};

const runCoreConfiguration = async (ctx: ExecutionContext, stageResult: MutableStageResult) => {
	const lookups = await requireOrganization(ctx, stageResult);

	for (const calculator of ctx.input.data.calculators) {
		const existing =
			(calculator.code && lookups.calculatorsByCode.get(normalizeCode(calculator.code))) ||
			lookups.calculatorsByName.get(normalizeName(calculator.name));
		if (ctx.dryRun) {
			stageResult.counts[existing ? "updated" : "created"] += 1;
			registerDryRunCalculator(ctx, calculator);
			continue;
		}
		if (existing) {
			await ctx.prisma.calculator.update({
				where: { id: existing.id },
				data: {
					code: calculator.code,
					name: calculator.name,
					description: calculator.description,
					type: calculator.type as any,
					taxRates: calculator.taxRates,
					sssRates: calculator.sssRates,
					philHealthRates: calculator.philHealthRates,
					pagibigRates: calculator.pagibigRates,
					rateMultipliers: calculator.rateMultipliers,
					isActive: calculator.isActive,
					isDefault: calculator.isDefault,
				},
			});
			stageResult.counts.updated += 1;
		} else {
			await ctx.prisma.calculator.create({
				data: {
					organizationId: ctx.input.config.organizationId,
					code: calculator.code,
					name: calculator.name,
					description: calculator.description,
					type: calculator.type as any,
					taxRates: calculator.taxRates,
					sssRates: calculator.sssRates,
					philHealthRates: calculator.philHealthRates,
					pagibigRates: calculator.pagibigRates,
					rateMultipliers: calculator.rateMultipliers,
					isActive: calculator.isActive,
					isDefault: calculator.isDefault,
				},
			});
			stageResult.counts.created += 1;
		}
	}

	if (ctx.input.data.payrollCycleConfig) {
		const existing = await ctx.prisma.payrollCycleConfig.findFirst({
			where: { organizationId: ctx.input.config.organizationId, isDeleted: false },
		});
		if (ctx.dryRun) {
			stageResult.counts[existing ? "updated" : "created"] += 1;
		} else if (existing) {
			await ctx.prisma.payrollCycleConfig.update({
				where: { id: existing.id },
				data: {
					defaultPayFrequency: ctx.input.data.payrollCycleConfig.defaultPayFrequency as any,
					payDateOffsetDays: ctx.input.data.payrollCycleConfig.payDateOffsetDays,
					businessDayRule: ctx.input.data.payrollCycleConfig.businessDayRule as any,
					includeHolidaysInBusinessDayCheck:
						ctx.input.data.payrollCycleConfig.includeHolidaysInBusinessDayCheck,
					cycleRules: ctx.input.data.payrollCycleConfig.cycleRules,
				},
			});
			stageResult.counts.updated += 1;
		} else {
			await ctx.prisma.payrollCycleConfig.create({
				data: {
					organizationId: ctx.input.config.organizationId,
					defaultPayFrequency: ctx.input.data.payrollCycleConfig.defaultPayFrequency as any,
					payDateOffsetDays: ctx.input.data.payrollCycleConfig.payDateOffsetDays,
					businessDayRule: ctx.input.data.payrollCycleConfig.businessDayRule as any,
					includeHolidaysInBusinessDayCheck:
						ctx.input.data.payrollCycleConfig.includeHolidaysInBusinessDayCheck,
					cycleRules: ctx.input.data.payrollCycleConfig.cycleRules,
				},
			});
			stageResult.counts.created += 1;
		}
	}

	const updatedLookups = await refreshLookups(ctx);
	const periodOverlapErrors = detectOverlappingPeriods(
		[
			...Array.from(updatedLookups.payrollPeriodsByRange.values()).map((row) => ({
				startDate: new Date(row.startDate),
				endDate: new Date(row.endDate),
				label: row.code || row.name,
			})),
			...ctx.input.data.payrollPeriods.map((row) => ({
				startDate: new Date(row.startDate),
				endDate: new Date(row.endDate),
				label: row.code || row.name,
			})),
		].filter((row) => row.startDate && row.endDate),
	);
	if (periodOverlapErrors.length > 0) {
		stageResult.errors.push(...periodOverlapErrors);
		ctx.globalErrors.push(...periodOverlapErrors);
	}

	for (const payrollPeriod of ctx.input.data.payrollPeriods) {
		const calculator =
			(payrollPeriod.calculatorCode &&
				updatedLookups.calculatorsByCode.get(normalizeCode(payrollPeriod.calculatorCode))) ||
			null;
		const existing =
			updatedLookups.payrollPeriodsByCode.get(normalizeCode(payrollPeriod.code || payrollPeriod.name)) ||
			updatedLookups.payrollPeriodsByRange.get(
				payrollRangeKey(payrollPeriod.startDate, payrollPeriod.endDate),
			);
		if (ctx.dryRun) {
			stageResult.counts[existing ? "updated" : "created"] += 1;
			registerDryRunPayrollPeriod(ctx, payrollPeriod, calculator?.id || null);
			continue;
		}
		const payload = {
			name: payrollPeriod.name,
			code: payrollPeriod.code,
			payFrequency: payrollPeriod.payFrequency as any,
			periodNumber: payrollPeriod.periodNumber,
			startDate: new Date(payrollPeriod.startDate as any),
			endDate: new Date(payrollPeriod.endDate as any),
			payDate: new Date(payrollPeriod.payDate as any),
			calculatorId: calculator?.id || null,
			status: (payrollPeriod.status || "DRAFT") as any,
			cutoffDay: payrollPeriod.cutoffDay,
			notes: payrollPeriod.notes,
			generationMetadata: payrollPeriod.generationMetadata,
		};
		if (existing) {
			await ctx.prisma.payrollPeriod.update({ where: { id: existing.id }, data: payload });
			stageResult.counts.updated += 1;
		} else {
			await ctx.prisma.payrollPeriod.create({
				data: {
					organizationId: ctx.input.config.organizationId,
					...payload,
				},
			});
			stageResult.counts.created += 1;
		}
	}

	for (const leavePolicy of ctx.input.data.leavePolicies) {
		const leaveTypeCode = String(leavePolicy.leaveType || "")
			.trim()
			.toUpperCase()
			.replace(/[^A-Z0-9]+/g, "_")
			.replace(/^_+|_+$/g, "");
		const existing = await ctx.prisma.leaveType.findFirst({
			where: {
				organizationId: ctx.input.config.organizationId,
				code: leaveTypeCode,
			},
		});
		if (ctx.dryRun) {
			stageResult.counts[existing ? "updated" : "created"] += 1;
			continue;
		}
		const payload = {
			code: leaveTypeCode,
			name: existing?.name || leaveTypeCode.replace(/_/g, " "),
			description: existing?.description || `Imported leave policy for ${leaveTypeCode}.`,
			sortOrder: existing?.sortOrder ?? 0,
			isActive: existing?.isActive ?? true,
			enabled: leavePolicy.enabled,
			isPaid: leavePolicy.isPaid,
			requiresApproval: leavePolicy.requiresApproval,
			minAdvanceNoticeDays: leavePolicy.minAdvanceNoticeDays,
			maxDaysPerRequest: leavePolicy.maxDaysPerRequest,
			allowHalfDay: leavePolicy.allowHalfDay,
			requireAttachment: leavePolicy.requireAttachment,
			allowedEmploymentTypes: leavePolicy.allowedEmploymentTypes as any,
		};
		if (existing) {
			await ctx.prisma.leaveType.update({ where: { id: existing.id }, data: payload });
			stageResult.counts.updated += 1;
		} else {
			await ctx.prisma.leaveType.create({
				data: {
					organizationId: ctx.input.config.organizationId,
					...payload,
				},
			});
			stageResult.counts.created += 1;
		}
	}

	for (const timesheetConfig of ctx.input.data.timesheetConfigs) {
		const existing = await ctx.prisma.timesheetConfig.findFirst({
			where: { organizationId: ctx.input.config.organizationId },
		});
		if (ctx.dryRun) {
			stageResult.counts[existing ? "updated" : "created"] += 1;
			continue;
		}
		const payload = {
			enableAutoApprove: timesheetConfig.enableAutoApprove,
			enableEditBeforeSubmission: timesheetConfig.enableEditBeforeSubmission,
			rejectBehavior: timesheetConfig.rejectBehavior as any,
			overtimeFlagThresholdMinutes: timesheetConfig.overtimeFlagThresholdMinutes,
		};
		if (existing) {
			await ctx.prisma.timesheetConfig.update({ where: { id: existing.id }, data: payload });
			stageResult.counts.updated += 1;
		} else {
			await ctx.prisma.timesheetConfig.create({
				data: {
					organizationId: ctx.input.config.organizationId,
					...payload,
				},
			});
			stageResult.counts.created += 1;
		}
	}

	const latestLookups = await refreshLookups(ctx);

	for (const documentType of ctx.input.data.documentTypes) {
		const existing = latestLookups.documentTypesByCode.get(normalizeCode(documentType.code));
		if (ctx.dryRun) {
			stageResult.counts[existing ? "updated" : "created"] += 1;
			registerDryRunDocumentType(ctx, documentType);
			continue;
		}
		if (existing) {
			await ctx.prisma.documentType.update({
				where: { id: existing.id },
				data: {
					name: documentType.name,
					category: documentType.category,
					uploadBy: documentType.uploadBy,
					isRequired: documentType.isRequired,
					isEmployeeVisible: documentType.isEmployeeVisible,
					isActive: documentType.isActive,
					displayOrder: documentType.displayOrder,
					fields: documentType.fields,
					metadata: documentType.metadata,
				},
			});
			stageResult.counts.updated += 1;
		} else {
			await ctx.prisma.documentType.create({
				data: {
					organizationId: ctx.input.config.organizationId,
					code: documentType.code,
					name: documentType.name,
					category: documentType.category,
					uploadBy: documentType.uploadBy,
					isRequired: documentType.isRequired,
					isEmployeeVisible: documentType.isEmployeeVisible,
					isActive: documentType.isActive,
					displayOrder: documentType.displayOrder,
					fields: documentType.fields,
					metadata: documentType.metadata,
				},
			});
			stageResult.counts.created += 1;
		}
	}

	for (const benefitType of ctx.input.data.benefitTypes) {
		const existing = latestLookups.benefitTypesByName.get(normalizeName(benefitType.name));
		if (ctx.dryRun) {
			stageResult.counts[existing ? "updated" : "created"] += 1;
			registerDryRunBenefitType(ctx, benefitType);
			continue;
		}
		const payload = {
			code: normalizeCode(benefitType.code) || deriveCodeFromName(benefitType.name),
			name: benefitType.name,
			description: benefitType.description,
			category: benefitType.category as any,
			provider: benefitType.provider,
			coverage: benefitType.coverage,
			minAmount: benefitType.minAmount,
			maxAmount: benefitType.maxAmount,
			fixedAmount: benefitType.fixedAmount,
			percentage: benefitType.percentage,
			minServiceMonths: benefitType.minServiceMonths,
			isTaxable: benefitType.isTaxable,
			defaultInstallments: benefitType.defaultInstallments,
			payrollCycleDays: benefitType.payrollCycleDays,
			requireTermsAgreement: benefitType.requireTermsAgreement,
			isActive: benefitType.isActive,
			isDefault: benefitType.isDefault,
		};
		if (existing) {
			await ctx.prisma.benefitType.update({ where: { id: existing.id }, data: payload });
			stageResult.counts.updated += 1;
		} else {
			await ctx.prisma.benefitType.create({
				data: {
					organizationId: ctx.input.config.organizationId,
					...payload,
				},
			});
			stageResult.counts.created += 1;
		}
	}

	for (const loanType of ctx.input.data.loanTypes) {
		const existing = latestLookups.loanTypesByName.get(normalizeName(loanType.name));
		if (ctx.dryRun) {
			stageResult.counts[existing ? "updated" : "created"] += 1;
			registerDryRunLoanType(ctx, loanType);
			continue;
		}
		const payload = {
			name: loanType.name,
			description: loanType.description,
			category: loanType.category as any,
			maxAmount: loanType.maxAmount,
			minAmount: loanType.minAmount,
			interestRate: loanType.interestRate,
			maxTermMonths: loanType.maxTermMonths,
			minServiceMonths: loanType.minServiceMonths,
			isActive: loanType.isActive,
		};
		if (existing) {
			await ctx.prisma.loanType.update({ where: { id: existing.id }, data: payload });
			stageResult.counts.updated += 1;
		} else {
			await ctx.prisma.loanType.create({
				data: {
					organizationId: ctx.input.config.organizationId,
					...payload,
				},
			});
			stageResult.counts.created += 1;
		}
	}

	if (ctx.input.data.workflowConfigs.length > 0) {
		if (ctx.dryRun) {
			stageResult.counts.updated += ctx.input.data.workflowConfigs.length;
		} else {
			let branding = latestLookups.organization?.branding || {};
			for (const workflowConfig of ctx.input.data.workflowConfigs) {
				branding = setWorkflowConfigInBranding(branding, workflowConfig as any);
				stageResult.counts.updated += 1;
			}
			await ctx.prisma.organization.update({
				where: { id: ctx.input.config.organizationId },
				data: { branding },
			});
		}
	}

	stageResult.reconciliation = {
		calculators: ctx.input.data.calculators.length,
		payrollPeriods: ctx.input.data.payrollPeriods.length,
		workflowConfigs: ctx.input.data.workflowConfigs.length,
		leavePolicies: ctx.input.data.leavePolicies.length,
		documentTypes: ctx.input.data.documentTypes.length,
	};
};

const runWorkPatternMaster = async (ctx: ExecutionContext, stageResult: MutableStageResult) => {
	const lookups = await requireOrganization(ctx, stageResult);

	for (const shiftType of ctx.input.data.shiftTypes) {
		const existing = lookups.shiftTypesByCode.get(normalizeCode(shiftType.code));
		if (ctx.dryRun) {
			stageResult.counts[existing ? "updated" : "created"] += 1;
			registerDryRunShiftType(ctx, shiftType);
			continue;
		}
		if (existing) {
			await ctx.prisma.shiftType.update({
				where: { id: existing.id },
				data: {
					name: shiftType.name,
					isOvernight: shiftType.isOvernight,
					isOff: shiftType.isOff,
					timeSlots: shiftType.timeSlots,
					isActive: shiftType.isActive,
				},
			});
			stageResult.counts.updated += 1;
		} else {
			await ctx.prisma.shiftType.create({
				data: {
					organizationId: ctx.input.config.organizationId,
					code: shiftType.code,
					name: shiftType.name,
					isOvernight: shiftType.isOvernight,
					isOff: shiftType.isOff,
					timeSlots: shiftType.timeSlots,
					isActive: shiftType.isActive,
				},
			});
			stageResult.counts.created += 1;
		}
	}

	for (const template of ctx.input.data.scheduleTemplates) {
		const existing = lookups.scheduleTemplatesByCode.get(normalizeCode(template.code));
		if (ctx.dryRun) {
			stageResult.counts[existing ? "updated" : "created"] += 1;
			registerDryRunScheduleTemplate(ctx, template);
			continue;
		}
		if (existing) {
			await ctx.prisma.scheduleTemplate.update({
				where: { id: existing.id },
				data: {
					name: template.name,
					description: template.description,
					cycleDays: template.cycleDays,
					graceLateMinutes: template.graceLateMinutes,
					graceEarlyOutMinutes: template.graceEarlyOutMinutes,
					pattern: template.pattern,
					isActive: template.isActive,
				},
			});
			stageResult.counts.updated += 1;
		} else {
			await ctx.prisma.scheduleTemplate.create({
				data: {
					organizationId: ctx.input.config.organizationId,
					code: template.code,
					name: template.name,
					description: template.description,
					cycleDays: template.cycleDays,
					graceLateMinutes: template.graceLateMinutes,
					graceEarlyOutMinutes: template.graceEarlyOutMinutes,
					pattern: template.pattern,
					isActive: template.isActive,
				},
			});
			stageResult.counts.created += 1;
		}
	}

	stageResult.reconciliation = {
		shiftTypes: ctx.input.data.shiftTypes.length,
		scheduleTemplates: ctx.input.data.scheduleTemplates.length,
	};
};

const runOrgStructureSkeleton = async (ctx: ExecutionContext, stageResult: MutableStageResult) => {
	let lookups = await requireOrganization(ctx, stageResult);

	for (const level of ctx.input.data.levels) {
		const existing = lookups.levelsByName.get(normalizeName(level.name));
		if (ctx.dryRun) {
			stageResult.counts[existing ? "updated" : "created"] += 1;
			registerDryRunLevel(ctx, level);
			continue;
		}
		if (existing) {
			await ctx.prisma.level.update({
				where: { id: existing.id },
				data: {
					rank: level.rank,
					description: level.description,
				},
			});
			stageResult.counts.updated += 1;
		} else {
			await ctx.prisma.level.create({
				data: {
					organizationId: ctx.input.config.organizationId,
					name: level.name,
					rank: level.rank,
					description: level.description,
				},
			});
			stageResult.counts.created += 1;
		}
	}

	lookups = await refreshLookups(ctx);

	for (const department of ctx.input.data.departments) {
		const existing = lookups.departmentsByCode.get(normalizeCode(department.code));
		if (ctx.dryRun) {
			stageResult.counts[existing ? "updated" : "created"] += 1;
			registerDryRunDepartment(ctx, department);
			continue;
		}
		if (existing) {
			await ctx.prisma.department.update({
				where: { id: existing.id },
				data: {
					name: department.name,
					description: department.description,
				},
			});
			stageResult.counts.updated += 1;
		} else {
			await ctx.prisma.department.create({
				data: {
					organizationId: ctx.input.config.organizationId,
					name: department.name,
					code: department.code,
					description: department.description,
				},
			});
			stageResult.counts.created += 1;
		}
	}

	lookups = await refreshLookups(ctx);

	if (!ctx.dryRun) {
		for (const department of ctx.input.data.departments) {
			if (!department.parentCode) continue;
			const current = lookups.departmentsByCode.get(normalizeCode(department.code));
			const parent = lookups.departmentsByCode.get(normalizeCode(department.parentCode));
			if (!current || !parent) {
				const message = `Department parent link failed for ${department.code} -> ${department.parentCode}.`;
				stageResult.errors.push(message);
				ctx.globalErrors.push(message);
				continue;
			}
			await ctx.prisma.department.update({
				where: { id: current.id },
				data: { parentId: parent.id },
			});
		}
	}

	for (const position of ctx.input.data.positions) {
		const existing = lookups.positionsByCode.get(normalizeCode(position.code));
		if (ctx.dryRun) {
			stageResult.counts[existing ? "updated" : "created"] += 1;
			registerDryRunPosition(ctx, position);
			continue;
		}
		const payload = {
			title: position.title,
			description: position.description,
			minSalary: position.minSalary,
			maxSalary: position.maxSalary,
		};
		if (existing) {
			await ctx.prisma.position.update({ where: { id: existing.id }, data: payload });
			stageResult.counts.updated += 1;
		} else {
			await ctx.prisma.position.create({
				data: {
					organizationId: ctx.input.config.organizationId,
					code: position.code,
					...payload,
				},
			});
			stageResult.counts.created += 1;
		}
	}

	lookups = await refreshLookups(ctx);

	for (const mapping of ctx.input.data.positionLevels) {
		const position = lookups.positionsByCode.get(normalizeCode(mapping.positionCode));
		const level = lookups.levelsByName.get(normalizeName(mapping.levelName));
		if (!position || !level) {
			pushStageError(
				ctx,
				stageResult,
				`Position-level mapping missing prerequisite: ${mapping.positionCode}/${mapping.levelName}.`,
				{
					row: mapping,
					field: !position ? "positionCode" : "levelName",
				},
			);
			continue;
		}
		const existing = await ctx.prisma.positionLevel.findFirst({
			where: { positionId: position.id, levelId: level.id },
		});
		if (ctx.dryRun) {
			stageResult.counts[existing ? "skipped" : "created"] += 1;
			continue;
		}
		if (existing) {
			stageResult.counts.skipped += 1;
		} else {
			await ctx.prisma.positionLevel.create({
				data: { positionId: position.id, levelId: level.id },
			});
			stageResult.counts.created += 1;
		}
	}

	for (const link of ctx.input.data.departmentScheduleLinks) {
		const department = lookups.departmentsByCode.get(normalizeCode(link.departmentCode));
		const scheduleTemplate = lookups.scheduleTemplatesByCode.get(
			normalizeCode(link.scheduleTemplateCode),
		);
		if (!department || !scheduleTemplate) {
			pushStageError(
				ctx,
				stageResult,
				`Department schedule link missing prerequisite: ${link.departmentCode}/${link.scheduleTemplateCode}.`,
				{
					row: link,
					field: !department ? "departmentCode" : "scheduleTemplateCode",
				},
			);
			continue;
		}
		const existing = await ctx.prisma.departmentScheduleTemplate.findFirst({
			where: {
				departmentId: department.id,
				scheduleTemplateId: scheduleTemplate.id,
				isDeleted: false,
			},
		});
		if (ctx.dryRun) {
			stageResult.counts[existing ? "updated" : "created"] += 1;
			continue;
		}
		if (existing) {
			await ctx.prisma.departmentScheduleTemplate.update({
				where: { id: existing.id },
				data: {
					source: link.source as any,
					isActive: link.isActive,
				},
			});
			stageResult.counts.updated += 1;
		} else {
			await ctx.prisma.departmentScheduleTemplate.create({
				data: {
					organizationId: ctx.input.config.organizationId,
					departmentId: department.id,
					scheduleTemplateId: scheduleTemplate.id,
					source: link.source as any,
					isActive: link.isActive,
				},
			});
			stageResult.counts.created += 1;
		}
	}

	stageResult.reconciliation = {
		departments: ctx.input.data.departments.length,
		levels: ctx.input.data.levels.length,
		positions: ctx.input.data.positions.length,
		positionLevels: ctx.input.data.positionLevels.length,
		departmentScheduleLinks: ctx.input.data.departmentScheduleLinks.length,
	};
};

const resolvePersonForEmployee = (
	persons: EnterpriseMigrationData["persons"],
	row: EnterpriseMigrationData["employees"][number],
) => {
	if (row.personEmployeeId) {
		return persons.find((person) => person.employeeId === row.personEmployeeId) || null;
	}
	if (row.personReference) {
		return (
			persons.find(
				(person) => person.sourcePersonKey === row.personReference || person.userId === row.personReference,
			) || null
		);
	}
	return persons.find((person) => person.employeeId === row.employeeId) || null;
};

const runIdentityMaster = async (ctx: ExecutionContext, stageResult: MutableStageResult) => {
	await requireOrganization(ctx, stageResult);

	for (const person of ctx.input.data.persons) {
		let existing: any | null = null;
		if (person.employeeId) {
			existing = await ctx.prisma.person.findFirst({
				where: {
					organizationId: ctx.input.config.organizationId,
					employeeId: person.employeeId,
					isDeleted: false,
				},
			});
		}
		if (!existing && person.userId) {
			existing = await ctx.prisma.person.findFirst({
				where: {
					organizationId: ctx.input.config.organizationId,
					userId: person.userId,
					isDeleted: false,
				},
			});
		}

		const metadata = {
			...((person.metadata as Record<string, any>) || {}),
			sourcePersonKey: person.sourcePersonKey || undefined,
		};

		if (ctx.dryRun) {
			stageResult.counts[existing ? "updated" : "created"] += 1;
			continue;
		}
		if (existing) {
			await ctx.prisma.person.update({
				where: { id: existing.id },
				data: {
					employeeId: person.employeeId || existing.employeeId,
					userId: person.userId || existing.userId,
					personalInfo: person.personalInfo,
					contactInfo: person.contactInfo,
					identification: person.identification,
					metadata,
				},
			});
			stageResult.counts.updated += 1;
		} else {
			await ctx.prisma.person.create({
				data: {
					organizationId: ctx.input.config.organizationId,
					employeeId: person.employeeId,
					userId: person.userId,
					personalInfo: person.personalInfo,
					contactInfo: person.contactInfo,
					identification: person.identification,
					metadata,
				},
			});
			stageResult.counts.created += 1;
		}
	}

	stageResult.reconciliation = {
		persons: ctx.input.data.persons.length,
	};
};

const runEmploymentBase = async (ctx: ExecutionContext, stageResult: MutableStageResult) => {
	let lookups = await requireOrganization(ctx, stageResult);
	const accountSummary = emptyEmploymentAccountSummary();
	const defaultPassword = resolveMigrationDefaultPassword();

	for (const employee of ctx.input.data.employees) {
		const department = lookups.departmentsByCode.get(normalizeCode(employee.departmentCode));
		const position = lookups.positionsByCode.get(normalizeCode(employee.positionCode));
		const level = employee.levelName
			? lookups.levelsByName.get(normalizeName(employee.levelName))
			: null;
		const agency = employee.agencyCode
			? lookups.agenciesByCode.get(normalizeCode(employee.agencyCode))
			: null;

		if (!department || !position) {
			pushStageError(
				ctx,
				stageResult,
				`Employee ${employee.employeeId} missing department/position prerequisite.`,
				{
					row: employee,
					field: !department ? "departmentCode" : "positionCode",
				},
			);
			continue;
		}

		let person =
			lookups.personsByEmployeeId.get(employee.personEmployeeId || employee.employeeId) || null;
		if (!person) {
			const payloadPerson = resolvePersonForEmployee(ctx.input.data.persons, employee);
			if (payloadPerson && ctx.dryRun) {
				registerDryRunPerson(ctx, payloadPerson);
				person =
					lookups.personsByEmployeeId.get(payloadPerson.employeeId || employee.employeeId) || null;
			} else if (payloadPerson) {
				person = await ctx.prisma.person.create({
					data: {
						organizationId: ctx.input.config.organizationId,
						employeeId: payloadPerson.employeeId || employee.employeeId,
						userId: payloadPerson.userId,
						personalInfo: payloadPerson.personalInfo,
						contactInfo: payloadPerson.contactInfo,
						identification: payloadPerson.identification,
						metadata: {
							...((payloadPerson.metadata as Record<string, any>) || {}),
							sourcePersonKey: payloadPerson.sourcePersonKey || undefined,
						},
					},
				});
				stageResult.counts.created += 1;
				lookups = await refreshLookups(ctx);
			}
		}

		if (!person) {
			pushStageError(ctx, stageResult, `Employee ${employee.employeeId} has no resolvable person record.`, {
				row: employee,
				field: employee.personEmployeeId ? "personEmployeeId" : "employeeId",
			});
			continue;
		}

		if (typeof employee.basicSalary !== "number" || !Number.isFinite(employee.basicSalary)) {
			const message = `Employee ${employee.employeeId} has invalid basicSalary. Provide a positive number or derive it from position.minSalary before EMPLOYMENT_BASE writes.`;
			stageResult.errors.push(message);
			ctx.globalErrors.push(message);
			stageResult.counts.failed += 1;
			continue;
		}

		if (employee.basicSalary <= 0) {
			const message = `Employee ${employee.employeeId} has non-positive basicSalary ${employee.basicSalary}. Salary must be greater than 0 before EMPLOYMENT_BASE writes.`;
			stageResult.errors.push(message);
			ctx.globalErrors.push(message);
			stageResult.counts.failed += 1;
			continue;
		}

		const existing = lookups.employeesByEmployeeId.get(employee.employeeId);
		let resolvedUserId = existing?.userId || person.userId || null;
		const personEmail = getContactEmail(person.contactInfo);
		const firstName = getPersonalName(person.personalInfo, "firstName");
		const lastName = getPersonalName(person.personalInfo, "lastName");

		if (!isValidEmailAddress(personEmail)) {
			pushStageWarning(
				ctx,
				stageResult,
				`Employee ${employee.employeeId} is missing a valid person email. Account creation was skipped.`,
				{
					row: employee,
					field: "employeeId",
				},
			);
			accountSummary.skippedMissingEmail += 1;
		} else {
			const userName = buildSafeUserName({
				email: personEmail,
				firstName,
				lastName,
			});
			const existingUserId =
				typeof existing?.userId === "string" && existing.userId.trim().length > 0
					? existing.userId
					: typeof person.userId === "string" && person.userId.trim().length > 0
						? person.userId
						: null;

			if (ctx.dryRun) {
				const existingUser =
					(existingUserId
						? await ctx.prisma.user.findFirst({
								where: { id: existingUserId, isDeleted: false },
								select: { id: true },
							})
						: null) ||
					(await ctx.prisma.user.findFirst({
						where: {
							OR: [{ email: personEmail }, { userName }],
						},
						select: { id: true },
					}));
				resolvedUserId = existingUser?.id || existingUserId || buildDryRunId("user", personEmail);
				if (existingUser) {
					accountSummary.reused += 1;
				} else {
					accountSummary.created += 1;
				}
				accountSummary.linkedEmployees += 1;
			} else {
				const localUser = await ensureLocalUserAccount({
					prisma: ctx.prisma,
					email: personEmail,
					userName,
					password: defaultPassword,
					role: DEFAULT_MIGRATION_EMPLOYEE_ROLE,
					organizationId: ctx.input.config.organizationId,
					existingUserId,
					metadata: {
						source: "enterprise-csv-migration",
						requirePasswordChange: true,
						isFirstLogin: true,
						defaultPasswordSource: process.env.MIGRATION_DEFAULT_PASSWORD
							? "env:MIGRATION_DEFAULT_PASSWORD"
							: "default:Password123!",
					},
				});
				resolvedUserId = localUser.userId;
				if (localUser.created) {
					accountSummary.created += 1;
				} else {
					accountSummary.reused += 1;
				}
				accountSummary.linkedEmployees += 1;

				if (person.userId !== localUser.userId) {
					person = await ctx.prisma.person.update({
						where: { id: person.id },
						data: { userId: localUser.userId },
					});
					lookups = await refreshLookups(ctx);
				}
			}
		}

		const payload = {
			role: employee.role || DEFAULT_MIGRATION_EMPLOYEE_ROLE,
			departmentId: department.id,
			positionId: position.id,
			levelId: level?.id || null,
			personId: person.id,
			userId: resolvedUserId,
			basicSalary: employee.basicSalary,
			currency: employee.currency,
			payFrequency: employee.payFrequency as any,
			employmentType: employee.employmentType as any,
			employmentStatus: employee.employmentStatus as any,
			workLocation: employee.workLocation as any,
			employmentHireDate: employee.employmentHireDate ? new Date(employee.employmentHireDate as any) : null,
			employmentStartDate: employee.employmentStartDate ? new Date(employee.employmentStartDate as any) : null,
			employmentTerminationDate: employee.employmentTerminationDate
				? new Date(employee.employmentTerminationDate as any)
				: null,
			deviceEmpId: employee.deviceEmpId,
			agencyId: agency?.id || null,
			leaveBalances: employee.leaveBalances || [],
			employmentHistory: employee.employmentHistory || [],
			metadata: employee.metadata,
		};

		if (ctx.dryRun) {
			stageResult.counts[existing ? "updated" : "created"] += 1;
			registerDryRunEmployee({
				ctx,
				employee,
				departmentId: department.id,
				positionId: position.id,
				levelId: level?.id || null,
				personId: person.id,
				agencyId: agency?.id || null,
			});
			continue;
		}
		if (existing) {
			await ctx.prisma.employee.update({ where: { id: existing.id }, data: payload });
			stageResult.counts.updated += 1;
		} else {
			await ctx.prisma.employee.create({
				data: {
					organizationId: ctx.input.config.organizationId,
					employeeId: employee.employeeId,
					...payload,
				},
			});
			stageResult.counts.created += 1;
		}
	}

	stageResult.reconciliation = {
		employees: ctx.input.data.employees.length,
		accounts: accountSummary,
	};
};

const runEmploymentRelationshipPatch = async (
	ctx: ExecutionContext,
	stageResult: MutableStageResult,
) => {
	let lookups = await requireOrganization(ctx, stageResult);

	const cycles = detectReportingCycles(ctx.input.data.reportingLines);
	if (cycles.length > 0) {
		const messages = cycles.map((cycle) => `Reporting cycle detected: ${cycle}`);
		stageResult.errors.push(...messages);
		ctx.globalErrors.push(...messages);
		return;
	}

	for (const line of ctx.input.data.reportingLines) {
		if (line.employeeId === line.reportToEmployeeId) {
			const message = `Employee ${line.employeeId} cannot report to itself.`;
			stageResult.errors.push(message);
			ctx.globalErrors.push(message);
			stageResult.counts.failed += 1;
			continue;
		}
		const employee = lookups.employeesByEmployeeId.get(line.employeeId);
		const manager = lookups.employeesByEmployeeId.get(line.reportToEmployeeId);
		if (!employee || !manager) {
			pushStageError(
				ctx,
				stageResult,
				`Reporting line missing employee or manager: ${line.employeeId} -> ${line.reportToEmployeeId}.`,
				{
					row: line,
					field: !employee ? "employeeId" : "reportToEmployeeId",
				},
			);
			continue;
		}
		if (ctx.dryRun) {
			stageResult.counts.updated += 1;
			continue;
		}
		await ctx.prisma.employee.update({
			where: { id: employee.id },
			data: { reportToId: manager.id },
		});
		stageResult.counts.updated += 1;
	}

	for (const managerLink of ctx.input.data.departmentManagers) {
		const department = lookups.departmentsByCode.get(normalizeCode(managerLink.departmentCode));
		const manager = lookups.employeesByEmployeeId.get(managerLink.managerEmployeeId);
		if (!department || !manager) {
			pushStageError(
				ctx,
				stageResult,
				`Department manager link missing prerequisite: ${managerLink.departmentCode}/${managerLink.managerEmployeeId}.`,
				{
					row: managerLink,
					field: !department ? "departmentCode" : "managerEmployeeId",
				},
			);
			continue;
		}
		if (ctx.dryRun) {
			stageResult.counts.updated += 1;
			continue;
		}
		await ctx.prisma.department.update({
			where: { id: department.id },
			data: { managerId: manager.id },
		});
		stageResult.counts.updated += 1;
	}

	lookups = await refreshLookups(ctx);

	for (const override of ctx.input.data.scheduleOverrides) {
		const employee = lookups.employeesByEmployeeId.get(override.employeeId);
		const shiftType = lookups.shiftTypesByCode.get(normalizeCode(override.shiftTypeCode));
		const actor = override.createdByEmployeeId
			? lookups.employeesByEmployeeId.get(override.createdByEmployeeId)
			: null;
		if (!employee || !shiftType) {
			pushStageError(
				ctx,
				stageResult,
				`Schedule override missing employee or shift: ${override.employeeId}/${override.shiftTypeCode}.`,
				{
					row: override,
					field: !employee ? "employeeId" : "shiftTypeCode",
				},
			);
			continue;
		}
		const date = new Date(override.date as any);
		const existing = await ctx.prisma.scheduleOverride.findFirst({
			where: {
				organizationId: ctx.input.config.organizationId,
				employeeId: employee.id,
				date,
				isDeleted: false,
			},
		});
		if (ctx.dryRun) {
			stageResult.counts[existing ? "updated" : "created"] += 1;
			ctx.dryRunState?.scheduleOverridesByKey.set(
				scheduleOverrideKey(employee.id, override.date),
				existing || {
					id: buildDryRunId("schedule-override", scheduleOverrideKey(employee.id, override.date)),
					employeeId: employee.id,
					date,
				},
			);
			continue;
		}
		const payload = {
			shiftTypeId: shiftType.id,
			reason: override.reason,
			createdByEmployeeId: actor?.id || null,
		};
		if (existing) {
			await ctx.prisma.scheduleOverride.update({ where: { id: existing.id }, data: payload });
			stageResult.counts.updated += 1;
		} else {
			await ctx.prisma.scheduleOverride.create({
				data: {
					organizationId: ctx.input.config.organizationId,
					employeeId: employee.id,
					date,
					...payload,
				},
			});
			stageResult.counts.created += 1;
		}
	}

	for (const history of ctx.input.data.employeeScheduleHistories) {
		const employee = lookups.employeesByEmployeeId.get(history.employeeId);
		const actor = history.actorEmployeeId
			? lookups.employeesByEmployeeId.get(history.actorEmployeeId)
			: null;
		if (!employee) {
			pushStageError(ctx, stageResult, `Schedule history missing employee ${history.employeeId}.`, {
				row: history,
				field: "employeeId",
			});
			continue;
		}
		const existing = await ctx.prisma.employeeScheduleHistory.findFirst({
			where: {
				organizationId: ctx.input.config.organizationId,
				employeeId: employee.id,
				action: history.action,
				effectiveAt: history.effectiveAt ? new Date(history.effectiveAt as any) : null,
			},
		});
		if (ctx.dryRun) {
			stageResult.counts[existing ? "skipped" : "created"] += 1;
			ctx.dryRunState?.employeeScheduleHistoriesByKey.set(
				employeeScheduleHistoryKey(employee.id, history.action, history.effectiveAt),
				existing || {
					id: buildDryRunId(
						"employee-schedule-history",
						employeeScheduleHistoryKey(employee.id, history.action, history.effectiveAt),
					),
					employeeId: employee.id,
				},
			);
			continue;
		}
		if (existing) {
			stageResult.counts.skipped += 1;
		} else {
			await ctx.prisma.employeeScheduleHistory.create({
				data: {
					organizationId: ctx.input.config.organizationId,
					employeeId: employee.id,
					action: history.action,
					effectiveAt: history.effectiveAt ? new Date(history.effectiveAt as any) : null,
					actorEmployeeId: actor?.id || null,
					reason: history.reason,
					beforeSchedule: history.beforeSchedule,
					afterSchedule: history.afterSchedule,
					metadata: history.metadata,
				},
			});
			stageResult.counts.created += 1;
		}
	}

	for (const termination of ctx.input.data.terminations) {
		const employee = lookups.employeesByEmployeeId.get(termination.employeeId);
		const initiator = lookups.employeesByEmployeeId.get(termination.initiatedByEmployeeId);
		const hrDirector = termination.hrDirectorEmployeeId
			? lookups.employeesByEmployeeId.get(termination.hrDirectorEmployeeId)
			: null;
		const legalApprover = termination.legalApproverEmployeeId
			? lookups.employeesByEmployeeId.get(termination.legalApproverEmployeeId)
			: null;
		if (!employee || !initiator) {
			const message = `Termination missing employee or initiator: ${termination.terminationNumber}.`;
			stageResult.errors.push(message);
			ctx.globalErrors.push(message);
			stageResult.counts.failed += 1;
			continue;
		}
		const existing = await ctx.prisma.termination.findFirst({
			where: { terminationNumber: termination.terminationNumber },
		});
		if (ctx.dryRun) {
			stageResult.counts[existing ? "updated" : "created"] += 1;
			continue;
		}
		const payload = {
			employeeId: employee.id,
			initiatedById: initiator.id,
			terminationType: termination.terminationType as any,
			status: termination.status as any,
			terminationDate: new Date(termination.terminationDate as any),
			lastWorkingDay: new Date(termination.lastWorkingDay as any),
			reason: termination.reason,
			severancePackage: termination.severancePackage,
			supportingDocuments: termination.supportingDocuments,
			hrDirectorApprovedAt: termination.hrDirectorApprovedAt
				? new Date(termination.hrDirectorApprovedAt as any)
				: null,
			hrDirectorId: hrDirector?.id || null,
			hrDirectorComments: termination.hrDirectorComments,
			legalApprovalRequired: termination.legalApprovalRequired,
			legalApprovedAt: termination.legalApprovedAt
				? new Date(termination.legalApprovedAt as any)
				: null,
			legalApproverId: legalApprover?.id || null,
			legalComments: termination.legalComments,
			processingStartedAt: termination.processingStartedAt
				? new Date(termination.processingStartedAt as any)
				: null,
			processingCompletedAt: termination.processingCompletedAt
				? new Date(termination.processingCompletedAt as any)
				: null,
			finalPayCalculated: termination.finalPayCalculated,
			clearanceCompleted: termination.clearanceCompleted,
			terminationLetterPath: termination.terminationLetterPath,
		};
		if (existing) {
			await ctx.prisma.termination.update({ where: { id: existing.id }, data: payload });
			stageResult.counts.updated += 1;
		} else {
			await ctx.prisma.termination.create({
				data: {
					organizationId: ctx.input.config.organizationId,
					terminationNumber: termination.terminationNumber,
					...payload,
				},
			});
			stageResult.counts.created += 1;
		}
	}

	stageResult.reconciliation = {
		reportingLines: ctx.input.data.reportingLines.length,
		departmentManagers: ctx.input.data.departmentManagers.length,
		scheduleOverrides: ctx.input.data.scheduleOverrides.length,
		scheduleHistories: ctx.input.data.employeeScheduleHistories.length,
		terminations: ctx.input.data.terminations.length,
	};
};

const mergeLeaveBalanceRows = (existing: any, incoming: Array<Record<string, any>>) => {
	const current = Array.isArray(existing) ? [...existing] : [];
	const keyToIndex = new Map<string, number>();
	current.forEach((entry: any, index) => {
		keyToIndex.set(`${String(entry.leaveType || "")}::${dateOnlyKey(entry.asOfDate)}`, index);
	});
	for (const row of incoming) {
		const key = `${String(row.leaveType || "")}::${dateOnlyKey(row.asOfDate)}`;
		if (keyToIndex.has(key)) {
			current[keyToIndex.get(key)!] = row;
		} else {
			current.push(row);
		}
	}
	return current;
};

const runEmployeeAttachmentOpeningBalance = async (
	ctx: ExecutionContext,
	stageResult: MutableStageResult,
) => {
	let lookups = await requireOrganization(ctx, stageResult);

	for (const folder of ctx.input.data.documentFolders) {
		const employee = lookups.employeesByEmployeeId.get(folder.employeeId);
		if (!employee) {
			pushStageError(ctx, stageResult, `Document folder missing employee ${folder.employeeId}.`, {
				row: folder,
				field: "employeeId",
			});
			continue;
		}
		const existing = await ctx.prisma.documentFolder.findFirst({
			where: { employeeId: employee.id, name: folder.name, isDeleted: false },
		});
		if (ctx.dryRun) {
			stageResult.counts[existing ? "skipped" : "created"] += 1;
			ctx.dryRunState?.documentFoldersByKey.set(
				documentFolderKey(employee.id, folder.name),
				existing || {
					id: buildDryRunId("document-folder", documentFolderKey(employee.id, folder.name)),
					employeeId: employee.id,
					name: folder.name,
				},
			);
			continue;
		}
		if (existing) {
			stageResult.counts.skipped += 1;
		} else {
			await ctx.prisma.documentFolder.create({ data: { employeeId: employee.id, name: folder.name } });
			stageResult.counts.created += 1;
		}
	}

	for (const document of ctx.input.data.documents) {
		const employee = lookups.employeesByEmployeeId.get(document.employeeId);
		const documentType = document.documentTypeCode
			? lookups.documentTypesByCode.get(normalizeCode(document.documentTypeCode))
			: null;
		if (!employee) {
			pushStageError(ctx, stageResult, `Document missing employee ${document.employeeId}.`, {
				row: document,
				field: "employeeId",
			});
			continue;
		}
		const existing = await ctx.prisma.document.findFirst({
			where: {
				employeeId: employee.id,
				number: document.number,
				type: document.type,
				isDeleted: false,
			},
		});
		if (ctx.dryRun) {
			stageResult.counts[existing ? "updated" : "created"] += 1;
			ctx.dryRunState?.documentsByKey.set(
				documentKey(employee.id, document.number, document.type),
				existing || {
					id: buildDryRunId("document", documentKey(employee.id, document.number, document.type)),
					employeeId: employee.id,
				},
			);
			continue;
		}
		const reviewSubmittedBy = document.reviewSubmittedByEmployeeId
			? lookups.employeesByEmployeeId.get(document.reviewSubmittedByEmployeeId)
			: null;
		const reviewApprovedBy = document.reviewApprovedByEmployeeId
			? lookups.employeesByEmployeeId.get(document.reviewApprovedByEmployeeId)
			: null;
		const reviewRejectedBy = document.reviewRejectedByEmployeeId
			? lookups.employeesByEmployeeId.get(document.reviewRejectedByEmployeeId)
			: null;
		const payload = {
			name: document.name,
			type: document.type,
			number: document.number,
			issueDate: new Date(document.issueDate as any),
			expiryDate: document.expiryDate ? new Date(document.expiryDate as any) : null,
			fileUrl: document.fileUrl,
			ext: document.ext,
			documentTypeId: documentType?.id || null,
			fieldValues: document.fieldValues,
			reviewStatus: (document.reviewStatus || null) as any,
			reviewSubmittedAt: document.reviewSubmittedAt
				? new Date(document.reviewSubmittedAt as any)
				: null,
			reviewSubmittedById: reviewSubmittedBy?.id || null,
			reviewApprovedAt: document.reviewApprovedAt
				? new Date(document.reviewApprovedAt as any)
				: null,
			reviewApprovedById: reviewApprovedBy?.id || null,
			reviewRejectedAt: document.reviewRejectedAt
				? new Date(document.reviewRejectedAt as any)
				: null,
			reviewRejectedById: reviewRejectedBy?.id || null,
			reviewRejectionReason: document.reviewRejectionReason,
			reviewSource: (document.reviewSource || null) as any,
			metadata: document.metadata,
		};
		if (existing) {
			await ctx.prisma.document.update({ where: { id: existing.id }, data: payload });
			stageResult.counts.updated += 1;
		} else {
			await ctx.prisma.document.create({
				data: {
					employeeId: employee.id,
					...payload,
				},
			});
			stageResult.counts.created += 1;
		}
	}

	for (const group of Object.values(
		ctx.input.data.leaveBalances.reduce<Record<string, Array<Record<string, any>>>>((acc, row) => {
			const bucket = acc[row.employeeId] || [];
			bucket.push({
				leaveType: row.leaveType,
				balance: row.balance,
				asOfDate: new Date(row.asOfDate as any),
				carryover: row.carryover,
				metadata: row.metadata,
			});
			acc[row.employeeId] = bucket;
			return acc;
		}, {}),
	)) {
		const employeeId = String(group[0]?.metadata?.employeeId || "");
		void employeeId;
	}

	for (const [employeeId, rows] of Object.entries(
		ctx.input.data.leaveBalances.reduce<Record<string, Array<Record<string, any>>>>((acc, row) => {
			const bucket = acc[row.employeeId] || [];
			bucket.push({
				leaveType: row.leaveType,
				balance: row.balance,
				asOfDate: new Date(row.asOfDate as any),
				carryover: row.carryover,
				metadata: row.metadata,
			});
			acc[row.employeeId] = bucket;
			return acc;
		}, {}),
	)) {
		const employee = lookups.employeesByEmployeeId.get(employeeId);
		if (!employee) {
			pushStageError(ctx, stageResult, `Leave balance missing employee ${employeeId}.`, {
				row: rows[0],
				field: "employeeId",
				failedCount: rows.length,
			});
			continue;
		}
		if (ctx.dryRun) {
			stageResult.counts.updated += rows.length;
			continue;
		}
		await ctx.prisma.employee.update({
			where: { id: employee.id },
			data: {
				leaveBalances: mergeLeaveBalanceRows(employee.leaveBalances, rows),
				leaveBalancesLastUpdated: new Date(),
			},
		});
		stageResult.counts.updated += rows.length;
	}

	lookups = await refreshLookups(ctx);

	for (const benefit of ctx.input.data.employeeBenefits) {
		const employee = lookups.employeesByEmployeeId.get(benefit.employeeId);
		const benefitType = lookups.benefitTypesByName.get(normalizeName(benefit.benefitTypeName));
		if (!employee || !benefitType) {
			pushStageError(
				ctx,
				stageResult,
				`Employee benefit missing prerequisite: ${benefit.employeeId}/${benefit.benefitTypeName}.`,
				{
					row: benefit,
					field: !employee ? "employeeId" : "benefitTypeName",
				},
			);
			continue;
		}
		const existing =
			lookups.employeeBenefitsByCompositeKey.get(
				benefitCompositeKey(employee.id, benefitType.id, benefit.startDate),
			) ||
			(await ctx.prisma.employeeBenefit.findFirst({
				where: {
					organizationId: ctx.input.config.organizationId,
					employeeId: employee.id,
					benefitTypeId: benefitType.id,
					startDate: benefit.startDate ? new Date(benefit.startDate as any) : null,
					isDeleted: false,
				},
			}));
		if (ctx.dryRun) {
			stageResult.counts[existing ? "updated" : "created"] += 1;
			registerDryRunEmployeeBenefit({
				ctx,
				employeeId: employee.id,
				benefitTypeId: benefitType.id,
				benefit,
			});
			continue;
		}
		const approvedBy = benefit.approvedByEmployeeId
			? lookups.employeesByEmployeeId.get(benefit.approvedByEmployeeId)
			: null;
		const payload = {
			benefitTypeId: benefitType.id,
			name: benefit.name,
			description: benefit.description,
			totalAmount: benefit.totalAmount,
			currency: benefit.currency,
			totalInstallments: benefit.totalInstallments,
			installmentAmount: benefit.installmentAmount,
			remainingBalance: benefit.remainingBalance,
			amount: benefit.amount,
			startDate: benefit.startDate ? new Date(benefit.startDate as any) : null,
			endDate: benefit.endDate ? new Date(benefit.endDate as any) : null,
			startPayrollCutOff: benefit.startPayrollCutOff ? new Date(benefit.startPayrollCutOff as any) : null,
			endPayrollCutOff: benefit.endPayrollCutOff ? new Date(benefit.endPayrollCutOff as any) : null,
			agreedToTerms: benefit.agreedToTerms,
			agreedAt: benefit.agreedAt ? new Date(benefit.agreedAt as any) : null,
			agreedByIp: benefit.agreedByIp,
			status: benefit.status as any,
			isActive: benefit.isActive,
			approvedById: approvedBy?.id || null,
			approvedAt: benefit.approvedAt ? new Date(benefit.approvedAt as any) : null,
			notes: benefit.notes,
			remarks: benefit.remarks,
		};
		if (existing) {
			await ctx.prisma.employeeBenefit.update({ where: { id: existing.id }, data: payload });
			stageResult.counts.updated += 1;
		} else {
			await ctx.prisma.employeeBenefit.create({
				data: {
					organizationId: ctx.input.config.organizationId,
					employeeId: employee.id,
					...payload,
				},
			});
			stageResult.counts.created += 1;
		}
	}

	lookups = await refreshLookups(ctx);

	for (const installment of ctx.input.data.employeeBenefitInstallments) {
		const employee = lookups.employeesByEmployeeId.get(installment.employeeId);
		const benefitType = lookups.benefitTypesByName.get(normalizeName(installment.benefitTypeName));
		if (!employee || !benefitType) {
			pushStageError(
				ctx,
				stageResult,
				`Benefit installment missing prerequisite: ${installment.employeeId}/${installment.benefitTypeName}.`,
				{
					row: installment,
					field: !employee ? "employeeId" : "benefitTypeName",
				},
			);
			continue;
		}
		const benefit = ctx.dryRun
			? findDryRunEmployeeBenefit(ctx, employee.id, benefitType.id)
			: await ctx.prisma.employeeBenefit.findFirst({
			where: {
				organizationId: ctx.input.config.organizationId,
				employeeId: employee.id,
				benefitTypeId: benefitType.id,
				isDeleted: false,
			},
			orderBy: { createdAt: "desc" },
		});
		if (!benefit) {
			const message = `Benefit installment could not resolve parent benefit for ${installment.employeeId}/${installment.benefitTypeName}.`;
			stageResult.errors.push(message);
			ctx.globalErrors.push(message);
			stageResult.counts.failed += 1;
			continue;
		}
		const existing = await ctx.prisma.employeeBenefitInstallment.findFirst({
			where: {
				employeeBenefitId: benefit.id,
				installmentNumber: installment.installmentNumber,
			},
		});
		if (ctx.dryRun) {
			stageResult.counts[existing ? "updated" : "created"] += 1;
			continue;
		}
		const payload = {
			amount: installment.amount,
			scheduledDate: new Date(installment.scheduledDate as any),
			processedDate: installment.processedDate ? new Date(installment.processedDate as any) : null,
			payrollCutOffId: installment.payrollCutOffId,
			payrollRunId: installment.payrollRunId,
			status: installment.status as any,
			failureReason: installment.failureReason,
		};
		if (existing) {
			await ctx.prisma.employeeBenefitInstallment.update({ where: { id: existing.id }, data: payload });
			stageResult.counts.updated += 1;
		} else {
			await ctx.prisma.employeeBenefitInstallment.create({
				data: { employeeBenefitId: benefit.id, installmentNumber: installment.installmentNumber, ...payload },
			});
			stageResult.counts.created += 1;
		}
	}

	for (const loan of ctx.input.data.employeeLoans) {
		const employee = lookups.employeesByEmployeeId.get(loan.employeeId);
		const loanType = lookups.loanTypesByName.get(normalizeName(loan.loanTypeName));
		if (!employee || !loanType) {
			pushStageError(
				ctx,
				stageResult,
				`Employee loan missing prerequisite: ${loan.employeeId}/${loan.loanTypeName}.`,
				{
					row: loan,
					field: !employee ? "employeeId" : "loanTypeName",
				},
			);
			continue;
		}
		const existing = await ctx.prisma.employeeLoan.findFirst({
			where: {
				organizationId: ctx.input.config.organizationId,
				employeeId: employee.id,
				loanTypeId: loanType.id,
				startDate: new Date(loan.startDate as any),
				isDeleted: false,
			},
		});
		if (ctx.dryRun) {
			stageResult.counts[existing ? "updated" : "created"] += 1;
			continue;
		}
		const approvedBy = loan.approvedByEmployeeId
			? lookups.employeesByEmployeeId.get(loan.approvedByEmployeeId)
			: null;
		const payload = {
			loanTypeId: loanType.id,
			principalAmount: loan.principalAmount,
			interestRate: loan.interestRate,
			totalAmount: loan.totalAmount,
			termMonths: loan.termMonths,
			monthlyPayment: loan.monthlyPayment,
			startDate: new Date(loan.startDate as any),
			endDate: new Date(loan.endDate as any),
			amountPaid: loan.amountPaid,
			balance: loan.balance,
			status: loan.status as any,
			approvedBy: approvedBy?.id || null,
			approvedAt: loan.approvedAt ? new Date(loan.approvedAt as any) : null,
			notes: loan.notes,
		};
		if (existing) {
			await ctx.prisma.employeeLoan.update({ where: { id: existing.id }, data: payload });
			stageResult.counts.updated += 1;
		} else {
			await ctx.prisma.employeeLoan.create({
				data: {
					organizationId: ctx.input.config.organizationId,
					employeeId: employee.id,
					...payload,
				},
			});
			stageResult.counts.created += 1;
		}
	}

	stageResult.reconciliation = {
		documentFolders: ctx.input.data.documentFolders.length,
		documents: ctx.input.data.documents.length,
		leaveBalances: ctx.input.data.leaveBalances.length,
		employeeBenefits: ctx.input.data.employeeBenefits.length,
		employeeLoans: ctx.input.data.employeeLoans.length,
	};
};

const resolvePayrollPeriod = (
	lookups: LookupBundle,
	entry: {
		payrollPeriodCode?: string | null;
		payrollPeriodRange?: { startDate?: Date | string; endDate?: Date | string } | null;
	},
) => {
	if (entry.payrollPeriodCode) {
		return lookups.payrollPeriodsByCode.get(normalizeCode(entry.payrollPeriodCode)) || null;
	}
	if (entry.payrollPeriodRange) {
		return (
			lookups.payrollPeriodsByRange.get(
				payrollRangeKey(entry.payrollPeriodRange.startDate, entry.payrollPeriodRange.endDate),
			) || null
		);
	}
	return null;
};

const runClosedHistoricalOperationalLedger = async (
	ctx: ExecutionContext,
	stageResult: MutableStageResult,
) => {
	let lookups = await requireOrganization(ctx, stageResult);

	for (const soa of ctx.input.data.statementsOfAccount) {
		const reconciledBy = soa.eppReconciledByEmployeeId
			? lookups.employeesByEmployeeId.get(soa.eppReconciledByEmployeeId)
			: null;
		const existing = lookups.soasByNumber.get(normalizeCode(soa.soaNumber));
		if (ctx.dryRun) {
			stageResult.counts[existing ? "updated" : "created"] += 1;
			registerDryRunSoa(ctx, soa);
			continue;
		}
		const payload = {
			soaNumber: soa.soaNumber,
			name: soa.name,
			startDate: new Date(soa.startDate as any),
			endDate: new Date(soa.endDate as any),
			dueDate: soa.dueDate ? new Date(soa.dueDate as any) : null,
			payrollPeriodIds: soa.payrollPeriodIds,
			totalEmployeeShare: soa.totalEmployeeShare,
			totalEmployerShare: soa.totalEmployerShare,
			totalTax: soa.totalTax,
			totalAmount: soa.totalAmount,
			totalRemitted: soa.totalRemitted,
			totalOutstanding: soa.totalOutstanding,
			eppReferenceId: soa.eppReferenceId,
			eppBillingId: soa.eppBillingId,
			eppReconciled: soa.eppReconciled,
			eppReconciledAt: soa.eppReconciledAt ? new Date(soa.eppReconciledAt as any) : null,
			eppReconciledById: reconciledBy?.id || null,
			remitteeName: soa.remitteeName,
			remitteeAccount: soa.remitteeAccount,
			remitteeDetails: soa.remitteeDetails,
			status: soa.status as any,
			notes: soa.notes,
			description: soa.description,
			metadata: soa.metadata,
		};
		if (existing) {
			await ctx.prisma.statementOfAccount.update({ where: { id: existing.id }, data: payload });
			stageResult.counts.updated += 1;
		} else {
			await ctx.prisma.statementOfAccount.create({
				data: { organizationId: ctx.input.config.organizationId, ...payload },
			});
			stageResult.counts.created += 1;
		}
	}

	lookups = await refreshLookups(ctx);

	for (const remittance of ctx.input.data.soaRemittances) {
		const soa = lookups.soasByNumber.get(normalizeCode(remittance.soaNumber));
		if (!soa) {
			pushStageError(ctx, stageResult, `SOA remittance missing parent SOA ${remittance.soaNumber}.`, {
				row: remittance,
				field: "soaNumber",
			});
			continue;
		}
		const existing = await ctx.prisma.sOARemittance.findFirst({
			where: {
				statementOfAccountId: soa.id,
				referenceNumber: remittance.referenceNumber || null,
				paymentDate: new Date(remittance.paymentDate as any),
			},
		});
		if (ctx.dryRun) {
			stageResult.counts[existing ? "updated" : "created"] += 1;
			ctx.dryRunState?.soaRemittancesByKey.set(
				soaRemittanceKey(soa.id, remittance.referenceNumber || null, remittance.paymentDate),
				existing || {
					id: buildDryRunId(
						"soa-remittance",
						soaRemittanceKey(soa.id, remittance.referenceNumber || null, remittance.paymentDate),
					),
				},
			);
			continue;
		}
		const payload = {
			amount: remittance.amount,
			paymentMethod: remittance.paymentMethod,
			referenceNumber: remittance.referenceNumber,
			paymentDate: new Date(remittance.paymentDate as any),
			category: remittance.category,
			status: remittance.status as any,
			notes: remittance.notes,
			metadata: remittance.metadata,
		};
		if (existing) {
			await ctx.prisma.sOARemittance.update({ where: { id: existing.id }, data: payload });
			stageResult.counts.updated += 1;
		} else {
			await ctx.prisma.sOARemittance.create({
				data: { statementOfAccountId: soa.id, ...payload },
			});
			stageResult.counts.created += 1;
		}
	}

	for (const attendance of ctx.input.data.attendances) {
		const employee = lookups.employeesByEmployeeId.get(attendance.employeeId);
		if (!employee) {
			pushStageError(ctx, stageResult, `Attendance missing employee ${attendance.employeeId}.`, {
				row: attendance,
				field: "employeeId",
			});
			continue;
		}
		const date = new Date(attendance.date as any);
		const existing = await ctx.prisma.attendance.findFirst({
			where: {
				organizationId: ctx.input.config.organizationId,
				employeeId: employee.id,
				date,
				isDeleted: false,
			},
		});
		if (ctx.dryRun) {
			stageResult.counts[existing ? "updated" : "created"] += 1;
			ctx.dryRunState?.attendancesByKey.set(
				attendanceKey(employee.id, attendance.date),
				existing || {
					id: buildDryRunId("attendance", attendanceKey(employee.id, attendance.date)),
					employeeId: employee.id,
					date,
				},
			);
			continue;
		}
		const payload = buildEnterpriseAttendancePayload({ attendance, employee });
		if (existing) {
			await ctx.prisma.attendance.update({ where: { id: existing.id }, data: payload });
			stageResult.counts.updated += 1;
		} else {
			await ctx.prisma.attendance.create({
				data: {
					organizationId: ctx.input.config.organizationId,
					employeeId: employee.id,
					date,
					...payload,
				} as any,
			});
			stageResult.counts.created += 1;
		}
	}

	lookups = await refreshLookups(ctx);

	for (const timesheet of ctx.input.data.timesheets) {
		const employee = lookups.employeesByEmployeeId.get(timesheet.employeeId);
		const payrollPeriod = resolvePayrollPeriod(lookups, timesheet);
		if (!employee || !payrollPeriod) {
			pushStageError(
				ctx,
				stageResult,
				`Timesheet missing employee or payroll period: ${timesheet.employeeId}.`,
				{
					row: timesheet,
					field: !employee ? "employeeId" : "payrollPeriodCode",
				},
			);
			continue;
		}
		const existing = timesheet.code
			? lookups.timesheetsByCode.get(normalizeCode(timesheet.code))
			: await ctx.prisma.timesheet.findFirst({
					where: {
						organizationId: ctx.input.config.organizationId,
						employeeId: employee.id,
						payrollPeriodId: payrollPeriod.id,
						isDeleted: false,
					},
			  });
		if (ctx.dryRun) {
			stageResult.counts[existing ? "updated" : "created"] += 1;
			registerDryRunTimesheet(ctx, timesheet, employee.id, payrollPeriod.id);
			continue;
		}
		const payload = {
			code: timesheet.code || existing?.code || undefined,
			payrollPeriodId: payrollPeriod.id,
			status: timesheet.status as any,
			submittedAt: timesheet.submittedAt ? new Date(timesheet.submittedAt as any) : null,
			submittedBy: timesheet.submittedBy,
			approvedBy: timesheet.approvedBy,
			approvalDate: timesheet.approvalDate ? new Date(timesheet.approvalDate as any) : null,
			rejectionReason: timesheet.rejectionReason,
			notes: timesheet.notes,
			metadata: timesheet.metadata,
		};
		if (existing) {
			await ctx.prisma.timesheet.update({ where: { id: existing.id }, data: payload });
			stageResult.counts.updated += 1;
		} else {
			await ctx.prisma.timesheet.create({
				data: {
					organizationId: ctx.input.config.organizationId,
					employeeId: employee.id,
					...payload,
				},
			});
			stageResult.counts.created += 1;
		}
	}

	lookups = await refreshLookups(ctx);

	for (const line of ctx.input.data.timesheetLines) {
		const employee = lookups.employeesByEmployeeId.get(line.employeeId);
		const payrollPeriod = resolvePayrollPeriod(lookups, line);
		if (!employee || !payrollPeriod) {
			pushStageError(
				ctx,
				stageResult,
				`Timesheet line missing employee or payroll period: ${line.employeeId}.`,
				{
					row: line,
					field: !employee ? "employeeId" : "payrollPeriodCode",
				},
			);
			continue;
		}
		const timesheet =
			(line.timesheetCode && lookups.timesheetsByCode.get(normalizeCode(line.timesheetCode))) ||
			(await ctx.prisma.timesheet.findFirst({
				where: {
					organizationId: ctx.input.config.organizationId,
					employeeId: employee.id,
					payrollPeriodId: payrollPeriod.id,
					isDeleted: false,
				},
			}));
		if (!timesheet) {
			pushStageError(
				ctx,
				stageResult,
				`Timesheet line could not resolve parent timesheet for ${line.employeeId}.`,
				{
					row: line,
					field: "timesheetCode",
				},
			);
			continue;
		}
		const attendance = line.attendanceDate
			? ctx.dryRun
				? ctx.dryRunState?.attendancesByKey.get(attendanceKey(employee.id, line.attendanceDate)) || null
				: await ctx.prisma.attendance.findFirst({
					where: {
						organizationId: ctx.input.config.organizationId,
						employeeId: employee.id,
						date: new Date(line.attendanceDate as any),
						isDeleted: false,
					},
				  })
			: null;
		const existing = await ctx.prisma.timesheetline.findFirst({
			where: {
				organizationId: ctx.input.config.organizationId,
				timesheetId: timesheet.id,
				date: new Date(line.date as any),
				revisionNo: line.revisionNo,
			},
		});
		if (ctx.dryRun) {
			stageResult.counts[existing ? "updated" : "created"] += 1;
			continue;
		}
		const payload = {
			employeeId: employee.id,
			payrollPeriodId: payrollPeriod.id,
			attendanceId: attendance?.id || null,
			date: new Date(line.date as any),
			timeIn: line.timeIn ? new Date(line.timeIn as any) : null,
			timeBreak: line.timeBreak ? new Date(line.timeBreak as any) : null,
			timeOut: line.timeOut ? new Date(line.timeOut as any) : null,
			status: line.status,
			behaviorFlags: line.behaviorFlags,
			scheduleSnapshot: line.scheduleSnapshot,
			hoursWorked: line.hoursWorked,
			regularHours: line.regularHours,
			overtimeHours: line.overtimeHours,
			undertimeHours: line.undertimeHours,
			lateHours: line.lateHours,
			earlyOutHours: line.earlyOutHours,
			breakMinutes: line.breakMinutes,
			notes: line.notes,
			metadata: line.metadata,
			revisionNo: line.revisionNo,
		};
		if (existing) {
			await ctx.prisma.timesheetline.update({ where: { id: existing.id }, data: payload });
			stageResult.counts.updated += 1;
		} else {
			await ctx.prisma.timesheetline.create({
				data: { organizationId: ctx.input.config.organizationId, timesheetId: timesheet.id, ...payload },
			});
			stageResult.counts.created += 1;
		}
	}

	for (const payroll of ctx.input.data.employeePayrolls) {
		const employee = lookups.employeesByEmployeeId.get(payroll.employeeId);
		const payrollPeriod = resolvePayrollPeriod(lookups, payroll);
		if (!employee || !payrollPeriod) {
			pushStageError(
				ctx,
				stageResult,
				`Employee payroll missing employee or payroll period: ${payroll.employeeId}.`,
				{
					row: payroll,
					field: !employee ? "employeeId" : "payrollPeriodCode",
				},
			);
			continue;
		}
		const timesheet =
			(payroll.timesheetCode && lookups.timesheetsByCode.get(normalizeCode(payroll.timesheetCode))) ||
			(await ctx.prisma.timesheet.findFirst({
				where: {
					organizationId: ctx.input.config.organizationId,
					employeeId: employee.id,
					payrollPeriodId: payrollPeriod.id,
					isDeleted: false,
				},
			}));
		const existing = await ctx.prisma.employeePayroll.findFirst({
			where: {
				organizationId: ctx.input.config.organizationId,
				employeeId: employee.id,
				payrollPeriodId: payrollPeriod.id,
				isDeleted: false,
			},
		});
		if (ctx.dryRun) {
			stageResult.counts[existing ? "updated" : "created"] += 1;
			continue;
		}
		const payload = buildEnterpriseEmployeePayrollPayload({
			payroll,
			payrollPeriodId: payrollPeriod.id,
			timesheetId: timesheet?.id || null,
			timesheet,
		});
		if (existing) {
			await ctx.prisma.employeePayroll.update({ where: { id: existing.id }, data: payload });
			stageResult.counts.updated += 1;
		} else {
			await ctx.prisma.employeePayroll.create({
				data: { organizationId: ctx.input.config.organizationId, employeeId: employee.id, ...payload },
			});
			stageResult.counts.created += 1;
		}
	}

	stageResult.reconciliation = {
		attendances: ctx.input.data.attendances.length,
		timesheets: ctx.input.data.timesheets.length,
		timesheetLines: ctx.input.data.timesheetLines.length,
		employeePayrolls: ctx.input.data.employeePayrolls.length,
		statementsOfAccount: ctx.input.data.statementsOfAccount.length,
		soaRemittances: ctx.input.data.soaRemittances.length,
	};
};

const runOpenInFlightTransactionalHistory = async (
	ctx: ExecutionContext,
	stageResult: MutableStageResult,
) => {
	let lookups = await requireOrganization(ctx, stageResult);

	for (const instance of ctx.input.data.workflowInstances) {
		const existing =
			(instance.code && lookups.workflowInstancesByCode.get(normalizeCode(instance.code))) ||
			(instance.sourceWorkflowKey && lookups.workflowInstancesBySourceKey.get(instance.sourceWorkflowKey)) ||
			null;
		if (ctx.dryRun) {
			stageResult.counts[existing ? "updated" : "created"] += 1;
			registerDryRunWorkflowInstance(ctx, instance);
			continue;
		}
		const payload = {
			domain: instance.domain as any,
			domainRecordId: instance.domainRecordId,
			requestType: (instance.requestType || null) as any,
			code: instance.code,
			name: instance.name,
			description: instance.description,
			steps: instance.steps,
			states: instance.states || null,
			currentStateKey: instance.currentStateKey,
			stateHistory: instance.stateHistory,
		} as any;
		if (existing) {
			await ctx.prisma.workflowInstance.update({ where: { id: existing.id }, data: payload });
			stageResult.counts.updated += 1;
		} else {
			await ctx.prisma.workflowInstance.create({
				data: { organizationId: ctx.input.config.organizationId, ...payload },
			});
			stageResult.counts.created += 1;
		}
	}

	lookups = await refreshLookups(ctx);

	for (const request of ctx.input.data.requests) {
		const requester = lookups.employeesByEmployeeId.get(request.requesterEmployeeId);
		const target = request.targetEmployeeId
			? lookups.employeesByEmployeeId.get(request.targetEmployeeId)
			: null;
		const workflowInstance =
			(request.workflowCode && lookups.workflowInstancesByCode.get(normalizeCode(request.workflowCode))) ||
			null;
		if (!requester) {
			pushStageError(ctx, stageResult, `Request missing requester ${request.requesterEmployeeId}.`, {
				row: request,
				field: "requesterEmployeeId",
			});
			continue;
		}
		const existing =
			(request.code && lookups.requestsByCode.get(normalizeCode(request.code))) ||
			(request.sourceRequestKey && lookups.requestsBySourceKey.get(request.sourceRequestKey)) ||
			null;
		if (ctx.dryRun) {
			stageResult.counts[existing ? "updated" : "created"] += 1;
			registerDryRunRequest({
				ctx,
				request,
				requesterId: requester.id,
				targetEmployeeId: target?.id || null,
				workflowInstanceId: workflowInstance?.id || null,
			});
			continue;
		}
		const payload = {
			code: request.code,
			type: request.type as any,
			currentWorkflowStateKey: request.currentWorkflowStateKey,
			startDate: request.startDate ? new Date(request.startDate as any) : null,
			endDate: request.endDate ? new Date(request.endDate as any) : null,
			description: request.description,
			attachments: request.attachments,
			requesterId: requester.id,
			targetEmployeeId: target?.id || null,
			workflowInstanceId: workflowInstance?.id || null,
			notes: request.notes,
			metadata: {
				...((request.metadata as Record<string, any>) || {}),
				sourceRequestKey: request.sourceRequestKey || undefined,
			},
		} as any;
		if (existing) {
			await ctx.prisma.request.update({ where: { id: existing.id }, data: payload });
			stageResult.counts.updated += 1;
		} else {
			await ctx.prisma.request.create({
				data: { organizationId: ctx.input.config.organizationId, ...payload },
			});
			stageResult.counts.created += 1;
		}
	}

	lookups = await refreshLookups(ctx);

	for (const step of ctx.input.data.workflowStepExecutions) {
		const workflowInstance =
			(step.workflowCode && lookups.workflowInstancesByCode.get(normalizeCode(step.workflowCode))) ||
			(step.workflowSourceKey && lookups.workflowInstancesBySourceKey.get(step.workflowSourceKey)) ||
			null;
		const request =
			(step.requestCode && lookups.requestsByCode.get(normalizeCode(step.requestCode))) ||
			(step.requestSourceKey && lookups.requestsBySourceKey.get(step.requestSourceKey)) ||
			null;
		const assignee = step.assigneeEmployeeId
			? lookups.employeesByEmployeeId.get(step.assigneeEmployeeId)
			: null;
		if (!workflowInstance) {
			pushStageError(
				ctx,
				stageResult,
				`Workflow step execution missing workflow instance for step ${step.stepNumber}.`,
				{
					row: step,
					field: step.workflowCode ? "workflowCode" : "workflowSourceKey",
				},
			);
			continue;
		}
		const existing = await ctx.prisma.workflowStepExecution.findFirst({
			where: {
				organizationId: ctx.input.config.organizationId,
				workflowInstanceId: workflowInstance.id,
				stepNumber: step.stepNumber,
				requestId: request?.id || null,
			},
		});
		if (ctx.dryRun) {
			stageResult.counts[existing ? "updated" : "created"] += 1;
			if (request) {
				ctx.dryRunState?.workflowStepExecutionsByKey.set(
					workflowStepExecutionKey(request.id, step.stepNumber),
					existing || {
						id: buildDryRunId("workflow-step", workflowStepExecutionKey(request.id, step.stepNumber)),
						requestId: request.id,
						stepNumber: step.stepNumber,
					},
				);
			}
			continue;
		}
		const payload = {
			requestId: request?.id || null,
			stepNumber: step.stepNumber,
			stepName: step.stepName,
			stepType: step.stepType as any,
			assigneeType: step.assigneeType as any,
			assigneeRole: step.assigneeRole,
			assigneeId: assignee?.id || null,
			status: step.status as any,
			completedAt: step.completedAt ? new Date(step.completedAt as any) : null,
			comments: step.comments,
			metadata: step.metadata,
			isRequired: step.isRequired,
		} as any;
		if (existing) {
			await ctx.prisma.workflowStepExecution.update({ where: { id: existing.id }, data: payload });
			stageResult.counts.updated += 1;
		} else {
			await ctx.prisma.workflowStepExecution.create({
				data: {
					organizationId: ctx.input.config.organizationId,
					workflowInstanceId: workflowInstance.id,
					...payload,
				},
			});
			stageResult.counts.created += 1;
		}
	}

	lookups = await refreshLookups(ctx);

	for (const request of ctx.input.data.requests) {
		const existing =
			(request.code && lookups.requestsByCode.get(normalizeCode(request.code))) ||
			(request.sourceRequestKey && lookups.requestsBySourceKey.get(request.sourceRequestKey)) ||
			null;
		if (!existing) continue;
		const currentStep =
			typeof request.currentStepNumber === "number"
				? ctx.dryRun
					? ctx.dryRunState?.workflowStepExecutionsByKey.get(
							workflowStepExecutionKey(existing.id, request.currentStepNumber),
						) || null
					: await ctx.prisma.workflowStepExecution.findFirst({
						where: {
							organizationId: ctx.input.config.organizationId,
							requestId: existing.id,
							stepNumber: request.currentStepNumber,
							isDeleted: false,
						},
					  })
				: null;
		const lastCompleted =
			typeof request.lastCompletedStepNumber === "number"
				? ctx.dryRun
					? ctx.dryRunState?.workflowStepExecutionsByKey.get(
							workflowStepExecutionKey(existing.id, request.lastCompletedStepNumber),
						) || null
					: await ctx.prisma.workflowStepExecution.findFirst({
						where: {
							organizationId: ctx.input.config.organizationId,
							requestId: existing.id,
							stepNumber: request.lastCompletedStepNumber,
							isDeleted: false,
						},
					  })
				: null;
		if (ctx.dryRun) {
			stageResult.counts.updated += 1;
			continue;
		}
		await ctx.prisma.request.update({
			where: { id: existing.id },
			data: {
				currentStepExecutionId: currentStep?.id || null,
				lastCompletedStepExecutionId: lastCompleted?.id || null,
			},
		});
		stageResult.counts.updated += 1;
	}

	lookups = await refreshLookups(ctx);

	for (const transaction of ctx.input.data.requestTransactions) {
		const request =
			(transaction.requestCode && lookups.requestsByCode.get(normalizeCode(transaction.requestCode))) ||
			(transaction.requestSourceKey && lookups.requestsBySourceKey.get(transaction.requestSourceKey)) ||
			null;
		if (!request) {
			pushStageError(
				ctx,
				stageResult,
				`Request transaction missing request reference at sequence ${transaction.sequenceNumber}.`,
				{
					row: transaction,
					field: transaction.requestCode ? "requestCode" : "requestSourceKey",
				},
			);
			continue;
		}
		const stepExecution =
			typeof transaction.stepNumber === "number"
				? ctx.dryRun
					? ctx.dryRunState?.workflowStepExecutionsByKey.get(
							workflowStepExecutionKey(request.id, transaction.stepNumber),
						) || null
					: await ctx.prisma.workflowStepExecution.findFirst({
						where: {
							organizationId: ctx.input.config.organizationId,
							requestId: request.id,
							stepNumber: transaction.stepNumber,
							isDeleted: false,
						},
					  })
				: null;
		const workflowInstance =
			(transaction.workflowCode &&
				lookups.workflowInstancesByCode.get(normalizeCode(transaction.workflowCode))) ||
			null;
		const actor = transaction.actorEmployeeId
			? lookups.employeesByEmployeeId.get(transaction.actorEmployeeId)
			: null;
		const existing = await ctx.prisma.requestTransaction.findFirst({
			where: {
				requestId: request.id,
				sequenceNumber: transaction.sequenceNumber,
			},
		});
		if (ctx.dryRun) {
			stageResult.counts[existing ? "updated" : "created"] += 1;
			ctx.dryRunState?.requestTransactionsByKey.set(
				requestTransactionKey(request.id, transaction.sequenceNumber),
				existing || {
					id: buildDryRunId(
						"request-transaction",
						requestTransactionKey(request.id, transaction.sequenceNumber),
					),
					requestId: request.id,
					sequenceNumber: transaction.sequenceNumber,
				},
			);
			continue;
		}
		const payload = {
			requestId: request.id,
			workflowInstanceId: workflowInstance?.id || null,
			stepExecutionId: stepExecution?.id || null,
			actorEmployeeId: actor?.id || null,
			sequenceNumber: transaction.sequenceNumber,
			eventCategory: transaction.eventCategory as any,
			eventKey: transaction.eventKey as any,
			eventSource: transaction.eventSource,
			actorType: transaction.actorType as any,
			actorRole: transaction.actorRole,
			actorDisplayName: transaction.actorDisplayName,
			title: transaction.title,
			description: transaction.description,
			comments: transaction.comments,
			fromStateKey: transaction.fromStateKey,
			toStateKey: transaction.toStateKey,
			fieldChanges: transaction.fieldChanges,
			metadata: transaction.metadata,
			visibility: transaction.visibility as any,
			isSystemGenerated: transaction.isSystemGenerated,
			occurredAt: transaction.occurredAt ? new Date(transaction.occurredAt as any) : undefined,
		} as any;
		if (existing) {
			await ctx.prisma.requestTransaction.update({ where: { id: existing.id }, data: payload });
			stageResult.counts.updated += 1;
		} else {
			await ctx.prisma.requestTransaction.create({
				data: { organizationId: ctx.input.config.organizationId, ...payload },
			});
			stageResult.counts.created += 1;
		}
	}

	stageResult.reconciliation = {
		workflowInstances: ctx.input.data.workflowInstances.length,
		requests: ctx.input.data.requests.length,
		workflowStepExecutions: ctx.input.data.workflowStepExecutions.length,
		requestTransactions: ctx.input.data.requestTransactions.length,
	};
};

const runPostMigrationReconciliation = async (
	ctx: ExecutionContext,
	stageResult: MutableStageResult,
) => {
	const organizationId = ctx.input.config.organizationId;
	const [
		employees,
		departments,
		positions,
		reportingOrphans,
		departmentManagers,
		pendingRequests,
	] = await Promise.all([
		ctx.prisma.employee.findMany({
			where: { organizationId, isDeleted: false },
			select: { id: true, employeeId: true, departmentId: true, positionId: true, reportToId: true },
		}),
		ctx.prisma.department.findMany({
			where: { organizationId, isDeleted: false },
			select: { id: true, code: true, managerId: true, isActive: true },
		}),
		ctx.prisma.position.findMany({
			where: { organizationId, isDeleted: false },
			select: { id: true, code: true, isActive: true },
		}),
		ctx.prisma.employee.findMany({
			where: {
				organizationId,
				isDeleted: false,
				reportToId: { not: null },
				reportTo: { is: null },
			},
			select: { employeeId: true },
		}),
		ctx.prisma.department.findMany({
			where: {
				organizationId,
				isDeleted: false,
				managerId: { not: null },
				manager: { is: null },
			},
			select: { code: true },
		}),
		ctx.prisma.request.findMany({
			where: {
				organizationId,
				isDeleted: false,
				currentWorkflowStateKey: { in: ["OPEN", "SUBMITTED", "FOR_APPROVAL", "PENDING"] as any },
			},
			select: { id: true, code: true, currentStepExecutionId: true },
		}),
	]);

	const noGoReasons: string[] = [];
	if (reportingOrphans.length > 0) {
		noGoReasons.push(`Orphaned reporting lines: ${reportingOrphans.length}`);
	}
	if (departmentManagers.length > 0) {
		noGoReasons.push(`Orphaned department managers: ${departmentManagers.length}`);
	}
	const unresolvedPending = pendingRequests.filter((row) => !row.currentStepExecutionId);
	if (unresolvedPending.length > 0) {
		noGoReasons.push(`Pending requests without current workflow step: ${unresolvedPending.length}`);
	}

	stageResult.validations.push(
		noGoReasons.length === 0
			? "No orphan reporting lines, department managers, or unresolved pending approvals detected."
			: "Go/no-go blockers detected in post-migration reconciliation.",
	);
	stageResult.reconciliation = {
		counts: {
			employees: employees.length,
			departments: departments.length,
			positions: positions.length,
			pendingRequests: pendingRequests.length,
		},
		orphanedReportingLines: reportingOrphans.map((row) => row.employeeId),
		orphanedDepartmentManagers: departmentManagers.map((row) => row.code),
		unresolvedPendingRequests: unresolvedPending.map((row) => row.code || row.id),
		noGoReasons,
	};
};

const stageHandlers: Record<
	EnterpriseMigrationStage,
	(ctx: ExecutionContext, stageResult: MutableStageResult) => Promise<void>
> = {
	PRE_MIGRATION_CONTROLS: runPreMigrationControls,
	FOUNDATION_MASTER: runFoundationMaster,
	CORE_CONFIGURATION: runCoreConfiguration,
	WORK_PATTERN_MASTER: runWorkPatternMaster,
	ORG_STRUCTURE_SKELETON: runOrgStructureSkeleton,
	IDENTITY_MASTER: runIdentityMaster,
	EMPLOYMENT_BASE: runEmploymentBase,
	EMPLOYMENT_RELATIONSHIP_PATCH: runEmploymentRelationshipPatch,
	EMPLOYEE_ATTACHMENT_OPENING_BALANCE: runEmployeeAttachmentOpeningBalance,
	CLOSED_HISTORICAL_OPERATIONAL_LEDGER: runClosedHistoricalOperationalLedger,
	OPEN_IN_FLIGHT_TRANSACTIONAL_HISTORY: runOpenInFlightTransactionalHistory,
	POST_MIGRATION_RECONCILIATION: runPostMigrationReconciliation,
};

export const enterpriseMigrationService = (prisma: PrismaClient) => {
	const executeEnterpriseMigration = async (
		input: EnterpriseMigrationRequest,
	): Promise<EnterpriseMigrationResult> => {
		const requestedStages = resolveEnterpriseMigrationStageOrder(input.options?.stages);
		const ctx: ExecutionContext = {
			prisma,
			input,
			dryRun: input.manifest.dryRun || input.config.dryRun,
			globalWarnings: [],
			globalErrors: [],
		};

		const stageResults: EnterpriseMigrationStageResult[] = [];
		for (const stage of requestedStages) {
			const stageResult = beginStage(stage);
			try {
				enterpriseMigrationLogger.info(
					`Running enterprise migration stage ${stage} for org=${input.config.organizationId}`,
				);
				await stageHandlers[stage](ctx, stageResult);
			} catch (error: any) {
				const message = `Stage ${stage} failed: ${error?.message || String(error)}`;
				stageResult.errors.push(message);
				ctx.globalErrors.push(message);
				enterpriseMigrationLogger.error(message, { error });
				if (input.config.stopOnStageFailure !== false) {
					stageResults.push(finishStage(stageResult));
					break;
				}
			}
			stageResults.push(finishStage(stageResult));
			if (stageResult.status === "failed" && input.config.stopOnStageFailure !== false) {
				break;
			}
		}

		const postStage = stageResults.find((stage) => stage.stage === "POST_MIGRATION_RECONCILIATION");
		const goNoGoReasons = [
			...ctx.globalErrors,
			...(((postStage?.reconciliation?.noGoReasons as string[]) || []).filter(Boolean)),
		];

		return {
			success: ctx.globalErrors.length === 0 && goNoGoReasons.length === 0,
			manifest: {
				runLabel: input.manifest.runLabel,
				sourceSystem: input.manifest.sourceSystem,
				cutoffAt: new Date(input.manifest.cutoffAt as any).toISOString(),
				dryRun: ctx.dryRun,
				requestedStages,
				executedStages: stageResults.map((stage) => stage.stage),
				operator: input.manifest.operator,
			},
			stageResults,
			globalWarnings: ctx.globalWarnings,
			globalErrors: ctx.globalErrors,
			goNoGo: {
				decision: goNoGoReasons.length === 0 ? "GO" : "NO_GO",
				reasons:
					goNoGoReasons.length > 0
						? Array.from(new Set(goNoGoReasons))
						: ["No critical blockers detected."],
			},
			reconciliation: {
				defaultStageOrder: ENTERPRISE_MIGRATION_STAGE_ORDER,
				stageCount: stageResults.length,
			},
		};
	};

	const getEnterpriseStageCatalog = () => ({
		stages: ENTERPRISE_MIGRATION_STAGE_ORDER.map((stage) => ({
			stage,
			handler: stageHandlers[stage].name,
		})),
	});

	return {
		executeEnterpriseMigration,
		getEnterpriseStageCatalog,
	};
};
