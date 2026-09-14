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
	/**
	 * Employee the adjustment is FOR: the signed-in employee, or the member
	 * when a line leader files on behalf (2026-09-09 requirement).
	 */
	employeeId: string;
	organizationId: string;
	date: string;
	timeIn: string;
	timeOut: string;
	reasonCategory: AttendanceAdjustmentReasonCategory;
	notes: string;
	attendanceId?: string | null;
	adjustmentKind?: AttendanceAdjustmentKind;
	/**
	 * On-behalf filing context (line leader files a timesheet adjustment for a
	 * section member). When set, requesterId stays the LEADER and
	 * targetEmployeeId carries the member so the backend routes the
	 * leader-filed workflow and the approval side effect writes to the
	 * member's attendance.
	 */
	onBehalf?: {
		requesterEmployeeId: string;
		filedByRole: string;
	};
};

/** Overtime kind: REGULAR = after shift; EARLY = pre-shift (rendered early OT). */
export type OvertimeRequestKind = "REGULAR" | "EARLY";

export type OvertimeRequestDraft = {
	/** Employee the OT is FOR: the signed-in employee, or the member when a line leader files on behalf. */
	employeeId: string;
	organizationId: string;
	date: string;
	overtimeHours?: number;
	overtimeHourPart?: number;
	overtimeMinutePart?: number;
	notes: string;
	/** REGULAR (default) = after shift; EARLY = worked before the shift started. */
	overtimeKind?: OvertimeRequestKind;
	/**
	 * On-behalf filing context (line leader files for a section member).
	 * When set, requesterId stays the LEADER and targetEmployeeId carries the
	 * member so the backend routes the leader-filed workflow and approval
	 * side effects write OT to the member's timesheet.
	 */
	onBehalf?: {
		requesterEmployeeId: string;
		filedByRole: string;
	};
};

export const overtimeDurationToMinutes = (
	hourPart?: number,
	minutePart?: number,
	legacyHours?: number,
): number => {
	const hours = Number(hourPart);
	const minutes = Number(minutePart);
	if (Number.isFinite(hours) || Number.isFinite(minutes)) {
		const safeHours = Number.isFinite(hours) ? Math.max(0, Math.floor(hours)) : 0;
		const safeMinutes = Number.isFinite(minutes) ? Math.max(0, Math.min(59, Math.floor(minutes))) : 0;
		return safeHours * 60 + safeMinutes;
	}
	const legacy = Number(legacyHours);
	if (Number.isFinite(legacy) && legacy > 0) {
		return Math.round(legacy * 60);
	}
	return 0;
};

export const formatOvertimeMinutesAsHours = (totalMinutes: number): string => {
	const minutes = Math.max(0, Math.round(totalMinutes));
	const hours = Math.floor(minutes / 60);
	const rest = minutes % 60;
	return `${hours}:${String(rest).padStart(2, "0")}`;
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

	// Leader-filed on-behalf: the adjustment is FOR the member
	// (draft.employeeId), while the requester is the acting leader.
	const onBehalf =
		draft.onBehalf?.requesterEmployeeId &&
		draft.onBehalf.requesterEmployeeId !== draft.employeeId
			? draft.onBehalf
			: null;

	return {
		requesterId: onBehalf ? onBehalf.requesterEmployeeId : draft.employeeId,
		organizationId: draft.organizationId,
		type: "ATTENDANCE_CORRECTION" as const,
		...(onBehalf ? { targetEmployeeId: draft.employeeId } : {}),
		description: onBehalf
			? `Timesheet adjustment for section member on ${date} (${kindLabel}: ${windowLabel} Manila; leader-filed, manager approval).`
			: `Attendance adjustment (${kindLabel}) on ${date}. Requested ${windowLabel} Manila.`,
		startDate: `${date}T00:00:00.000Z`,
		endDate: `${date}T00:00:00.000Z`,
		notes,
		metadata: {
			date,
			// Approval side effects write to metadata.attendanceCorrection.employeeId
			// — always the member, never the filing leader.
			adjustmentType: reasonCategory,
			adjustmentKind: kind,
			reason: notes,
			timeIn: timeInIso,
			timeOut: timeOutIso,
			requestSource: onBehalf ? "LINE_LEADER_FILED" : "EMPLOYEE_SELF_SERVICE",
			// Manager-final chain (2026-09-09): member's manager approval applies
			// the correction; no HR step for leader-filed adjustments.
			workflowTarget: onBehalf ? "MANAGER_FINAL" : "MANAGER_THEN_HR",
			...(onBehalf
				? {
						filedBy: {
							role: onBehalf.filedByRole,
							employeeId: onBehalf.requesterEmployeeId,
							isLineLeader: onBehalf.filedByRole === "hris-line-leader" || undefined,
						},
						targetEmployeeId: draft.employeeId,
					}
				: {}),
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
	const overtimeMinutes = overtimeDurationToMinutes(
		draft.overtimeHourPart,
		draft.overtimeMinutePart,
		draft.overtimeHours,
	);
	const overtimeHoursLabel = formatOvertimeMinutesAsHours(overtimeMinutes);

	if (!draft.employeeId) throw new Error("Employee context is required.");
	if (!draft.organizationId) throw new Error("Organization context is required.");
	if (!date) throw new Error("Date is required.");
	if (overtimeMinutes <= 0) {
		throw new Error("Overtime duration must be greater than 0.");
	}
	if (!notes) throw new Error("Explain why overtime is needed.");

	// Leader-filed on-behalf: the OT is FOR the member (draft.employeeId),
	// while the requester is the acting leader.
	const onBehalf =
		draft.onBehalf?.requesterEmployeeId &&
		draft.onBehalf.requesterEmployeeId !== draft.employeeId
			? draft.onBehalf
			: null;
	const overtimeKind: OvertimeRequestKind =
		draft.overtimeKind === "EARLY" ? "EARLY" : "REGULAR";
	const kindLabel = overtimeKind === "EARLY" ? "early OT (pre-shift)" : "OT (after shift)";

	return {
		requesterId: onBehalf ? onBehalf.requesterEmployeeId : draft.employeeId,
		organizationId: draft.organizationId,
		type: "OVERTIME" as const,
		...(onBehalf ? { targetEmployeeId: draft.employeeId } : {}),
		description: onBehalf
			? `Overtime for section member on ${date} for ${overtimeHoursLabel} (${kindLabel}; leader-filed, manager approval).`
			: `Overtime request on ${date} for ${overtimeHoursLabel} (${kindLabel}; HR approval).`,
		startDate: `${date}T00:00:00.000Z`,
		endDate: `${date}T00:00:00.000Z`,
		notes,
		metadata: {
			date,
			// Approval side effects write OT to metadata.employeeId's timesheet —
			// always the member, never the filing leader.
			employeeId: draft.employeeId,
			overtimeHours: overtimeHoursLabel,
			requestedOvertimeHours: overtimeHoursLabel,
			requestedOvertimeMinutes: overtimeMinutes,
			hours: Math.round((overtimeMinutes / 60) * 100) / 100,
			reason: notes,
			// Early OT flag: pre-shift overtime. Payroll register mapping reads
			// this to bucket the hours separately from after-shift OT.
			overtimeKind,
			...(overtimeKind === "EARLY" ? { earlyOvertime: true } : {}),
			requestSource: onBehalf ? "LINE_LEADER_FILED" : "EMPLOYEE_SELF_SERVICE",
			// Manager-final chain (2026-09-08 operator decision): the member's
			// manager is the final approver for leader-filed OT.
			workflowTarget: onBehalf ? "MANAGER_FINAL" : "HR",
			...(onBehalf
				? {
						filedBy: {
							role: onBehalf.filedByRole,
							employeeId: onBehalf.requesterEmployeeId,
							isLineLeader: onBehalf.filedByRole === "hris-line-leader" || undefined,
						},
						targetEmployeeId: draft.employeeId,
					}
				: {}),
		},
	};
};
