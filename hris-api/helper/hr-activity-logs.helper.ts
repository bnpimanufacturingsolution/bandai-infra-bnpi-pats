import { PrismaClient } from "../generated/prisma";

type AnyRecord = Record<string, any>;

export type HrAuditLogType = "CREATE" | "UPDATE" | "DELETE";

export interface HrAuditFeedParams {
	organizationId?: string | null;
	page: number;
	limit: number;
	query?: string;
	type?: string;
	severity?: string;
	from?: string;
	to?: string;
	sort?: string;
	order?: "asc" | "desc";
}

export interface HrAuditFeedSummary {
	total: number;
	types: Record<string, number>;
	severities: Record<string, number>;
	uniqueActors: number;
}

export interface HrAuditFeedResult {
	auditLoggings: AnyRecord[];
	items: AnyRecord[];
	total: number;
	pagination: {
		total: number;
		page: number;
		limit: number;
		totalPages: number;
		hasNext: boolean;
		hasPrev: boolean;
	};
	summary: HrAuditFeedSummary;
}

const AUDIT_ACTIONS = new Set<HrAuditLogType>(["CREATE", "UPDATE", "DELETE"]);

const HR_SENSITIVE_RESOURCES = new Set(
	[
		"auth",
		"users",
		"employee",
		"attendance",
		"timesheet",
		"timesheetline",
		"payrollperiod",
		"employeepayroll",
		"employeebenefit",
		"employeeschedule",
		"schedule",
		"request",
		"requesttransaction",
		"requestworkflow",
		"requeststepexecution",
		"leavetype",
		"leavesetting",
		"termination",
		"document",
		"documenttype",
		"documentfolder",
		"benefittype",
		"calendar",
		"calendaritem",
		"systemprovisioning",
		"workflowconfig",
		"workflowinstance",
		"workflowengine",
	].map((value) => value.toLowerCase()),
);

const toTitleCase = (value?: string | null) =>
	String(value || "")
		.replace(/[_-]+/g, " ")
		.trim()
		.replace(/\b\w/g, (char) => char.toUpperCase());

const normalizeDateBoundary = (value?: string, endOfDay = false): Date | null => {
	if (!value) return null;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return null;
	if (endOfDay) {
		date.setHours(23, 59, 59, 999);
	} else {
		date.setHours(0, 0, 0, 0);
	}
	return date;
};

const toIsoString = (value: unknown): string => {
	if (!value) return new Date(0).toISOString();
	const date = value instanceof Date ? value : new Date(String(value));
	return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
};

const asRecord = (value: unknown): AnyRecord =>
	value && typeof value === "object" && !Array.isArray(value) ? (value as AnyRecord) : {};

const normalizeString = (value: unknown): string =>
	String(value ?? "")
		.trim()
		.toLowerCase();

const isAuditAction = (value: unknown) => AUDIT_ACTIONS.has(String(value || "").trim().toUpperCase() as HrAuditLogType);

const buildSearchText = (parts: Array<string | null | undefined>) =>
	parts
		.filter((part): part is string => typeof part === "string" && part.trim().length > 0)
		.map((part) => part.trim().toLowerCase())
		.join(" ");

const getActorName = (employee?: AnyRecord | null) => {
	const firstName = employee?.person?.personalInfo?.firstName || "";
	const lastName = employee?.person?.personalInfo?.lastName || "";
	const fullName = `${firstName} ${lastName}`.trim();
	return fullName || employee?.employeeId || employee?.id || "System";
};

const getResourceName = (row: AnyRecord) =>
	normalizeString(row.payload?.resource || row.entity?.type || row.type || "");

const isSensitiveResource = (row: AnyRecord) => {
	const resource = getResourceName(row);
	return resource ? HR_SENSITIVE_RESOURCES.has(resource) : false;
};

const buildSearchableText = (row: AnyRecord) =>
	buildSearchText([
		row.type,
		row.severity,
		row.description,
		row.entity?.type,
		row.entity?.id,
		row.metadata?.path,
		row.metadata?.method,
		row.metadata?.ip,
		row.payload?.resource,
		row.payload?.originalEntityId,
		row.payload?.entityIdFallbackUsed ? "fallback" : "",
		getActorName(row.employee),
		JSON.stringify(row.changes || {}),
		JSON.stringify(row.metadata || {}),
		JSON.stringify(row.payload || {}),
	]);

const matchesSearch = (row: AnyRecord, query?: string) => {
	if (!query) return true;
	return buildSearchableText(row).includes(query.trim().toLowerCase());
};

const compareRecords = (left: AnyRecord, right: AnyRecord, sort: string, order: "asc" | "desc") => {
	const direction = order === "asc" ? 1 : -1;

	const compareText = (a: unknown, b: unknown) => {
		const leftValue = String(a ?? "").toLowerCase();
		const rightValue = String(b ?? "").toLowerCase();
		if (leftValue === rightValue) return 0;
		return leftValue.localeCompare(rightValue) * direction;
	};

	switch (sort) {
		case "type":
			return compareText(left.type, right.type);
		case "severity":
			return compareText(left.severity, right.severity);
		case "entity.type":
		case "entityType":
			return compareText(left.entity?.type, right.entity?.type);
		case "entity.id":
		case "entityId":
			return compareText(left.entity?.id, right.entity?.id);
		case "description":
			return compareText(left.description, right.description);
		case "actorName":
			return compareText(getActorName(left.employee), getActorName(right.employee));
		case "resource":
			return compareText(getResourceName(left), getResourceName(right));
		case "timestamp":
		default: {
			const leftTime = new Date(left.timestamp || left.createdAt || 0).getTime();
			const rightTime = new Date(right.timestamp || right.createdAt || 0).getTime();
			if (leftTime === rightTime) {
				return compareText(left.id, right.id);
			}
			return (leftTime - rightTime) * direction;
		}
	}
};

const buildSummary = (items: AnyRecord[]): HrAuditFeedSummary => {
	const types = items.reduce<Record<string, number>>((acc, item) => {
		acc[item.type] = (acc[item.type] || 0) + 1;
		return acc;
	}, {});
	const severities = items.reduce<Record<string, number>>((acc, item) => {
		acc[item.severity] = (acc[item.severity] || 0) + 1;
		return acc;
	}, {});

	return {
		total: items.length,
		types,
		severities,
		uniqueActors: new Set(items.map((item) => getActorName(item.employee)).filter(Boolean)).size,
	};
};

const selectAuditLogFields = {
	id: true,
	employeeId: true,
	type: true,
	severity: true,
	entity: true,
	changes: true,
	metadata: true,
	description: true,
	payload: true,
	archiveStatus: true,
	archiveDate: true,
	isDeleted: true,
	timestamp: true,
	createdAt: true,
	updatedAt: true,
	employee: {
		select: {
			id: true,
			employeeId: true,
			role: true,
			person: {
				select: {
					personalInfo: true,
				},
			},
		},
	},
} as const;

export async function buildHrAuditFeed(
	prisma: PrismaClient,
	params: HrAuditFeedParams,
): Promise<HrAuditFeedResult> {
	const organizationId = params.organizationId || undefined;
	const from = normalizeDateBoundary(params.from);
	const to = normalizeDateBoundary(params.to, true);
	const type = normalizeString(params.type);
	const severity = normalizeString(params.severity);
	const query = normalizeString(params.query);

	const where: AnyRecord = {
		isDeleted: false,
		type: { in: Array.from(AUDIT_ACTIONS) },
		...(organizationId ? { employee: { is: { organizationId } } } : {}),
		...(from || to ? { timestamp: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
	};

	const rows = await prisma.auditLogging.findMany({
		where,
		select: selectAuditLogFields,
	});

	const filtered = rows
		.filter((row: AnyRecord) => isAuditAction(row.type))
		.filter((row: AnyRecord) => isSensitiveResource(row))
		.filter((row: AnyRecord) => !type || normalizeString(row.type) === type)
		.filter((row: AnyRecord) => !severity || normalizeString(row.severity) === severity)
		.filter((row: AnyRecord) => matchesSearch(row, query))
		.sort((left: AnyRecord, right: AnyRecord) =>
			compareRecords(left, right, String(params.sort || "timestamp"), params.order || "desc"),
		);

	const safeLimit = Math.min(Math.max(Number(params.limit) || 10, 1), 1000);
	const safePage = Math.max(Number(params.page) || 1, 1);
	const total = filtered.length;
	const start = (safePage - 1) * safeLimit;
	const end = start + safeLimit;
	const paginated = filtered.slice(start, end);

	return {
		auditLoggings: paginated,
		items: paginated,
		total,
		pagination: {
			total,
			page: safePage,
			limit: safeLimit,
			totalPages: total === 0 ? 0 : Math.ceil(total / safeLimit),
			hasNext: end < total,
			hasPrev: safePage > 1,
		},
		summary: buildSummary(filtered),
	};
}

export const buildHrActivityFeed = buildHrAuditFeed;
