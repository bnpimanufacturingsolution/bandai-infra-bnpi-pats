import { PrismaClient } from "../../generated/prisma";
import {
	WITHHOLDING_TAX_TABLE,
	SSS_CONFIG,
	PHILHEALTH_CONFIG,
	PAGIBIG_CONFIG,
} from "../../helper/tax-calculator.helper";
import { resolveDefaultSeedOrganizationId } from "./seedOrganizationResolver";
import { assertSeedDryRunNotRequested } from "./seedDryRunGuard";

const prisma = new PrismaClient();

/**
 * Calculator Seeder
 *
 * Creates or retrieves the default Calculator record for an organization.
 *
 * FLOW:
 * 1. This seeder uses constants from tax-calculator.helper.ts (WITHHOLDING_TAX_TABLE, SSS_CONFIG, etc.)
 * 2. Creates a Calculator record in the database with these values
 * 3. PayrollPeriod is linked to this Calculator
 * 4. When generating payroll (payroll-period.helper.ts), the system:
 *    - Fetches the Calculator from the PayrollPeriod
 *    - Uses the Calculator's taxRates, sssRates, philHealthRates, pagibigRates, rateMultipliers
 *    - Passes these to the calculation functions in tax-calculator.helper.ts
 *
 * This ensures all tax and contribution rates come from the backend Calculator model,
 * not from hardcoded values in the helpers.
 */
export async function ensureDefaultCalculator(
	prisma: any,
	organizationId: string,
): Promise<string> {
	console.log("\n=== Creating Default Calculator ===");

	const calculatorName = "Default Philippine Calculator";
	const currentYear = new Date().getFullYear();
	const calculatorCode = `CALC-DEFAULT-${currentYear}`;

	// Upsert calculator - update if exists, create if not
	const calculator = await prisma.calculator.upsert({
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

			// Tax rates from WITHHOLDING_TAX_TABLE
			taxRates: WITHHOLDING_TAX_TABLE,

			// SSS rates from SSS_CONFIG
			sssRates: {
				employeeRate: SSS_CONFIG.employeeRate,
				employerRate: SSS_CONFIG.employerRate,
				totalRate: SSS_CONFIG.totalRate,
				minimumBase: SSS_CONFIG.minimumBase,
				maximumCeiling: SSS_CONFIG.maximumCeiling,
			},

			// PhilHealth rates from PHILHEALTH_CONFIG
			philHealthRates: {
				employeeRate: PHILHEALTH_CONFIG.employeeRate,
				employerRate: PHILHEALTH_CONFIG.employerRate,
				totalRate: PHILHEALTH_CONFIG.totalRate,
				minimumBase: PHILHEALTH_CONFIG.minimumBase,
				maximumCeiling: PHILHEALTH_CONFIG.maximumCeiling,
			},

			// PAG-IBIG rates from PAGIBIG_CONFIG
			pagibigRates: {
				rateBelowThreshold: PAGIBIG_CONFIG.rateBelowThreshold,
				rateAboveThreshold: PAGIBIG_CONFIG.rateAboveThreshold,
				threshold: PAGIBIG_CONFIG.threshold,
				maximumCeiling: PAGIBIG_CONFIG.maximumCeiling,
			},

			// Overtime rates based on DOLE standards
			rateMultipliers: {
				ordinaryDay: {
					work: 1.0, // 100%
					ot: 1.25, // 125%
					nd: 1.1, // 110%
					ndot: 1.375, // 137.5%
				},
				restDayOrSpecialHoliday: {
					work: 1.3, // 130%
					ot: 1.69, // 169%
					nd: 1.43, // 143%
					ndot: 1.859, // 185.9%
				},
				specialHolidayOnRestDay: {
					work: 1.5, // 150%
					ot: 1.95, // 195%
					nd: 1.65, // 165%
					ndot: 2.145, // 214.5%
				},
				regularHoliday: {
					work: 2.0, // 200%
					ot: 2.6, // 260%
					nd: 2.2, // 220%
					ndot: 2.86, // 286%
				},
				regularHolidayOnRestDay: {
					work: 2.6, // 260%
					ot: 3.38, // 338%
					nd: 2.86, // 286%
					ndot: 3.718, // 371.8%
				},
				doubleHoliday: {
					work: 3.0, // 300%
					ot: 3.9, // 390%
					nd: 3.3, // 330%
					ndot: 4.29, // 429%
				},
				doubleHolidayOnRestDay: {
					work: 3.9, // 390%
					ot: 5.07, // 507%
					nd: 4.29, // 429%
					ndot: 5.577, // 557.7%
				},
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

			// Tax rates from WITHHOLDING_TAX_TABLE
			taxRates: WITHHOLDING_TAX_TABLE,

			// SSS rates from SSS_CONFIG
			sssRates: {
				employeeRate: SSS_CONFIG.employeeRate,
				employerRate: SSS_CONFIG.employerRate,
				totalRate: SSS_CONFIG.totalRate,
				minimumBase: SSS_CONFIG.minimumBase,
				maximumCeiling: SSS_CONFIG.maximumCeiling,
			},

			// PhilHealth rates from PHILHEALTH_CONFIG
			philHealthRates: {
				employeeRate: PHILHEALTH_CONFIG.employeeRate,
				employerRate: PHILHEALTH_CONFIG.employerRate,
				totalRate: PHILHEALTH_CONFIG.totalRate,
				minimumBase: PHILHEALTH_CONFIG.minimumBase,
				maximumCeiling: PHILHEALTH_CONFIG.maximumCeiling,
			},

			// PAG-IBIG rates from PAGIBIG_CONFIG
			pagibigRates: {
				rateBelowThreshold: PAGIBIG_CONFIG.rateBelowThreshold,
				rateAboveThreshold: PAGIBIG_CONFIG.rateAboveThreshold,
				threshold: PAGIBIG_CONFIG.threshold,
				maximumCeiling: PAGIBIG_CONFIG.maximumCeiling,
			},

			// Rate Multipliers based on DOLE standards
			rateMultipliers: {
				ordinaryDay: {
					work: 1.0, // 100%
					ot: 1.25, // 125%
					nd: 1.1, // 110%
					ndot: 1.375, // 137.5%
				},
				restDayOrSpecialHoliday: {
					work: 1.3, // 130%
					ot: 1.69, // 169%
					nd: 1.43, // 143%
					ndot: 1.859, // 185.9%
				},
				specialHolidayOnRestDay: {
					work: 1.5, // 150%
					ot: 1.95, // 195%
					nd: 1.65, // 165%
					ndot: 2.145, // 214.5%
				},
				regularHoliday: {
					work: 2.0, // 200%
					ot: 2.6, // 260%
					nd: 2.2, // 220%
					ndot: 2.86, // 286%
				},
				regularHolidayOnRestDay: {
					work: 2.6, // 260%
					ot: 3.38, // 338%
					nd: 2.86, // 286%
					ndot: 3.718, // 371.8%
				},
				doubleHoliday: {
					work: 3.0, // 300%
					ot: 3.9, // 390%
					nd: 3.3, // 330%
					ndot: 4.29, // 429%
				},
				doubleHolidayOnRestDay: {
					work: 3.9, // 390%
					ot: 5.07, // 507%
					nd: 4.29, // 429%
					ndot: 5.577, // 557.7%
				},
			},

			isActive: true,
			isDefault: true,
		},
	});

	console.log(`   Calculator: ${calculatorName} (upserted)`);
	return calculator.id;
}

async function main() {
	assertSeedDryRunNotRequested("seed:calculator");
	const organizationId = await resolveDefaultSeedOrganizationId();
	console.log(" Starting Calculator Seeding Script");
	console.log(`Organization ID: ${organizationId}`);

	try {
		await ensureDefaultCalculator(prisma, organizationId);
		console.log("\n Calculator seeding completed successfully!");
	} catch (error) {
		console.error("\n Error during seeding:", error);
		throw error;
	}
}

if (require.main === module) {
	main()
		.catch((e) => {
			console.error(e);
			process.exit(1);
		})
		.finally(async () => {
			await prisma.$disconnect();
		});
}
