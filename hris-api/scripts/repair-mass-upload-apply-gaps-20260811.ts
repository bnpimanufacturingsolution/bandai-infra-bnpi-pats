/**
 * Repair mass-upload apply gaps for PP-20260626-20260711 on local clone:
 * 1) Delete duplicate SCHEDULED installments (keep oldest)
 * 2) Re-import compensation mass upload (sums multi-row ABS) via service
 *
 * Usage (from hris-api):
 *   copy .env.local-clone values / use dev:local
 *   npx tsx scripts/repair-mass-upload-apply-gaps-20260811.ts
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { PrismaClient } from "../generated/prisma";
import { importCompensationMassUpload } from "../app/migration/bnpi-mass-upload-import.service";

const OUT = path.resolve(__dirname, "../../.runtime/mass-upload-apply-gap-20260811");
const COMP_PATH = path.resolve(
	__dirname,
	"../../confidential-files/june26-july10/Compensation Mass Upload 07.15.26.xlsx",
);

async function main() {
	fs.mkdirSync(OUT, { recursive: true });
	const prisma = new PrismaClient();

	const org = await prisma.organization.findFirst({
		where: { isDeleted: false },
		orderBy: { createdAt: "asc" },
		select: { id: true },
	});
	if (!org?.id) throw new Error("No organization");

	const dups = await prisma.$queryRawUnsafe<any[]>(`
    SELECT ebi."employeeBenefitId",
           array_agg(ebi.id ORDER BY ebi."createdAt" ASC) AS ids
    FROM employee_benefit_installments ebi
    WHERE ebi.status = 'SCHEDULED'
      AND ebi."scheduledDate" >= '2026-06-26'
      AND ebi."scheduledDate" <= '2026-07-10'
    GROUP BY ebi."employeeBenefitId"
    HAVING COUNT(*) > 1
  `);

	const deletedIds: string[] = [];
	for (const row of dups) {
		const ids: string[] = row.ids || [];
		const drop = ids.slice(1);
		for (const id of drop) {
			await prisma.employeeBenefitInstallment.delete({ where: { id } }).catch(async () => {
				await prisma.$executeRawUnsafe(
					`DELETE FROM employee_benefit_installments WHERE id = $1`,
					id,
				);
			});
			deletedIds.push(id);
		}
		console.log(
			JSON.stringify({
				employeeBenefitId: row.employeeBenefitId,
				kept: ids[0],
				deleted: drop,
			}),
		);
	}

	const buffer = fs.readFileSync(COMP_PATH);
	const summary = await importCompensationMassUpload({
		prisma: prisma as any,
		organizationId: org.id,
		buffer,
		sourceFilename: path.basename(COMP_PATH),
		persistLog: true,
	});

	const evidence = {
		at: new Date().toISOString(),
		orgId: org.id,
		duplicateInstallmentsDeleted: deletedIds,
		compensationImport: {
			total: summary.total,
			created: summary.created,
			updated: summary.updated,
			failed: summary.failed,
			importLogId: (summary as any).importLogId,
			periodCodes: (summary as any).periodCodes,
		},
	};
	fs.writeFileSync(path.join(OUT, "repair-apply.json"), JSON.stringify(evidence, null, 2));
	console.log(JSON.stringify(evidence, null, 2));
	await prisma.$disconnect();
}

main().catch(async (e) => {
	console.error(e);
	process.exit(1);
});
