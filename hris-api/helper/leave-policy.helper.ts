import { PrismaClient, EmploymentType, LeaveType as LeaveTypeRecord } from "../generated/prisma";

type LeavePolicyRecord = LeaveTypeRecord & {
	leaveType: string;
};

const ALL_EMPLOYMENT_TYPES = Object.values(EmploymentType);
const DEFAULT_LEAVE_TYPES = [
	{ code: "VACATION", name: "Vacation Leave", sortOrder: 10 },
	{ code: "SICK", name: "Sick Leave", sortOrder: 20 },
	{ code: "PERSONAL", name: "Personal Leave", sortOrder: 30 },
	{ code: "MATERNITY", name: "Maternity Leave", sortOrder: 40 },
	{ code: "PATERNITY", name: "Paternity Leave", sortOrder: 50 },
	{ code: "BEREAVEMENT", name: "Bereavement Leave", sortOrder: 60 },
	{ code: "UNPAID", name: "Unpaid Leave", sortOrder: 70 },
	{ code: "COMPENSATORY", name: "Compensatory Leave", sortOrder: 80 },
];
const DEFAULT_LEAVE_TYPE_CODES = DEFAULT_LEAVE_TYPES.map((leaveType) => leaveType.code);
const DEFAULT_LEAVE_TYPE_NAMES = DEFAULT_LEAVE_TYPES.map((leaveType) => leaveType.name);

const startOfDay = (value: Date) => {
	const date = new Date(value);
	date.setHours(0, 0, 0, 0);
	return date;
};

export const normalizeLeaveType = (value: string): string | null => {
	const normalized = String(value || "").trim().toUpperCase();
	return normalized.replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "") || null;
};

export const getDefaultLeavePolicySeed = (leaveType: string) => {
	switch (leaveType) {
		case "VACATION":
			return {
				enabled: true,
				isPaid: true,
				requiresApproval: true,
				minAdvanceNoticeDays: 3,
				maxDaysPerRequest: 10,
				allowHalfDay: false,
				requireAttachment: false,
				allowedEmploymentTypes: ALL_EMPLOYMENT_TYPES,
			};
		case "SICK":
			return {
				enabled: true,
				isPaid: true,
				requiresApproval: true,
				minAdvanceNoticeDays: 0,
				maxDaysPerRequest: 5,
				allowHalfDay: true,
				requireAttachment: false,
				allowedEmploymentTypes: ALL_EMPLOYMENT_TYPES,
			};
		default:
			return {
				enabled: true,
				isPaid: leaveType !== "UNPAID",
				requiresApproval: true,
				minAdvanceNoticeDays: 1,
				maxDaysPerRequest: 5,
				allowHalfDay: false,
				requireAttachment: false,
				allowedEmploymentTypes: ALL_EMPLOYMENT_TYPES,
			};
	}
};

const POLICY_FIELD_NAMES = [
	"enabled",
	"isPaid",
	"requiresApproval",
	"minAdvanceNoticeDays",
	"maxDaysPerRequest",
	"allowHalfDay",
	"requireAttachment",
	"allowedEmploymentTypes",
] as const;

const toPolicyRecord = (leaveType: LeaveTypeRecord): LeavePolicyRecord => ({
	...leaveType,
	leaveType: leaveType.code,
});

export const ensureDefaultLeaveTypes = async (prisma: PrismaClient, organizationId: string) => {
	const existingTypes = await prisma.leaveType.findMany({
		where: { organizationId },
		select: { code: true },
	});
	const existingCodes = new Set(existingTypes.map((leaveType) => normalizeLeaveType(leaveType.code)));

	for (const leaveType of DEFAULT_LEAVE_TYPES) {
		if (existingCodes.has(leaveType.code)) continue;
		await prisma.leaveType.create({
			data: {
				organizationId,
				code: leaveType.code,
				name: leaveType.name,
				description: `${leaveType.name} default policy owner.`,
				sortOrder: leaveType.sortOrder,
				isActive: true,
				...getDefaultLeavePolicySeed(leaveType.code),
			},
		});
	}
};

export const repairSeededDefaultLeaveTypePolicies = async (
	prisma: PrismaClient,
	organizationId: string,
) => {
	await ensureDefaultLeaveTypes(prisma, organizationId);
	for (const leaveType of DEFAULT_LEAVE_TYPES.slice(0, 3)) {
		const existing = await prisma.leaveType.findFirst({
			where: { organizationId, code: leaveType.code },
		});
		if (!existing) continue;
		await prisma.leaveType.update({
			where: { id: existing.id },
			data: {
				name: leaveType.name,
				sortOrder: leaveType.sortOrder,
				isActive: true,
				...getDefaultLeavePolicySeed(leaveType.code),
			},
		});
	}
};

export const removeSeededDefaultLeaveTypes = async (
	prisma: PrismaClient,
	organizationId: string,
) => {
	await prisma.leaveType.deleteMany({
		where: {
			organizationId,
			code: { in: DEFAULT_LEAVE_TYPE_CODES },
			name: { in: DEFAULT_LEAVE_TYPE_NAMES },
		},
	});
};

const coerceLegacyPolicyData = (row: Record<string, any>) => {
	const data: Record<string, any> = {};
	for (const field of POLICY_FIELD_NAMES) {
		if (row[field] !== undefined && row[field] !== null) data[field] = row[field];
	}
	return data;
};

const readLegacyPolicyRows = async (prisma: PrismaClient, organizationId: string) => {
	try {
		const queryRaw = (prisma as any).$queryRawUnsafe;
		if (typeof queryRaw !== "function") return [];
		const legacyTable = (await queryRaw.call(
			prisma,
			`SELECT to_regclass('public.leave_policy_configs') IS NOT NULL AS exists`,
		)) as Array<{ exists?: boolean }>;
		if (!legacyTable[0]?.exists) return [];
		return (await queryRaw.call(
			prisma,
			`SELECT id, "organizationId", "leaveTypeId", "leaveTypeCodeSnapshot", "leaveTypeNameSnapshot", enabled, "isPaid", "requiresApproval", "minAdvanceNoticeDays", "maxDaysPerRequest", "allowHalfDay", "requireAttachment", "allowedEmploymentTypes", "updatedAt" FROM leave_policy_configs WHERE "organizationId" = $1`,
			organizationId,
		)) as Array<Record<string, any>>;
	} catch {
		return [];
	}
};

export const selfRepairLeaveTypePoliciesFromLegacyConfig = async (
	prisma: PrismaClient,
	organizationId: string,
) => {
	const legacyRows = await readLegacyPolicyRows(prisma, organizationId);
	if (!legacyRows.length) return;

	const leaveTypes = await prisma.leaveType.findMany({ where: { organizationId } });
	const byId = new Map(leaveTypes.map((leaveType) => [leaveType.id, leaveType]));
	const byCode = new Map(leaveTypes.map((leaveType) => [normalizeLeaveType(leaveType.code), leaveType]));

	for (const row of legacyRows) {
		const target =
			byId.get(String(row.leaveTypeId || "")) ||
			byCode.get(normalizeLeaveType(String(row.leaveTypeCodeSnapshot || "")));
		if (!target) continue;

		const legacyUpdatedAt = row.updatedAt ? new Date(row.updatedAt) : null;
		if (legacyUpdatedAt && target.updatedAt && target.updatedAt > legacyUpdatedAt) continue;

		const data = coerceLegacyPolicyData(row);
		if (Object.keys(data).length === 0) continue;
		await prisma.leaveType.update({
			where: { id: target.id },
			data,
		});
	}
};

export const getOrCreateLeavePolicies = async (
	prisma: PrismaClient,
	organizationId: string,
): Promise<LeavePolicyRecord[]> => {
	await ensureDefaultLeaveTypes(prisma, organizationId);
	await selfRepairLeaveTypePoliciesFromLegacyConfig(prisma, organizationId);
	const leaveTypes = await prisma.leaveType.findMany({
		where: { organizationId },
		orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
	});
	return leaveTypes.map(toPolicyRecord);
};

export const getExistingLeavePolicies = async (
	prisma: PrismaClient,
	organizationId: string,
): Promise<LeavePolicyRecord[]> => {
	await selfRepairLeaveTypePoliciesFromLegacyConfig(prisma, organizationId);
	const leaveTypes = await prisma.leaveType.findMany({
		where: { organizationId },
		orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
	});
	return leaveTypes.map(toPolicyRecord);
};

export const getLeavePolicyByType = async (
	prisma: PrismaClient,
	organizationId: string,
	leaveType: string,
): Promise<LeavePolicyRecord | null> => {
	await getOrCreateLeavePolicies(prisma, organizationId);
	const normalized = normalizeLeaveType(leaveType);
	if (!normalized) return null;
	const policy = await prisma.leaveType.findFirst({
		where: {
			organizationId,
			code: normalized,
		},
	});
	return policy ? toPolicyRecord(policy) : null;
};

export const validateLeaveRequestPolicy = (params: {
	policy: LeavePolicyRecord;
	leaveType: string;
	totalDays: number;
	durationUnit: "FULL_DAY" | "HALF_DAY";
	startDate?: Date | null;
	attachments?: unknown[];
	employmentType?: EmploymentType | null;
	now?: Date;
}) => {
	const {
		policy,
		leaveType,
		totalDays,
		durationUnit,
		startDate,
		attachments,
		employmentType,
		now,
	} = params;

	if (!policy.enabled) {
		throw new Error(`${leaveType} leave is currently disabled by policy.`);
	}

	if (durationUnit === "HALF_DAY" && !policy.allowHalfDay) {
		throw new Error(`${leaveType} leave does not allow half-day requests.`);
	}

	if (policy.maxDaysPerRequest > 0 && totalDays > policy.maxDaysPerRequest) {
		throw new Error(
			`${leaveType} leave allows a maximum of ${policy.maxDaysPerRequest} days per request.`,
		);
	}

	if (policy.requireAttachment && (!attachments || attachments.length === 0)) {
		throw new Error(`${leaveType} leave requires at least one supporting attachment.`);
	}

	if (
		employmentType &&
		policy.allowedEmploymentTypes.length > 0 &&
		!policy.allowedEmploymentTypes.includes(employmentType)
	) {
		throw new Error(
			`${leaveType} leave is not allowed for employment type ${employmentType}.`,
		);
	}

	const normalizedLeaveType = normalizeLeaveType(leaveType);
	if (
		normalizedLeaveType !== "SICK" &&
		startDate &&
		policy.minAdvanceNoticeDays > 0
	) {
		const today = startOfDay(now || new Date());
		const requestStart = startOfDay(startDate);
		const diffDays = Math.floor((requestStart.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
		if (diffDays < policy.minAdvanceNoticeDays) {
			throw new Error(
				`${leaveType} leave requires at least ${policy.minAdvanceNoticeDays} day(s) advance notice.`,
			);
		}
	}
};
