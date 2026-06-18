import { Request, Response, NextFunction } from "express";
import { PrismaClient, Prisma, DocumentReviewStatus } from "../../generated/prisma";
import { buildSuccessResponse, buildPagination } from "../../helper/success-handler.helper";
import { buildErrorResponse } from "../../helper/error-handler";
import { getLogger } from "../../helper/logger.helper";

const logger = getLogger().child({ module: "employeeDocuments" });

const toPositiveInt = (value: unknown, fallback: number, max = 100) => {
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed < 1) return fallback;
	return Math.min(Math.floor(parsed), max);
};

const getActorContext = (req: Request) => {
	const role = String(
		(req as any)?.role ||
			(req as any)?.user?.role ||
			(req as any)?.metadata?.role ||
			(req as any)?.metadata?.employee?.role ||
			"",
	)
		.trim()
		.toLowerCase();
	const organizationId =
		String(
			(req as any)?.organizationId ||
				(req as any)?.metadata?.employee?.organizationId ||
				(req as any)?.metadata?.organizationId ||
				(req as any)?.user?.organizationId ||
				"",
		).trim() || null;
	const canRead =
		role.includes("hris-admin") ||
		role.includes("hris-hr") ||
		role === "admin" ||
		role === "super_admin" ||
		role === "superadmin";

	return { role, organizationId, canRead };
};

const employeeSelect = {
	id: true,
	employeeId: true,
	person: { select: { personalInfo: true } },
	department: { select: { id: true, name: true, code: true } },
	position: { select: { id: true, title: true, code: true } },
} satisfies Prisma.EmployeeSelect;

const documentSelect = {
	id: true,
	name: true,
	type: true,
	number: true,
	issueDate: true,
	expiryDate: true,
	fileUrl: true,
	ext: true,
	reviewStatus: true,
	reviewSubmittedAt: true,
	reviewSubmittedById: true,
	reviewApprovedAt: true,
	reviewApprovedById: true,
	reviewRejectedAt: true,
	reviewRejectedById: true,
	reviewRejectionReason: true,
	reviewSource: true,
	createdAt: true,
	updatedAt: true,
	employee: { select: employeeSelect },
	documentType: {
		select: {
			id: true,
			code: true,
			name: true,
			metadata: true,
		},
	},
} satisfies Prisma.DocumentSelect;

const buildActorLookup = async (
	prisma: PrismaClient,
	actorIds: Array<string | null | undefined>,
) => {
	const ids = Array.from(new Set(actorIds.filter((id): id is string => Boolean(id))));
	if (!ids.length) return new Map<string, any>();

	const actors = await prisma.employee.findMany({
		where: { id: { in: ids }, isDeleted: false },
		select: employeeSelect,
	});

	return new Map(actors.map((actor) => [actor.id, actor]));
};

export const controller = (prisma: PrismaClient) => {
	const getApprovals = async (req: Request, res: Response, _next: NextFunction) => {
		const { organizationId, canRead } = getActorContext(req);
		if (!canRead) {
			res.status(403).json(
				buildErrorResponse("Only HR can read employee document approvals.", 403),
			);
			return;
		}
		if (!organizationId) {
			res.status(400).json(buildErrorResponse("Organization context is required.", 400));
			return;
		}

		const page = toPositiveInt(req.query.page, 1);
		const limit = toPositiveInt(req.query.limit, 20, 100);
		const skip = (page - 1) * limit;
		const statusParam = String(req.query.status || "PENDING")
			.trim()
			.toUpperCase();
		const status = Object.values(DocumentReviewStatus).includes(
			statusParam as DocumentReviewStatus,
		)
			? (statusParam as DocumentReviewStatus)
			: DocumentReviewStatus.PENDING;
		const departmentId = String(req.query.departmentId || "").trim();
		const sectionId = String(req.query.sectionId || "").trim();
		const reportToId = String(req.query.reportToId || "").trim();
		const documentTypeId = String(req.query.documentTypeId || "").trim();
		const query = String(req.query.query || "").trim();

		const where: Prisma.DocumentWhereInput = {
			isDeleted: false,
			reviewStatus: status,
			employee: {
				is: {
					organizationId,
					isDeleted: false,
					employmentStatus: { in: ["ACTIVE", "ONBOARDING"] },
					...(departmentId ? { departmentId } : {}),
					...(sectionId ? { sectionId } : {}),
					...(reportToId ? { reportToId } : {}),
				},
			},
			...(documentTypeId ? { documentTypeId } : {}),
			...(query
				? {
						OR: [
							{ name: { contains: query, mode: "insensitive" } },
							{ type: { contains: query, mode: "insensitive" } },
							{ number: { contains: query, mode: "insensitive" } },
							{
								employee: {
									is: { employeeId: { contains: query, mode: "insensitive" } },
								},
							},
						],
					}
				: {}),
		};

		try {
			const [documents, total] = await Promise.all([
				prisma.document.findMany({
					where,
					select: documentSelect,
					orderBy: [{ reviewSubmittedAt: "desc" }, { createdAt: "desc" }],
					skip,
					take: limit,
				}),
				prisma.document.count({ where }),
			]);
			const actorLookup = await buildActorLookup(prisma, [
				...documents.map((document) => document.reviewSubmittedById),
				...documents.map((document) => document.reviewApprovedById),
				...documents.map((document) => document.reviewRejectedById),
			]);

			res.status(200).json(
				buildSuccessResponse(
					"Employee document approvals retrieved",
					{
						documents,
						actors: Object.fromEntries(actorLookup),
						count: total,
						pagination: buildPagination(total, page, limit),
					},
					200,
				),
			);
		} catch (error) {
			logger.error(`Failed to get employee document approvals: ${error}`);
			res.status(500).json(
				buildErrorResponse("Failed to retrieve employee document approvals.", 500),
			);
		}
	};

	const getReviewEvents = async (req: Request, res: Response, _next: NextFunction) => {
		const { organizationId, canRead } = getActorContext(req);
		if (!canRead) {
			res.status(403).json(
				buildErrorResponse("Only HR can read employee document review history.", 403),
			);
			return;
		}
		if (!organizationId) {
			res.status(400).json(buildErrorResponse("Organization context is required.", 400));
			return;
		}

		const page = toPositiveInt(req.query.page, 1);
		const limit = toPositiveInt(req.query.limit, 20, 100);
		const skip = (page - 1) * limit;
		const employeeId = String(req.query.employeeId || "").trim();
		const documentId = String(req.query.documentId || "").trim();

		const where: Prisma.DocumentReviewEventWhereInput = {
			organizationId,
			...(employeeId ? { employeeId } : {}),
			...(documentId ? { documentId } : {}),
		};

		try {
			const [events, total] = await Promise.all([
				prisma.documentReviewEvent.findMany({
					where,
					orderBy: { occurredAt: "desc" },
					skip,
					take: limit,
					include: {
						document: {
							select: {
								...documentSelect,
								employee: { select: employeeSelect },
							},
						},
					},
				}),
				prisma.documentReviewEvent.count({ where }),
			]);
			const actorLookup = await buildActorLookup(
				prisma,
				events.map((event) => event.actorEmployeeId),
			);

			res.status(200).json(
				buildSuccessResponse(
					"Employee document review events retrieved",
					{
						events,
						actors: Object.fromEntries(actorLookup),
						count: total,
						pagination: buildPagination(total, page, limit),
					},
					200,
				),
			);
		} catch (error) {
			logger.error(`Failed to get employee document review events: ${error}`);
			res.status(500).json(
				buildErrorResponse("Failed to retrieve employee document review events.", 500),
			);
		}
	};

	return { getApprovals, getReviewEvents };
};
