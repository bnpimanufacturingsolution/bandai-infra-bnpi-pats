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
	eventCategory?: string | null;
	eventAction?: string | null;
	eventLabel?: string | null;
	eventConfidence?: string | null;
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
	const personalInfo = employee?.person?.personalInfo || {};
	const fromPerson = [personalInfo.firstName, personalInfo.middleName, personalInfo.lastName]
		.map((part: any) => String(part || "").trim())
		.filter(Boolean)
		.join(" ")
		.trim();
	const fullName =
		String(employee.fullName || "").trim() || fromPerson || null;
	return {
		id: employee.id,
		employeeId: employee.employeeId,
		deviceEmpId: employee.deviceEmpId,
		fullName,
		// FE Device Events often reads personalInfo for the person column.
		person: employee.person
			? { personalInfo: employee.person.personalInfo || null }
			: fullName
				? { personalInfo: { firstName: fullName } }
				: null,
	};
};

const isLikelyOpaquePersonToken = (value: unknown) => {
	const token = String(value || "").trim();
	if (!token || token.length < 16) return false;
	if (/^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/.test(token) && !/[+/=]/.test(token)) return false;
	if (/^[A-Za-z0-9+/]{16,}={0,2}$/.test(token) && /[+/=]/.test(token)) return true;
	return token.length >= 20 && /[+/=]/.test(token);
};

/** Prefer plain device person id for socket UI; never surface opaque as employeeNo. */
const pickPlainEmployeeNoForSocket = (eventRecord: any): string | null => {
	const payload = (eventRecord?.payload || {}) as any;
	const deviceUserPlain = String(
		eventRecord?.deviceUser?.vendorUserId || eventRecord?.deviceUser?.employeeNo || "",
	).trim();
	const candidates = [
		deviceUserPlain,
		payload.resolvedEmployeeNo,
		eventRecord?.employeeNo,
		payload.employeeNo,
	];
	for (const raw of candidates) {
		const text = String(raw || "").trim();
		if (!text || text === "0") continue;
		if (isLikelyOpaquePersonToken(text)) continue;
		return text;
	}
	return null;
};

export const buildRealtimeDeviceEventRow = (eventRecord: any): RealtimeDeviceEventRow | null => {
	if (!eventRecord?.id) return null;

	const plainEmployeeNo = pickPlainEmployeeNoForSocket(eventRecord);
	const payload = (eventRecord.payload || {}) as any;
	const nextPayload =
		plainEmployeeNo && !payload.resolvedEmployeeNo
			? { ...payload, resolvedEmployeeNo: plainEmployeeNo }
			: payload;

	return {
		id: eventRecord.id,
		organizationId: eventRecord.organizationId,
		deviceId: eventRecord.deviceId,
		device: buildRealtimeDeviceSnapshot(eventRecord.device),
		employee: buildRealtimeEmployeeSnapshot(eventRecord.employee),
		// Include deviceUser so FE can deep-link vendorUserId without waiting on HTTP refetch.
		...(eventRecord.deviceUser
			? {
					deviceUser: {
						id: eventRecord.deviceUser.id,
						vendorUserId: eventRecord.deviceUser.vendorUserId,
						employeeNo: eventRecord.deviceUser.employeeNo,
						displayName: eventRecord.deviceUser.displayName,
					},
				}
			: {}),
		employeeId: eventRecord.employeeId,
		attendanceId: eventRecord.attendanceId,
		eventTime: eventRecord.eventTime,
		receivedAt: eventRecord.receivedAt,
		// Socket contract: plain person id only (opaque stays in payload.opaquePersonToken if any).
		employeeNo: plainEmployeeNo,
		source: eventRecord.source,
		status: eventRecord.status,
		eventType: eventRecord.eventType,
		eventCategory: eventRecord.eventCategory,
		eventAction: eventRecord.eventAction,
		eventLabel: eventRecord.eventLabel,
		eventConfidence: eventRecord.eventConfidence,
		major: eventRecord.major,
		minor: eventRecord.minor,
		doorNo: eventRecord.doorNo,
		verifyMode: eventRecord.verifyMode,
		dedupeKey: eventRecord.dedupeKey,
		payload: nextPayload,
		errorMessage: eventRecord.errorMessage,
		createdAt: eventRecord.createdAt,
		updatedAt: eventRecord.updatedAt,
	} as RealtimeDeviceEventRow;
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

	// Canonical live path: Socket rooms only (no poll required for Device Events).
	// Emit org room first — "All devices" view joins org only.
	// Emit device room second for device-scoped joins. Socket.IO dedupes clients in both.
	if (organizationRoom) {
		io.to(organizationRoom).emit("device-event:saved", payload);
	}
	if (deviceRoom) {
		io.to(deviceRoom).emit("device-event:saved", payload);
	}
	if (!organizationRoom && !deviceRoom) {
		io.emit("device-event:saved", payload);
	}

	return payload;
};
