import { PrismaClient } from "../generated/prisma";

export type UserActivitySource = "activity" | "audit" | "request" | "schedule";

export type UserActivityCategory =
	| "attendance"
	| "timesheet"
	| "payroll"
	| "leave"
	| "overtime"
	| "schedule"
	| "profile"
	| "login"
	| "account"
	| "request"
	| "audit";

export interface UserActivityLogItem {
	id: string;
	source: UserActivitySource;
	category: UserActivityCategory;
	title: string;
	description: string;
	occurredAt: string;
	actorName: string;
	actorRole?: string | null;
	referenceLabel?: string | null;
	referenceType?: string | null;
	referenceId?: string | null;
	path?: string | null;
	method?: string | null;
	severity?: string | null;
	searchText: string;
	metadata?: Record<string, any> | null;
}

export interface UserActivityLogEmployeeSummary {
	id: string;
	employeeId?: string | null;
	firstName?: string | null;
	lastName?: string | null;
	departmentName?: string | null;
	positionTitle?: string | null;
	levelName?: string | null;
	role?: string | null;
}

export interface UserActivityFeedParams {
	userId: string;
	organizationId?: string | null;
	page: number;
	limit: number;
	query?: string;
	source?: string;
	category?: string;
	from?: string;
	to?: string;
	sort?: string;
	order?: "asc" | "desc";
}

export interface UserActivityFeedResult {
	user: {
		id: string;
		email: string;
		userName?: string | null;
		role: string;
		status: string;
		organizationId?: string | null;
		lastLogin?: Date | null;
		loginMethod?: string | null;
		createdAt: Date;
		updatedAt: Date;
		metadata?: Record<string, any> | null;
	};
	employee: UserActivityLogEmployeeSummary | null;
	activityLogs: UserActivityLogItem[];
	total: number;
}

type AnyRecord = Record<string, any>;

const asRecord = (value: unknown): AnyRecord =>
	value && typeof value === "object" && !Array.isArray(value) ? (value as AnyRecord) : {};

const ACTIVITY_CATEGORY_KEYWORDS: Record<UserActivityCategory, string[]> = {
	attendance: ["attendance", "clock", "timekeeping", "biometric"],
	timesheet: ["timesheet", "timesheetline"],
	payroll: ["payroll", "payslip", "salary", "compensation", "benefit"],
	leave: ["leave", "vacation", "sick", "pto", "time off"],
	overtime: ["overtime", "ot"],
	schedule: ["schedule", "shift", "roster", "work pattern"],
	profile: ["profile", "employee", "person", "user", "identity"],
	login: ["login", "logout", "sign in", "sign out", "authentication"],
	account: ["account", "password", "status", "suspended", "archived"],
	request: ["request", "workflow", "approval", "submission"],
	audit: ["audit", "change", "update", "delete", "create"],
};

const REQUEST_TYPE_TO_CATEGORY: Record<string, UserActivityCategory> = {
	LEAVE: "leave",
	TIMESHEET: "timesheet",
	ATTENDANCE_CORRECTION: "attendance",
	SCHEDULE_CHANGE: "schedule",
	SALARY_CHANGE: "payroll",
	PROMOTION: "profile",
	TRANSFER: "profile",
	RESIGNATION: "account",
	TERMINATION: "account",
	DOCUMENT_REQUEST: "request",
	EXPENSE_REIMBURSEMENT: "request",
	REGULARIZATION: "profile",
	OTHER: "request",
};

const toTitleCase = (value?: string | null) =>
	String(value || "")
		.replace(/[_-]+/g, " ")
		.trim()
		.replace(/\b\w/g, (char) => char.toUpperCase());

const toIsoString = (value: unknown): string => {
	if (!value) return new Date(0).toISOString();
	const date = value instanceof Date ? value : new Date(String(value));
	return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
};

const getDateValue = (value: unknown): Date | null => {
	if (!value) return null;
	const date = value instanceof Date ? value : new Date(String(value));
	return Number.isNaN(date.getTime()) ? null : date;
};

const normalizeRangeBoundary = (value?: string, endOfDay = false): Date | null => {
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

const formatEmployeeName = (employee?: AnyRecord | null): string => {
	if (!employee) return "";

	const firstName = employee.person?.personalInfo?.firstName || "";
	const lastName = employee.person?.personalInfo?.lastName || "";
	const name = `${firstName} ${lastName}`.trim();
	return name || employee.employeeId || employee.id || "";
};

const buildSearchText = (parts: Array<string | null | undefined>) =>
	parts
		.filter((part) => typeof part === "string" && part.trim().length > 0)
		.map((part) => part?.trim().toLowerCase())
		.join(" ");

const inferCategory = (...parts: Array<string | null | undefined>): UserActivityCategory => {
	const text = buildSearchText(parts);
	for (const [category, keywords] of Object.entries(ACTIVITY_CATEGORY_KEYWORDS) as Array<
		[UserActivityCategory, string[]]
	>) {
		if (keywords.some((keyword) => text.includes(keyword))) {
			return category;
		}
	}
	return "request";
};

const inferRequestCategory = (requestType?: string | null, eventKey?: string | null) => {
	const category = REQUEST_TYPE_TO_CATEGORY[String(requestType || "").toUpperCase()];
	if (category) return category;
	if (String(eventKey || "").toUpperCase().includes("STEP")) return "request";
	return "request";
};

const getActorSummary = (employee?: AnyRecord | null, fallback = "System") => {
	const actorName = formatEmployeeName(employee);
	return actorName || fallback;
};

const buildItem = (item: Omit<UserActivityLogItem, "searchText">): UserActivityLogItem => ({
	...item,
	searchText: buildSearchText([
		item.title,
		item.description,
		item.actorName,
		item.referenceLabel,
		item.referenceType,
		item.referenceId,
		item.path,
		item.method,
		item.category,
		item.source,
		item.severity,
		item.metadata ? JSON.stringify(item.metadata) : null,
	]),
});

const mapActivityLog = (row: AnyRecord): UserActivityLogItem =>
	buildItem({
		id: `activity:${row.id}`,
		source: "activity",
		category: inferCategory(row.entityType, row.action, row.description, row.path, row.page?.title),
		title: toTitleCase(row.action || row.entityType || "Activity"),
		description:
			row.description ||
			row.page?.title ||
			row.page?.url ||
			row.path ||
			"Activity recorded",
		occurredAt: toIsoString(row.createdAt || row.updatedAt),
		actorName: getActorSummary(row.employee),
		actorRole: row.employee?.role || null,
		referenceLabel: row.entityType || null,
		referenceType: row.entityType || null,
		referenceId: row.payload?.entityId || row.payload?.id || null,
		path: row.path || null,
		method: row.method || null,
		severity: null,
		metadata: {
			page: row.page || null,
			payload: row.payload || null,
			headers: row.headers || null,
			ip: row.ip || null,
			organizationId: row.organizationId || null,
		},
	});

const mapAuditLog = (row: AnyRecord): UserActivityLogItem =>
	buildItem({
		id: `audit:${row.id}`,
		source: "audit",
		category: inferCategory(row.entity?.type, row.type, row.description, row.metadata?.path),
		title: toTitleCase(row.type || row.entity?.type || "Audit"),
		description: row.description || `${toTitleCase(row.type || "Audit")} event`,
		occurredAt: toIsoString(row.timestamp || row.createdAt || row.updatedAt),
		actorName: getActorSummary(row.employee),
		actorRole: row.employee?.role || null,
		referenceLabel: row.entity?.type || null,
		referenceType: row.entity?.type || null,
		referenceId: row.entity?.id || null,
		path: row.metadata?.path || null,
		method: row.metadata?.method || null,
		severity: row.severity || null,
		metadata: {
			entity: row.entity || null,
			changes: row.changes || null,
			metadata: row.metadata || null,
			payload: row.payload || null,
			archiveStatus: row.archiveStatus || false,
			archiveDate: row.archiveDate || null,
		},
	});

const mapRequestTransaction = (row: AnyRecord): UserActivityLogItem =>
	buildItem({
		id: `request:${row.id}`,
		source: "request",
		category: inferRequestCategory(row.request?.type, row.eventKey),
		title: row.title || toTitleCase(row.eventKey || row.request?.type || "Request"),
		description:
			row.description ||
			row.comments ||
			row.request?.description ||
			"Request workflow activity",
		occurredAt: toIsoString(row.occurredAt || row.createdAt || row.updatedAt),
		actorName: row.actorDisplayName || getActorSummary(row.actorEmployee),
		actorRole: row.actorRole || null,
		referenceLabel: row.request?.code || row.request?.type || null,
		referenceType: row.request?.type || null,
		referenceId: row.request?.id || null,
		path: null,
		method: null,
		severity: null,
		metadata: {
			eventCategory: row.eventCategory || null,
			eventKey: row.eventKey || null,
			eventSource: row.eventSource || null,
			actorType: row.actorType || null,
			visibility: row.visibility || null,
			isSystemGenerated: row.isSystemGenerated || false,
			request: row.request
				? {
						id: row.request.id,
						code: row.request.code || null,
						type: row.request.type || null,
						requesterId: row.request.requesterId || null,
						targetEmployeeId: row.request.targetEmployeeId || null,
				  }
				: null,
			fieldChanges: row.fieldChanges || null,
		},
	});

const mapScheduleHistory = (row: AnyRecord): UserActivityLogItem =>
	buildItem({
		id: `schedule:${row.id}`,
		source: "schedule",
		category: "schedule",
		title: toTitleCase(row.action || "Schedule change"),
		description: row.reason || "Schedule history recorded",
		occurredAt: toIsoString(row.effectiveAt || row.createdAt),
		actorName: getActorSummary(row.actor),
		actorRole: row.actor?.role || null,
		referenceLabel: row.employee?.employeeId || row.employeeId || null,
		referenceType: "EmployeeScheduleHistory",
		referenceId: row.id,
		path: null,
		method: null,
		severity: null,
		metadata: {
			effectiveAt: row.effectiveAt || null,
			beforeSchedule: row.beforeSchedule || null,
			afterSchedule: row.afterSchedule || null,
			organizationId: row.organizationId || null,
		},
	});

const compareActivityItems = (left: UserActivityLogItem, right: UserActivityLogItem, order: "asc" | "desc") => {
	const leftTime = new Date(left.occurredAt).getTime();
	const rightTime = new Date(right.occurredAt).getTime();
	if (leftTime === rightTime) {
		const secondary = left.id.localeCompare(right.id);
		return order === "asc" ? secondary : -secondary;
	}
	const comparison = leftTime - rightTime;
	return order === "asc" ? comparison : -comparison;
};

const compareFieldValues = (
	left: UserActivityLogItem,
	right: UserActivityLogItem,
	field: keyof UserActivityLogItem,
	order: "asc" | "desc",
) => {
	const leftValue = left[field];
	const rightValue = right[field];
	if (leftValue === rightValue) {
		return compareActivityItems(left, right, order);
	}

	const leftComparable = String(leftValue ?? "").toLowerCase();
	const rightComparable = String(rightValue ?? "").toLowerCase();
	const comparison = leftComparable.localeCompare(rightComparable);
	return order === "asc" ? comparison : -comparison;
};

const matchesDateRange = (item: UserActivityLogItem, from?: Date | null, to?: Date | null) => {
	const itemDate = getDateValue(item.occurredAt);
	if (!itemDate) return false;
	if (from && itemDate.getTime() < from.getTime()) return false;
	if (to && itemDate.getTime() > to.getTime()) return false;
	return true;
};

const matchesSearch = (item: UserActivityLogItem, query?: string) => {
	if (!query) return true;
	const normalized = query.trim().toLowerCase();
	if (!normalized) return true;
	return item.searchText.includes(normalized);
};

const matchesExactFilter = (item: UserActivityLogItem, field: "source" | "category", value?: string) => {
	if (!value) return true;
	return item[field] === value;
};

const resolveEmployeeSummary = (employee: AnyRecord | null): UserActivityLogEmployeeSummary | null => {
	if (!employee) return null;
	return {
		id: employee.id,
		employeeId: employee.employeeId || null,
		firstName: employee.person?.personalInfo?.firstName || null,
		lastName: employee.person?.personalInfo?.lastName || null,
		departmentName: employee.department?.name || null,
		positionTitle: employee.position?.title || null,
		levelName: employee.level?.name || null,
		role: employee.role || null,
	};
};

const resolveEmployee = async (prisma: PrismaClient, user: AnyRecord) => {
	const metadataEmployee = user.metadata?.employee;
	const candidateEmployeeId =
		typeof metadataEmployee?.id === "string" && metadataEmployee.id.trim().length > 0
			? metadataEmployee.id.trim()
			: null;
	const candidateOrgEmployeeId =
		typeof metadataEmployee?.employeeId === "string" &&
		metadataEmployee.employeeId.trim().length > 0
			? metadataEmployee.employeeId.trim()
			: null;
	const orConditions: AnyRecord[] = [{ userId: user.id }];
	if (candidateEmployeeId) {
		orConditions.push({ id: candidateEmployeeId });
	}
	if (candidateOrgEmployeeId) {
		orConditions.push({
			employeeId: candidateOrgEmployeeId,
			...(user.organizationId ? { organizationId: user.organizationId } : {}),
		});
	}

	const employee = await prisma.employee.findFirst({
		where: {
			OR: orConditions as any,
		},
		select: {
			id: true,
			employeeId: true,
			organizationId: true,
			role: true,
			person: {
				select: {
					personalInfo: true,
				},
			},
			department: {
				select: {
					name: true,
				},
			},
			position: {
				select: {
					title: true,
				},
			},
			level: {
				select: {
					name: true,
				},
			},
		},
	});

	return employee as AnyRecord | null;
};

export async function buildUserActivityFeed(
	prisma: PrismaClient,
	params: UserActivityFeedParams,
): Promise<UserActivityFeedResult> {
	const user = await prisma.user.findFirst({
		where: { id: params.userId, isDeleted: false },
		select: {
			id: true,
			email: true,
			userName: true,
			role: true,
			status: true,
			organizationId: true,
			lastLogin: true,
			loginMethod: true,
			createdAt: true,
			updatedAt: true,
			metadata: true,
		},
	});

	if (!user) {
		throw Object.assign(new Error("User not found"), { statusCode: 404 });
	}

	const normalizedUser = {
		...user,
		metadata: asRecord(user.metadata),
	};

	const employee = await resolveEmployee(prisma, normalizedUser);
	const organizationId =
		employee?.organizationId || normalizedUser.organizationId || params.organizationId || null;

	const [activityLogs, auditLogs, requestTransactions, scheduleHistory] = await Promise.all([
		employee
			? prisma.activityLogging.findMany({
					where: {
						isDeleted: false,
						employeeId: employee.id,
						...(organizationId ? { organizationId } : {}),
					},
					include: {
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
					},
			  })
			: Promise.resolve([] as any[]),
		employee
			? prisma.auditLogging.findMany({
					where: {
						isDeleted: false,
						employeeId: employee.id,
					},
					include: {
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
					},
			  })
			: Promise.resolve([] as any[]),
		employee
			? prisma.requestTransaction.findMany({
					where: {
						...(organizationId ? { organizationId } : {}),
						OR: [
							{ actorEmployeeId: employee.id },
							{ request: { requesterId: employee.id } },
							{ request: { targetEmployeeId: employee.id } },
						],
					},
					include: {
						request: {
							select: {
								id: true,
								code: true,
								type: true,
								description: true,
								requesterId: true,
								targetEmployeeId: true,
							},
						},
						actorEmployee: {
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
					},
			  })
			: Promise.resolve([] as any[]),
		employee
			? prisma.employeeScheduleHistory.findMany({
					where: {
						employeeId: employee.id,
						...(organizationId ? { organizationId } : {}),
					},
					include: {
						actor: {
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
					},
			  })
			: Promise.resolve([] as any[]),
	]);

	const items = [
		...activityLogs.map(mapActivityLog),
		...auditLogs.map(mapAuditLog),
		...requestTransactions.map(mapRequestTransaction),
		...scheduleHistory.map(mapScheduleHistory),
	]
		.filter((item) => matchesSearch(item, params.query))
		.filter((item) => matchesExactFilter(item, "source", params.source))
		.filter((item) => matchesExactFilter(item, "category", params.category))
		.filter((item) =>
			matchesDateRange(
				item,
				normalizeRangeBoundary(params.from),
				normalizeRangeBoundary(params.to, true),
			),
		)
		.sort((left, right) => {
			const sortKey = String(params.sort || "occurredAt").trim();
			const order = params.order || "desc";
			if (sortKey === "source") return compareFieldValues(left, right, "source", order);
			if (sortKey === "category") return compareFieldValues(left, right, "category", order);
			if (sortKey === "title") return compareFieldValues(left, right, "title", order);
			if (sortKey === "actorName") return compareFieldValues(left, right, "actorName", order);
			if (sortKey === "referenceLabel")
				return compareFieldValues(left, right, "referenceLabel", order);
			return compareActivityItems(left, right, order);
		});

	const safeLimit = Math.min(Math.max(Number(params.limit) || 10, 1), 1000);
	const safePage = Math.max(Number(params.page) || 1, 1);
	const total = items.length;
	const start = (safePage - 1) * safeLimit;
	const end = start + safeLimit;

	return {
		user: normalizedUser,
		employee: resolveEmployeeSummary(employee),
		activityLogs: items.slice(start, end),
		total,
	};
}
