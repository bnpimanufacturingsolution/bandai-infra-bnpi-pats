import { PrismaClient } from "../generated/prisma";
import { getBusinessDayBounds } from "../helper/attendance.helper";
import { resolveEffectiveShift } from "../helper/employee-schedule.helper";

const prisma = new PrismaClient();

type Options = {
	employeeIds: string[];
	businessDate: string;
	apiBase?: string;
	authToken?: string;
	json: boolean;
};

const parseArgs = (): Options => {
	const raw: Record<string, string | boolean> = {};
	for (const arg of process.argv.slice(2)) {
		if (arg.startsWith("--") && arg.includes("=")) {
			const [key, ...rest] = arg.slice(2).split("=");
			raw[key] = rest.join("=");
		} else if (arg.startsWith("--")) {
			raw[arg.slice(2)] = true;
		}
	}

	const employeeIds = String(
		raw.employeeIds ||
			raw["employee-ids"] ||
			"cmpyywtcz00137z38dqappovp,cmq6422p1000g7zks1wzvfn2r",
	)
		.split(",")
		.map((value) => value.trim())
		.filter(Boolean);

	const businessDate = String(raw.businessDate || raw["business-date"] || "2026-06-09");
	if (!/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) {
		throw new Error("--businessDate must use YYYY-MM-DD");
	}
	if (raw.apply) {
		throw new Error("This diagnostic is read-only. --apply is intentionally forbidden.");
	}

	return {
		employeeIds,
		businessDate,
		apiBase: typeof raw.apiBase === "string" ? raw.apiBase.replace(/\/$/, "") : undefined,
		authToken:
			typeof raw.authToken === "string"
				? raw.authToken
				: process.env.HRIS_AUTH_TOKEN || undefined,
		json: Boolean(raw.json),
	};
};

const compactJson = (value: unknown) => {
	if (!value || typeof value !== "object") return value ?? null;
	const data = value as Record<string, unknown>;
	const keys = [
		"source",
		"deviceId",
		"deviceName",
		"eventId",
		"dedupeKey",
		"punchEventCount",
		"minimumPunchPairGapMinutes",
		"pairPunchesAsClockOut",
		"snapshotState",
		"snapshotType",
		"primaryMarker",
		"businessDate",
		"timeIn",
		"timeOut",
		"originalTime",
		"deviceTime",
		"skewSeconds",
	];
	const picked: Record<string, unknown> = {};
	for (const key of keys) {
		if (Object.prototype.hasOwnProperty.call(data, key)) picked[key] = data[key];
	}
	return Object.keys(picked).length ? picked : data;
};

const toIso = (value: unknown) => (value instanceof Date ? value.toISOString() : value ?? null);

const summarizeApi = (payload: any) => {
	const data = payload?.data ?? payload;
	const attendance = data?.attendance ?? null;
	const attendances = Array.isArray(data?.attendances) ? data.attendances : [];
	const timesheets = Array.isArray(data?.timesheets) ? data.timesheets : [];
	return {
		ok: true,
		attendance: attendance
			? {
					id: attendance.id,
					date: attendance.date,
					timeIn: attendance.timeIn,
					timeOut: attendance.timeOut,
					status: attendance.status,
				}
			: null,
		attendances: attendances.map((row: any) => ({
			id: row.id,
			date: row.date,
			timeIn: row.timeIn,
			timeOut: row.timeOut,
			status: row.status,
			attendanceId: row.attendanceId,
			storedStatus: row.storedStatus,
		})),
		timesheets: timesheets.map((row: any) => ({
			id: row.id,
			status: row.status,
			totalHoursWorked: row.totalHoursWorked,
			payrollPeriod: row.payrollPeriod
				? {
						name: row.payrollPeriod.name,
						startDate: row.payrollPeriod.startDate,
						endDate: row.payrollPeriod.endDate,
					}
				: null,
		})),
	};
};

const fetchApi = async (options: Options, path: string) => {
	if (!options.apiBase) return { skipped: "missing --apiBase" };
	const headers: Record<string, string> = { Accept: "application/json" };
	if (options.authToken) headers.Authorization = `Bearer ${options.authToken}`;
	const response = await fetch(`${options.apiBase}${path}`, { headers });
	const text = await response.text();
	let body: any = text;
	try {
		body = text ? JSON.parse(text) : null;
	} catch {
		// Keep text body for diagnostics.
	}
	if (!response.ok) {
		return { ok: false, status: response.status, body };
	}
	return summarizeApi(body);
};

const dateOnlyUtc = (dateKey: string) => new Date(`${dateKey}T00:00:00.000Z`);

type DiagnosticEmployee = any;
type EmployeeDeviceMapping = {
	id: string;
	employeeId: string;
	deviceEmpId: string | null;
	deviceId: string | null;
	employmentStatus: string | null;
	person?: { personalInfo?: unknown } | null;
};

const main = async () => {
	const options = parseArgs();
	const businessDay = dateOnlyUtc(options.businessDate);
	const { start, end } = getBusinessDayBounds(businessDay);

	const employees = (await (prisma as any).employee.findMany({
		where: { id: { in: options.employeeIds }, isDeleted: false },
		include: {
			person: { select: { personalInfo: true } },
			department: { select: { id: true, name: true, code: true } },
			position: { select: { id: true, title: true, code: true } },
			device: true,
		},
	})) as DiagnosticEmployee[];

	const missingEmployees = options.employeeIds.filter(
		(id) => !employees.some((employee) => employee.id === id),
	);
	if (missingEmployees.length) {
		throw new Error(`Employee(s) not found: ${missingEmployees.join(", ")}`);
	}

	const deviceEmpIds: string[] = [
		...new Set(
			employees
				.map((employee) => String(employee.deviceEmpId || "").trim())
				.filter(Boolean),
		),
	];
	const organizationIds: string[] = [...new Set(employees.map((employee) => employee.organizationId))];

	const latestEvents = await (prisma as any).deviceEvent.findMany({
		where: {
			organizationId: { in: organizationIds },
			OR: [
				{ employeeNo: { in: deviceEmpIds } },
				{ eventTime: { gte: start, lte: end } },
				{ receivedAt: { gte: start, lte: end } },
			],
		},
		orderBy: [{ receivedAt: "desc" }],
		take: 80,
	});
	const latestEmployeeNos: string[] = [
		...new Set<string>(
			latestEvents
				.map((event: any) => String(event.employeeNo || "").trim())
				.filter((value: string) => Boolean(value)),
		),
	];
	const employeeNoUniverse: string[] = [...new Set([...deviceEmpIds, ...latestEmployeeNos])];
	const employeesSharingDeviceEmpIds = (await (prisma as any).employee.findMany({
		where: {
			organizationId: { in: organizationIds },
			isDeleted: false,
			deviceEmpId: { in: employeeNoUniverse },
		},
		select: {
			id: true,
			employeeId: true,
			deviceEmpId: true,
			deviceId: true,
			employmentStatus: true,
			person: { select: { personalInfo: true } },
		},
		orderBy: [{ deviceEmpId: "asc" }, { employeeId: "asc" }],
	})) as EmployeeDeviceMapping[];

	const payrollPeriods = await prisma.payrollPeriod.findMany({
		where: {
			organizationId: { in: organizationIds },
			isDeleted: false,
			startDate: { lte: businessDay },
			endDate: { gte: businessDay },
		},
		orderBy: [{ startDate: "desc" }],
	});

	const employeeReports = [];
	for (const employee of employees) {
		const period =
			payrollPeriods.find((item) => item.organizationId === employee.organizationId) || null;
		const resolvedShift = await resolveEffectiveShift(prisma, {
			organizationId: employee.organizationId,
			employeeId: employee.id,
			date: businessDay,
		});
		const attendanceRows = await prisma.attendance.findMany({
			where: {
				organizationId: employee.organizationId,
				employeeId: employee.id,
				isDeleted: false,
				date: { gte: start, lte: end },
			},
			orderBy: [{ updatedAt: "desc" }],
		});
		const obligationRows = await (prisma as any).attendanceObligation.findMany({
			where: {
				organizationId: employee.organizationId,
				employeeId: employee.id,
				isDeleted: false,
				OR: [{ businessDate: options.businessDate }, { date: businessDay }],
			},
			orderBy: [{ updatedAt: "desc" }],
		});
		const timesheets = period
			? await prisma.timesheet.findMany({
					where: {
						organizationId: employee.organizationId,
						employeeId: employee.id,
						payrollPeriodId: period.id,
						isDeleted: false,
					},
					orderBy: [{ updatedAt: "desc" }],
				})
			: [];
		const timesheetIds = timesheets.map((timesheet) => timesheet.id);
		const timesheetLines = period
			? await prisma.timesheetline.findMany({
					where: {
						organizationId: employee.organizationId,
						employeeId: employee.id,
						payrollPeriodId: period.id,
						isDeleted: false,
						date: businessDay,
					},
					orderBy: [{ revisionNo: "desc" }, { updatedAt: "desc" }],
				})
			: [];

		const api = {
			today: await fetchApi(options, `/api/employee/${employee.id}/attendance/today`),
			attendanceLog: await fetchApi(
				options,
				`/api/employee/${employee.id}/attendance?page=1&limit=10&sort=date&order=desc&count=true`,
			),
			timesheets: await fetchApi(
				options,
				`/api/timesheet?page=1&limit=10&sort=createdAt&order=desc&document=true&pagination=true&count=true&filter=employeeId:${employee.id}`,
			),
		};

		employeeReports.push({
			identity: {
				id: employee.id,
				employeeId: employee.employeeId,
				name: [
					(employee.person?.personalInfo as any)?.firstName,
					(employee.person?.personalInfo as any)?.lastName,
				]
					.filter(Boolean)
					.join(" "),
				organizationId: employee.organizationId,
				userId: employee.userId,
				deviceEmpId: employee.deviceEmpId,
				deviceId: employee.deviceId,
				employmentStatus: employee.employmentStatus,
				employmentHireDate: toIso(employee.employmentHireDate),
				employmentStartDate: toIso(employee.employmentStartDate),
				department: employee.department,
				position: employee.position,
			},
			device: employee.device
				? {
						id: employee.device.id,
						name: employee.device.name,
						address: employee.device.address,
						port: employee.device.port,
						protocol: employee.device.protocol,
						config: compactJson(employee.device.config),
					}
				: null,
			resolvedShift: resolvedShift
				? {
						source: (resolvedShift as any).source,
						shiftTypeId: (resolvedShift as any).shiftTypeId,
						shiftTypeCode: (resolvedShift as any).shiftTypeCode,
						shiftTypeName: (resolvedShift as any).shiftTypeName,
						timeIn: (resolvedShift as any).timeIn,
						timeOut: (resolvedShift as any).timeOut,
					}
				: null,
			attendanceRows: attendanceRows.map((row: any) => ({
				id: row.id,
				date: toIso(row.date),
				timeIn: toIso(row.timeIn),
				timeOut: toIso(row.timeOut),
				status: row.status,
				isManualEntry: row.isManualEntry,
				deviceInfo: compactJson(row.deviceInfo),
				behaviorFlags: row.behaviorFlags,
				hoursWorked: row.hoursWorked,
				regularHours: row.regularHours,
				overtimeHours: row.overtimeHours,
				undertimeHours: row.undertimeHours,
				lateHours: row.lateHours,
				earlyOutHours: row.earlyOutHours,
				createdAt: toIso(row.createdAt),
				updatedAt: toIso(row.updatedAt),
			})),
			obligationRows: obligationRows.map((row: any) => ({
				id: row.id,
				date: toIso(row.date),
				businessDate: row.businessDate,
				payrollPeriodId: row.payrollPeriodId,
				timesheetId: row.timesheetId,
				timesheetlineId: row.timesheetlineId,
				attendanceId: row.attendanceId,
				timeIn: toIso(row.timeIn),
				timeOut: toIso(row.timeOut),
				status: row.status,
				source: row.source,
				primaryMarker: row.primaryMarker,
				hoursWorked: row.hoursWorked,
				regularHours: row.regularHours,
				overtimeHours: row.overtimeHours,
				undertimeHours: row.undertimeHours,
				lateHours: row.lateHours,
				earlyOutHours: row.earlyOutHours,
				metadata: compactJson(row.metadata),
				updatedAt: toIso(row.updatedAt),
			})),
			payrollPeriod: period
				? {
						id: period.id,
						code: period.code,
						name: period.name,
						status: period.status,
						startDate: toIso(period.startDate),
						endDate: toIso(period.endDate),
					}
				: null,
			timesheets: timesheets.map((row: any) => ({
				id: row.id,
				code: row.code,
				status: row.status,
				lockedAt: toIso(row.lockedAt),
				submittedAt: toIso(row.submittedAt),
				approvalDate: toIso(row.approvalDate),
				totalDays: row.totalDays,
				totalHoursWorked: row.totalHoursWorked,
				totalRegularHours: row.totalRegularHours,
				totalOvertimeHours: row.totalOvertimeHours,
				totalUndertimeHours: row.totalUndertimeHours,
				totalLateHours: row.totalLateHours,
				totalEarlyOutHours: row.totalEarlyOutHours,
			})),
			timesheetLines: timesheetLines.map((row: any) => ({
				id: row.id,
				timesheetId: row.timesheetId,
				date: toIso(row.date),
				attendanceId: row.attendanceId,
				timeIn: toIso(row.timeIn),
				timeOut: toIso(row.timeOut),
				status: row.status,
				isEffective: row.isEffective,
				revisionNo: row.revisionNo,
				isVirtual: row.isVirtual,
				ledgerType: row.ledgerType,
				hoursWorked: row.hoursWorked,
				regularHours: row.regularHours,
				overtimeHours: row.overtimeHours,
				undertimeHours: row.undertimeHours,
				lateHours: row.lateHours,
				earlyOutHours: row.earlyOutHours,
				metadata: compactJson(row.metadata),
			})),
			api,
			classificationSignals: {
				attendanceExists: attendanceRows.length > 0,
				obligationExists: obligationRows.length > 0,
				obligationLinkedToAttendance: obligationRows.some((row: any) =>
					attendanceRows.some((attendance: any) => attendance.id === row.attendanceId),
				),
				timesheetHeaderExists: timesheets.length > 0,
				timesheetLineForDateExists: timesheetLines.length > 0,
				effectiveTimesheetLineForDateExists: timesheetLines.some((row: any) => row.isEffective),
				deviceEmpIdHasDeviceEvent: latestEvents.some(
					(event: any) => event.employeeNo === employee.deviceEmpId,
				),
				sharedDeviceEmpIdCount: employeesSharingDeviceEmpIds.filter(
					(item) => item.deviceEmpId && item.deviceEmpId === employee.deviceEmpId,
				).length,
				timesheetIds,
			},
		});
	}

	const duplicateDeviceEmpIds = employeesSharingDeviceEmpIds
		.reduce((map, employee) => {
			if (!employee.deviceEmpId) return map;
			const current = map.get(employee.deviceEmpId) || [];
			current.push(employee);
			map.set(employee.deviceEmpId, current);
			return map;
		}, new Map<string, typeof employeesSharingDeviceEmpIds>())
		.entries();

	const duplicateDeviceMappings = [...duplicateDeviceEmpIds]
		.filter(([, rows]) => rows.length > 1)
		.map(([deviceEmpId, rows]) => ({
			deviceEmpId,
			employees: rows.map((employee) => ({
				id: employee.id,
				employeeId: employee.employeeId,
				name: [
					(employee.person?.personalInfo as any)?.firstName,
					(employee.person?.personalInfo as any)?.lastName,
				]
					.filter(Boolean)
					.join(" "),
				employmentStatus: employee.employmentStatus,
				deviceId: employee.deviceId,
			})),
		}));

	const report = {
		kind: "rey-hikvision-attendance-contract",
		readOnly: true,
		businessDate: options.businessDate,
		bounds: { start: start.toISOString(), end: end.toISOString() },
		missingEmployees,
		duplicateDeviceMappings,
		employeesByLatestEventEmployeeNo: employeesSharingDeviceEmpIds.map((employee) => ({
			id: employee.id,
			employeeId: employee.employeeId,
			name: [
				(employee.person?.personalInfo as any)?.firstName,
				(employee.person?.personalInfo as any)?.lastName,
			]
				.filter(Boolean)
				.join(" "),
			deviceEmpId: employee.deviceEmpId,
			deviceId: employee.deviceId,
			employmentStatus: employee.employmentStatus,
		})),
		deviceEvents: latestEvents.map((event: any) => ({
			id: event.id,
			employeeNo: event.employeeNo,
			employeeId: event.employeeId,
			attendanceId: event.attendanceId,
			deviceId: event.deviceId,
			eventTime: toIso(event.eventTime),
			receivedAt: toIso(event.receivedAt),
			source: event.source,
			status: event.status,
			eventType: event.eventType,
			major: event.major,
			minor: event.minor,
			doorNo: event.doorNo,
			verifyMode: event.verifyMode,
			dedupeKey: event.dedupeKey,
			errorMessage: event.errorMessage,
			payload: compactJson(event.payload),
		})),
		employees: employeeReports,
	};

	if (options.json) {
		console.log(JSON.stringify(report, null, 2));
		return;
	}

	console.log(JSON.stringify(report, null, 2));
};

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
