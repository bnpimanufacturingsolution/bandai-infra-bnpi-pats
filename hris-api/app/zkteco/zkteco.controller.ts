import { Request, Response, NextFunction } from "express";
import { PrismaClient } from "../../generated/prisma";
import { buildSuccessResponse } from "../../helper/success-handler.helper";
import { buildErrorResponse } from "../../helper/error-handler";
import { invalidateCache } from "../../middleware/cache";
import { emitDeviceEventSaved } from "../../helper/device-event-realtime.helper";
import {
	buildZktecoDeviceEventDedupeKey,
	isZktecoAttendancePunchEvent,
	normalizeZktecoPayload,
	parseZktecoEventTime,
	ZKTECO_DEVICE_EVENT_SOURCE,
} from "../../helper/zkteco-event-contract.helper";

export const controller = (prisma: PrismaClient) => {
	const publishDeviceEventSaved = (req: Request, eventRecord: any) =>
		emitDeviceEventSaved((req as any).io, eventRecord);

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

			await updateEventStatus(req, eventRecord.id, {
				status: "MATCHED",
				employeeId: employee.id,
				attendanceId: null,
				errorMessage: null,
			});

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
						attendanceAction: "not_applied",
						attendanceId: null,
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
