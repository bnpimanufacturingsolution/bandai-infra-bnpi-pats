import { PrismaClient } from "../../generated/prisma";
import {
	DEFAULT_COMPLIANCE_DOCUMENT_TYPES,
	DEFAULT_COMPANY_PROFILE,
	DEFAULT_PAYROLL_CYCLE_CONFIG_SEED,
	DEFAULT_TIMESHEET_CONFIG_SEED,
	DEFAULT_WORKFORCE_RECRUITMENT_CONFIG_SEED,
	seedProjectDefaults,
} from "../../prisma/seeds/defaultProjectSeeder";
import { DEFAULT_PROVISIONING_SEEDER_VERSION } from "../../helper/provisioning-state.helper";
import { DEVICE_DEFINITIONS, type DeviceDefinition } from "../../prisma/seeds/deviceSeeder";
import { ALL_HOLIDAYS, type HolidayDefinition } from "../../prisma/seeds/holidaySeeder";
import { seedWorkflowInstanceTemplates } from "../../prisma/seeds/workflowInstanceTemplateSeeder";
import {
	getDefaultLeavePolicySeed,
	removeSeededDefaultLeaveTypes,
	repairSeededDefaultLeaveTypePolicies,
} from "../../helper/leave-policy.helper";
import {
	PAGIBIG_CONFIG,
	PHILHEALTH_CONFIG,
	SSS_CONFIG,
	WITHHOLDING_TAX_TABLE,
} from "../../helper/tax-calculator.helper";
import {
	mergeWithSeededWorkflowConfigs,
	seedWorkflowConfigsInBranding,
	type ProvisioningWorkflowConfig,
} from "../../helper/workflow-config.helper";
import { traceAsync } from "../../middleware/functionTracing";

export const PROVISIONING_SEEDER_VERSION = DEFAULT_PROVISIONING_SEEDER_VERSION;

export type ProvisioningInitializationStatus = "IDLE" | "RUNNING" | "FAILED" | "COMPLETED";

export interface ProvisioningPreviewPayload {
	companyProfile: {
		name: string;
		code: string;
		description: string;
		timezone: string;
		logo?: string;
	};
	holidays: Array<HolidayDefinition & { year: number }>;
	workflowConfigs: ProvisioningWorkflowConfig[];
	devices: DeviceDefinition[];
	documentTypes: Array<{
		code: string;
		name: string;
		uploadBy: "HR" | "EMPLOYEE" | "BOTH";
		isRequired: boolean;
	}>;
	leavePolicies: Array<{
		leaveType: string;
		requiresApproval: boolean;
		isPaid: boolean;
		minAdvanceNoticeDays: number;
		maxDaysPerRequest: number;
	}>;
	payrollPeriods: {
		year: number;
		frequency: typeof DEFAULT_PAYROLL_CYCLE_CONFIG_SEED.defaultPayFrequency;
		totalPeriods: number;
		includesCarryIn: boolean;
		examples: string[];
	};
	defaultCalculator: {
		code: string;
		name: string;
		type: string;
		description: string;
		taxTable: {
			bracketCount: number;
			monthlyZeroTaxCap: number;
			semiMonthlyZeroTaxCap: number;
			topRate: number;
		};
		contributions: {
			sssEmployeeRate: number;
			sssEmployerRate: number;
			philHealthEmployeeRate: number;
			philHealthEmployerRate: number;
			pagIbigRateBelowThreshold: number;
			pagIbigRateAboveThreshold: number;
			pagIbigThreshold: number;
		};
	};
	defaults: {
		timesheet: typeof DEFAULT_TIMESHEET_CONFIG_SEED;
		payroll: typeof DEFAULT_PAYROLL_CYCLE_CONFIG_SEED;
		workforceRecruitment: typeof DEFAULT_WORKFORCE_RECRUITMENT_CONFIG_SEED;
	};
}

export interface ProvisioningRunSummary {
	success: boolean;
	alreadyProvisioned?: boolean;
	counts: {
		holidays: number;
		workflowConfigs: number;
		devices: number;
		documentTypes: number;
		leavePolicies: number;
		payrollPeriods: number;
	};
}

const DEFAULT_BOOTSTRAP_LEAVE_TYPES = [
	"VACATION",
	"SICK",
	"PERSONAL",
	"MATERNITY",
	"PATERNITY",
	"BEREAVEMENT",
	"UNPAID",
	"COMPENSATORY",
];

const buildPayrollPeriodPreview = (year: number) => ({
	year,
	frequency: DEFAULT_PAYROLL_CYCLE_CONFIG_SEED.defaultPayFrequency,
	totalPeriods: 25,
	includesCarryIn: true,
	examples: [
		`Period 2 - Dec ${year - 1} to Jan ${year}`,
		`Period 1 - Jan ${year}`,
		`Period 2 - Jan ${year} to Feb ${year}`,
	],
});

export const buildProvisioningPreview = (params: {
	organization: { name: string; code: string; description?: string | null; branding?: unknown };
	provisioning?: {
		hrSettings?: {
			companyName?: string;
			timezone?: string;
		};
	};
	year?: number;
}): ProvisioningPreviewPayload => {
	const previewYear = params.year ?? new Date().getUTCFullYear();
	const calculatorCode = `CALC-DEFAULT-${previewYear}`;

	return {
		companyProfile: {
			name:
				params.provisioning?.hrSettings?.companyName ||
				params.organization.name ||
				DEFAULT_COMPANY_PROFILE.name,
			code: params.organization.code || DEFAULT_COMPANY_PROFILE.code,
			description: params.organization.description || DEFAULT_COMPANY_PROFILE.description,
			timezone: params.provisioning?.hrSettings?.timezone || DEFAULT_COMPANY_PROFILE.timezone,
			logo:
				((params.organization.branding as Record<string, any> | undefined)
					?.logo as string) || DEFAULT_COMPANY_PROFILE.logo,
		},
		holidays: ALL_HOLIDAYS.map((holiday) => ({ ...holiday, year: previewYear })),
		workflowConfigs: mergeWithSeededWorkflowConfigs(params.organization.branding),
		devices: DEVICE_DEFINITIONS.map((device) => ({
			...device,
			config: device.config ? { ...device.config } : {},
			access: { ...device.access },
		})),
		documentTypes: DEFAULT_COMPLIANCE_DOCUMENT_TYPES.map((documentType) => ({
			code: documentType.code,
			name: documentType.name,
			uploadBy: documentType.uploadBy,
			isRequired: documentType.isRequired,
		})),
		leavePolicies: DEFAULT_BOOTSTRAP_LEAVE_TYPES.map((leaveType) => {
			const policy = getDefaultLeavePolicySeed(leaveType);
			return {
				leaveType,
				requiresApproval: policy.requiresApproval,
				isPaid: policy.isPaid,
				minAdvanceNoticeDays: policy.minAdvanceNoticeDays,
				maxDaysPerRequest: policy.maxDaysPerRequest,
			};
		}),
		payrollPeriods: buildPayrollPeriodPreview(previewYear),
		defaultCalculator: {
			code: calculatorCode,
			name: "Default Philippine Calculator",
			type: "BASIC",
			description:
				"Default calculator configured with Philippine TRAIN Law tax rates and contribution schedules",
			taxTable: {
				bracketCount: WITHHOLDING_TAX_TABLE.length,
				monthlyZeroTaxCap: WITHHOLDING_TAX_TABLE[0]?.monthlyCap || 0,
				semiMonthlyZeroTaxCap: WITHHOLDING_TAX_TABLE[0]?.semiMonthlyCap || 0,
				topRate: WITHHOLDING_TAX_TABLE[WITHHOLDING_TAX_TABLE.length - 1]?.rate || 0,
			},
			contributions: {
				sssEmployeeRate: SSS_CONFIG.employeeRate,
				sssEmployerRate: SSS_CONFIG.employerRate,
				philHealthEmployeeRate: PHILHEALTH_CONFIG.employeeRate,
				philHealthEmployerRate: PHILHEALTH_CONFIG.employerRate,
				pagIbigRateBelowThreshold: PAGIBIG_CONFIG.rateBelowThreshold,
				pagIbigRateAboveThreshold: PAGIBIG_CONFIG.rateAboveThreshold,
				pagIbigThreshold: PAGIBIG_CONFIG.threshold,
			},
		},
		defaults: {
			timesheet: { ...DEFAULT_TIMESHEET_CONFIG_SEED },
			payroll: { ...DEFAULT_PAYROLL_CYCLE_CONFIG_SEED },
			workforceRecruitment: { ...DEFAULT_WORKFORCE_RECRUITMENT_CONFIG_SEED },
		},
	};
};

export const runSystemProvisioning = async (
	prisma: PrismaClient,
	params: {
		organizationId: string;
		actor: string;
		isProvisioned: boolean;
		seedPhilippineHolidays?: boolean;
		seedMandated201DocumentTypes?: boolean;
		seedWorkflowTemplates?: boolean;
		seedDefaultLeaveTypes?: boolean;
	},
): Promise<ProvisioningRunSummary> => {
	return traceAsync(
		async () => {
			const seedPhilippineHolidays = params.seedPhilippineHolidays !== false;
			const seedMandated201DocumentTypes = params.seedMandated201DocumentTypes !== false;
			const seedWorkflowTemplates = params.seedWorkflowTemplates !== false;
			const seedDefaultLeaveTypes = params.seedDefaultLeaveTypes === true;

			if (params.isProvisioned) {
				let workflowTemplateCount = 0;

				if (seedDefaultLeaveTypes) {
					await repairSeededDefaultLeaveTypePolicies(prisma, params.organizationId);
				} else {
					await removeSeededDefaultLeaveTypes(prisma, params.organizationId);
				}

				if (seedWorkflowTemplates) {
					const workflowTemplateResult = await seedWorkflowInstanceTemplates(
						prisma,
						params.organizationId,
					);
					workflowTemplateCount = workflowTemplateResult.total;

					const organization = await prisma.organization.findFirst({
						where: {
							id: params.organizationId,
							isDeleted: false,
						},
						select: {
							id: true,
							branding: true,
						},
					});

					if (organization) {
						await prisma.organization.update({
							where: { id: organization.id },
							data: {
								branding: seedWorkflowConfigsInBranding(organization.branding),
							},
						});
					}
				}

				return {
					success: true,
					alreadyProvisioned: true,
					counts: {
						holidays: seedPhilippineHolidays ? ALL_HOLIDAYS.length : 0,
						workflowConfigs: workflowTemplateCount,
						devices: DEVICE_DEFINITIONS.length,
						documentTypes: seedMandated201DocumentTypes
							? DEFAULT_COMPLIANCE_DOCUMENT_TYPES.length
							: 0,
						leavePolicies: seedDefaultLeaveTypes ? DEFAULT_BOOTSTRAP_LEAVE_TYPES.length : 0,
						payrollPeriods: 25,
					},
				};
			}

			await seedProjectDefaults(prisma, {
				organizationId: params.organizationId,
				ensureAdminUsers: false,
				seedPhilippineHolidays,
				seedMandated201DocumentTypes,
				seedDefaultLeaveTypes,
			});

			if (!seedDefaultLeaveTypes) {
				await removeSeededDefaultLeaveTypes(prisma, params.organizationId);
			}

			const organization = await prisma.organization.findFirst({
				where: {
					id: params.organizationId,
					isDeleted: false,
				},
				select: {
					id: true,
					branding: true,
				},
			});

			let workflowTemplateCount = 0;

			if (organization && seedWorkflowTemplates) {
				const workflowTemplateResult = await seedWorkflowInstanceTemplates(
					prisma,
					organization.id,
				);
				workflowTemplateCount = workflowTemplateResult.total;
				await prisma.organization.update({
					where: { id: organization.id },
					data: {
						branding: seedWorkflowConfigsInBranding(organization.branding),
					},
				});
			}

			return {
				success: true,
				counts: {
					holidays: seedPhilippineHolidays ? ALL_HOLIDAYS.length : 0,
					workflowConfigs: workflowTemplateCount,
					devices: DEVICE_DEFINITIONS.length,
					documentTypes: seedMandated201DocumentTypes
						? DEFAULT_COMPLIANCE_DOCUMENT_TYPES.length
						: 0,
					leavePolicies: seedDefaultLeaveTypes ? DEFAULT_BOOTSTRAP_LEAVE_TYPES.length : 0,
					payrollPeriods: 25,
				},
			};
		},
		"runSystemProvisioning",
		"system-provisioning",
	);
};
