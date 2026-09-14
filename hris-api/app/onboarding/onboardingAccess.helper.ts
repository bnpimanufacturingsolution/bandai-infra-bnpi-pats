import { Request } from "express";
import { PrismaClient } from "../../generated/prisma";

export const ONBOARDING_ADMIN_ROLES = new Set(["admin", "hris-admin", "super_admin", "superadmin"]);
export const ONBOARDING_HR_ROLES = new Set(["hris-hr-manager", "hris-hr-user"]);

export interface OnboardingActor {
	userId: string;
	role: string;
	organizationId: string;
	employeeId: string | null;
	employeeNumber: string | null;
	departmentId: string | null;
	departmentName: string | null;
	employmentStatus: string | null;
	fullName: string;
	isAdmin: boolean;
	isHr: boolean;
}

const asRecord = (value: unknown): Record<string, any> =>
	value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};

const getJsonString = (value: unknown, key: string): string => {
	const raw = asRecord(value)[key];
	return typeof raw === "string" ? raw : "";
};

export interface AuthedRequest extends Request {
	userId?: string;
	role?: string;
	organizationId?: string;
	firstName?: string;
	lastName?: string;
	metadata?: {
		employee?: {
			id: string;
		};
	};
}

/**
 * Resolves the onboarding actor (JWT user + employee profile + department).
 * Returns null only when the request has no authenticated identity.
 */
export const resolveOnboardingActor = async (
	prisma: PrismaClient,
	req: AuthedRequest,
): Promise<OnboardingActor | null> => {
	const userId = String(req.userId || "").trim();
	if (!userId) {
		return null;
	}

	const role = String(req.role || "").trim();
	const organizationId = String(req.organizationId || "").trim();

	const tokenEmployeeId = String(req.metadata?.employee?.id || "").trim();
	const employee = await prisma.employee.findFirst({
		where: tokenEmployeeId
			? { id: tokenEmployeeId, isDeleted: false }
			: { userId, isDeleted: false },
		select: {
			id: true,
			employeeId: true,
			departmentId: true,
			employmentStatus: true,
			department: { select: { id: true, name: true } },
			person: { select: { personalInfo: true } },
		},
	});

	const firstName =
		getJsonString(employee?.person?.personalInfo, "firstName").trim() ||
		String(req.firstName || "").trim();
	const lastName =
		getJsonString(employee?.person?.personalInfo, "lastName").trim() ||
		String(req.lastName || "").trim();
	const fullName = `${firstName} ${lastName}`.trim() || String(employee?.employeeId || "").trim();

	return {
		userId,
		role,
		organizationId,
		employeeId: employee?.id || null,
		employeeNumber: employee?.employeeId || null,
		departmentId: employee?.departmentId || null,
		departmentName: employee?.department?.name || null,
		employmentStatus: employee?.employmentStatus || null,
		fullName: fullName || "Employee",
		isAdmin: ONBOARDING_ADMIN_ROLES.has(role),
		isHr: ONBOARDING_HR_ROLES.has(role),
	};
};

export const canManageOnboardingTemplates = (actor: OnboardingActor): boolean => actor.isAdmin;

export const canManageOnboardingChecklists = (actor: OnboardingActor): boolean =>
	actor.isAdmin || actor.isHr;

export const canViewFullOnboardingChecklist = (
	actor: OnboardingActor,
	checklistEmployeeId: string,
): boolean =>
	actor.isAdmin || actor.isHr || actor.employeeId === checklistEmployeeId;

export interface AttachableItem {
	id: string;
	parentId: string | null;
	order?: number;
	number?: string;
}

/**
 * Builds a nested forest from a flat item list. Orphan children (parent not in
 * the visible set) are promoted to roots so numbering context is never lost.
 */
export const attachOnboardingChildren = <T extends AttachableItem>(items: T[]): any[] => {
	const byId = new Map<string, any>();
	for (const item of items) {
		byId.set(item.id, { ...item, children: [] });
	}
	const roots: any[] = [];
	for (const item of items) {
		const node = byId.get(item.id);
		if (item.parentId && byId.has(item.parentId)) {
			byId.get(item.parentId).children.push(node);
		} else {
			roots.push(node);
		}
	}
	const sortTree = (nodes: any[]) => {
		nodes.sort(
			(a, b) =>
				(Number(a.order) || 0) - (Number(b.order) || 0) ||
				String(a.number || "").localeCompare(String(b.number || "")),
		);
		nodes.forEach((n) => sortTree(n.children));
	};
	sortTree(roots);
	return roots;
};

export interface OnboardingVisibleView {
	view: "full" | "department" | "self";
	sections: any[];
}

/**
 * Single source of truth for the department-scoped checklist view.
 * - admin/HR/onboarded-self see every item (self cannot sign).
 * - other employees see their own-department items PLUS no-department items as
 *   read-only context. canSign is computed per item.
 */
export const buildOnboardingVisibleView = (
	checklist: any,
	actor: OnboardingActor,
): OnboardingVisibleView => {
	const fullView = canViewFullOnboardingChecklist(actor, checklist.employeeId);
	const isSelf = actor.employeeId === checklist.employeeId;

	const canSignFor = (item: any) => {
		if (item.status !== "PENDING") return false;
		return evaluateOnboardingSignPermission(
			actor,
			{ responsibleDepartmentId: item.responsibleDepartmentId || null },
			checklist.employeeId,
		).allowed;
	};
	const decorate = (item: any) => ({
		...item,
		responsibleDepartmentId: item.responsibleDepartmentId || null,
		canSign: canSignFor(item),
		isContextOnly: !fullView && !item.responsibleDepartmentId && !isSelf,
	});

	let sections: any[];
	if (fullView) {
		sections = checklist.sections.map((section: any) => ({
			...section,
			items: attachOnboardingChildren(section.items.map(decorate)),
		}));
	} else {
		sections = checklist.sections
			.map((section: any) => {
				const visible = section.items.filter(
					(item: any) =>
						!item.responsibleDepartmentId ||
						item.responsibleDepartmentId === actor.departmentId,
				);
				return { ...section, items: attachOnboardingChildren(visible.map(decorate)) };
			})
			.filter((section: any) => section.items.length > 0);
	}
	return { view: isSelf ? "self" : fullView ? "full" : "department", sections };
};

export interface OnboardingSignDecision {
	allowed: boolean;
	status?: number;
	reason?: string;
}

/**
 * Password-signature gate:
 * - the onboarded employee can NEVER sign their own checklist;
 * - admin/HR may sign any item;
 * - other employees may only sign items whose responsible department matches theirs
 *   (no-department items are context-only for them, admin/HR sign those).
 */
export const evaluateOnboardingSignPermission = (
	actor: OnboardingActor,
	item: { responsibleDepartmentId: string | null },
	checklistEmployeeId: string,
): OnboardingSignDecision => {
	if (!actor.employeeId) {
		return {
			allowed: false,
			status: 403,
			reason: "Your account is not linked to an employee profile.",
		};
	}

	if (actor.employeeId === checklistEmployeeId) {
		return {
			allowed: false,
			status: 403,
			reason: "Onboarding employees cannot sign their own checklist.",
		};
	}

	if (actor.isAdmin || actor.isHr) {
		return { allowed: true };
	}

	if (!item.responsibleDepartmentId) {
		return {
			allowed: false,
			status: 403,
			reason:
				"This item has no responsible department and can only be signed by HR or Admin.",
		};
	}

	if (!actor.departmentId || actor.departmentId !== item.responsibleDepartmentId) {
		return {
			allowed: false,
			status: 403,
			reason: "Only the responsible department can sign this item.",
		};
	}

	return { allowed: true };
};
