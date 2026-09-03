import { PrismaClient, BoardingType } from "../generated/prisma";
import { getLogger } from "./logger.helper";

const logger = getLogger();
const boardingLogger = logger.child({ module: "boarding-helper" });

interface CreateBoardingProcessParams {
	prisma: PrismaClient;
	organizationId: string;
	employeeId: string;
	type: BoardingType;
	targetDate: Date;
	departmentId?: string | null;
	role?: string | null; // Optional: specific role to find template
	templateId?: string; // Optional: specific template ID to use
}

/**
 * Creates a boarding process (Onboarding/Offboarding) for an employee
 * based on active templates.
 */
export const createBoardingProcess = async ({
	prisma,
	organizationId,
	employeeId,
	type,
	targetDate,
	departmentId,
	role,
	templateId,
}: CreateBoardingProcessParams) => {
	try {
		let template;

		if (templateId) {
			template = await prisma.boardingTemplate.findUnique({
				where: { id: templateId },
				include: {
					items: {
						where: { isDeleted: false },
						orderBy: { order: "asc" },
					},
				},
			});
		} else {
			// Find active template
			// If role is provided, try to find for that role, otherwise generic or default
			// For offboarding, we might just look for type=OFFBOARDING
			const templateConditions: any = {
				type,
				isActive: true,
				isDeleted: false,
				organizationId,
			};

			if (role) {
				templateConditions.role = role;
			}

			// Find the best matching template
			// If explicit role is requested, look for it.
			// Otherwise, might need fallback logic if no role-specific template exists.
			// For now, let's try to find one that matches.
			template = await prisma.boardingTemplate.findFirst({
				where: templateConditions,
				include: {
					items: {
						where: {
							isDeleted: false,
						},
						orderBy: {
							order: "asc",
						},
					},
				},
			});

			// Fallback: If role specific failed, try without role (global/default)
			if (!template && role) {
				delete templateConditions.role;
				template = await prisma.boardingTemplate.findFirst({
					where: templateConditions,
					include: {
						items: {
							where: {
								isDeleted: false,
							},
							orderBy: {
								order: "asc",
							},
						},
					},
				});
			}
		}

		if (!template) {
			boardingLogger.warn(
				`No active boarding template found for type ${type} (role: ${role || "any"}) in org ${organizationId}`,
			);
			return null;
		}

		boardingLogger.info(`Found boarding template: ${template.name} for type ${type}`);

		// Create the process
		const boardingProcess = await prisma.boardingProcess.create({
			data: {
				organizationId,
				employeeId,
				departmentId,
				type,
				status: "NOT_STARTED",
				startDate: new Date(),
				targetDate,
				metadata: {
					templateId: template.id,
					templateName: template.name,
				},
			},
		});

		boardingLogger.info(`Created boarding process with ID: ${boardingProcess.id}`);

		// Create checklist items
		if (template.items && template.items.length > 0) {
			boardingLogger.info(`Creating ${template.items.length} checklist items from template`);

			const checklistItemsData = template.items.map((item) => {
				// Onboarding due dates should be relative to onboarding start,
				// while offboarding remains relative to target date (e.g. last working day).
				const dueDateBase =
					type === "ONBOARDING"
						? new Date(boardingProcess.startDate)
						: new Date(targetDate);
				const dueDate = new Date(dueDateBase);
				dueDate.setDate(dueDate.getDate() + item.dueOffset);

				return {
					organizationId,
					processId: boardingProcess.id,
					title: item.title,
					description: item.description,
					category: item.category,
					status: "PENDING" as const,
					priority: item.priority,
					dueDate: dueDate,
					order: item.order,
					metadata: item.metadata || {},
				};
			});

			await prisma.checklistItem.createMany({
				data: checklistItemsData,
			});

			boardingLogger.info(
				`Successfully created checklist items for boarding process ${boardingProcess.id}`,
			);
		}

		return boardingProcess;
	} catch (error) {
		boardingLogger.error(`Error creating boarding process: ${error}`);
		// We don't throw here to avoid breaking the calling flow (e.g. approval)
		// unless critical, but usually side-effects should log and continue or retry
		return null;
	}
};
