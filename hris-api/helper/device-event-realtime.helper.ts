import type { Server as SocketIOServer } from "socket.io";

export type RealtimeDeviceEventRow = {
	id: string;
	organizationId?: string | null;
	deviceId?: string | null;
	device?: {
		id?: string | null;
		name?: string | null;
		address?: string | null;
		port?: number | null;
		protocol?: string | null;
	} | null;
	employee?: {
		id?: string | null;
		employeeId?: string | null;
		deviceEmpId?: string | null;
		fullName?: string | null;
	} | null;
	employeeId?: string | null;
	attendanceId?: string | null;
	eventTime?: Date | string | null;
	receivedAt?: Date | string | null;
	employeeNo?: string | null;
	source?: string | null;
	status?: string | null;
	eventType?: string | null;
	major?: string | null;
	minor?: string | null;
	doorNo?: string | null;
	verifyMode?: string | null;
	dedupeKey?: string | null;
	payload?: unknown;
	errorMessage?: string | null;
	createdAt?: Date | string | null;
	updatedAt?: Date | string | null;
};

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
	event?: RealtimeDeviceEventRow;
};

const buildRealtimeDeviceSnapshot = (device: any) => {
	if (!device) return null;
	return {
		id: device.id,
		name: device.name,
		address: device.address,
		port: device.port,
		protocol: device.protocol,
	};
};

const buildRealtimeEmployeeSnapshot = (employee: any) => {
	if (!employee) return null;
	return {
		id: employee.id,
		employeeId: employee.employeeId,
		deviceEmpId: employee.deviceEmpId,
		fullName: employee.fullName,
	};
};

export const buildRealtimeDeviceEventRow = (eventRecord: any): RealtimeDeviceEventRow | null => {
	if (!eventRecord?.id) return null;

	return {
		id: eventRecord.id,
		organizationId: eventRecord.organizationId,
		deviceId: eventRecord.deviceId,
		device: buildRealtimeDeviceSnapshot(eventRecord.device),
		employee: buildRealtimeEmployeeSnapshot(eventRecord.employee),
		employeeId: eventRecord.employeeId,
		attendanceId: eventRecord.attendanceId,
		eventTime: eventRecord.eventTime,
		receivedAt: eventRecord.receivedAt,
		employeeNo: eventRecord.employeeNo,
		source: eventRecord.source,
		status: eventRecord.status,
		eventType: eventRecord.eventType,
		major: eventRecord.major,
		minor: eventRecord.minor,
		doorNo: eventRecord.doorNo,
		verifyMode: eventRecord.verifyMode,
		dedupeKey: eventRecord.dedupeKey,
		payload: eventRecord.payload,
		errorMessage: eventRecord.errorMessage,
		createdAt: eventRecord.createdAt,
		updatedAt: eventRecord.updatedAt,
	};
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
		event: buildRealtimeDeviceEventRow(eventRecord) || undefined,
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
