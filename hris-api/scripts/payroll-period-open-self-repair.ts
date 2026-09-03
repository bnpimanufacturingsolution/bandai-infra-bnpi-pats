import "dotenv/config";
import { PrismaClient } from "../generated/prisma";
import { getDateKeyInBusinessTimeZone } from "../helper/attendance.helper";
import { selfRepairPayrollPeriodOpenCoverage } from "../helper/payroll-period-open.helper";

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

async function resolveTargetPeriods(organizationId: string) {
	const periodId = getArg("periodId");
	if (periodId) {
		const period = await prisma.payrollPeriod.findFirst({
			where: { id: periodId, organizationId, isDeleted: false },
			select: { id: true },
		});
		if (!period) throw new Error(`Payroll period not found: ${periodId}`);
		return [period];
	}

	if (hasFlag("all-open")) {
		return prisma.payrollPeriod.findMany({
			where: {
				organizationId,
				isDeleted: false,
				status: { in: ["OPEN", "PROCESSING"] },
			},
			select: { id: true },
			orderBy: [{ startDate: "asc" }, { id: "asc" }],
		});
	}

	if (hasFlag("all-draft")) {
		return prisma.payrollPeriod.findMany({
			where: {
				organizationId,
				isDeleted: false,
				status: "DRAFT",
			},
			select: { id: true },
			orderBy: [{ startDate: "asc" }, { id: "asc" }],
		});
	}

	const targetDate = toDateOnlyUtc(getArg("date") || new Date());
	const period = await prisma.payrollPeriod.findFirst({
		where: {
			organizationId,
			isDeleted: false,
			startDate: { lte: normalizeEndDate(targetDate) },
			endDate: { gte: targetDate },
		},
		select: { id: true },
		orderBy: [{ startDate: "desc" }, { id: "asc" }],
	});
	if (!period) {
		throw new Error(
			`No payroll period covers ${targetDate.toISOString().slice(0, 10)}. Pass --periodId=<id>.`,
		);
	}
	return [period];
}

async function getDatabaseSnapshot(organizationId: string) {
	const [
		organization,
		payrollPeriodStatus,
		eligibleActiveEmployees,
		attendanceObligations,
		timesheetStatus,
	] = await Promise.all([
		prisma.organization.findFirst({
			where: { id: organizationId },
			select: { id: true, name: true },
		}),
		prisma.payrollPeriod.groupBy({
			by: ["status"],
			where: { organizationId, isDeleted: false },
			_count: { _all: true },
		}),
		prisma.employee.count({
			where: {
				organizationId,
				isDeleted: false,
				employmentStatus: "ACTIVE",
			},
		}),
		prisma.attendanceObligation.count({
			where: {
				organizationId,
				isDeleted: false,
			},
		}),
		prisma.timesheet.groupBy({
			by: ["status"],
			where: { organizationId, isDeleted: false },
			_count: { _all: true },
		}),
	]);

	return {
		organization,
		payrollPeriodStatus,
		eligibleActiveEmployees,
		attendanceObligations,
		timesheetStatus,
	};
}

async function main() {
	const organizationId = await resolveOrganizationId();
	const dryRun = !hasFlag("apply");
	const targetPeriods = await resolveTargetPeriods(organizationId);
	const before = await getDatabaseSnapshot(organizationId);

	const periodResults = [];
	for (const period of targetPeriods) {
		periodResults.push(
			await selfRepairPayrollPeriodOpenCoverage(prisma, {
				organizationId,
				payrollPeriodId: period.id,
				dryRun,
				ensureAttendanceObligations: !hasFlag("drafts-only"),
			}),
		);
	}

	const after = dryRun ? null : await getDatabaseSnapshot(organizationId);
	const result = {
		dryRun,
		applyHint: dryRun ? "Rerun with --apply to write the reported repairs." : null,
		scope: {
			organizationId,
			periodIds: targetPeriods.map((period) => period.id),
			draftsOnly: hasFlag("drafts-only"),
			selection: getArg("periodId")
				? "periodId"
				: hasFlag("all-open")
					? "all-open"
					: hasFlag("all-draft")
						? "all-draft"
						: "current-date",
		},
		sourceOfTruth: {
			openEvent:
				"PayrollPeriod DRAFT -> OPEN ensures AttendanceObligation rows and DRAFT Timesheet headers.",
			attendance: "AttendanceObligation remains live operational attendance truth.",
			timesheetLines: "Timesheetline rows are submitted/review/payroll snapshots only.",
		},
		before,
		periodResults,
		after,
	};

	console.log(JSON.stringify(result, null, 2));
}

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
