export type AttendancePrimaryMarker = "HOLIDAY" | "LEAVE" | "REST_DAY" | "ABSENT" | "HOURS";

export type AttendanceFilterValue = "ALL" | "WORK_DAY" | "HOLIDAY" | "LEAVE";

export type AttendanceDisplayStatus =
	| "Clocked In"
	| "Present"
	| "Late"
	| "Half Day"
	| "Not Clocked In"
	| "Absent"
	| "Rest Day"
	| "Leave"
	| "Holiday"
	| string;

type MarkerAwareRecord = {
	status?: string | null;
	primaryMarker?: AttendancePrimaryMarker | string | null;
	leaveType?: string | null;
	leaveEntries?: Array<unknown> | null;
	holidayEntries?: Array<unknown> | null;
	timeIn?: string | null;
	timeOut?: string | null;
};

type AbsenceAwareRecord = MarkerAwareRecord & {
	timeIn?: string | null;
	timeOut?: string | null;
	hoursWorked?: string | null;
};

const ABSENCE_LIKE_STATUSES = new Set(["ABSENT", "AWOL"]);

const parseTimeStringToHours = (value?: string | null): number => {
	if (!value) return 0;
	if (!value.includes(":")) return Number(value) || 0;
	const [hours, minutes] = value.split(":").map(Number);
	if (Number.isNaN(hours) || Number.isNaN(minutes)) return 0;
	return hours + minutes / 60;
};

export const isAbsenceLikeStatus = (status?: string | null): boolean =>
	ABSENCE_LIKE_STATUSES.has((status || "").toUpperCase());

export const isVirtualAbsentLikeRecord = (record?: AbsenceAwareRecord | null): boolean => {
	if (!record) return false;
	const hasRecordedTime =
		(Boolean(record.timeIn) && Boolean(record.timeOut)) ||
		parseTimeStringToHours(record.hoursWorked) > 0;
	return isAbsenceLikeStatus(record.status) && !hasRecordedTime;
};

export const getAttendancePrimaryMarker = (record: MarkerAwareRecord): AttendancePrimaryMarker => {
	const marker = record?.primaryMarker;
	if (
		marker === "HOLIDAY" ||
		marker === "LEAVE" ||
		marker === "REST_DAY" ||
		marker === "ABSENT" ||
		marker === "HOURS"
	) {
		return marker;
	}

	const hasHoliday = Array.isArray(record?.holidayEntries) && record.holidayEntries.length > 0;
	if (hasHoliday) return "HOLIDAY";
	const hasLeave =
		(Array.isArray(record?.leaveEntries) && record.leaveEntries.length > 0) ||
		Boolean(record?.leaveType) ||
		record?.status === "LEAVE";
	if (hasLeave) return "LEAVE";
	if (record?.status === "REST_DAY") return "REST_DAY";
	if (isAbsenceLikeStatus(record?.status)) return "ABSENT";
	return "HOURS";
};

export const getAttendanceDisplayStatus = (record: MarkerAwareRecord): AttendanceDisplayStatus => {
	const marker = getAttendancePrimaryMarker(record);
	if (marker === "HOLIDAY") return "Holiday";
	if (marker === "LEAVE") return "Leave";

	switch (record?.status) {
		case "PRESENT":
			if (record?.timeIn && !record?.timeOut) return "Clocked In";
			return "Present";
		case "INCOMPLETE":
			return "Clocked In";
		case "LATE":
			if (record?.timeIn && !record?.timeOut) return "Clocked In";
			return "Late";
		case "HALF_DAY":
			return "Half Day";
		case "NOT_CLOCKED_IN":
			return "Not Clocked In";
		case "MISSING_SCHEDULE":
			return "Missing Schedule";
		case "ABSENT":
		case "AWOL":
			return "Absent";
		case "REST_DAY":
			return "Rest Day";
		case "LEAVE":
			return "Leave";
		default:
			return (record?.status || "—") as AttendanceDisplayStatus;
	}
};

export const getAttendanceFilterBucket = (record: MarkerAwareRecord): AttendanceFilterValue | "OTHER" => {
	const display = getAttendanceDisplayStatus(record);
	if (display === "Holiday") return "HOLIDAY";
	if (display === "Leave") return "LEAVE";
	if (
		display === "Present" ||
		display === "Clocked In" ||
		display === "Late" ||
		display === "Half Day"
	)
		return "WORK_DAY";
	return "OTHER";
};

export const matchesAttendanceFilter = (
	record: MarkerAwareRecord,
	filter: AttendanceFilterValue,
): boolean => {
	if (filter === "ALL") return true;
	const bucket = getAttendanceFilterBucket(record);
	return bucket === filter;
};

export const getAttendanceStatusBadgeClass = (displayStatus: AttendanceDisplayStatus): string => {
	switch (displayStatus) {
		case "Clocked In":
			return "border-amber-200 bg-amber-50 text-amber-700";
		case "Present":
			return "border-green-200 bg-green-50 text-green-700";
		case "Late":
			return "border-yellow-200 bg-yellow-50 text-yellow-700";
		case "Half Day":
			return "border-amber-200 bg-amber-50 text-amber-700";
		case "Not Clocked In":
			return "border-slate-200 bg-slate-50 text-slate-700";
		case "Absent":
			return "border-red-200 bg-red-50 text-red-700";
		case "Missing Schedule":
			return "border-rose-200 bg-rose-50 text-rose-700";
		case "Rest Day":
			return "border-gray-200 bg-gray-50 text-gray-700";
		case "Leave":
			return "border-violet-200 bg-violet-50 text-violet-700";
		case "Holiday":
			return "border-blue-200 bg-blue-50 text-blue-700";
		default:
			return "border-gray-200 bg-gray-50 text-gray-700";
	}
};
