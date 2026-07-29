import type { Server as SocketIOServer } from "socket.io";

/**
 * FE/BE realtime contract for Device Events:
 * - FE "All devices" joins only `device-events:org:{orgId}`.
 * - FE single-device filter joins org + `device-events:device:{deviceId}`.
 * - Emit MUST fan-out to each room independently (UNION), never chain
 *   `.to(org).to(device)` (Socket.IO intersection would drop All-devices clients).
 * - Prefer attaching a slim `event` row so FE can prepend without HTTP refetch.
 */
export type DeviceEventRealtimePayload = {
	eventId: string;
	organizationId?: string | null;
	deviceId?: string | null;
	status?: string | null;
	source?: string | null;
	eventTime?: Date | string | null;
	receivedAt?: Date | string | null;
	updatedAt?: Date | string | null;
	emittedAt: string;
	/** Optional full/slim DeviceEvent row for instant FE prepend */
	event?: Record<string, unknown> | null;
	employeeNo?: string | null;
	eventCategory?: string | null;
	eventAction?: string | null;
};

const pickEventFields = (eventRecord: any): Record<string, unknown> | null => {
	if (!eventRecord?.id) return null;
	// Prefer an already-shaped row; otherwise build a slim projection.
	return {
		id: eventRecord.id,
		organizationId: eventRecord.organizationId ?? null,
		deviceId: eventRecord.deviceId ?? null,
		status: eventRecord.status ?? null,
		source: eventRecord.source ?? null,
		employeeNo: eventRecord.employeeNo ?? null,
		employeeName: eventRecord.employeeName ?? null,
		eventCategory: eventRecord.eventCategory ?? null,
		eventAction: eventRecord.eventAction ?? null,
		eventTime: eventRecord.eventTime ?? null,
		receivedAt: eventRecord.receivedAt ?? null,
		updatedAt: eventRecord.updatedAt ?? null,
		evidenceSource: eventRecord.evidenceSource ?? null,
		device: eventRecord.device ?? undefined,
		payload: eventRecord.payload ?? undefined,
	};
};

export const buildDeviceEventRealtimePayload = (
	eventRecord: any,
): DeviceEventRealtimePayload | null => {
	if (!eventRecord?.id) return null;

	const slim = pickEventFields(eventRecord);

	return {
		eventId: eventRecord.id,
		organizationId: eventRecord.organizationId,
		deviceId: eventRecord.deviceId,
		status: eventRecord.status,
		source: eventRecord.source,
		eventTime: eventRecord.eventTime,
		receivedAt: eventRecord.receivedAt,
		updatedAt: eventRecord.updatedAt,
		emittedAt: new Date().toISOString(),
		event: slim,
		employeeNo: eventRecord.employeeNo ?? null,
		eventCategory: eventRecord.eventCategory ?? null,
		eventAction: eventRecord.eventAction ?? null,
	};
};

export const emitDeviceEventSaved = (
	io: SocketIOServer | undefined | null,
	eventRecord: any,
) => {
	if (!io) return null;

	const payload = buildDeviceEventRealtimePayload(eventRecord);
	if (!payload) return null;

	const organizationRoom = payload.organizationId
		? `device-events:org:${payload.organizationId}`
		: null;
	const deviceRoom = payload.deviceId ? `device-events:device:${payload.deviceId}` : null;

	// UNION fan-out: each room receives the event independently.
	// Do NOT chain .to(a).to(b) — that is intersection in Socket.IO.
	if (organizationRoom) {
		io.to(organizationRoom).emit("device-event:saved", payload);
	}
	if (deviceRoom) {
		io.to(deviceRoom).emit("device-event:saved", payload);
	}
	if (!organizationRoom && !deviceRoom) {
		// Last resort: no room keys — do not broadcast globally.
		return payload;
	}

	return payload;
};
