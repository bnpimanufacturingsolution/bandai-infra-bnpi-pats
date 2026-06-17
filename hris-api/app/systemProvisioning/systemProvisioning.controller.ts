import { Response } from "express";
import { PrismaClient, Prisma } from "../../generated/prisma";
import { config } from "../../config/config";
import { buildErrorResponse } from "../../helper/error-handler";
import { buildSuccessResponse } from "../../helper/success-handler.helper";
import { uploadToCloudinary } from "../../helper/cloudinary.helper";
import { AuthRequest } from "../../middleware/verifyToken";
import {
	buildSeedAuthHeaders,
	buildSeedAuthUrl,
	ensureSeedRoles,
	loginSeedAuth,
	resolveSeedOrganization,
} from "../../helper/seed-auth.helper";
import {
	buildProvisioningAccessSnapshot,
	DEFAULT_ORG_BRANDING,
	extractProvisioningState,
	isHrSettingsComplete,
	mergeBrandingProvisioning,
	type ProvisioningBrandingState,
	type ProvisioningHrSettings,
} from "../../helper/provisioning-state.helper";
import { UpdateTimesheetConfigSchema } from "../../zod/timesheet.zod";
import {
	getOrCreateNormalizedTimesheetConfig,
	normalizeTimesheetRulesConfig,
} from "../../helper/timesheet-config.helper";
import {
	UpdatePayrollCycleConfigSchema,
} from "../../zod/payrollperiod.zod";
import { UpdateLeavePolicySchema } from "../../zod/leave-policy.zod";
import {
	getExistingLeavePolicies,
	getLeavePolicyByType,
	getOrCreateLeavePolicies,
	normalizeLeaveType,
} from "../../helper/leave-policy.helper";
import {
	PAGIBIG_CONFIG,
	PHILHEALTH_CONFIG,
	SSS_CONFIG,
	WITHHOLDING_TAX_TABLE,
} from "../../helper/tax-calculator.helper";
import {
	buildProvisioningPreview,
	PROVISIONING_SEEDER_VERSION,
	runSystemProvisioning,
	type ProvisioningInitializationStatus,
} from "./systemProvisioning.service";

type ProvisioningStepId =
	| "company-profile"
	| "system-preview"
	| "initialize-system"
	| "hr-settings"
	| "timesheet-settings"
	| "payroll-settings"
	| "leave-settings"
	| "admin-account";

type StepStatus = "COMPLETED" | "CURRENT" | "UPCOMING";

type AuthUserRoleAssignment = {
	organizationRole?: {
		role?: {
			name?: string;
			scope?: string;
		};
	};
};

type AuthUserListItem = {
	id?: string;
	email?: string;
	role?: string;
	status?: string;
	userRoles?: AuthUserRoleAssignment[];
	metadata?: Record<string, any>;
};

const LOCAL_ORG_CODE = "bnei";
const LOCAL_ORG_NAME = "Bandai Namco";
const SYSTEM_INIT_ACTOR = "SYSTEM_INIT";
const REQUIRED_LEAVE_TYPES = ["VACATION", "SICK", "PERSONAL"] as const;
const ADMIN_ROLES = new Set(["super_admin", "admin", "hris-admin"]);
const DEFAULT_CYCLE_RULES_JSON: Prisma.InputJsonValue = {
	SEMI_MONTHLY: {
		firstStartDay: 1,
		secondStartDay: 16,
		secondEndDay: "LAST_DAY",
	},
	WEEKLY: { anchorWeekday: 1 },
	BIWEEKLY: { anchorWeekday: 1 },
	MONTHLY: { startDay: 1, endDay: "LAST_DAY" },
	QUARTERLY: { startMonth: 1 },
	ANNUALLY: { startMonth: 1 },
};

const getRoleNamesFromAuthUser = (user: AuthUserListItem): string[] => {
	const fromAssignments = (user.userRoles || [])
		.map((assignment) => assignment.organizationRole?.role?.name)
		.filter((value): value is string => Boolean(value && value.trim()));

	if (fromAssignments.length > 0) {
		return fromAssignments;
	}

	return user.role ? [String(user.role)] : [];
};

const isActiveAuthUser = (user: AuthUserListItem) => {
	const status = String(user.status || "active").toLowerCase();
	return !["inactive", "suspended", "archived"].includes(status);
};

const isAdminRole = (role?: string) => typeof role === "string" && ADMIN_ROLES.has(role);
const isExplicitProvisioningAdmin = (metadata: unknown) =>
	Boolean(
		metadata &&
			typeof metadata === "object" &&
			(metadata as Record<string, any>).provisioningBootstrapAdmin === true,
	);

const normalizeBusinessDays = (value: unknown): string[] =>
	Array.isArray(value)
		? value
				.map((item) =>
					String(item || "")
						.trim()
						.toUpperCase(),
				)
				.filter(Boolean)
		: [];

const extractListPayload = (payload: any): any[] => {
	if (Array.isArray(payload?.data?.users)) return payload.data.users;
	if (Array.isArray(payload?.data?.docs)) return payload.data.docs;
	if (Array.isArray(payload?.data?.data)) return payload.data.data;
	if (Array.isArray(payload?.data)) return payload.data;
	if (Array.isArray(payload?.users)) return payload.users;
	if (Array.isArray(payload?.docs)) return payload.docs;
	return [];
};

export const controller = (prisma: PrismaClient) => {
	const getProvisioningActor = (req: AuthRequest) => req.userId || SYSTEM_INIT_ACTOR;

	const touchProvisioningStep = async (params: {
		organizationId: string;
		stepId: ProvisioningStepId;
		actor: string;
		extraUpdates?: Partial<ProvisioningBrandingState>;
	}) => {
		const organization = await resolveProvisioningOrganization(params.organizationId);
		const nowIso = new Date().toISOString();
		const nextBranding = mergeBrandingProvisioning(organization.branding, {
			...(params.extraUpdates || {}),
			completedAtByStep: {
				[params.stepId]: nowIso,
			},
			completedByStep: {
				[params.stepId]: params.actor,
			},
		});

		return prisma.organization.update({
			where: { id: organization.id },
			data: { branding: nextBranding },
		});
	};

	const updateProvisioningState = async (params: {
		organizationId: string;
		updates: Partial<ProvisioningBrandingState>;
	}) => {
		const organization = await resolveProvisioningOrganization(params.organizationId);
		const nextBranding = mergeBrandingProvisioning(organization.branding, params.updates);
		return prisma.organization.update({
			where: { id: organization.id },
			data: { branding: nextBranding },
		});
	};

	const getOrCreateTimesheetConfig = async (organizationId: string) =>
		getOrCreateNormalizedTimesheetConfig(prisma, organizationId);

	const getOrCreatePayrollCycleConfig = async (organizationId: string) => {
		let record = await prisma.payrollCycleConfig.findFirst({
			where: { organizationId, isDeleted: false },
		});

		if (!record) {
			record = await prisma.payrollCycleConfig.create({
				data: {
					organizationId,
					defaultPayFrequency: "SEMI_MONTHLY",
					payDateOffsetDays: 5,
					businessDayRule: "NEXT_BUSINESS_DAY",
					includeHolidaysInBusinessDayCheck: true,
					cycleRules: DEFAULT_CYCLE_RULES_JSON,
				},
			});
		}

		if (!record.cycleRules) {
			record = await prisma.payrollCycleConfig.update({
				where: { id: record.id },
				data: { cycleRules: DEFAULT_CYCLE_RULES_JSON },
			});
		}

		return record;
	};

	const ensureDefaultCalculator = async (organizationId: string) => {
		const calculatorName = "Default Philippine Calculator";
		const currentYear = new Date().getFullYear();
		const calculatorCode = `CALC-DEFAULT-${currentYear}`;

		return prisma.calculator.upsert({
			where: {
				organizationId_code: {
					organizationId,
					code: calculatorCode,
				},
			},
			update: {
				name: calculatorName,
				description:
					"Default calculator configured with Philippine TRAIN Law tax rates and contribution schedules",
				type: "BASIC",
				taxRates: WITHHOLDING_TAX_TABLE as unknown as Prisma.InputJsonValue,
				sssRates: {
					employeeRate: SSS_CONFIG.employeeRate,
					employerRate: SSS_CONFIG.employerRate,
					totalRate: SSS_CONFIG.totalRate,
					minimumBase: SSS_CONFIG.minimumBase,
					maximumCeiling: SSS_CONFIG.maximumCeiling,
				},
				philHealthRates: {
					employeeRate: PHILHEALTH_CONFIG.employeeRate,
					employerRate: PHILHEALTH_CONFIG.employerRate,
					totalRate: PHILHEALTH_CONFIG.totalRate,
					minimumBase: PHILHEALTH_CONFIG.minimumBase,
					maximumCeiling: PHILHEALTH_CONFIG.maximumCeiling,
				},
				pagibigRates: {
					rateBelowThreshold: PAGIBIG_CONFIG.rateBelowThreshold,
					rateAboveThreshold: PAGIBIG_CONFIG.rateAboveThreshold,
					threshold: PAGIBIG_CONFIG.threshold,
					maximumCeiling: PAGIBIG_CONFIG.maximumCeiling,
				},
				rateMultipliers: {
					ordinaryDay: { work: 1.0, ot: 1.25, nd: 1.1, ndot: 1.375 },
					restDayOrSpecialHoliday: { work: 1.3, ot: 1.69, nd: 1.43, ndot: 1.859 },
					specialHolidayOnRestDay: { work: 1.5, ot: 1.95, nd: 1.65, ndot: 2.145 },
					regularHoliday: { work: 2.0, ot: 2.6, nd: 2.2, ndot: 2.86 },
					regularHolidayOnRestDay: { work: 2.6, ot: 3.38, nd: 2.86, ndot: 3.718 },
					doubleHoliday: { work: 3.0, ot: 3.9, nd: 3.3, ndot: 4.29 },
					doubleHolidayOnRestDay: { work: 3.9, ot: 5.07, nd: 4.29, ndot: 5.577 },
				},
				isActive: true,
				isDefault: true,
			},
			create: {
				organizationId,
				code: calculatorCode,
				name: calculatorName,
				description:
					"Default calculator configured with Philippine TRAIN Law tax rates and contribution schedules",
				type: "BASIC",
				taxRates: WITHHOLDING_TAX_TABLE as unknown as Prisma.InputJsonValue,
				sssRates: {
					employeeRate: SSS_CONFIG.employeeRate,
					employerRate: SSS_CONFIG.employerRate,
					totalRate: SSS_CONFIG.totalRate,
					minimumBase: SSS_CONFIG.minimumBase,
					maximumCeiling: SSS_CONFIG.maximumCeiling,
				},
				philHealthRates: {
					employeeRate: PHILHEALTH_CONFIG.employeeRate,
					employerRate: PHILHEALTH_CONFIG.employerRate,
					totalRate: PHILHEALTH_CONFIG.totalRate,
					minimumBase: PHILHEALTH_CONFIG.minimumBase,
					maximumCeiling: PHILHEALTH_CONFIG.maximumCeiling,
				},
				pagibigRates: {
					rateBelowThreshold: PAGIBIG_CONFIG.rateBelowThreshold,
					rateAboveThreshold: PAGIBIG_CONFIG.rateAboveThreshold,
					threshold: PAGIBIG_CONFIG.threshold,
					maximumCeiling: PAGIBIG_CONFIG.maximumCeiling,
				},
				rateMultipliers: {
					ordinaryDay: { work: 1.0, ot: 1.25, nd: 1.1, ndot: 1.375 },
					restDayOrSpecialHoliday: { work: 1.3, ot: 1.69, nd: 1.43, ndot: 1.859 },
					specialHolidayOnRestDay: { work: 1.5, ot: 1.95, nd: 1.65, ndot: 2.145 },
					regularHoliday: { work: 2.0, ot: 2.6, nd: 2.2, ndot: 2.86 },
					regularHolidayOnRestDay: { work: 2.6, ot: 3.38, nd: 2.86, ndot: 3.718 },
					doubleHoliday: { work: 3.0, ot: 3.9, nd: 3.3, ndot: 4.29 },
					doubleHolidayOnRestDay: { work: 3.9, ot: 5.07, nd: 4.29, ndot: 5.577 },
				},
				isActive: true,
				isDefault: true,
			},
		});
	};

	const ensureLocalOrganization = async () => {
		const existing = await prisma.organization.findFirst({
			where: {
				code: LOCAL_ORG_CODE,
				isDeleted: false,
			},
		});

		if (existing) return existing;

		return prisma.organization.create({
			data: {
				name: LOCAL_ORG_NAME,
				code: LOCAL_ORG_CODE,
				description:
					"Bandai Namco Entertainment Inc. - Japanese multinational video game and toy company",
				branding: DEFAULT_ORG_BRANDING,
			},
		});
	};

	const resolveProvisioningOrganization = async (preferredOrganizationId?: string | null) => {
		if (preferredOrganizationId) {
			const byId = await prisma.organization.findFirst({
				where: { id: preferredOrganizationId, isDeleted: false },
			});
			if (byId) return byId;
		}

		if (config.idpEnabled) {
			const authSession = await loginSeedAuth();
			const authOrg = await resolveSeedOrganization(authSession.token);

			let localOrg = await prisma.organization.findFirst({
				where: {
					OR: [{ id: authOrg.id }, { code: authOrg.code || LOCAL_ORG_CODE }],
					isDeleted: false,
				},
			});

			if (!localOrg) {
				localOrg = await prisma.organization.create({
					data: {
						name: authOrg.name || LOCAL_ORG_NAME,
						code: authOrg.code || LOCAL_ORG_CODE,
						description:
							"Bandai Namco Entertainment Inc. - Japanese multinational video game and toy company",
						branding: DEFAULT_ORG_BRANDING,
					},
				});
			}

			return localOrg;
		}

		return ensureLocalOrganization();
	};

	const listAdminUsers = async (organizationId: string) => {
		if (!config.idpEnabled) {
			const users = await prisma.user.findMany({
				where: {
					organizationId,
					isDeleted: false,
					status: {
						notIn: ["inactive", "suspended", "archived"],
					},
				},
				select: {
					id: true,
					email: true,
					role: true,
					status: true,
					metadata: true,
				},
			});

			return users.filter(
				(user) => isAdminRole(user.role) || isExplicitProvisioningAdmin(user.metadata),
			);
		}

		const authSession = await loginSeedAuth();
		const response = await fetch(
			buildSeedAuthUrl(
				`/api/user?document=true&limit=200&filter=${encodeURIComponent(
					JSON.stringify([{ organizationId }]),
				)}`,
			),
			{
				method: "GET",
				headers: buildSeedAuthHeaders(authSession.token),
			},
		);

		if (!response.ok) {
			const text = await response.text();
			throw new Error(`Failed to list auth users: ${response.status} ${text}`);
		}

		const payload = await response.json();
		return extractListPayload(payload).filter((user: AuthUserListItem) => {
			if (!isActiveAuthUser(user)) return false;
			if (isExplicitProvisioningAdmin(user.metadata)) return true;
			const roles = getRoleNamesFromAuthUser(user);
			return roles.some((role) => isAdminRole(role));
		});
	};

	const getProvisioningSnapshot = async (params: {
		organizationId?: string | null;
		role?: string;
		userId?: string;
	}) => {
		const organization = await resolveProvisioningOrganization(params.organizationId);
		const provisioning = extractProvisioningState(organization.branding);
		const adminUsers = await listAdminUsers(organization.id);
		const access = buildProvisioningAccessSnapshot({
			provisioning,
			hasAdmin: adminUsers.length > 0,
		});
		const currentStepId: ProvisioningStepId = !access.hasHrSettings
			? "company-profile"
			: !access.isProvisioned
				? "initialize-system"
				: !access.hasAdmin
					? "admin-account"
					: "admin-account";

		const baseSteps = [
			{
				id: "company-profile" as ProvisioningStepId,
				title: "Company Profile",
				description: "Review and save the company profile context for provisioning.",
				complete: access.hasHrSettings,
				reason: access.hasHrSettings
					? "Company profile settings are ready."
					: "Company name and timezone are required before preview and initialize.",
				route: "/setup?step=company-profile",
			},
			{
				id: "system-preview" as ProvisioningStepId,
				title: "System Setup Preview",
				description: "Review the seeded defaults that will be applied to the HRIS.",
				complete: access.hasHrSettings,
				reason: access.hasHrSettings
					? "Seeder preview is available."
					: "Complete company profile first to unlock the preview.",
				route: "/setup?step=system-preview",
			},
			{
				id: "initialize-system" as ProvisioningStepId,
				title: "Initialize System",
				description: "Run trusted seeders and bootstrap the operational HR system.",
				complete: access.isProvisioned,
				reason: access.isProvisioned
					? "System provisioning finished successfully."
					: access.initializationStatus === "FAILED"
						? provisioning.lastError || "The last initialization attempt failed."
						: access.initializationStatus === "RUNNING"
							? "Provisioning is currently running."
							: "Initialize the system to seed company defaults and operational foundations.",
				route: "/setup?step=initialize-system",
			},
			{
				id: "admin-account" as ProvisioningStepId,
				title: "Admin Account",
				description: "Create the first admin account after provisioning completes.",
				complete: access.hasAdmin,
				reason: access.hasAdmin
					? "At least one admin account is active."
					: access.isProvisioned
						? "Create the first admin account to unlock normal access."
						: "Initialization must finish before the admin account can be created.",
				route: "/setup?step=admin-account",
			},
		];

		const decoratedSteps = baseSteps.map((step) => {
			let status: StepStatus = "UPCOMING";
			if (step.complete) status = "COMPLETED";
			else if (step.id === currentStepId) status = "CURRENT";
			return { ...step, status };
		});

		return {
			organization,
			provisioning,
			mode: access.mode,
			canManageSetup: true,
			currentStep: currentStepId,
			isProvisioned: access.isProvisioned,
			initializationStatus: access.initializationStatus,
			provisionedAt: provisioning.provisionedAt,
			provisionedBy: provisioning.provisionedBy,
			seederVersion: provisioning.seederVersion || PROVISIONING_SEEDER_VERSION,
			previewAvailable: access.previewAvailable,
			steps: decoratedSteps,
			summary: {
				hasAdmin: access.hasAdmin,
				isActivated: access.isProvisioned,
				hasHrSettings: access.hasHrSettings,
				hasTimesheetConfig: access.isProvisioned,
				hasPayrollCycleConfig: access.isProvisioned,
				hasOpenPayrollPeriod: access.isProvisioned,
				hasLeavePolicies: access.isProvisioned,
				hasDefaultCalculator: access.isProvisioned,
				isProvisioned: access.isProvisioned,
				initializationStatus: access.initializationStatus,
				previewAvailable: access.previewAvailable,
			},
		};
	};

	const getStatus = async (req: AuthRequest, res: Response) => {
		try {
			const organization = await resolveProvisioningOrganization(req.organizationId);
			const snapshot = await getProvisioningSnapshot({
				organizationId: organization.id,
				userId: getProvisioningActor(req),
			});

			res.status(200).json(
				buildSuccessResponse(
					"System provisioning status retrieved successfully",
					snapshot,
					200,
				),
			);
		} catch (error: any) {
			res.status(500).json(
				buildErrorResponse(
					error?.message || "Failed to retrieve system provisioning status",
					500,
				),
			);
		}
	};

	const getPreview = async (req: AuthRequest, res: Response) => {
		try {
			const organization = await resolveProvisioningOrganization(req.organizationId);
			const provisioning = extractProvisioningState(organization.branding);
			if (!isHrSettingsComplete(provisioning.hrSettings)) {
				res.status(409).json(
					buildErrorResponse(
						"Company profile must be completed before loading the provisioning preview",
						409,
					),
				);
				return;
			}

			const preview = buildProvisioningPreview({
				organization,
				provisioning,
			});
			res.status(200).json(
				buildSuccessResponse(
					"System provisioning preview retrieved successfully",
					preview,
					200,
				),
			);
		} catch (error: any) {
			res.status(500).json(
				buildErrorResponse(
					error?.message || "Failed to retrieve system provisioning preview",
					500,
				),
			);
		}
	};

	const initialize = async (req: AuthRequest, res: Response) => {
		try {
			const organization = await resolveProvisioningOrganization(req.organizationId);
			const actor = getProvisioningActor(req);
			const provisioning = extractProvisioningState(organization.branding);

			if (!isHrSettingsComplete(provisioning.hrSettings)) {
				res.status(409).json(
					buildErrorResponse(
						"Company profile must be completed before initializing the system",
						409,
					),
				);
				return;
			}

			if (provisioning.initializationStatus === "RUNNING") {
				res.status(409).json(
					buildErrorResponse("System provisioning is already running", 409),
				);
				return;
			}

			await updateProvisioningState({
				organizationId: organization.id,
				updates: {
					initializationStatus: "RUNNING",
					lastError: undefined,
					seederVersion: PROVISIONING_SEEDER_VERSION,
					hasHrSettings: true,
					previewAvailable: true,
					hasAdmin: provisioning.hasAdmin === true,
					mode: provisioning.hasAdmin === true ? "READY" : "PROVISIONING",
				},
			});

			try {
				const result = await runSystemProvisioning(prisma, {
					organizationId: organization.id,
					actor,
					isProvisioned: provisioning.isProvisioned === true,
					seedPhilippineHolidays: req.body?.seedPhilippineHolidays !== false,
					seedMandated201DocumentTypes:
						req.body?.seedMandated201DocumentTypes !== false,
					seedWorkflowTemplates: req.body?.seedWorkflowTemplates !== false,
					seedDefaultLeaveTypes: req.body?.seedDefaultLeaveTypes === true,
				});
				const nowIso = new Date().toISOString();

				await updateProvisioningState({
					organizationId: organization.id,
					updates: {
						isProvisioned: true,
						provisionedAt: provisioning.provisionedAt || nowIso,
						provisionedBy: provisioning.provisionedBy || actor,
						initializationStatus: "COMPLETED",
						lastError: undefined,
						seederVersion: PROVISIONING_SEEDER_VERSION,
						version: 1,
						hasHrSettings: true,
						previewAvailable: true,
						hasAdmin: provisioning.hasAdmin === true,
						mode: provisioning.hasAdmin === true ? "READY" : "PROVISIONING",
						completedAtByStep: {
							"initialize-system": nowIso,
						},
						completedByStep: {
							"initialize-system": actor,
						},
					},
				});

				const snapshot = await getProvisioningSnapshot({
					organizationId: organization.id,
					userId: actor,
				});
				res.status(200).json(
					buildSuccessResponse(
						"System provisioning initialized successfully",
						{
							success: true,
							alreadyProvisioned: result.alreadyProvisioned === true,
							counts: result.counts,
							status: snapshot,
						},
						200,
					),
				);
			} catch (error: any) {
				await updateProvisioningState({
					organizationId: organization.id,
					updates: {
						initializationStatus: "FAILED",
						lastError: error?.message || "Provisioning failed",
						seederVersion: PROVISIONING_SEEDER_VERSION,
						hasHrSettings: true,
						previewAvailable: true,
						hasAdmin: provisioning.hasAdmin === true,
						mode: "PROVISIONING",
					},
				});
				throw error;
			}
		} catch (error: any) {
			res.status(500).json(
				buildErrorResponse(
					error?.message || "Failed to initialize system provisioning",
					500,
				),
			);
		}
	};

	const bootstrapAdmin = async (req: AuthRequest, res: Response) => {
		try {
			const organization = await resolveProvisioningOrganization(req.organizationId);
			const existingAdmins = await listAdminUsers(organization.id);
			const currentSnapshot = await getProvisioningSnapshot({
				organizationId: organization.id,
				role: req.role,
				userId: req.userId,
			});

			if (existingAdmins.length > 0) {
				res.status(409).json(
					buildErrorResponse("An admin already exists for this organization", 409),
				);
				return;
			}

			if (currentSnapshot.summary.isProvisioned !== true) {
				res.status(409).json(
					buildErrorResponse(
						"Initialize the system successfully before creating the admin account.",
						409,
					),
				);
				return;
			}

			const email = String(req.body?.email || "")
				.trim()
				.toLowerCase();
			const userName = String(req.body?.userName || "").trim();
			const password = String(req.body?.password || "");

			if (!email || !userName || password.length < 6) {
				res.status(400).json(
					buildErrorResponse(
						"Email, username, and a password of at least 6 characters are required",
						400,
					),
				);
				return;
			}

			const conflictingUser = await prisma.user.findFirst({
				where: {
					OR: [{ email }, { userName }],
				},
				select: {
					id: true,
					email: true,
					userName: true,
				},
			});

			if (conflictingUser) {
				const conflictField =
					conflictingUser.userName === userName ? "username" : "email";
				res.status(409).json(
					buildErrorResponse(
						`Admin ${conflictField} is already in use. Use a different ${conflictField}.`,
						409,
					),
				);
				return;
			}

			if (!config.idpEnabled) {
				const bcrypt = require("bcryptjs") as {
					hash(password: string, saltRounds: number): Promise<string>;
				};
				const hashedPassword = await bcrypt.hash(password, 10);
				type BootstrapAdminUser = Prisma.UserGetPayload<{
					select: {
						id: true;
						email: true;
						userName: true;
						role: true;
						organizationId: true;
					};
				}>;
				let createdUser: BootstrapAdminUser;
				try {
					createdUser = await prisma.user.create({
						data: {
							email,
							userName,
							password: hashedPassword,
							role: "hris-admin",
							status: "active",
							isDeleted: false,
							loginMethod: "email",
							organizationId: organization.id,
							metadata: {
								requirePasswordChange: false,
								isFirstLogin: false,
							},
						},
						select: {
							id: true,
							email: true,
							userName: true,
							role: true,
							organizationId: true,
						},
					});
				} catch (error: any) {
					if (
						error instanceof Prisma.PrismaClientKnownRequestError &&
						error.code === "P2002"
					) {
						res.status(409).json(
							buildErrorResponse(
								"Admin email or username already exists. Use a different account.",
								409,
							),
						);
						return;
					}
					throw error;
				}

				await touchProvisioningStep({
					organizationId: organization.id,
					stepId: "admin-account",
					actor: createdUser.id,
				});
				const nowIso = new Date().toISOString();
				await updateProvisioningState({
					organizationId: organization.id,
					updates: {
						activatedAt: nowIso,
						activatedBy: createdUser.id,
						hasAdmin: true,
						mode: "READY",
						completedAtByStep: {
							"admin-account": nowIso,
						},
						completedByStep: {
							"admin-account": createdUser.id,
						},
					},
				});
				const snapshot = await getProvisioningSnapshot({
					organizationId: organization.id,
					userId: createdUser.id,
				});

				res.status(201).json(
					buildSuccessResponse(
						"Bootstrap admin created successfully",
						{
							user: createdUser,
							status: snapshot,
						},
						201,
					),
				);
				return;
			}

			const authSession = await loginSeedAuth();
			const authOrganization = await resolveSeedOrganization(authSession.token);
			const roleIds = await ensureSeedRoles(authSession.token);
			const adminRoleId =
				(roleIds as Record<string, string>)["hris-admin"] || roleIds["hris-hr-manager"];

			const response = await fetch(buildSeedAuthUrl("/api/user"), {
				method: "POST",
				headers: buildSeedAuthHeaders(authSession.token),
				body: JSON.stringify({
					email,
					userName,
					password,
					status: "active",
					loginMethod: "email",
					organizationId: authOrganization.id,
					roleIds: [adminRoleId],
					metadata: {
						provisioningBootstrapAdmin: true,
						requirePasswordChange: false,
						isFirstLogin: false,
					},
				}),
			});

			if (!response.ok) {
				const text = await response.text();
				res.status(500).json(
					buildErrorResponse(
						`Failed to create bootstrap admin in auth service: ${text}`,
						500,
					),
				);
				return;
			}

			const payload = await response.json();
			const createdUser = payload?.data || payload;
			await touchProvisioningStep({
				organizationId: organization.id,
				stepId: "admin-account",
				actor: createdUser?.id || SYSTEM_INIT_ACTOR,
			});
			const nowIso = new Date().toISOString();
			await updateProvisioningState({
				organizationId: organization.id,
				updates: {
					activatedAt: nowIso,
					activatedBy: createdUser?.id || SYSTEM_INIT_ACTOR,
					hasAdmin: true,
					mode: "READY",
					completedAtByStep: {
						"admin-account": nowIso,
					},
					completedByStep: {
						"admin-account": createdUser?.id || SYSTEM_INIT_ACTOR,
					},
				},
			});
			const snapshot = await getProvisioningSnapshot({
				organizationId: organization.id,
				userId: createdUser?.id || SYSTEM_INIT_ACTOR,
			});
			res.status(201).json(
				buildSuccessResponse(
					"Bootstrap admin created successfully",
					{
						user: createdUser,
						status: snapshot,
					},
					201,
				),
			);
		} catch (error: any) {
			res.status(500).json(
				buildErrorResponse(error?.message || "Failed to create bootstrap admin", 500),
			);
		}
	};

	const updateHrSettings = async (req: AuthRequest, res: Response) => {
		try {
			const companyName = String(req.body?.companyName || "").trim();
			const timezone = String(req.body?.timezone || "").trim();
			const description =
				typeof req.body?.description === "string" ? req.body.description.trim() : undefined;
			const logo = typeof req.body?.logo === "string" ? req.body.logo.trim() : undefined;
			const primaryColor =
				typeof req.body?.primaryColor === "string" ? req.body.primaryColor.trim() : undefined;
			const secondaryColor =
				typeof req.body?.secondaryColor === "string"
					? req.body.secondaryColor.trim()
					: undefined;
			const accentColor =
				typeof req.body?.accentColor === "string" ? req.body.accentColor.trim() : undefined;

			if (!companyName || !timezone) {
				res.status(400).json(
					buildErrorResponse("Company name and timezone are required", 400),
				);
				return;
			}

			const organization = await resolveProvisioningOrganization(req.organizationId);
			const actor = getProvisioningActor(req);
			const updatedBrandingOrganization = await touchProvisioningStep({
				organizationId: organization.id,
				stepId: "company-profile",
				actor,
				extraUpdates: {
					hrSettings: {
						companyName,
						timezone,
					},
					hasHrSettings: true,
					previewAvailable: true,
					mode:
						extractProvisioningState(organization.branding).isProvisioned === true &&
						extractProvisioningState(organization.branding).hasAdmin === true
							? "READY"
							: "PROVISIONING",
				},
			});
			const currentBranding =
				organization.branding &&
				typeof organization.branding === "object" &&
				!Array.isArray(organization.branding)
					? ({ ...(organization.branding as Record<string, any>) } as Record<string, any>)
					: {};
			const currentColors =
				currentBranding.colors &&
				typeof currentBranding.colors === "object" &&
				!Array.isArray(currentBranding.colors)
					? ({ ...(currentBranding.colors as Record<string, any>) } as Record<string, any>)
					: {};
			const nextColors = {
				...currentColors,
				...(primaryColor ? { primary: primaryColor } : {}),
				...(secondaryColor ? { secondary: secondaryColor } : {}),
				...(accentColor ? { accent: accentColor } : {}),
			};

			const updatedOrganization = await prisma.organization.update({
				where: { id: organization.id },
				data: {
					name: companyName,
					...(description !== undefined ? { description } : {}),
					branding: {
						...currentBranding,
						...((updatedBrandingOrganization.branding as Record<string, any> | undefined) ||
							{}),
						...(logo !== undefined ? { logo } : {}),
						colors: nextColors,
					},
				},
			});

			res.status(200).json(
				buildSuccessResponse(
					"HR setup values updated successfully",
					updatedOrganization,
					200,
				),
			);
		} catch (error: any) {
			res.status(500).json(
				buildErrorResponse(error?.message || "Failed to update HR setup values", 500),
			);
		}
	};

	const uploadLogo = async (req: AuthRequest, res: Response) => {
		try {
			const files = (req as any).files as Record<string, Express.Multer.File[]> | undefined;
			const logoFile = files?.logo?.[0];

			if (!logoFile?.buffer) {
				res.status(400).json(buildErrorResponse("Logo file is required", 400));
				return;
			}

			const organization = await resolveProvisioningOrganization(req.organizationId);
			const uploadResult = await uploadToCloudinary(logoFile.buffer, {
				folder: `organizations/${organization.id}/branding`,
				publicId: "logo",
				resourceType: "image",
				overwrite: true,
			});

			if (!uploadResult.success || !uploadResult.secureUrl) {
				res.status(500).json(
					buildErrorResponse(uploadResult.error || "Failed to upload logo", 500),
				);
				return;
			}

			const currentBranding =
				organization.branding &&
				typeof organization.branding === "object" &&
				!Array.isArray(organization.branding)
					? ({ ...(organization.branding as Record<string, any>) } as Record<string, any>)
					: {};
			const updatedOrganization = await prisma.organization.update({
				where: { id: organization.id },
				data: {
					branding: {
						...currentBranding,
						logo: uploadResult.secureUrl,
						logoPublicId: uploadResult.publicId || currentBranding.logoPublicId,
					},
				},
			});

			res.status(200).json(
				buildSuccessResponse(
					"Company logo uploaded successfully",
					{
						logo: uploadResult.secureUrl,
						organization: updatedOrganization,
					},
					200,
				),
			);
		} catch (error: any) {
			res.status(500).json(
				buildErrorResponse(error?.message || "Failed to upload company logo", 500),
			);
		}
	};

	const activate = async (req: AuthRequest, res: Response) => {
		try {
			const organization = await resolveProvisioningOrganization(req.organizationId);
			const snapshot = await getProvisioningSnapshot({
				organizationId: organization.id,
				userId: getProvisioningActor(req),
			});

			res.status(200).json(
				buildSuccessResponse(
					"System provisioning status retrieved successfully",
					snapshot,
					200,
				),
			);
		} catch (error: any) {
			res.status(500).json(
				buildErrorResponse(error?.message || "Failed to activate system provisioning", 500),
			);
		}
	};

	const getTimesheetSettings = async (req: AuthRequest, res: Response) => {
		try {
			const organization = await resolveProvisioningOrganization(req.organizationId);
			const record = await getOrCreateTimesheetConfig(organization.id);
			res.status(200).json(
				buildSuccessResponse("Timesheet settings retrieved successfully", record, 200),
			);
		} catch (error: any) {
			res.status(500).json(
				buildErrorResponse(error?.message || "Failed to retrieve timesheet settings", 500),
			);
		}
	};

	const updateTimesheetSettings = async (req: AuthRequest, res: Response) => {
		try {
			const parsed = UpdateTimesheetConfigSchema.safeParse(req.body);
			if (!parsed.success) {
				res.status(400).json(buildErrorResponse("Validation failed", 400));
				return;
			}

			const organization = await resolveProvisioningOrganization(req.organizationId);
			const current = await getOrCreateTimesheetConfig(organization.id);
			const rules = normalizeTimesheetRulesConfig({
				workTimeRounding: parsed.data.workTimeRounding ?? current.workTimeRounding,
				overtimeQualification:
					parsed.data.overtimeQualification ??
					current.overtimeQualification ?? {
						minimumMinutesBeforeQualification:
							parsed.data.overtimeFlagThresholdMinutes ??
							current.overtimeFlagThresholdMinutes,
					},
				payrollFinalization:
					parsed.data.payrollFinalization ?? current.payrollFinalization,
			});
			const updated = await prisma.timesheetConfig.update({
				where: { organizationId: organization.id },
				data: {
					...parsed.data,
					workTimeRounding: rules.workTimeRounding as any,
					overtimeQualification: rules.overtimeQualification as any,
					payrollFinalization: rules.payrollFinalization as any,
					overtimeFlagThresholdMinutes:
						rules.overtimeQualification.minimumMinutesBeforeQualification,
				},
			});

			await touchProvisioningStep({
				organizationId: organization.id,
				stepId: "timesheet-settings",
				actor: getProvisioningActor(req),
			});
			res.status(200).json(
				buildSuccessResponse("Timesheet settings updated successfully", updated, 200),
			);
		} catch (error: any) {
			res.status(500).json(
				buildErrorResponse(error?.message || "Failed to update timesheet settings", 500),
			);
		}
	};

	const getPayrollSettings = async (req: AuthRequest, res: Response) => {
		try {
			const organization = await resolveProvisioningOrganization(req.organizationId);
			const cycleConfig = await getOrCreatePayrollCycleConfig(organization.id);
			const calculator = await ensureDefaultCalculator(organization.id);
			res.status(200).json(
				buildSuccessResponse(
					"Payroll settings retrieved successfully",
					{
						cycleConfig,
						defaultCalculator: {
							id: calculator.id,
							code: calculator.code,
							name: calculator.name,
							description: calculator.description || "",
							type: calculator.type,
							taxRates: calculator.taxRates || [],
							sssRates: calculator.sssRates || {},
							philHealthRates: calculator.philHealthRates || {},
							pagibigRates: calculator.pagibigRates || {},
							rateMultipliers: calculator.rateMultipliers || {},
						},
					},
					200,
				),
			);
		} catch (error: any) {
			res.status(500).json(
				buildErrorResponse(error?.message || "Failed to retrieve payroll settings", 500),
			);
		}
	};

	const updatePayrollSettings = async (req: AuthRequest, res: Response) => {
		try {
			const parsed = UpdatePayrollCycleConfigSchema.safeParse(req.body);
			if (!parsed.success) {
				res.status(400).json(buildErrorResponse("Validation failed", 400));
				return;
			}

			const organization = await resolveProvisioningOrganization(req.organizationId);
			const currentConfig = await getOrCreatePayrollCycleConfig(organization.id);
			const mergedCycleRules = {
				...((currentConfig.cycleRules as Record<string, unknown> | null) || {}),
				...((parsed.data.cycleRules as Record<string, unknown> | undefined) || {}),
			};
			const updatedCycleConfig = await prisma.payrollCycleConfig.update({
				where: { id: currentConfig.id },
				data: {
					...parsed.data,
					cycleRules:
						parsed.data.cycleRules !== undefined
							? (mergedCycleRules as Prisma.InputJsonValue)
							: undefined,
				},
			});
			const calculator = await ensureDefaultCalculator(organization.id);
			const calculatorPayload =
				req.body?.calculator &&
				typeof req.body.calculator === "object" &&
				!Array.isArray(req.body.calculator)
					? (req.body.calculator as Record<string, any>)
					: null;
			let updatedCalculator = calculator;

			if (calculatorPayload) {
				const calculatorUpdateData: Prisma.CalculatorUpdateInput = {};
				const allowedTypes = new Set([
					"BASIC",
					"GROSS_TO_NET",
					"NET_TO_GROSS",
					"THIRTEENTH_MONTH",
					"CUSTOM",
				]);

				if (calculatorPayload.name !== undefined) {
					const nextName = String(calculatorPayload.name || "").trim();
					if (!nextName) {
						res.status(400).json(
							buildErrorResponse("Calculator name is required", 400),
						);
						return;
					}
					calculatorUpdateData.name = nextName;
				}

				if (calculatorPayload.description !== undefined) {
					calculatorUpdateData.description = String(
						calculatorPayload.description || "",
					).trim();
				}

				if (calculatorPayload.type !== undefined) {
					const nextType = String(calculatorPayload.type || "")
						.trim()
						.toUpperCase();
					if (!allowedTypes.has(nextType)) {
						res.status(400).json(buildErrorResponse("Invalid calculator type", 400));
						return;
					}
					calculatorUpdateData.type = nextType as any;
				}

				if (calculatorPayload.taxRates !== undefined) {
					calculatorUpdateData.taxRates =
						calculatorPayload.taxRates as Prisma.InputJsonValue;
				}

				if (calculatorPayload.sssRates !== undefined) {
					calculatorUpdateData.sssRates =
						calculatorPayload.sssRates as Prisma.InputJsonValue;
				}

				if (calculatorPayload.philHealthRates !== undefined) {
					calculatorUpdateData.philHealthRates =
						calculatorPayload.philHealthRates as Prisma.InputJsonValue;
				}

				if (calculatorPayload.pagibigRates !== undefined) {
					calculatorUpdateData.pagibigRates =
						calculatorPayload.pagibigRates as Prisma.InputJsonValue;
				}

				if (calculatorPayload.rateMultipliers !== undefined) {
					calculatorUpdateData.rateMultipliers =
						calculatorPayload.rateMultipliers as Prisma.InputJsonValue;
				}

				if (Object.keys(calculatorUpdateData).length > 0) {
					updatedCalculator = await prisma.calculator.update({
						where: { id: calculator.id },
						data: calculatorUpdateData,
					});
				}
			}
			await touchProvisioningStep({
				organizationId: organization.id,
				stepId: "payroll-settings",
				actor: getProvisioningActor(req),
			});
			res.status(200).json(
				buildSuccessResponse(
					"Payroll settings updated successfully",
					{
						cycleConfig: updatedCycleConfig,
						defaultCalculator: {
							id: updatedCalculator.id,
							code: updatedCalculator.code,
							name: updatedCalculator.name,
							description: updatedCalculator.description || "",
							type: updatedCalculator.type,
							taxRates: updatedCalculator.taxRates || [],
							sssRates: updatedCalculator.sssRates || {},
							philHealthRates: updatedCalculator.philHealthRates || {},
							pagibigRates: updatedCalculator.pagibigRates || {},
							rateMultipliers: updatedCalculator.rateMultipliers || {},
						},
					},
					200,
				),
			);
		} catch (error: any) {
			res.status(500).json(
				buildErrorResponse(error?.message || "Failed to update payroll settings", 500),
			);
		}
	};

	const getLeaveSettings = async (req: AuthRequest, res: Response) => {
		try {
			const organization = await resolveProvisioningOrganization(req.organizationId);
			const policies = await getExistingLeavePolicies(prisma, organization.id);
			res.status(200).json(
				buildSuccessResponse("Leave settings retrieved successfully", policies, 200),
			);
		} catch (error: any) {
			res.status(500).json(
				buildErrorResponse(error?.message || "Failed to retrieve leave settings", 500),
			);
		}
	};

	const updateLeaveSettings = async (req: AuthRequest, res: Response) => {
		try {
			const organization = await resolveProvisioningOrganization(req.organizationId);
			const updates = Array.isArray(req.body?.policies) ? req.body.policies : [];
			if (updates.length === 0) {
				res.status(400).json(
					buildErrorResponse("At least one leave policy update is required", 400),
				);
				return;
			}

			await getOrCreateLeavePolicies(prisma, organization.id);

			for (const entry of updates) {
				const leaveType = normalizeLeaveType(String(entry?.leaveType || ""));
				if (!leaveType) {
					res.status(400).json(buildErrorResponse("Invalid leave type provided", 400));
					return;
				}
				const existingPolicy = await getLeavePolicyByType(prisma, organization.id, leaveType);
				if (!existingPolicy) {
					res.status(404).json(buildErrorResponse("Leave policy not found", 404));
					return;
				}

				const parsed = UpdateLeavePolicySchema.safeParse(entry?.payload || {});
				if (!parsed.success) {
					res.status(400).json(buildErrorResponse("Validation failed", 400));
					return;
				}

				await prisma.leaveType.update({
					where: { id: existingPolicy.id },
					data: parsed.data,
				});
			}

			const policies = await getOrCreateLeavePolicies(prisma, organization.id);
			await touchProvisioningStep({
				organizationId: organization.id,
				stepId: "leave-settings",
				actor: getProvisioningActor(req),
			});
			res.status(200).json(
				buildSuccessResponse("Leave settings updated successfully", policies, 200),
			);
		} catch (error: any) {
			res.status(500).json(
				buildErrorResponse(error?.message || "Failed to update leave settings", 500),
			);
		}
	};

	return {
		getStatus,
		getPreview,
		initialize,
		bootstrapAdmin,
		uploadLogo,
		getTimesheetSettings,
		updateTimesheetSettings,
		getPayrollSettings,
		updatePayrollSettings,
		getLeaveSettings,
		updateLeaveSettings,
		updateHrSettings,
		activate,
	};
};
