import * as XLSX from "xlsx";
import { Prisma, PrismaClient } from "../../generated/prisma";
import {
	ensureDm3ScheduleBackedAttendanceObligations,
	prepareDm3ScheduleBackedTimesheetDrafts,
} from "../../helper/dm3-attendance-obligation-repair.helper";
import {
	appendEmployeeScheduleHistory,
	copyShiftTypeToTemplatePatternDay,
	copyTemplateToEmployeeEmbeddedSchedule,
	isSameEmployeeScheduleAssignment,
} from "../../helper/employee-schedule.helper";
import {
	buildNonOverlappingWorkBreakSlots,
	calculateShiftHour,
} from "../../helper/schedule-normalization.helper";
import { EmployeeImportService } from "../employee/employee-import.service";

type Dm3WorkbookImportParams = {
	prisma: PrismaClient;
	buffer: Buffer;
	organizationId: string;
	sourceWorkbook: string;
	authToken?: string;
	onProgress?: (event: {
		stepCode: string;
		eventType:
			| "STEP_PROGRESS"
			| "STEP_COMPLETED"
			| "ROW_IMPORTED"
			| "ROW_SKIPPED"
			| "SIDE_EFFECT_STARTED"
			| "SIDE_EFFECT_COMPLETED"
			| "MATERIALIZATION_STARTED"
			| "MATERIALIZATION_COMPLETED";
		status: string;
		message: string;
		sourceSheet?: string;
		sourceRow?: number | null;
		employeeId?: string | null;
		employeeName?: string | null;
		counts?: Record<string, any>;
		metadata?: Record<string, any>;
	}) => void | Promise<void>;
	onRowEvents?: (events: Array<{
		stepCode: string;
		eventType: "ROW_IMPORTED" | "ROW_SKIPPED";
		status: string;
		message: string;
		sourceSheet?: string;
		sourceRow?: number | null;
		employeeId?: string | null;
		employeeName?: string | null;
		counts?: Record<string, any>;
		metadata?: Record<string, any>;
	}>) => void | Promise<void>;
};

type SheetSummary = {
	total: number;
	created: number;
	updated: number;
	skipped: number;
	failed: number;
	errors: Array<{ row: number | null; field?: string; message: string }>;
	attendanceObligations?: Record<string, any>;
	timesheetDrafts?: Record<string, any>;
};

function emptySummary(total = 0): SheetSummary {
	return { total, created: 0, updated: 0, skipped: 0, failed: 0, errors: [] };
}

function rowsFromSheet(buffer: Buffer, sheetName: string) {
	const workbook = XLSX.read(buffer, { type: "buffer", raw: false, cellDates: false });
	const actualSheet = workbook.SheetNames.find(
		(candidate) => candidate.trim().toLowerCase() === sheetName.trim().toLowerCase(),
	);
	if (!actualSheet) return [];
	return (XLSX.utils.sheet_to_json(workbook.Sheets[actualSheet], {
		defval: "",
		blankrows: false,
		raw: false,
	}) as Record<string, any>[]).map((row) => {
		const cleaned: Record<string, any> = {};
		Object.keys(row || {}).forEach((key) => {
			const value = row[key];
			const cleanKey = String(key).trim();
			cleaned[cleanKey] = typeof value === "string" && value.trim() === "" ? undefined : value;
		});
		if (cleaned.EMP_ID !== undefined) cleaned.EMP_ID = String(cleaned.EMP_ID);
		return cleaned;
	});
}

function parseDateOnlyInput(value: unknown): Date | null {
	if (value instanceof Date && !Number.isNaN(value.getTime())) {
		return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
	}
	const text = String(value || "").trim();
	if (!text) return null;
	const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (match) return new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00.000Z`);
	const slashMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
	if (slashMatch) {
		const year = Number(slashMatch[3].length === 2 ? `20${slashMatch[3]}` : slashMatch[3]);
		const month = Number(slashMatch[1]);
		const day = Number(slashMatch[2]);
		return new Date(Date.UTC(year, month - 1, day));
	}
	const parsed = new Date(text);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function resolveEmployeeScheduleEffectiveStart(employee: any, sourceEffectiveFrom: Date | null): Date | null {
	const employeeStart =
		parseDateOnlyInput(employee?.employmentStartDate) ||
		parseDateOnlyInput(employee?.employmentHireDate);
	return employeeStart || sourceEffectiveFrom;
}

function parseMoneyInput(value: unknown, fallback = 0) {
	const parsed = Number(String(value ?? "").replace(/,/g, "").trim());
	return Number.isFinite(parsed) ? parsed : fallback;
}

function parsePositiveIntInput(value: unknown, fallback = 1) {
	const parsed = Number.parseInt(String(value ?? "").trim(), 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function addMonths(date: Date, months: number) {
	const next = new Date(date);
	next.setUTCMonth(next.getUTCMonth() + months);
	return next;
}

function normalizeEnum(value: unknown, fallback: string, allowed: string[]) {
	const normalized = String(value || fallback)
		.trim()
		.toUpperCase()
		.replace(/[\s-]+/g, "_");
	return allowed.includes(normalized) ? normalized : fallback;
}

function buildKeyMap(rows: any[], keys: string[]) {
	const map = new Map<string, any>();
	for (const row of rows) {
		for (const key of keys) {
			const value = String(row?.[key] || "").trim();
			if (value) map.set(value.toUpperCase(), row);
		}
	}
	return map;
}

function parseDm3WorksharingScheduleCode(scheduleCode: string) {
	const normalized = String(scheduleCode || "")
		.trim()
		.toUpperCase();
	if (!/^(?:BNPI_WS_MON_SAT|BNPI_SCHED_MON_SAT)_WS_\d{4}_\d{4}/.test(normalized)) return null;
	const workWindows = Array.from(normalized.matchAll(/(?:^|_)WS_(\d{2})(\d{2})_(\d{2})(\d{2})/g)).map((match) => ({
		startTime: `${match[1]}:${match[2]}`,
		endTime: `${match[3]}:${match[4]}`,
		raw: match,
	}));
	const breakWindows = Array.from(normalized.matchAll(/(?:^|_)BR_(\d{2})(\d{2})_(\d{2})(\d{2})/g)).map((match) => ({
		startTime: `${match[1]}:${match[2]}`,
		endTime: `${match[3]}:${match[4]}`,
		raw: match,
	}));
	const allParts = [...workWindows, ...breakWindows].flatMap((window) => [
		Number(window.raw[1]),
		Number(window.raw[2]),
		Number(window.raw[3]),
		Number(window.raw[4]),
	]);
	if (!workWindows.length || allParts.some((value, index) => value > (index % 2 === 0 ? 23 : 59))) return null;
	const startTime = workWindows[0].startTime;
	const endTime = workWindows[workWindows.length - 1].endTime;
	const breakStartTime = breakWindows[0]?.startTime || null;
	const breakEndTime = breakWindows[0]?.endTime || null;
	const breakCode = breakWindows.map((window) => `_BR_${window.startTime.replace(":", "")}_${window.endTime.replace(":", "")}`).join("");
	return {
		shiftCode: `${workWindows.map((window) => `WS_${window.startTime.replace(":", "")}_${window.endTime.replace(":", "")}`).join("_")}${breakCode}`,
		shiftLabel: `${workWindows.map((window) => `${window.startTime} to ${window.endTime}`).join(" / ")}${breakWindows.length ? `, breaks ${breakWindows.map((window) => `${window.startTime} to ${window.endTime}`).join(" / ")}` : ""}`,
		startTime,
		endTime,
		breakStartTime,
		breakEndTime,
		workWindows,
		breakWindows,
	};
}

function buildDm3WorksharingOffDaySnapshot() {
	return {
		name: "Off day",
		code: "OFF",
		isOvernight: false,
		isOff: true,
		shiftHour: 0,
		timeSlots: [],
	};
}

async function ensureDm3WorksharingScheduleTemplates(
	params: Dm3WorkbookImportParams,
	scheduleCodes: string[],
) {
	const createdCodes: string[] = [];
	const updatedCodes: string[] = [];
	const parsedCodes = scheduleCodes
		.map((scheduleCode) => ({
			scheduleCode,
			parsed: parseDm3WorksharingScheduleCode(scheduleCode),
		}))
		.filter((entry): entry is { scheduleCode: string; parsed: NonNullable<ReturnType<typeof parseDm3WorksharingScheduleCode>> } =>
			Boolean(entry.parsed),
		);

	for (const entry of parsedCodes) {
		const shiftPayload = {
			organizationId: params.organizationId,
			name: entry.parsed.shiftLabel,
			code: entry.parsed.shiftCode,
			isOvernight: entry.parsed.endTime <= entry.parsed.startTime,
			isOff: false,
			isActive: true,
			isDeleted: false,
			timeSlots: buildNonOverlappingWorkBreakSlots(entry.parsed),
		};
		const shiftHour = calculateShiftHour(shiftPayload);
		const shiftType = await (params.prisma as any).shiftType.upsert({
			where: {
				organizationId_code: {
					organizationId: params.organizationId,
					code: entry.parsed.shiftCode,
				},
			},
			update: {
				name: shiftPayload.name,
				isOvernight: shiftPayload.isOvernight,
				isOff: shiftPayload.isOff,
				isActive: true,
				isDeleted: false,
				timeSlots: shiftPayload.timeSlots,
				shiftHour,
			},
			create: { ...shiftPayload, shiftHour },
		});
		const rawPattern = Array.from({ length: 7 }, (_, index) =>
			index < 6
				? { day: index + 1, shiftTypeId: shiftType.id, shiftSnapshot: null }
				: { day: index + 1, shiftTypeId: null, shiftSnapshot: buildDm3WorksharingOffDaySnapshot() },
		);
		const pattern = await copyShiftTypeToTemplatePatternDay(params.prisma, {
			organizationId: params.organizationId,
			pattern: rawPattern,
		});
		const totalHour = pattern.reduce((total: number, day: any) => total + Math.max(0, Number(day.shiftHour || 0)), 0);
		const totalDay = pattern.filter((day: any) => Number(day.shiftHour || 0) > 0).length;
		const existingTemplate = await (params.prisma as any).scheduleTemplate.findUnique({
			where: {
				organizationId_code: {
					organizationId: params.organizationId,
					code: entry.scheduleCode,
				},
			},
			select: { id: true },
		});
		await (params.prisma as any).scheduleTemplate.upsert({
			where: {
				organizationId_code: {
					organizationId: params.organizationId,
					code: entry.scheduleCode,
				},
			},
			update: {
				name: `BNPI Mon-Sat ${entry.parsed.shiftLabel}`,
				description: "DM3.2 WorkSharing recurring schedule template",
				cycleDays: 7,
				graceLateMinutes: 0,
				graceEarlyOutMinutes: 0,
				pattern,
				totalHour,
				totalDay,
				isActive: true,
				isDeleted: false,
			},
			create: {
				organizationId: params.organizationId,
				code: entry.scheduleCode,
				name: `BNPI Mon-Sat ${entry.parsed.shiftLabel}`,
				description: "DM3.2 WorkSharing recurring schedule template",
				cycleDays: 7,
				graceLateMinutes: 0,
				graceEarlyOutMinutes: 0,
				pattern,
				totalHour,
				totalDay,
				isActive: true,
				isDeleted: false,
			},
		});
		if (existingTemplate) updatedCodes.push(entry.scheduleCode);
		else createdCodes.push(entry.scheduleCode);
	}

	if (createdCodes.length || updatedCodes.length) {
		await params.onProgress?.({
			stepCode: "DM3.2",
			eventType: "STEP_PROGRESS",
			status: "IMPORTING",
			message: `Self-repaired ${createdCodes.length} missing DM3.2 schedule templates.`,
			counts: {
				scheduleTemplatesCreated: createdCodes.length,
				scheduleTemplatesUpdated: updatedCodes.length,
			},
			metadata: {
				createdCodes: createdCodes.slice(0, 50),
				updatedCodes: updatedCodes.slice(0, 50),
			},
		});
	}

	return { created: createdCodes.length, updated: updatedCodes.length };
}

export async function importDm3Workbook(params: Dm3WorkbookImportParams) {
	const employeeRows = rowsFromSheet(params.buffer, "Employees");
	const scheduleRows = rowsFromSheet(params.buffer, "Employee Schedule Assignments");
	const reportingLineRows = rowsFromSheet(params.buffer, "Reporting Lines");
	const documentRows = rowsFromSheet(params.buffer, "Employee Documents 201 Files");
	const openingLeaveRows = rowsFromSheet(params.buffer, "Opening Leave Balances");
	const benefitLoanRows = rowsFromSheet(params.buffer, "Employee Benefits Loans");
	await params.onProgress?.({
		stepCode: "DM3.validate",
		eventType: "STEP_COMPLETED",
		status: "COMPLETED",
		message: "Workbook sheets read and row goals calculated.",
		counts: {
			employees: employeeRows.length,
			schedules: scheduleRows.length,
			reportingLines: reportingLineRows.length,
			documents: documentRows.length,
			openingLeaveBalances: openingLeaveRows.length,
			benefitsLoans: benefitLoanRows.length,
		},
	});

	const importService = new EmployeeImportService(params.prisma);
	const employeeJobId = importService.startImport(employeeRows.length);
	await params.onProgress?.({
		stepCode: "DM3.1",
		eventType: "STEP_PROGRESS",
		status: "IMPORTING",
		message: "Importing employee master records.",
		counts: { processed: 0, total: employeeRows.length },
		metadata: { employeeImportJobId: employeeJobId },
	});
	await importService.processImport({
		jobId: employeeJobId,
		rows: employeeRows as any,
		organizationId: params.organizationId,
		authToken: params.authToken || "",
		autoCreate: false,
		importMode: "full",
		enableAccountProvisioning: true,
		enableCredentialEmails: false,
		enablePostActions: false,
		enableAttendanceObligationRefresh: false,
		applyDefaultLeaveBalances: false,
		onRowProgress: (event) =>
			params.onRowEvents?.([
				{
					stepCode: "DM3.1",
					eventType: event.success ? "ROW_IMPORTED" : "ROW_SKIPPED",
					status: event.success ? "IMPORTING" : "BLOCKED",
					message: event.success
						? `Employee ${event.wasCreated ? "created" : "updated"}: ${event.fullName || event.employeeId}`
						: `Employee skipped: ${event.fullName || event.employeeId} - ${event.message}`,
					sourceSheet: "Employees",
					sourceRow: event.row,
					employeeId: event.employeeId,
					employeeName: event.fullName,
					counts: { processed: event.row - 1 },
					metadata: { result: event.message },
				},
			]),
	});
	const employeeJob = EmployeeImportService.getJobProgress(employeeJobId);
	await params.onProgress?.({
		stepCode: "DM3.1",
		eventType: "STEP_PROGRESS",
		status: "IMPORTING",
		message: "Employee master import finished.",
		counts: {
			processed: employeeJob?.processed || employeeRows.length,
			total: employeeRows.length,
			created: employeeJob?.created || 0,
			updated: employeeJob?.updated || 0,
			failed: employeeJob?.failed || 0,
		},
		metadata: { employeeImportJobId: employeeJobId },
	});
	const employeeIds = Array.from(
		new Set(
			[...employeeRows, ...scheduleRows, ...reportingLineRows, ...documentRows, ...benefitLoanRows]
				.flatMap((row) => [row.EMP_ID, row.REPORT_TO_EMP_ID])
				.map((value) => normalizeDm3EmployeeExternalId(value))
				.filter(Boolean),
		),
	);
	const employees = employeeIds.length
		? await params.prisma.employee.findMany({
				where: { organizationId: params.organizationId, employeeId: { in: employeeIds }, isDeleted: false },
				select: {
					id: true,
					employeeId: true,
					personId: true,
					role: true,
					reportToId: true,
					embeddedSchedule: true,
					employmentStartDate: true,
					employmentHireDate: true,
					leaveBalances: true,
					metadata: true,
					person: { select: { contactInfo: true } },
				},
			})
		: [];
	const employeesByExternalId = new Map(employees.map((employee: any) => [String(employee.employeeId), employee]));

	const scheduleSummary = await importScheduleAssignments(params, scheduleRows, employeesByExternalId);
	const reportingLineSummary = await importDm3ReportingLines(params, reportingLineRows, employeesByExternalId);
	const documentSummary = await importEmployeeDocuments(params, documentRows, employeesByExternalId);
	const openingLeaveSummary = await importOpeningLeaveBalances(params, openingLeaveRows, employeesByExternalId);
	const benefitLoanSummary = await importEmployeeBenefitsLoans(params, benefitLoanRows, employeesByExternalId);

	const createdEmployees = employees
		.filter((employee: any) => employee.personId)
		.map((employee: any) => {
			const contactInfo = employee.person?.contactInfo && typeof employee.person.contactInfo === "object" ? employee.person.contactInfo : {};
			return {
				employeeDbId: employee.id,
				employeeId: employee.employeeId,
				personId: employee.personId,
				role: employee.role,
				email: String(contactInfo.email || "").trim() || null,
				sourceWorkbook: params.sourceWorkbook,
				sourceSheet: "Employees",
			};
		});

	return {
		employeeJobId,
		employeeSummary: {
			total: employeeRows.length,
			created: employeeJob?.created || 0,
			updated: employeeJob?.updated || 0,
			failed: employeeJob?.failed || 0,
		},
		scheduleSummary,
		reportingLineSummary,
		documentSummary,
		openingLeaveSummary,
		benefitLoanSummary,
		createdEmployees,
	};
}

function normalizeDm3EmployeeExternalId(value: unknown) {
	const text = String(value ?? "").trim();
	if (!text) return "";
	if (/^\d+$/.test(text)) return text.padStart(5, "0");
	return text;
}

function buildReportingLineCycleSkips(
	pairs: Array<{ employeeDbId: string; managerDbId: string; employeeExternalId: string; rowNumber: number }>,
	existingReportToByEmployeeId: Map<string, string | null>,
) {
	const proposed = new Map(existingReportToByEmployeeId);
	for (const pair of pairs) proposed.set(pair.employeeDbId, pair.managerDbId);

	const skippedRows = new Set<number>();
	for (const pair of pairs) {
		const seen = new Set<string>();
		let current: string | null | undefined = pair.employeeDbId;
		while (current) {
			if (seen.has(current)) {
				skippedRows.add(pair.rowNumber);
				break;
			}
			seen.add(current);
			current = proposed.get(current) || null;
		}
	}
	return skippedRows;
}

export async function importDm3ReportingLines(
	params: Dm3WorkbookImportParams,
	rows: Record<string, any>[],
	employeesByExternalId?: Map<string, any>,
	options: { dryRun?: boolean } = {},
) {
	const summary = emptySummary(rows.length);
	if (rows.length === 0) return summary;

	const requestedEmployeeIds = Array.from(
		new Set(
			rows
				.flatMap((row) => [row.EMP_ID, row.REPORT_TO_EMP_ID])
				.map((value) => normalizeDm3EmployeeExternalId(value))
				.filter(Boolean),
		),
	);
	let employeeMap = employeesByExternalId;
	if (!employeeMap) {
		const employees = requestedEmployeeIds.length
			? await params.prisma.employee.findMany({
					where: {
						organizationId: params.organizationId,
						isDeleted: false,
						employeeId: { in: requestedEmployeeIds },
					},
					select: { id: true, employeeId: true, reportToId: true, metadata: true },
				})
			: [];
		employeeMap = new Map(employees.map((employee: any) => [String(employee.employeeId), employee]));
	}

	const existingEmployees = Array.from(employeeMap.values());
	const existingReportToByEmployeeId = new Map<string, string | null>(
		existingEmployees.map((employee: any) => [String(employee.id), employee.reportToId || null]),
	);
	const validPairs: Array<{
		employeeDbId: string;
		managerDbId: string;
		employeeExternalId: string;
		managerExternalId: string;
		rowNumber: number;
		effectiveFrom: string | null;
		notes: string | null;
	}> = [];
	const seenEmployeeRows = new Map<string, number>();
	const duplicateEmployeeIds: string[] = [];
	const missingEmployeeIds = new Set<string>();
	const missingManagerIds = new Set<string>();

	for (const [index, row] of rows.entries()) {
		const rowNumber = Number(row.SOURCE_ROW || 0) || index + 2;
		const employeeExternalId = normalizeDm3EmployeeExternalId(row.EMP_ID);
		const managerExternalId = normalizeDm3EmployeeExternalId(row.REPORT_TO_EMP_ID);
		const effectiveFrom = parseDateOnlyInput(row.EFFECTIVE_FROM);
		const notes = String(row.NOTES || "").trim() || null;
		const employee = employeeMap.get(employeeExternalId);
		const manager = employeeMap.get(managerExternalId);
		const seenRow = seenEmployeeRows.get(employeeExternalId);
		if (employeeExternalId && seenRow) {
			duplicateEmployeeIds.push(employeeExternalId);
			summary.failed += 1;
			summary.errors.push({
				row: rowNumber,
				field: "EMP_ID",
				message: `Employee ${employeeExternalId} has duplicate reporting-line rows (${seenRow} and ${rowNumber}).`,
			});
			continue;
		}
		if (employeeExternalId) seenEmployeeRows.set(employeeExternalId, rowNumber);
		if (!employeeExternalId || !managerExternalId) {
			summary.failed += 1;
			summary.errors.push({
				row: rowNumber,
				field: !employeeExternalId ? "EMP_ID" : "REPORT_TO_EMP_ID",
				message: "EMP_ID and REPORT_TO_EMP_ID are required.",
			});
			continue;
		}
		if (employeeExternalId === managerExternalId) {
			summary.failed += 1;
			summary.errors.push({
				row: rowNumber,
				field: "REPORT_TO_EMP_ID",
				message: `Employee ${employeeExternalId} cannot report to self.`,
			});
			continue;
		}
		if (!employee || !manager) {
			summary.skipped += 1;
			if (!employee) missingEmployeeIds.add(employeeExternalId);
			if (!manager) missingManagerIds.add(managerExternalId);
			summary.errors.push({
				row: rowNumber,
				field: !employee ? "EMP_ID" : "REPORT_TO_EMP_ID",
				message: !employee
					? `Employee ${employeeExternalId} was not found. Import DM3 Employees first.`
					: `Report-to employee ${managerExternalId} was not found. Import DM3 Employees first.`,
			});
			continue;
		}
		if (employee.reportToId === manager.id) {
			summary.skipped += 1;
			continue;
		}
		validPairs.push({
			employeeDbId: employee.id,
			managerDbId: manager.id,
			employeeExternalId,
			managerExternalId,
			rowNumber,
			effectiveFrom: effectiveFrom ? dateOnly(effectiveFrom) : null,
			notes,
		});
	}

	const cycleSkippedRows = buildReportingLineCycleSkips(validPairs, existingReportToByEmployeeId);
	let cycleCount = 0;
	const applyPairs = validPairs.filter((pair) => {
		if (!cycleSkippedRows.has(pair.rowNumber)) return true;
		cycleCount += 1;
		summary.failed += 1;
		summary.errors.push({
			row: pair.rowNumber,
			field: "REPORT_TO_EMP_ID",
			message: `Reporting line ${pair.employeeExternalId} -> ${pair.managerExternalId} would create a cycle.`,
		});
		return false;
	});

	if (options.dryRun) {
		summary.updated += applyPairs.length;
		(summary as any).matchedRows = validPairs.length;
		(summary as any).plannedUpdates = applyPairs.length;
		(summary as any).unchangedRows = summary.skipped - missingEmployeeIds.size - missingManagerIds.size;
		(summary as any).missingEmployeeIds = Array.from(missingEmployeeIds).sort();
		(summary as any).missingManagerIds = Array.from(missingManagerIds).sort();
		(summary as any).duplicateEmployeeIds = Array.from(new Set(duplicateEmployeeIds)).sort();
		(summary as any).cycleRows = cycleCount;
		return summary;
	}

	const chunkSize = 500;
	for (let index = 0; index < applyPairs.length; index += chunkSize) {
		const chunk = applyPairs.slice(index, index + chunkSize);
		if (chunk.length === 0) continue;
		const values = chunk.map((pair) =>
			Prisma.sql`(${pair.employeeExternalId}, ${pair.managerExternalId}, ${pair.rowNumber}, ${params.sourceWorkbook}, ${pair.effectiveFrom}, ${pair.notes})`,
		);
		const updated = await params.prisma.$executeRaw`
			WITH src("employeeExternalId", "managerExternalId", "sourceRow", "sourceWorkbook", "effectiveFrom", "notes") AS (
				VALUES ${Prisma.join(values)}
			)
			UPDATE "employees" AS e
			SET
				"reportToId" = manager.id,
				"updatedAt" = NOW(),
				"metadata" = COALESCE(e."metadata", '{}'::jsonb) || jsonb_build_object(
					'dm3ReportingLine',
					jsonb_build_object(
						'sourceWorkbook', src."sourceWorkbook",
						'sourceSheet', 'Reporting Lines',
						'sourceRow', src."sourceRow",
						'effectiveFrom', src."effectiveFrom",
						'notes', src."notes",
						'importedAt', NOW()
					)
				)
			FROM src
			JOIN "employees" AS manager
				ON manager."organizationId" = ${params.organizationId}
				AND manager."isDeleted" = false
				AND manager."employeeId" = src."managerExternalId"
			WHERE e."organizationId" = ${params.organizationId}
				AND e."isDeleted" = false
				AND e."employeeId" = src."employeeExternalId"
				AND e.id <> manager.id
				AND e."reportToId" IS DISTINCT FROM manager.id
		`;
		summary.updated += Number(updated || 0);
	}

	summary.skipped += Math.max(0, applyPairs.length - summary.updated);
	(summary as any).matchedRows = validPairs.length;
	(summary as any).plannedUpdates = applyPairs.length;
	(summary as any).missingEmployeeIds = Array.from(missingEmployeeIds).sort();
	(summary as any).missingManagerIds = Array.from(missingManagerIds).sort();
	(summary as any).duplicateEmployeeIds = Array.from(new Set(duplicateEmployeeIds)).sort();
	(summary as any).cycleRows = cycleCount;
	await params.onProgress?.({
		stepCode: "DM3.3",
		eventType: "STEP_COMPLETED",
		status: summary.failed > 0 ? "COMPLETED_WITH_WARNINGS" : "COMPLETED",
		message: `Reporting lines imported: ${summary.updated} updated, ${summary.skipped} skipped, ${summary.failed} failed.`,
		counts: {
			total: summary.total,
			updated: summary.updated,
			skipped: summary.skipped,
			failed: summary.failed,
		},
	});
	return summary;
}

async function importScheduleAssignments(
	params: Dm3WorkbookImportParams,
	rows: Record<string, any>[],
	employeesByExternalId: Map<string, any>,
) {
	const summary = emptySummary(rows.length);
	const allImportedEmployeeDbIds = Array.from(
		new Set(
			Array.from(employeesByExternalId.values())
				.map((employee: any) => String(employee?.id || "").trim())
				.filter(Boolean),
		),
	);
	const prepareDraftHeadersForImportedEmployees = async () => {
		if (allImportedEmployeeDbIds.length === 0) {
			const timesheetDrafts = {
				status: "BLOCKED",
				blockerReason: "Timesheet draft headers need eligible imported employees.",
				periodsProcessed: 0,
				eligibleEmployees: 0,
				existing: 0,
				created: 0,
				refreshed: 0,
				remainingDraftsToPrepare: 0,
				results: [],
			};
			(summary as any).timesheetDrafts = timesheetDrafts;
			return timesheetDrafts;
		}
		await params.onProgress?.({
			stepCode: "DM3.2.timesheet_drafts",
			eventType: "SIDE_EFFECT_STARTED",
			status: "FINALIZING",
			message: "Preparing current-period draft timesheet headers for imported employees.",
			counts: { importedEmployees: allImportedEmployeeDbIds.length },
		});
		const timesheetDrafts = await prepareDm3ScheduleBackedTimesheetDrafts(params.prisma, {
			organizationId: params.organizationId,
			employeeIds: allImportedEmployeeDbIds,
			currentOnly: true,
		});
		await params.onProgress?.({
			stepCode: "DM3.2.timesheet_drafts",
			eventType: "SIDE_EFFECT_COMPLETED",
			status: timesheetDrafts.status === "BLOCKED" ? "BLOCKED" : "COMPLETED",
			message:
				timesheetDrafts.blockerReason ||
				`Timesheet draft headers ready: ${Number(timesheetDrafts.existing || 0) + Number(timesheetDrafts.created || 0)} employees covered.`,
			counts: {
				processed: Number(timesheetDrafts.eligibleEmployees || 0),
				total: Number(timesheetDrafts.eligibleEmployees || 0),
				...timesheetDrafts,
			},
		});
		(summary as any).timesheetDrafts = timesheetDrafts;
		return timesheetDrafts;
	};
	if (rows.length === 0) {
		await prepareDraftHeadersForImportedEmployees();
		return summary;
	}
	const scheduleCodes = Array.from(new Set(rows.map((row) => String(row.SCHEDULE_CODE || "").trim()).filter(Boolean)));
	const repairedTemplates = await ensureDm3WorksharingScheduleTemplates(params, scheduleCodes);
	const templates = scheduleCodes.length
		? await (params.prisma as any).scheduleTemplate.findMany({
				where: { organizationId: params.organizationId, isDeleted: false, code: { in: scheduleCodes } },
			})
		: [];
	const templatesByCode = new Map(templates.map((template: any) => [String(template.code), template]));
	const affectedEmployeeIds = new Set<string>();
	await params.onProgress?.({
		stepCode: "DM3.2",
		eventType: "STEP_PROGRESS",
		status: "IMPORTING",
		message: "Assigning employee schedules.",
		counts: { processed: 0, total: rows.length },
	});

	for (const [index, row] of rows.entries()) {
		const rowNumber = index + 2;
		const employeeExternalId = String(row.EMP_ID || "").trim();
		const scheduleCode = String(row.SCHEDULE_CODE || "").trim();
		const employee = employeesByExternalId.get(employeeExternalId);
		const template = templatesByCode.get(scheduleCode);
		const sourceEffectiveFrom = parseDateOnlyInput(row.EFFECTIVE_FROM);
		const effectiveFrom = resolveEmployeeScheduleEffectiveStart(employee, sourceEffectiveFrom);
		const effectiveTo = parseDateOnlyInput(row.EFFECTIVE_TO);
		const effectiveStartSource =
			parseDateOnlyInput(employee?.employmentStartDate) ||
			parseDateOnlyInput(employee?.employmentHireDate)
				? "employee_start_or_hire_date"
				: "workbook_effective_from";
		if (!employee || !template || !effectiveFrom) {
			summary.failed += 1;
			summary.errors.push({
				row: rowNumber,
				field: !employee ? "EMP_ID" : !template ? "SCHEDULE_CODE" : "EFFECTIVE_FROM",
				message: !employee
					? `Employee ${employeeExternalId} was not found.`
					: !template
						? `Schedule template ${scheduleCode} was not found.`
						: "EFFECTIVE_FROM is required.",
			});
			await params.onRowEvents?.([
				{
					stepCode: "DM3.2",
					eventType: "ROW_SKIPPED",
					status: "BLOCKED",
					message: !employee
						? `Schedule assignment skipped: employee ${employeeExternalId} was not found.`
						: !template
							? `Schedule assignment skipped for ${employeeExternalId}: schedule ${scheduleCode} was not found.`
							: `Schedule assignment skipped for ${employeeExternalId}: employee start/hire date or EFFECTIVE_FROM is required.`,
					sourceSheet: "Employee Schedule Assignments",
					sourceRow: rowNumber,
					employeeId: employeeExternalId || null,
					employeeName: null,
					metadata: {
						scheduleCode,
						sourceEffectiveFrom: sourceEffectiveFrom?.toISOString().slice(0, 10) || null,
					},
				},
			]);
			continue;
		}
		const previousEmbeddedSchedule = employee.embeddedSchedule || null;
		const nextEmbeddedSchedule = copyTemplateToEmployeeEmbeddedSchedule({
			template,
			effectiveStartDate: effectiveFrom,
			effectiveEndDate: effectiveTo || null,
			reason: String(row.NOTES || "").trim() || "DM3.2 employee schedule assignment import",
			version: Number(previousEmbeddedSchedule?.version || 0) + 1,
		});
		if (isSameEmployeeScheduleAssignment(previousEmbeddedSchedule, nextEmbeddedSchedule)) {
			const previousReason = String(previousEmbeddedSchedule?.reason || "").trim();
			const nextReason = String(nextEmbeddedSchedule?.reason || "").trim();
			if (previousReason !== nextReason) {
				await params.prisma.employee.update({
					where: { id: employee.id },
					data: {
						embeddedSchedule: {
							...previousEmbeddedSchedule,
							reason: nextEmbeddedSchedule.reason,
							assignedAt: nextEmbeddedSchedule.assignedAt,
							version: Number(previousEmbeddedSchedule?.version || 0) + 1,
						} as any,
					},
				});
				await appendEmployeeScheduleHistory(params.prisma, {
					organizationId: params.organizationId,
					employeeId: employee.id,
					action: "reassigned",
					reason: nextReason || "DM3.2 employee schedule source evidence refresh",
					effectiveAt: effectiveFrom,
					beforeSchedule: previousEmbeddedSchedule,
					afterSchedule: {
						...previousEmbeddedSchedule,
						reason: nextEmbeddedSchedule.reason,
						assignedAt: nextEmbeddedSchedule.assignedAt,
						version: Number(previousEmbeddedSchedule?.version || 0) + 1,
					},
					metadata: {
						sourceWorkbook: params.sourceWorkbook,
						sourceSheet: "Employee Schedule Assignments",
						sourceRow: rowNumber,
						effectiveStartSource,
						sourceEffectiveFrom: sourceEffectiveFrom?.toISOString().slice(0, 10) || null,
						effectiveFrom: effectiveFrom.toISOString().slice(0, 10),
						reason: "same_timeslot_source_refreshed",
					},
				});
				summary.updated += 1;
				employee.embeddedSchedule = {
					...previousEmbeddedSchedule,
					reason: nextEmbeddedSchedule.reason,
					assignedAt: nextEmbeddedSchedule.assignedAt,
					version: Number(previousEmbeddedSchedule?.version || 0) + 1,
				};
			} else {
				summary.skipped += 1;
			}
			affectedEmployeeIds.add(employee.id);
			await params.onRowEvents?.([
				{
					stepCode: "DM3.2",
					eventType: previousReason !== nextReason ? "ROW_IMPORTED" : "ROW_SKIPPED",
					status: "IMPORTING",
					message:
						previousReason !== nextReason
							? `Schedule source refreshed: ${employeeExternalId} -> ${scheduleCode}`
							: `Schedule unchanged: ${employeeExternalId} -> ${scheduleCode}`,
					sourceSheet: "Employee Schedule Assignments",
					sourceRow: rowNumber,
					employeeId: employeeExternalId,
					employeeName: null,
					metadata: {
						scheduleCode,
						effectiveFrom: effectiveFrom.toISOString().slice(0, 10),
						effectiveStartSource,
						sourceEffectiveFrom: sourceEffectiveFrom?.toISOString().slice(0, 10) || null,
						effectiveTo: effectiveTo ? effectiveTo.toISOString().slice(0, 10) : null,
						reason:
							previousReason !== nextReason
								? "same_timeslot_source_refreshed"
								: "same_schedule_assignment",
					},
				},
			]);
			continue;
		}
		await params.prisma.employee.update({
			where: { id: employee.id },
			data: { embeddedSchedule: nextEmbeddedSchedule as any },
		});
		await appendEmployeeScheduleHistory(params.prisma, {
			organizationId: params.organizationId,
			employeeId: employee.id,
			action: previousEmbeddedSchedule ? "reassigned" : "assigned",
			reason: String(row.NOTES || "").trim() || "DM3.2 employee schedule assignment import",
			effectiveAt: effectiveFrom,
			beforeSchedule: previousEmbeddedSchedule,
			afterSchedule: nextEmbeddedSchedule,
			metadata: {
				sourceWorkbook: params.sourceWorkbook,
				sourceSheet: "Employee Schedule Assignments",
				sourceRow: rowNumber,
				effectiveStartSource,
				sourceEffectiveFrom: sourceEffectiveFrom?.toISOString().slice(0, 10) || null,
				effectiveFrom: effectiveFrom.toISOString().slice(0, 10),
			},
		});
		if (previousEmbeddedSchedule) summary.updated += 1;
		else summary.created += 1;
		employee.embeddedSchedule = nextEmbeddedSchedule;
		affectedEmployeeIds.add(employee.id);
		await params.onRowEvents?.([
			{
				stepCode: "DM3.2",
				eventType: "ROW_IMPORTED",
				status: "IMPORTING",
				message: `Schedule ${previousEmbeddedSchedule ? "reassigned" : "assigned"}: ${employeeExternalId} -> ${scheduleCode}`,
				sourceSheet: "Employee Schedule Assignments",
				sourceRow: rowNumber,
				employeeId: employeeExternalId,
				employeeName: null,
				metadata: {
					scheduleCode,
					effectiveFrom: effectiveFrom.toISOString().slice(0, 10),
					effectiveStartSource,
					sourceEffectiveFrom: sourceEffectiveFrom?.toISOString().slice(0, 10) || null,
					effectiveTo: effectiveTo ? effectiveTo.toISOString().slice(0, 10) : null,
				},
			},
		]);
		if ((summary.created + summary.updated + summary.failed) % 100 === 0) {
			await params.onProgress?.({
				stepCode: "DM3.2",
				eventType: "STEP_PROGRESS",
				status: "IMPORTING",
				message: "Assigning employee schedules.",
				counts: {
					processed: summary.created + summary.updated + summary.failed,
					total: rows.length,
					created: summary.created,
					updated: summary.updated,
					failed: summary.failed,
				},
			});
		}
	}

	if (affectedEmployeeIds.size > 0) {
		await params.onProgress?.({
			stepCode: "DM3.2",
			eventType: "STEP_PROGRESS",
			status: "IMPORTING",
			message: "Employee schedule assignments imported.",
			counts: {
				processed: rows.length,
				total: rows.length,
				created: summary.created,
				updated: summary.updated,
				failed: summary.failed,
			},
		});
		await params.onProgress?.({
			stepCode: "DM3.2.attendance_obligations",
			eventType: "MATERIALIZATION_STARTED",
			status: "MATERIALIZING",
			message: "Materializing attendance obligations from DM3.2 schedule assignments.",
			counts: { scheduledEmployees: affectedEmployeeIds.size },
		});
		const materialization = await ensureDm3ScheduleBackedAttendanceObligations(params.prisma, {
			organizationId: params.organizationId,
			employeeIds: Array.from(affectedEmployeeIds),
			currentOnly: true,
			onRowEvents: (rows) =>
				params.onRowEvents?.(
					rows.map((row) => ({
						stepCode: "DM3.2.attendance_obligations",
						eventType: "ROW_IMPORTED",
						status: "MATERIALIZING",
						message: `Attendance obligation verified: ${row.employeeName || row.employeeCode} on ${row.businessDate} (${row.status})`,
						sourceSheet: "Attendance Obligations",
						sourceRow: null,
						employeeId: row.employeeCode,
						employeeName: row.employeeName,
						metadata: {
							businessDate: row.businessDate,
							payrollPeriodCode: row.payrollPeriodCode,
							attendanceStatus: row.status,
							scheduleCode: row.scheduleCode,
						},
					})),
				),
			onProgress: (progress) =>
				params.onProgress?.({
					stepCode: "DM3.2.attendance_obligations",
					eventType: "STEP_PROGRESS",
					status: progress.status === "BLOCKED" ? "BLOCKED" : "MATERIALIZING",
					message:
						progress.status === "GOAL_LOCKED"
							? "Attendance obligation goal locked."
							: progress.status === "BLOCKED"
								? progress.periodsProcessed === 0
									? "Attendance obligations pending because no open payroll period exists."
									: "Attendance obligations require imported employee schedule assignments."
								: "Materializing attendance obligation batches.",
					counts: progress,
				}),
		});
		await params.onProgress?.({
			stepCode: "DM3.2.attendance_obligations",
			eventType: "MATERIALIZATION_COMPLETED",
			status: materialization.status === "BLOCKED" ? "BLOCKED" : "COMPLETED",
			message:
				materialization.blockerReason ||
				`Attendance obligations ready: ${Number(materialization.existingAfter || 0).toLocaleString()} rows verified.`,
			counts: materialization,
		});
		(summary as any).attendanceObligations = materialization;
		if (materialization.status !== "BLOCKED") {
			await prepareDraftHeadersForImportedEmployees();
		}
	} else {
		const materialization = {
			status: "BLOCKED",
			blockerReason: "0 attendance obligations created because no schedule assignments were imported.",
			periodsProcessed: 0,
			employeesWithSchedules: 0,
			candidateRows: 0,
			inserted: 0,
			existingBefore: 0,
			existingAfter: 0,
			expectedScheduledEmployeeDays: 0,
			remainingScheduledGap: 0,
			skippedPayFrequency: 0,
			targetBatches: 0,
			processedBatches: 0,
		};
		await params.onProgress?.({
			stepCode: "DM3.2.attendance_obligations",
			eventType: "MATERIALIZATION_COMPLETED",
			status: "BLOCKED",
			message: materialization.blockerReason,
			counts: materialization,
		});
		(summary as any).attendanceObligations = materialization;
		await prepareDraftHeadersForImportedEmployees();
	}
	(summary as any).scheduleTemplatesCreated = repairedTemplates.created;
	(summary as any).scheduleTemplatesUpdated = repairedTemplates.updated;
	return summary;
}

async function importEmployeeDocuments(
	params: Dm3WorkbookImportParams,
	rows: Record<string, any>[],
	employeesByExternalId: Map<string, any>,
) {
	const summary = emptySummary(rows.length);
	if (rows.length === 0) return summary;
	const documentCodes = Array.from(new Set(rows.map((row) => String(row.DOCUMENT_TYPE_CODE || "").trim()).filter(Boolean)));
	const documentTypes = documentCodes.length
		? await (params.prisma as any).documentType.findMany({
				where: { organizationId: params.organizationId, isDeleted: false, OR: [{ code: { in: documentCodes } }, { name: { in: documentCodes } }] },
				select: { id: true, code: true, name: true },
			})
		: [];
	const documentTypesByKey = buildKeyMap(documentTypes, ["id", "code", "name"]);

	for (const [index, row] of rows.entries()) {
		const rowNumber = index + 2;
		const employeeExternalId = String(row.EMP_ID || "").trim();
		const documentTypeCode = String(row.DOCUMENT_TYPE_CODE || "").trim();
		const employee = employeesByExternalId.get(employeeExternalId);
		const documentType = documentTypesByKey.get(documentTypeCode.toUpperCase());
		if (!employee || !documentType) {
			summary.failed += 1;
			summary.errors.push({
				row: rowNumber,
				field: !employee ? "EMP_ID" : "DOCUMENT_TYPE_CODE",
				message: !employee ? `Employee ${employeeExternalId} was not found.` : `Document type ${documentTypeCode} was not found.`,
			});
			await params.onRowEvents?.([
				{
					stepCode: "DM3.4",
					eventType: "ROW_SKIPPED",
					status: "BLOCKED",
					message: !employee ? `Document skipped: employee ${employeeExternalId} was not found.` : `Document skipped for ${employeeExternalId}: type ${documentTypeCode} was not found.`,
					sourceSheet: "Employee Documents 201 Files",
					sourceRow: rowNumber,
					employeeId: employeeExternalId || null,
					metadata: { documentTypeCode },
				},
			]);
			continue;
		}
		const reviewStatus = normalizeEnum(row.STATUS, "APPROVED", ["PENDING", "APPROVED", "REJECTED", "CANCELLED"]);
		const existing = await (params.prisma as any).document.findFirst({
			where: { employeeId: employee.id, isDeleted: false, OR: [{ documentTypeId: documentType.id }, { type: documentType.code }] },
			select: { id: true, reviewStatus: true },
		});
		const payload = {
			name: documentType.name || documentType.code,
			type: documentType.code || documentType.name,
			number: String(row.DOCUMENT_NUMBER || "").trim() || `${documentType.code || documentType.name}-${employeeExternalId}`,
			issueDate: parseDateOnlyInput(row.ISSUE_DATE) || new Date(),
			expiryDate: parseDateOnlyInput(row.EXPIRY_DATE),
			documentTypeId: documentType.id,
			reviewStatus,
			reviewSource: "MIGRATION",
			reviewSubmittedAt: new Date(),
			reviewApprovedAt: reviewStatus === "APPROVED" ? new Date() : null,
			metadata: {
				source: "DM3.4 Employee Documents / 201 Files",
				sourceWorkbook: params.sourceWorkbook,
				sourceSheet: "Employee Documents 201 Files",
				sourceRow: rowNumber,
				notes: String(row.NOTES || "").trim() || null,
			},
		};
		const document = existing
			? await (params.prisma as any).document.update({ where: { id: existing.id }, data: payload })
			: await (params.prisma as any).document.create({ data: { ...payload, employeeId: employee.id } });
		if (!existing) {
			await (params.prisma as any).documentReviewEvent.create({
				data: {
					organizationId: params.organizationId,
					documentId: document.id,
					employeeId: employee.id,
					eventType: reviewStatus === "APPROVED" ? "APPROVED" : "SUBMITTED",
					fromStatus: null,
					toStatus: reviewStatus,
					source: "MIGRATION",
					comments: String(row.NOTES || "").trim() || null,
				},
			});
			summary.created += 1;
		} else {
			summary.updated += 1;
		}
		await params.onRowEvents?.([
			{
				stepCode: "DM3.4",
				eventType: "ROW_IMPORTED",
				status: "IMPORTING",
				message: `Document ${existing ? "updated" : "created"} for ${employeeExternalId}: ${documentType.code || documentType.name}`,
				sourceSheet: "Employee Documents 201 Files",
				sourceRow: rowNumber,
				employeeId: employeeExternalId,
				metadata: { documentTypeCode: documentType.code || documentType.name, reviewStatus },
			},
		]);
	}
	return summary;
}

function getLeaveBalancePeriod(asOfDate: Date) {
	const year = asOfDate.getUTCFullYear();
	return {
		periodStart: new Date(Date.UTC(year, 0, 1)),
		periodEnd: new Date(Date.UTC(year, 11, 31)),
	};
}

function dateOnly(date: Date) {
	return date.toISOString().slice(0, 10);
}

const payrollPeriodDateKey = (startDate: Date, endDate: Date) =>
	`${dateOnly(startDate)}:${dateOnly(endDate)}`;

function mergeOpeningLeaveBalance(existing: any, row: Record<string, any>, leaveType: any, asOfDate: Date, periodStart: Date, periodEnd: Date, sourceWorkbook: string, sourceRow: number) {
	const current = Array.isArray(existing) ? [...existing] : [];
	const leaveCode = String(leaveType.code || row.LEAVE_TYPE_CODE || "").trim().toUpperCase();
	const key = `${leaveCode}::${dateOnly(periodStart)}::${dateOnly(periodEnd)}`;
	const balance = parseMoneyInput(row.BALANCE);
	const next = {
		leaveType: leaveCode,
		leaveTypeId: leaveType.id,
		leaveTypeCode: leaveCode,
		leaveTypeName: leaveType.name,
		totalEntitled: balance,
		used: 0,
		pending: 0,
		available: balance,
		carriedOver: null,
		maxCarryOver: null,
		balance,
		asOfDate: dateOnly(asOfDate),
		periodStart: dateOnly(periodStart),
		periodEnd: dateOnly(periodEnd),
		source: "DM3.5 Opening Leave Balances",
		sourceWorkbook,
		sourceSheet: "Opening Leave Balances",
		sourceRow,
		notes: String(row.NOTES || "").trim() || null,
	};
	const filtered = current.filter((entry: any) => {
		const entryKey = [
			String(entry.leaveTypeCode || entry.leaveType || "").toUpperCase(),
			String(entry.periodStart || "").slice(0, 10),
			String(entry.periodEnd || "").slice(0, 10),
		].join("::");
		return entryKey !== key;
	});
	filtered.push(next);
	return filtered;
}

export async function importOpeningLeaveBalances(
	params: Dm3WorkbookImportParams,
	rows: Record<string, any>[],
	employeesByExternalId: Map<string, any>,
) {
	const summary = emptySummary(rows.length);
	if (rows.length === 0) return summary;
	const leaveCodes = Array.from(new Set(rows.map((row) => String(row.LEAVE_TYPE_CODE || "").trim().toUpperCase()).filter(Boolean)));
	const leaveTypes = leaveCodes.length
		? await (params.prisma as any).leaveType.findMany({
				where: { organizationId: params.organizationId, code: { in: leaveCodes } },
				select: { id: true, code: true, name: true },
			})
		: [];
	const leaveTypesByCode = new Map<string, any>(
		leaveTypes.map((leaveType: any) => [String(leaveType.code || "").toUpperCase(), leaveType]),
	);
	const touchedEmployees = new Map<string, { employee: any; leaveBalances: any[] }>();

	for (const [index, row] of rows.entries()) {
		const rowNumber = index + 2;
		const employeeExternalId = String(row.EMP_ID || "").trim();
		const leaveTypeCode = String(row.LEAVE_TYPE_CODE || "").trim().toUpperCase();
		const balance = parseMoneyInput(row.BALANCE);
		const asOfDate = parseDateOnlyInput(row.AS_OF_DATE) || new Date();
		const employee = employeesByExternalId.get(employeeExternalId);
		const leaveType = leaveTypesByCode.get(leaveTypeCode);
		if (!employee || !leaveType || balance <= 0) {
			summary.failed += 1;
			summary.errors.push({
				row: rowNumber,
				field: !employee ? "EMP_ID" : !leaveType ? "LEAVE_TYPE_CODE" : "BALANCE",
				message: !employee
					? `Employee ${employeeExternalId} was not found.`
					: !leaveType
						? `Leave type ${leaveTypeCode} was not found.`
						: "BALANCE must be greater than 0.",
			});
			await params.onRowEvents?.([
				{
					stepCode: "DM3.5",
					eventType: "ROW_SKIPPED",
					status: "BLOCKED",
					message: !employee
						? `Opening leave balance skipped: employee ${employeeExternalId} was not found.`
						: !leaveType
							? `Opening leave balance skipped for ${employeeExternalId}: leave type ${leaveTypeCode} was not found.`
							: `Opening leave balance skipped for ${employeeExternalId}: BALANCE must be greater than 0.`,
					sourceSheet: "Opening Leave Balances",
					sourceRow: rowNumber,
					employeeId: employeeExternalId || null,
					metadata: { leaveTypeCode, balance },
				},
			]);
			continue;
		}
		const { periodStart, periodEnd } = getLeaveBalancePeriod(asOfDate);
		const existing = await (params.prisma as any).employeeLeaveBalance.findUnique({
			where: {
				organizationId_employeeId_leaveTypeId_periodStart_periodEnd: {
					organizationId: params.organizationId,
					employeeId: employee.id,
					leaveTypeId: leaveType.id,
					periodStart,
					periodEnd,
				},
			},
			select: { id: true },
		});
		const payload = {
			leaveTypeCodeSnapshot: leaveType.code,
			leaveTypeNameSnapshot: leaveType.name,
			totalEntitled: balance,
			used: 0,
			pending: 0,
			available: balance,
			carriedOver: null,
			maxCarryOver: null,
		};
		if (existing) {
			await (params.prisma as any).employeeLeaveBalance.update({ where: { id: existing.id }, data: payload });
			summary.updated += 1;
		} else {
			await (params.prisma as any).employeeLeaveBalance.create({
				data: {
					organizationId: params.organizationId,
					employeeId: employee.id,
					leaveTypeId: leaveType.id,
					periodStart,
					periodEnd,
					...payload,
				},
			});
			summary.created += 1;
		}
		const nextLeaveBalances = mergeOpeningLeaveBalance(
			touchedEmployees.get(employee.id)?.leaveBalances ?? employee.leaveBalances,
			row,
			leaveType,
			asOfDate,
			periodStart,
			periodEnd,
			params.sourceWorkbook,
			rowNumber,
		);
		touchedEmployees.set(employee.id, { employee, leaveBalances: nextLeaveBalances });
		await params.onRowEvents?.([
			{
				stepCode: "DM3.5",
				eventType: "ROW_IMPORTED",
				status: "IMPORTING",
				message: `Opening leave balance ${existing ? "updated" : "created"} for ${employeeExternalId}: ${leaveType.code} ${balance}`,
				sourceSheet: "Opening Leave Balances",
				sourceRow: rowNumber,
				employeeId: employeeExternalId,
				metadata: { leaveTypeCode: leaveType.code, balance, asOfDate: dateOnly(asOfDate) },
			},
		]);
	}

	for (const { employee, leaveBalances } of touchedEmployees.values()) {
		await (params.prisma as any).employee.update({
			where: { id: employee.id },
			data: { leaveBalances, leaveBalancesLastUpdated: new Date() },
		});
	}
	return summary;
}

async function importEmployeeBenefitsLoans(
	params: Dm3WorkbookImportParams,
	rows: Record<string, any>[],
	employeesByExternalId: Map<string, any>,
) {
	const summary = emptySummary(rows.length);
	if (rows.length === 0) return summary;
	const codesOrNames = Array.from(new Set(rows.map((row) => String(row.CODE_OR_NAME || "").trim()).filter(Boolean)));
	const periodCodes = Array.from(new Set(rows.map((row) => String(row.PAYROLL_PERIOD_CODE || "").trim()).filter(Boolean)));
	const datePairs = Array.from(
		new Map(
			rows
				.map((row) => {
					const startDate = parseDateOnlyInput(row.START_DATE);
					const endDate = parseDateOnlyInput(row.END_DATE);
					return startDate && endDate
						? [payrollPeriodDateKey(startDate, endDate), { startDate, endDate }]
						: null;
				})
				.filter(Boolean) as Array<[string, { startDate: Date; endDate: Date }]>,
		).values(),
	);
	const [benefitTypes, loanTypes, payrollPeriodsByCode, payrollPeriodsByDates] = await Promise.all([
		codesOrNames.length
			? (params.prisma as any).benefitType.findMany({
					where: { organizationId: params.organizationId, isDeleted: false, OR: [{ code: { in: codesOrNames } }, { name: { in: codesOrNames } }] },
					select: { id: true, code: true, name: true, defaultInstallments: true },
				})
			: [],
		codesOrNames.length
			? (params.prisma as any).loanType.findMany({
					where: { organizationId: params.organizationId, isDeleted: false, name: { in: codesOrNames } },
					select: { id: true, name: true, interestRate: true, maxTermMonths: true },
				})
			: [],
		periodCodes.length
			? (params.prisma as any).payrollPeriod.findMany({
					where: {
						organizationId: params.organizationId,
						isDeleted: false,
						OR: [{ code: { in: periodCodes } }, { id: { in: periodCodes } }],
					},
					select: { id: true, code: true, startDate: true, endDate: true },
				})
			: [],
		datePairs.length
			? (params.prisma as any).payrollPeriod.findMany({
					where: {
						organizationId: params.organizationId,
						isDeleted: false,
						OR: datePairs.map((pair) => ({ startDate: pair.startDate, endDate: pair.endDate })),
					},
					select: { id: true, code: true, startDate: true, endDate: true },
				})
			: [],
	]);
	const benefitTypesByKey = buildKeyMap(benefitTypes, ["id", "code", "name"]);
	const loanTypesByKey = buildKeyMap(loanTypes, ["id", "name"]);
	const payrollPeriodsByKey = buildKeyMap(payrollPeriodsByCode, ["id", "code"]);
	for (const payrollPeriod of payrollPeriodsByDates as any[]) {
		payrollPeriodsByKey.set(payrollPeriodDateKey(payrollPeriod.startDate, payrollPeriod.endDate), payrollPeriod);
	}

	for (const [index, row] of rows.entries()) {
		const rowNumber = index + 2;
		const employeeExternalId = String(row.EMP_ID || "").trim();
		const entryType = String(row.TYPE || "").trim().toUpperCase();
		const codeOrName = String(row.CODE_OR_NAME || "").trim();
		const employee = employeesByExternalId.get(employeeExternalId);
		if (!employee || !entryType || !codeOrName) {
			summary.failed += 1;
			summary.errors.push({
				row: rowNumber,
				field: !employee ? "EMP_ID" : !entryType ? "TYPE" : "CODE_OR_NAME",
				message: !employee ? `Employee ${employeeExternalId} was not found.` : "TYPE and CODE_OR_NAME are required.",
			});
			await params.onRowEvents?.([
				{
					stepCode: "DM3.6",
					eventType: "ROW_SKIPPED",
					status: "BLOCKED",
					message: !employee ? `Benefit/loan skipped: employee ${employeeExternalId} was not found.` : `Benefit/loan skipped for ${employeeExternalId}: TYPE and CODE_OR_NAME are required.`,
					sourceSheet: "Employee Benefits Loans",
					sourceRow: rowNumber,
					employeeId: employeeExternalId || null,
					metadata: { entryType, codeOrName },
				},
			]);
			continue;
		}
		const amount = parseMoneyInput(row.AMOUNT);
		const startDate = parseDateOnlyInput(row.START_DATE) || new Date();
		const installments = parsePositiveIntInput(row.INSTALLMENTS, 1);
		const endDate = parseDateOnlyInput(row.END_DATE) || addMonths(startDate, installments);
		const payrollPeriodCode = String(row.PAYROLL_PERIOD_CODE || "").trim();
		const payrollPeriod = payrollPeriodCode
			? payrollPeriodsByKey.get(payrollPeriodCode.toUpperCase())
			: payrollPeriodsByKey.get(payrollPeriodDateKey(startDate, endDate));
		if (payrollPeriodCode && !payrollPeriod) {
			summary.failed += 1;
			summary.errors.push({ row: rowNumber, field: "PAYROLL_PERIOD_CODE", message: `Payroll period ${payrollPeriodCode} was not found.` });
			await params.onRowEvents?.([
				{
					stepCode: "DM3.6",
					eventType: "ROW_SKIPPED",
					status: "BLOCKED",
					message: `Benefit/loan skipped for ${employeeExternalId}: payroll period ${payrollPeriodCode} was not found.`,
					sourceSheet: "Employee Benefits Loans",
					sourceRow: rowNumber,
					employeeId: employeeExternalId,
					metadata: { entryType, codeOrName, payrollPeriodCode },
				},
			]);
			continue;
		}
		const notes = String(row.NOTES || "").trim() || null;

		if (entryType === "BENEFIT") {
			const benefitType = benefitTypesByKey.get(codeOrName.toUpperCase());
			if (!benefitType) {
				summary.failed += 1;
				summary.errors.push({ row: rowNumber, field: "CODE_OR_NAME", message: `Benefit type ${codeOrName} was not found.` });
				continue;
			}
			const existing = await (params.prisma as any).employeeBenefit.findFirst({
				where: {
					organizationId: params.organizationId,
					employeeId: employee.id,
					benefitTypeId: benefitType.id,
					isDeleted: false,
					...(payrollPeriod
						? { OR: [{ payrollPeriodId: payrollPeriod.id }, { startDate, endDate }] }
						: { startDate, endDate }),
				},
				select: { id: true },
			});
			const totalInstallments = installments || Number(benefitType.defaultInstallments || 1);
			const payload = {
				name: benefitType.name,
				totalAmount: amount,
				totalInstallments,
				installmentAmount: totalInstallments > 0 ? amount / totalInstallments : amount,
				remainingBalance: amount,
				amount,
				payrollPeriodId: payrollPeriod?.id,
				startDate,
				endDate,
				status: normalizeEnum(row.STATUS, "ACTIVE", ["PENDING", "APPROVED", "ACTIVE", "COMPLETED", "CANCELLED", "DEFAULTED"]),
				notes,
				remarks: notes,
			};
			if (existing) {
				await (params.prisma as any).employeeBenefit.update({ where: { id: existing.id }, data: payload });
				summary.updated += 1;
			} else {
				await (params.prisma as any).employeeBenefit.create({
					data: { ...payload, organizationId: params.organizationId, employeeId: employee.id, benefitTypeId: benefitType.id, currency: "PHP" },
				});
				summary.created += 1;
			}
			await params.onRowEvents?.([
				{
					stepCode: "DM3.6",
					eventType: "ROW_IMPORTED",
					status: "IMPORTING",
					message: `Benefit ${existing ? "updated" : "created"} for ${employeeExternalId}: ${benefitType.name}`,
					sourceSheet: "Employee Benefits Loans",
					sourceRow: rowNumber,
					employeeId: employeeExternalId,
					metadata: { type: "BENEFIT", codeOrName, amount, payrollPeriodId: payrollPeriod?.id || null },
				},
			]);
			continue;
		}

		if (entryType === "LOAN") {
			const loanType = loanTypesByKey.get(codeOrName.toUpperCase());
			if (!loanType) {
				summary.failed += 1;
				summary.errors.push({ row: rowNumber, field: "CODE_OR_NAME", message: `Loan type ${codeOrName} was not found.` });
				continue;
			}
			const existing = await (params.prisma as any).employeeLoan.findFirst({
				where: { organizationId: params.organizationId, employeeId: employee.id, loanTypeId: loanType.id, isDeleted: false },
				select: { id: true },
			});
			const termMonths = installments || Number(loanType.maxTermMonths || 1);
			const totalAmount = amount;
			const payload = {
				principalAmount: amount,
				interestRate: Number(loanType.interestRate || 0),
				totalAmount,
				termMonths,
				monthlyPayment: termMonths > 0 ? totalAmount / termMonths : totalAmount,
				startDate,
				endDate,
				balance: totalAmount,
				status: normalizeEnum(row.STATUS, "ACTIVE", ["PENDING", "APPROVED", "ACTIVE", "PAID", "DEFAULTED", "CANCELLED"]),
				notes,
			};
			if (existing) {
				await (params.prisma as any).employeeLoan.update({ where: { id: existing.id }, data: payload });
				summary.updated += 1;
			} else {
				await (params.prisma as any).employeeLoan.create({
					data: { ...payload, organizationId: params.organizationId, employeeId: employee.id, loanTypeId: loanType.id },
				});
				summary.created += 1;
			}
			await params.onRowEvents?.([
				{
					stepCode: "DM3.6",
					eventType: "ROW_IMPORTED",
					status: "IMPORTING",
					message: `Loan ${existing ? "updated" : "created"} for ${employeeExternalId}: ${loanType.name}`,
					sourceSheet: "Employee Benefits Loans",
					sourceRow: rowNumber,
					employeeId: employeeExternalId,
					metadata: { type: "LOAN", codeOrName, amount, termMonths },
				},
			]);
			continue;
		}

		summary.failed += 1;
		summary.errors.push({ row: rowNumber, field: "TYPE", message: "TYPE must be BENEFIT or LOAN." });
		await params.onRowEvents?.([
			{
				stepCode: "DM3.6",
				eventType: "ROW_SKIPPED",
				status: "BLOCKED",
				message: `Benefit/loan skipped for ${employeeExternalId}: TYPE must be BENEFIT or LOAN.`,
				sourceSheet: "Employee Benefits Loans",
				sourceRow: rowNumber,
				employeeId: employeeExternalId,
				metadata: { entryType, codeOrName },
			},
		]);
	}
	return summary;
}
