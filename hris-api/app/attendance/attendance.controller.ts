// @ts-nocheck
import { Request, Response, NextFunction } from "express";
import { PrismaClient, Prisma, type AttendanceStatus as PrismaAttendanceStatus } from "../../generated/prisma";
import { getLogger } from "../../helper/logger.helper";
import { transformFormDataToObject } from "../../helper/transformObject";
import { validateQueryParams } from "../../helper/validation-helper";
import {
	buildFilterConditions,
	buildFindManyQuery,
	buildSearchConditions,
	getNestedFields,
	normalizeAndValidateFieldSelection,
} from "../../helper/query-builder.helper";
import { buildSuccessResponse, buildPagination } from "../../helper/success-handler.helper";
import { groupDataByField } from "../../helper/dataGrouping";
import { buildErrorResponse, formatZodErrors } from "../../helper/error-handler";
import {
	CreateAttendanceCorrectionSchema,
	CreateAttendanceBackfillSchema,
	CreateAttendanceSchema,
	UpdateAttendanceSchema,
} from "../../zod/attendance.zod";
import {
	applyAttendanceCorrection,
	AttendanceCorrectionError,
} from "./attendance-correction.service";
import { applyAttendanceBackfill } from "./attendance-backfill.service";
import { logActivity } from "../../utils/activityLogger";
import { logAudit } from "../../utils/auditLogger";
import { config } from "../../config/constant";
import { redisClient } from "../../config/redis";
import { invalidateCache } from "../../middleware/cache";
import { findShiftForDay, validateAttendanceTime } from "../../helper/schedule.helper";
import {
	calculateTimekeeping,
	formatMinutesAsTime,
	determineAttendanceStatus,
	deriveBehaviorFlags,
} from "../../helper/timekeeping.helper";
import { resolveOvertimePolicyApplication } from "../../helper/overtime-approval.helper";
import * as XLSX from "xlsx";
import { AuthRequest } from "../../middleware/verifyToken";
import { resolveCallerAgencyId, agencyScopeWhere } from "../../helper/agency-scope.helper";
import { AttendanceImportService } from "./attendance-import.service";
import {
	buildAttendanceLedgerSummary,
	buildAttendanceTimekeepingFields,
	fetchAttendanceEmployeeSnapshotFields,
	getEffectiveAttendanceRecordsForRange,
	normalizeToEndOfDay,
	normalizeToStartOfDay,
} from "../../helper/attendance.helper";
import { resolveEffectiveShift } from "../../helper/employee-schedule.helper";
import { refreshTimesheetForAttendanceDate } from "../../helper/timesheet.helper";
import { applyAttendanceToObligation } from "../../helper/attendance-obligation.helper";
import { emitAttendanceRealtimeEvent } from "../../helper/attendance-realtime.helper";
import {
	publishMissingPunchReminderNotification,
	sweepMissingPunchNotifications,
} from "../../helper/missing-punch-reminder.helper";

const logger = getLogger();
const attendanceLogger = logger.child({ module: "attendance" });

const ATTENDANCE_DERIVED_FIELD_ROOTS = [
	"hasCorrection",
	"rawAttendanceId",
	"effectiveAttendanceId",
	"rawAttendance",
	"effectiveAttendance",
	"attendanceHistory",
];

const ATTENDANCE_INTERNAL_QUERY_FIELDS = ["id", "organizationId", "employeeId", "date", "ledgerType"];

const getSanitizedAttendanceFields = (fields?: string) => {
	const normalizedFieldSelection = normalizeAndValidateFieldSelection("Attendance", fields, {}, {
		derivedRoots: ATTENDANCE_DERIVED_FIELD_ROOTS,
	});

	if (normalizedFieldSelection.errors.length > 0) {
		return {
			error: buildErrorResponse(
				normalizedFieldSelection.errors.join(" "),
				400,
				normalizedFieldSelection.errors,
			),
		};
	}

	const sanitizedFields = normalizedFieldSelection.normalizedFields
		?.split(",")
		.map((field) => field.trim())
		.filter(Boolean)
		.filter((field) => !ATTENDANCE_DERIVED_FIELD_ROOTS.includes(field));

	const normalizedQueryFields = sanitizedFields?.length
		? Array.from(new Set([...sanitizedFields, ...ATTENDANCE_INTERNAL_QUERY_FIELDS])).join(",")
		: undefined;

	return {
		fields: normalizedQueryFields,
	};
};

/**
 * Get employee's schedule for a specific date
 * Simplified version - just fetches the schedule without complex night shift logic
 */
async function getEmployeeScheduleForDate(
	prisma: PrismaClient,
	organizationId: string,
	employeeId: string,
	date: Date,
): Promise<{ schedule: any; dayOfWeek: number; dayLabel: string } | null> {
	try {
		const resolvedShift = await resolveEffectiveShift(prisma, {
			organizationId,
			employeeId,
			date,
		});
		if (!resolvedShift) {
			return null;
		}

		const dayOfWeek = date.getUTCDay(); // 0 = Sunday, 6 = Saturday
		const dayNames = [
			"Sunday",
			"Monday",
			"Tuesday",
			"Wednesday",
			"Thursday",
			"Friday",
			"Saturday",
		];
		const dayLabel = dayNames[dayOfWeek];

		return {
			schedule: resolvedShift,
			dayOfWeek,
			dayLabel,
		};
	} catch (error) {
		attendanceLogger.error(`Error getting schedule for employee ${employeeId}:`, error);
		return null;
	}
}

async function getOvertimeFlagThresholdMinutes(
	prisma: PrismaClient,
	organizationId: string,
): Promise<number> {
	try {
		const timesheetConfig = await prisma.timesheetConfig.findUnique({
			where: { organizationId },
			select: { overtimeFlagThresholdMinutes: true } as any,
		});
		const threshold = (timesheetConfig as any)?.overtimeFlagThresholdMinutes;
		return typeof threshold === "number" ? threshold : 60;
	} catch {
		return 60;
	}
}

const NON_WORK_ATTENDANCE_STATUSES = new Set(["ABSENT", "LEAVE", "REST_DAY"]);

const parseCorrectionDateTime = (dateValue: string, timeValue?: string | null) => {
	const normalizedTime = String(timeValue || "").trim();
	if (!normalizedTime) return null;
	return new Date(`${String(dateValue).slice(0, 10)}T${normalizedTime}:00.000Z`);
};

const buildEmployeeSummary = (employee: any) => {
	if (!employee) return null;
	const firstName = employee.person?.personalInfo?.firstName || "";
	const lastName = employee.person?.personalInfo?.lastName || "";
	return {
		id: employee.id,
		employeeId: employee.employeeId,
		name: `${firstName} ${lastName}`.trim() || employee.employeeId || "Unknown Employee",
		position: employee.position?.title || null,
		department: employee.department?.name || null,
	};
};

const normalizeAttendanceCorrectionRecord = (record: any) => {
	if (!record) return record;
	const history = Array.isArray(record.attendanceHistory) ? record.attendanceHistory : [];
	const ledgerSummary = buildAttendanceLedgerSummary(history.length ? history : [record]);
	const rawAttendance = ledgerSummary.rawAttendance || null;
	const effectiveAttendance = ledgerSummary.effectiveAttendance || record;

	return {
		...record,
		hasCorrection: ledgerSummary.hasOverride,
		rawAttendanceId: ledgerSummary.rawAttendanceId,
		effectiveAttendanceId: ledgerSummary.effectiveAttendanceId,
		rawAttendance,
		effectiveAttendance,
		attendanceHistory: history.length ? history : ledgerSummary.attendanceHistory,
		appliedByEmployee: buildEmployeeSummary(record.appliedByEmployee),
	};
};

export const controller = (prisma: PrismaClient) => {
	const createCorrection = async (req: AuthRequest, res: Response, _next: NextFunction) => {
		const validation = CreateAttendanceCorrectionSchema.safeParse(req.body);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			res.status(400).json(buildErrorResponse("Validation failed", 400, formattedErrors));
			return;
		}

		try {
			const organizationId = req.organizationId;
			const appliedByEmployeeId = req.metadata?.employee?.id || null;
			if (!organizationId || !appliedByEmployeeId) {
				res.status(401).json(buildErrorResponse("Unauthorized", 401));
				return;
			}
			const correctionResult = await applyAttendanceCorrection({
				prisma,
				organizationId,
				rawInput: validation.data,
				source: "HR_DIRECT_CORRECTION",
				actorEmployeeId: appliedByEmployeeId,
				requireAttendanceId: true,
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.UPDATE,
				resource: config.AUDIT_LOG.RESOURCES.ATTENDANCE,
				severity: config.AUDIT_LOG.SEVERITY.MEDIUM,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.ATTENDANCE,
				entityId: correctionResult.createdAttendance.id,
				changesBefore: {
					attendanceId: correctionResult.effectiveAttendance?.id || null,
					status: correctionResult.effectiveAttendance?.status || null,
					timeIn: correctionResult.effectiveAttendance?.timeIn || null,
					timeOut: correctionResult.effectiveAttendance?.timeOut || null,
					isEffective: correctionResult.effectiveAttendance?.isEffective ?? null,
				},
				changesAfter: {
					attendanceId: correctionResult.createdAttendance.id,
					status: correctionResult.createdAttendance.status,
					timeIn: correctionResult.createdAttendance.timeIn,
					timeOut: correctionResult.createdAttendance.timeOut,
					isEffective: correctionResult.createdAttendance.isEffective,
					source: correctionResult.normalized.source,
					reasonCategory: correctionResult.normalized.reasonCategory,
					notes: correctionResult.normalized.notes,
				},
				description: `Attendance correction applied: ${correctionResult.createdAttendance.id}`,
			});

			emitAttendanceRealtimeEvent((req as any).io, {
				attendance: correctionResult.createdAttendance,
				obligation: correctionResult.obligation,
				action: "attendance_correction_applied",
				source: "HR_DIRECT_CORRECTION",
			});

			const correctionHistory = correctionResult.attendanceHistory;
			res.status(201).json(
				buildSuccessResponse(
					"Attendance correction applied successfully",
					{
						attendance: normalizeAttendanceCorrectionRecord({
							...correctionResult.createdAttendance,
							attendanceHistory: correctionHistory,
						}),
					},
					201,
				),
			);
		} catch (error) {
			if (error instanceof AttendanceCorrectionError) {
				res
					.status(error.statusCode)
					.json(buildErrorResponse(error.message, error.statusCode, error.issues || []));
				return;
			}
			attendanceLogger.error(`Failed to create attendance correction: ${error}`);
			res.status(500).json(buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500));
		}
	};

	const createBackfill = async (req: AuthRequest, res: Response, _next: NextFunction) => {
		const validation = CreateAttendanceBackfillSchema.safeParse(req.body);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			res.status(400).json(buildErrorResponse("Validation failed", 400, formattedErrors));
			return;
		}

		try {
			const organizationId = req.organizationId;
			const appliedByEmployeeId = req.metadata?.employee?.id || null;
			if (!organizationId || !appliedByEmployeeId) {
				res.status(401).json(buildErrorResponse("Unauthorized", 401));
				return;
			}

			const backfillResult = await applyAttendanceBackfill({
				prisma,
				organizationId,
				rawInput: validation.data,
				source: "HR_DIRECT_BACKFILL",
				actorEmployeeId: appliedByEmployeeId,
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.ATTENDANCE,
				severity: config.AUDIT_LOG.SEVERITY.MEDIUM,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.ATTENDANCE,
				entityId: backfillResult.createdAttendance.id,
				changesBefore: null,
				changesAfter: {
					attendanceId: backfillResult.createdAttendance.id,
					status: backfillResult.createdAttendance.status,
					timeIn: backfillResult.createdAttendance.timeIn,
					timeOut: backfillResult.createdAttendance.timeOut,
					isEffective: backfillResult.createdAttendance.isEffective,
					source: backfillResult.normalized.source,
					reasonCategory: backfillResult.normalized.reasonCategory,
					notes: backfillResult.normalized.notes,
				},
				description: `Attendance backfill created: ${backfillResult.createdAttendance.id}`,
			});

			emitAttendanceRealtimeEvent((req as any).io, {
				attendance: backfillResult.createdAttendance,
				obligation: backfillResult.obligation,
				action: "attendance_backfill_created",
				source: "HR_DIRECT_BACKFILL",
			});

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.ATTENDANCE.ACTIONS.CREATE_ATTENDANCE,
				description: `${config.ACTIVITY_LOG.ATTENDANCE.DESCRIPTIONS.ATTENDANCE_CREATED}: ${backfillResult.createdAttendance.id} (backfill)`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.ATTENDANCE.PAGES.ATTENDANCE_CREATION,
				},
			});

			res.status(201).json(
				buildSuccessResponse(
					"Attendance backfill created successfully",
					{
						attendance: backfillResult.createdAttendance,
					},
					201,
				),
			);
		} catch (error) {
			if (error instanceof AttendanceCorrectionError) {
				res
					.status(error.statusCode)
					.json(buildErrorResponse(error.message, error.statusCode, error.issues || []));
				return;
			}
			attendanceLogger.error(`Failed to create attendance backfill: ${error}`);
			res.status(500).json(buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500));
		}
	};

	const create = async (req: Request, res: Response, _next: NextFunction) => {
		let requestData = req.body;
		const contentType = req.get("Content-Type") || "";

		if (
			contentType.includes("application/x-www-form-urlencoded") ||
			contentType.includes("multipart/form-data")
		) {
			attendanceLogger.info("Original form data:", JSON.stringify(req.body, null, 2));
			requestData = transformFormDataToObject(req.body);
			attendanceLogger.info(
				"Transformed form data to object structure:",
				JSON.stringify(requestData, null, 2),
			);
		}

		const validation = CreateAttendanceSchema.safeParse(requestData);
		if (!validation.success) {
			const formattedErrors = formatZodErrors(validation.error.format());
			attendanceLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
			const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
			res.status(400).json(errorResponse);
			return;
		}

		try {
			const { employeeId, date, organizationId, timeIn } = validation.data;

			// Get employee's schedule for this date
			const attendanceDate = date || new Date();
			const scheduleInfo = await getEmployeeScheduleForDate(
				prisma,
				organizationId,
				employeeId,
				attendanceDate,
			);

			let scheduleValidation: any = null;

			if (scheduleInfo) {
				attendanceLogger.info(
					`Employee ${employeeId} schedule for ${attendanceDate.toISOString()}: ` +
						`Schedule: ${scheduleInfo.schedule?.name || "N/A"}, ` +
						`Day: ${scheduleInfo.dayLabel}`,
				);

				// Validate timeIn against schedule - use the actual timeIn that will be saved
				// timeIn defaults to current time if not provided (handled by zod transform)
				const timeInToValidate = timeIn || new Date();
				const dayShift = findShiftForDay(scheduleInfo.schedule, scheduleInfo.dayOfWeek);
				const timeSlots = dayShift?.timeSlots || [];

				if (timeSlots.length > 0) {
					scheduleValidation = validateAttendanceTime(timeInToValidate, {
						schedule: scheduleInfo.schedule,
						dayOfWeek: scheduleInfo.dayOfWeek,
						dayLabel: scheduleInfo.dayLabel,
						timeSlots,
					});

					if (scheduleValidation.warning) {
						attendanceLogger.warn(
							`Employee ${employeeId} attendance validation: ${scheduleValidation.warning}`,
						);
					} else if (scheduleValidation.isValid) {
						attendanceLogger.info(
							`Employee ${employeeId} clock-in time is valid: ${scheduleValidation.actualStartTime} (Expected: ${scheduleValidation.expectedStartTime})`,
						);
					}
				}
			} else {
				attendanceLogger.warn(
					`No schedule found for employee ${employeeId} on ${attendanceDate.toISOString()}`,
				);
			}

			// Check if attendance already exists for this employee on this date
			const existingAttendance = await prisma.attendance.findFirst({
				where: {
					organizationId,
					employeeId,
					date,
					isDeleted: false,
				},
			});

			if (existingAttendance) {
				// If attendance exists and employee is trying to clock in again
				if (!existingAttendance.timeOut && validation.data.timeIn) {
					attendanceLogger.warn(`Employee ${employeeId} already clocked in today`);
					const errorResponse = buildErrorResponse(
						"Employee has already clocked in today. Use clock out or update existing record.",
						409,
					);
					res.status(409).json(errorResponse);
					return;
				}

				// If attendance exists and employee is trying to clock out
				if (
					existingAttendance.timeIn &&
					!existingAttendance.timeOut &&
					validation.data.timeOut
				) {
					// Recalculate timekeeping metrics with timeOut
					const timekeepingCalc = calculateTimekeeping(
						existingAttendance.timeIn,
						validation.data.timeOut,
						existingAttendance.scheduleSnapshot as any,
						existingAttendance.date || new Date(),
					);

					// Determine status based on calculations (unless explicitly provided)
					const finalStatus =
						validation.data.status || determineAttendanceStatus(timekeepingCalc, true);
					const overtimeApplication = await resolveOvertimePolicyApplication(
						prisma,
						organizationId,
						{
							calc: timekeepingCalc,
							timeIn: existingAttendance.timeIn,
							timeOut: validation.data.timeOut,
							schedule: existingAttendance.scheduleSnapshot as any,
							date: existingAttendance.date || new Date(),
							attendanceStatus: finalStatus,
						},
					);

					const updatedAttendance = await prisma.attendance.update({
						where: { id: existingAttendance.id },
						data: {
							timeOut: validation.data.timeOut,
							timeOutLocation: validation.data.timeOutLocation,
							status: finalStatus,
							behaviorFlags:
								finalStatus === "LEAVE" ? [] : overtimeApplication.behaviorFlags,
							notes: validation.data.notes || existingAttendance.notes,
							...(await fetchAttendanceEmployeeSnapshotFields(prisma, employeeId)),
							...overtimeApplication.timekeepingFields,
						},
					});

					attendanceLogger.info(`Attendance clock out updated: ${updatedAttendance.id}`);
					const obligation = await applyAttendanceToObligation(prisma, {
						organizationId,
						employeeId,
						attendanceId: updatedAttendance.id,
					});
					emitAttendanceRealtimeEvent((req as any).io, {
						attendance: updatedAttendance,
						obligation,
						action: "clock_out_updated",
						source: "ATTENDANCE_API",
					});

					logActivity(req, {
						userId: (req as any).user?.id || "unknown",
						action: config.ACTIVITY_LOG.ATTENDANCE.ACTIONS.UPDATE_ATTENDANCE,
						description: `Employee clocked out: ${updatedAttendance.id}`,
						page: {
							url: req.originalUrl,
							title: config.ACTIVITY_LOG.ATTENDANCE.PAGES.ATTENDANCE_UPDATE,
						},
					});

					const successResponse = buildSuccessResponse(
						"Clock out successful",
						updatedAttendance,
						200,
					);
					res.status(200).json(successResponse);
					return;
				}

				// If attendance exists and is complete (has both timeIn and timeOut)
				if (existingAttendance.timeIn && existingAttendance.timeOut) {
					attendanceLogger.warn(
						`Employee ${employeeId} attendance already complete for today`,
					);
					const errorResponse = buildErrorResponse(
						"Attendance already complete for today. Cannot clock in/out again.",
						409,
					);
					res.status(409).json(errorResponse);
					return;
				}
			}

			const scheduleSnapshot = await resolveEffectiveShift(prisma, {
				organizationId,
				employeeId,
				date: attendanceDate,
			});

			if (!scheduleSnapshot) {
				attendanceLogger.warn(
					`No schedule found for employee ${employeeId}. Attendance will be created with default schedule assumptions.`,
				);
			} else {
				attendanceLogger.info(
					`Using shift "${scheduleSnapshot.shiftTypeName || scheduleSnapshot.shiftTypeCode || "Unknown Shift"}" for employee ${employeeId}`,
				);
			}

			// Calculate timekeeping metrics for clock-in
			const timekeepingCalc = calculateTimekeeping(
				validation.data.timeIn || new Date(),
				validation.data.timeOut || null,
				scheduleSnapshot,
				attendanceDate,
			);

			// Determine status based on calculations (unless explicitly provided)
			const finalStatus =
				validation.data.status ||
				determineAttendanceStatus(timekeepingCalc, !!validation.data.timeOut);
			const overtimeApplication = await resolveOvertimePolicyApplication(
				prisma,
				organizationId,
				{
					calc: timekeepingCalc,
					timeIn: validation.data.timeIn || new Date(),
					timeOut: validation.data.timeOut || null,
					schedule: scheduleSnapshot,
					date: attendanceDate,
					attendanceStatus: finalStatus,
				},
			);

			// Create new attendance record with scheduleSnapshot and timekeeping calculations
			// Default isManualEntry to false (biometric) if not explicitly provided
			const attendanceData = {
				...validation.data,
				status: finalStatus,
				behaviorFlags:
					finalStatus === "LEAVE" ? [] : overtimeApplication.behaviorFlags,
				scheduleSnapshot, // Copy employee's current schedule for historical accuracy
				// If isManualEntry is not provided, default to false (biometric)
				// Only set to true if explicitly provided in the request
				isManualEntry: validation.data.isManualEntry ?? false,
				...(await fetchAttendanceEmployeeSnapshotFields(prisma, employeeId)),
				...overtimeApplication.timekeepingFields,
			};

			const attendance = await prisma.attendance.create({
				data: attendanceData as any,
			});
			const obligation = await applyAttendanceToObligation(prisma, {
				organizationId,
				employeeId,
				attendanceId: attendance.id,
			});
		emitAttendanceRealtimeEvent((req as any).io, {
			attendance,
			obligation,
			action: "clock_in_created",
			source: "ATTENDANCE_API",
		});
		// Missing-punch nudge: fire-and-forget. Only notifies when the saved
		// day is one-sided AND its shift already ended (deduped by eventKey),
		// so mid-shift clock-ins never spam.
		void publishMissingPunchReminderNotification(
			prisma,
			(req as any).io,
			attendance.id,
		).catch((notifyError) =>
			attendanceLogger.warn(`Missing-punch notify failed for ${attendance.id}: ${notifyError}`),
		);

			// Log schedule information with attendance
			if (scheduleInfo) {
				let logMessage =
					`Attendance created for employee ${employeeId}: ` +
					`Schedule: ${scheduleInfo.schedule?.name || "N/A"}, ` +
					`Day: ${scheduleInfo.dayLabel}, ` +
					`Time In: ${attendance.timeIn?.toISOString() || "N/A"}`;

				if (scheduleValidation) {
					logMessage +=
						`, Expected: ${scheduleValidation.expectedStartTime || "N/A"}, ` +
						`Actual: ${scheduleValidation.actualStartTime}, ` +
						`Valid: ${scheduleValidation.isValid ? "Yes" : "No"}`;

					if (scheduleValidation.warning) {
						logMessage += `, Warning: ${scheduleValidation.warning}`;
					}
				}

				attendanceLogger.info(logMessage);
			}

			attendanceLogger.info(`Attendance created successfully: ${attendance.id}`);

			// Include validation info in response if available
			const responseData: any = { ...attendance };
			if (scheduleValidation) {
				responseData.scheduleValidation = {
					isValid: scheduleValidation.isValid,
					isEarly: scheduleValidation.isEarly,
					isLate: scheduleValidation.isLate,
					expectedStartTime: scheduleValidation.expectedStartTime,
					actualStartTime: scheduleValidation.actualStartTime,
					...(scheduleValidation.minutesEarly && {
						minutesEarly: scheduleValidation.minutesEarly,
					}),
					...(scheduleValidation.minutesLate && {
						minutesLate: scheduleValidation.minutesLate,
					}),
					...(scheduleValidation.warning && { warning: scheduleValidation.warning }),
				};
			}

			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.ATTENDANCE.ACTIONS.CREATE_ATTENDANCE,
				description: `${config.ACTIVITY_LOG.ATTENDANCE.DESCRIPTIONS.ATTENDANCE_CREATED}: ${attendance.id}`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.ATTENDANCE.PAGES.ATTENDANCE_CREATION,
				},
			});

			logAudit(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.AUDIT_LOG.ACTIONS.CREATE,
				resource: config.AUDIT_LOG.RESOURCES.ATTENDANCE,
				severity: config.AUDIT_LOG.SEVERITY.LOW,
				entityType: config.AUDIT_LOG.ENTITY_TYPES.ATTENDANCE,
				entityId: attendance.id,
				changesBefore: null,
				changesAfter: {
					id: attendance.id,
					employeeId: attendance.employeeId,
					date: attendance.date,
					timeIn: attendance.timeIn,
					createdAt: attendance.createdAt,
					updatedAt: attendance.updatedAt,
				},
				description: `${config.AUDIT_LOG.ATTENDANCE.DESCRIPTIONS.ATTENDANCE_CREATED}: ${attendance.id}`,
			});

			try {
				await invalidateCache.byPattern("cache:attendance:list:*");
				attendanceLogger.info("Attendance list cache invalidated after creation");
			} catch (cacheError) {
				attendanceLogger.warn(
					"Failed to invalidate cache after attendance creation:",
					cacheError,
				);
			}

			const successResponse = buildSuccessResponse(
				config.SUCCESS.ATTENDANCE.CREATED,
				responseData || attendance,
				201,
			);
			res.status(201).json(successResponse);
		} catch (error) {
			attendanceLogger.error(`${config.ERROR.ATTENDANCE.CREATE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const getAll = async (req: Request, res: Response, _next: NextFunction) => {
		const validationResult = validateQueryParams(req, attendanceLogger);

		if (!validationResult.isValid) {
			res.status(400).json(validationResult.errorResponse);
			return;
		}

		const {
			page,
			limit,
			order,
			fields,
			sort,
			skip,
			query,
			document,
			pagination,
			count,
			filter,
			groupBy,
		} = validationResult.validatedParams!;

		attendanceLogger.info(
			`Getting attendances, page: ${page}, limit: ${limit}, query: ${query}, order: ${order}, groupBy: ${groupBy}`,
		);

		try {
			const sanitizedFieldSelection = getSanitizedAttendanceFields(fields);
			if (sanitizedFieldSelection.error) {
				res.status(400).json(sanitizedFieldSelection.error);
				return;
			}

			// Base where clause
			const whereClause: Prisma.AttendanceWhereInput = {
				isDeleted: false,
			};

			// Agency scope: agency actors see only their own members' rows.
			// Attendance carries no agencyId scalar, so scope via employee.
			const agencyScope = await resolveCallerAgencyId(prisma, (req as any).userId);
			if (agencyScope.isAgencyActor && !agencyScope.callerAgencyId) {
				res.status(403).json(buildErrorResponse("Agency ID not found in your account", 403));
				return;
			}
			Object.assign(whereClause, agencyScopeWhere(agencyScope, "employee"));

			// Search fields for Attendance model - use actual fields that exist
			// Search in: notes (String), employee.employeeId (String)
			// Also search through employee relation to person's personalInfo (composite type)
			// Note: status is an enum, so we can't use contains - removed from search
			const searchFields = [
				"notes",
				"employee.employeeId",
				"employee.person.personalInfo.firstName",
				"employee.person.personalInfo.lastName",
			];
			if (query) {
				const searchConditions = buildSearchConditions("Attendance", query, searchFields);
				if (searchConditions.length > 0) {
					whereClause.OR = searchConditions;
				}
			}

			if (filter) {
				const filterConditions = buildFilterConditions("Attendance", filter);
				if (filterConditions.length > 0) {
					whereClause.AND = filterConditions;
				}
			}
			const findManyQuery = buildFindManyQuery(
				whereClause,
				skip,
				limit,
				order,
				sort,
				sanitizedFieldSelection.fields,
			);

			const [attendances, total] = await Promise.all([
				document ? prisma.attendance.findMany(findManyQuery) : [],
				count ? prisma.attendance.count({ where: whereClause }) : 0,
			]);

			const normalizedAttendances = document
				? await Promise.all(
						attendances.map(async (attendance: any) => {
							if (String(attendance?.ledgerType || "RAW").toUpperCase() !== "CORRECTION") {
								return attendance;
							}

							const sameDayHistory = await prisma.attendance.findMany({
								where: {
									organizationId: attendance.organizationId,
									employeeId: attendance.employeeId,
									isDeleted: false,
									date: {
										gte: normalizeToStartOfDay(attendance.date),
										lte: normalizeToEndOfDay(attendance.date),
									},
								},
								include: {
									employee: {
										select: {
											id: true,
											employeeId: true,
											person: { select: { personalInfo: true } },
											position: { select: { title: true } },
											department: { select: { name: true } },
										},
									},
									appliedByEmployee: {
										select: {
											id: true,
											employeeId: true,
											person: { select: { personalInfo: true } },
											position: { select: { title: true } },
											department: { select: { name: true } },
										},
									},
								},
								orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
							});

							return normalizeAttendanceCorrectionRecord({
								...attendance,
								attendanceHistory: sameDayHistory,
							});
						}),
				  )
				: [];

			attendanceLogger.info(`Retrieved ${attendances.length} attendances`);
			const processedData =
				groupBy && document
					? groupDataByField(normalizedAttendances, groupBy as string)
					: normalizedAttendances;

			const responseData: Record<string, any> = {
				...(document && { attendances: processedData }),
				...(count && { count: total }),
				...(pagination && { pagination: buildPagination(total, page, limit) }),
				...(groupBy && { groupedBy: groupBy }),
			};

			res.status(200).json(
				buildSuccessResponse(config.SUCCESS.ATTENDANCE.RETRIEVED_ALL, responseData, 200),
			);
		} catch (error) {
			attendanceLogger.error(`${config.ERROR.ATTENDANCE.GET_ALL_FAILED}: ${error}`);
			res.status(500).json(
				buildErrorResponse(config.ERROR.COMMON.INTERNAL_SERVER_ERROR, 500),
			);
		}
	};
	const getById = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;
		const { fields } = req.query;

		try {
			if (!id) {
				attendanceLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (fields && typeof fields !== "string") {
				attendanceLogger.error(`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`);
				const errorResponse = buildErrorResponse(
					config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			attendanceLogger.info(`${config.SUCCESS.ATTENDANCE.GETTING_BY_ID}: ${id}`);

			const sanitizedFieldSelection = getSanitizedAttendanceFields(
				typeof fields === "string" ? fields : undefined,
			);
			if (sanitizedFieldSelection.error) {
				res.status(400).json(sanitizedFieldSelection.error);
				return;
			}

			const cacheKey = `cache:attendance:byId:${id}:${sanitizedFieldSelection.fields || "full"}`;
			let attendance = null;

			try {
				if (redisClient.isClientConnected()) {
					attendance = await redisClient.getJSON(cacheKey);
					if (attendance) {
						attendanceLogger.info(`Attendance ${id} retrieved from direct Redis cache`);
					}
				}
			} catch (cacheError) {
				attendanceLogger.warn(
					`Redis cache retrieval failed for attendance ${id}:`,
					cacheError,
				);
			}

			if (!attendance) {
				const query: Prisma.AttendanceFindFirstArgs = {
					where: { id },
				};

				query.select = getNestedFields(sanitizedFieldSelection.fields);

				attendance = await prisma.attendance.findFirst(query);

				if (
					attendance &&
					String((attendance as any)?.ledgerType || "RAW").toUpperCase() === "CORRECTION"
				) {
					const sameDayHistory = await prisma.attendance.findMany({
						where: {
							organizationId: (attendance as any).organizationId,
							employeeId: (attendance as any).employeeId,
							isDeleted: false,
							date: {
								gte: normalizeToStartOfDay((attendance as any).date),
								lte: normalizeToEndOfDay((attendance as any).date),
							},
						},
						include: {
							employee: {
								select: {
									id: true,
									employeeId: true,
									person: { select: { personalInfo: true } },
									position: { select: { title: true } },
									department: { select: { name: true } },
								},
							},
							appliedByEmployee: {
								select: {
									id: true,
									employeeId: true,
									person: { select: { personalInfo: true } },
									position: { select: { title: true } },
									department: { select: { name: true } },
								},
							},
						},
						orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
					});

					attendance = normalizeAttendanceCorrectionRecord({
						...(attendance as any),
						attendanceHistory: sameDayHistory,
					});
				}

				if (attendance && redisClient.isClientConnected()) {
					try {
						await redisClient.setJSON(cacheKey, attendance, 3600);
						attendanceLogger.info(`Attendance ${id} stored in direct Redis cache`);
					} catch (cacheError) {
						attendanceLogger.warn(
							`Failed to store attendance ${id} in Redis cache:`,
							cacheError,
						);
					}
				}
			}

			if (!attendance) {
				attendanceLogger.error(`${config.ERROR.ATTENDANCE.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.ATTENDANCE.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			attendanceLogger.info(
				`${config.SUCCESS.ATTENDANCE.RETRIEVED}: ${(attendance as any).id}`,
			);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.ATTENDANCE.RETRIEVED,
				attendance,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			attendanceLogger.error(`${config.ERROR.ATTENDANCE.ERROR_GETTING}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const update = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;

		try {
			if (!id) {
				attendanceLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validationResult = UpdateAttendanceSchema.safeParse(req.body);

			if (!validationResult.success) {
				const formattedErrors = formatZodErrors(validationResult.error.format());
				attendanceLogger.error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
				const errorResponse = buildErrorResponse("Validation failed", 400, formattedErrors);
				res.status(400).json(errorResponse);
				return;
			}

			if (Object.keys(req.body).length === 0) {
				attendanceLogger.error(config.ERROR.COMMON.NO_UPDATE_FIELDS);
				const errorResponse = buildErrorResponse(config.ERROR.COMMON.NO_UPDATE_FIELDS, 400);
				res.status(400).json(errorResponse);
				return;
			}

			const validatedData = validationResult.data;

			attendanceLogger.info(`Updating attendance: ${id}`);

			const existingAttendance = await prisma.attendance.findFirst({
				where: { id },
			});

			if (!existingAttendance) {
				attendanceLogger.error(`${config.ERROR.ATTENDANCE.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.ATTENDANCE.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			// Get employee's schedule for the attendance date
			const scheduleInfo = await getEmployeeScheduleForDate(
				prisma,
				existingAttendance.organizationId,
				existingAttendance.employeeId,
				existingAttendance.date || new Date(),
			);

			if (scheduleInfo) {
				attendanceLogger.info(
					`Updating attendance for employee ${existingAttendance.employeeId}: ` +
						`Schedule: ${scheduleInfo.schedule?.name || "N/A"}, ` +
						`Day: ${scheduleInfo.dayLabel}`,
				);
			}

			const hasTimeInInput = Object.prototype.hasOwnProperty.call(validatedData, "timeIn");
			const hasTimeOutInput = Object.prototype.hasOwnProperty.call(validatedData, "timeOut");
			const hasStatusInput = Object.prototype.hasOwnProperty.call(validatedData, "status");
			const requestedStatus = String(
				(hasStatusInput ? validatedData.status : existingAttendance.status) || "",
			).toUpperCase();
			const isNonWorkedStatus = NON_WORK_ATTENDANCE_STATUSES.has(requestedStatus);
			const newTimeIn = isNonWorkedStatus
				? null
				: hasTimeInInput
					? validatedData.timeIn ?? null
					: existingAttendance.timeIn;
			const newTimeOut = isNonWorkedStatus
				? null
				: hasTimeOutInput
					? validatedData.timeOut ?? null
					: existingAttendance.timeOut;
			const {
				employeeId: _ignoredEmployeeId,
				organizationId: _ignoredOrganizationId,
				scheduleSnapshot: _ignoredScheduleSnapshot,
				...updatableData
			} = validatedData as any;
			const timekeepingCalc = calculateTimekeeping(
				newTimeIn,
				newTimeOut,
				existingAttendance.scheduleSnapshot as any,
				existingAttendance.date || new Date(),
			);
			const employeeSnapshotFields = await fetchAttendanceEmployeeSnapshotFields(
				prisma,
				existingAttendance.employeeId,
			);
			const resolvedStatus =
				updatableData.status ||
				determineAttendanceStatus(timekeepingCalc, !!newTimeOut, !!newTimeIn);
			const overtimeApplication =
				hasTimeInInput || hasTimeOutInput || hasStatusInput
					? await resolveOvertimePolicyApplication(
							prisma,
							existingAttendance.organizationId,
							{
								calc: timekeepingCalc,
								timeIn: newTimeIn,
								timeOut: newTimeOut,
								schedule: existingAttendance.scheduleSnapshot as any,
								date: existingAttendance.date || new Date(),
								isNonWorked: isNonWorkedStatus,
								attendanceStatus: resolvedStatus,
							},
						)
					: null;

			const prismaData = {
				...updatableData,
				...employeeSnapshotFields,
				// Keep persisted fact fields aligned when attendance edits change work semantics.
				...(overtimeApplication
					? {
							status: resolvedStatus,
							behaviorFlags: isNonWorkedStatus
								? []
								: overtimeApplication.behaviorFlags,
							...overtimeApplication.timekeepingFields,
						}
					: {}),
			};

			const updatedAttendance = await prisma.attendance.update({
				where: { id },
				data: prismaData as any,
			});
			const obligation = await applyAttendanceToObligation(prisma, {
				organizationId: updatedAttendance.organizationId,
				employeeId: updatedAttendance.employeeId,
				attendanceId: updatedAttendance.id,
			});
		emitAttendanceRealtimeEvent((req as any).io, {
			attendance: updatedAttendance,
			obligation,
			action: "attendance_updated",
			source: "ATTENDANCE_API",
		});
		// Missing-punch nudge (same shift-ended + dedupe gate as clock-in).
		void publishMissingPunchReminderNotification(
			prisma,
			(req as any).io,
			updatedAttendance.id,
		).catch((notifyError) =>
			attendanceLogger.warn(`Missing-punch notify failed for ${updatedAttendance.id}: ${notifyError}`),
		);

			try {
				await invalidateCache.byPattern(`cache:attendance:byId:${id}:*`);
				await invalidateCache.byPattern("cache:attendance:list:*");
				attendanceLogger.info(`Cache invalidated after attendance ${id} update`);
			} catch (cacheError) {
				attendanceLogger.warn(
					"Failed to invalidate cache after attendance update:",
					cacheError,
				);
			}

			attendanceLogger.info(`${config.SUCCESS.ATTENDANCE.UPDATED}: ${updatedAttendance.id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.ATTENDANCE.UPDATED,
				{ attendance: updatedAttendance },
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			attendanceLogger.error(`${config.ERROR.ATTENDANCE.ERROR_UPDATING}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const remove = async (req: Request, res: Response, _next: NextFunction) => {
		const { id } = req.params;

		try {
			if (!id) {
				attendanceLogger.error(config.ERROR.QUERY_PARAMS.MISSING_ID);
				const errorResponse = buildErrorResponse(config.ERROR.QUERY_PARAMS.MISSING_ID, 400);
				res.status(400).json(errorResponse);
				return;
			}

			attendanceLogger.info(`${config.SUCCESS.ATTENDANCE.DELETED}: ${id}`);

			const existingAttendance = await prisma.attendance.findFirst({
				where: { id },
			});

			if (!existingAttendance) {
				attendanceLogger.error(`${config.ERROR.ATTENDANCE.NOT_FOUND}: ${id}`);
				const errorResponse = buildErrorResponse(config.ERROR.ATTENDANCE.NOT_FOUND, 404);
				res.status(404).json(errorResponse);
				return;
			}

			await prisma.attendance.delete({
				where: { id },
			});

			try {
				await invalidateCache.byPattern(`cache:attendance:byId:${id}:*`);
				await invalidateCache.byPattern("cache:attendance:list:*");
				attendanceLogger.info(`Cache invalidated after attendance ${id} deletion`);
			} catch (cacheError) {
				attendanceLogger.warn(
					"Failed to invalidate cache after attendance deletion:",
					cacheError,
				);
			}

			attendanceLogger.info(`${config.SUCCESS.ATTENDANCE.DELETED}: ${id}`);
			const successResponse = buildSuccessResponse(
				config.SUCCESS.ATTENDANCE.DELETED,
				{},
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			attendanceLogger.error(`${config.ERROR.ATTENDANCE.DELETE_FAILED}: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	/**
	 * TEMPORARY: Uzaro-specific attendance import
	 * This import function is specific to Uzaro's attendance format with Person ID and Time columns
	 * TODO: Remove this once Uzaro migrates to the generalized import format
	 */
	const importFromUzaroXLSX = async (req: AuthRequest, res: Response, _next: NextFunction) => {
		try {
			const file = req.file;
			if (!file) {
				const errorResponse = buildErrorResponse("No file uploaded", 400);
				res.status(400).json(errorResponse);
				return;
			}

			// debug: request payload trimmed

			// Get organizationId from authenticated user's context (JWT token)
			const organizationId = req.organizationId;
			if (!organizationId) {
				const errorResponse = buildErrorResponse(
					"Organization ID not found in authentication token. Please ensure you are logged in.",
					401,
				);
				res.status(401).json(errorResponse);
				return;
			}

			attendanceLogger.info(
				`Starting XLSX import for organization ${organizationId}, file: ${file.originalname}`,
			);

			// Parse XLSX file
			const workbook = XLSX.read(file.buffer, { type: "buffer" });

			// Try to find "Raw" sheet first, otherwise use the first sheet
			let sheetName = workbook.SheetNames.find((name) => name.toLowerCase().trim() === "raw");
			if (!sheetName) {
				sheetName = workbook.SheetNames[0];
				attendanceLogger.info(`"Raw" sheet not found, using first sheet: ${sheetName}`);
			} else {
				attendanceLogger.info(`Using sheet: ${sheetName}`);
			}

			const worksheet = workbook.Sheets[sheetName];

			// Convert to JSON - use raw: true to get actual values, then parse dates
			const rawData = XLSX.utils.sheet_to_json(worksheet, { raw: true, defval: null });

			if (!rawData || rawData.length === 0) {
				const errorResponse = buildErrorResponse("Excel file is empty or invalid", 400);
				res.status(400).json(errorResponse);
				return;
			}

			attendanceLogger.info(`Parsed ${rawData.length} rows from Excel file`);

			// Map column names (handle variations)
			const normalizeColumnName = (name: string): string => {
				return name.trim().toLowerCase().replace(/\s+/g, " ");
			};

			// Get headers from first row
			const firstRow = rawData[0] as any;
			const headers = Object.keys(firstRow);

			attendanceLogger.info(`Found columns: ${headers.join(", ")}`);

			const columnMap: Record<string, string> = {};

			headers.forEach((header) => {
				const normalized = normalizeColumnName(header);
				columnMap[normalized] = header;
			});

			// Find column indices - try exact matches first, then fuzzy matches
			const personIdCol =
				columnMap["person id"] || // Exact match: "Person ID"
				columnMap["personid"] ||
				columnMap["person_id"] ||
				headers.find(
					(h) =>
						normalizeColumnName(h).includes("person") &&
						normalizeColumnName(h).includes("id"),
				);
			const timeCol =
				columnMap["time"] || // Exact match: "Time"
				headers.find((h) => normalizeColumnName(h).includes("time"));
			const nameCol =
				columnMap["name"] || // Exact match: "Name"
				headers.find((h) => normalizeColumnName(h).includes("name"));

			attendanceLogger.info(
				`Column mapping - Person ID: ${personIdCol || "NOT FOUND"}, Time: ${timeCol || "NOT FOUND"}, Name: ${nameCol || "NOT FOUND"}`,
			);

			if (!personIdCol || !timeCol) {
				const errorResponse = buildErrorResponse(
					"Excel file must contain 'Person ID' and 'Time' columns",
					400,
				);
				res.status(400).json(errorResponse);
				return;
			}

			// Process rows and group by employee and date
			interface AttendanceRow {
				personId: string;
				time: Date;
				date: Date;
				name?: string;
			}

			const attendanceRows: AttendanceRow[] = [];

			for (const row of rawData) {
				const rowData = row as any;
				let personId = String(rowData[personIdCol] || "").trim();

				// Remove leading apostrophe (') if present (Excel sometimes adds this for text formatting)
				// This happens when Excel treats the value as text to preserve leading zeros
				// Example: '31 should become 31
				if (personId.startsWith("'")) {
					personId = personId.substring(1).trim();
				}

				// Also remove any trailing apostrophes (shouldn't happen but just in case)
				if (personId.endsWith("'")) {
					personId = personId.slice(0, -1).trim();
				}

				const timeValue = rowData[timeCol];

				if (!personId || timeValue === null || timeValue === undefined) {
					continue;
				}

				// Parse time - handle various formats
				let time: Date;
				try {
					// If it's a number, it might be an Excel date serial number
					if (typeof timeValue === "number") {
						// Excel date serial number (days since 1900-01-01)
						// Excel incorrectly treats 1900 as a leap year, so we need to adjust
						const excelEpoch = new Date(1899, 11, 30); // Dec 30, 1899
						const millisecondsPerDay = 24 * 60 * 60 * 1000;
						time = new Date(excelEpoch.getTime() + timeValue * millisecondsPerDay);
					} else if (timeValue instanceof Date) {
						time = timeValue;
					} else {
						// Try parsing as date string
						const timeStr = String(timeValue).trim();
						if (!timeStr) {
							continue;
						}
						time = new Date(timeStr);
					}

					if (isNaN(time.getTime())) {
						attendanceLogger.warn(`Invalid time format: ${timeValue}`);
						continue;
					}
				} catch (error) {
					attendanceLogger.warn(`Error parsing time: ${error}`);
					continue;
				}

				// Extract date (start of day)
				const date = new Date(time);
				date.setHours(0, 0, 0, 0);

				attendanceRows.push({
					personId,
					time,
					date,
					name: nameCol ? (rowData[nameCol] as string | undefined) : undefined,
				});
			}

			attendanceLogger.info(`Processed ${attendanceRows.length} valid attendance rows`);

			// Get all unique person IDs (already cleaned of apostrophes)
			const personIds = [...new Set(attendanceRows.map((r) => r.personId))];

			attendanceLogger.info(
				`Looking for employees with deviceEmpId matching Person IDs: ${personIds.slice(0, 10).join(", ")}${personIds.length > 10 ? `... (${personIds.length} total)` : ""}`,
			);

			// Fetch employees by deviceEmpId
			const employees = await prisma.employee.findMany({
				where: {
					organizationId,
					deviceEmpId: { in: personIds },
					isDeleted: false,
				},
				select: {
					id: true,
					deviceEmpId: true,
					employeeId: true,
				},
			});

			// Create map of deviceEmpId -> employee
			const employeeMap = new Map<string, (typeof employees)[0]>();
			employees.forEach((emp) => {
				if (emp.deviceEmpId) {
					// Normalize deviceEmpId for matching (remove any whitespace, convert to string)
					const normalizedDeviceEmpId = String(emp.deviceEmpId).trim();
					employeeMap.set(normalizedDeviceEmpId, emp);
				}
			});

			attendanceLogger.info(
				`Found ${employees.length} employees matching ${personIds.length} person IDs`,
			);

			// Log which person IDs didn't match
			const unmatchedPersonIds = personIds.filter((pid) => !employeeMap.has(pid));
			if (unmatchedPersonIds.length > 0) {
				attendanceLogger.warn(
					`Person IDs not found in employees: ${unmatchedPersonIds.slice(0, 10).join(", ")}${unmatchedPersonIds.length > 10 ? `... (${unmatchedPersonIds.length} total)` : ""}`,
				);
			}

			// Group attendance by employee and date
			const attendanceMap = new Map<
				string,
				{ employeeId: string; date: Date; times: Date[] }
			>();

			for (const row of attendanceRows) {
				// Normalize personId for matching (should already be cleaned, but double-check)
				const normalizedPersonId = String(row.personId).trim();
				const employee = employeeMap.get(normalizedPersonId);
				if (!employee) {
					attendanceLogger.warn(
						`No employee found for Person ID: ${normalizedPersonId} (Name: ${row.name || "N/A"})`,
					);
					continue;
				}

				const key = `${employee.id}_${row.date.toISOString()}`;
				if (!attendanceMap.has(key)) {
					attendanceMap.set(key, {
						employeeId: employee.id,
						date: row.date,
						times: [],
					});
				}

				attendanceMap.get(key)!.times.push(row.time);
			}

			attendanceLogger.info(`Grouped into ${attendanceMap.size} unique attendance records`);

			// Process each attendance record
			const results = {
				created: 0,
				updated: 0,
				skipped: 0,
				errors: [] as string[],
			};

			for (const [key, attendance] of attendanceMap.entries()) {
				try {
					const { employeeId, date, times } = attendance;

					// Sort times
					times.sort((a, b) => a.getTime() - b.getTime());

					// Get first time as timeIn, last time as timeOut
					const timeIn = times[0];
					const timeOut = times.length > 1 ? times[times.length - 1] : times[0];

					// Normalize date to start of day
					const attendanceDate = new Date(date);
					attendanceDate.setHours(0, 0, 0, 0);

					const scheduleSnapshot = await resolveEffectiveShift(prisma, {
						organizationId,
						employeeId,
						date: attendanceDate,
					});

					if (!scheduleSnapshot) {
						attendanceLogger.warn(
							`No schedule found for employee ${employeeId} on ${attendanceDate.toISOString()}, using default`,
						);
					}

					const timekeepingCalc = calculateTimekeeping(
						timeIn,
						timeOut,
						scheduleSnapshot,
						attendanceDate,
					);
					const computedStatus = determineAttendanceStatus(
						timekeepingCalc,
						!!timeOut,
						!!timeIn,
					);
					const overtimeApplication = await resolveOvertimePolicyApplication(
						prisma,
						organizationId,
						{
							calc: timekeepingCalc,
							timeIn,
							timeOut,
							schedule: scheduleSnapshot,
							date: attendanceDate,
							attendanceStatus: computedStatus,
						},
					);
					const computedFlags =
						computedStatus === "LEAVE" ? [] : overtimeApplication.behaviorFlags;

					// Check if attendance already exists
					const existingAttendance = await prisma.attendance.findFirst({
						where: {
							organizationId,
							employeeId,
							date: attendanceDate,
							isDeleted: false,
						},
					});

					if (existingAttendance) {
						const employeeSnapshotFields = await fetchAttendanceEmployeeSnapshotFields(
							prisma,
							employeeId,
						);
						// Update existing attendance
						const savedAttendance = await prisma.attendance.update({
							where: { id: existingAttendance.id },
							data: {
								timeIn,
								timeOut,
								status: computedStatus,
								behaviorFlags: computedFlags,
								...employeeSnapshotFields,
								...overtimeApplication.timekeepingFields,
								isManualEntry: true,
								deviceInfo: {
									source: "xlsx_import",
									importedAt: new Date().toISOString(),
								},
							} as any,
						});
						const obligation = await applyAttendanceToObligation(prisma, {
							organizationId,
							employeeId,
							attendanceId: savedAttendance.id,
						});
						emitAttendanceRealtimeEvent((req as any).io, {
							attendance: savedAttendance,
							obligation,
							action: "attendance_updated",
							source: "ATTENDANCE_IMPORT",
						});
						results.updated++;
						attendanceLogger.info(
							`Updated attendance for employee ${employeeId} on ${attendanceDate.toISOString()}`,
						);
					} else {
						const employeeSnapshotFields = await fetchAttendanceEmployeeSnapshotFields(
							prisma,
							employeeId,
						);
						// Create new attendance
						const savedAttendance = await prisma.attendance.create({
							data: {
								organizationId,
								employeeId,
								date: attendanceDate,
								timeIn,
								timeOut,
								status: computedStatus,
								behaviorFlags: computedFlags,
								...employeeSnapshotFields,
								...overtimeApplication.timekeepingFields,
								scheduleSnapshot: scheduleSnapshot as any, // Copy of employee's schedule
								isManualEntry: true,
								deviceInfo: {
									source: "xlsx_import",
									importedAt: new Date().toISOString(),
								},
							} as any,
						});
						const obligation = await applyAttendanceToObligation(prisma, {
							organizationId,
							employeeId,
							attendanceId: savedAttendance.id,
						});
						emitAttendanceRealtimeEvent((req as any).io, {
							attendance: savedAttendance,
							obligation,
							action: "attendance_created",
							source: "ATTENDANCE_IMPORT",
						});
						results.created++;
						attendanceLogger.info(
							`Created attendance for employee ${employeeId} on ${attendanceDate.toISOString()}`,
						);
					}
				} catch (error) {
					results.skipped++;
					const errorMsg = `Error processing attendance ${key}: ${error}`;
					results.errors.push(errorMsg);
					attendanceLogger.error(errorMsg);
				}
			}

			// Invalidate cache
			try {
				await invalidateCache.byPattern("cache:attendance:list:*");
				attendanceLogger.info("Attendance list cache invalidated after import");
			} catch (cacheError) {
				attendanceLogger.warn("Failed to invalidate cache after import:", cacheError);
			}

			attendanceLogger.info(
				`Import completed: ${results.created} created, ${results.updated} updated, ${results.skipped} skipped`,
			);

			const responseData = {
				summary: {
					totalRows: rawData.length,
					processedRows: attendanceRows.length,
					created: results.created,
					updated: results.updated,
					skipped: results.skipped,
					errors: results.errors.slice(0, 10), // Limit errors in response
				},
			};

			const successResponse = buildSuccessResponse(
				"Attendance import completed",
				responseData,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			attendanceLogger.error(`Error importing attendance from XLSX: ${error}`);
			const errorResponse = buildErrorResponse(
				`Failed to import attendance: ${error instanceof Error ? error.message : String(error)}`,
				500,
			);
			res.status(500).json(errorResponse);
		}
	}; /**
	 * Generalized attendance import from XLSX file
	 * Expects columns: EMPLOYEE_ID, DATE, TIME_IN, TIME_OUT, STATUS, NOTES (optional)
	 */
	const importFromXLSX = async (req: AuthRequest, res: Response, _next: NextFunction) => {
		try {
			const file = req.file;
			if (!file) {
				const errorResponse = buildErrorResponse("No file uploaded", 400);
				res.status(400).json(errorResponse);
				return;
			}

			const organizationId = req.organizationId;
			if (!organizationId) {
				const errorResponse = buildErrorResponse(
					"Organization ID not found in authentication token",
					401,
				);
				res.status(401).json(errorResponse);
				return;
			}

			attendanceLogger.info(
				`Starting generalized attendance import for organization ${organizationId}, file: ${file.originalname}`,
			);
			const createTimesheets =
				String(req.body?.createTimesheets || "").toLowerCase() === "true";

			const workbook = XLSX.read(file.buffer, { type: "buffer" });
			const sheetName = workbook.SheetNames[0];
			const worksheet = workbook.Sheets[sheetName];
			const rawData = XLSX.utils.sheet_to_json(worksheet, { raw: true, defval: null });

			if (!rawData || rawData.length === 0) {
				const errorResponse = buildErrorResponse("Excel file is empty or invalid", 400);
				res.status(400).json(errorResponse);
				return;
			}

			attendanceLogger.info(`Parsed ${rawData.length} rows from Excel file`);

			// Parse rows into AttendanceRow format for the service
			const attendanceRows: Array<{
				employeeId: string;
				date: Date;
				timeIn: Date | null;
				timeOut: Date | null;
				status?: string;
				notes?: string;
			}> = [];

			// Helper function to parse time with date
			const parseTimeWithDate = (timeValue: any, baseDate: Date): Date | null => {
				if (typeof timeValue === "number") {
					const excelEpoch = new Date(1899, 11, 30);
					return new Date(excelEpoch.getTime() + timeValue * 24 * 60 * 60 * 1000);
				} else if (timeValue instanceof Date) {
					return timeValue;
				} else if (typeof timeValue === "string") {
					const timeStr = timeValue.trim();
					let parsed = new Date(timeStr);
					if (!isNaN(parsed.getTime())) {
						return parsed;
					}
					const year = baseDate.getUTCFullYear();
					const month = String(baseDate.getUTCMonth() + 1).padStart(2, "0");
					const day = String(baseDate.getUTCDate()).padStart(2, "0");
					const dateStr = `${year}-${month}-${day}`;
					parsed = new Date(`${dateStr} ${timeStr}`);
					if (!isNaN(parsed.getTime())) {
						return parsed;
					}
				}
				return null;
			};

			let rowIndex = 0;
			for (const row of rawData) {
				rowIndex++;
				try {
					const rowData = row as any;
					const employeeId =
						rowData.EMPLOYEE_ID ||
						rowData["Employee ID"] ||
						rowData.employee_id ||
						rowData.EMP_ID ||
						rowData["Emp ID"];
					if (!employeeId) continue;

					const dateValue = rowData.DATE || rowData.Date || rowData.date;
					if (!dateValue) continue;

					let attendanceDate: Date;
					try {
						if (typeof dateValue === "number") {
							const utcMs = (dateValue - 25569) * 86400 * 1000;
							const utcDate = new Date(utcMs);
							attendanceDate = new Date(
								Date.UTC(
									utcDate.getUTCFullYear(),
									utcDate.getUTCMonth(),
									utcDate.getUTCDate(),
									0,
									0,
									0,
									0,
								),
							);
						} else if (dateValue instanceof Date) {
							attendanceDate = new Date(
								Date.UTC(
									dateValue.getFullYear(),
									dateValue.getMonth(),
									dateValue.getDate(),
									0,
									0,
									0,
									0,
								),
							);
						} else {
							const parsed = new Date(String(dateValue));
							attendanceDate = new Date(
								Date.UTC(
									parsed.getFullYear(),
									parsed.getMonth(),
									parsed.getDate(),
									0,
									0,
									0,
									0,
								),
							);
						}
						if (isNaN(attendanceDate.getTime())) throw new Error("Invalid date");
					} catch (error) {
						continue;
					}

					const timeInValue = rowData.TIME_IN || rowData["Time In"] || rowData.time_in;
					const timeOutValue =
						rowData.TIME_OUT || rowData["Time Out"] || rowData.time_out;
					let timeIn: Date | null = null;
					let timeOut: Date | null = null;

					if (timeInValue) {
						try {
							timeIn = parseTimeWithDate(timeInValue, attendanceDate);
						} catch (error) {}
					}
					if (timeOutValue) {
						try {
							timeOut = parseTimeWithDate(timeOutValue, attendanceDate);
						} catch (error) {}
					}

					const statusValue = rowData.STATUS || rowData.Status || rowData.status;
					const status = statusValue ? String(statusValue).trim().toUpperCase() : undefined;
					const validStatuses = new Set(["PRESENT", "LEAVE", "INCOMPLETE"]);
					if (status && !validStatuses.has(status)) {
						attendanceLogger.warn(
							`Skipping row ${rowIndex}: invalid STATUS "${status}" (expected PRESENT, LEAVE, INCOMPLETE)`,
						);
						continue;
					}
					const notes = rowData.NOTES || rowData.Notes || rowData.notes || null;

					attendanceRows.push({
						employeeId: String(employeeId),
						date: attendanceDate,
						timeIn,
						timeOut,
						status,
						notes,
					});
				} catch (error) {
					attendanceLogger.error(`Error parsing row ${rowIndex}: ${error}`);
				}
			}

			if (attendanceRows.length === 0) {
				const errorResponse = buildErrorResponse("No valid attendance rows found", 400);
				res.status(400).json(errorResponse);
				return;
			}

			// Start import in background using AttendanceImportService
			const importService = new AttendanceImportService(prisma, organizationId, {
				createTimesheets,
			});
			const importPromise = importService.importAttendance(attendanceRows);
			const initialResult = await importPromise;
			const jobId = initialResult.jobId;

			attendanceLogger.info(
				`Started import job ${jobId} for ${attendanceRows.length} records`,
			);

			// Invalidate cache after import completes (in background)
			importPromise.then(() => {
				invalidateCache.byPattern("cache:attendance:*").catch((cacheError) => {
					attendanceLogger.warn("Failed to invalidate cache after import:", cacheError);
				});
			});

			// Return jobId immediately (202 Accepted for async operation)
			const responseData = {
				jobId,
				message: "Import started",
				total: attendanceRows.length,
			};

			const successResponse = buildSuccessResponse(
				"Attendance import started successfully",
				responseData,
				202,
			);
			res.status(202).json(successResponse);
		} catch (error) {
			attendanceLogger.error(`Error importing attendance from XLSX: ${error}`);
			const errorResponse = buildErrorResponse(
				`Failed to import attendance: ${error instanceof Error ? error.message : String(error)}`,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	/**
	 * Get timekeeping summary for a date range
	 * Aggregates hours worked, overtime, tardiness, etc.
	 */
	const getTimekeepingSummary = async (req: Request, res: Response, _next: NextFunction) => {
		try {
			const { employeeId, startDate, endDate, organizationId } = req.query;

			if (!employeeId) {
				attendanceLogger.error("Missing employeeId parameter");
				const errorResponse = buildErrorResponse("employeeId is required", 400);
				res.status(400).json(errorResponse);
				return;
			}

			if (!organizationId) {
				attendanceLogger.error("Missing organizationId parameter");
				const errorResponse = buildErrorResponse("organizationId is required", 400);
				res.status(400).json(errorResponse);
				return;
			}

			// Default to current month if no date range provided
			const now = new Date();
			const start = startDate
				? new Date(startDate as string)
				: new Date(now.getFullYear(), now.getMonth(), 1);
			const end = endDate
				? new Date(endDate as string)
				: new Date(now.getFullYear(), now.getMonth() + 1, 0);

			attendanceLogger.info(
				`Fetching timekeeping summary for employee ${employeeId} from ${start.toISOString()} to ${end.toISOString()}`,
			);

			const attendances = await getEffectiveAttendanceRecordsForRange(prisma, {
				organizationId: organizationId as string,
				employeeId: employeeId as string,
				startDate: start,
				endDate: end,
			});

			// Calculate totals
			let totalRegularMinutes = 0;
			let totalOvertimeMinutes = 0;
			let totalUndertimeMinutes = 0;
			let totalLateMinutes = 0;
			let totalEarlyOutMinutes = 0;
			let totalDaysPresent = 0;
			let totalDaysWithTimeOut = 0;

			const dailyBreakdown = attendances.map((att) => {
				// Recalculate metrics since they are no longer stored in DB as integers
				const calc = calculateTimekeeping(
					att.timeIn,
					att.timeOut,
					att.scheduleSnapshot,
					att.date || new Date(),
				);

				if (calc.regularMinutes) totalRegularMinutes += calc.regularMinutes;
				if (calc.overtimeMinutes) totalOvertimeMinutes += calc.overtimeMinutes;
				if (calc.undertimeMinutes) totalUndertimeMinutes += calc.undertimeMinutes;
				if (calc.lateMinutes) totalLateMinutes += calc.lateMinutes;
				if (calc.earlyOutMinutes) totalEarlyOutMinutes += calc.earlyOutMinutes;
				if (att.timeIn) totalDaysPresent++;
				if (att.timeOut) totalDaysWithTimeOut++;

				return {
					id: att.id,
					date: att.date,
					timeIn: att.timeIn,
					timeOut: att.timeOut,
					totalMinutesWorked: calc.totalMinutesWorked,
					regularMinutes: calc.regularMinutes,
					overtimeMinutes: calc.overtimeMinutes,
					undertimeMinutes: calc.undertimeMinutes,
					lateMinutes: calc.lateMinutes,
					earlyOutMinutes: calc.earlyOutMinutes,
					breakMinutes: att.breakMinutes ?? calc.breakMinutes,
					status: att.status,
					hoursWorked: att.hoursWorked,
					regularHours: att.regularHours,
					overtimeHours: att.overtimeHours,
					undertimeHours: att.undertimeHours,
					lateHours: att.lateHours,
					earlyOutHours: att.earlyOutHours,
				};
			});

			const summary = {
				employeeId,
				period: {
					startDate: start,
					endDate: end,
				},
				totals: {
					regularMinutes: totalRegularMinutes,
					overtimeMinutes: totalOvertimeMinutes,
					undertimeMinutes: totalUndertimeMinutes,
					lateMinutes: totalLateMinutes,
					earlyOutMinutes: totalEarlyOutMinutes,
					daysPresent: totalDaysPresent,
					daysComplete: totalDaysWithTimeOut,
				},
				dailyBreakdown,
			};

			attendanceLogger.info(
				`Timekeeping summary calculated: ${totalDaysPresent} days present, ${totalRegularMinutes} regular minutes`,
			);

			const successResponse = buildSuccessResponse(
				"Timekeeping summary retrieved",
				summary,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			attendanceLogger.error(`Error fetching timekeeping summary: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const getImportProgress = async (req: AuthRequest, res: Response, _next: NextFunction) => {
		try {
			const { jobId } = req.params;

			if (!jobId) {
				const errorResponse = buildErrorResponse("Job ID is required", 400);
				res.status(400).json(errorResponse);
				return;
			}

			const progress = AttendanceImportService.getJobProgress(jobId);

			if (!progress) {
				const errorResponse = buildErrorResponse("Import job not found or expired", 404);
				res.status(404).json(errorResponse);
				return;
			}

			const successResponse = buildSuccessResponse(
				"Import progress retrieved successfully",
				progress,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			attendanceLogger.error(`Error getting import progress: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	const notifyMissingPunch = async (req: AuthRequest, res: Response, _next: NextFunction) => {
		try {
			const organizationId = (req as any).organizationId;
			if (!organizationId) {
				const errorResponse = buildErrorResponse("Organization ID is required", 401);
				res.status(401).json(errorResponse);
				return;
			}
			const body = (req.body || {}) as Record<string, any>;
			const query = (req.query || {}) as Record<string, any>;
			const rawExecute = body.execute ?? query.execute ?? body.dryRun === false;
			const execute = rawExecute === true || rawExecute === "true" || rawExecute === "1";
			const result = await sweepMissingPunchNotifications({
				prisma,
				io: (req as any).io,
				organizationId,
				from: body.from ?? query.from ?? null,
				to: body.to ?? query.to ?? null,
				employeeId: body.employeeId ?? query.employeeId ?? null,
				limit: Number(body.limit ?? query.limit ?? 200),
				execute,
			});
			logActivity(req, {
				userId: (req as any).user?.id || "unknown",
				action: config.ACTIVITY_LOG.ATTENDANCE.ACTIONS.GET_ALL_ATTENDANCE,
				description: `Missing-punch notify sweep (execute=${execute}): ${result.candidates.length} candidate(s), ${result.notified} notified`,
				page: {
					url: req.originalUrl,
					title: config.ACTIVITY_LOG.ATTENDANCE.PAGES.ATTENDANCE_LIST,
				},
			});
			const successResponse = buildSuccessResponse(
				execute
					? "Missing-punch notifications sent"
					: "Missing-punch preview (dry run — nothing sent)",
				result,
				200,
			);
			res.status(200).json(successResponse);
		} catch (error) {
			attendanceLogger.error(`Missing-punch notify sweep failed: ${error}`);
			const errorResponse = buildErrorResponse(
				config.ERROR.COMMON.INTERNAL_SERVER_ERROR,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};

	return {
		create,
		createCorrection,
		createBackfill,
		getAll,
		getById,
		update,
		remove,
		importFromXLSX,
		importFromUzaroXLSX,
		getTimekeepingSummary,
		getImportProgress,
		notifyMissingPunch,
	};
};

