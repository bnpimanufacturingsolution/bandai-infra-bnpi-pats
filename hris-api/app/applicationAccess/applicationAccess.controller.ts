import { Request, Response, NextFunction } from "express";
import { PrismaClient, Prisma } from "../../generated/prisma";
import { getLogger } from "../../helper/logger.helper";
import { buildSuccessResponse, buildPagination } from "../../helper/success-handler.helper";
import { buildErrorResponse, formatZodErrors } from "../../helper/error-handler";
import { logAudit } from "../../utils/auditLogger";
import { logActivity } from "../../utils/activityLogger";
import { config } from "../../config/constant";
import {
	accessRepository,
	type AccessConfigRecord,
} from "../../lib/application-access/repository";
import {
	resolveTrainingPerformanceAccess,
	isAssignableLmsRole,
	type EffectiveTrainingPerformanceAccess,
} from "../../lib/application-access/resolver";
import {
	ASSIGNABLE_LMS_ROLES,
	DEFAULT_EPMR_SUBROLES,
	EPMR_SUBROLE_ORDER,
	LMS_USER_ROLES,
	NON_ASSIGNABLE_LMS_ROLES,
	PERFORMANCE_USER_SUBROLES,
} from "../../lib/application-access/vocabulary";
import {
	UpdateApplicationAccessSchema,
	EmployeeIdParamSchema,
} from "../../lib/application-access/validation";
import { EMPLOYEE_SELF_SERVICE_BLOCKING_STATUSES } from "../../helper/employee-action-block.helper";

const logger = getLogger();
const accessLogger = logger.child({ module: "application-access" });

/** Employee fields joined into list/detail responses (portable across Mongo/Postgres trees). */
const EMPLOYEE_LIST_SELECT = {
	id: true,
	employeeId: true,
	employmentStatus: true,
	role: true,
	organizationId: true,
	person: { select: { personalInfo: true } },
	department: { select: { id: true, name: true } },
};

type EmployeeListItem = {
	id: string;
	employeeId: string;
	employmentStatus: string;
	role: string;
	organizationId: string;
	person: { personalInfo: unknown } | null;
	department: { id: string; name: string } | null;
};

const fullName = (employee: EmployeeListItem): string => {
	const info = (employee.person?.personalInfo ?? {}) as {
		firstName?: string | null;
		lastName?: string | null;
	};
	return [info?.firstName, info?.lastName].filter(Boolean).join(" ").trim();
};

/** Shape consumed by the Phase 4 UI table. */
export interface ApplicationAccessListItem {
	employeeId: string;
	employeeNumber: string;
	employeeName: string;
	department: string | null;
	lmsRole: string | null;
	epmrSubroles: string[];
	provenance: EffectiveTrainingPerformanceAccess["provenance"] | null;
	inherited: boolean;
	eligible: boolean;
	employmentStatus: string;
	provisioningStatus: string;
	hasExplicitConfig: boolean;
}

const toListItem = (
	employee: EmployeeListItem,
	access: AccessConfigRecord | null,
): ApplicationAccessListItem => {
	const effective = resolveTrainingPerformanceAccess(employee, access);
	return {
		employeeId: employee.id,
		employeeNumber: employee.employeeId,
		employeeName: fullName(employee),
		department: employee.department?.name ?? null,
		lmsRole: effective.effectiveLmsRole,
		epmrSubroles: effective.effectiveEpmrSubroles,
		provenance: effective.provenance,
		inherited: effective.inherited,
		eligible: effective.eligible,
		employmentStatus: employee.employmentStatus,
		provisioningStatus: access?.provisioningStatus ?? "PENDING",
		hasExplicitConfig: Boolean(access),
	};
};

export const controller = (prisma: PrismaClient) => {
	const repo = accessRepository(prisma);

	const getOrganizationId = (req: Request): string | null => {
		const orgId = (req as any).organizationId || (req as any).user?.organizationId;
		return orgId ? String(orgId) : null;
	};

	const listAccess = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const organizationId = getOrganizationId(req);
			if (!organizationId) {
				res.status(400).json(buildErrorResponse("Organization context missing", 400));
				return;
			}

			const page = Math.max(1, Number(req.query.page) || 1);
			const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
			const search = String(req.query.search || "").trim();
			const departmentId = String(req.query.departmentId || "").trim();

			const employeeWhere: Prisma.EmployeeWhereInput = {
				organizationId,
				isDeleted: false,
				...(departmentId ? { departmentId } : {}),
				// Name search over the personalInfo Json column is tree-specific;
				// Phase 3 searches by employee number (portable). Name search
				// refinement belongs to Phase 4 UI polish.
				...(search
					? {
							OR: [
								{ employeeId: { contains: search, mode: "insensitive" as const } },
							],
						}
					: {}),
			};

			const [total, employees] = await Promise.all([
				prisma.employee.count({ where: employeeWhere }),
				prisma.employee.findMany({
					where: employeeWhere,
					select: EMPLOYEE_LIST_SELECT,
					orderBy: { createdAt: "asc" },
					skip: (page - 1) * limit,
					take: limit,
				}),
			]);

			const accessRows = await repo.listByOrganization(organizationId);
			const accessByEmployee = new Map(
				accessRows
					.filter((row) => row.employeeId)
					.map((row) => [row.employeeId as string, row]),
			);

			const items = employees.map((employee) =>
				toListItem(employee as unknown as EmployeeListItem, accessByEmployee.get(employee.id) ?? null),
			);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.APPLICATION_ACCESS.ACTIONS.ACCESS_LISTED,
				description: config.ACTIVITY_LOG.APPLICATION_ACCESS.DESCRIPTIONS.ACCESS_LISTED,
				organizationId,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.APPLICATION_ACCESS.PAGES.ACCESS_LIST,
				},
			});

			res.status(200).json(
				buildSuccessResponse(
					"Training & Performance access retrieved successfully",
					{
						items,
						pagination: buildPagination(total, page, limit),
					},
					200,
				),
			);
		} catch (error) {
			accessLogger.error(`Failed to list application access: ${error}`);
			res.status(500).json(buildErrorResponse("Failed to list application access", 500));
		}
	};

	const getAccess = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const organizationId = getOrganizationId(req);
			if (!organizationId) {
				res.status(400).json(buildErrorResponse("Organization context missing", 400));
				return;
			}

			const paramCheck = EmployeeIdParamSchema.safeParse(req.params.employeeId);
			if (!paramCheck.success) {
				res.status(400).json(buildErrorResponse("Invalid employee ID format", 400));
				return;
			}

			const employee = (await prisma.employee.findFirst({
				where: { id: paramCheck.data, organizationId, isDeleted: false },
				select: { ...EMPLOYEE_LIST_SELECT },
			})) as unknown as EmployeeListItem | null;

			if (!employee) {
				res.status(404).json(buildErrorResponse("Employee not found", 404));
				return;
			}

			const access = await repo.findByEmployee(organizationId, employee.id);
			const effective = resolveTrainingPerformanceAccess(employee, access);

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.APPLICATION_ACCESS.ACTIONS.ACCESS_RETRIEVED,
				description: `${config.ACTIVITY_LOG.APPLICATION_ACCESS.DESCRIPTIONS.ACCESS_RETRIEVED}: ${employee.employeeId}`,
				organizationId,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.APPLICATION_ACCESS.PAGES.ACCESS_DETAILS,
				},
			});

			res.status(200).json(
				buildSuccessResponse(
					"Training & Performance access retrieved successfully",
					{
						employee: {
							id: employee.id,
							employeeNumber: employee.employeeId,
							name: fullName(employee),
							department: employee.department?.name ?? null,
							employmentStatus: employee.employmentStatus,
						},
						explicitConfig: access
							? {
									lmsRoleOverride: access.lmsRoleOverride,
									epmrGrants: access.epmrGrants,
									epmrRemovals: access.epmrRemovals,
								}
							: null,
						effective: {
							lmsRole: effective.effectiveLmsRole,
							epmrSubroles: effective.effectiveEpmrSubroles,
							provenance: effective.provenance,
							inherited: effective.inherited,
							eligible: effective.eligible,
						},
						provisioning: {
							status: access?.provisioningStatus ?? "PENDING",
							lastProvisionedAt: access?.lastProvisionedAt ?? null,
							lastSyncError: access?.lastSyncError ?? null,
						},
					},
					200,
				),
			);
		} catch (error) {
			accessLogger.error(`Failed to get application access: ${error}`);
			res.status(500).json(buildErrorResponse("Failed to get application access", 500));
		}
	};

	const updateAccess = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const organizationId = getOrganizationId(req);
			if (!organizationId) {
				res.status(400).json(buildErrorResponse("Organization context missing", 400));
				return;
			}

			const paramCheck = EmployeeIdParamSchema.safeParse(req.params.employeeId);
			if (!paramCheck.success) {
				res.status(400).json(buildErrorResponse("Invalid employee ID format", 400));
				return;
			}

			const validation = UpdateApplicationAccessSchema.safeParse(req.body);
			if (!validation.success) {
				const formattedErrors = formatZodErrors(validation.error.format());
				res.status(400).json(buildErrorResponse("Validation failed", 400, formattedErrors));
				return;
			}

			const employee = (await prisma.employee.findFirst({
				where: { id: paramCheck.data, organizationId, isDeleted: false },
				select: { ...EMPLOYEE_LIST_SELECT },
			})) as unknown as EmployeeListItem | null;

			if (!employee) {
				res.status(404).json(buildErrorResponse("Employee not found", 404));
				return;
			}

			const existing = await repo.findByEmployee(organizationId, employee.id);
			const beforeExplicit = existing
				? {
						lmsRoleOverride: existing.lmsRoleOverride,
						epmrGrants: existing.epmrGrants,
						epmrRemovals: existing.epmrRemovals,
					}
				: null;

			const nextConfig = {
				lmsRoleOverride: validation.data.lmsRoleOverride,
				epmrGrants: [...validation.data.epmrGrants],
				epmrRemovals: [...validation.data.epmrRemovals],
			};

			const updated = existing
				? await repo.replace(existing.id, nextConfig)
				: await repo.create({ organizationId, employeeId: employee.id, ...nextConfig });

			const afterExplicit = {
				lmsRoleOverride: updated.lmsRoleOverride,
				epmrGrants: updated.epmrGrants,
				epmrRemovals: updated.epmrRemovals,
			};

			const effectiveBefore = resolveTrainingPerformanceAccess(employee, existing);
			const effectiveAfter = resolveTrainingPerformanceAccess(employee, updated);

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.UPDATE,
				resource: config.AUDIT_LOG.RESOURCES.APPLICATION_ACCESS,
				severity: config.AUDIT_LOG.SEVERITY.HIGH,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.EMPLOYEE,
				entityId: employee.id,
				changesBefore: { explicit: beforeExplicit, effective: summarizeEffective(effectiveBefore) },
				changesAfter: { explicit: afterExplicit, effective: summarizeEffective(effectiveAfter) },
				description: `Training & Performance access updated for employee ${employee.employeeId}`,
				organizationId,
			});

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.APPLICATION_ACCESS.ACTIONS.ACCESS_UPDATED,
				description: `${config.ACTIVITY_LOG.APPLICATION_ACCESS.DESCRIPTIONS.ACCESS_UPDATED}: ${employee.employeeId}`,
				organizationId,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.APPLICATION_ACCESS.PAGES.ACCESS_UPDATE,
				},
			});

			res.status(200).json(
				buildSuccessResponse(
					"Training & Performance access updated successfully",
					{
						employeeId: employee.id,
						explicitConfig: afterExplicit,
						effective: {
							lmsRole: effectiveAfter.effectiveLmsRole,
							epmrSubroles: effectiveAfter.effectiveEpmrSubroles,
							provenance: effectiveAfter.provenance,
							inherited: effectiveAfter.inherited,
							eligible: effectiveAfter.eligible,
						},
						provisioningStatus: updated.provisioningStatus,
					},
					200,
				),
			);
		} catch (error) {
			accessLogger.error(`Failed to update application access: ${error}`);
			res.status(500).json(buildErrorResponse("Failed to update application access", 500));
		}
	};

	const getCatalog = async (_req: Request, res: Response, _next: NextFunction) => {
		try {
			res.status(200).json(
				buildSuccessResponse(
					"Training & Performance catalog retrieved successfully",
					{
						lmsRoles: {
							assignable: ASSIGNABLE_LMS_ROLES,
							nonAssignable: NON_ASSIGNABLE_LMS_ROLES,
							all: LMS_USER_ROLES,
						},
						epmrSubroles: {
							assignable: [...EPMR_SUBROLE_ORDER],
							removable: [...DEFAULT_EPMR_SUBROLES],
							explicitOnly: ["epmr_admin", "epmr_qa"],
						},
						defaultEpmrSubroles: [...DEFAULT_EPMR_SUBROLES],
						provisioningStatuses: ["PENDING", "SYNCED", "FAILED", "BLOCKED"],
						employmentBlockingStatuses: [...EMPLOYEE_SELF_SERVICE_BLOCKING_STATUSES],
					},
					200,
				),
			);
		} catch (error) {
			accessLogger.error(`Failed to get application catalog: ${error}`);
			res.status(500).json(buildErrorResponse("Failed to get application catalog", 500));
		}
	};

	return { listAccess, getAccess, updateAccess, getCatalog };
};

const summarizeEffective = (effective: EffectiveTrainingPerformanceAccess) => ({
	lmsRole: effective.effectiveLmsRole,
	epmrSubroles: effective.effectiveEpmrSubroles,
	inherited: effective.inherited,
	eligible: effective.eligible,
});
