import type { PrismaClient } from "../../generated/prisma";

export type IsolatedHrisFixture = {
	departmentId: string;
	employeeId: string;
	organizationId: string;
	payrollPeriodId: string;
	personId: string;
	positionId: string;
	runId: string;
	timesheetId: string;
};

export function buildIsolatedRunId() {
	return `dbfault_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function cleanupIsolatedHrisFixture(
	prisma: PrismaClient,
	target: { organizationCode?: string; organizationId?: string },
) {
	let organizationId = target.organizationId;
	if (!organizationId && target.organizationCode) {
		const organization = await prisma.organization.findUnique({
			where: { code: target.organizationCode },
			select: { id: true },
		});
		organizationId = organization?.id;
	}

	if (!organizationId) return;

	await prisma.attendanceObligation.deleteMany({ where: { organizationId } });
	await prisma.employeePayroll.deleteMany({ where: { organizationId } });
	await prisma.timesheetline.deleteMany({ where: { organizationId } });
	await prisma.attendance.deleteMany({ where: { organizationId } });
	await prisma.timesheet.deleteMany({ where: { organizationId } });
	await prisma.payrollPeriod.deleteMany({ where: { organizationId } });
	await prisma.employee.deleteMany({ where: { organizationId } });
	await prisma.person.deleteMany({ where: { organizationId } });
	await prisma.position.deleteMany({ where: { organizationId } });
	await prisma.department.deleteMany({ where: { organizationId } });
	await prisma.organization.deleteMany({ where: { id: organizationId } });
}

export async function seedMinimalHrisFixture(
	prisma: PrismaClient,
	runId = buildIsolatedRunId(),
): Promise<IsolatedHrisFixture> {
	const ids = {
		departmentId: `${runId}_department`,
		employeeId: `${runId}_employee`,
		organizationId: `${runId}_organization`,
		payrollPeriodId: `${runId}_payroll_period`,
		personId: `${runId}_person`,
		positionId: `${runId}_position`,
		timesheetId: `${runId}_timesheet`,
	};
	const organizationCode = `${runId}_org`;

	await cleanupIsolatedHrisFixture(prisma, { organizationCode });

	await prisma.organization.create({
		data: {
			id: ids.organizationId,
			code: organizationCode,
			name: `DB Fault Test Organization ${runId}`,
		},
	});

	await prisma.department.create({
		data: {
			id: ids.departmentId,
			code: `${runId}_dept`,
			name: `DB Fault Department ${runId}`,
			organizationId: ids.organizationId,
		},
	});

	await prisma.position.create({
		data: {
			id: ids.positionId,
			code: `${runId}_pos`,
			departmentId: ids.departmentId,
			organizationId: ids.organizationId,
			title: `DB Fault Position ${runId}`,
		},
	});

	await prisma.person.create({
		data: {
			id: ids.personId,
			contactInfo: {
				email: `${runId}@example.test`,
				phone: "0000000000",
			},
			organizationId: ids.organizationId,
			personalInfo: {
				firstName: "DB",
				lastName: "Fault",
			},
		},
	});

	await prisma.employee.create({
		data: {
			id: ids.employeeId,
			basicSalary: 50000,
			departmentId: ids.departmentId,
			employeeId: `${runId}_emp`,
			employmentHistory: [],
			leaveBalances: [],
			organizationId: ids.organizationId,
			personId: ids.personId,
			positionId: ids.positionId,
			role: "employee",
		},
	});

	await prisma.payrollPeriod.create({
		data: {
			id: ids.payrollPeriodId,
			code: `${runId}_pp`,
			endDate: new Date("2026-05-15T00:00:00.000Z"),
			name: `DB Fault Payroll Period ${runId}`,
			organizationId: ids.organizationId,
			payDate: new Date("2026-05-20T00:00:00.000Z"),
			startDate: new Date("2026-05-01T00:00:00.000Z"),
			status: "OPEN",
		},
	});

	await prisma.timesheet.create({
		data: {
			id: ids.timesheetId,
			code: `${runId}_timesheet`,
			employeeId: ids.employeeId,
			organizationId: ids.organizationId,
			payrollPeriodId: ids.payrollPeriodId,
			status: "APPROVED",
		},
	});

	return {
		...ids,
		runId,
	};
}
