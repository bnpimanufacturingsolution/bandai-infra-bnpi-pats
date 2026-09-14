import { Request, Response, NextFunction } from "express";
import { PrismaClient, Prisma } from "../../generated/prisma";
import { getLogger } from "../../helper/logger.helper";
import { buildSuccessResponse } from "../../helper/success-handler.helper";
import { buildErrorResponse, formatZodErrors, type ErrorDetail } from "../../helper/error-handler";
import { isValidEntityId } from "../../helper/id-validation.helper";
import { syncEmployeeEmploymentStatus } from "../../helper/boarding-documents.helper";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import {
	resolveOnboardingActor,
	canManageOnboardingTemplates,
	canManageOnboardingChecklists,
	evaluateOnboardingSignPermission,
	attachOnboardingChildren as attachChildren,
	buildOnboardingVisibleView,
	type OnboardingActor,
	type AuthedRequest,
} from "./onboardingAccess.helper";
import { ensureOnboardingChecklistForEmployee } from "./onboardingLifecycle.helper";
import {
	CreateOnboardingTemplateSchema,
	UpdateOnboardingTemplateSchema,
	CreateOnboardingSectionSchema,
	UpdateOnboardingSectionSchema,
	CreateOnboardingItemSchema,
	BulkCreateOnboardingItemsSchema,
	UpdateOnboardingItemSchema,
	ReplaceOnboardingTemplateTreeSchema,
	CreateOnboardingChecklistSchema,
	UpdateOnboardingChecklistSchema,
	ProvisionOnboardingChecklistsSchema,
	SignOnboardingItemSchema,
} from "../../zod/onboarding";

const logger = getLogger();
const bcrypt = require("bcryptjs") as {
	compare(candidate: string, hash: string): Promise<boolean>;
};
const onboardingLogger = logger.child({ module: "onboarding" });

const MAX_ITEM_DEPTH = 3;

const asRecord = (value: unknown): Record<string, any> =>
	value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};
const getJsonString = (value: unknown, key: string): string => {
	const raw = asRecord(value)[key];
	return typeof raw === "string" ? raw : "";
};

const formatPersonName = (person: any | null, fallback = "Employee"): string => {
	const firstName = getJsonString(person?.personalInfo, "firstName").trim();
	const lastName = getJsonString(person?.personalInfo, "lastName").trim();
	return `${firstName} ${lastName}`.trim() || fallback;
};

const isInvalidId = (value: string | undefined): boolean => !value || !isValidEntityId(value);

interface ResolvedItemRef {
	kind: "checklist" | "template";
	record: any;
	checklistEmployeeId?: string;
}

export const controller = (prisma: PrismaClient) => {
	// -------------------------------------------------------------------------
	// Internal helpers
	// -------------------------------------------------------------------------

	const fail = (
		res: Response,
		status: number,
		message: string,
		errors?: ErrorDetail[],
	) => {
		res.status(status).json(buildErrorResponse(message, status, errors));
	};

	const requireActor = async (
		req: AuthedRequest,
		res: Response,
	): Promise<OnboardingActor | null> => {
		const actor = await resolveOnboardingActor(prisma, req);
		if (!actor || !actor.userId) {
			fail(res, 401, "Unauthorized");
			return null;
		}
		return actor;
	};

	const track = (req: Request, actor: OnboardingActor | null, action: string, description: string) => {
		logActivity(req, {
			userId: actor?.userId || "unknown",
			action,
			description,
			organizationId: actor?.organizationId,
			page: { url: req.originalUrl, title: "Onboarding Checklist" },
		});
	};

	const audit = (
		req: Request,
		actor: OnboardingActor | null,
		action: string,
		resource: string,
		entityId: string,
		changesAfter: unknown,
		description: string,
		severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" = "LOW",
	) => {
		logAudit(req, {
			userId: actor?.userId || "unknown",
			action,
			resource,
			severity,
			entityType: resource,
			entityId,
			changesBefore: null,
			changesAfter: { ...asRecord(changesAfter), id: entityId },
			description,
			organizationId: actor?.organizationId,
		});
	};

	const treeInclude = {
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

	const itemDepth = async (
		tx: Prisma.TransactionClient,
		kind: "checklist" | "template",
		parentId: string | null,
	): Promise<number> => {
		let depth = 1;
		let currentParentId = parentId;
		while (currentParentId) {
			const parent =
				kind === "checklist"
					? await tx.onboardingItem.findUnique({
							where: { id: currentParentId },
							select: { parentId: true },
						})
					: await tx.onboardingTemplateItem.findUnique({
							where: { id: currentParentId },
							select: { parentId: true },
						});
			if (!parent) break;
			depth += 1;
			currentParentId = parent.parentId;
			if (depth > MAX_ITEM_DEPTH + 1) break;
		}
		return depth;
	};

	const recomputeChecklistProgress = async (
		tx: Prisma.TransactionClient,
		checklistId: string,
	): Promise<{ completionPercentage: number; status: string }> => {
		const items = await tx.onboardingItem.findMany({
			where: { section: { checklistId }, isDeleted: false },
			select: { id: true, parentId: true, status: true },
		});
		const parentIds = new Set(items.map((i) => i.parentId).filter(Boolean) as string[]);
		const leaves = items.filter((i) => !parentIds.has(i.id));
		const completedLeaves = leaves.filter((i) => i.status === "COMPLETED");
		const completionPercentage = leaves.length
			? Math.round((completedLeaves.length / leaves.length) * 100)
			: 0;
		const status =
			leaves.length > 0 && completedLeaves.length === leaves.length ? "COMPLETED" : "ACTIVE";
		await tx.onboardingChecklist.update({
			where: { id: checklistId },
			data: { completionPercentage, status: status as "ACTIVE" | "COMPLETED" },
		});
		return { completionPercentage, status };
	};

	/**
	 * Design C: after any dedicated-checklist completion change, re-evaluate the shared
	 * ONBOARDING/ACTIVE gate (legacy items AND dedicated items both complete -> ACTIVE).
	 * Best-effort; never fails the originating request. Returns the new status if known.
	 */
	const syncEmploymentForChecklist = async (
		checklistId: string,
	): Promise<string | null> => {
		try {
			const checklist = await prisma.onboardingChecklist.findFirst({
				where: { id: checklistId, isDeleted: false },
				select: { employeeId: true },
			});
			if (!checklist) return null;
			const result = await syncEmployeeEmploymentStatus({
				prisma,
				employeeId: checklist.employeeId,
			});
			return result?.employmentStatus || null;
		} catch (syncError) {
			onboardingLogger.warn(
				`employment status sync skipped for checklist ${checklistId}: ${syncError}`,
			);
			return null;
		}
	};

	const collectDescendantIds = async (
		tx: Prisma.TransactionClient,
		kind: "checklist" | "template",
		rootId: string,
	): Promise<string[]> => {
		const ids = [rootId];
		let frontier = [rootId];
		while (frontier.length > 0) {
			const children =
				kind === "checklist"
					? await tx.onboardingItem.findMany({
							where: { parentId: { in: frontier }, isDeleted: false },
							select: { id: true },
						})
					: await tx.onboardingTemplateItem.findMany({
							where: { parentId: { in: frontier }, isDeleted: false },
							select: { id: true },
						});
			frontier = children.map((c) => c.id).filter((id) => !ids.includes(id));
			ids.push(...frontier);
		}
		return ids;
	};

	const resolveItemRef = async (id: string): Promise<ResolvedItemRef | null> => {
		const checklistItem = await prisma.onboardingItem.findFirst({
			where: { id, isDeleted: false },
			include: { section: { select: { checklistId: true, checklist: { select: { employeeId: true } } } } },
		});
		if (checklistItem) {
			return {
				kind: "checklist",
				record: checklistItem,
				checklistEmployeeId: checklistItem.section?.checklist?.employeeId,
			};
		}
		const templateItem = await prisma.onboardingTemplateItem.findFirst({
			where: { id, isDeleted: false },
			include: { section: { select: { templateId: true } } },
		});
		if (templateItem) {
			return { kind: "template", record: templateItem };
		}
		return null;
	};

	const checklistMetaSelect = {
		employee: {
			select: {
				id: true,
				employeeId: true,
				employmentStartDate: true,
				department: { select: { id: true, name: true } },
				person: { select: { personalInfo: true } },
			},
		},
	};

	// -------------------------------------------------------------------------
	// Roster
	// -------------------------------------------------------------------------

	const getRoster = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const actor = await requireActor(req as AuthedRequest, res);
			if (!actor) return;

			const search = String(req.query.search || "").trim();
			const departmentId = String(req.query.departmentId || "").trim();
			const terms = search.split(/\s+/).filter((term) => term.length > 0);

			const pageParam = Number.parseInt(String(req.query.page || ""), 10);
			const limitParam = Number.parseInt(String(req.query.limit || ""), 10);
			const page = Number.isNaN(pageParam) || pageParam < 1 ? 1 : pageParam;
			const limit =
				Number.isNaN(limitParam) || limitParam < 1 ? 10 : Math.min(limitParam, 100);

			const whereClause: any = {
				organizationId: actor.organizationId,
				isDeleted: false,
				employmentStatus: "ONBOARDING",
				...(departmentId && !isInvalidId(departmentId) ? { departmentId } : {}),
				...(terms.length > 0
					? {
							AND: terms.map((term) => ({
								OR: [
									{ employeeId: { contains: term, mode: "insensitive" as const } },
									{
										person: {
											is: {
												personalInfo: {
													path: ["firstName"],
													string_contains: term,
													mode: "insensitive" as const,
												},
											},
										},
									},
									{
										person: {
											is: {
												personalInfo: {
													path: ["lastName"],
													string_contains: term,
													mode: "insensitive" as const,
												},
											},
										},
									},
								],
							})),
						}
					: {}),
			};

			const [employees, total] = await Promise.all([
				prisma.employee.findMany({
					where: whereClause,
					orderBy: { employmentStartDate: "asc" },
					skip: (page - 1) * limit,
					take: limit,
					select: {
						id: true,
						employeeId: true,
						employmentStatus: true,
						employmentStartDate: true,
						department: { select: { id: true, name: true } },
						person: { select: { personalInfo: true } },
						onboardingChecklists: {
							where: { isDeleted: false },
							orderBy: { createdAt: "desc" },
							take: 1,
							select: {
								id: true,
								title: true,
								status: true,
								completionPercentage: true,
							},
						},
					},
				}),
				prisma.employee.count({ where: whereClause }),
			]);

			const data = employees.map((employee) => ({
				employeeId: employee.id,
				employeeNumber: employee.employeeId,
				name: formatPersonName(employee.person),
				department: employee.department?.name || null,
				departmentId: employee.department?.id || null,
				employmentStartDate: employee.employmentStartDate,
				checklist: employee.onboardingChecklists[0] || null,
			}));

			const pagination = {
				total,
				page,
				limit,
				totalPages: Math.max(1, Math.ceil(total / limit)),
			};

			track(req, actor, "GET_ONBOARDING_ROSTER", `Listed ${data.length}/${total} onboarding employees (page ${page})`);
			res.status(200).json(
				buildSuccessResponse("Onboarding employees retrieved", { employees: data, pagination }, 200),
			);
		} catch (error) {
			onboardingLogger.error(`onboarding.getRoster failed: ${error}`);
			fail(res, 500, "Error getting onboarding employees");
		}
	};

	// -------------------------------------------------------------------------
	// Templates
	// -------------------------------------------------------------------------

	const listTemplates = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const actor = await requireActor(req as AuthedRequest, res);
			if (!actor) return;
			if (!(actor.isAdmin || actor.isHr)) {
				fail(res, 403, "Only admin or HR can view onboarding templates");
				return;
			}

			const search = String(req.query.search || "").trim();
			const templates = await prisma.onboardingTemplate.findMany({
				where: {
					organizationId: actor.organizationId,
					isDeleted: false,
					...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
				},
				orderBy: { createdAt: "desc" },
				include: { _count: { select: { sections: true } } },
			});

			track(req, actor, "LIST_ONBOARDING_TEMPLATES", "Listed onboarding templates");
			res.status(200).json(buildSuccessResponse("Templates retrieved", { templates }, 200));
		} catch (error) {
			onboardingLogger.error(`onboarding.listTemplates failed: ${error}`);
			fail(res, 500, "Error getting onboarding templates");
		}
	};

	const getTemplate = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const actor = await requireActor(req as AuthedRequest, res);
			if (!actor) return;
			if (!(actor.isAdmin || actor.isHr)) {
				fail(res, 403, "Only admin or HR can view onboarding templates");
				return;
			}
			const { id } = req.params;
			if (isInvalidId(id)) {
				fail(res, 400, "Invalid template ID format");
				return;
			}

			const template = await prisma.onboardingTemplate.findFirst({
				where: { id, organizationId: actor.organizationId, isDeleted: false },
				include: treeInclude,
			});
			if (!template) {
				fail(res, 404, "Onboarding template not found");
				return;
			}

			const built = {
				...template,
				sections: template.sections.map((section) => ({
					...section,
					items: attachChildren(section.items),
				})),
			};
			track(req, actor, "GET_ONBOARDING_TEMPLATE", `Read template ${id}`);
			res.status(200).json(buildSuccessResponse("Template retrieved", { template: built }, 200));
		} catch (error) {
			onboardingLogger.error(`onboarding.getTemplate failed: ${error}`);
			fail(res, 500, "Error getting onboarding template");
		}
	};

	const createTemplate = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const actor = await requireActor(req as AuthedRequest, res);
			if (!actor) return;
			if (!canManageOnboardingTemplates(actor)) {
				fail(res, 403, "Only admin can create onboarding templates");
				return;
			}
			const validation = CreateOnboardingTemplateSchema.safeParse(req.body);
			if (!validation.success) {
				fail(res, 400, "Validation failed", formatZodErrors(validation.error.format()));
				return;
			}

			const template = await prisma.onboardingTemplate.create({
				data: {
					organizationId: actor.organizationId,
					name: validation.data.name.trim(),
					description: validation.data.description ?? null,
					isActive: validation.data.isActive ?? true,
				},
			});

			track(req, actor, "CREATE_ONBOARDING_TEMPLATE", `Created template ${template.id}`);
			audit(req, actor, "CREATE", "ONBOARDING_TEMPLATE", template.id, { name: template.name }, "Onboarding template created");
			res.status(201).json(buildSuccessResponse("Template created", { template }, 201));
		} catch (error) {
			onboardingLogger.error(`onboarding.createTemplate failed: ${error}`);
			fail(res, 500, "Error creating onboarding template");
		}
	};

	const updateTemplate = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const actor = await requireActor(req as AuthedRequest, res);
			if (!actor) return;
			if (!canManageOnboardingTemplates(actor)) {
				fail(res, 403, "Only admin can update onboarding templates");
				return;
			}
			const { id } = req.params;
			if (isInvalidId(id)) {
				fail(res, 400, "Invalid template ID format");
				return;
			}
			const validation = UpdateOnboardingTemplateSchema.safeParse(req.body);
			if (!validation.success) {
				fail(res, 400, "Validation failed", formatZodErrors(validation.error.format()));
				return;
			}

			const existing = await prisma.onboardingTemplate.findFirst({
				where: { id, organizationId: actor.organizationId, isDeleted: false },
			});
			if (!existing) {
				fail(res, 404, "Onboarding template not found");
				return;
			}

			const template = await prisma.onboardingTemplate.update({
				where: { id },
				data: validation.data,
			});
			track(req, actor, "UPDATE_ONBOARDING_TEMPLATE", `Updated template ${id}`);
			audit(req, actor, "UPDATE", "ONBOARDING_TEMPLATE", id, validation.data, "Onboarding template updated");
			res.status(200).json(buildSuccessResponse("Template updated", { template }, 200));
		} catch (error) {
			onboardingLogger.error(`onboarding.updateTemplate failed: ${error}`);
			fail(res, 500, "Error updating onboarding template");
		}
	};

	const deleteTemplate = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const actor = await requireActor(req as AuthedRequest, res);
			if (!actor) return;
			if (!canManageOnboardingTemplates(actor)) {
				fail(res, 403, "Only admin can delete onboarding templates");
				return;
			}
			const { id } = req.params;
			if (isInvalidId(id)) {
				fail(res, 400, "Invalid template ID format");
				return;
			}
			const existing = await prisma.onboardingTemplate.findFirst({
				where: { id, organizationId: actor.organizationId, isDeleted: false },
			});
			if (!existing) {
				fail(res, 404, "Onboarding template not found");
				return;
			}

			await prisma.$transaction(async (tx) => {
				await tx.onboardingTemplateItem.updateMany({
					where: { section: { templateId: id } },
					data: { isDeleted: true, parentId: null },
				});
				await tx.onboardingTemplateSection.updateMany({
					where: { templateId: id },
					data: { isDeleted: true },
				});
				await tx.onboardingTemplate.update({ where: { id }, data: { isDeleted: true } });
			});

			track(req, actor, "DELETE_ONBOARDING_TEMPLATE", `Deleted template ${id}`);
			audit(req, actor, "DELETE", "ONBOARDING_TEMPLATE", id, null, "Onboarding template deleted");
			res.status(200).json(buildSuccessResponse("Template deleted", {}, 200));
		} catch (error) {
			onboardingLogger.error(`onboarding.deleteTemplate failed: ${error}`);
			fail(res, 500, "Error deleting onboarding template");
		}
	};

	const createTemplateSection = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const actor = await requireActor(req as AuthedRequest, res);
			if (!actor) return;
			if (!canManageOnboardingTemplates(actor)) {
				fail(res, 403, "Only admin can edit onboarding templates");
				return;
			}
			const { id } = req.params;
			if (isInvalidId(id)) {
				fail(res, 400, "Invalid template ID format");
				return;
			}
			const validation = CreateOnboardingSectionSchema.safeParse(req.body);
			if (!validation.success) {
				fail(res, 400, "Validation failed", formatZodErrors(validation.error.format()));
				return;
			}
			const template = await prisma.onboardingTemplate.findFirst({
				where: { id, organizationId: actor.organizationId, isDeleted: false },
			});
			if (!template) {
				fail(res, 404, "Onboarding template not found");
				return;
			}
			const count = await prisma.onboardingTemplateSection.count({ where: { templateId: id, isDeleted: false } });

			const section = await prisma.onboardingTemplateSection.create({
				data: {
					organizationId: actor.organizationId,
					templateId: id,
					title: validation.data.title.trim(),
					order: validation.data.order ?? count + 1,
				},
			});
			track(req, actor, "CREATE_ONBOARDING_TEMPLATE_SECTION", `Added section ${section.id}`);
			audit(req, actor, "CREATE", "ONBOARDING_TEMPLATE_SECTION", section.id, { title: section.title }, "Template section added");
			res.status(201).json(buildSuccessResponse("Section created", { section }, 201));
		} catch (error) {
			onboardingLogger.error(`onboarding.createTemplateSection failed: ${error}`);
			fail(res, 500, "Error creating template section");
		}
	};

	const createTemplateItem = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const actor = await requireActor(req as AuthedRequest, res);
			if (!actor) return;
			if (!canManageOnboardingTemplates(actor)) {
				fail(res, 403, "Only admin can edit onboarding templates");
				return;
			}
			const { id } = req.params;
			if (isInvalidId(id)) {
				fail(res, 400, "Invalid template ID format");
				return;
			}
			const validation = CreateOnboardingItemSchema.safeParse(req.body);
			if (!validation.success) {
				fail(res, 400, "Validation failed", formatZodErrors(validation.error.format()));
				return;
			}
			const data = validation.data;
			if (!data.sectionId) {
				fail(res, 400, "sectionId is required");
				return;
			}
			const section = await prisma.onboardingTemplateSection.findFirst({
				where: { id: data.sectionId, templateId: id, isDeleted: false },
			});
			if (!section) {
				fail(res, 404, "Template section not found");
				return;
			}
			if (data.parentId) {
				const parent = await prisma.onboardingTemplateItem.findFirst({
					where: { id: data.parentId, sectionId: section.id, isDeleted: false },
				});
				if (!parent) {
					fail(res, 400, "Parent item not found in this section");
					return;
				}
				const depth = await itemDepth(prisma, "template", data.parentId);
				if (depth >= MAX_ITEM_DEPTH) {
					fail(res, 400, `Maximum item depth of ${MAX_ITEM_DEPTH} levels exceeded`);
					return;
				}
			}
			const count = await prisma.onboardingTemplateItem.count({ where: { sectionId: section.id } });

			const item = await prisma.onboardingTemplateItem.create({
				data: {
					organizationId: actor.organizationId,
					sectionId: section.id,
					parentId: data.parentId || null,
					number: data.number || "",
					title: data.title.trim(),
					description: data.description ?? null,
					responsibleDepartmentId: data.responsibleDepartmentId || null,
					responsibleDepartmentName: data.responsibleDepartmentName || null,
					order: data.order ?? count + 1,
				},
			});
			track(req, actor, "CREATE_ONBOARDING_TEMPLATE_ITEM", `Added item ${item.id}`);
			audit(req, actor, "CREATE", "ONBOARDING_TEMPLATE_ITEM", item.id, { title: item.title }, "Template item added");
			res.status(201).json(buildSuccessResponse("Item created", { item }, 201));
		} catch (error) {
			onboardingLogger.error(`onboarding.createTemplateItem failed: ${error}`);
			fail(res, 500, "Error creating template item");
		}
	};

	const bulkCreateTemplateItems = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const actor = await requireActor(req as AuthedRequest, res);
			if (!actor) return;
			if (!canManageOnboardingTemplates(actor)) {
				fail(res, 403, "Only admin can edit onboarding templates");
				return;
			}
			const { id } = req.params;
			if (isInvalidId(id)) {
				fail(res, 400, "Invalid template ID format");
				return;
			}
			const validation = BulkCreateOnboardingItemsSchema.safeParse(req.body);
			if (!validation.success) {
				fail(res, 400, "Validation failed", formatZodErrors(validation.error.format()));
				return;
			}
			const template = await prisma.onboardingTemplate.findFirst({
				where: { id, organizationId: actor.organizationId, isDeleted: false },
			});
			if (!template) {
				fail(res, 404, "Onboarding template not found");
				return;
			}

			const created = await prisma.$transaction(async (tx) => {
				const results: any[] = [];
				const sectionOrderCounters = new Map<string, number>();
				for (const data of validation.data.items) {
					if (!data.sectionId) continue;
					const section = await tx.onboardingTemplateSection.findFirst({
						where: { id: data.sectionId, templateId: id, isDeleted: false },
					});
					if (!section) continue;
					const next = (sectionOrderCounters.get(section.id) || 0) + 1;
					sectionOrderCounters.set(section.id, next);
					const item = await tx.onboardingTemplateItem.create({
						data: {
							organizationId: actor.organizationId,
							sectionId: section.id,
							parentId: data.parentId || null,
							number: data.number || "",
							title: data.title.trim(),
							description: data.description ?? null,
							responsibleDepartmentId: data.responsibleDepartmentId || null,
							responsibleDepartmentName: data.responsibleDepartmentName || null,
							order: data.order ?? (await tx.onboardingTemplateItem.count({ where: { sectionId: section.id } })) + 1,
						},
					});
					results.push(item);
				}
				return results;
			});

			track(req, actor, "BULK_CREATE_ONBOARDING_TEMPLATE_ITEMS", `Added ${created.length} items to template ${id}`);
			audit(req, actor, "CREATE", "ONBOARDING_TEMPLATE_ITEM", id, { count: created.length }, "Template items bulk created");
			res.status(201).json(buildSuccessResponse("Items created", { items: created, count: created.length }, 201));
		} catch (error) {
			onboardingLogger.error(`onboarding.bulkCreateTemplateItems failed: ${error}`);
			fail(res, 500, "Error bulk creating template items");
		}
	};

	const replaceTemplateTree = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const actor = await requireActor(req as AuthedRequest, res);
			if (!actor) return;
			if (!canManageOnboardingTemplates(actor)) {
				fail(res, 403, "Only admin can edit onboarding templates");
				return;
			}
			const { id } = req.params;
			if (isInvalidId(id)) {
				fail(res, 400, "Invalid template ID format");
				return;
			}
			const validation = ReplaceOnboardingTemplateTreeSchema.safeParse(req.body);
			if (!validation.success) {
				fail(res, 400, "Validation failed", formatZodErrors(validation.error.format()));
				return;
			}

			const existing = await prisma.onboardingTemplate.findFirst({
				where: { id, organizationId: actor.organizationId, isDeleted: false },
			});
			if (!existing) {
				fail(res, 404, "Onboarding template not found");
				return;
			}

			const result = await prisma.$transaction(async (tx) => {
				await tx.onboardingTemplate.update({
					where: { id },
					data: {
						...(validation.data.name ? { name: validation.data.name.trim() } : {}),
						...(validation.data.description !== undefined
							? { description: validation.data.description }
							: {}),
						...(validation.data.isActive !== undefined ? { isActive: validation.data.isActive } : {}),
					},
				});

				const currentSections = await tx.onboardingTemplateSection.findMany({
					where: { templateId: id, isDeleted: false },
					include: { items: { where: { isDeleted: false }, select: { id: true } } },
				});
				const payloadSectionIds = new Set(
					validation.data.sections.map((s) => s.id).filter(Boolean) as string[],
				);
				for (const section of currentSections) {
					if (payloadSectionIds.has(section.id)) continue;
					await tx.onboardingTemplateItem.updateMany({
						where: { sectionId: section.id },
						data: { isDeleted: true, parentId: null },
					});
					await tx.onboardingTemplateSection.update({
						where: { id: section.id },
						data: { isDeleted: true },
					});
				}

				const tempToSectionId = new Map<string, string>();
				const finalSectionIds: string[] = [];
				for (let index = 0; index < validation.data.sections.length; index++) {
					const sectionPayload = validation.data.sections[index];
					const order = sectionPayload.order ?? index + 1;
					let sectionId: string;
					if (sectionPayload.id) {
						await tx.onboardingTemplateSection.update({
							where: { id: sectionPayload.id },
							data: { title: sectionPayload.title.trim(), order },
						});
						sectionId = sectionPayload.id;
					} else {
						const created = await tx.onboardingTemplateSection.create({
							data: {
								organizationId: actor.organizationId,
								templateId: id,
								title: sectionPayload.title.trim(),
								order,
							},
						});
						sectionId = created.id;
					}
					finalSectionIds.push(sectionId);
					if (sectionPayload.tempId) tempToSectionId.set(sectionPayload.tempId, sectionId);
				}

				const resolveSectionId = (sectionPayload: (typeof validation.data.sections)[number]) =>
					sectionPayload.id ||
					(sectionPayload.tempId ? tempToSectionId.get(sectionPayload.tempId) : undefined);

				const allItemPayloads = validation.data.sections.flatMap((section) =>
					section.items.map((item) => ({ item, section })),
				);
				const currentItemIds = new Set(currentSections.flatMap((s) => s.items.map((i) => i.id)));
				const keptItemIds = new Set(
					allItemPayloads.map((entry) => entry.item.id).filter(Boolean) as string[],
				);
				for (const itemId of currentItemIds) {
					if (keptItemIds.has(itemId)) continue;
					const descendants = await collectDescendantIds(tx, "template", itemId);
					await tx.onboardingTemplateItem.updateMany({
						where: { id: { in: descendants } },
						data: { isDeleted: true, parentId: null },
					});
				}

				const tempToItemId = new Map<string, string>();
				const pending: { item: (typeof allItemPayloads)[number]["item"]; sectionId: string }[] = [];
				for (const entry of allItemPayloads) {
					const sectionId = resolveSectionId(entry.section);
					if (!sectionId) continue;
					pending.push({ item: entry.item, sectionId });
				}

				let queue = pending;
				let guard = 0;
				while (queue.length > 0 && guard <= MAX_ITEM_DEPTH + 1) {
					guard += 1;
					const ready = queue.filter(
						(p) =>
							!p.item.parentTempId ||
							tempToItemId.has(p.item.parentTempId) ||
							(p.item.parentId && keptItemIds.has(p.item.parentId)),
					);
					const deferred = queue.filter((p) => !ready.includes(p));
					for (const { item, sectionId } of ready) {
						const parentId =
							item.parentTempId && tempToItemId.has(item.parentTempId)
								? tempToItemId.get(item.parentTempId)!
								: item.parentId || null;
						if (item.id && keptItemIds.has(item.id)) {
							await tx.onboardingTemplateItem.update({
								where: { id: item.id },
								data: {
									sectionId,
									parentId,
									number: item.number ?? "",
									title: item.title.trim(),
									description: item.description ?? null,
									responsibleDepartmentId: item.responsibleDepartmentId || null,
									responsibleDepartmentName: item.responsibleDepartmentName || null,
									order: item.order ?? 1,
									isDeleted: false,
								},
							});
							if (item.tempId) tempToItemId.set(item.tempId, item.id);
						} else {
							const created = await tx.onboardingTemplateItem.create({
								data: {
									organizationId: actor.organizationId,
									sectionId,
									parentId,
									number: item.number ?? "",
									title: item.title.trim(),
									description: item.description ?? null,
									responsibleDepartmentId: item.responsibleDepartmentId || null,
									responsibleDepartmentName: item.responsibleDepartmentName || null,
									order: item.order ?? 1,
								},
							});
							if (item.tempId) tempToItemId.set(item.tempId, created.id);
						}
					}
					if (ready.length === 0 && deferred.length > 0) break;
					queue = deferred;
				}

				return tx.onboardingTemplate.findUnique({ where: { id }, include: treeInclude });
			});

			const built = {
				...result,
				sections: result?.sections.map((section) => ({
					...section,
					items: attachChildren(section.items),
				})),
			};
			track(req, actor, "REPLACE_ONBOARDING_TEMPLATE_TREE", `Saved template tree ${id}`);
			audit(req, actor, "UPDATE", "ONBOARDING_TEMPLATE", id, { sections: validation.data.sections.length }, "Template tree saved");
			res.status(200).json(buildSuccessResponse("Template saved", { template: built }, 200));
		} catch (error) {
			onboardingLogger.error(`onboarding.replaceTemplateTree failed: ${error}`);
			fail(res, 500, "Error saving onboarding template tree");
		}
	};

	// -------------------------------------------------------------------------
	// Sections / items (shared between templates and checklist instances)
	// -------------------------------------------------------------------------

	const updateSection = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const actor = await requireActor(req as AuthedRequest, res);
			if (!actor) return;
			const { id } = req.params;
			if (isInvalidId(id)) {
				fail(res, 400, "Invalid section ID format");
				return;
			}
			const validation = UpdateOnboardingSectionSchema.safeParse(req.body);
			if (!validation.success) {
				fail(res, 400, "Validation failed", formatZodErrors(validation.error.format()));
				return;
			}

			const checklistSection = await prisma.onboardingSection.findFirst({
				where: { id, organizationId: actor.organizationId, isDeleted: false },
				include: { checklist: { select: { employeeId: true } } },
			});
			if (checklistSection) {
				if (!canManageOnboardingChecklists(actor)) {
					fail(res, 403, "Only admin or HR can edit onboarding checklists");
					return;
				}
				const section = await prisma.onboardingSection.update({ where: { id }, data: validation.data });
				track(req, actor, "UPDATE_ONBOARDING_SECTION", `Updated section ${id}`);
				audit(req, actor, "UPDATE", "ONBOARDING_SECTION", id, validation.data, "Checklist section updated");
				res.status(200).json(buildSuccessResponse("Section updated", { section }, 200));
				return;
			}

			const templateSection = await prisma.onboardingTemplateSection.findFirst({
				where: { id, organizationId: actor.organizationId, isDeleted: false },
			});
			if (templateSection) {
				if (!canManageOnboardingTemplates(actor)) {
					fail(res, 403, "Only admin can edit onboarding templates");
					return;
				}
				const section = await prisma.onboardingTemplateSection.update({
					where: { id },
					data: validation.data,
				});
				track(req, actor, "UPDATE_ONBOARDING_TEMPLATE_SECTION", `Updated section ${id}`);
				audit(req, actor, "UPDATE", "ONBOARDING_TEMPLATE_SECTION", id, validation.data, "Template section updated");
				res.status(200).json(buildSuccessResponse("Section updated", { section }, 200));
				return;
			}

			fail(res, 404, "Section not found");
		} catch (error) {
			onboardingLogger.error(`onboarding.updateSection failed: ${error}`);
			fail(res, 500, "Error updating section");
		}
	};

	const deleteSection = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const actor = await requireActor(req as AuthedRequest, res);
			if (!actor) return;
			const { id } = req.params;
			if (isInvalidId(id)) {
				fail(res, 400, "Invalid section ID format");
				return;
			}

			const checklistSection = await prisma.onboardingSection.findFirst({
				where: { id, organizationId: actor.organizationId, isDeleted: false },
			});
			if (checklistSection) {
				if (!canManageOnboardingChecklists(actor)) {
					fail(res, 403, "Only admin or HR can edit onboarding checklists");
					return;
				}
				await prisma.$transaction(async (tx) => {
					const items = await tx.onboardingItem.findMany({ where: { sectionId: id, isDeleted: false } });
					for (const item of items.filter((i) => !i.parentId)) {
						const descendants = await collectDescendantIds(tx, "checklist", item.id);
						await tx.onboardingItem.updateMany({
							where: { id: { in: descendants } },
							data: { isDeleted: true, parentId: null },
						});
					}
					await tx.onboardingItem.updateMany({ where: { sectionId: id }, data: { isDeleted: true } });
					await tx.onboardingSection.update({ where: { id }, data: { isDeleted: true } });
					await recomputeChecklistProgress(tx, checklistSection.checklistId);
				});
				await syncEmploymentForChecklist(checklistSection.checklistId);
				track(req, actor, "DELETE_ONBOARDING_SECTION", `Deleted section ${id}`);
				audit(req, actor, "DELETE", "ONBOARDING_SECTION", id, null, "Checklist section deleted");
				res.status(200).json(buildSuccessResponse("Section deleted", {}, 200));
				return;
			}

			const templateSection = await prisma.onboardingTemplateSection.findFirst({
				where: { id, organizationId: actor.organizationId, isDeleted: false },
			});
			if (templateSection) {
				if (!canManageOnboardingTemplates(actor)) {
					fail(res, 403, "Only admin can edit onboarding templates");
					return;
				}
				await prisma.$transaction(async (tx) => {
					await tx.onboardingTemplateItem.updateMany({
						where: { sectionId: id },
						data: { isDeleted: true, parentId: null },
					});
					await tx.onboardingTemplateSection.update({ where: { id }, data: { isDeleted: true } });
				});
				track(req, actor, "DELETE_ONBOARDING_TEMPLATE_SECTION", `Deleted section ${id}`);
				audit(req, actor, "DELETE", "ONBOARDING_TEMPLATE_SECTION", id, null, "Template section deleted");
				res.status(200).json(buildSuccessResponse("Section deleted", {}, 200));
				return;
			}

			fail(res, 404, "Section not found");
		} catch (error) {
			onboardingLogger.error(`onboarding.deleteSection failed: ${error}`);
			fail(res, 500, "Error deleting section");
		}
	};

	const updateItem = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const actor = await requireActor(req as AuthedRequest, res);
			if (!actor) return;
			const { id } = req.params;
			if (isInvalidId(id)) {
				fail(res, 400, "Invalid item ID format");
				return;
			}
			const validation = UpdateOnboardingItemSchema.safeParse(req.body);
			if (!validation.success) {
				fail(res, 400, "Validation failed", formatZodErrors(validation.error.format()));
				return;
			}

			const ref = await resolveItemRef(id);
			if (!ref) {
				fail(res, 404, "Item not found");
				return;
			}
			if (ref.kind === "checklist" && !canManageOnboardingChecklists(actor)) {
				fail(res, 403, "Only admin or HR can edit onboarding checklist items");
				return;
			}
			if (ref.kind === "template" && !canManageOnboardingTemplates(actor)) {
				fail(res, 403, "Only admin can edit onboarding template items");
				return;
			}

			const data = validation.data;
			if (data.parentId) {
				const depth = await itemDepth(prisma, ref.kind, data.parentId);
				if (depth > MAX_ITEM_DEPTH) {
					fail(res, 400, `Maximum item depth of ${MAX_ITEM_DEPTH} levels exceeded`);
					return;
				}
				const descendants = await collectDescendantIds(prisma as unknown as Prisma.TransactionClient, ref.kind, id);
				if (descendants.includes(data.parentId)) {
					fail(res, 400, "Cannot move an item under one of its own descendants");
					return;
				}
			}

			const updatePayload = {
				...(data.title !== undefined ? { title: data.title.trim() } : {}),
				...(data.number !== undefined ? { number: data.number } : {}),
				...(data.description !== undefined ? { description: data.description } : {}),
				...(data.order !== undefined ? { order: data.order } : {}),
				...(data.responsibleDepartmentId !== undefined
					? { responsibleDepartmentId: data.responsibleDepartmentId || null }
					: {}),
				...(data.responsibleDepartmentName !== undefined
					? { responsibleDepartmentName: data.responsibleDepartmentName || null }
					: {}),
				...(data.parentId !== undefined ? { parentId: data.parentId || null } : {}),
			};

			let movedSection = false;
			if (data.sectionId) {
				if (ref.kind === "checklist") {
					const target = await prisma.onboardingSection.findFirst({
						where: { id: data.sectionId, checklistId: ref.record.section.checklistId, isDeleted: false },
					});
					if (!target) {
						fail(res, 400, "Target section not found in this checklist");
						return;
					}
				} else {
					const target = await prisma.onboardingTemplateSection.findFirst({
						where: { id: data.sectionId, templateId: ref.record.section.templateId, isDeleted: false },
					});
					if (!target) {
						fail(res, 400, "Target section not found in this template");
						return;
					}
				}
				movedSection = true;
			}

			const item =
				ref.kind === "checklist"
					? await prisma.onboardingItem.update({
							where: { id },
							data: { ...updatePayload, ...(movedSection ? { sectionId: data.sectionId } : {}) },
						})
					: await prisma.onboardingTemplateItem.update({
							where: { id },
							data: { ...updatePayload, ...(movedSection ? { sectionId: data.sectionId } : {}) },
						});

			if (ref.kind === "checklist") {
				await prisma.$transaction(async (tx) => {
					await recomputeChecklistProgress(tx, ref.record.section.checklistId);
				});
			}

			track(req, actor, "UPDATE_ONBOARDING_ITEM", `Updated item ${id}`);
			audit(req, actor, "UPDATE", ref.kind === "checklist" ? "ONBOARDING_ITEM" : "ONBOARDING_TEMPLATE_ITEM", id, data, "Checklist item updated");
			res.status(200).json(buildSuccessResponse("Item updated", { item }, 200));
		} catch (error) {
			onboardingLogger.error(`onboarding.updateItem failed: ${error}`);
			fail(res, 500, "Error updating item");
		}
	};

	const deleteItem = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const actor = await requireActor(req as AuthedRequest, res);
			if (!actor) return;
			const { id } = req.params;
			if (isInvalidId(id)) {
				fail(res, 400, "Invalid item ID format");
				return;
			}

			const ref = await resolveItemRef(id);
			if (!ref) {
				fail(res, 404, "Item not found");
				return;
			}
			if (ref.kind === "checklist" && !canManageOnboardingChecklists(actor)) {
				fail(res, 403, "Only admin or HR can edit onboarding checklist items");
				return;
			}
			if (ref.kind === "template" && !canManageOnboardingTemplates(actor)) {
				fail(res, 403, "Only admin can edit onboarding template items");
				return;
			}

			await prisma.$transaction(async (tx) => {
				const descendants = await collectDescendantIds(tx, ref.kind, id);
				if (ref.kind === "checklist") {
					await tx.onboardingItem.updateMany({
						where: { id: { in: descendants } },
						data: { isDeleted: true, parentId: null },
					});
					await recomputeChecklistProgress(tx, ref.record.section.checklistId);
				} else {
					await tx.onboardingTemplateItem.updateMany({
						where: { id: { in: descendants } },
						data: { isDeleted: true, parentId: null },
					});
				}
			});
			if (ref.kind === "checklist") {
				await syncEmploymentForChecklist(ref.record.section.checklistId);
			}

			track(req, actor, "DELETE_ONBOARDING_ITEM", `Deleted item ${id}`);
			audit(req, actor, "DELETE", ref.kind === "checklist" ? "ONBOARDING_ITEM" : "ONBOARDING_TEMPLATE_ITEM", id, null, "Checklist item deleted");
			res.status(200).json(buildSuccessResponse("Item deleted", {}, 200));
		} catch (error) {
			onboardingLogger.error(`onboarding.deleteItem failed: ${error}`);
			fail(res, 500, "Error deleting item");
		}
	};

	// -------------------------------------------------------------------------
	// Checklists (per-employee instances)
	// -------------------------------------------------------------------------

	const listChecklists = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const actor = await requireActor(req as AuthedRequest, res);
			if (!actor) return;
			if (!canManageOnboardingChecklists(actor)) {
				fail(res, 403, "Only admin or HR can list all onboarding checklists");
				return;
			}

			const { employeeId, status } = req.query;
			const checklists = await prisma.onboardingChecklist.findMany({
				where: {
					organizationId: actor.organizationId,
					isDeleted: false,
					...(employeeId && !isInvalidId(String(employeeId)) ? { employeeId: String(employeeId) } : {}),
					...(status === "DRAFT" || status === "ACTIVE" || status === "COMPLETED"
						? { status }
						: {}),
				},
				orderBy: { createdAt: "desc" },
				include: checklistMetaSelect,
			});

			const data = checklists.map((checklist) => ({
				...checklist,
				employeeName: formatPersonName(checklist.employee?.person),
				employeeNumber: checklist.employee?.employeeId || null,
				department: checklist.employee?.department?.name || null,
			}));

			track(req, actor, "LIST_ONBOARDING_CHECKLISTS", `Listed ${data.length} checklists`);
			res.status(200).json(buildSuccessResponse("Checklists retrieved", { checklists: data }, 200));
		} catch (error) {
			onboardingLogger.error(`onboarding.listChecklists failed: ${error}`);
			fail(res, 500, "Error getting onboarding checklists");
		}
	};

	const createChecklist = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const actor = await requireActor(req as AuthedRequest, res);
			if (!actor) return;
			if (!canManageOnboardingChecklists(actor)) {
				fail(res, 403, "Only admin or HR can create onboarding checklists");
				return;
			}
			const validation = CreateOnboardingChecklistSchema.safeParse(req.body);
			if (!validation.success) {
				fail(res, 400, "Validation failed", formatZodErrors(validation.error.format()));
				return;
			}
			const { employeeId, templateId, title, targetDate } = validation.data;

			let result;
			try {
				result = await ensureOnboardingChecklistForEmployee(prisma, {
					employeeId,
					organizationId: actor.organizationId,
					templateId,
					title,
					targetDate,
				});
			} catch (ensureError: any) {
				if (ensureError?.code === "TEMPLATE_NOT_FOUND") {
					fail(res, 404, "Onboarding template not found");
					return;
				}
				throw ensureError;
			}

			if (result.status === "exists") {
				fail(res, 409, "This employee already has an onboarding checklist");
				return;
			}
			if (result.status === "skipped") {
				fail(res, 404, "Employee not found");
				return;
			}

			// Design C: provisioning can itself gate promotion (new PENDING items) or,
			// for an empty template, leave everything complete.
			const employmentStatus = await syncEmploymentForChecklist(String(result.checklistId));
			const checklist = await loadChecklistById(actor.organizationId, String(result.checklistId));
			const built = checklist
				? {
						...checklist,
						employmentStatus,
						employeeName: formatPersonName(checklist.employee?.person),
						sections: checklist.sections.map((section) => ({
							...section,
							items: attachChildren(section.items),
						})),
					}
				: null;

			track(req, actor, "CREATE_ONBOARDING_CHECKLIST", `Created checklist ${result.checklistId} for employee ${employeeId}`);
			audit(req, actor, "CREATE", "ONBOARDING_CHECKLIST", String(result.checklistId), { employeeId, templateId: templateId || null }, "Onboarding checklist created");
			res.status(201).json(buildSuccessResponse("Checklist created", { checklist: built }, 201));
		} catch (error) {
			onboardingLogger.error(`onboarding.createChecklist failed: ${error}`);
			fail(res, 500, "Error creating onboarding checklist");
		}
	};

	/**
	 * Bulk provisioning for existing ONBOARDING employees lacking a checklist
	 * (single active template auto-resolved). Idempotent + safe to re-run.
	 */
	const provisionAllChecklists = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const actor = await requireActor(req as AuthedRequest, res);
			if (!actor) return;
			if (!canManageOnboardingChecklists(actor)) {
				fail(res, 403, "Only admin or HR can provision onboarding checklists");
				return;
			}
			const validation = ProvisionOnboardingChecklistsSchema.safeParse(req.body || {});
			if (!validation.success) {
				fail(res, 400, "Validation failed", formatZodErrors(validation.error.format()));
				return;
			}
			const { dryRun, employeeIds } = validation.data;

			const employees = await prisma.employee.findMany({
				where: {
					organizationId: actor.organizationId,
					isDeleted: false,
					employmentStatus: "ONBOARDING",
					...(employeeIds && employeeIds.length > 0 ? { id: { in: employeeIds } } : {}),
				},
				select: { id: true, employeeId: true },
			});

			const withChecklist = await prisma.onboardingChecklist.findMany({
				where: {
					organizationId: actor.organizationId,
					isDeleted: false,
					employeeId: { in: employees.map((e) => e.id) },
				},
				select: { employeeId: true },
			});
			const hasChecklist = new Set(withChecklist.map((c) => c.employeeId));
			const missing = employees.filter((e) => !hasChecklist.has(e.id));

			const activeTemplate = await prisma.onboardingTemplate.findFirst({
				where: { organizationId: actor.organizationId, isDeleted: false, isActive: true },
				orderBy: { createdAt: "asc" },
				select: { id: true, name: true },
			});

			if (dryRun) {
				track(req, actor, "PROVISION_ONBOARDING_CHECKLISTS_DRYRUN", `Dry run: ${missing.length} to provision`);
				res.status(200).json(
					buildSuccessResponse(
						"Provision plan",
						{
							dryRun: true,
							requested: employees.length,
							wouldCreate: missing.length,
							alreadyHasChecklist: hasChecklist.size,
							template: activeTemplate,
							employees: missing.map((e) => ({ id: e.id, employeeNumber: e.employeeId })),
						},
						200,
					),
				);
				return;
			}

			let created = 0;
			let skipped = hasChecklist.size;
			let failed = 0;
			for (const employee of missing) {
				try {
					const outcome = await ensureOnboardingChecklistForEmployee(prisma, {
						employeeId: employee.id,
						organizationId: actor.organizationId,
						requireTemplate: true,
					});
					if (outcome.status === "created") {
						created += 1;
						await syncEmploymentForChecklist(String(outcome.checklistId));
					} else skipped += 1;
				} catch (provisionError) {
					failed += 1;
					onboardingLogger.warn(
						`provision-all failed for employee ${employee.id}: ${provisionError}`,
					);
				}
			}

			track(req, actor, "PROVISION_ONBOARDING_CHECKLISTS", `Provisioned ${created} checklists (skipped ${skipped}, failed ${failed})`);
			audit(req, actor, "CREATE", "ONBOARDING_CHECKLIST", actor.organizationId, { created, skipped, failed }, "Onboarding checklists bulk provisioned");
			res.status(200).json(
				buildSuccessResponse(
					"Provisioning complete",
					{
						dryRun: false,
						requested: employees.length,
						created,
						skipped,
						failed,
						template: activeTemplate,
					},
					200,
				),
			);
		} catch (error) {
			onboardingLogger.error(`onboarding.provisionAllChecklists failed: ${error}`);
			fail(res, 500, "Error provisioning onboarding checklists");
		}
	};

	const loadChecklistById = (organizationId: string, id: string) =>
		prisma.onboardingChecklist.findFirst({
			where: { id, organizationId, isDeleted: false },
			include: { ...treeInclude, ...checklistMetaSelect },
		});

	const getChecklist = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const actor = await requireActor(req as AuthedRequest, res);
			if (!actor) return;
			if (!canManageOnboardingChecklists(actor)) {
				fail(res, 403, "Only admin or HR can view the full checklist");
				return;
			}
			const { id } = req.params;
			if (isInvalidId(id)) {
				fail(res, 400, "Invalid checklist ID format");
				return;
			}

			const checklist = await loadChecklistById(actor.organizationId, id);
			if (!checklist) {
				fail(res, 404, "Onboarding checklist not found");
				return;
			}

			const built = {
				...checklist,
				employeeName: formatPersonName(checklist.employee?.person),
				sections: checklist.sections.map((section) => ({
					...section,
					items: attachChildren(section.items),
				})),
			};
			track(req, actor, "GET_ONBOARDING_CHECKLIST", `Read checklist ${id}`);
			res.status(200).json(buildSuccessResponse("Checklist retrieved", { checklist: built }, 200));
		} catch (error) {
			onboardingLogger.error(`onboarding.getChecklist failed: ${error}`);
			fail(res, 500, "Error getting onboarding checklist");
		}
	};

	const getVisibleChecklist = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const actor = await requireActor(req as AuthedRequest, res);
			if (!actor) return;
			const { id } = req.params;
			if (isInvalidId(id)) {
				fail(res, 400, "Invalid checklist ID format");
				return;
			}
			if (!actor.employeeId && !actor.isAdmin && !actor.isHr) {
				fail(res, 403, "Your account is not linked to an employee profile.");
				return;
			}

			const checklist = await loadChecklistById(actor.organizationId, id);
			if (!checklist) {
				fail(res, 404, "Onboarding checklist not found");
				return;
			}

			const { view, sections } = buildOnboardingVisibleView(checklist, actor);
			const built = {
				id: checklist.id,
				title: checklist.title,
				status: checklist.status,
				completionPercentage: checklist.completionPercentage,
				startDate: checklist.startDate,
				targetDate: checklist.targetDate,
				employee: {
					id: checklist.employee?.id,
					employeeNumber: checklist.employee?.employeeId,
					name: formatPersonName(checklist.employee?.person),
					department: checklist.employee?.department?.name || null,
				},
				view,
				viewer: {
					department: actor.departmentName,
					isAdmin: actor.isAdmin,
					isHr: actor.isHr,
				},
				sections,
			};
			track(req, actor, "GET_ONBOARDING_CHECKLIST_VISIBLE", `Read visible checklist ${id} (view=${view})`);
			res.status(200).json(buildSuccessResponse("Checklist retrieved", { checklist: built }, 200));
		} catch (error) {
			onboardingLogger.error(`onboarding.getVisibleChecklist failed: ${error}`);
			fail(res, 500, "Error getting onboarding checklist");
		}
	};

	const updateChecklist = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const actor = await requireActor(req as AuthedRequest, res);
			if (!actor) return;
			if (!canManageOnboardingChecklists(actor)) {
				fail(res, 403, "Only admin or HR can update onboarding checklists");
				return;
			}
			const { id } = req.params;
			if (isInvalidId(id)) {
				fail(res, 400, "Invalid checklist ID format");
				return;
			}
			const validation = UpdateOnboardingChecklistSchema.safeParse(req.body);
			if (!validation.success) {
				fail(res, 400, "Validation failed", formatZodErrors(validation.error.format()));
				return;
			}
			const existing = await prisma.onboardingChecklist.findFirst({
				where: { id, organizationId: actor.organizationId, isDeleted: false },
			});
			if (!existing) {
				fail(res, 404, "Onboarding checklist not found");
				return;
			}

			const checklist = await prisma.onboardingChecklist.update({ where: { id }, data: validation.data });
			track(req, actor, "UPDATE_ONBOARDING_CHECKLIST", `Updated checklist ${id}`);
			audit(req, actor, "UPDATE", "ONBOARDING_CHECKLIST", id, validation.data, "Onboarding checklist updated");
			res.status(200).json(buildSuccessResponse("Checklist updated", { checklist }, 200));
		} catch (error) {
			onboardingLogger.error(`onboarding.updateChecklist failed: ${error}`);
			fail(res, 500, "Error updating onboarding checklist");
		}
	};

	const deleteChecklist = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const actor = await requireActor(req as AuthedRequest, res);
			if (!actor) return;
			if (!canManageOnboardingChecklists(actor)) {
				fail(res, 403, "Only admin or HR can delete onboarding checklists");
				return;
			}
			const { id } = req.params;
			if (isInvalidId(id)) {
				fail(res, 400, "Invalid checklist ID format");
				return;
			}
			const existing = await prisma.onboardingChecklist.findFirst({
				where: { id, organizationId: actor.organizationId, isDeleted: false },
			});
			if (!existing) {
				fail(res, 404, "Onboarding checklist not found");
				return;
			}

			await prisma.$transaction(async (tx) => {
				await tx.onboardingItem.updateMany({
					where: { section: { checklistId: id } },
					data: { isDeleted: true, parentId: null },
				});
				await tx.onboardingSection.updateMany({ where: { checklistId: id }, data: { isDeleted: true } });
				await tx.onboardingChecklist.update({ where: { id }, data: { isDeleted: true } });
			});
			// Design C: removing the checklist's pending items can free the gate again.
			try {
				await syncEmployeeEmploymentStatus({ prisma, employeeId: existing.employeeId });
			} catch (syncError) {
				onboardingLogger.warn(
					`employment status sync skipped after checklist delete ${id}: ${syncError}`,
				);
			}

			track(req, actor, "DELETE_ONBOARDING_CHECKLIST", `Deleted checklist ${id}`);
			audit(req, actor, "DELETE", "ONBOARDING_CHECKLIST", id, null, "Onboarding checklist deleted");
			res.status(200).json(buildSuccessResponse("Checklist deleted", {}, 200));
		} catch (error) {
			onboardingLogger.error(`onboarding.deleteChecklist failed: ${error}`);
			fail(res, 500, "Error deleting onboarding checklist");
		}
	};

	const createChecklistSection = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const actor = await requireActor(req as AuthedRequest, res);
			if (!actor) return;
			if (!canManageOnboardingChecklists(actor)) {
				fail(res, 403, "Only admin or HR can edit onboarding checklists");
				return;
			}
			const { id } = req.params;
			if (isInvalidId(id)) {
				fail(res, 400, "Invalid checklist ID format");
				return;
			}
			const validation = CreateOnboardingSectionSchema.safeParse(req.body);
			if (!validation.success) {
				fail(res, 400, "Validation failed", formatZodErrors(validation.error.format()));
				return;
			}
			const checklist = await prisma.onboardingChecklist.findFirst({
				where: { id, organizationId: actor.organizationId, isDeleted: false },
			});
			if (!checklist) {
				fail(res, 404, "Onboarding checklist not found");
				return;
			}
			const count = await prisma.onboardingSection.count({ where: { checklistId: id, isDeleted: false } });

			const section = await prisma.onboardingSection.create({
				data: {
					organizationId: actor.organizationId,
					checklistId: id,
					title: validation.data.title.trim(),
					order: validation.data.order ?? count + 1,
				},
			});
			track(req, actor, "CREATE_ONBOARDING_SECTION", `Added section ${section.id}`);
			audit(req, actor, "CREATE", "ONBOARDING_SECTION", section.id, { title: section.title }, "Checklist section added");
			res.status(201).json(buildSuccessResponse("Section created", { section }, 201));
		} catch (error) {
			onboardingLogger.error(`onboarding.createChecklistSection failed: ${error}`);
			fail(res, 500, "Error creating checklist section");
		}
	};

	const createChecklistItem = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const actor = await requireActor(req as AuthedRequest, res);
			if (!actor) return;
			if (!canManageOnboardingChecklists(actor)) {
				fail(res, 403, "Only admin or HR can edit onboarding checklists");
				return;
			}
			const { id } = req.params;
			if (isInvalidId(id)) {
				fail(res, 400, "Invalid checklist ID format");
				return;
			}
			const validation = CreateOnboardingItemSchema.safeParse(req.body);
			if (!validation.success) {
				fail(res, 400, "Validation failed", formatZodErrors(validation.error.format()));
				return;
			}
			const data = validation.data;
			if (!data.sectionId) {
				fail(res, 400, "sectionId is required");
				return;
			}
			const section = await prisma.onboardingSection.findFirst({
				where: { id: data.sectionId, checklistId: id, isDeleted: false },
			});
			if (!section) {
				fail(res, 404, "Checklist section not found");
				return;
			}
			if (data.parentId) {
				const parent = await prisma.onboardingItem.findFirst({
					where: { id: data.parentId, sectionId: section.id, isDeleted: false },
				});
				if (!parent) {
					fail(res, 400, "Parent item not found in this section");
					return;
				}
				const depth = await itemDepth(prisma, "checklist", data.parentId);
				if (depth >= MAX_ITEM_DEPTH) {
					fail(res, 400, `Maximum item depth of ${MAX_ITEM_DEPTH} levels exceeded`);
					return;
				}
			}
			const count = await prisma.onboardingItem.count({ where: { sectionId: section.id } });

			const item = await prisma.onboardingItem.create({
				data: {
					organizationId: actor.organizationId,
					sectionId: section.id,
					parentId: data.parentId || null,
					number: data.number || "",
					title: data.title.trim(),
					description: data.description ?? null,
					responsibleDepartmentId: data.responsibleDepartmentId || null,
					responsibleDepartmentName: data.responsibleDepartmentName || null,
					order: data.order ?? count + 1,
				},
			});
			await prisma.$transaction(async (tx) => {
				await recomputeChecklistProgress(tx, id);
			});
			track(req, actor, "CREATE_ONBOARDING_ITEM", `Added item ${item.id}`);
			audit(req, actor, "CREATE", "ONBOARDING_ITEM", item.id, { title: item.title }, "Checklist item added");
			res.status(201).json(buildSuccessResponse("Item created", { item }, 201));
		} catch (error) {
			onboardingLogger.error(`onboarding.createChecklistItem failed: ${error}`);
			fail(res, 500, "Error creating checklist item");
		}
	};

	// -------------------------------------------------------------------------
	// Sign / unsign
	// -------------------------------------------------------------------------

	const signItem = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const actor = await requireActor(req as AuthedRequest, res);
			if (!actor) return;
			const { id } = req.params;
			if (isInvalidId(id)) {
				fail(res, 400, "Invalid item ID format");
				return;
			}
			const validation = SignOnboardingItemSchema.safeParse(req.body);
			if (!validation.success) {
				fail(res, 400, "Validation failed", formatZodErrors(validation.error.format()));
				return;
			}

			const ref = await resolveItemRef(id);
			if (!ref || ref.kind !== "checklist") {
				fail(res, 404, "Checklist item not found");
				return;
			}
			const item = ref.record;
			const checklistEmployeeId = String(ref.checklistEmployeeId || "");

			const decision = evaluateOnboardingSignPermission(
				actor,
				{ responsibleDepartmentId: item.responsibleDepartmentId || null },
				checklistEmployeeId,
			);
			if (!decision.allowed) {
				onboardingLogger.warn(
					`Sign denied for user ${actor.userId} on item ${id}: ${decision.reason}`,
				);
				fail(res, decision.status || 403, decision.reason || "Not allowed to sign this item");
				return;
			}

			if (item.status === "COMPLETED") {
				fail(
					res,
					409,
					`This item is already signed by ${item.signedByName || "someone"}`,
				);
				return;
			}

			const user = await prisma.user.findUnique({
				where: { id: actor.userId },
				select: { password: true, isDeleted: true, status: true },
			});
			if (!user || user.isDeleted) {
				fail(res, 401, "Invalid password");
				return;
			}
			if (!user.password) {
				fail(res, 409, "Your account has no password set. Set a password before signing.");
				return;
			}
			const passwordValid = await bcrypt.compare(validation.data.password, user.password);
			if (!passwordValid) {
				onboardingLogger.warn(`Sign rejected for user ${actor.userId} on item ${id}: wrong password`);
				fail(res, 401, "Invalid password");
				return;
			}

			const remarks =
				typeof validation.data.remarks === "string" && validation.data.remarks.trim()
					? validation.data.remarks.trim()
					: null;
			const signedAt = new Date();

			const result = await prisma.$transaction(async (tx) => {
				const updated = await tx.onboardingItem.update({
					where: { id },
					data: {
						status: "COMPLETED",
						completedDate: signedAt,
						completedByEmployeeId: actor.employeeId,
						signedByName: actor.fullName,
						...(remarks ? { remarks } : {}),
					},
				});
				const signature = await tx.onboardingSignature.create({
					data: {
						organizationId: actor.organizationId,
						itemId: id,
						signerEmployeeId: String(actor.employeeId),
						signerName: actor.fullName,
						signerDepartmentId: actor.departmentId,
						signerDepartmentName: actor.departmentName,
						method: "PASSWORD",
						passwordVerified: true,
						remarks,
					},
				});
				const progress = await recomputeChecklistProgress(tx, item.section.checklistId);
				return { updated, signature, progress };
			});

			track(req, actor, "SIGN_ONBOARDING_ITEM", `Signed item ${id} for checklist employee ${checklistEmployeeId}`);
			// Design C: completion change -> re-evaluate the shared ONBOARDING/ACTIVE gate.
			const employmentStatus = await syncEmploymentForChecklist(item.section.checklistId);
			audit(
				req,
				actor,
				"UPDATE",
				"ONBOARDING_ITEM",
				id,
				{ status: "COMPLETED", signedByName: actor.fullName, signatureId: result.signature.id },
				"Onboarding checklist item signed with password",
				"MEDIUM",
			);
			res.status(200).json(
				buildSuccessResponse(
					"Item signed",
					{
						item: result.updated,
						signature: result.signature,
						checklist: { ...result.progress, employmentStatus },
					},
					200,
				),
			);
		} catch (error) {
			onboardingLogger.error(`onboarding.signItem failed: ${error}`);
			fail(res, 500, "Error signing checklist item");
		}
	};

	const unsignItem = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const actor = await requireActor(req as AuthedRequest, res);
			if (!actor) return;
			if (!canManageOnboardingChecklists(actor)) {
				fail(res, 403, "Only admin or HR can unsign checklist items");
				return;
			}
			const { id } = req.params;
			if (isInvalidId(id)) {
				fail(res, 400, "Invalid item ID format");
				return;
			}

			const ref = await resolveItemRef(id);
			if (!ref || ref.kind !== "checklist") {
				fail(res, 404, "Checklist item not found");
				return;
			}
			if (ref.record.status !== "COMPLETED") {
				fail(res, 409, "This item is not signed");
				return;
			}

			const result = await prisma.$transaction(async (tx) => {
				const updated = await tx.onboardingItem.update({
					where: { id },
					data: {
						status: "PENDING",
						completedDate: null,
						completedByEmployeeId: null,
						signedByName: null,
						remarks: null,
					},
				});
				const progress = await recomputeChecklistProgress(tx, ref.record.section.checklistId);
				return { updated, progress };
			});

			track(req, actor, "UNSIGN_ONBOARDING_ITEM", `Unsigned item ${id}`);
			// Design C: reopen -> the gate may pull the employee back to ONBOARDING.
			const employmentStatus = await syncEmploymentForChecklist(ref.record.section.checklistId);
			audit(
				req,
				actor,
				"UPDATE",
				"ONBOARDING_ITEM",
				id,
				{ status: "PENDING" },
				"Onboarding checklist item unsigned",
				"MEDIUM",
			);
			res.status(200).json(
				buildSuccessResponse(
					"Item unsigned",
					{ item: result.updated, employmentStatus },
					200,
				),
			);
		} catch (error) {
			onboardingLogger.error(`onboarding.unsignItem failed: ${error}`);
			fail(res, 500, "Error unsigned checklist item");
		}
	};

	const listItemSignatures = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const actor = await requireActor(req as AuthedRequest, res);
			if (!actor) return;
			const { id } = req.params;
			if (isInvalidId(id)) {
				fail(res, 400, "Invalid item ID format");
				return;
			}
			const ref = await resolveItemRef(id);
			if (!ref || ref.kind !== "checklist") {
				fail(res, 404, "Checklist item not found");
				return;
			}
			const isOwnerViewer =
				actor.isAdmin ||
				actor.isHr ||
				actor.employeeId === ref.checklistEmployeeId ||
				(!!actor.departmentId && actor.departmentId === ref.record.responsibleDepartmentId);
			if (!isOwnerViewer) {
				fail(res, 403, "Not allowed to view signatures for this item");
				return;
			}

			const signatures = await prisma.onboardingSignature.findMany({
				where: { itemId: id },
				orderBy: { signedAt: "desc" },
			});
			track(req, actor, "LIST_ONBOARDING_SIGNATURES", `Read signatures for item ${id}`);
			res.status(200).json(buildSuccessResponse("Signatures retrieved", { signatures }, 200));
		} catch (error) {
			onboardingLogger.error(`onboarding.listItemSignatures failed: ${error}`);
			fail(res, 500, "Error getting item signatures");
		}
	};

	// -------------------------------------------------------------------------
	// Checklist-level bulk item create (HR adjusts one employee's copy)
	// -------------------------------------------------------------------------

	const bulkCreateChecklistItems = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const actor = await requireActor(req as AuthedRequest, res);
			if (!actor) return;
			if (!canManageOnboardingChecklists(actor)) {
				fail(res, 403, "Only admin or HR can edit onboarding checklists");
				return;
			}
			const { id } = req.params;
			if (isInvalidId(id)) {
				fail(res, 400, "Invalid checklist ID format");
				return;
			}
			const validation = BulkCreateOnboardingItemsSchema.safeParse(req.body);
			if (!validation.success) {
				fail(res, 400, "Validation failed", formatZodErrors(validation.error.format()));
				return;
			}
			const checklist = await prisma.onboardingChecklist.findFirst({
				where: { id, organizationId: actor.organizationId, isDeleted: false },
			});
			if (!checklist) {
				fail(res, 404, "Onboarding checklist not found");
				return;
			}

			const created = await prisma.$transaction(async (tx) => {
				const results: any[] = [];
				for (const data of validation.data.items) {
					if (!data.sectionId) continue;
					const section = await tx.onboardingSection.findFirst({
						where: { id: data.sectionId, checklistId: id, isDeleted: false },
					});
					if (!section) continue;
					const item = await tx.onboardingItem.create({
						data: {
							organizationId: actor.organizationId,
							sectionId: section.id,
							parentId: data.parentId || null,
							number: data.number || "",
							title: data.title.trim(),
							description: data.description ?? null,
							responsibleDepartmentId: data.responsibleDepartmentId || null,
							responsibleDepartmentName: data.responsibleDepartmentName || null,
							order:
								data.order ??
								(await tx.onboardingItem.count({ where: { sectionId: section.id } })) + 1,
						},
					});
					results.push(item);
				}
				await recomputeChecklistProgress(tx, id);
				return results;
			});

			track(req, actor, "BULK_CREATE_ONBOARDING_CHECKLIST_ITEMS", `Added ${created.length} items to checklist ${id}`);
			audit(req, actor, "CREATE", "ONBOARDING_ITEM", id, { count: created.length }, "Checklist items bulk created");
			res.status(201).json(buildSuccessResponse("Items created", { items: created, count: created.length }, 201));
		} catch (error) {
			onboardingLogger.error(`onboarding.bulkCreateChecklistItems failed: ${error}`);
			fail(res, 500, "Error bulk creating checklist items");
		}
	};

	return {
		getRoster,
		listTemplates,
		getTemplate,
		createTemplate,
		updateTemplate,
		deleteTemplate,
		createTemplateSection,
		createTemplateItem,
		bulkCreateTemplateItems,
		replaceTemplateTree,
		updateSection,
		deleteSection,
		updateItem,
		deleteItem,
		listChecklists,
		createChecklist,
		provisionAllChecklists,
		getChecklist,
		getVisibleChecklist,
		updateChecklist,
		deleteChecklist,
		createChecklistSection,
		createChecklistItem,
		bulkCreateChecklistItems,
		signItem,
		unsignItem,
		listItemSignatures,
	};
};
