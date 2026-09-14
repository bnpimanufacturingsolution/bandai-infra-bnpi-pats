import { Prisma } from "../../generated/prisma";
import { getLogger } from "../../helper/logger.helper";
import { isActionableOnboardingItem } from "./onboardingAccess.helper";

const logger = getLogger();
const lifecycleLogger = logger.child({ module: "onboardingLifecycle" });

type TransactionCapableClient = Prisma.TransactionClient | any;

const asRecord = (value: unknown): Record<string, any> =>
	value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};

const formatPersonNameLocal = (person: any | null, fallback = "Employee"): string => {
	const info = asRecord(person?.personalInfo);
	const firstName = typeof info.firstName === "string" ? info.firstName.trim() : "";
	const lastName = typeof info.lastName === "string" ? info.lastName.trim() : "";
	return `${firstName} ${lastName}`.trim() || fallback;
};

export const ONBOARDING_TREE_INCLUDE = {
	sections: {
		where: { isDeleted: false },
		orderBy: { order: "asc" as const },
		include: {
			items: {
				where: { isDeleted: false },
				orderBy: [{ order: "asc" as const }, { number: "asc" as const }],
			},
		},
	},
};

export interface EnsureOnboardingChecklistParams {
	employeeId: string;
	organizationId: string;
	/** Explicit template; when omitted the org's single active template is resolved. */
	templateId?: string | null;
	title?: string | null;
	targetDate?: Date | null;
	/**
	 * Hire-hook mode: skip provisioning when no template exists yet instead of
	 * creating an empty checklist.
	 */
	requireTemplate?: boolean;
}

export interface EnsureOnboardingChecklistResult {
	status: "created" | "exists" | "skipped";
	reason?: "no-template" | "employee-not-found";
	checklistId?: string;
}

/**
 * Idempotent onboarding-checklist provisioning shared by the create endpoint, the
 * create-on-hire hooks, and provision-all. Returns "exists" without touching rows when
 * the employee already has a non-deleted checklist, so overlapping calls never duplicate.
 */
export const ensureOnboardingChecklistForEmployee = async (
	prisma: TransactionCapableClient,
	params: EnsureOnboardingChecklistParams,
): Promise<EnsureOnboardingChecklistResult> => {
	const { employeeId, organizationId, requireTemplate } = params;

	const existing = await prisma.onboardingChecklist.findFirst({
		where: { employeeId, organizationId, isDeleted: false },
		select: { id: true },
	});
	if (existing) {
		return { status: "exists", checklistId: existing.id };
	}

	const employee = await prisma.employee.findFirst({
		where: { id: employeeId, organizationId, isDeleted: false },
		select: {
			id: true,
			employmentStartDate: true,
			person: { select: { personalInfo: true } },
		},
	});
	if (!employee) {
		return { status: "skipped", reason: "employee-not-found" };
	}

	let templateId = params.templateId || null;
	if (templateId) {
		const explicit = await prisma.onboardingTemplate.findFirst({
			where: { id: templateId, organizationId, isDeleted: false },
			select: { id: true },
		});
		if (!explicit) {
			throw Object.assign(new Error("Onboarding template not found"), { code: "TEMPLATE_NOT_FOUND" });
		}
	} else {
		const active = await prisma.onboardingTemplate.findFirst({
			where: { organizationId, isDeleted: false, isActive: true },
			orderBy: [{ createdAt: "asc" }],
			select: { id: true },
		});
		templateId = active?.id || null;
	}

	if (!templateId && requireTemplate) {
		return { status: "skipped", reason: "no-template" };
	}

	const template = templateId
		? await prisma.onboardingTemplate.findFirst({
				where: { id: templateId, organizationId, isDeleted: false },
				include: ONBOARDING_TREE_INCLUDE,
			})
		: null;

	const created = await prisma.$transaction(async (tx: any) => {
		const checklist = await tx.onboardingChecklist.create({
			data: {
				organizationId,
				employeeId,
				templateId: templateId || null,
				title:
					params.title || `Onboarding Checklist - ${formatPersonNameLocal(employee.person)}`,
				targetDate: params.targetDate || employee.employmentStartDate || new Date(),
				status: "ACTIVE",
			},
		});

		if (template) {
			for (const section of template.sections) {
				const newSection = await tx.onboardingSection.create({
					data: {
						organizationId,
						checklistId: checklist.id,
						title: section.title,
						order: section.order,
					},
				});
				const idMap = new Map<string, string>();
				const depthOf = (itemId: string, seen = 0): number => {
					const candidate = section.items.find((i: any) => i.id === itemId);
					if (!candidate || !candidate.parentId) return seen;
					return depthOf(candidate.parentId, seen + 1);
				};
				const ordered = [...section.items].sort(
					(a: any, b: any) => depthOf(a.id) - depthOf(b.id),
				);
				for (const item of ordered) {
					const newItem = await tx.onboardingItem.create({
						data: {
							organizationId,
							sectionId: newSection.id,
							parentId: item.parentId ? idMap.get(item.parentId) || null : null,
							number: item.number,
							title: item.title,
							description: item.description,
							responsibleDepartmentId: item.responsibleDepartmentId,
							responsibleDepartmentName: item.responsibleDepartmentName,
							order: item.order,
						},
					});
					idMap.set(item.id, newItem.id);
				}
			}
		}

		return checklist;
	});

	lifecycleLogger.info(
		`Onboarding checklist ${created.id} provisioned for employee ${employeeId} (template=${templateId || "none"})`,
	);
	return { status: "created", checklistId: created.id };
};

/**
 * Single source for dedicated-checklist progress math (controller sign/unsign/edit paths
 * + the ONBOARDING resync script). Only ACTIONABLE items (responsible department set)
 * count; no-department rows act like sections and are excluded. A checklist with zero
 * actionable items is honestly 100% / COMPLETED — there is nothing left to sign.
 */
export const recomputeOnboardingChecklistProgress = async (
	tx: TransactionCapableClient,
	checklistId: string,
): Promise<{ completionPercentage: number; status: string }> => {
	const items = await tx.onboardingItem.findMany({
		where: { section: { checklistId }, isDeleted: false },
		select: { id: true, status: true, responsibleDepartmentId: true },
	});
	const actionable = items.filter((i: any) => isActionableOnboardingItem(i));
	const completedActionable = actionable.filter((i: any) => i.status === "COMPLETED");
	const completionPercentage = actionable.length
		? Math.round((completedActionable.length / actionable.length) * 100)
		: 100;
	const status =
		completedActionable.length === actionable.length ? "COMPLETED" : "ACTIVE";
	await tx.onboardingChecklist.update({
		where: { id: checklistId },
		data: { completionPercentage, status: status as "ACTIVE" | "COMPLETED" },
	});
	return { completionPercentage, status };
};
