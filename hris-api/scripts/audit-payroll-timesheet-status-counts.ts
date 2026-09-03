import "dotenv/config";
import { Prisma, PrismaClient } from "../generated/prisma";

const prisma = new PrismaClient();
const TIMESHEET_STATUSES = ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "REVISED"] as const;

function getArg(name: string) {
	const prefix = `--${name}=`;
	return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

async function resolveOrganizationId() {
	const requested = getArg("organizationId") || process.env.ORGANIZATION_ID;
	if (requested) return requested;

	const organization = await prisma.organization.findFirst({
		where: { isDeleted: false },
		select: { id: true, name: true },
		orderBy: { createdAt: "asc" },
	});
	if (!organization) throw new Error("No organization found. Pass --organizationId=<id>.");
	return organization.id;
}

async function main() {
	const organizationId = await resolveOrganizationId();
	const periodCode = getArg("periodCode") || "PP-20260526-20260611";

	const payrollPeriod = await prisma.payrollPeriod.findFirst({
		where: {
			organizationId,
			code: periodCode,
			isDeleted: false,
		},
		select: {
			id: true,
			code: true,
			name: true,
			payFrequency: true,
			startDate: true,
			endDate: true,
		},
	});

	if (!payrollPeriod) {
		throw new Error(`Payroll period not found for code ${periodCode}`);
	}

	const payrollEmployeeWhere: Prisma.EmployeeWhereInput = {
		organizationId,
		isDeleted: false,
		workforceSource: "DIRECT",
		...(payrollPeriod.payFrequency ? { payFrequency: payrollPeriod.payFrequency } : {}),
	};

	const statusCounts = Object.fromEntries(
		await Promise.all(
			TIMESHEET_STATUSES.map(async (status) => [
				status,
				await prisma.timesheet.count({
					where: {
						organizationId,
						payrollPeriodId: payrollPeriod.id,
						status,
						isDeleted: false,
					},
				}),
			]),
		),
	) as Record<(typeof TIMESHEET_STATUSES)[number], number>;

	const [
		payrollScopeEmployees,
		totalTimesheets,
		missingTimesheetHeaders,
		notSubmittedEmployees,
		pendingApprovalEmployees,
		correctionNeededEmployees,
		readyForPayrollEmployees,
		missingInfoEmployees,
		missingInfoAndNotSubmittedEmployees,
	] = await Promise.all([
		prisma.employee.count({ where: payrollEmployeeWhere }),
		prisma.timesheet.count({
			where: {
				organizationId,
				payrollPeriodId: payrollPeriod.id,
				isDeleted: false,
			},
		}),
		prisma.employee.count({
			where: {
				...payrollEmployeeWhere,
				timesheets: {
					none: {
						payrollPeriodId: payrollPeriod.id,
						isDeleted: false,
					},
				},
			},
		}),
		prisma.employee.count({
			where: {
				...payrollEmployeeWhere,
				OR: [
					{
						timesheets: {
							none: {
								payrollPeriodId: payrollPeriod.id,
								isDeleted: false,
							},
						},
					},
					{
						timesheets: {
							some: {
								payrollPeriodId: payrollPeriod.id,
								isDeleted: false,
								status: "DRAFT",
							},
						},
					},
				],
			},
		}),
		prisma.employee.count({
			where: {
				...payrollEmployeeWhere,
				timesheets: {
					some: {
						payrollPeriodId: payrollPeriod.id,
						isDeleted: false,
						status: "SUBMITTED",
					},
				},
			},
		}),
		prisma.employee.count({
			where: {
				...payrollEmployeeWhere,
				timesheets: {
					some: {
						payrollPeriodId: payrollPeriod.id,
						isDeleted: false,
						status: { in: ["REJECTED", "REVISED"] },
					},
				},
			},
		}),
		prisma.employee.count({
			where: {
				...payrollEmployeeWhere,
				timesheets: {
					some: {
						payrollPeriodId: payrollPeriod.id,
						isDeleted: false,
						status: "APPROVED",
					},
				},
			},
		}),
		prisma.employee.count({
			where: {
				...payrollEmployeeWhere,
				OR: [{ basicSalary: { lte: 0 } }, { embeddedSchedule: { equals: Prisma.DbNull } }],
			},
		}),
		prisma.employee.count({
			where: {
				...payrollEmployeeWhere,
				AND: [
					{
						OR: [
							{ basicSalary: { lte: 0 } },
							{ embeddedSchedule: { equals: Prisma.DbNull } },
						],
					},
					{
						OR: [
							{
								timesheets: {
									none: {
										payrollPeriodId: payrollPeriod.id,
										isDeleted: false,
									},
								},
							},
							{
								timesheets: {
									some: {
										payrollPeriodId: payrollPeriod.id,
										isDeleted: false,
										status: "DRAFT",
									},
								},
							},
						],
					},
				],
			},
		}),
	]);

	const sampleMissing = await prisma.employee.findMany({
		where: {
			...payrollEmployeeWhere,
			timesheets: {
				none: {
					payrollPeriodId: payrollPeriod.id,
					isDeleted: false,
				},
			},
		},
		select: {
			id: true,
			employeeId: true,
			employmentStatus: true,
			employmentStartDate: true,
			person: { select: { personalInfo: true } },
			department: { select: { name: true } },
		},
		orderBy: { employeeId: "asc" },
		take: 10,
	});

	const draftPlusMissing = statusCounts.DRAFT + missingTimesheetHeaders;
	const statusTotal = TIMESHEET_STATUSES.reduce((sum, status) => sum + statusCounts[status], 0);

	console.log(
		JSON.stringify(
			{
				mode: "dry-run",
				period: {
					id: payrollPeriod.id,
					code: payrollPeriod.code,
					name: payrollPeriod.name,
					payFrequency: payrollPeriod.payFrequency,
					startDate: payrollPeriod.startDate.toISOString().slice(0, 10),
					endDate: payrollPeriod.endDate.toISOString().slice(0, 10),
				},
				counts: {
					payrollScopeEmployees,
					totalTimesheets,
					statusTotal,
					byTimesheetStatus: statusCounts,
					missingTimesheetHeaders,
					draftPlusMissing,
					payrollBlockerBuckets: {
						notSubmittedEmployees,
						pendingApprovalEmployees,
						correctionNeededEmployees,
						readyForPayrollEmployees,
						missingInfoEmployees,
						missingInfoAndNotSubmittedEmployees,
					},
				},
				checks: {
					statusRowsEqualTotalTimesheets: statusTotal === totalTimesheets,
					notSubmittedEqualsDraftPlusMissing:
						notSubmittedEmployees === draftPlusMissing,
					payrollScopeEqualsStatusRowsPlusMissing:
						payrollScopeEmployees === statusTotal + missingTimesheetHeaders,
				},
				sampleMissingTimesheetHeaders: sampleMissing.map((employee) => {
					const personalInfo = employee.person?.personalInfo as any;
					const fullName = [personalInfo?.firstName, personalInfo?.lastName]
						.filter(Boolean)
						.join(" ");
					return {
						id: employee.id,
						employeeId: employee.employeeId,
						employmentStatus: employee.employmentStatus,
						employmentStartDate:
							employee.employmentStartDate?.toISOString().slice(0, 10) || null,
						name: fullName || null,
						department: employee.department?.name || null,
					};
				}),
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
