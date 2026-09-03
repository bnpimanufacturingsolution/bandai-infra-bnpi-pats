import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "../generated/prisma";

const prisma = new PrismaClient();
const repoRoot = path.resolve(__dirname, "..", "..");
const apply = process.argv.includes("--apply");
const periodCode =
	process.argv.find((arg) => arg.startsWith("--periodCode="))?.split("=")[1] ||
	"PP-20260426-20260511";
const comparisonPath = path.resolve(
	process.argv.find((arg) => arg.startsWith("--comparison="))?.split("=")[1] ||
		path.join(repoRoot, "test-results", "payroll-bandai-analysis", "payroll-comparison-results.json"),
);

const numberValue = (value: unknown) => {
	const parsed = Number(value ?? 0);
	return Number.isFinite(parsed) ? parsed : 0;
};

async function main() {
	const comparison = JSON.parse(fs.readFileSync(comparisonPath, "utf8"));
	const sourceByEmployeeCode = new Map<string, number>();
	for (const row of comparison.rows || []) {
		const nightDiff = row.fields?.find((field: any) => field.field === "nightDiffPay");
		const amount = numberValue(nightDiff?.workbookValue);
		if (amount > 0) sourceByEmployeeCode.set(row.employeeCode, amount);
	}

	const period = await prisma.payrollPeriod.findFirst({
		where: { code: periodCode, isDeleted: false },
		select: { id: true, organizationId: true, code: true, status: true },
	});
	if (!period) throw new Error(`Payroll period ${periodCode} was not found.`);

	const timesheets = await prisma.timesheet.findMany({
		where: {
			organizationId: period.organizationId,
			payrollPeriodId: period.id,
			isDeleted: false,
			status: "APPROVED",
			employee: { employeeId: { in: Array.from(sourceByEmployeeCode.keys()) } },
		},
		select: {
			id: true,
			employee: { select: { employeeId: true } },
			timesheetlines: {
				where: { isDeleted: false, isEffective: true },
				orderBy: { date: "asc" },
				select: { id: true, metadata: true },
			},
		},
	});

	const planned: Array<{ employeeCode: string; amount: number; lineId: string }> = [];
	for (const timesheet of timesheets) {
		const amount = sourceByEmployeeCode.get(timesheet.employee.employeeId) || 0;
		if (!(amount > 0)) continue;
		const targetLine =
			timesheet.timesheetlines.find((line: any) => {
				const approvedBuckets = line.metadata?.bandaiPayrollSourceRepair?.approvedBuckets;
				return Number(approvedBuckets?.regNdHrs || 0) > 0;
			}) || timesheet.timesheetlines[0];
		if (!targetLine) continue;
		const currentAmount = numberValue(
			(targetLine.metadata as any)?.bandaiPayrollSourceRepair?.approvedBuckets?.nightDiffPayAmount,
		);
		if (Math.abs(currentAmount - amount) <= 0.01) continue;
		planned.push({ employeeCode: timesheet.employee.employeeId, amount, lineId: targetLine.id });
		if (!apply) continue;
		const metadata = ((targetLine.metadata || {}) as Record<string, any>);
		const repair = {
			...(metadata.bandaiPayrollSourceRepair || {}),
			nightDiffPaySource: {
				source: "HRIS Payroll Computation April 26 - May 10, 2026.xlsx",
				appliedAt: new Date().toISOString(),
				amount,
			},
			approvedBuckets: {
				...((metadata.bandaiPayrollSourceRepair || {}).approvedBuckets || {}),
				nightDiffPayAmount: amount,
			},
		};
		await prisma.timesheetline.update({
			where: { id: targetLine.id },
			data: {
				metadata: {
					...metadata,
					bandaiPayrollSourceRepair: repair,
				},
			},
		});
	}

	console.log(
		JSON.stringify(
			{
				mode: apply ? "apply" : "dry-run",
				period,
				comparisonPath,
				sourceRows: sourceByEmployeeCode.size,
				timesheetsChecked: timesheets.length,
				plannedUpdates: planned.length,
				sample: planned.slice(0, 20),
			},
			null,
			2,
		),
	);
}

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
