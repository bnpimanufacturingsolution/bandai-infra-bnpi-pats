import "dotenv/config";
import { PeriodStatus, PrismaClient } from "../generated/prisma";
import { getDateKeyInBusinessTimeZone } from "../helper/attendance.helper";

const prisma = new PrismaClient();

function getArg(name: string) {
	const prefix = `--${name}=`;
	return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function hasFlag(name: string) {
	return process.argv.includes(`--${name}`);
}

function toDateOnlyUtc(value: Date | string) {
	const key =
		value instanceof Date
			? getDateKeyInBusinessTimeZone(value)
			: String(value || "").slice(0, 10);
	return new Date(`${key}T00:00:00.000Z`);
}

function normalizeEndDate(value: Date | string) {
	const date = toDateOnlyUtc(value);
	date.setUTCHours(23, 59, 59, 999);
	return date;
}

async function resolveOrganizationId() {
	const requested = getArg("organizationId") || process.env.ORGANIZATION_ID;
	if (requested) return requested;

	const organization = await prisma.organization.findFirst({
		where: { isDeleted: false },
		select: { id: true },
		orderBy: { createdAt: "asc" },
	});
	if (!organization) throw new Error("No organization found. Pass --organizationId=<id>.");
	return organization.id;
}

function recommendStatus(period: {
	status: PeriodStatus;
	startDate: Date;
	endDate: Date;
	employeePayrolls: Array<{ id: string; isPaid: boolean }>;
}) {
	if (period.status === "CLOSED" || period.status === "COMPLETED" || period.status === "PROCESSING") {
		return period.status;
	}

	const today = toDateOnlyUtc(getArg("date") || new Date());
	if (period.startDate > normalizeEndDate(today)) return "DRAFT" as PeriodStatus;
	if (period.endDate < today) return "OPEN" as PeriodStatus;
	return "OPEN" as PeriodStatus;
}

async function main() {
	const organizationId = await resolveOrganizationId();
	const dryRun = !hasFlag("apply");
	const periods = await prisma.payrollPeriod.findMany({
		where: {
			organizationId,
			isDeleted: false,
		},
		select: {
			id: true,
			code: true,
			name: true,
			status: true,
			startDate: true,
			endDate: true,
			payDate: true,
			payFrequency: true,
			employeePayrolls: {
				where: { isDeleted: false },
				select: { id: true, isPaid: true },
			},
			_count: {
				select: {
					timesheets: true,
					attendanceObligations: true,
				},
			},
		},
		orderBy: [{ startDate: "asc" }, { id: "asc" }],
	});

	const today = toDateOnlyUtc(getArg("date") || new Date());
	const rows = periods.map((period) => {
		const recommendedStatus = recommendStatus(period);
		const relation =
			period.startDate <= normalizeEndDate(today) && period.endDate >= today
				? "CURRENT"
				: period.endDate < today
					? "PAST"
					: "FUTURE";
		const reason =
			relation === "FUTURE"
				? "Future period should wait in DRAFT until the open-period event."
				: relation === "CURRENT"
					? "Current active cutoff should be OPEN so obligations and draft timesheets can be prepared."
					: period.employeePayrolls.length > 0
						? "Payroll-linked historical period keeps its existing processing/completed status."
						: "Past seeded period remains OPEN for historical review/payroll readiness unless payroll closes it.";
		return {
			id: period.id,
			code: period.code,
			name: period.name,
			relation,
			currentStatus: period.status,
			recommendedStatus,
			wouldUpdate: period.status !== recommendedStatus,
			startDate: period.startDate.toISOString().slice(0, 10),
			endDate: period.endDate.toISOString().slice(0, 10),
			payDate: period.payDate.toISOString().slice(0, 10),
			payFrequency: period.payFrequency,
			timesheets: period._count.timesheets,
			attendanceObligations: period._count.attendanceObligations,
			payrollRows: period.employeePayrolls.length,
			paidPayrollRows: period.employeePayrolls.filter((row) => row.isPaid).length,
			reason,
		};
	});

	const updates = rows.filter((row) => row.wouldUpdate);
	if (!dryRun) {
		for (const row of updates) {
			await prisma.payrollPeriod.update({
				where: { id: row.id },
				data: { status: row.recommendedStatus },
			});
		}
	}

	console.log(
		JSON.stringify(
			{
				dryRun,
				applyHint: dryRun ? "Rerun with --apply to update wouldUpdate=true periods." : null,
				organizationId,
				date: today.toISOString().slice(0, 10),
				rule: {
					current: "OPEN",
					future: "DRAFT",
					past: "keep PROCESSING/COMPLETED/CLOSED, otherwise OPEN for historical payroll readiness",
				},
				summary: {
					total: rows.length,
					wouldUpdate: updates.length,
					updated: dryRun ? 0 : updates.length,
				},
				rows,
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
