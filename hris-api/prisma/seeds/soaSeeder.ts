import {
	Prisma,
	PrismaClient,
	RemittanceStatus,
	SOAStatus,
} from "../../generated/prisma";
import { resolveDefaultSeedOrganizationId } from "./seedOrganizationResolver";
import { assertSeedDryRunNotRequested } from "./seedDryRunGuard";

const prisma = new PrismaClient();

interface SOASeedDefinition {
	soaNumber: string;
	name: string;
	remitteeName: string;
	status: SOAStatus;
	remittedRatio: number;
}

const SOA_SEED_DEFINITIONS: SOASeedDefinition[] = [
	{
		soaNumber: "SOA-2026-0001",
		name: "January 2026 - SSS Billing",
		remitteeName: "SSS",
		status: SOAStatus.DRAFT,
		remittedRatio: 0,
	},
	{
		soaNumber: "SOA-2026-0002",
		name: "January 2026 - PhilHealth Billing",
		remitteeName: "PhilHealth",
		status: SOAStatus.PENDING_REVIEW,
		remittedRatio: 0,
	},
	{
		soaNumber: "SOA-2026-0003",
		name: "February 2026 - Pag-IBIG Billing",
		remitteeName: "Pag-IBIG",
		status: SOAStatus.APPROVED,
		remittedRatio: 0,
	},
	{
		soaNumber: "SOA-2026-0004",
		name: "February 2026 - SSS Billing",
		remitteeName: "SSS",
		status: SOAStatus.PARTIALLY_REMITTED,
		remittedRatio: 0.45,
	},
	{
		soaNumber: "SOA-2026-0005",
		name: "March 2026 - PhilHealth Billing",
		remitteeName: "PhilHealth",
		status: SOAStatus.REMITTED,
		remittedRatio: 1,
	},
	{
		soaNumber: "SOA-2026-0006",
		name: "March 2026 - Pag-IBIG Billing",
		remitteeName: "Pag-IBIG",
		status: SOAStatus.CLOSED,
		remittedRatio: 1,
	},
	{
		soaNumber: "SOA-2026-0007",
		name: "April 2026 - SSS Billing",
		remitteeName: "SSS",
		status: SOAStatus.DISPUTED,
		remittedRatio: 0,
	},
];

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const buildFallbackLineItems = (statementOfAccountId: string, index: number) => {
	const baseTaxable = 48000 + index * 1100;
	return [
		{
			statementOfAccountId,
			category: "TAX",
			description: "Withholding tax component",
			taxableAmount: round2(baseTaxable),
			taxAmount: round2(baseTaxable * 0.08),
			employeeShare: round2(baseTaxable * 0.18),
			employerShare: round2(baseTaxable * 0.22),
			totalAmount: round2(baseTaxable * 0.4),
			metadata: { source: "soaSeeder", type: "fallback" },
		},
		{
			statementOfAccountId,
			category: "SSS",
			description: "Government contribution component",
			taxableAmount: round2(baseTaxable * 0.95),
			taxAmount: round2(baseTaxable * 0.05),
			employeeShare: round2(baseTaxable * 0.16),
			employerShare: round2(baseTaxable * 0.2),
			totalAmount: round2(baseTaxable * 0.36),
			metadata: { source: "soaSeeder", type: "fallback" },
		},
		{
			statementOfAccountId,
			category: "PHILHEALTH",
			description: "Health contribution component",
			taxableAmount: round2(baseTaxable * 0.9),
			taxAmount: round2(baseTaxable * 0.04),
			employeeShare: round2(baseTaxable * 0.15),
			employerShare: round2(baseTaxable * 0.17),
			totalAmount: round2(baseTaxable * 0.32),
			metadata: { source: "soaSeeder", type: "fallback" },
		},
	];
};

export async function seedSOAData(prismaClient?: PrismaClient) {
	const db = prismaClient || prisma;
	const organizationId = await resolveDefaultSeedOrganizationId();

	console.log("\n=== Seeding Statement of Account Data ===");

	const payrollPeriods = await db.payrollPeriod.findMany({
		where: {
			organizationId,
			isDeleted: false,
		},
		select: {
			id: true,
			startDate: true,
			endDate: true,
			payDate: true,
		},
		orderBy: { startDate: "desc" },
		take: 12,
	});

	if (payrollPeriods.length === 0) {
		throw new Error(
			"No payroll periods found for seed org. Run base employee/payroll seed first before seed:soa.",
		);
	}

	const employeePayrolls = await db.employeePayroll.findMany({
		where: {
			organizationId,
			isDeleted: false,
		},
		select: {
			id: true,
			employeeId: true,
			payrollPeriodId: true,
			taxableIncome: true,
			taxAmount: true,
			sssContribution: true,
			philHealthContribution: true,
			pagibigContribution: true,
		},
		orderBy: { createdAt: "desc" },
		take: 60,
	});

	let seededCount = 0;
	let seededLineItems = 0;
	let seededRemittances = 0;

	for (let i = 0; i < SOA_SEED_DEFINITIONS.length; i += 1) {
		const seedDef = SOA_SEED_DEFINITIONS[i];
		const period = payrollPeriods[i % payrollPeriods.length];
		const dueDate = new Date(period.payDate);
		dueDate.setUTCDate(dueDate.getUTCDate() + 10);

		const soa = await db.statementOfAccount.upsert({
			where: {
				organizationId_soaNumber: {
					organizationId,
					soaNumber: seedDef.soaNumber,
				},
			},
			update: {
				name: seedDef.name,
				startDate: period.startDate,
				endDate: period.endDate,
				dueDate,
				payrollPeriodIds: [period.id],
				remitteeName: seedDef.remitteeName,
				remitteeAccount: `${seedDef.remitteeName.toUpperCase()}-PAYABLE`,
				remitteeDetails: { source: "soaSeeder", channel: "BANK_TRANSFER" },
				status: seedDef.status,
				eppReconciled:
					seedDef.status === SOAStatus.RECONCILED || seedDef.status === SOAStatus.CLOSED,
				eppReconciledAt:
					seedDef.status === SOAStatus.RECONCILED || seedDef.status === SOAStatus.CLOSED
						? new Date()
						: null,
				description: `Seeded SOA for ${seedDef.soaNumber}`,
				notes:
					seedDef.status === SOAStatus.DISPUTED
						? "Seeded disputed item for reconciliation testing."
						: null,
				metadata: { source: "soaSeeder" },
				isDeleted: false,
			},
			create: {
				organizationId,
				soaNumber: seedDef.soaNumber,
				name: seedDef.name,
				startDate: period.startDate,
				endDate: period.endDate,
				dueDate,
				payrollPeriodIds: [period.id],
				remitteeName: seedDef.remitteeName,
				remitteeAccount: `${seedDef.remitteeName.toUpperCase()}-PAYABLE`,
				remitteeDetails: { source: "soaSeeder", channel: "BANK_TRANSFER" },
				status: seedDef.status,
				eppReconciled:
					seedDef.status === SOAStatus.RECONCILED || seedDef.status === SOAStatus.CLOSED,
				eppReconciledAt:
					seedDef.status === SOAStatus.RECONCILED || seedDef.status === SOAStatus.CLOSED
						? new Date()
						: null,
				description: `Seeded SOA for ${seedDef.soaNumber}`,
				notes:
					seedDef.status === SOAStatus.DISPUTED
						? "Seeded disputed item for reconciliation testing."
						: null,
				metadata: { source: "soaSeeder" },
			},
		});

		await db.sOALineItem.deleteMany({ where: { statementOfAccountId: soa.id } });
		await db.sOARemittance.deleteMany({ where: { statementOfAccountId: soa.id } });

		const periodPayrolls = employeePayrolls.filter((item) => item.payrollPeriodId === period.id);
		const sourcePayrolls = periodPayrolls.slice(0, 4);

		const lineItemPayload: Prisma.SOALineItemUncheckedCreateInput[] = sourcePayrolls.length
			? sourcePayrolls.map((item, index) => {
					const taxableAmount = round2(Number(item.taxableIncome || 0));
					const taxAmount = round2(Number(item.taxAmount || taxableAmount * 0.08));
					const govContrib = round2(
						Number(item.sssContribution || 0) +
							Number(item.philHealthContribution || 0) +
							Number(item.pagibigContribution || 0),
					);
					const employeeShare = round2(Math.max(govContrib + taxAmount, taxableAmount * 0.16));
					const employerShare = round2(Math.max(taxableAmount * 0.2, employeeShare * 1.12));

					return {
						statementOfAccountId: soa.id,
						category: ["TAX", "SSS", "PHILHEALTH", "PAGIBIG"][index % 4],
						description: "Seeded from employee payroll snapshot",
						employeeId: item.employeeId,
						employeePayrollId: item.id,
						employeeLoanId: null,
						employeeBenefitId: null,
						taxableAmount,
						taxAmount,
						employeeShare,
						employerShare,
						totalAmount: round2(employeeShare + employerShare),
						metadata: { source: "soaSeeder", from: "employeePayroll" },
					};
			  })
			: buildFallbackLineItems(soa.id, i).map((item) => ({
					...item,
					employeeId: null,
					employeePayrollId: null,
					employeeLoanId: null,
					employeeBenefitId: null,
			  }));

		for (const item of lineItemPayload) {
			await db.sOALineItem.create({ data: item });
		}
		seededLineItems += lineItemPayload.length;

		const totals = lineItemPayload.reduce(
			(acc, item) => {
				acc.totalEmployeeShare += Number(item.employeeShare || 0);
				acc.totalEmployerShare += Number(item.employerShare || 0);
				acc.totalTax += Number(item.taxAmount || 0);
				acc.totalAmount += Number(item.totalAmount || 0);
				return acc;
			},
			{
				totalEmployeeShare: 0,
				totalEmployerShare: 0,
				totalTax: 0,
				totalAmount: 0,
			},
		);

		const totalAmount = round2(totals.totalAmount);
		const totalRemitted = round2(totalAmount * seedDef.remittedRatio);
		const totalOutstanding = round2(totalAmount - totalRemitted);

		if (totalRemitted > 0) {
			const remittances =
				seedDef.remittedRatio < 1
					? [
							{
								amount: totalRemitted,
								paymentMethod: "BANK_TRANSFER",
								referenceNumber: `SEED-PARTIAL-${seedDef.soaNumber}`,
								paymentDate: new Date(),
								category: "PARTIAL_PAYMENT",
								status: RemittanceStatus.CONFIRMED,
								notes: "Seeded partial remittance",
								metadata: { source: "soaSeeder" },
							},
					  ]
					: [
							{
								amount: round2(totalRemitted * 0.5),
								paymentMethod: "BANK_TRANSFER",
								referenceNumber: `SEED-A-${seedDef.soaNumber}`,
								paymentDate: new Date(),
								category: "FULL_PAYMENT",
								status: RemittanceStatus.REMITTED,
								notes: "Seeded remittance tranche A",
								metadata: { source: "soaSeeder" },
							},
							{
								amount: round2(totalRemitted - round2(totalRemitted * 0.5)),
								paymentMethod: "BANK_TRANSFER",
								referenceNumber: `SEED-B-${seedDef.soaNumber}`,
								paymentDate: new Date(),
								category: "FULL_PAYMENT",
								status: RemittanceStatus.CONFIRMED,
								notes: "Seeded remittance tranche B",
								metadata: { source: "soaSeeder" },
							},
					  ];

			for (const remittance of remittances) {
				await db.sOARemittance.create({
					data: {
						statementOfAccountId: soa.id,
						...remittance,
					},
				});
			}
			seededRemittances += remittances.length;
		}

		await db.statementOfAccount.update({
			where: { id: soa.id },
			data: {
				totalEmployeeShare: round2(totals.totalEmployeeShare),
				totalEmployerShare: round2(totals.totalEmployerShare),
				totalTax: round2(totals.totalTax),
				totalAmount,
				totalRemitted,
				totalOutstanding,
			},
		});

		seededCount += 1;
		console.log(`  - Seeded ${seedDef.soaNumber} (${lineItemPayload.length} line items)`);
	}

	console.log("\n=== SOA Seeder Summary ===");
	console.log(`  SOA records: ${seededCount}`);
	console.log(`  SOA line items: ${seededLineItems}`);
	console.log(`  SOA remittances: ${seededRemittances}`);
}

async function main() {
	assertSeedDryRunNotRequested("seed:soa");
	try {
		await seedSOAData(prisma);
		console.log("\nSOA seeding completed successfully!");
	} catch (error) {
		console.error("\nSOA seeding failed:", error);
		process.exitCode = 1;
	} finally {
		await prisma.$disconnect();
	}
}

if (require.main === module) {
	main();
}
