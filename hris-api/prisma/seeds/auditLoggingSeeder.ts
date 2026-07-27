import type { Prisma, PrismaClient } from "../../generated/prisma";

/** Marker used for idempotent re-seed (delete + recreate). */
export const SEED_AUDIT_SOURCE = "auditLoggingSeeder";
export const SEED_AUDIT_DESCRIPTION_PREFIX = "[seed-audit]";

type SeedAuditActor = {
	id: string;
	employeeCode?: string | null;
	role?: string | null;
	displayName: string;
};

type SeedAuditDefinition = {
	key: string;
	type: "CREATE" | "UPDATE" | "DELETE";
	severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
	resource: string;
	entityType: string;
	entityId: string;
	description: string;
	/** Hours ago relative to seed run (for staggered timestamps). */
	hoursAgo: number;
	actor: "hr-manager" | "manager" | "employee" | "system";
	changesBefore?: Record<string, unknown> | null;
	changesAfter?: Record<string, unknown> | null;
	path?: string;
	method?: string;
};

const buildMetadata = (params: {
	path: string;
	method: string;
	hoursAgo: number;
}): Prisma.InputJsonValue => ({
	userAgent: "BANDAI-Seed/1.0 (auditLoggingSeeder)",
	ip: "127.0.0.1",
	path: params.path,
	method: params.method,
});

const resolveActorKey = (params: {
	employeeCode?: string | null;
	role?: string | null;
}): SeedAuditDefinition["actor"] | null => {
	const code = String(params.employeeCode || "").toUpperCase();
	const role = String(params.role || "").toLowerCase();
	// Prefer explicit seed codes from generalEmployeeSeeder.
	if (code === "EMP-HR-MGR-001" || code.includes("HR-MGR")) {
		return "hr-manager";
	}
	if (code === "EMP-SW-MGR-001" || code.includes("SW-MGR")) {
		return "manager";
	}
	if (code === "EMP-SW-DEV-001" || code.endsWith("DEV-001")) {
		return "employee";
	}
	if (role === "hris-hr-manager") return "hr-manager";
	if (role === "hris-employee-manager") return "manager";
	if (role === "hris-employee") return "employee";
	return null;
};

const displayNameFromEmployee = (employee: {
	employeeId?: string | null;
	person?: { personalInfo?: unknown } | null;
}): string => {
	const info =
		employee.person?.personalInfo &&
		typeof employee.person.personalInfo === "object" &&
		!Array.isArray(employee.person.personalInfo)
			? (employee.person.personalInfo as Record<string, unknown>)
			: {};
	const first = String(info.firstName || "").trim();
	const last = String(info.lastName || "").trim();
	const full = `${first} ${last}`.trim();
	return full || employee.employeeId || "Seed Employee";
};

/**
 * Demo audit trail for `/hr/audit-logs` (HR change history).
 * Feed requires: type CREATE|UPDATE|DELETE, sensitive resource, actor employee in org.
 */
export async function seedAuditLoggingDemo(
	prisma: PrismaClient,
	organizationId: string,
): Promise<{ created: number; removed: number; actors: number }> {
	// Idempotent: remove previous seeder rows for this org (description marker is stable).
	const previous = await prisma.auditLogging.findMany({
		where: {
			isDeleted: false,
			description: { startsWith: SEED_AUDIT_DESCRIPTION_PREFIX },
			employee: { is: { organizationId } },
		},
		select: { id: true },
	});
	if (previous.length) {
		await prisma.auditLogging.deleteMany({
			where: { id: { in: previous.map((row) => row.id) } },
		});
	}

	const employees = await prisma.employee.findMany({
		where: {
			organizationId,
			isDeleted: false,
		},
		select: {
			id: true,
			employeeId: true,
			role: true,
			person: { select: { personalInfo: true } },
		},
		take: 40,
	});

	const actors: Partial<Record<SeedAuditDefinition["actor"], SeedAuditActor>> = {};
	for (const employee of employees) {
		const key = resolveActorKey({
			employeeCode: employee.employeeId,
			role: employee.role,
		});
		if (!key || actors[key]) continue;
		actors[key] = {
			id: employee.id,
			employeeCode: employee.employeeId,
			role: employee.role,
			displayName: displayNameFromEmployee(employee),
		};
	}

	// Prefer named seed roles; fall back to any org employee so the feed still scopes correctly.
	const fallbackActor: SeedAuditActor | null = employees[0]
		? {
				id: employees[0].id,
				employeeCode: employees[0].employeeId,
				role: employees[0].role,
				displayName: displayNameFromEmployee(employees[0]),
			}
		: null;

	const pickActor = (key: SeedAuditDefinition["actor"]): SeedAuditActor | null => {
		if (key === "system") return actors["hr-manager"] || fallbackActor;
		return actors[key] || fallbackActor;
	};

	const [latestRequest, latestPayrollPeriod, latestTimesheet, latestEmployeePayroll] =
		await Promise.all([
			prisma.request.findFirst({
				where: { organizationId, isDeleted: false },
				orderBy: { createdAt: "desc" },
				select: { id: true, code: true, type: true, currentWorkflowStateKey: true },
			}),
			prisma.payrollPeriod.findFirst({
				where: { organizationId, isDeleted: false },
				orderBy: { startDate: "desc" },
				select: { id: true, code: true, name: true, status: true },
			}),
			prisma.timesheet.findFirst({
				where: { organizationId, isDeleted: false },
				orderBy: { updatedAt: "desc" },
				select: { id: true, code: true, status: true, employeeId: true },
			}),
			prisma.employeePayroll.findFirst({
				where: { organizationId, isDeleted: false },
				orderBy: { updatedAt: "desc" },
				select: { id: true, employeeId: true, netPay: true, grossPay: true },
			}),
		]);

	const requestId = latestRequest?.id || "seed-request-placeholder";
	const requestCode = latestRequest?.code || "REQ-SEED-001";
	const periodId = latestPayrollPeriod?.id || "seed-payroll-period-placeholder";
	const periodCode = latestPayrollPeriod?.code || "PP-SEED-001";
	const periodName = latestPayrollPeriod?.name || "Seed Payroll Period";
	const timesheetId = latestTimesheet?.id || "seed-timesheet-placeholder";
	const timesheetCode = latestTimesheet?.code || "TS-SEED-001";
	const employeePayrollId = latestEmployeePayroll?.id || "seed-employee-payroll-placeholder";

	const definitions: SeedAuditDefinition[] = [
		{
			key: "request-create-leave",
			type: "CREATE",
			severity: "LOW",
			resource: "request",
			entityType: "REQUEST",
			entityId: requestId,
			description: `${SEED_AUDIT_DESCRIPTION_PREFIX} Request created: ${requestCode} (LEAVE)`,
			hoursAgo: 72,
			actor: "employee",
			changesBefore: null,
			changesAfter: {
				id: requestId,
				code: requestCode,
				type: latestRequest?.type || "LEAVE",
				status: "SUBMITTED",
			},
			path: "/api/request",
			method: "POST",
		},
		{
			key: "request-approve-leave",
			type: "UPDATE",
			severity: "MEDIUM",
			resource: "request",
			entityType: "REQUEST",
			entityId: requestId,
			description: `${SEED_AUDIT_DESCRIPTION_PREFIX} Request approved: ${requestCode}`,
			hoursAgo: 60,
			actor: "manager",
			changesBefore: {
				currentWorkflowStateKey: "SUBMITTED",
			},
			changesAfter: {
				currentWorkflowStateKey: latestRequest?.currentWorkflowStateKey || "APPROVED",
			},
			path: `/api/request/${requestId}/approve`,
			method: "POST",
		},
		{
			key: "request-create-overtime",
			type: "CREATE",
			severity: "LOW",
			resource: "request",
			entityType: "REQUEST",
			entityId: requestId,
			description: `${SEED_AUDIT_DESCRIPTION_PREFIX} Overtime request filed: ${requestCode}`,
			hoursAgo: 36,
			actor: "employee",
			changesBefore: null,
			changesAfter: {
				id: requestId,
				type: "OVERTIME",
				status: "SUBMITTED",
			},
			path: "/api/timesheet/overtime-requests",
			method: "POST",
		},
		{
			key: "request-reject-sample",
			type: "UPDATE",
			severity: "MEDIUM",
			resource: "request",
			entityType: "REQUEST",
			entityId: requestId,
			description: `${SEED_AUDIT_DESCRIPTION_PREFIX} Request rejected (demo): ${requestCode}`,
			hoursAgo: 30,
			actor: "manager",
			changesBefore: { currentWorkflowStateKey: "SUBMITTED" },
			changesAfter: { currentWorkflowStateKey: "REJECTED", rejectionReason: "Insufficient coverage" },
			path: `/api/request/${requestId}/reject`,
			method: "POST",
		},
		{
			key: "timesheet-submit",
			type: "UPDATE",
			severity: "MEDIUM",
			resource: "timesheet",
			entityType: "TIMESHEET",
			entityId: timesheetId,
			description: `${SEED_AUDIT_DESCRIPTION_PREFIX} Timesheet submitted: ${timesheetCode}`,
			hoursAgo: 48,
			actor: "employee",
			changesBefore: { status: "DRAFT" },
			changesAfter: { status: "SUBMITTED", code: timesheetCode },
			path: `/api/timesheet/${timesheetId}/submit`,
			method: "POST",
		},
		{
			key: "timesheet-approve",
			type: "UPDATE",
			severity: "MEDIUM",
			resource: "timesheet",
			entityType: "TIMESHEET",
			entityId: timesheetId,
			description: `${SEED_AUDIT_DESCRIPTION_PREFIX} Timesheet approved: ${timesheetCode}`,
			hoursAgo: 40,
			actor: "manager",
			changesBefore: { status: "SUBMITTED" },
			changesAfter: { status: "APPROVED", code: timesheetCode },
			path: `/api/timesheet/${timesheetId}/approve`,
			method: "POST",
		},
		{
			key: "payroll-period-create",
			type: "CREATE",
			severity: "LOW",
			resource: "payrollperiod",
			entityType: "PAYROLLPERIOD",
			entityId: periodId,
			description: `${SEED_AUDIT_DESCRIPTION_PREFIX} Payroll period created: ${periodName} (${periodCode})`,
			hoursAgo: 96,
			actor: "hr-manager",
			changesBefore: null,
			changesAfter: {
				id: periodId,
				code: periodCode,
				name: periodName,
				status: "OPEN",
			},
			path: "/api/payrollPeriod",
			method: "POST",
		},
		{
			key: "payroll-generate",
			type: "UPDATE",
			severity: "HIGH",
			resource: "payrollperiod",
			entityType: "PAYROLLPERIOD",
			entityId: periodId,
			description: `${SEED_AUDIT_DESCRIPTION_PREFIX} Payroll generated: ${periodCode} (12 employees)`,
			hoursAgo: 24,
			actor: "hr-manager",
			changesBefore: { status: latestPayrollPeriod?.status || "OPEN" },
			changesAfter: {
				status: "COMPLETED",
				generated: 12,
				errors: 0,
				total: 12,
			},
			path: `/api/payrollPeriod/${periodId}/generate`,
			method: "POST",
		},
		{
			key: "employee-payroll-update",
			type: "UPDATE",
			severity: "MEDIUM",
			resource: "employeepayroll",
			entityType: "EMPLOYEEPAYROLL",
			entityId: employeePayrollId,
			description: `${SEED_AUDIT_DESCRIPTION_PREFIX} Employee payroll updated: ${employeePayrollId}`,
			hoursAgo: 18,
			actor: "hr-manager",
			changesBefore: {
				grossPay: latestEmployeePayroll?.grossPay ?? 0,
				netPay: latestEmployeePayroll?.netPay ?? 0,
			},
			changesAfter: {
				grossPay: Number(latestEmployeePayroll?.grossPay ?? 25000) + 500,
				netPay: Number(latestEmployeePayroll?.netPay ?? 20000) + 400,
				note: "Manual OT adjustment demo",
			},
			path: `/api/employeePayroll/${employeePayrollId}`,
			method: "PUT",
		},
		{
			key: "employee-update",
			type: "UPDATE",
			severity: "MEDIUM",
			resource: "employee",
			entityType: "EMPLOYEE",
			entityId: pickActor("employee")?.id || "seed-employee-placeholder",
			description: `${SEED_AUDIT_DESCRIPTION_PREFIX} Employee profile updated (demo contact change)`,
			hoursAgo: 12,
			actor: "hr-manager",
			changesBefore: { mobileNumber: "09171234567" },
			changesAfter: { mobileNumber: "09179876543" },
			path: "/api/employee",
			method: "PUT",
		},
		{
			key: "attendance-create",
			type: "CREATE",
			severity: "LOW",
			resource: "attendance",
			entityType: "ATTENDANCE",
			entityId: "seed-attendance-demo",
			description: `${SEED_AUDIT_DESCRIPTION_PREFIX} Manual attendance entry created (demo)`,
			hoursAgo: 8,
			actor: "hr-manager",
			changesBefore: null,
			changesAfter: { status: "PRESENT", source: "MANUAL" },
			path: "/api/attendance",
			method: "POST",
		},
		{
			key: "request-delete-draft",
			type: "DELETE",
			severity: "LOW",
			resource: "request",
			entityType: "REQUEST",
			entityId: "seed-request-draft-deleted",
			description: `${SEED_AUDIT_DESCRIPTION_PREFIX} Draft request deleted (demo)`,
			hoursAgo: 6,
			actor: "employee",
			changesBefore: { status: "DRAFT", type: "LEAVE" },
			changesAfter: null,
			path: "/api/request/seed-request-draft-deleted",
			method: "DELETE",
		},
	];

	const now = Date.now();
	let created = 0;

	for (const definition of definitions) {
		const actor = pickActor(definition.actor);
		if (!actor) {
			// Without an org employee, rows would be filtered out of the HR feed.
			continue;
		}

		const timestamp = new Date(now - definition.hoursAgo * 60 * 60 * 1000);
		const method = definition.method || "POST";
		const path = definition.path || "/api/seed";

		await prisma.auditLogging.create({
			data: {
				employeeId: actor.id,
				type: definition.type,
				severity: definition.severity,
				entity: {
					type: definition.entityType,
					id: definition.entityId,
				} as Prisma.InputJsonValue,
				changes:
					definition.changesBefore !== undefined || definition.changesAfter !== undefined
						? ({
								before: definition.changesBefore ?? null,
								after: definition.changesAfter ?? null,
							} as Prisma.InputJsonValue)
						: undefined,
				metadata: buildMetadata({ path, method, hoursAgo: definition.hoursAgo }),
				description: definition.description,
				payload: {
					resource: definition.resource,
					organizationId,
					originalEntityId: definition.entityId,
					entityIdFallbackUsed: false,
					seedSource: SEED_AUDIT_SOURCE,
					seedKey: definition.key,
					actorEmployeeCode: actor.employeeCode || null,
					actorName: actor.displayName,
				} as Prisma.InputJsonValue,
				archiveStatus: false,
				isDeleted: false,
				timestamp,
				createdAt: timestamp,
				updatedAt: timestamp,
			},
		});
		created += 1;
	}

	return {
		created,
		removed: previous.length,
		actors: Object.keys(actors).length || (fallbackActor ? 1 : 0),
	};
}
