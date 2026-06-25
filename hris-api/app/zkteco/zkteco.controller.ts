import { Request, Response, NextFunction } from "express";
import { PrismaClient } from "../../generated/prisma";
import { buildSuccessResponse } from "../../helper/success-handler.helper";
import { buildErrorResponse } from "../../helper/error-handler";
import {
	buildAttendanceDateQuery,
	buildAttendanceTimekeepingFields,
	fetchAttendanceEmployeeSnapshotFields,
} from "../../helper/attendance.helper";
import { applyAttendanceToObligation } from "../../helper/attendance-obligation.helper";
import { emitAttendanceRealtimeEvent } from "../../helper/attendance-realtime.helper";
import {
	normalizeEmployeeScheduleSnapshot,
	resolveEffectiveShift,
	resolveEmployeeActiveSchedule,
} from "../../helper/employee-schedule.helper";
import { refreshTimesheetForAttendanceDate } from "../../helper/timesheet.helper";
import {
	calculateTimekeeping,
	determineAttendanceStatus,
	deriveBehaviorFlags,
} from "../../helper/timekeeping.helper";
import { invalidateCache } from "../../middleware/cache";
import { emitDeviceEventSaved } from "../../helper/device-event-realtime.helper";
import {
	buildZktecoDeviceEventDedupeKey,
	DEFAULT_ZKTECO_MIN_PUNCH_PAIR_GAP_MINUTES,
	isZktecoAttendancePunchEvent,
	normalizeZktecoPayload,
	parseZktecoEventTime,
	selectZktecoPunchPair,
	ZKTECO_DEVICE_EVENT_SOURCE,
} from "../../helper/zkteco-event-contract.helper";

export const controller = (prisma: PrismaClient) => {
	const publishDeviceEventSaved = (req: Request, eventRecord: any) =>
		emitDeviceEventSaved((req as any).io, eventRecord);

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

	const getMinimumPunchPairGapMinutes = (device: any) =>
		Number((device?.config as any)?.zktecoMinPunchPairGapMinutes) ||
		DEFAULT_ZKTECO_MIN_PUNCH_PAIR_GAP_MINUTES;

	const canPairPunchesAsClockOut = (device: any) =>
		(device?.config as any)?.zktecoPairPunchesAsClockOut !== false;

	const resolveDevice = async (req: Request, event: ReturnType<typeof normalizeZktecoPayload>) => {
		const requestedDeviceId =
			String(event.deviceId || "").trim() ||
			String((req.query as any)?.deviceId || "").trim();
		const deviceIP = String(event.deviceIP || "").trim();

		const select = {
			id: true,
			organizationId: true,
			name: true,
			address: true,
			port: true,
			protocol: true,
			config: true,
		};

		if (requestedDeviceId) {
			return (prisma as any).device.findFirst({
				where: { id: requestedDeviceId, isDeleted: false },
				select,
			});
		}

		if (deviceIP) {
			return (prisma as any).device.findFirst({
				where: {
					address: deviceIP,
					...(event.devicePort ? { port: Number(event.devicePort) } : {}),
					isDeleted: false,
				},
				select,
			});
		}

		return null;
	};

	const saveEvent = async (data: {
		device: any;
		payload: Record<string, any>;
		eventTime: Date;
		employeeNo: string;
		event: ReturnType<typeof normalizeZktecoPayload>;
		dedupeKey: string;
	}) => {
		const eventClient = (prisma as any).deviceEvent;
		const existing = await eventClient.findFirst({
			where: {
				organizationId: data.device.organizationId,
				dedupeKey: data.dedupeKey,
			},
		});

		if (existing) return { eventRecord: existing, isDuplicate: true };

		const eventRecord = await eventClient.create({
			data: {
				organizationId: data.device.organizationId,
				deviceId: data.device.id,
				eventTime: data.eventTime,
				employeeNo: data.employeeNo || null,
				source: ZKTECO_DEVICE_EVENT_SOURCE,
				status: "RECEIVED",
				eventType: data.event.eventType || "AttendanceTransaction",
				verifyMode: data.event.verifyMode || null,
				major: data.event.attState !== undefined ? String(data.event.attState) : null,
				minor: data.event.attStateName || null,
				dedupeKey: data.dedupeKey,
				payload: data.payload,
			},
		});

		return { eventRecord, isDuplicate: false };
	};

	const updateEventStatus = async (
		req: Request,
		eventId: string,
		data: {
			status: string;
			employeeId?: string | null;
			attendanceId?: string | null;
			errorMessage?: string | null;
		},
	) => {
		const updated = await (prisma as any).deviceEvent.update({
			where: { id: eventId },
			data,
		});
		try {
			await invalidateCache.byPattern("cache:device:events:*");
		} catch {
			// Event cache expiry is short; ingestion should not fail on cache cleanup.
		}
		publishDeviceEventSaved(req, updated);
		return updated;
	};

	const handleEvent = async (req: Request, res: Response, _next: NextFunction) => {
		let savedEventId: string | null = null;
		try {
			const payload = req.body && typeof req.body === "object" ? req.body : {};
			const event = normalizeZktecoPayload(payload);
			const device = await resolveDevice(req, event);

			if (!device?.id) {
				res.status(200).json(
					buildSuccessResponse(
						"ZKTeco event received but no HRIS device matched",
						{
							received: true,
							matched: false,
							reason: "device_not_found",
							event,
						},
						200,
					),
				);
				return;
			}

			const employeeNo = String(event.employeeNo || "").trim();
			const eventTime = parseZktecoEventTime(event.time);
			const dedupeKey = buildZktecoDeviceEventDedupeKey({
				deviceId: device.id,
				eventTime,
				employeeNo,
				event,
			});
			const { eventRecord, isDuplicate } = await saveEvent({
				device,
				payload,
				eventTime,
				employeeNo,
				event,
				dedupeKey,
			});
			savedEventId = eventRecord.id;

			if (isDuplicate) {
				publishDeviceEventSaved(req, eventRecord);
				res.status(200).json(
					buildSuccessResponse(
						"Duplicate ZKTeco event received; existing event reused",
						{
							received: true,
							duplicate: true,
							eventId: eventRecord.id,
							status: eventRecord.status,
							employeeNo: eventRecord.employeeNo,
							employeeId: eventRecord.employeeId,
							dedupeKey,
						},
						200,
					),
				);
				return;
			}

			if (!isZktecoAttendancePunchEvent(event)) {
				await updateEventStatus(req, eventRecord.id, {
					status: "IGNORED",
					errorMessage: "non_attendance_device_event",
				});
				res.status(200).json(
					buildSuccessResponse(
						"ZKTeco event received but event is not an attendance punch",
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
					),
				);
				return;
			}

			if (!employeeNo) {
				await updateEventStatus(req, eventRecord.id, {
					status: "IGNORED",
					errorMessage: "missing_employee_no",
				});
				res.status(200).json(
					buildSuccessResponse(
						"ZKTeco event received without employee number; event recorded",
						{
							received: true,
							matched: false,
							reason: "missing_employee_no",
							eventId: eventRecord.id,
							dedupeKey,
						},
						200,
					),
				);
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
				await updateEventStatus(req, eventRecord.id, {
					status: "UNMATCHED",
					errorMessage: "employee_not_found",
				});
				res.status(200).json(
					buildSuccessResponse(
						"ZKTeco event received but no employee matched by deviceEmpId",
						{
							received: true,
							matched: false,
							employeeNo,
							reason: "employee_not_found",
							eventId: eventRecord.id,
							dedupeKey,
						},
						200,
					),
				);
				return;
			}

			const { where: attendanceQuery, startOfDay: normalizedStartOfDay } =
				buildAttendanceDateQuery(employee.id, eventTime, employee.organizationId);
			const existingAttendance = await prisma.attendance.findFirst({
				where: attendanceQuery,
				orderBy: { createdAt: "desc" },
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
					source: ZKTECO_DEVICE_EVENT_SOURCE,
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
			const punchPair = selectZktecoPunchPair(sameDayDeviceEvents, {
				minPairGapMinutes: minimumPunchPairGapMinutes,
			});
			const existingTimeIn = existingAttendance?.timeIn
				? new Date(existingAttendance.timeIn)
				: null;
			const existingTimeOut = existingAttendance?.timeOut
				? new Date(existingAttendance.timeOut)
				: null;
			const punchTimeIn = existingTimeIn || punchPair.timeIn || eventTime;
			const isNewerClockOutPunch =
				Boolean(existingTimeIn) &&
				eventTime.getTime() > (existingTimeIn as Date).getTime() &&
				(!existingTimeOut || eventTime.getTime() > (existingTimeOut as Date).getTime());
			const pairedTimeOut =
				pairPunchesAsClockOut &&
				isNewerClockOutPunch &&
				eventTime.getTime() - (existingTimeIn as Date).getTime() >=
					minimumPunchPairGapMinutes * 60 * 1000
					? eventTime
					: null;
			const punchTimeOut = pairedTimeOut || punchPair.timeOut || existingTimeOut || null;
			const isRepeatPunchWithinGap =
				Boolean(existingAttendance) &&
				Boolean(existingTimeIn) &&
				!existingTimeOut &&
				!pairedTimeOut &&
				eventTime.getTime() > (existingTimeIn as Date).getTime();
			const isOutOfOrderOrAlreadyCovered =
				Boolean(existingAttendance) &&
				((existingTimeIn && eventTime.getTime() <= existingTimeIn.getTime()) ||
					(existingTimeOut && eventTime.getTime() <= (existingTimeOut as Date).getTime()));
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
			const overtimeFlagThresholdMinutes = await getOvertimeFlagThresholdMinutes(
				employee.organizationId,
			);
			const finalStatus = determineAttendanceStatus(timekeepingCalc, Boolean(punchTimeOut));
			const attendanceTimekeepingData = {
				timeIn: punchTimeIn,
				timeOut: punchTimeOut,
				status: finalStatus,
				deviceInfo: {
					source: ZKTECO_DEVICE_EVENT_SOURCE,
					deviceId: device.id,
					deviceName: device.name,
					eventId: eventRecord.id,
					dedupeKey,
					punchEventCount: punchPair.count,
					minimumPunchPairGapMinutes,
					pairPunchesAsClockOut,
				},
				behaviorFlags:
					finalStatus === "LEAVE"
						? []
						: deriveBehaviorFlags({
								timeIn: punchTimeIn,
								timeOut: punchTimeOut,
								schedule: scheduleForCalculation,
								date: punchTimeIn,
								overtimeThresholdMinutes: overtimeFlagThresholdMinutes,
							}),
				...(await fetchAttendanceEmployeeSnapshotFields(prisma, employee.id)),
				...buildAttendanceTimekeepingFields(timekeepingCalc),
			};

			if (isRepeatPunchWithinGap || isOutOfOrderOrAlreadyCovered) {
				attendanceAction = isRepeatPunchWithinGap
					? "repeat_punch_ignored"
					: "duplicate_or_out_of_order_ignored";
				attendanceId = existingAttendance?.id || null;
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
					source: ZKTECO_DEVICE_EVENT_SOURCE,
				});
				const refreshedTimesheet = await refreshTimesheetForAttendanceDate(prisma, {
					organizationId: employee.organizationId,
					employeeId: employee.id,
					date: punchTimeIn,
				});
				if (refreshedTimesheet) {
					await invalidateCache.byPattern("cache:timesheet:*");
				}
			}

			if (attendanceAction === "clock_in_created") {
				await updateEventStatus(req, eventRecord.id, {
					status: "ATTENDANCE_CREATED",
					employeeId: employee.id,
					attendanceId,
					errorMessage: null,
				});
			} else if (attendanceAction === "clock_out_updated") {
				await updateEventStatus(req, eventRecord.id, {
					status: "ATTENDANCE_UPDATED",
					employeeId: employee.id,
					attendanceId,
					errorMessage: null,
				});
			} else {
				await updateEventStatus(req, eventRecord.id, {
					status: "MATCHED",
					employeeId: employee.id,
					attendanceId,
					errorMessage: attendanceAction === "ignored" ? null : attendanceAction,
				});
			}

			res.status(200).json(
				buildSuccessResponse(
					"ZKTeco event processed",
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
				),
			);
		} catch (error: any) {
			if (savedEventId) {
				try {
					await updateEventStatus(req, savedEventId, {
						status: "FAILED",
						errorMessage: error?.message || "zkteco_event_processing_failed",
					});
				} catch {
					// Keep the original response error.
				}
			}
			res.status(500).json(
				buildErrorResponse(error?.message || "Failed to process ZKTeco event", 500),
			);
		}
	};

	return {
		handleEvent,
	};
};
