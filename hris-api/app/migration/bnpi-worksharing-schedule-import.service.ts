/**
 * DM3.2 operator upload: BNPI WorkSharingSchedule → employee schedule assignments.
 */

import type { PrismaClient } from "../../generated/prisma";
import { ensureDm3ScheduleBackedAttendanceObligations } from "../../helper/dm3-attendance-obligation-repair.helper";
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
import {
	buildWorkSharingAssignmentNotes,
	parseWorkSharingScheduleWorkbook,
	parseWorkSharingShiftWindow,
	toWorkSharingDateKey,
	type WorkSharingDayAssignment,
	type WorkSharingDayOffAssignment,
	type WorkSharingSourceAssignment,
} from "../../helper/bnpi-worksharing-schedule-import.helper";
import {
	MASS_UPLOAD_HTTP_ERROR_CAP,
	MASS_UPLOAD_HTTP_RESULT_CAP,
	persistDm3ImportActivityLog,
	type MassUploadRowError,
	type MassUploadRowResult,
} from "./bnpi-mass-upload-import.service";

export type WorkSharingScheduleImportSummary = {
	kind: "worksharing-schedule";
	total: number;
	created: number;
	updated: number;
	skipped: number;
	failed: number;
	errors: MassUploadRowError[];
	results?: MassUploadRowResult[];
	errorTotal?: number;
	resultTotal?: number;
	errorsTruncated?: boolean;
	resultsTruncated?: boolean;
	importLogId?: string;
	sourceFilename?: string;
	startedAt?: string;
	finishedAt?: string;
	durationMs?: number;
	status?: "completed" | "partial" | "failed";
	sheetName?: string;
	effectiveFrom?: string;
	effectiveTo?: string;
	scheduleTemplatesCreated?: number;
	scheduleTemplatesUpdated?: number;
	shiftTypesCreated?: number;
	shiftTypesUpdated?: number;
	attendanceObligationsRefreshed?: number;
	attendanceObligationsInserted?: number;
	attendanceObligationRemainingGap?: number;
	/** Day-level schedule_overrides written from WorkSharing date flags. */
	dayOverridesCreated?: number;
	dayOverridesUpdated?: number;
	/** Flag=0 days written as isOff REST overrides. */
	dayOffOverridesCreated?: number;
	dayOffOverridesUpdated?: number;
	dayAssignmentsParsed?: number;
};

function resolveImportStatus(summary: {
	total: number;
	created: number;
	updated: number;
	failed: number;
}): "completed" | "partial" | "failed" {
	if (summary.failed > 0 && summary.created + summary.updated === 0 && summary.total > 0) {
		return "failed";
	}
	if (summary.failed > 0) return "partial";
	return "completed";
}

function buildOffDaySnapshot() {
	return {
		name: "Off day",
		code: "OFF",
		isOvernight: false,
		isOff: true,
		shiftHour: 0,
		timeSlots: [],
	};
}

async function ensureWorkSharingShiftAndTemplate(
	prisma: PrismaClient,
	params: {
		organizationId: string;
		assignment: WorkSharingSourceAssignment;
		sourceFilename: string;
	},
): Promise<{
	template: any;
	shiftCreated: boolean;
	shiftUpdated: boolean;
	templateCreated: boolean;
	templateUpdated: boolean;
}> {
	const window = parseWorkSharingShiftWindow(params.assignment.shiftLabel);
	if (!window) {
		throw new Error(`Unsupported shift label "${params.assignment.shiftLabel}"`);
	}

	const shiftPayload = {
		organizationId: params.organizationId,
		name: params.assignment.shiftLabel,
		code: params.assignment.shiftCode,
		isOvernight: window.endTime <= window.startTime,
		isOff: false,
		isActive: true,
		isDeleted: false,
		timeSlots: buildNonOverlappingWorkBreakSlots({
			startTime: window.startTime,
			endTime: window.endTime,
			breakStartTime: null,
			breakEndTime: null,
			workWindows: [window],
			breakWindows: [],
		}),
	};
	const shiftHour = calculateShiftHour(shiftPayload);
	const existingShift = await (prisma as any).shiftType.findUnique({
		where: {
			organizationId_code: {
				organizationId: params.organizationId,
				code: params.assignment.shiftCode,
			},
		},
		select: { id: true },
	});
	const shiftType = await (prisma as any).shiftType.upsert({
		where: {
			organizationId_code: {
				organizationId: params.organizationId,
				code: params.assignment.shiftCode,
			},
		},
		update: {
			name: shiftPayload.name,
			isOvernight: shiftPayload.isOvernight,
			isOff: false,
			isActive: true,
			isDeleted: false,
			timeSlots: shiftPayload.timeSlots,
			shiftHour,
		},
		create: {
			...shiftPayload,
			shiftHour,
		},
	});

	const rawPattern = Array.from({ length: 7 }, (_, index) =>
		index < 6
			? { day: index + 1, shiftTypeId: shiftType.id, shiftSnapshot: null }
			: { day: index + 1, shiftTypeId: null, shiftSnapshot: buildOffDaySnapshot() },
	);
	const pattern = await copyShiftTypeToTemplatePatternDay(prisma, {
		organizationId: params.organizationId,
		pattern: rawPattern,
	});
	const totalHour = pattern.reduce(
		(total: number, day: any) => total + Math.max(0, Number(day.shiftHour || 0)),
		0,
	);
	const totalDay = pattern.filter((day: any) => Number(day.shiftHour || 0) > 0).length;
	const existingTemplate = await (prisma as any).scheduleTemplate.findUnique({
		where: {
			organizationId_code: {
				organizationId: params.organizationId,
				code: params.assignment.scheduleCode,
			},
		},
		select: { id: true },
	});
	const template = await (prisma as any).scheduleTemplate.upsert({
		where: {
			organizationId_code: {
				organizationId: params.organizationId,
				code: params.assignment.scheduleCode,
			},
		},
		update: {
			name: `BNPI Mon-Sat ${params.assignment.shiftLabel}`,
			description: `DM3.2 WorkSharing recurring schedule template (${params.sourceFilename})`,
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
			code: params.assignment.scheduleCode,
			name: `BNPI Mon-Sat ${params.assignment.shiftLabel}`,
			description: `DM3.2 WorkSharing recurring schedule template (${params.sourceFilename})`,
			cycleDays: 7,
			graceLateMinutes: 0,
			graceEarlyOutMinutes: 0,
			pattern,
			totalHour,
			totalDay,
			isActive: true,
			isDeleted: false,
		},
		select: {
			id: true,
			code: true,
			name: true,
			cycleDays: true,
			graceLateMinutes: true,
			graceEarlyOutMinutes: true,
			pattern: true,
		},
	});

	return {
		template,
		shiftCreated: !existingShift,
		shiftUpdated: Boolean(existingShift),
		templateCreated: !existingTemplate,
		templateUpdated: Boolean(existingTemplate),
	};
}

export async function importWorkSharingScheduleUpload(params: {
	prisma: PrismaClient;
	organizationId: string;
	buffer: Buffer;
	sourceFilename?: string;
	migrationRunId?: string | null;
	startedByUserId?: string | null;
	persistLog?: boolean;
}): Promise<WorkSharingScheduleImportSummary> {
	const startedAt = new Date();
	const sourceFilename = params.sourceFilename || "WorkSharingSchedule.xlsx";
	const parsed = parseWorkSharingScheduleWorkbook(params.buffer);

	const summary: WorkSharingScheduleImportSummary = {
		kind: "worksharing-schedule",
		total: parsed.assignments.length,
		created: 0,
		updated: 0,
		skipped: 0,
		failed: 0,
		errors: [],
		sourceFilename,
		sheetName: parsed.sheetName,
		effectiveFrom: parsed.effectiveFrom,
		effectiveTo: parsed.effectiveTo,
		scheduleTemplatesCreated: 0,
		scheduleTemplatesUpdated: 0,
		shiftTypesCreated: 0,
		shiftTypesUpdated: 0,
		attendanceObligationsRefreshed: 0,
		attendanceObligationsInserted: 0,
		attendanceObligationRemainingGap: 0,
	};
	const allErrors: MassUploadRowError[] = [];
	const allResults: MassUploadRowResult[] = [];

	// Count parser-level skips (duplicates / bad shifts) as skipped, not failures.
	for (const skip of parsed.skippedRows) {
		if (skip.reason === "empty_or_total_row") continue;
		summary.skipped += 1;
		allResults.push({
			row: skip.row,
			action: "skipped",
			message: skip.reason,
		});
	}

	summary.dayAssignmentsParsed = parsed.dayAssignments?.length || 0;
	summary.dayOverridesCreated = 0;
	summary.dayOverridesUpdated = 0;

	const uniqueBySchedule = new Map<string, WorkSharingSourceAssignment>();
	for (const assignment of parsed.assignments) {
		if (!uniqueBySchedule.has(assignment.scheduleCode)) {
			uniqueBySchedule.set(assignment.scheduleCode, assignment);
		}
	}
	// Also ensure templates for day-only shifts that are not the majority primary.
	for (const day of parsed.dayAssignments || []) {
		if (uniqueBySchedule.has(day.scheduleCode)) continue;
		uniqueBySchedule.set(day.scheduleCode, {
			employeeExternalId: day.employeeExternalId,
			sourceEmployeeId: day.sourceEmployeeId,
			employeeName: day.employeeName,
			department: day.department,
			division: day.division,
			position: day.position,
			shiftLabel: day.shiftLabel,
			shiftCode: day.shiftCode,
			scheduleCode: day.scheduleCode,
			effectiveFrom: day.date,
			effectiveTo: day.date,
			sourceSheet: day.sourceSheet,
			sourceRow: day.sourceRow,
			activeDates: [day.dateKey],
		});
	}

	const templatesByCode = new Map<string, any>();
	for (const assignment of uniqueBySchedule.values()) {
		const ensured = await ensureWorkSharingShiftAndTemplate(params.prisma, {
			organizationId: params.organizationId,
			assignment,
			sourceFilename,
		});
		templatesByCode.set(assignment.scheduleCode, ensured.template);
		if (ensured.shiftCreated) summary.shiftTypesCreated = (summary.shiftTypesCreated || 0) + 1;
		if (ensured.shiftUpdated) summary.shiftTypesUpdated = (summary.shiftTypesUpdated || 0) + 1;
		if (ensured.templateCreated) {
			summary.scheduleTemplatesCreated = (summary.scheduleTemplatesCreated || 0) + 1;
		}
		if (ensured.templateUpdated) {
			summary.scheduleTemplatesUpdated = (summary.scheduleTemplatesUpdated || 0) + 1;
		}
	}

	const employeeIds = Array.from(
		new Set(parsed.assignments.map((row) => row.employeeExternalId)),
	);
	const employees = employeeIds.length
		? await params.prisma.employee.findMany({
				where: {
					organizationId: params.organizationId,
					isDeleted: false,
					employeeId: { in: employeeIds },
				},
				select: {
					id: true,
					employeeId: true,
					embeddedSchedule: true,
				},
			})
		: [];
	const employeesByExternalId = new Map(
		employees.map((employee) => [String(employee.employeeId), employee]),
	);

	const affectedEmployeeIds = new Set<string>();

	for (const assignment of parsed.assignments) {
		const employee = employeesByExternalId.get(assignment.employeeExternalId);
		if (!employee) {
			summary.skipped += 1;
			const message = `Employee ${assignment.employeeExternalId} was not found. Import DM3 employees first, then rerun WorkSharing schedule upload.`;
			allErrors.push({
				row: assignment.sourceRow,
				employeeId: assignment.employeeExternalId,
				field: "Employeeid",
				message,
			});
			allResults.push({
				row: assignment.sourceRow,
				employeeId: assignment.employeeExternalId,
				action: "skipped",
				field: "Employeeid",
				message,
			});
			continue;
		}

		const template = templatesByCode.get(assignment.scheduleCode);
		if (!template) {
			summary.failed += 1;
			const message = `Schedule template ${assignment.scheduleCode} was not available.`;
			allErrors.push({
				row: assignment.sourceRow,
				employeeId: assignment.employeeExternalId,
				field: "Shift",
				message,
			});
			allResults.push({
				row: assignment.sourceRow,
				employeeId: assignment.employeeExternalId,
				action: "failed",
				field: "Shift",
				message,
			});
			continue;
		}

		const notes = buildWorkSharingAssignmentNotes(assignment);
		const previousEmbeddedSchedule = employee.embeddedSchedule || null;
		const nextEmbeddedSchedule = copyTemplateToEmployeeEmbeddedSchedule({
			template,
			effectiveStartDate: assignment.effectiveFrom,
			effectiveEndDate: assignment.effectiveTo,
			reason: notes,
			version: Number((previousEmbeddedSchedule as any)?.version || 0) + 1,
		});

		if (isSameEmployeeScheduleAssignment(previousEmbeddedSchedule, nextEmbeddedSchedule)) {
			const previousReason = String((previousEmbeddedSchedule as any)?.reason || "").trim();
			const nextReason = String((nextEmbeddedSchedule as any)?.reason || "").trim();
			if (previousReason !== nextReason) {
				const refreshedSchedule = {
					...(previousEmbeddedSchedule as any),
					reason: (nextEmbeddedSchedule as any).reason,
					assignedAt: (nextEmbeddedSchedule as any).assignedAt,
					effectiveEndDate: (nextEmbeddedSchedule as any).effectiveEndDate,
					version: Number((previousEmbeddedSchedule as any)?.version || 0) + 1,
				};
				await params.prisma.employee.update({
					where: { id: employee.id },
					data: { embeddedSchedule: refreshedSchedule as any },
				});
				await appendEmployeeScheduleHistory(params.prisma, {
					organizationId: params.organizationId,
					employeeId: employee.id,
					action: "reassigned",
					reason: nextReason || "DM3.2 WorkSharing schedule source evidence refresh",
					effectiveAt: assignment.effectiveFrom,
					beforeSchedule: previousEmbeddedSchedule,
					afterSchedule: refreshedSchedule,
					metadata: {
						sourceWorkbook: sourceFilename,
						sourceSheet: assignment.sourceSheet,
						sourceRow: assignment.sourceRow,
						effectiveFrom: toWorkSharingDateKey(assignment.effectiveFrom),
						effectiveTo: toWorkSharingDateKey(assignment.effectiveTo),
						shift: assignment.shiftLabel,
						reason: "same_timeslot_source_refreshed",
					},
				});
				summary.updated += 1;
				(employee as any).embeddedSchedule = refreshedSchedule;
				allResults.push({
					row: assignment.sourceRow,
					employeeId: assignment.employeeExternalId,
					code: assignment.scheduleCode,
					action: "updated",
					message: "Source evidence refreshed (same schedule window)",
				});
			} else {
				summary.skipped += 1;
				allResults.push({
					row: assignment.sourceRow,
					employeeId: assignment.employeeExternalId,
					code: assignment.scheduleCode,
					action: "skipped",
					message: "Already assigned with same schedule",
				});
			}
			affectedEmployeeIds.add(employee.id);
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
			reason: notes,
			effectiveAt: assignment.effectiveFrom,
			beforeSchedule: previousEmbeddedSchedule,
			afterSchedule: nextEmbeddedSchedule,
			metadata: {
				sourceWorkbook: sourceFilename,
				sourceSheet: assignment.sourceSheet,
				sourceRow: assignment.sourceRow,
				sourceEmployeeId: assignment.sourceEmployeeId,
				employeeName: assignment.employeeName,
				department: assignment.department,
				division: assignment.division,
				position: assignment.position,
				shift: assignment.shiftLabel,
				effectiveFrom: toWorkSharingDateKey(assignment.effectiveFrom),
				effectiveTo: toWorkSharingDateKey(assignment.effectiveTo),
			},
		});

		if (previousEmbeddedSchedule) {
			summary.updated += 1;
			allResults.push({
				row: assignment.sourceRow,
				employeeId: assignment.employeeExternalId,
				code: assignment.scheduleCode,
				action: "updated",
				message: `Reassigned to ${assignment.scheduleCode}`,
			});
		} else {
			summary.created += 1;
			allResults.push({
				row: assignment.sourceRow,
				employeeId: assignment.employeeExternalId,
				code: assignment.scheduleCode,
				action: "created",
				message: `Assigned ${assignment.scheduleCode}`,
			});
		}
		affectedEmployeeIds.add(employee.id);
		(employee as any).embeddedSchedule = nextEmbeddedSchedule;
	}

	// Day-level overrides from WorkSharing date flags (Option A: shortfall uses day shift).
	// resolveEffectiveShift prefers schedule_overrides over embedded Mon-Sat template.
	const dayAssignments: WorkSharingDayAssignment[] = parsed.dayAssignments || [];
	if (dayAssignments.length > 0) {
		const shiftTypes = await (params.prisma as any).shiftType.findMany({
			where: {
				organizationId: params.organizationId,
				isDeleted: false,
				code: {
					in: Array.from(new Set(dayAssignments.map((d) => d.shiftCode))),
				},
			},
			select: { id: true, code: true, name: true, timeSlots: true, isOff: true, isOvernight: true, shiftHour: true },
		});
		const shiftByCode = new Map<string, any>(shiftTypes.map((s: any) => [String(s.code), s]));

		for (const day of dayAssignments) {
			const employee = employeesByExternalId.get(day.employeeExternalId);
			if (!employee) continue;
			const shiftType = shiftByCode.get(day.shiftCode);
			if (!shiftType) continue;

			const dayDate = new Date(day.date);
			dayDate.setUTCHours(0, 0, 0, 0);
			const shiftSnapshot = {
				code: shiftType.code,
				name: shiftType.name,
				isOff: Boolean(shiftType.isOff),
				isOvernight: Boolean(shiftType.isOvernight),
				shiftHour: shiftType.shiftHour,
				timeSlots: shiftType.timeSlots,
				source: "WORKSHARING_DAY_FLAG",
				shiftLabel: day.shiftLabel,
			};
			const reason = `WorkSharing day flag: ${day.shiftLabel} (row ${day.sourceRow})`;

			const existing = await (params.prisma as any).scheduleOverride.findFirst({
				where: {
					organizationId: params.organizationId,
					employeeId: employee.id,
					date: dayDate,
					isDeleted: false,
				},
				select: { id: true },
			});

			if (existing?.id) {
				await (params.prisma as any).scheduleOverride.update({
					where: { id: existing.id },
					data: {
						shiftTypeId: shiftType.id,
						shiftSnapshot,
						reason,
						isDeleted: false,
					},
				});
				summary.dayOverridesUpdated = (summary.dayOverridesUpdated || 0) + 1;
			} else {
				try {
					await (params.prisma as any).scheduleOverride.create({
						data: {
							organizationId: params.organizationId,
							employeeId: employee.id,
							date: dayDate,
							shiftTypeId: shiftType.id,
							shiftSnapshot,
							reason,
							isDeleted: false,
						},
					});
					summary.dayOverridesCreated = (summary.dayOverridesCreated || 0) + 1;
				} catch {
					// Unique race: update
					await (params.prisma as any).scheduleOverride.updateMany({
						where: {
							organizationId: params.organizationId,
							employeeId: employee.id,
							date: dayDate,
						},
						data: {
							shiftTypeId: shiftType.id,
							shiftSnapshot,
							reason,
							isDeleted: false,
						},
					});
					summary.dayOverridesUpdated = (summary.dayOverridesUpdated || 0) + 1;
				}
			}
			affectedEmployeeIds.add(employee.id);
		}
	}

	// Explicit WorkSharing flag=0 → REST/OFF override (prevents empty-bio ABSENT on off days).
	const dayOffAssignments: WorkSharingDayOffAssignment[] =
		(parsed as { dayOffAssignments?: WorkSharingDayOffAssignment[] }).dayOffAssignments ||
		[];
	summary.dayOffOverridesCreated = 0;
	summary.dayOffOverridesUpdated = 0;
	for (const day of dayOffAssignments) {
		const employee = employeesByExternalId.get(day.employeeExternalId);
		if (!employee) continue;
		const dayDate = new Date(day.date);
		dayDate.setUTCHours(0, 0, 0, 0);
		const shiftSnapshot = {
			code: "WS_OFF",
			name: "WorkSharing Off",
			isOff: true,
			isOvernight: false,
			shiftHour: 0,
			timeSlots: [],
			source: "WORKSHARING_DAY_FLAG_OFF",
			reason: day.reason,
		};
		const existing = await (params.prisma as any).scheduleOverride.findFirst({
			where: {
				organizationId: params.organizationId,
				employeeId: employee.id,
				date: dayDate,
				isDeleted: false,
			},
			select: { id: true, shiftSnapshot: true },
		});
		// Do not clobber an on-day override (flag 1) if somehow both exist — on wins.
		const existingSource = String(
			(existing?.shiftSnapshot as { source?: string } | null)?.source || "",
		);
		if (existingSource === "WORKSHARING_DAY_FLAG") continue;

		if (existing?.id) {
			await (params.prisma as any).scheduleOverride.update({
				where: { id: existing.id },
				data: {
					shiftTypeId: null,
					shiftSnapshot,
					reason: day.reason,
					isDeleted: false,
				},
			});
			summary.dayOffOverridesUpdated += 1;
		} else {
			try {
				await (params.prisma as any).scheduleOverride.create({
					data: {
						organizationId: params.organizationId,
						employeeId: employee.id,
						date: dayDate,
						shiftTypeId: null,
						shiftSnapshot,
						reason: day.reason,
						isDeleted: false,
					},
				});
				summary.dayOffOverridesCreated += 1;
			} catch {
				await (params.prisma as any).scheduleOverride.updateMany({
					where: {
						organizationId: params.organizationId,
						employeeId: employee.id,
						date: dayDate,
					},
					data: {
						shiftTypeId: null,
						shiftSnapshot,
						reason: day.reason,
						isDeleted: false,
					},
				});
				summary.dayOffOverridesUpdated += 1;
			}
		}
		affectedEmployeeIds.add(employee.id);
	}

	if (affectedEmployeeIds.size > 0) {
		const materialization = await ensureDm3ScheduleBackedAttendanceObligations(params.prisma, {
			organizationId: params.organizationId,
			employeeIds: Array.from(affectedEmployeeIds),
			currentOnly: true,
		});
		summary.attendanceObligationsRefreshed = materialization.existingAfter;
		summary.attendanceObligationsInserted = materialization.inserted;
		summary.attendanceObligationRemainingGap = materialization.remainingScheduledGap;
	}

	const finishedAt = new Date();
	summary.status = resolveImportStatus(summary);
	summary.startedAt = startedAt.toISOString();
	summary.finishedAt = finishedAt.toISOString();
	summary.durationMs = Math.max(0, finishedAt.getTime() - startedAt.getTime());
	summary.errorTotal = allErrors.length;
	summary.resultTotal = allResults.length;
	summary.errorsTruncated = allErrors.length > MASS_UPLOAD_HTTP_ERROR_CAP;
	summary.resultsTruncated = allResults.length > MASS_UPLOAD_HTTP_RESULT_CAP;
	summary.errors = allErrors.slice(0, MASS_UPLOAD_HTTP_ERROR_CAP);
	summary.results = allResults.slice(0, MASS_UPLOAD_HTTP_RESULT_CAP);

	if (params.persistLog !== false) {
		const log = await persistDm3ImportActivityLog({
			prisma: params.prisma,
			organizationId: params.organizationId,
			kind: "worksharing-schedule",
			sourceFilename,
			migrationRunId: params.migrationRunId || null,
			startedByUserId: params.startedByUserId || null,
			startedAt,
			finishedAt,
			total: summary.total,
			created: summary.created,
			updated: summary.updated,
			skipped: summary.skipped,
			failed: summary.failed,
			status: summary.status,
			errors: allErrors,
			results: allResults,
			summaryExtra: {
				sheetName: summary.sheetName,
				effectiveFrom: summary.effectiveFrom,
				effectiveTo: summary.effectiveTo,
				scheduleTemplatesCreated: summary.scheduleTemplatesCreated,
				scheduleTemplatesUpdated: summary.scheduleTemplatesUpdated,
				shiftTypesCreated: summary.shiftTypesCreated,
				shiftTypesUpdated: summary.shiftTypesUpdated,
				attendanceObligationsRefreshed: summary.attendanceObligationsRefreshed,
				attendanceObligationsInserted: summary.attendanceObligationsInserted,
				attendanceObligationRemainingGap: summary.attendanceObligationRemainingGap,
			},
		});
		if (log?.id) summary.importLogId = log.id;
	}

	return summary;
}
