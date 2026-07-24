import { Prisma, PrismaClient } from "../../generated/prisma";
import {
	buildSeededOrganizationBranding,
	DEFAULT_ORG_BRANDING,
	DEFAULT_PROVISIONING_SEEDER_VERSION,
	DEFAULT_PROVISIONING_TIMEZONE,
} from "../../helper/provisioning-state.helper";
import {
	DEFAULT_WORKFORCE_RECRUITMENT_SETTINGS,
	getOrCreateWorkforceRecruitmentSetting,
} from "../../helper/workforce-recruitment.helper";
import { DEFAULT_TIMESHEET_RULES_CONFIG } from "../../helper/timesheet-config.helper";
import {
	HRIS_AUTH_ROLE_KEYS,
	ensureSeedRoles,
	loginSeedAuth,
	resolveSeedOrganization,
	type SeedAuthOrganization,
	type SeedAuthRoleKey,
} from "../../helper/seed-auth.helper";
import { ensureDefaultCalculator } from "./calculatorSeeder";
import { seedHolidaysWithClient } from "./holidaySeeder";
import { ensureDevices } from "./deviceSeeder";
import { ensureSemiMonthlyPayrollPeriods } from "./payrollPeriodSeeder";
import { SeedAuthMode } from "./seedAuthModeAdapter";
import { assertSeedDryRunNotRequested } from "./seedDryRunGuard";
import { repairSeededDefaultLeaveTypePolicies } from "../../helper/leave-policy.helper";

type DocumentTypeFieldValidationSeed = {
	preset?: string | null;
	pattern?: string | null;
	message?: string | null;
	normalize?: string | null;
	minLength?: number | null;
	maxLength?: number | null;
	allowHyphens?: boolean;
};

type DocumentTypeFieldSeed = {
	key: string;
	label: string;
	type: string;
	required?: boolean;
	helperText?: string | null;
	placeholder?: string | null;
	options?: Array<{ label: string; value: string }>;
	validation?: DocumentTypeFieldValidationSeed | null;
};

const createDocumentTypeFields = (config?: {
	numberLabel?: string;
	numberRequired?: boolean;
	includeNumber?: boolean;
	issueDateRequired?: boolean;
	expiryDateRequired?: boolean;
	expiryHelperText?: string;
	numberValidation?: DocumentTypeFieldValidationSeed;
}): DocumentTypeFieldSeed[] => {
	const fields: DocumentTypeFieldSeed[] = [];

	if (config?.includeNumber !== false) {
		fields.push({
			key: "number",
			label: config?.numberLabel || "Document Number",
			type: "text",
			required: config?.numberRequired ?? true,
			helperText:
				((config?.numberValidation as any)?.message as string | undefined) ||
				"Use the official government-issued reference number.",
			placeholder: "Enter document number",
			options: [],
			validation: config?.numberValidation || null,
		});
	}

	fields.push({
		key: "issueDate",
		label: "Issue Date",
		type: "date",
		required: config?.issueDateRequired ?? false,
		helperText: "Optional when the document does not show an issue date.",
		placeholder: null,
		options: [],
	});

	fields.push({
		key: "expiryDate",
		label: "Expiry Date",
		type: "date",
		required: config?.expiryDateRequired ?? false,
		helperText: config?.expiryHelperText || "Leave blank if the document does not expire.",
		placeholder: null,
		options: [],
	});

	return fields;
};

const cloneDocumentTypeFields = (
	fields: DocumentTypeFieldSeed[],
): DocumentTypeFieldSeed[] =>
	fields.map((field: any) => ({
		...field,
		options: Array.isArray(field.options) ? field.options.map((option: any) => ({ ...option })) : [],
		validation: field.validation ? { ...field.validation } : null,
	}));

export type DefaultDocumentTypeSeed = {
	code: string;
	name: string;
	displayOrder: number;
	uploadBy: "HR" | "EMPLOYEE" | "BOTH";
	isRequired: boolean;
	fields: DocumentTypeFieldSeed[];
};

export const DEFAULT_COMPLIANCE_DOCUMENT_TYPES: DefaultDocumentTypeSeed[] = [
	{
		code: "CONTRACT",
		name: "Employment Contract",
		displayOrder: 1,
		uploadBy: "HR",
		isRequired: false,
		fields: createDocumentTypeFields({
			numberLabel: "Contract Number",
			numberRequired: false,
			issueDateRequired: true,
			expiryHelperText: "Leave blank for open-ended regular contracts.",
		}),
	},
	{
		code: "TIN",
		name: "Tax Identification Number",
		displayOrder: 2,
		uploadBy: "BOTH",
		isRequired: true,
		fields: createDocumentTypeFields({
			numberLabel: "TIN Number",
			numberValidation: {
				preset: "PH_TIN",
				normalize: "digits",
				message: "TIN must contain 9 digits, or 12 digits with branch code.",
				allowHyphens: true,
			},
		}),
	},
	{
		code: "SSS",
		name: "Social Security System",
		displayOrder: 3,
		uploadBy: "EMPLOYEE",
		isRequired: true,
		fields: createDocumentTypeFields({
			numberLabel: "SSS Number",
			numberValidation: {
				preset: "PH_SSS",
				normalize: "digits",
				message: "SSS number must contain exactly 10 digits.",
				allowHyphens: true,
			},
		}),
	},
	{
		code: "PHILHEALTH",
		name: "PhilHealth",
		displayOrder: 4,
		uploadBy: "EMPLOYEE",
		isRequired: true,
		fields: createDocumentTypeFields({
			numberLabel: "PhilHealth Number",
		}),
	},
	{
		code: "PAGIBIG",
		name: "Pag-IBIG Fund",
		displayOrder: 5,
		uploadBy: "EMPLOYEE",
		isRequired: true,
		fields: createDocumentTypeFields({
			numberLabel: "Pag-IBIG Number",
			numberValidation: {
				preset: "PH_PAGIBIG",
				normalize: "digits",
				message: "Pag-IBIG MID number must contain exactly 12 digits.",
				allowHyphens: true,
			},
		}),
	},
	{
		code: "VALID_ID",
		name: "Valid ID",
		displayOrder: 6,
		uploadBy: "EMPLOYEE",
		isRequired: false,
		fields: createDocumentTypeFields({
			numberLabel: "ID Number",
			expiryHelperText: "Leave blank only when the submitted ID has no expiration date.",
		}),
	},
	{
		code: "MEDICAL_CERTIFICATE",
		name: "Medical Certificate",
		displayOrder: 7,
		uploadBy: "EMPLOYEE",
		isRequired: false,
		fields: createDocumentTypeFields({
			numberLabel: "Certificate Reference",
			numberRequired: false,
			issueDateRequired: true,
			expiryHelperText: "Use expiry when the certificate has a validity window.",
		}),
	},
];

export const DEFAULT_COMPANY_PROFILE = {
	name: "Bandai Namco",
	code: "bnei",
	description:
		"Bandai Namco Entertainment Inc. - Japanese multinational video game and toy company",
	logo: DEFAULT_ORG_BRANDING.logo,
	timezone: DEFAULT_PROVISIONING_TIMEZONE,
};
export const DEFAULT_TIMESHEET_CONFIG_SEED = {
	enableAutoApprove: false,
	enableEditBeforeSubmission: true,
	rejectBehavior: "REVISE" as const,
	overtimeFlagThresholdMinutes: 60,
	workTimeRounding:
		DEFAULT_TIMESHEET_RULES_CONFIG.workTimeRounding as unknown as Prisma.InputJsonValue,
	overtimeQualification:
		DEFAULT_TIMESHEET_RULES_CONFIG.overtimeQualification as unknown as Prisma.InputJsonValue,
	payrollFinalization:
		DEFAULT_TIMESHEET_RULES_CONFIG.payrollFinalization as unknown as Prisma.InputJsonValue,
};
export const DEFAULT_PAYROLL_CYCLE_CONFIG_SEED = {
	defaultPayFrequency: "SEMI_MONTHLY" as const,
	payDateOffsetDays: 5,
	businessDayRule: "NEXT_BUSINESS_DAY" as const,
	includeHolidaysInBusinessDayCheck: true,
};
export const DEFAULT_WORKFORCE_RECRUITMENT_CONFIG_SEED = {
	isEnabled: DEFAULT_WORKFORCE_RECRUITMENT_SETTINGS.isEnabled,
	enforceDepartmentManagerScope:
		DEFAULT_WORKFORCE_RECRUITMENT_SETTINGS.enforceDepartmentManagerScope,
	defaultWorkflowCode: DEFAULT_WORKFORCE_RECRUITMENT_SETTINGS.defaultWorkflowCode,
	requestSubtype: DEFAULT_WORKFORCE_RECRUITMENT_SETTINGS.requestSubtype,
	autoCreateJobOnApproval:
		DEFAULT_WORKFORCE_RECRUITMENT_SETTINGS.autoCreateJobOnApproval,
};
export const LOCAL_ADMIN_SEEDS = [
	{
		email: "super@admin.com",
		userName: "super-admin",
		password: "password123",
		role: "super_admin",
	},
	{
		email: "hris@admin.com",
		userName: "hris-admin",
		password: "password123",
		role: "hris-admin",
	},
	{
		email: "admin@bandai.local",
		userName: "admin-bandai-local",
		password: "password123",
		role: "hris-admin",
	},
] as const;

type LocalAdminSeed = (typeof LOCAL_ADMIN_SEEDS)[number];

export function orderLocalAdminSeedsForExistingUsers(
	seeds: readonly LocalAdminSeed[],
	existingUsers: readonly { email: string; userName: string | null }[],
): LocalAdminSeed[] {
	const pending = [...seeds];
	const ordered: LocalAdminSeed[] = [];
	const currentUserNameByEmail = new Map(
		existingUsers.map((user) => [user.email, user.userName]),
	);
	const occupyingEmailByUserName = new Map(
		existingUsers
			.filter(
				(user): user is { email: string; userName: string } =>
					typeof user.userName === "string" && user.userName.length > 0,
			)
			.map((user) => [user.userName, user.email]),
	);

	while (pending.length > 0) {
		const nextIndex = pending.findIndex((seed) => {
			const occupyingEmail = occupyingEmailByUserName.get(seed.userName);
			return !occupyingEmail || occupyingEmail === seed.email;
		});

		if (nextIndex < 0) {
			const blocked = pending
				.map((seed) => `${seed.email}:${seed.userName}`)
				.sort()
				.join(", ");
			throw new Error(
				`Local admin username reconciliation is blocked by an identity conflict: ${blocked}`,
			);
		}

		const [next] = pending.splice(nextIndex, 1);
		const previousUserName = currentUserNameByEmail.get(next.email);
		if (
			previousUserName &&
			occupyingEmailByUserName.get(previousUserName) === next.email
		) {
			occupyingEmailByUserName.delete(previousUserName);
		}
		currentUserNameByEmail.set(next.email, next.userName);
		occupyingEmailByUserName.set(next.userName, next.email);
		ordered.push(next);
	}

	return ordered;
}

export interface SeedProjectDefaultsResult {
	mode: SeedAuthMode;
	organizationId: string;
	authToken?: string;
	authUserId?: string;
	authOrganization: SeedAuthOrganization;
	roleIds: Record<SeedAuthRoleKey, string>;
	calculatorId: string;
	payrollPeriodId: string;
	period1Id: string;
	period2Id: string;
}

export interface SeedProjectDefaultsOptions {
	organizationId?: string;
	companyName?: string;
	companyCode?: string;
	companyDescription?: string;
	ensureAdminUsers?: boolean;
	seedPhilippineHolidays?: boolean;
	seedMandated201DocumentTypes?: boolean;
	seedDefaultLeaveTypes?: boolean;
}

async function ensureDefaultTimesheetConfig(prisma: PrismaClient, organizationId: string) {
	console.log("\n=== Ensuring Timesheet Configuration ===");

	const timesheetConfig = await prisma.timesheetConfig.upsert({
		where: { organizationId },
		update: {},
		create: { organizationId, ...DEFAULT_TIMESHEET_CONFIG_SEED },
	});

	console.log(
		`   Timesheet config ready (OT threshold: ${timesheetConfig.overtimeFlagThresholdMinutes} mins)`,
	);

	return timesheetConfig;
}

async function ensureDefaultWorkforceRecruitmentConfig(
	prisma: PrismaClient,
	organizationId: string,
) {
	console.log("\n=== Ensuring Workforce Recruitment Configuration ===");

	const settings = await getOrCreateWorkforceRecruitmentSetting(prisma, organizationId);

	console.log(
		`   Workforce recruitment config ready (workflow: ${settings.defaultWorkflowCode})`,
	);

	return settings;
}

async function ensureDefaultDocumentTypes(prisma: PrismaClient, organizationId: string) {
	console.log("\n=== Ensuring Document Type Setup ===");

	for (const documentType of DEFAULT_COMPLIANCE_DOCUMENT_TYPES) {
		await prisma.documentType.upsert({
			where: {
				organizationId_code: {
					organizationId,
					code: documentType.code,
				},
			},
			update: {
				name: documentType.name,
				category: "COMPLIANCE",
				uploadBy: documentType.uploadBy,
				isRequired: documentType.isRequired,
				isEmployeeVisible: true,
				isActive: true,
				displayOrder: documentType.displayOrder,
				fields: cloneDocumentTypeFields(documentType.fields),
				isDeleted: false,
			},
			create: {
				organizationId,
				code: documentType.code,
				name: documentType.name,
				category: "COMPLIANCE",
				uploadBy: documentType.uploadBy,
				isRequired: documentType.isRequired,
				isEmployeeVisible: true,
				isActive: true,
				displayOrder: documentType.displayOrder,
				fields: cloneDocumentTypeFields(documentType.fields),
			},
		});
		console.log(`   Document type ready: ${documentType.code}`);
	}
}

const resolveBcrypt = (): { hash(password: string, saltOrRounds: number): Promise<string> } => {
	const bcrypt = require("bcryptjs");
	return bcrypt as { hash(password: string, saltOrRounds: number): Promise<string> };
};

async function ensureLocalAdminUsers(prisma: PrismaClient, organizationId: string): Promise<void> {
	const bcrypt = resolveBcrypt();
	const existingUsers = await prisma.user.findMany({
		where: {
			OR: [
				{ email: { in: LOCAL_ADMIN_SEEDS.map((seed) => seed.email) } },
				{ userName: { in: LOCAL_ADMIN_SEEDS.map((seed) => seed.userName) } },
			],
		},
		select: { email: true, userName: true },
	});
	const orderedSeeds = orderLocalAdminSeedsForExistingUsers(
		LOCAL_ADMIN_SEEDS,
		existingUsers,
	);

	for (const adminSeed of orderedSeeds) {
		const hashedPassword = await bcrypt.hash(adminSeed.password, 10);
		await prisma.user.upsert({
			where: { email: adminSeed.email },
			update: {
				userName: adminSeed.userName,
				password: hashedPassword,
				role: adminSeed.role,
				status: "active",
				isDeleted: false,
				loginMethod: "email",
				organizationId,
				metadata: {
					requirePasswordChange: false,
					isFirstLogin: false,
				},
			},
			create: {
				email: adminSeed.email,
				userName: adminSeed.userName,
				password: hashedPassword,
				role: adminSeed.role,
				status: "active",
				isDeleted: false,
				loginMethod: "email",
				organizationId,
				metadata: {
					requirePasswordChange: false,
					isFirstLogin: false,
				},
			},
		});
		console.log(`=== Local admin ensured: ${adminSeed.email} (${adminSeed.role}) ===`);
	}
}

export async function seedProjectDefaults(
	prisma: PrismaClient,
	options: SeedProjectDefaultsOptions = {},
): Promise<SeedProjectDefaultsResult> {
	console.log("\n" + "=".repeat(80));
	console.log(" STARTING PROJECT DEFAULTS SEEDING");
	console.log("=".repeat(80));

	const mode: SeedAuthMode = process.env.IDP_ENABLED === "true" ? "idp" : "local";
	let authToken: string | undefined;
	let authUserId: string | undefined;
	let authOrganization: SeedAuthOrganization;
	let organizationId = "";
	let roleIds: Record<SeedAuthRoleKey, string>;

	if (mode === "idp") {
		const authSession = await loginSeedAuth();
		authToken = authSession.token;
		authUserId = authSession.userId;
		authOrganization = await resolveSeedOrganization(authSession.token);
		organizationId = options.organizationId || authOrganization.id;
		roleIds = await ensureSeedRoles(authSession.token);

		console.log(`\n=== Auth Seeder Session Ready (${authSession.userId}) ===`);
		console.log(
			`=== Auth Organization Resolved: ${authOrganization.name || "Unknown"} (${authOrganization.id}) ===`,
		);
	} else {
		const existingOrganization = options.organizationId
			? await prisma.organization.findFirst({
					where: {
						id: options.organizationId,
						isDeleted: false,
					},
				})
			: null;
		const organizationName =
			options.companyName || existingOrganization?.name || DEFAULT_COMPANY_PROFILE.name;
		const organizationCode =
			options.companyCode || existingOrganization?.code || DEFAULT_COMPANY_PROFILE.code;
		const organizationDescription =
			options.companyDescription ||
			existingOrganization?.description ||
			DEFAULT_COMPANY_PROFILE.description;
		const localOrganization = await prisma.organization.upsert({
			where: { code: organizationCode },
			update: {
				name: organizationName,
				description: organizationDescription,
				branding: buildSeededOrganizationBranding({
					existingBranding: existingOrganization?.branding,
					companyName: organizationName,
					actor: "DEFAULT_PROJECT_SEEDER",
					hasAdmin: options.ensureAdminUsers !== false,
					timezone: DEFAULT_COMPANY_PROFILE.timezone,
					seederVersion: DEFAULT_PROVISIONING_SEEDER_VERSION,
				}),
				isDeleted: false,
			},
			create: {
				name: organizationName,
				code: organizationCode,
				description: organizationDescription,
				branding: buildSeededOrganizationBranding({
					companyName: organizationName,
					actor: "DEFAULT_PROJECT_SEEDER",
					hasAdmin: options.ensureAdminUsers !== false,
					timezone: DEFAULT_COMPANY_PROFILE.timezone,
					seederVersion: DEFAULT_PROVISIONING_SEEDER_VERSION,
				}),
			},
		});

		organizationId = localOrganization.id;
		authOrganization = {
			id: localOrganization.id,
			name: localOrganization.name,
			code: localOrganization.code,
		};

		roleIds = Object.values(HRIS_AUTH_ROLE_KEYS).reduce(
			(acc, key) => ({ ...acc, [key]: key }),
			{} as Record<SeedAuthRoleKey, string>,
		);

		console.log(`\n=== Local Seeder Mode Enabled (IDP_ENABLED=false) ===`);
		console.log(
			`=== Local Organization Resolved: ${localOrganization.name} (${localOrganization.id}) ===`,
		);

		if (options.ensureAdminUsers !== false) {
			await ensureLocalAdminUsers(prisma, localOrganization.id);
		}
	}

	const calculatorId = await ensureDefaultCalculator(prisma, organizationId);
	if (options.seedDefaultLeaveTypes !== false) {
		await repairSeededDefaultLeaveTypePolicies(prisma, organizationId);
	}
	await ensureDefaultTimesheetConfig(prisma, organizationId);
	await ensureDefaultWorkforceRecruitmentConfig(prisma, organizationId);
	if (options.seedMandated201DocumentTypes !== false) {
		await ensureDefaultDocumentTypes(prisma, organizationId);
	}
	const { period1Id, period2Id } = await ensureSemiMonthlyPayrollPeriods({
		prisma,
		organizationId,
		calculatorId,
		year: new Date().getUTCFullYear(),
	});
	if (options.seedPhilippineHolidays !== false) {
		await seedHolidaysWithClient(prisma, { organizationId });
	}
	await ensureDevices(organizationId, prisma);
	await prisma.organization.update({
		where: { id: organizationId },
		data: {
			branding: buildSeededOrganizationBranding({
				existingBranding: (
					await prisma.organization.findUnique({
						where: { id: organizationId },
						select: { branding: true, name: true },
					})
				)?.branding,
				companyName: authOrganization.name || DEFAULT_COMPANY_PROFILE.name,
				actor: authUserId || "DEFAULT_PROJECT_SEEDER",
				hasAdmin: options.ensureAdminUsers !== false,
				timezone: DEFAULT_COMPANY_PROFILE.timezone,
				seederVersion: DEFAULT_PROVISIONING_SEEDER_VERSION,
			}),
		},
	});

	console.log("\n" + "=".repeat(80));
	console.log(" PROJECT DEFAULTS SEEDING COMPLETE");
	console.log("=".repeat(80));

	return {
		mode,
		organizationId,
		authToken,
		authUserId,
		authOrganization,
		roleIds,
		calculatorId,
		payrollPeriodId: period1Id,
		period1Id,
		period2Id,
	};
}

async function main() {
	assertSeedDryRunNotRequested("seed:defaults");
	const prisma = new PrismaClient();

	try {
		await seedProjectDefaults(prisma);
		console.log("Project defaults seeding completed successfully!");
	} finally {
		await prisma.$disconnect();
	}
}

if (require.main === module) {
	main().catch((error) => {
		console.error("Project defaults seeding failed:", error);
		process.exit(1);
	});
}
