import { EmploymentStatus, PrismaClient } from "../generated/prisma";
import { ensureAttendanceObligationsForPayrollPeriod } from "./attendance-obligation.helper";

type PayrollPeriodOpenRepairParams = {
	organizationId: string;
	payrollPeriodId: string;
	actorEmployeeId?: string | null;
	dryRun?: boolean;
	ensureAttendanceObligations?: boolean;
};

const ACTIVE_TIMESHEET_EMPLOYMENT_STATUSES: EmploymentStatus[] = ["ACTIVE", "ONBOARDING"];

function dateKey(date: Date) {
	return date.toISOString().slice(0, 10);
}

function inclusiveDayCount(startDate: Date, endDate: Date) {
	const start = Date.UTC(
		startDate.getUTCFullYear(),
		startDate.getUTCMonth(),
		startDate.getUTCDate(),
	);
	const end = Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate());
	return Math.max(0, Math.floor((end - start) / (24 * 60 * 60 * 1000)) + 1);
}

function buildTimesheetCode(payrollPeriodId: string, employeeId: string, index: number) {
	const suffix = `${Date.now()}-${index}`.replace(/[^0-9-]/g, "");
	return `TS-OPEN-${payrollPeriodId.slice(0, 8)}-${employeeId.slice(0, 8)}-${suffix}`;
}

export async function selfRepairPayrollPeriodOpenCoverage(
	prisma: PrismaClient,
	params: PayrollPeriodOpenRepairParams,
) {
	const dryRun = params.dryRun !== false;
	const payrollPeriod = await prisma.payrollPeriod.findFirst({
		where: {
			id: params.payrollPeriodId,
			organizationId: params.organizationId,
			isDeleted: false,
		},
		select: {
			id: true,
			code: true,
			name: true,
			status: true,
			startDate: true,
			endDate: true,
			payFrequency: true,
			generationMetadata: true,
		},
	});

	if (!payrollPeriod) {
		throw new Error("PAYROLL_PERIOD_NOT_FOUND");
	}

	const eligibleEmployees = await prisma.employee.findMany({
		where: {
			organizationId: params.organizationId,
			isDeleted: false,
			employmentStatus: { in: ACTIVE_TIMESHEET_EMPLOYMENT_STATUSES },
			...(payrollPeriod.payFrequency ? { payFrequency: payrollPeriod.payFrequency } : {}),
			OR: [
				{ employmentStartDate: null },
				{ employmentStartDate: { lte: payrollPeriod.endDate } },
			],
		},
		select: {
			id: true,
			employeeId: true,
			payFrequency: true,
		},
		orderBy: [{ employeeId: "asc" }, { id: "asc" }],
	});
	const eligibleEmployeeIds = eligibleEmployees.map((employee) => employee.id);

	const [existingTimesheets, obligationCountBefore] = await Promise.all([
		eligibleEmployeeIds.length
			? prisma.timesheet.findMany({
					where: {
						organizationId: params.organizationId,
						payrollPeriodId: payrollPeriod.id,
						employeeId: { in: eligibleEmployeeIds },
						isDeleted: false,
					},
					select: {
						id: true,
						employeeId: true,
						status: true,
					},
				})
			: Promise.resolve([]),
		prisma.attendanceObligation.count({
			where: {
				organizationId: params.organizationId,
				payrollPeriodId: payrollPeriod.id,
				isDeleted: false,
			},
		}),
	]);

	const existingTimesheetEmployeeIds = new Set(
		existingTimesheets.map((timesheet) => timesheet.employeeId),
	);
	const missingDraftEmployees = eligibleEmployees.filter(
		(employee) => !existingTimesheetEmployeeIds.has(employee.id),
	);
	const draftStatusCounts = existingTimesheets.reduce<Record<string, number>>((counts, timesheet) => {
		const status = String(timesheet.status || "UNKNOWN");
		counts[status] = (counts[status] || 0) + 1;
		return counts;
	}, {});

	let statusChanged = false;
	let obligationsResult: Awaited<ReturnType<typeof ensureAttendanceObligationsForPayrollPeriod>> | null =
		null;
	let draftsCreated = 0;
	let obligationCountAfter = obligationCountBefore;
	const shouldEnsureAttendanceObligations = params.ensureAttendanceObligations !== false;

	if (!dryRun) {
		if (payrollPeriod.status === "DRAFT") {
			await prisma.payrollPeriod.update({
				where: { id: payrollPeriod.id },
				data: {
					status: "OPEN",
					generationMetadata: {
						...(
							payrollPeriod.generationMetadata &&
							typeof payrollPeriod.generationMetadata === "object" &&
							!Array.isArray(payrollPeriod.generationMetadata)
								? payrollPeriod.generationMetadata
								: {}
						),
						openedFrom: "PAYROLL_PERIOD_OPEN_SELF_REPAIR",
						openedAt: new Date().toISOString(),
						openedBy: params.actorEmployeeId || null,
					},
				},
			});
			statusChanged = true;
		}

		if (missingDraftEmployees.length > 0) {
			await prisma.timesheet.createMany({
				data: missingDraftEmployees.map((employee, index) => ({
					code: buildTimesheetCode(payrollPeriod.id, employee.id, index),
					organizationId: params.organizationId,
					employeeId: employee.id,
					payrollPeriodId: payrollPeriod.id,
					totalDays: 0,
					totalHoursWorked: "0:00",
					totalRegularHours: "0:00",
					totalOvertimeHours: "0:00",
					totalUndertimeHours: "0:00",
					totalLateHours: "0:00",
					totalEarlyOutHours: "0:00",
					status: "DRAFT",
					notes: "Prepared by payroll period open self-repair",
					editPermissionStatus: "NONE",
					isDeleted: false,
				})),
				skipDuplicates: true,
			});
			draftsCreated = missingDraftEmployees.length;
		}

		if (shouldEnsureAttendanceObligations) {
			obligationsResult = await ensureAttendanceObligationsForPayrollPeriod(prisma, {
				organizationId: params.organizationId,
				payrollPeriodId: payrollPeriod.id,
			});

			obligationCountAfter = await prisma.attendanceObligation.count({
				where: {
					organizationId: params.organizationId,
					payrollPeriodId: payrollPeriod.id,
					isDeleted: false,
				},
			});
		}
	}

	return {
		dryRun,
		payrollPeriod: {
			id: payrollPeriod.id,
			code: payrollPeriod.code,
			name: payrollPeriod.name,
			statusBefore: payrollPeriod.status,
			statusAfter: dryRun
				? payrollPeriod.status === "DRAFT"
					? "OPEN"
					: payrollPeriod.status
				: statusChanged
					? "OPEN"
					: payrollPeriod.status,
			startDate: dateKey(payrollPeriod.startDate),
			endDate: dateKey(payrollPeriod.endDate),
			payFrequency: payrollPeriod.payFrequency,
			periodDays: inclusiveDayCount(payrollPeriod.startDate, payrollPeriod.endDate),
		},
		eligibleActiveEmployees: eligibleEmployees.length,
		timesheets: {
			existing: existingTimesheets.length,
			existingByStatus: draftStatusCounts,
			missingDrafts: missingDraftEmployees.length,
			wouldCreateDrafts: dryRun ? missingDraftEmployees.length : 0,
			createdDrafts: draftsCreated,
			sampleMissingEmployees: missingDraftEmployees.slice(0, 10).map((employee) => ({
				id: employee.id,
				employeeId: employee.employeeId,
				payFrequency: employee.payFrequency,
			})),
		},
		attendanceObligations: {
			existingBefore: obligationCountBefore,
			existingAfter: obligationCountAfter,
			estimatedMaxEmployeeDays: eligibleEmployees.length * inclusiveDayCount(
				payrollPeriod.startDate,
				payrollPeriod.endDate,
			),
			repairResult: obligationsResult,
		},
		actions: {
			wouldOpenPeriod: dryRun && payrollPeriod.status === "DRAFT",
			openedPeriod: statusChanged,
			wouldEnsureAttendanceObligations: dryRun && shouldEnsureAttendanceObligations,
			ensuredAttendanceObligations: Boolean(obligationsResult),
		},
	};
}
