import { Request, Response, NextFunction } from "express";
import { PrismaClient } from "../../../generated/prisma";
import { buildSuccessResponse } from "../../../helper/success-handler.helper";
import { buildErrorResponse } from "../../../helper/error-handler";
import {
	buildAttendanceDateQuery,
	buildAttendanceTimekeepingFields,
	fetchAttendanceEmployeeSnapshotFields,
} from "../../../helper/attendance.helper";
import {
	normalizeEmployeeScheduleSnapshot,
	resolveEffectiveShift,
	resolveEmployeeActiveSchedule,
} from "../../../helper/employee-schedule.helper";
import {
	calculateTimekeeping,
	determineAttendanceStatus,
	deriveBehaviorFlags,
	formatMinutesAsTime,
} from "../../../helper/timekeeping.helper";
import { applyAttendanceToObligation } from "../../../helper/attendance-obligation.helper";
import { resolveOvertimePolicyApplication } from "../../../helper/overtime-approval.helper";
import { invalidateCache } from "../../../middleware/cache";
import {
	buildHikvisionDeviceEventDedupeKey,
	DEFAULT_HIKVISION_MIN_PUNCH_PAIR_GAP_MINUTES,
	extractHikvisionEventData,
	isHikvisionAttendancePunchEvent,
	normalizeHikvisionDeviceEventSource,
	normalizeHikvisionFutureSkewedEventTime,
	parseHikvisionBodyPayload,
	parseHikvisionEventTime,
	selectHikvisionPunchPair,
	type NormalizedHikvisionEvent,
} from "../../../helper/hikvision-event-contract.helper";
import { withHikvisionPanelSelectStatus } from "../../../helper/hikvision-panel-select-status.helper";
import { buildPersistedDeviceEventTaxonomy } from "../../../helper/device-event-taxonomy.helper";
import {
	extractAcsSerialFromPayload,
	findExistingDeviceEventByAcsSerial,
} from "../../../helper/hikvision-device-event-serial-dedupe.helper";
import { emitDeviceEventSaved } from "../../../helper/device-event-realtime.helper";
import { emitAttendanceRealtimeEvent } from "../../../helper/attendance-realtime.helper";
import { refreshTimesheetForAttendanceDate } from "../../../helper/timesheet.helper";

export const controller = (prisma: PrismaClient) => {
	const publishDeviceEventSaved = (req: Request, eventRecord: any, deviceHint?: any) =>
		emitDeviceEventSaved((req as any).io, {
			...eventRecord,
			device:
				eventRecord?.device ||
				(deviceHint
					? {
							id: deviceHint.id,
							name: deviceHint.name,
							address: deviceHint.address,
						}
					: undefined),
		});

	const getOvertimeFlagThresholdMinutes = async (organizationId: string): Promise<number> => {
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
	};

	const getMinimumPunchPairGapMinutes = (device: any) => {
		void device;
		return DEFAULT_HIKVISION_MIN_PUNCH_PAIR_GAP_MINUTES;
	};

	const canPairPunchesAsClockOut = (device: any) =>
		(device?.config as any)?.hikvisionPairPunchesAsClockOut !== false;

	const resolveCallbackDevice = async (req: Request, event: NormalizedHikvisionEvent) => {
		const requestedDeviceId =
			String(event.deviceId || "").trim() ||
			String((req.query as any)?.deviceId || "").trim();
		const deviceIP = String(event.deviceIP || "").trim();

		if (requestedDeviceId) {
			return (prisma as any).device.findFirst({
				where: {
					id: requestedDeviceId,
					isDeleted: false,
				},
				select: {
					id: true,
					organizationId: true,
					name: true,
					address: true,
					port: true,
					protocol: true,
					config: true,
				},
			});
		}

		if (deviceIP) {
			return (prisma as any).device.findFirst({
				where: {
					address: deviceIP,
					isDeleted: false,
				},
				select: {
					id: true,
					organizationId: true,
					name: true,
					address: true,
					port: true,
					protocol: true,
					config: true,
				},
			});
		}

		return null;
	};

	const resolveCallbackEvidenceSource = (
		source: string,
		payload: Record<string, any>,
	) => {
		if (source === "EN_HCNETSDK_ALARM") return "SDK_CALLBACK";
		const existing = String(payload?.evidenceSource || "").trim();
		return existing || "ISAPI_ACS";
	};

	const stampCallbackEvidence = (
		payload: Record<string, any>,
		source: string,
	) => ({
		...payload,
		evidenceSource: resolveCallbackEvidenceSource(source, payload),
		directDeviceEvidence: true,
	});

	const saveInitialDeviceEvent = async (data: {
		device: any;
		event: NormalizedHikvisionEvent;
		payload: Record<string, any>;
		eventTime: Date;
		employeeNo: string;
		source: string;
		dedupeKey: string;
	}) => {
		const eventClient = (prisma as any).deviceEvent;
		const existing = await eventClient.findFirst({
			where: {
				organizationId: data.device.organizationId,
				dedupeKey: data.dedupeKey,
			},
		});

		if (existing) {
			return { eventRecord: existing, isDuplicate: true };
		}

		const serialNo =
			extractAcsSerialFromPayload(data.payload) ||
			String(data.event.serialNo || "").trim();
		// Serial fallback does not require employeeNo or same source.
		// identity_repost / empty-then-filled callbacks share ACS serial.
		if (serialNo) {
			const existingBySerial = await findExistingDeviceEventByAcsSerial(prisma, {
				organizationId: data.device.organizationId,
				deviceId: data.device.id,
				serialNo,
				eventTime: data.eventTime,
			});
			if (existingBySerial) {
				const existingEmployeeNo = String(existingBySerial.employeeNo || "").trim();
				const incomingEmployeeNo = String(data.employeeNo || "").trim();
				const filledEmptyToPlain = !existingEmployeeNo && Boolean(incomingEmployeeNo);
				const existingPayload =
					existingBySerial.payload && typeof existingBySerial.payload === "object"
						? existingBySerial.payload
						: {};
				const mergedPayload = stampCallbackEvidence(
					{ ...existingPayload, ...data.payload },
					data.source,
				);
				const taxonomy = buildPersistedDeviceEventTaxonomy({
					source: data.source,
					status: existingBySerial.status || "RECEIVED",
					eventType: data.event.eventType
						? String(data.event.eventType)
						: existingBySerial.eventType,
					major: data.event.major
						? String(data.event.major)
						: existingBySerial.major,
					minor: data.event.minor
						? String(data.event.minor)
						: existingBySerial.minor,
					payload: mergedPayload,
					errorMessage: existingBySerial.errorMessage,
				});
				const updated = await eventClient.update({
					where: { id: existingBySerial.id },
					data: {
						...(filledEmptyToPlain
							? {
									employeeNo: incomingEmployeeNo,
									dedupeKey: data.dedupeKey,
								}
							: {}),
						payload: mergedPayload,
						...taxonomy,
					},
				});
				return { eventRecord: updated, isDuplicate: true };
			}
		}

		const stampedPayload = stampCallbackEvidence(data.payload, data.source);
		const taxonomy = buildPersistedDeviceEventTaxonomy({
			source: data.source,
			status: "RECEIVED",
			eventType: data.event.eventType ? String(data.event.eventType) : null,
			major: data.event.major ? String(data.event.major) : null,
			minor: data.event.minor ? String(data.event.minor) : null,
			payload: stampedPayload,
		});

		try {
			const eventRecord = await eventClient.create({
				data: {
					organizationId: data.device.organizationId,
					deviceId: data.device.id,
					eventTime: data.eventTime,
					employeeNo: data.employeeNo || null,
					source: data.source,
					status: "RECEIVED",
					...taxonomy,
					eventType: data.event.eventType ? String(data.event.eventType) : null,
					major: data.event.major ? String(data.event.major) : null,
					minor: data.event.minor ? String(data.event.minor) : null,
					doorNo: data.event.doorNo ? String(data.event.doorNo) : null,
					verifyMode: data.event.verifyMode
						? String(data.event.verifyMode)
						: null,
					dedupeKey: data.dedupeKey,
					payload: stampedPayload,
				},
			});
			return { eventRecord, isDuplicate: false };
		} catch (error: any) {
			// Concurrent callbacks can race past findFirst → P2002 on dedupeKey.
			// Treat as duplicate success so SDK callback does not 500.
			const code = String(error?.code || "");
			if (code === "P2002") {
				const raced = await eventClient.findFirst({
					where: {
						organizationId: data.device.organizationId,
						dedupeKey: data.dedupeKey,
					},
				});
				if (raced) {
					return { eventRecord: raced, isDuplicate: true };
				}
			}
			throw error;
		}
	};

	const updateDeviceEventStatus = async (
		req: Request,
		eventId: string,
		data: {
			status: string;
			employeeId?: string | null;
			attendanceId?: string | null;
			errorMessage?: string | null;
		},
		deviceHint?: any,
	) => {
		const updated = await (prisma as any).deviceEvent.update({
			where: { id: eventId },
			data,
		});
		try {
			await invalidateCache.byPattern("cache:device:events:*");
		} catch {
			// Event cache expiry is short; callback processing should not fail on cache cleanup.
		}
		publishDeviceEventSaved(req, updated, deviceHint);
		return updated;
	};

	return {
		// Handle Hikvision webhook/callback events
		handleCallback: async (req: Request, res: Response, _next: NextFunction) => {
			let savedEventId: string | null = null;
			try {
				console.log("[HIKVISION_CALLBACK][CTRL] handleCallback invoked");
				console.log(
					`[HIKVISION_CALLBACK][CTRL] content-type=${req.get("content-type") || "unknown"}`,
				);
				const payload = parseHikvisionBodyPayload(req.body);
				const event = extractHikvisionEventData(payload);
				console.log("[HIKVISION_CALLBACK][CTRL] parsed payload:", payload);
				console.log("[HIKVISION_CALLBACK][CTRL] extracted event:", event);

				const device = await resolveCallbackDevice(req, event);
				if (!device?.id) {
					const successResponse = buildSuccessResponse(
						"Callback received but no HRIS device matched",
						{
							received: true,
							matched: false,
							reason: "device_not_found",
							event,
						},
						200,
					);
					res.status(200).json(successResponse);
					return;
				}

				const employeeNo = String(event.employeeNo || "").trim();
				const receivedAt = new Date();
				const knownSkewSeconds = Number(
					(device.config as any)?.hikvisionClockSkewSeconds || 0,
				);
				const eventWasAlreadyAdjusted = Boolean((event as any).timeAdjusted);
				const normalizedTime = eventWasAlreadyAdjusted
					? {
							eventTime: parseHikvisionEventTime(event.time),
							adjusted: true,
							originalTime: (event as any).deviceTime || event.time,
							skewSeconds: Number((event as any).deviceClockSkewSeconds || 0),
						}
					: normalizeHikvisionFutureSkewedEventTime(
							event.time,
							receivedAt,
							knownSkewSeconds,
						);
				const eventTime = normalizedTime.eventTime;
				if (normalizedTime.adjusted) {
					(event as any).deviceTime = event.time;
					(event as any).time = eventTime.toISOString();
					(event as any).timeAdjusted = true;
					(event as any).deviceClockSkewSeconds = normalizedTime.skewSeconds;
					if (!knownSkewSeconds && normalizedTime.skewSeconds > 0) {
						await (prisma as any).device.update({
							where: { id: device.id },
							data: {
								config: {
									...((device.config as any) || {}),
									hikvisionClockSkewSeconds: normalizedTime.skewSeconds,
									hikvisionClockSkewObservedAt: receivedAt.toISOString(),
								},
							},
						});
					}
				}
				const source = normalizeHikvisionDeviceEventSource(event.source);
				const dedupeKey = buildHikvisionDeviceEventDedupeKey({
					deviceId: device.id,
					source,
					eventTime,
					employeeNo,
					event,
				});
				const { eventRecord, isDuplicate } = await saveInitialDeviceEvent({
					device,
					event,
					payload: withHikvisionPanelSelectStatus(payload),
					eventTime,
					employeeNo,
					source,
					dedupeKey,
				});
				savedEventId = eventRecord.id;

				if (isDuplicate) {
					publishDeviceEventSaved(req, eventRecord, device);
					const successResponse = buildSuccessResponse(
						"Duplicate callback received; existing event reused",
						{
							received: true,
							duplicate: true,
							eventId: eventRecord.id,
							status: eventRecord.status,
							employeeNo: eventRecord.employeeNo,
							employeeId: eventRecord.employeeId,
							attendanceId: eventRecord.attendanceId,
							dedupeKey,
						},
						200,
					);
					res.status(200).json(successResponse);
					return;
				}

				if (!isHikvisionAttendancePunchEvent(event)) {
					console.log(
						`[HIKVISION_CALLBACK][CTRL] ignored non-attendance event major=${event.major} minor=${event.minor}`,
					);
					await updateDeviceEventStatus(req, eventRecord.id, {
						status: "IGNORED",
						errorMessage: "non_attendance_device_event",
					}, device);
					const successResponse = buildSuccessResponse(
						"Callback received but event is not an attendance punch",
						{
							received: true,
							matched: false,
							employeeNo,
							reason: "non_attendance_device_event",
							eventId: eventRecord.id,
							dedupeKey,
							event,
						},
						200,
					);
					res.status(200).json(successResponse);
					return;
				}

				if (!employeeNo) {
					console.log(
						"[HIKVISION_CALLBACK][CTRL] no employeeNo found; callback will be acknowledged and ignored",
					);
					await updateDeviceEventStatus(req, eventRecord.id, {
						status: "IGNORED",
						errorMessage: "missing_employee_no",
					}, device);
					const successResponse = buildSuccessResponse(
						"Callback received without employeeNo; event ignored",
						{
							received: true,
							matched: false,
							reason: "missing_employee_no",
							eventId: eventRecord.id,
							dedupeKey,
							event,
						},
						200,
					);
					res.status(200).json(successResponse);
					return;
				}

				const employee = await prisma.employee.findFirst({
					where: {
						isDeleted: false,
						organizationId: device.organizationId,
						deviceEmpId: employeeNo,
					},
					select: {
						id: true,
						organizationId: true,
						deviceEmpId: true,
					},
				});

				if (!employee) {
					console.log(
						`[HIKVISION_CALLBACK][CTRL] no employee matched by deviceEmpId=${employeeNo}`,
					);
					await updateDeviceEventStatus(req, eventRecord.id, {
						status: "UNMATCHED",
						errorMessage: "employee_not_found",
					}, device);
					const successResponse = buildSuccessResponse(
						"Callback received but no employee matched by deviceEmpId",
						{
							received: true,
							matched: false,
							employeeNo,
							reason: "employee_not_found",
							eventId: eventRecord.id,
							dedupeKey,
							event,
						},
						200,
					);
					res.status(200).json(successResponse);
					return;
				}

				console.log(
					`[HIKVISION_CALLBACK][CTRL] matched employee=${employee.id} eventTime=${eventTime.toISOString()}`,
				);
				const { where: attendanceQuery, startOfDay: normalizedStartOfDay } =
					buildAttendanceDateQuery(employee.id, eventTime, employee.organizationId);

				const existingAttendance = await prisma.attendance.findFirst({
					where: attendanceQuery,
					orderBy: {
						createdAt: "desc",
					},
				});

				let attendanceAction = "ignored";
				let attendanceId: string | null = null;
				const resolvedSchedule = await resolveEffectiveShift(prisma, {
					organizationId: employee.organizationId,
					employeeId: employee.id,
					date: eventTime,
				});
				const activeSchedule = resolvedSchedule || resolveEmployeeActiveSchedule(employee);
				const sameDayDeviceEvents = await (prisma as any).deviceEvent.findMany({
					where: {
						organizationId: employee.organizationId,
						employeeNo,
						eventTime: {
							gte: normalizedStartOfDay,
							lte: (attendanceQuery as any).date.lte,
						},
						status: {
							notIn: ["FAILED", "UNMATCHED"],
						},
					},
					select: {
						id: true,
						eventTime: true,
						payload: true,
					},
					orderBy: {
						eventTime: "asc",
					},
				});
				const minimumPunchPairGapMinutes = getMinimumPunchPairGapMinutes(device);
				const pairPunchesAsClockOut = canPairPunchesAsClockOut(device);
				const punchPair = selectHikvisionPunchPair(sameDayDeviceEvents, {
					minPairGapMinutes: minimumPunchPairGapMinutes,
				});
				const existingTimeIn = existingAttendance?.timeIn
					? new Date(existingAttendance.timeIn)
					: null;
				const existingTimeOut = existingAttendance?.timeOut
					? new Date(existingAttendance.timeOut)
					: null;
				const usesPanelStatus = punchPair.mode === "panel";
				const punchTimeIn =
					punchPair.timeIn ||
					(usesPanelStatus ? existingTimeIn : existingTimeIn || eventTime);
				const punchTimeOut = usesPanelStatus
					? punchPair.timeOut
					: pairPunchesAsClockOut
						? punchPair.timeOut || existingTimeOut || null
						: existingTimeOut || null;
				const sameTime = (left?: Date | null, right?: Date | null) =>
					(left?.getTime() || 0) === (right?.getTime() || 0);
				const timesUnchanged =
					Boolean(existingAttendance) &&
					sameTime(existingTimeIn, punchTimeIn) &&
					sameTime(existingTimeOut, punchTimeOut);
				const isRepeatPunchWithinGap = timesUnchanged;
				const isOutOfOrderOrAlreadyCovered =
					Boolean(existingAttendance) &&
					!usesPanelStatus &&
					((existingTimeIn && eventTime.getTime() <= existingTimeIn.getTime()) ||
						(existingTimeOut &&
							eventTime.getTime() <= (existingTimeOut as Date).getTime()));
				const persistedSchedule = normalizeEmployeeScheduleSnapshot(
					existingAttendance?.scheduleSnapshot || null,
				);
				const scheduleForCalculation = persistedSchedule || activeSchedule;
				const timekeepingCalc = calculateTimekeeping(
					punchTimeIn,
					punchTimeOut,
					scheduleForCalculation,
					punchTimeIn,
				);
				const finalStatus = determineAttendanceStatus(
					timekeepingCalc,
					Boolean(punchTimeOut),
				);
				const overtimeApplication = await resolveOvertimePolicyApplication(
					prisma,
					employee.organizationId,
					{
						calc: timekeepingCalc,
						timeIn: punchTimeIn,
						timeOut: punchTimeOut,
						schedule: scheduleForCalculation,
						date: punchTimeIn,
						attendanceStatus: finalStatus,
					},
				);
				const attendanceTimekeepingData = {
					timeIn: punchTimeIn,
					timeOut: punchTimeOut,
					status: finalStatus,
					deviceInfo: {
						source,
						deviceId: device.id,
						deviceName: device.name,
						eventId: eventRecord.id,
						dedupeKey,
						punchEventCount: punchPair.count,
						minimumPunchPairGapMinutes,
						pairPunchesAsClockOut,
						pairMode: punchPair.mode,
					},
					behaviorFlags:
						finalStatus === "LEAVE" ? [] : overtimeApplication.behaviorFlags,
					...(await fetchAttendanceEmployeeSnapshotFields(prisma, employee.id)),
					...overtimeApplication.timekeepingFields,
				};

				if (isRepeatPunchWithinGap || isOutOfOrderOrAlreadyCovered) {
					attendanceAction = isRepeatPunchWithinGap
						? "repeat_punch_ignored"
						: "duplicate_or_out_of_order_ignored";
					attendanceId = existingAttendance?.id || null;
					console.log(
						`[HIKVISION_CALLBACK][CTRL] ignored ${attendanceAction} employee=${employee.id} eventTime=${eventTime.toISOString()} minimumPunchPairGapMinutes=${minimumPunchPairGapMinutes}`,
					);
				} else if (!existingAttendance) {
					const created = await prisma.attendance.create({
						data: {
							organizationId: employee.organizationId,
							employeeId: employee.id,
							date: normalizedStartOfDay,
							isManualEntry: false,
							scheduleSnapshot: activeSchedule,
							...attendanceTimekeepingData,
						},
					});
					attendanceAction = "clock_in_created";
					attendanceId = created.id;
					console.log(
						`[HIKVISION_CALLBACK][CTRL] created attendance timeIn id=${created.id}`,
					);
				} else {
					const updated = await prisma.attendance.update({
						where: { id: existingAttendance.id },
						data: {
							...attendanceTimekeepingData,
							scheduleSnapshot: existingAttendance.scheduleSnapshot || activeSchedule,
						},
					});
					attendanceAction = punchTimeOut ? "clock_out_updated" : "clock_in_created";
					attendanceId = updated.id;
					console.log(
						`[HIKVISION_CALLBACK][CTRL] updated attendance from device ledger id=${updated.id}`,
					);
				}

				if (
					attendanceId &&
					(attendanceAction === "clock_in_created" ||
						attendanceAction === "clock_out_updated")
				) {
					const obligation = await applyAttendanceToObligation(prisma, {
						organizationId: employee.organizationId,
						employeeId: employee.id,
						attendanceId,
					});
					emitAttendanceRealtimeEvent((req as any).io, {
						attendanceId,
						obligation,
						organizationId: employee.organizationId,
						employeeId: employee.id,
						action:
							attendanceAction === "clock_out_updated"
								? "clock_out_updated"
								: "clock_in_created",
						source,
					});
					const refreshedTimesheet = await refreshTimesheetForAttendanceDate(prisma, {
						organizationId: employee.organizationId,
						employeeId: employee.id,
						date: punchTimeIn || eventTime,
					});
					if (refreshedTimesheet) {
						await invalidateCache.byPattern("cache:timesheet:*");
					}
				}

				if (attendanceAction === "clock_in_created") {
					await updateDeviceEventStatus(req, eventRecord.id, {
						status: "ATTENDANCE_CREATED",
						employeeId: employee.id,
						attendanceId,
						errorMessage: null,
					}, device);
				} else if (attendanceAction === "clock_out_updated") {
					await updateDeviceEventStatus(req, eventRecord.id, {
						status: "ATTENDANCE_UPDATED",
						employeeId: employee.id,
						attendanceId,
						errorMessage: null,
					}, device);
				} else if (
					attendanceAction === "repeat_punch_ignored" ||
					attendanceAction === "duplicate_or_out_of_order_ignored"
				) {
					await updateDeviceEventStatus(req, eventRecord.id, {
						status: "MATCHED",
						employeeId: employee.id,
						attendanceId,
						errorMessage: attendanceAction,
					}, device);
				}

				const successResponse = buildSuccessResponse(
					"Hikvision callback processed",
					{
						received: true,
						matched: true,
						eventId: eventRecord.id,
						deviceId: device.id,
						dedupeKey,
						employeeNo,
						employeeId: employee.id,
						attendanceAction,
						attendanceId,
						event,
					},
					200,
				);
				res.status(200).json(successResponse);
			} catch (error: any) {
				console.error("[HIKVISION_CALLBACK][CTRL] error:", error);
				if (savedEventId) {
					try {
						await updateDeviceEventStatus(req, savedEventId, {
							status: "FAILED",
							errorMessage: error?.message || "callback_processing_failed",
						});
					} catch (updateError) {
						console.error("[HIKVISION_CALLBACK][CTRL] failed to mark event failed:", updateError);
					}
				}
				const errorResponse = buildErrorResponse(
					error?.message || "Failed to process Hikvision callback",
					500,
				);
				res.status(500).json(errorResponse);
			}
		},
	};
};
