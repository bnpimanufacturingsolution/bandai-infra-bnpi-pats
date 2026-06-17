import { PrismaClient, type AttendanceStatus } from "../generated/prisma";
import {
	buildAttendanceEmployeeSnapshotFields,
	buildAttendanceTimekeepingFields,
	getDateKeyInBusinessTimeZone,
	getEffectiveEmploymentStartDate,
	normalizeToEndOfDay,
	normalizeToStartOfDay,
} from "./attendance.helper";
import {
	collectShiftTypeIdsFromEmployeeScheduleData,
	resolveEffectiveShiftFromEmployeeData,
} from "./employee-schedule.helper";
import { recomputeAttendanceObligationsForRange } from "./attendance-obligation.helper";

const SYSTEM_SOURCE = "SYSTEM_ATTENDANCE_MATERIALIZATION";
const APPROVED_LEAVE_STATES = ["APPROVED", "COMPLETED"];

export interface MaterializeAttendanceConfig {
	organizationId?: string;
	employeeId?: string;
	startDate: Date;
	endDate: Date;
	execute?: boolean;
	includeToday?: boolean;
	statuses?: AttendanceStatus[];
	employeeLimit?: number;
	concurrency?: number;
	progressIntervalMs?: number;
	onProgress?: (progress: MaterializeAttendanceProgress) => void;
}

export interface MaterializeAttendanceResult {
	scannedEmployees: number;
	scannedDays: number;
	created: number;
	skippedExisting: number;
	skippedNoSchedule: number;
	skippedOutOfEmployment: number;
	skippedStatusFiltered: number;
	errors: Array<{ employeeId: string; date: string; error: string }>;
	dryRun: boolean;
}

export interface MaterializeAttendanceProgress extends MaterializeAttendanceResult {
	phase: "loaded-employees" | "organization-start" | "organization-ready" | "scanning" | "complete";
	elapsedMs: number;
	totalEmployees: number;
	completedEmployees: number;
	organizationId?: string;
	organizationIndex?: number;
	organizationCount?: number;
	employeesInOrganization?: number;
	activeEmployeeId?: string;
	activeEmployeeCode?: string;
}

type EmployeeForMaterialization = {
	id: string;
	organizationId: string;
	employeeId: string;
	workforceSource?: "DIRECT" | "AGENCY" | null;
	agencyId?: string | null;
	reportToId?: string | null;
	departmentId?: string | null;
	department?: { id?: string | null; name?: string | null } | null;
	person?: {
		personalInfo?: {
			firstName?: string | null;
			middleName?: string | null;
			lastName?: string | null;
		} | null;
	} | null;
	employmentStartDate?: Date | null;
	employmentHireDate?: Date | null;
	employmentTerminationDate?: Date | null;
	embeddedSchedule?: any;
	scheduleOverrides?: any[];
	scheduleHistoryRecords?: any[];
};

type LeaveDayInfo = {
	requestId: string;
	leaveType: string | null;
};

const NON_WORK_CALCULATION = {
	totalMinutesWorked: 0,
	regularMinutes: 0,
	overtimeMinutes: 0,
	undertimeMinutes: 0,
	lateMinutes: 0,
	earlyOutMinutes: 0,
	breakMinutes: 0,
};

type AttendanceMaterializationData = {
	organizationId: string;
	employeeId: string;
	date: Date;
	timeIn: null;
	timeOut: null;
	status: AttendanceStatus;
	behaviorFlags: string[];
	scheduleSnapshot: any;
	isManualEntry: boolean;
	ledgerType: "RAW";
	isEffective: boolean;
	isDeleted: boolean;
	notes: string;
	deviceInfo: {
		source: string;
		generatedAt: string;
		leaveRequestId: string | null;
	};
	[key: string]: unknown;
};

function getNextUtcDay(date: Date): Date {
	const next = normalizeToStartOfDay(date);
	next.setUTCDate(next.getUTCDate() + 1);
	return next;
}

function toExtendedJsonObjectId(id: string) {
	return { $oid: id };
}

function toExtendedJsonDate(value: Date) {
	return { $date: value.toISOString() };
}

function fromMongoExtendedJson<T = unknown>(value: any): T {
	if (Array.isArray(value)) {
		return value.map((entry) => fromMongoExtendedJson(entry)) as T;
	}

	if (value && typeof value === "object") {
		if (typeof value.$oid === "string") {
			return value.$oid as T;
		}

		if (typeof value.$date === "string") {
			return new Date(value.$date) as T;
		}

		if (
			value.$date &&
			typeof value.$date === "object" &&
			typeof value.$date.$numberLong === "string"
		) {
			return new Date(Number(value.$date.$numberLong)) as T;
		}

		return Object.fromEntries(
			Object.entries(value).map(([key, entry]) => [key, fromMongoExtendedJson(entry)]),
		) as T;
	}

	return value as T;
}

function chunkArray<T>(items: T[], size: number): T[][] {
	const chunks: T[][] = [];
	for (let index = 0; index < items.length; index += size) {
		chunks.push(items.slice(index, index + size));
	}
	return chunks;
}

function getLeaveTypeFromMetadata(metadata: unknown): string | null {
	if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
	const root = metadata as Record<string, unknown>;
	const requestDetails = root.request_details;
	if (requestDetails && typeof requestDetails === "object" && !Array.isArray(requestDetails)) {
		const leaveType = (requestDetails as Record<string, unknown>).leaveType;
		if (typeof leaveType === "string" && leaveType.trim()) return leaveType.trim();
	}
	const leaveType = root.leaveType;
	return typeof leaveType === "string" && leaveType.trim() ? leaveType.trim() : null;
}

function shouldIncludeStatus(config: MaterializeAttendanceConfig, status: AttendanceStatus) {
	if (!config.statuses?.length) return true;
	return config.statuses.includes(status);
}

function buildNotes(status: AttendanceStatus, leave?: LeaveDayInfo | null): string {
	if (status === "REST_DAY") return "System-generated rest day record";
	if (status === "LEAVE") {
		const leaveType = leave?.leaveType ? `${leave.leaveType} ` : "";
		return `System-generated ${leaveType}leave record`.trim();
	}
	return "System-generated absent record";
}

async function buildLeaveDayMap(
	prisma: PrismaClient,
	params: {
		organizationId: string;
		employeeIds: string[];
		startDate: Date;
		endDate: Date;
	},
) {
	const leaveByEmployeeDay = new Map<string, Map<string, LeaveDayInfo>>();
	if (!params.employeeIds.length) return leaveByEmployeeDay;

	const leaveRequests = await prisma.request.findMany({
		where: {
			organizationId: params.organizationId,
			requesterId: { in: params.employeeIds },
			type: "LEAVE",
			isDeleted: false,
			currentWorkflowStateKey: { in: APPROVED_LEAVE_STATES },
			startDate: { lte: normalizeToEndOfDay(params.endDate) },
			endDate: { gte: normalizeToStartOfDay(params.startDate) },
		},
		select: {
			id: true,
			requesterId: true,
			startDate: true,
			endDate: true,
			metadata: true,
		},
	});

	for (const request of leaveRequests) {
		if (!request.startDate || !request.endDate) continue;
		const employeeDayMap = leaveByEmployeeDay.get(request.requesterId) || new Map();
		let cursor = normalizeToStartOfDay(
			new Date(Math.max(request.startDate.getTime(), params.startDate.getTime())),
		);
		const end = normalizeToStartOfDay(
			new Date(Math.min(request.endDate.getTime(), params.endDate.getTime())),
		);
		while (cursor <= end) {
			employeeDayMap.set(getDateKeyInBusinessTimeZone(cursor), {
				requestId: request.id,
				leaveType: getLeaveTypeFromMetadata(request.metadata),
			});
			cursor = getNextUtcDay(cursor);
		}
		leaveByEmployeeDay.set(request.requesterId, employeeDayMap);
	}

	return leaveByEmployeeDay;
}

function getDateRangeEnd(config: MaterializeAttendanceConfig): Date {
	const requestedEnd = normalizeToStartOfDay(config.endDate);
	if (config.includeToday) return requestedEnd;

	const today = normalizeToStartOfDay(new Date());
	const yesterday = getNextUtcDay(today);
	yesterday.setUTCDate(yesterday.getUTCDate() - 2);

	return requestedEnd > yesterday ? yesterday : requestedEnd;
}

function countInclusiveUtcDays(startDate: Date, endDate: Date): number {
	const start = normalizeToStartOfDay(startDate);
	const end = normalizeToStartOfDay(endDate);
	if (start > end) return 0;
	return Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
}

function getPreviousUtcDay(date: Date): Date {
	const previous = normalizeToStartOfDay(date);
	previous.setUTCDate(previous.getUTCDate() - 1);
	return previous;
}

function getEmployeeMaterializationWindow(
	employee: EmployeeForMaterialization,
	startDate: Date,
	endDate: Date,
) {
	const effectiveStart = getEffectiveEmploymentStartDate(employee);
	const terminationDate = employee.employmentTerminationDate
		? normalizeToStartOfDay(employee.employmentTerminationDate)
		: null;
	const employeeStart = effectiveStart && effectiveStart > startDate ? effectiveStart : startDate;
	const employeeEnd = terminationDate && terminationDate < endDate ? terminationDate : endDate;

	if (employeeStart > employeeEnd) {
		return {
			startDate: employeeStart,
			endDate: employeeEnd,
			skippedOutOfEmployment: countInclusiveUtcDays(startDate, endDate),
		};
	}

	const skippedBefore = employeeStart > startDate
		? countInclusiveUtcDays(startDate, getPreviousUtcDay(employeeStart))
		: 0;
	const skippedAfter = employeeEnd < endDate
		? countInclusiveUtcDays(getNextUtcDay(employeeEnd), endDate)
		: 0;

	return {
		startDate: employeeStart,
		endDate: employeeEnd,
		skippedOutOfEmployment: skippedBefore + skippedAfter,
	};
}

type AttendanceDayState = {
	systemAttendance: { id: string } | null;
	hasNonSystemAttendance: boolean;
};

type AttendanceDayAggregateRow = {
	_id?: {
		employeeId?: string;
		dayKey?: string;
	};
	hasNonSystemAttendance?: boolean;
	systemAttendanceId?: string | null;
};

function getAttendanceDayMapKey(employeeId: string, dayKey: string): string {
	return `${employeeId}:${dayKey}`;
}

async function buildExistingAttendanceDayMap(
	prisma: PrismaClient,
	params: {
		organizationId: string;
		employeeIds: string[];
		startDate: Date;
		endDate: Date;
	},
) {
	const attendanceByEmployeeDay = new Map<string, AttendanceDayState>();
	if (!params.employeeIds.length) return attendanceByEmployeeDay;

	const rowsRaw = await (prisma as any).attendance.aggregateRaw({
		pipeline: [
			{
				$match: {
					organizationId: params.organizationId,
					employeeId: {
						$in: params.employeeIds.map(toExtendedJsonObjectId),
					},
					isDeleted: false,
					date: {
						$gte: toExtendedJsonDate(params.startDate),
						$lte: toExtendedJsonDate(normalizeToEndOfDay(params.endDate)),
					},
				},
			},
			{
				$project: {
					employeeId: 1,
					dayKey: {
						$dateToString: {
							format: "%Y-%m-%d",
							date: "$date",
							timezone: "Asia/Manila",
						},
					},
					isSystem: {
						$eq: ["$deviceInfo.source", SYSTEM_SOURCE],
					},
				},
			},
			{
				$group: {
					_id: {
						employeeId: "$employeeId",
						dayKey: "$dayKey",
					},
					hasNonSystemAttendance: {
						$max: {
							$cond: ["$isSystem", false, true],
						},
					},
					systemAttendanceId: {
						$first: {
							$cond: ["$isSystem", "$_id", null],
						},
					},
				},
			},
		],
	});
	const rows = fromMongoExtendedJson<AttendanceDayAggregateRow[]>(rowsRaw);

	for (const row of rows) {
		const employeeId = row?._id?.employeeId;
		const dayKey = row?._id?.dayKey;
		if (!employeeId || !dayKey) continue;
		attendanceByEmployeeDay.set(getAttendanceDayMapKey(employeeId, dayKey), {
			systemAttendance: null,
			hasNonSystemAttendance: Boolean(row.hasNonSystemAttendance),
		});
		const existing = attendanceByEmployeeDay.get(getAttendanceDayMapKey(employeeId, dayKey));
		if (existing && row.systemAttendanceId) {
			existing.systemAttendance = { id: row.systemAttendanceId };
		}
	}

	return attendanceByEmployeeDay;
}

async function flushMaterializedAttendanceWrites(
	prisma: PrismaClient,
	params: {
		creates: AttendanceMaterializationData[];
		result: MaterializeAttendanceResult;
	},
) {
	const createChunks = chunkArray(params.creates, 500);
	for (const chunk of createChunks) {
		if (!chunk.length) continue;
		await prisma.attendance.createMany({
			data: chunk as any,
		});
		params.result.created += chunk.length;
	}
}

export async function materializeComputedAttendance(
	prisma: PrismaClient,
	config: MaterializeAttendanceConfig,
): Promise<MaterializeAttendanceResult> {
	const startDate = normalizeToStartOfDay(config.startDate);
	const endDate = getDateRangeEnd(config);
	const startedAt = Date.now();
	let lastProgressAt = 0;
	let totalEmployees = 0;
	let completedEmployees = 0;
	const result: MaterializeAttendanceResult = {
		scannedEmployees: 0,
		scannedDays: 0,
		created: 0,
		skippedExisting: 0,
		skippedNoSchedule: 0,
		skippedOutOfEmployment: 0,
		skippedStatusFiltered: 0,
		errors: [],
		dryRun: config.execute !== true,
	};
	const emitProgress = (
		progress: Omit<
			MaterializeAttendanceProgress,
			keyof MaterializeAttendanceResult | "elapsedMs" | "totalEmployees" | "completedEmployees"
		>,
		options?: { force?: boolean },
	) => {
		if (!config.onProgress) return;
		const now = Date.now();
		const intervalMs = Math.max(1000, Math.floor(config.progressIntervalMs || 5000));
		if (!options?.force && now - lastProgressAt < intervalMs) return;
		lastProgressAt = now;
		config.onProgress({
			...result,
			...progress,
			elapsedMs: now - startedAt,
			totalEmployees,
			completedEmployees,
		});
	};

	if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
		throw new Error("Invalid startDate or endDate");
	}
	if (startDate > endDate) return result;

	const employeeWhere: any = {
		isDeleted: false,
	};
	if (config.organizationId) employeeWhere.organizationId = config.organizationId;
	if (config.employeeId) employeeWhere.id = config.employeeId;

	const employees = (await prisma.employee.findMany({
		where: employeeWhere,
		select: {
			id: true,
			organizationId: true,
			employeeId: true,
			workforceSource: true,
			agencyId: true,
			reportToId: true,
			departmentId: true,
			department: {
				select: {
					id: true,
					name: true,
				},
			},
			person: {
				select: {
					personalInfo: true,
				},
			},
			employmentStartDate: true,
			employmentHireDate: true,
			employmentTerminationDate: true,
			embeddedSchedule: true,
			scheduleOverrides: {
				where: {
					organizationId: config.organizationId || undefined,
					isDeleted: false,
					date: {
						gte: startDate,
						lte: normalizeToEndOfDay(endDate),
					},
				},
				select: {
					id: true,
					date: true,
					shiftTypeId: true,
					isDeleted: true,
					createdAt: true,
					updatedAt: true,
				},
			},
			scheduleHistoryRecords: {
				where: {
					organizationId: config.organizationId || undefined,
					effectiveAt: {
						lte: endDate,
					},
				},
				orderBy: [{ effectiveAt: "desc" }, { createdAt: "desc" }],
				select: {
					effectiveAt: true,
					createdAt: true,
					beforeSchedule: true,
					afterSchedule: true,
				},
			},
		},
		orderBy: [{ organizationId: "asc" }, { employeeId: "asc" }],
		...(config.employeeLimit && config.employeeLimit > 0
			? { take: Math.floor(config.employeeLimit) }
			: {}),
	})) as EmployeeForMaterialization[];
	totalEmployees = employees.length;

	const employeesByOrganization = new Map<string, EmployeeForMaterialization[]>();
	for (const employee of employees) {
		const bucket = employeesByOrganization.get(employee.organizationId) || [];
		bucket.push(employee);
		employeesByOrganization.set(employee.organizationId, bucket);
	}
	const organizationEntries = Array.from(employeesByOrganization.entries());
	emitProgress({ phase: "loaded-employees" }, { force: true });

	for (let organizationIndex = 0; organizationIndex < organizationEntries.length; organizationIndex++) {
		const [organizationId, organizationEmployees] = organizationEntries[organizationIndex];
		const organizationProgress = {
			organizationId,
			organizationIndex: organizationIndex + 1,
			organizationCount: organizationEntries.length,
			employeesInOrganization: organizationEmployees.length,
		};
		emitProgress({ phase: "organization-start", ...organizationProgress }, { force: true });
		const leaveByEmployeeDay = await buildLeaveDayMap(prisma, {
			organizationId,
			employeeIds: organizationEmployees.map((employee) => employee.id),
			startDate,
			endDate,
		});
		const attendanceByEmployeeDay = await buildExistingAttendanceDayMap(prisma, {
			organizationId,
			employeeIds: organizationEmployees.map((employee) => employee.id),
			startDate,
			endDate,
		});
		const shiftTypeIds = Array.from(
			new Set(
				organizationEmployees.flatMap((employee) =>
					collectShiftTypeIdsFromEmployeeScheduleData(employee),
				),
			),
		);
		const shiftTypes = shiftTypeIds.length
			? await (prisma as any).shiftType.findMany({
					where: {
						organizationId,
						isDeleted: false,
						id: { in: shiftTypeIds },
					},
			  })
			: [];
		const shiftTypeById = new Map<string, any>(
			shiftTypes.map((shiftType: any) => [String(shiftType.id), shiftType]),
		);
		const pendingCreates: AttendanceMaterializationData[] = [];
		emitProgress({ phase: "organization-ready", ...organizationProgress }, { force: true });

		const processEmployee = async (employee: EmployeeForMaterialization) => {
			result.scannedEmployees++;
			const employeeWindow = getEmployeeMaterializationWindow(employee, startDate, endDate);
			result.skippedOutOfEmployment += employeeWindow.skippedOutOfEmployment;
			if (employeeWindow.startDate > employeeWindow.endDate) {
				completedEmployees++;
				emitProgress({
					phase: "scanning",
					...organizationProgress,
					activeEmployeeId: employee.id,
					activeEmployeeCode: employee.employeeId,
				});
				return;
			}

			const employeeSnapshotFields = buildAttendanceEmployeeSnapshotFields(employee);
			let cursor = new Date(employeeWindow.startDate);

			while (cursor <= employeeWindow.endDate) {
				const dateKey = getDateKeyInBusinessTimeZone(cursor);
				result.scannedDays++;
				emitProgress({
					phase: "scanning",
					...organizationProgress,
					activeEmployeeId: employee.id,
					activeEmployeeCode: employee.employeeId,
				});

				try {
					const attendanceState = attendanceByEmployeeDay.get(
						getAttendanceDayMapKey(employee.id, dateKey),
					);
					const systemAttendance = attendanceState?.systemAttendance || null;
					if (attendanceState?.hasNonSystemAttendance || systemAttendance) {
						result.skippedExisting++;
						cursor = getNextUtcDay(cursor);
						continue;
					}

					const scheduleSnapshot = resolveEffectiveShiftFromEmployeeData(
						employee,
						cursor,
						shiftTypeById,
					);

					if (!scheduleSnapshot) {
						result.skippedNoSchedule++;
						cursor = getNextUtcDay(cursor);
						continue;
					}

					const leave = leaveByEmployeeDay.get(employee.id)?.get(dateKey) || null;
					const status: AttendanceStatus = scheduleSnapshot.isOff
						? "REST_DAY"
						: leave
							? "LEAVE"
							: "ABSENT";

					if (!shouldIncludeStatus(config, status)) {
						result.skippedStatusFiltered++;
						cursor = getNextUtcDay(cursor);
						continue;
					}

					if (!config.execute) {
						result.created++;
						cursor = getNextUtcDay(cursor);
						continue;
					}

					const data: AttendanceMaterializationData = {
						organizationId,
						employeeId: employee.id,
						date: new Date(cursor),
						timeIn: null,
						timeOut: null,
						status,
						behaviorFlags: [],
						scheduleSnapshot,
						isManualEntry: false,
						ledgerType: "RAW" as const,
						isEffective: true,
						isDeleted: false,
						notes: buildNotes(status, leave),
						deviceInfo: {
							source: SYSTEM_SOURCE,
							generatedAt: new Date().toISOString(),
							leaveRequestId: leave?.requestId || null,
						},
						...employeeSnapshotFields,
						...buildAttendanceTimekeepingFields(NON_WORK_CALCULATION, {
							isNonWorked: true,
						}),
					};

					pendingCreates.push(data);
				} catch (error: any) {
					result.errors.push({
						employeeId: employee.id,
						date: dateKey,
						error: error?.message || String(error),
					});
				}

				cursor = getNextUtcDay(cursor);
			}

			completedEmployees++;
			emitProgress({
				phase: "scanning",
				...organizationProgress,
				activeEmployeeId: employee.id,
				activeEmployeeCode: employee.employeeId,
			});
		};

		const concurrency = Math.max(1, Math.min(20, Math.floor(config.concurrency || 6)));
		let nextEmployeeIndex = 0;
		const workers = Array.from({ length: Math.min(concurrency, organizationEmployees.length) }, async () => {
			while (nextEmployeeIndex < organizationEmployees.length) {
				const employee = organizationEmployees[nextEmployeeIndex++];
				await processEmployee(employee);
			}
		});
		await Promise.all(workers);
		if (config.execute) {
			await flushMaterializedAttendanceWrites(prisma, {
				creates: pendingCreates,
				result,
			});
			if (pendingCreates.length > 0) {
				await recomputeAttendanceObligationsForRange(prisma, {
					organizationId,
					employeeId: config.employeeId,
					fromDate: startDate,
					toDate: endDate,
					reason: "AttendanceMaterialized",
				});
			}
			emitProgress({ phase: "scanning", ...organizationProgress }, { force: true });
		}
	}
	emitProgress({ phase: "complete" }, { force: true });

	return result;
}

export { SYSTEM_SOURCE as ATTENDANCE_MATERIALIZATION_SOURCE };
