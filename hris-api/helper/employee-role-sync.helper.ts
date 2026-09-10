import type { PrismaClient } from "../generated/prisma";
import {
	deriveRoleAndFlags,
	type DerivedRoleFlags,
	type HrisRole,
} from "../utils/role-derivation";

const HR_ROLES = new Set<string>(["hris-hr-user", "hris-hr-manager", "hris-admin"]);

export type EmployeeRoleSyncSummary = {
	scanned: number;
	updated: number;
	unchanged: number;
	samples: Array<{
		employeeId: string;
		beforeRole: string | null;
		afterRole: HrisRole;
		sectionCode?: string | null;
		sectionName?: string | null;
	}>;
};

/**
 * Re-derive Employee.role / isManager / isHrManager from department + section HR flags
 * and level/position manager flags. Used after DM1 section IS_HR imports and repairs.
 *
 * Login and app shells use the stored Employee.role — section.isHr alone does not
 * make a user HR until this role is written on the employee row.
 */
export async function syncEmployeeRolesFromOrgStructure(
	prisma: PrismaClient,
	params: {
		organizationId: string;
		/** When set, only employees in these section ids are scanned. */
		sectionIds?: string[];
		/** When set, only these employee ids are scanned (e.g. line-leader members). */
		employeeIds?: string[];
		/** Limit sample rows returned for reports/logs. */
		sampleLimit?: number;
	},
): Promise<EmployeeRoleSyncSummary> {
	const sampleLimit = Math.max(0, params.sampleLimit ?? 20);
	const where: Record<string, unknown> = {
		organizationId: params.organizationId,
		isDeleted: false,
	};
	if (params.sectionIds?.length) {
		where.sectionId = { in: params.sectionIds };
	}
	if (params.employeeIds?.length) {
		where.id = { in: params.employeeIds };
	}

	const employees = await (prisma as any).employee.findMany({
		where,
		select: {
			id: true,
			employeeId: true,
			role: true,
			isManager: true,
			isHrManager: true,
			department: {
				select: { id: true, name: true, code: true, isHr: true },
			},
			section: {
				select: { id: true, name: true, code: true, isHr: true },
			},
			level: {
				select: { id: true, name: true, isManager: true },
			},
			position: {
				select: { id: true, title: true },
			},
			lineLeaderSections: {
				select: { sectionId: true },
			},
		},
	});

	const summary: EmployeeRoleSyncSummary = {
		scanned: employees.length,
		updated: 0,
		unchanged: 0,
		samples: [],
	};

	for (const employee of employees) {
		const derived = deriveEmployeeRoleFromOrgLinks(employee, {
			isLineLeader: (employee.lineLeaderSections || []).length > 0,
		});
		const beforeRole = employee.role || null;
		const needsUpdate =
			beforeRole !== derived.role ||
			Boolean(employee.isManager) !== derived.isManager ||
			Boolean(employee.isHrManager) !== derived.isHrManager;

		if (!needsUpdate) {
			summary.unchanged += 1;
			continue;
		}

		const updatedEmployee = await (prisma as any).employee.update({
			where: { id: employee.id },
			data: {
				role: derived.role,
				isManager: derived.isManager,
				isHrManager: derived.isHrManager,
			},
			select: { id: true, userId: true },
		});

		// Login/sidebar use the role from the auth profile, which prefers Employee.role
		// but still persists User.role. Keep User.role aligned for JWT and admin lists.
		const linkedUserId = String(updatedEmployee?.userId || "").trim();
		if (linkedUserId) {
			try {
				await (prisma as any).user.update({
					where: { id: linkedUserId },
					data: { role: derived.role },
				});
			} catch {
				// Best effort: employee role is still the HRIS source of truth.
			}
		}

		summary.updated += 1;
		if (summary.samples.length < sampleLimit) {
			summary.samples.push({
				employeeId: employee.employeeId,
				beforeRole,
				afterRole: derived.role,
				sectionCode: employee.section?.code || null,
				sectionName: employee.section?.name || null,
			});
		}
	}

	return summary;
}

export function deriveEmployeeRoleFromOrgLinks(
	employee: {
		department?: {
			name?: string | null;
			code?: string | null;
			isHr?: boolean | null;
		} | null;
		section?: {
			name?: string | null;
			code?: string | null;
			isHr?: boolean | null;
		} | null;
		level?: {
			name?: string | null;
			isManager?: boolean | null;
		} | null;
		position?: {
			title?: string | null;
		} | null;
	},
	options?: {
		/** Active section_line_leaders membership for this employee. */
		isLineLeader?: boolean;
	},
): DerivedRoleFlags {
	const sectionIsHr = Boolean(employee.section?.isHr);
	return deriveRoleAndFlags({
		department: {
			// Section IS_HR is first-class for BNPI GA/HR (department stays Administration).
			isHr: Boolean(employee.department?.isHr) || sectionIsHr,
			name: employee.department?.name || null,
			code: employee.department?.code || null,
		},
		level: {
			isManager: Boolean(employee.level?.isManager),
			name: employee.level?.name || null,
		},
		position: {
			// Position titles are not manager flags in deriveRoleAndFlags unless isManager is set.
			// Pass title as name for level-name style matching only when useful; keep false.
			isManager: false,
			name: employee.position?.title || null,
		},
		isLineLeader: Boolean(options?.isLineLeader),
	});
}

/**
 * Re-derive roles for the employees whose line-leader membership just changed
 * (added or removed on a section). Upgrades plain employees to
 * hris-line-leader and demotes former leaders whose membership dropped to zero,
 * while never stripping an HR/manager role earned from org structure.
 */
export async function syncLineLeaderRolesForEmployees(
	prisma: PrismaClient,
	params: {
		organizationId: string;
		employeeIds: string[];
		sampleLimit?: number;
	},
): Promise<EmployeeRoleSyncSummary> {
	const employeeIds = Array.from(new Set(params.employeeIds.filter(Boolean)));
	if (employeeIds.length === 0) {
		return { scanned: 0, updated: 0, unchanged: 0, samples: [] };
	}
	return syncEmployeeRolesFromOrgStructure(prisma, {
		organizationId: params.organizationId,
		employeeIds,
		sampleLimit: params.sampleLimit,
	});
}

export function isHrAppRole(role?: string | null): boolean {
	return HR_ROLES.has(String(role || "").trim().toLowerCase());
}
