import type { Server as SocketIOServer } from "socket.io";

export type AttendanceRealtimeAction =
	| "clock_in_created"
	| "clock_out_updated"
	| "attendance_created"
	| "attendance_updated"
	| "attendance_correction_applied";

export type AttendanceRealtimePayload = {
	attendanceId?: string | null;
	obligationId?: string | null;
	organizationId?: string | null;
	employeeId?: string | null;
	businessDate?: string | null;
	status?: string | null;
	action: AttendanceRealtimeAction;
	source?: string | null;
	emittedAt: string;
};

const toIsoDateValue = (value: unknown) => {
	if (!value) return null;
	if (value instanceof Date) return value.toISOString();
	return String(value);
};

export const buildAttendanceRealtimePayload = (params: {
	attendance?: any;
	obligation?: any;
	organizationId?: string | null;
	employeeId?: string | null;
	attendanceId?: string | null;
	action: AttendanceRealtimeAction;
	source?: string | null;
}): AttendanceRealtimePayload | null => {
	const organizationId =
		params.organizationId || params.obligation?.organizationId || params.attendance?.organizationId || null;
	const employeeId = params.employeeId || params.obligation?.employeeId || params.attendance?.employeeId || null;
	const attendanceId = params.attendanceId || params.attendance?.id || params.obligation?.attendanceId || null;

	if (!organizationId && !employeeId && !attendanceId) return null;

	return {
		attendanceId,
		obligationId: params.obligation?.id || null,
		organizationId,
		employeeId,
		businessDate: toIsoDateValue(params.obligation?.businessDate),
		status: params.obligation?.status || params.attendance?.status || null,
		action: params.action,
		source: params.source || null,
		emittedAt: new Date().toISOString(),
	};
};

export const emitAttendanceRealtimeEvent = (
	io: SocketIOServer | undefined | null,
	params: Parameters<typeof buildAttendanceRealtimePayload>[0],
) => {
	if (!io) return null;

	const payload = buildAttendanceRealtimePayload(params);
	if (!payload) return null;

	if (payload.organizationId) {
		io.to(`attendance:org:${payload.organizationId}`).emit("attendance:event", payload);
	}
	if (payload.employeeId) {
		io.to(`employee:${payload.employeeId}`).emit("attendance:event", payload);
	}

	return payload;
};
