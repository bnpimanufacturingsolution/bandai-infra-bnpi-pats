import { Response } from "express";
import { PrismaClient } from "../../generated/prisma";
import { buildErrorResponse } from "../../helper/error-handler";
import { DEFAULT_ORG_BRANDING } from "../../helper/provisioning-state.helper";
import { buildSuccessResponse } from "../../helper/success-handler.helper";
import { AuthRequest } from "../../middleware/verifyToken";
import {
	buildWorkforceRecruitmentPolicyCreateInput,
	buildHiringRequisitionDescription,
	countCurrentHeadcount,
	getOrCreateWorkforceRecruitmentSetting,
	listCurrentHeadcounts,
	resolveWorkforcePolicy,
	serializeWorkforceRecruitmentSetting,
	WORKFORCE_REQUISITION_REQUEST_SUBTYPE,
	WORKFORCE_REQUISITION_WORKFLOW_CODE,
} from "../../helper/workforce-recruitment.helper";
import {
	WorkforceRecruitmentRequestContextQuerySchema,
	WorkforceRecruitmentSettingsSchema,
} from "../../zod/workforceRecruitmentSetting.zod";

const ADMIN_ROLES = new Set(["hris-admin", "hris-hr-manager", "admin", "super_admin"]);
const PROVISIONING_ORG_CODE = "bnei";
const PROVISIONING_ORG_NAME = "Bandai Namco";
const PROVISIONING_ORG_DESCRIPTION =
	"Bandai Namco Entertainment Inc. - Japanese multinational video game and toy company";

const canManageSettings = (role?: string | null) =>
	ADMIN_ROLES.has(String(role || "").trim().toLowerCase());

const isPrivilegedRole = (role?: string | null) => canManageSettings(role);

const ensureProvisioningOrganization = async (prisma: PrismaClient) => {
	const existing = await prisma.organization.findFirst({
		where: {
			code: PROVISIONING_ORG_CODE,
			isDeleted: false,
		},
	});

	if (existing) {
		return existing;
	}

	return prisma.organization.create({
		data: {
			name: PROVISIONING_ORG_NAME,
			code: PROVISIONING_ORG_CODE,
			description: PROVISIONING_ORG_DESCRIPTION,
			branding: DEFAULT_ORG_BRANDING,
		},
	});
};

const resolveOrganization = async (prisma: PrismaClient, organizationId?: string | null) => {
	if (organizationId) {
		const organizationById = await prisma.organization.findFirst({
			where: {
				id: organizationId,
				isDeleted: false,
			},
		});

		if (organizationById) {
			return organizationById;
		}
	}

	const firstOrganization = await prisma.organization.findFirst({
		where: {
			isDeleted: false,
		},
		orderBy: {
			createdAt: "asc",
		},
	});

	if (firstOrganization) {
		return firstOrganization;
	}

	return ensureProvisioningOrganization(prisma);
};

export const controller = (prisma: PrismaClient) => {
	const getSettings = async (req: AuthRequest, res: Response) => {
		try {
			const organization = await resolveOrganization(prisma, req.organizationId);
			const settingsRecord = await getOrCreateWorkforceRecruitmentSetting(
				prisma,
				String(organization.id),
			);
			const settings = serializeWorkforceRecruitmentSetting(settingsRecord);

			res.status(200).json(
				buildSuccessResponse(
					"Workforce recruitment settings retrieved successfully",
					{ settings },
					200,
				),
			);
		} catch (error: any) {
			res.status(500).json(
				buildErrorResponse(
					error?.message || "Failed to retrieve workforce recruitment settings",
					500,
				),
			);
		}
	};

	const updateSettings = async (req: AuthRequest, res: Response) => {
		try {
			if (req.role && !canManageSettings(req.role)) {
				res.status(403).json(
					buildErrorResponse("Only HR managers or admins can update workforce settings", 403),
				);
				return;
			}

			const parsed = WorkforceRecruitmentSettingsSchema.safeParse(req.body);
			if (!parsed.success) {
				res.status(400).json(buildErrorResponse("Validation failed", 400));
				return;
			}

			const organization = await resolveOrganization(prisma, req.organizationId);
			const current = await getOrCreateWorkforceRecruitmentSetting(
				prisma,
				String(organization.id),
			);
			const belowCurrentPolicies = [];
			for (const [index, policy] of parsed.data.policies.entries()) {
				if (policy.isActive === false || Number(policy.targetHeadcount || 0) <= 0) continue;
				const currentHeadcount = await countCurrentHeadcount(prisma, {
					organizationId: organization.id,
					departmentId: policy.departmentId,
					sectionId: policy.sectionId,
					positionId: policy.positionId,
					levelId: policy.levelId,
				});
				if (Number(policy.targetHeadcount || 0) < currentHeadcount) {
					belowCurrentPolicies.push({
						index,
						positionId: policy.positionId || null,
						levelId: policy.levelId || null,
						departmentId: policy.departmentId || null,
						sectionId: policy.sectionId || null,
						targetHeadcount: Number(policy.targetHeadcount || 0),
						currentHeadcount,
						message: `Target headcount must be at least the current headcount (${currentHeadcount}).`,
					});
				}
			}

			if (belowCurrentPolicies.length) {
				res.status(400).json(
					buildErrorResponse(
						"Recruitment target cannot be lower than current headcount",
						400,
						belowCurrentPolicies.map((policy) => ({
							field: `policies[${policy.index}].targetHeadcount`,
							message: policy.message,
						})),
					),
				);
				return;
			}

			const updated = await prisma.workforceRecruitmentSetting.update({
				where: { id: current.id },
				data: {
					isEnabled: parsed.data.isEnabled,
					enforceDepartmentManagerScope: parsed.data.enforceDepartmentManagerScope,
					defaultWorkflowCode:
						String(parsed.data.defaultWorkflowCode || WORKFORCE_REQUISITION_WORKFLOW_CODE)
							.trim()
							.toUpperCase() || WORKFORCE_REQUISITION_WORKFLOW_CODE,
					requestSubtype: WORKFORCE_REQUISITION_REQUEST_SUBTYPE,
					autoCreateJobOnApproval: parsed.data.autoCreateJobOnApproval,
					policies: {
						deleteMany: {},
						create: parsed.data.policies.map((policy) =>
							buildWorkforceRecruitmentPolicyCreateInput(
								String(organization.id),
								policy,
							),
						),
					},
				},
				include: {
					policies: {
						orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
					},
				},
			});

			res.status(200).json(
				buildSuccessResponse(
					"Workforce recruitment settings updated successfully",
					{
						settings: serializeWorkforceRecruitmentSetting(updated),
					},
					200,
				),
			);
		} catch (error: any) {
			res.status(500).json(
				buildErrorResponse(
					error?.message || "Failed to update workforce recruitment settings",
					500,
				),
			);
		}
	};

	const getHeadcounts = async (req: AuthRequest, res: Response) => {
		try {
			const organization = await resolveOrganization(prisma, req.organizationId);
			const headcounts = await listCurrentHeadcounts(prisma, String(organization.id));

			res.status(200).json(
				buildSuccessResponse(
					"Workforce recruitment headcounts retrieved successfully",
					{ headcounts },
					200,
				),
			);
		} catch (error: any) {
			res.status(500).json(
				buildErrorResponse(
					error?.message || "Failed to retrieve workforce recruitment headcounts",
					500,
				),
			);
		}
	};

	const getRequestContext = async (req: AuthRequest, res: Response) => {
		try {
			const queryParse = WorkforceRecruitmentRequestContextQuerySchema.safeParse(req.query);
			if (!queryParse.success) {
				res.status(400).json(buildErrorResponse("Validation failed", 400));
				return;
			}

			const organization = await resolveOrganization(prisma, req.organizationId);
			const requesterEmployeeId = String(req.metadata?.employee?.id || "").trim();
			if (!requesterEmployeeId) {
				res.status(401).json(
					buildErrorResponse("Employee context is required to create requisitions", 401),
				);
				return;
			}

			const requester = await prisma.employee.findFirst({
				where: {
					id: requesterEmployeeId,
					organizationId: organization.id,
					isDeleted: false,
				},
				select: {
					id: true,
					role: true,
					departmentId: true,
					department: {
						select: {
							id: true,
							name: true,
							managerId: true,
						},
					},
					sectionId: true,
					section: {
						select: {
							id: true,
							name: true,
						},
					},
					position: {
						select: {
							id: true,
							title: true,
						},
					},
					level: {
						select: {
							id: true,
							name: true,
						},
					},
				},
			});

			if (!requester) {
				res.status(404).json(buildErrorResponse("Requester employee not found", 404));
				return;
			}

			const settingsRecord = await getOrCreateWorkforceRecruitmentSetting(
				prisma,
				organization.id,
			);
			const settings = serializeWorkforceRecruitmentSetting(settingsRecord);
			const departmentId =
				String(queryParse.data.departmentId || requester.departmentId || "").trim() || null;
			const sectionId =
				String(queryParse.data.sectionId || requester.sectionId || "").trim() || null;
			const positionId =
				String(queryParse.data.positionId || "").trim() || null;
			const levelId =
				String(queryParse.data.levelId || "").trim() || null;
			const policy = resolveWorkforcePolicy(settings, {
				departmentId,
				sectionId,
				positionId,
				levelId,
			});
			const currentHeadcount = await countCurrentHeadcount(prisma, {
				organizationId: organization.id,
				departmentId,
				sectionId,
				positionId,
				levelId,
			});

			const department = departmentId
				? await prisma.department.findFirst({
						where: { id: departmentId, isDeleted: false },
						select: { id: true, name: true, managerId: true },
				  })
				: null;
			const position = positionId
				? await prisma.position.findFirst({
						where: { id: positionId, isDeleted: false },
						select: { id: true, title: true },
				  })
				: null;
			const section = sectionId
				? await prisma.section.findFirst({
						where: { id: sectionId, isDeleted: false },
						select: { id: true, name: true },
				  })
				: null;
			const level = levelId
				? await prisma.level.findFirst({
						where: { id: levelId, isDeleted: false },
						select: { id: true, name: true },
				  })
				: null;

			const isDepartmentManager =
				Boolean(requester.department?.managerId) &&
				requester.department?.managerId === requester.id;
			const isOwnDepartmentScope =
				!departmentId ||
				(Boolean(requester.department?.id) && requester.department?.id === departmentId);
			const canSubmit =
				settings.isEnabled &&
				(!settings.enforceDepartmentManagerScope
					? true
					: isPrivilegedRole(requester.role) ||
						(isDepartmentManager && isOwnDepartmentScope));

			res.status(200).json(
				buildSuccessResponse(
					"Workforce requisition context retrieved successfully",
					{
						settings: {
							isEnabled: settings.isEnabled,
							enforceDepartmentManagerScope: settings.enforceDepartmentManagerScope,
							defaultWorkflowCode: settings.defaultWorkflowCode,
							requestSubtype: settings.requestSubtype,
							autoCreateJobOnApproval: settings.autoCreateJobOnApproval,
						},
						requester: {
							id: requester.id,
							role: requester.role,
							departmentId: requester.departmentId,
							departmentName: requester.department?.name || null,
							sectionId: requester.sectionId || null,
							sectionName: requester.section?.name || null,
							isDepartmentManager,
							positionId: requester.position?.id || null,
							positionTitle: requester.position?.title || null,
							levelId: requester.level?.id || null,
							levelName: requester.level?.name || null,
						},
						scope: {
							department: department || null,
							section: section || null,
							position: position || null,
							level: level || null,
							description:
								position || level || section || department
									? buildHiringRequisitionDescription({
											departmentName: department?.name || null,
											sectionName: section?.name || null,
											positionTitle: position?.title || null,
											levelName: level?.name || null,
											requestedHeadcount: 1,
									  })
									: null,
						},
						policy: policy
							? {
									...policy,
									currentHeadcount,
									availableHeadcount: Math.max(
										0,
										Number(policy.targetHeadcount || 0) - currentHeadcount,
									),
							  }
							: null,
						headcount: {
							currentHeadcount,
							availableHeadcount: policy
								? Math.max(0, Number(policy.targetHeadcount || 0) - currentHeadcount)
								: null,
						},
						permissions: {
							canSubmit,
							reason: canSubmit
								? null
								: !settings.isEnabled
									? "Workforce recruitment settings are disabled."
									: settings.enforceDepartmentManagerScope && isDepartmentManager
										? "Department managers can only submit requisitions for their own department."
										: "Only department managers or HR admins can submit requisitions.",
						},
					},
					200,
				),
			);
		} catch (error: any) {
			res.status(500).json(
				buildErrorResponse(
					error?.message || "Failed to retrieve workforce requisition context",
					500,
				),
			);
		}
	};

	return {
		getSettings,
		updateSettings,
		getHeadcounts,
		getRequestContext,
	};
};
