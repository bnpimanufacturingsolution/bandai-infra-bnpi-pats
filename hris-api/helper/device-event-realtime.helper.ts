import type { Server as SocketIOServer } from "socket.io";

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
};

export const buildDeviceEventRealtimePayload = (eventRecord: any): DeviceEventRealtimePayload | null => {
	if (!eventRecord?.id) return null;

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

	let target: SocketIOServer | ReturnType<SocketIOServer["to"]> = io;
	if (organizationRoom) target = target.to(organizationRoom);
	if (deviceRoom) target = target.to(deviceRoom);
	target.emit("device-event:saved", payload);

	return payload;
};
