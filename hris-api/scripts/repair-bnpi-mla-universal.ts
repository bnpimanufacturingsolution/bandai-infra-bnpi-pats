/**
 * BNPI universal Meal Allowance enrollment — operator directive 2026-08-26:
 * MLA applies to EVERY Bandai employee FOREVER (every cutoff), not per-period.
 *
 * Backfills an open-horizon RECURRING/EVERY_CUTOFF MLA EmployeeBenefit row
 * (₱500 default) for every ACTIVE Bandai employee who lacks one, so HR
 * surfaces/exports agree with the payroll engine's universal guarantee.
 * The engine ALSO self-guarantees MLA at run/preview time even without a row.
 *
 * Dry-run by default:
 *   npx tsx scripts/repair-bnpi-mla-universal.ts
 *   npx tsx scripts/repair-bnpi-mla-universal.ts --execute
 */
import * as path from "path";

process.env.PG_DATABASE_URL =
	process.env.PG_DATABASE_URL ||
	process.env.DATABASE_URL ||
	"postgresql://postgres:postgres@127.0.0.1:5433/hris?schema=public";
process.env.DATABASE_URL = process.env.PG_DATABASE_URL;
process.env.WRITE_DATABASE_URL = process.env.WRITE_DATABASE_URL || process.env.PG_DATABASE_URL;

const DEFAULT_ORG_ID = process.env.ORG_ID || "cmryhwpv70000vgaktlmrubmx";
const EXECUTE = process.argv.includes("--execute");
const AMOUNT_DEFAULT = Number(process.env.MLA_AMOUNT || 500);

async function main() {
	const { PrismaClient } = await import("../generated/prisma/index.js").catch(() =>
		import("../generated/prisma-postgres/index.js"),
	);
	const { ensureBenefitType } = await import("../app/migration/bnpi-mass-upload-import.service");
	const prisma = new PrismaClient();
	try {
		let org = await prisma.organization.findUnique({ where: { id: DEFAULT_ORG_ID } });
		if (!org) {
			org = await prisma.organization.findFirst({
				where: { isDeleted: false },
				orderBy: { createdAt: "asc" },
			});
		}
		if (!org) throw new Error("No organization found in database.");
		const ORG_ID = org.id;

		const benefitType = await ensureBenefitType(prisma as any, ORG_ID, "MLA", {
			name: "Meal Allowance",
			direction: "COMPENSATION",
		});

		const employees = await prisma.employee.findMany({
			where: {
				organizationId: ORG_ID,
				isDeleted: false,
				employmentStatus: "ACTIVE",
				workforceSource: "DIRECT",
			},
			select: {
				id: true,
				employeeId: true,
				employmentStartDate: true,
				createdAt: true,
			},
		});
		console.log(`Active BANDAI (DIRECT) employees in scope: ${employees.length}`);

		const existing = await prisma.employeeBenefit.findMany({
			where: {
				organizationId: ORG_ID,
				benefitTypeId: benefitType.id,
				isDeleted: false,
				isActive: true,
				status: { in: ["ACTIVE", "APPROVED"] },
				endDate: null,
			},
			select: { employeeId: true },
		});
		const covered = new Set(existing.map((r) => r.employeeId));
		console.log(`Already holding open-horizon MLA rows: ${covered.size}`);

		const missing = employees.filter((e) => !covered.has(e.id));
		console.log(`Missing universal MLA enrollment: ${missing.length}${EXECUTE ? " → creating..." : " (dry-run; use --execute)"}`);
		for (const e of missing.slice(0, 10)) {
			console.log(`  would enroll ${e.employeeId}`);
		}

		if (!EXECUTE) {
			console.log(`\nDRY-RUN COMPLETE. ${missing.length} enrollments pending.`);
			return;
		}

		let created = 0;
		for (const e of missing) {
			const start = e.employmentStartDate || new Date(Date.UTC(2000, 0, 1));
			await prisma.employeeBenefit.create({
				data: {
					organizationId: ORG_ID,
					employeeId: e.id,
					benefitTypeId: benefitType.id,
					payrollPeriodId: null,
					amount: AMOUNT_DEFAULT,
					totalAmount: AMOUNT_DEFAULT,
					installmentAmount: AMOUNT_DEFAULT,
					remainingBalance: AMOUNT_DEFAULT,
					currency: "PHP",
					startDate: start,
					endDate: null,
					startPayrollCutOff: start,
					endPayrollCutOff: null,
					scheduleMode: "RECURRING",
					recurrenceFrequency: "EVERY_CUTOFF",
					totalInstallments: 0,
					attendanceBased: false,
					isActive: true,
					status: "ACTIVE",
					name: "Meal Allowance",
					notes: `BNPI Universal MLA policy (operator 2026-08-26): all Bandai employees, every cutoff, forever.`,
					agreedToTerms: true,
				} as any,
				select: { id: true },
			});
			created += 1;
		}
		console.log(`\nEXECUTE COMPLETE: created=${created} universal open-horizon MLA enrollments.`);
	} finally {
		await prisma.$disconnect();
	}
}
main().catch((e) => {
	console.error("ERROR:", e?.message || e);
	process.exit(1);
});
