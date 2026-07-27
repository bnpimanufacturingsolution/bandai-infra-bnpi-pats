import { PrismaClient, BenefitCategory, BenefitPayrollDirection } from "../../generated/prisma";
import { resolveDefaultSeedOrganizationId } from "./seedOrganizationResolver";

export interface BenefitTypeDefinition {
	code: string;
	name: string;
	description: string;
	category: BenefitCategory;
	payrollDirection: BenefitPayrollDirection;
	reconciliationAction?: string;
	provider?: string;
	coverage?: number;
	minAmount?: number;
	maxAmount?: number;
	fixedAmount?: number;
	percentage?: number;
	minServiceMonths?: number;
	isTaxable: boolean;
	isActive: boolean;
	defaultInstallments?: number;
	payrollCycleDays?: number;
	requireTermsAgreement?: boolean;
	defaultEligibilityMode?: "ENROLLED_ALWAYS" | "ATTENDANCE_QUALIFIED" | null;
	defaultEligibilityDisqualifyOnAbsent?: boolean | null;
	defaultEligibilityDisqualifyOnLate?: boolean | null;
	defaultEligibilityDisqualifyOnUndertime?: boolean | null;
	defaultEligibilityDisqualifyOnLeave?: boolean | null;
}

export const DEFAULT_BENEFIT_TYPES: BenefitTypeDefinition[] = [
	{
		code: "DMA",
		name: "De Minimis Allowance",
		description: "Reconciled compensation allowance catalog entry",
		category: BenefitCategory.ALLOWANCE,
		payrollDirection: BenefitPayrollDirection.COMPENSATION,
		reconciliationAction: "KEEP_AS_BENEFIT",
		isTaxable: false,
		isActive: true,
	},
	{
		code: "LLA",
		name: "Line Leader Allowance",
		description: "Reconciled role-based compensation allowance catalog entry",
		category: BenefitCategory.ALLOWANCE,
		payrollDirection: BenefitPayrollDirection.COMPENSATION,
		reconciliationAction: "KEEP_AS_BENEFIT",
		isTaxable: true,
		isActive: true,
	},
	{
		code: "MLA",
		name: "Meal Allowance",
		description: "Reconciled meal compensation allowance catalog entry",
		category: BenefitCategory.ALLOWANCE,
		payrollDirection: BenefitPayrollDirection.COMPENSATION,
		reconciliationAction: "KEEP_AS_BENEFIT",
		isTaxable: false,
		isActive: true,
	},
	{
		code: "PFA",
		name: "Performance Bonus",
		description: "Reconciled attendance incentive compensation catalog entry",
		category: BenefitCategory.BONUS,
		payrollDirection: BenefitPayrollDirection.COMPENSATION,
		reconciliationAction: "KEEP_AS_BENEFIT",
		isTaxable: true,
		isActive: true,
		// Classic Perfect Attendance: qualify on period attendance, fixed amount when due
		defaultEligibilityMode: "ATTENDANCE_QUALIFIED",
		defaultEligibilityDisqualifyOnAbsent: true,
		defaultEligibilityDisqualifyOnLate: true,
		defaultEligibilityDisqualifyOnUndertime: true,
		defaultEligibilityDisqualifyOnLeave: true,
	},
	{
		code: "OTM",
		name: "OT Meal Allowance",
		description: "Reconciled overtime meal compensation allowance catalog entry",
		category: BenefitCategory.ALLOWANCE,
		payrollDirection: BenefitPayrollDirection.COMPENSATION,
		reconciliationAction: "KEEP_AS_BENEFIT",
		isTaxable: false,
		isActive: true,
	},
	{
		code: "TSA",
		name: "Technical Skills Allowance",
		description: "Reconciled skill-based compensation allowance catalog entry",
		category: BenefitCategory.ALLOWANCE,
		payrollDirection: BenefitPayrollDirection.COMPENSATION,
		reconciliationAction: "KEEP_AS_BENEFIT",
		isTaxable: true,
		isActive: true,
	},
];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isTransientPrismaWriteConflict = (error: unknown) => {
	if (!error || typeof error !== "object") return false;
	return (
		"code" in error &&
		["P2034", "P2028"].includes(String((error as { code?: string }).code || ""))
	);
};

const withPrismaWriteRetry = async <T>(operation: () => Promise<T>, contextLabel: string) => {
	const retryDelaysMs = [200, 500, 1000, 1800, 2800];
	let lastError: unknown;

	for (let attempt = 0; attempt <= retryDelaysMs.length; attempt++) {
		try {
			return await operation();
		} catch (error) {
			lastError = error;
			if (!isTransientPrismaWriteConflict(error) || attempt === retryDelaysMs.length) {
				throw error;
			}

			const jitterMs = Math.floor(Math.random() * 250);
			console.warn(
				`Transient write conflict during ${contextLabel}; retrying attempt ${attempt + 2}/${retryDelaysMs.length + 1}.`,
			);
			await sleep(retryDelaysMs[attempt] + jitterMs);
		}
	}

	throw lastError instanceof Error ? lastError : new Error(String(lastError));
};

export async function ensureDefaultBenefitTypes(
	prisma: PrismaClient,
	organizationId: string,
): Promise<string[]> {
	console.log("\n=== Creating Default Benefit Types ===");
	const benefitTypeIds: string[] = [];

	for (const benefitDef of DEFAULT_BENEFIT_TYPES) {
		const benefitType = await withPrismaWriteRetry(
			() =>
				prisma.benefitType.upsert({
					where: {
						organizationId_name: {
							organizationId,
							name: benefitDef.name,
						},
					},
					update: {
						code: benefitDef.code,
						description: benefitDef.description,
						category: benefitDef.category,
						payrollDirection: benefitDef.payrollDirection,
						reconciliationAction: benefitDef.reconciliationAction,
						provider: benefitDef.provider,
						coverage: benefitDef.coverage,
						minAmount: benefitDef.minAmount,
						maxAmount: benefitDef.maxAmount,
						fixedAmount: benefitDef.fixedAmount,
						percentage: benefitDef.percentage,
						minServiceMonths: benefitDef.minServiceMonths,
						isTaxable: benefitDef.isTaxable,
						isActive: benefitDef.isActive,
										// Enrollments are recurring-only in HR UI; defaultInstallments kept for catalog legacy only.
						defaultInstallments: benefitDef.defaultInstallments ?? 6,
						payrollCycleDays: benefitDef.payrollCycleDays ?? 15,
						requireTermsAgreement: benefitDef.requireTermsAgreement ?? true,
						defaultEligibilityMode: benefitDef.defaultEligibilityMode ?? null,
						defaultEligibilityDisqualifyOnAbsent:
							benefitDef.defaultEligibilityDisqualifyOnAbsent ?? null,
						defaultEligibilityDisqualifyOnLate:
							benefitDef.defaultEligibilityDisqualifyOnLate ?? null,
						defaultEligibilityDisqualifyOnUndertime:
							benefitDef.defaultEligibilityDisqualifyOnUndertime ?? null,
						defaultEligibilityDisqualifyOnLeave:
							benefitDef.defaultEligibilityDisqualifyOnLeave ?? null,
						isDeleted: false,
					},
					create: {
						organizationId,
						code: benefitDef.code,
						name: benefitDef.name,
						description: benefitDef.description,
						category: benefitDef.category,
						payrollDirection: benefitDef.payrollDirection,
						reconciliationAction: benefitDef.reconciliationAction,
						provider: benefitDef.provider,
						coverage: benefitDef.coverage,
						minAmount: benefitDef.minAmount,
						maxAmount: benefitDef.maxAmount,
						fixedAmount: benefitDef.fixedAmount,
						percentage: benefitDef.percentage,
						minServiceMonths: benefitDef.minServiceMonths,
						isTaxable: benefitDef.isTaxable,
						isActive: benefitDef.isActive,
										// Enrollments are recurring-only in HR UI; defaultInstallments kept for catalog legacy only.
						defaultInstallments: benefitDef.defaultInstallments ?? 6,
						payrollCycleDays: benefitDef.payrollCycleDays ?? 15,
						requireTermsAgreement: benefitDef.requireTermsAgreement ?? true,
						defaultEligibilityMode: benefitDef.defaultEligibilityMode ?? null,
						defaultEligibilityDisqualifyOnAbsent:
							benefitDef.defaultEligibilityDisqualifyOnAbsent ?? null,
						defaultEligibilityDisqualifyOnLate:
							benefitDef.defaultEligibilityDisqualifyOnLate ?? null,
						defaultEligibilityDisqualifyOnUndertime:
							benefitDef.defaultEligibilityDisqualifyOnUndertime ?? null,
						defaultEligibilityDisqualifyOnLeave:
							benefitDef.defaultEligibilityDisqualifyOnLeave ?? null,
					},
				}),
			`benefit type upsert ${benefitDef.name}`,
		);

		benefitTypeIds.push(benefitType.id);
		console.log(
			`  - Benefit Type: ${benefitDef.name} (${benefitDef.payrollDirection}/${benefitDef.category})`,
		);
	}

	return benefitTypeIds;
}

async function main() {
	const prisma = new PrismaClient();
	const organizationId = await resolveDefaultSeedOrganizationId();
	console.log("Starting BenefitType Seeding Script");
	console.log(`Organization ID: ${organizationId}`);

	try {
		await ensureDefaultBenefitTypes(prisma, organizationId);
		console.log("\nBenefitType seeding completed successfully!");
	} catch (error) {
		console.error("\nError during BenefitType seeding:", error);
		throw error;
	} finally {
		await prisma.$disconnect();
	}
}

if (require.main === module) {
	main().catch((e) => {
		console.error(e);
		process.exit(1);
	});
}
