export const ATTENDANCE_ADJUSTMENT_REASON_CATEGORIES = [
	"MISSED_PUNCH",
	"WRONG_STATUS",
	"MANUAL_REVIEW",
	"DEVICE_SYNC",
] as const;

export type AttendanceAdjustmentReasonCategory =
	(typeof ATTENDANCE_ADJUSTMENT_REASON_CATEGORIES)[number];

export type AttendanceRequestKind = "ATTENDANCE_ADJUSTMENT" | "OVERTIME";
export type AttendanceAdjustmentKind = "CLOCK_IN" | "CLOCK_OUT" | "CLOCK_IN_OUT";

export type AttendanceAdjustmentDraft = {
	employeeId: string;
	organizationId: string;
	date: string;
	timeIn: string;
	timeOut: string;
	reasonCategory: AttendanceAdjustmentReasonCategory;
	notes: string;
	attendanceId?: string | null;
	adjustmentKind?: AttendanceAdjustmentKind;
};

export type OvertimeRequestDraft = {
	employeeId: string;
	organizationId: string;
	date: string;
	overtimeHours: number;
	notes: string;
};

export const manilaDateAndTimeToIso = (dateYmd: string, hhmm: string): string | null => {
	const date = String(dateYmd || "").trim();
	const time = String(hhmm || "").trim();
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
	if (!/^\d{2}:\d{2}$/.test(time)) return null;
	const parsed = new Date(`${date}T${time}:00+08:00`);
	if (Number.isNaN(parsed.getTime())) return null;
	return parsed.toISOString();
};

export const isoToManilaPickerTime = (value?: string | null): string => {
	if (!value) return "";
	const trimmed = String(value).trim();
	if (!trimmed) return "";
	if (trimmed.includes("T")) {
		const parsed = new Date(trimmed);
		if (Number.isNaN(parsed.getTime())) return "";
		const parts = new Intl.DateTimeFormat("en-US", {
			hour: "2-digit",
			minute: "2-digit",
			hour12: false,
			timeZone: "Asia/Manila",
		}).formatToParts(parsed);
		const hour = parts.find((part) => part.type === "hour")?.value ?? "00";
		const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
		return `${hour === "24" ? "00" : hour.padStart(2, "0")}:${minute}`;
	}
	if (/^\d{2}:\d{2}$/.test(trimmed)) return trimmed;
	return "";
};

export const formatPickerTime12Hour = (hhmm: string): string => {
	const match = String(hhmm || "").trim().match(/^(\d{1,2}):(\d{2})$/);
	if (!match) return String(hhmm || "").trim();
	const hours24 = Number(match[1]);
	const minutes = match[2];
	if (!Number.isFinite(hours24) || hours24 < 0 || hours24 > 23) return hhmm;
	const meridiem = hours24 >= 12 ? "PM" : "AM";
	const hours12 = hours24 % 12 || 12;
	return `${hours12}:${minutes} ${meridiem}`;
};

export const buildAttendanceAdjustmentRequestPayload = (draft: AttendanceAdjustmentDraft) => {
	const date = String(draft.date || "").trim();
	const timeIn = String(draft.timeIn || "").trim();
	const timeOut = String(draft.timeOut || "").trim();
	const notes = String(draft.notes || "").trim();
	const reasonCategory = draft.reasonCategory || "MISSED_PUNCH";

	if (!draft.employeeId) throw new Error("Employee context is required.");
	if (!draft.organizationId) throw new Error("Organization context is required.");
	if (!date) throw new Error("Date is required.");
	if (!notes) throw new Error("Explain why this request is needed.");

	const kind = draft.adjustmentKind || (timeIn && timeOut ? "CLOCK_IN_OUT" : timeOut ? "CLOCK_OUT" : "CLOCK_IN");
	if (kind === "CLOCK_IN" && !timeIn) throw new Error("Time in is required.");
	if (kind === "CLOCK_OUT" && !timeOut) throw new Error("Time out is required.");
	if (kind === "CLOCK_IN_OUT" && (!timeIn || !timeOut)) {
		throw new Error("Time in and time out are required.");
	}

	const timeInIso = timeIn ? manilaDateAndTimeToIso(date, timeIn) : null;
	const timeOutIso = timeOut ? manilaDateAndTimeToIso(date, timeOut) : null;
	if (timeIn && !timeInIso) throw new Error("Time in must be valid.");
	if (timeOut && !timeOutIso) throw new Error("Time out must be valid.");
	if (timeInIso && timeOutIso && new Date(timeOutIso).getTime() <= new Date(timeInIso).getTime()) {
		throw new Error(
			`Time out (${formatPickerTime12Hour(timeOut)}) must be after time in (${formatPickerTime12Hour(timeIn)}).`,
		);
	}

	const kindLabel =
		kind === "CLOCK_IN" ? "clock-in" : kind === "CLOCK_OUT" ? "clock-out" : "clock-in and clock-out";
	const windowLabel = [timeIn, timeOut].filter(Boolean).join("–") || "no times";

	return {
		requesterId: draft.employeeId,
		organizationId: draft.organizationId,
		type: "ATTENDANCE_CORRECTION" as const,
		description: `Attendance adjustment (${kindLabel}) on ${date}. Requested ${windowLabel} Manila.`,
		startDate: `${date}T00:00:00.000Z`,
		endDate: `${date}T00:00:00.000Z`,
		notes,
		metadata: {
			date,
			adjustmentType: reasonCategory,
			adjustmentKind: kind,
			reason: notes,
			timeIn: timeInIso,
			timeOut: timeOutIso,
			attendanceCorrection: {
				attendanceId:
					draft.attendanceId &&
					!String(draft.attendanceId).startsWith("absent-") &&
					!String(draft.attendanceId).startsWith("expected-") &&
					!String(draft.attendanceId).startsWith("virtual-")
						? draft.attendanceId
						: null,
				employeeId: draft.employeeId,
				correctionDate: `${date}T00:00:00.000Z`,
				reasonCategory,
				reason: notes,
				correctedValues: {
					status: timeInIso && timeOutIso ? "PRESENT" : "INCOMPLETE",
					timeIn: timeInIso,
					timeOut: timeOutIso,
					notes,
				},
			},
		},
	};
};

export const buildOvertimeRequestPayload = (draft: OvertimeRequestDraft) => {
	const date = String(draft.date || "").trim();
	const notes = String(draft.notes || "").trim();
	const overtimeHours = Number(draft.overtimeHours);

	if (!draft.employeeId) throw new Error("Employee context is required.");
	if (!draft.organizationId) throw new Error("Organization context is required.");
	if (!date) throw new Error("Date is required.");
	if (!Number.isFinite(overtimeHours) || overtimeHours <= 0) {
		throw new Error("Overtime hours must be greater than 0.");
	}
	if (!notes) throw new Error("Explain why overtime is needed.");

	return {
		requesterId: draft.employeeId,
		organizationId: draft.organizationId,
		type: "OVERTIME" as const,
		description: `Overtime request on ${date} for ${overtimeHours} hour(s).`,
		startDate: `${date}T00:00:00.000Z`,
		endDate: `${date}T00:00:00.000Z`,
		notes,
		metadata: {
			date,
			overtimeHours,
			reason: notes,
			requestSource: "EMPLOYEE_SELF_SERVICE",
		},
	};
};
