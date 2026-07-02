import { Edit } from "lucide-react";
import { format12HourTime, formatDuration } from "~/lib/utils";
import { isVirtualAbsentLikeRecord } from "~/lib/utils/attendance-status";
import { formatNightWindow } from "~/lib/utils/night-shift";

export interface TimesheetTooltipDayData {
	date: string;
	timeIn?: string | null;
	timeOut?: string | null;
	hoursWorked?: string | null;
	regularHours?: string | null;
	overtimeHours?: string | null;
	lateHours?: string | null;
	earlyOutHours?: string | null;
	breakMinutes?: number | null;
	breakDisplay?: string | null;
	status?: string | null;
	leaveType?: string | null;
	leaveEntries?: Array<{
		requestId?: string;
		leaveType: string;
		label: string;
		durationUnit?: string;
		halfDaySession?: string;
		startDate?: string;
		endDate?: string;
	}>;
	holidayEntries?: Array<{
		calendarItemId: string;
		title: string;
		startDate: string;
		endDate: string;
		tags?: string[];
	}>;
	primaryMarker?: "HOLIDAY" | "LEAVE" | "REST_DAY" | "ABSENT" | "HOURS";
	approvalStatus?: string | null;
	employeeNotes?: string | null;
	approverNotes?: string | null;
	metadata?: {
		businessDate?: string | null;
		breakMinutes?: number | null;
		breakDisplay?: string | null;
		scheduleRepair?: {
			code?: string | null;
			source?: string | null;
		} | null;
		rawLateMinutes?: number | null;
		gracePeriodMinutes?: number | null;
		rawEarlyOutMinutes?: number | null;
		graceEarlyOutMinutes?: number | null;
		withinGrace?: boolean | null;
	};
	businessDate?: string | null;
	nightShift?: {
		isNightShiftDay: boolean;
		scheduledWindow?: {
			startTime: string;
			endTime: string;
			isOvernight: boolean;
		};
		actualNightHours?: string;
	};
}

interface TimesheetDayTooltipContentProps {
	day: TimesheetTooltipDayData;
	modified?: boolean;
	onEdit?: () => void;
}

const parseHours = (timeStr?: string | null): number => {
	if (!timeStr) return 0;
	if (!timeStr.includes(":")) return Number(timeStr) || 0;
	const [hours, minutes] = timeStr.split(":").map(Number);
	if (Number.isNaN(hours) || Number.isNaN(minutes)) return 0;
	return hours + minutes / 60;
};

const parseDurationToMinutes = (timeStr?: string | null): number => {
	if (!timeStr) return 0;
	const [hours, minutes] = timeStr.split(":").map(Number);
	if (Number.isNaN(hours) || Number.isNaN(minutes)) return 0;
	return hours * 60 + minutes;
};

const normalizeBreakDisplay = (value: string): string => {
	const trimmed = value.trim();
	if (!trimmed) return "";
	if (trimmed.toLowerCase() === "no break") return "No break scheduled";
	return trimmed
		.replace(/\b([01]?\d|2[0-3]):([0-5]\d)\b/g, (_match, hour, minute) => {
			const numericHour = Number(hour);
			const period = numericHour >= 12 ? "PM" : "AM";
			const displayHour = numericHour % 12 || 12;
			return `${displayHour}:${minute} ${period}`;
		})
		.replace(/\s*-\s*/g, " to ");
};

const formatBreakValue = (day: TimesheetTooltipDayData): string => {
	const breakDisplay = day.metadata?.breakDisplay ?? day.breakDisplay;
	if (breakDisplay && breakDisplay.trim()) return normalizeBreakDisplay(breakDisplay);
	const breakMinutes = day.metadata?.breakMinutes ?? day.breakMinutes;
	if (typeof breakMinutes === "number" && breakMinutes > 0) {
		return `${formatMinutesLabel(breakMinutes)} scheduled`;
	}
	return "No break scheduled";
};

const formatMinutesLabel = (value?: number | null): string => {
	const minutes = Math.max(0, Number(value) || 0);
	const hours = Math.floor(minutes / 60);
	const mins = minutes % 60;
	return `${hours}h ${mins}m`;
};

const toLocalDateKey = (date: Date): string => {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
};

const businessTimeZone = "Asia/Manila";

const getBusinessDateParts = (date: Date) => {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: businessTimeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(date);

	return {
		year: Number(parts.find((part) => part.type === "year")?.value ?? "0"),
		month: Number(parts.find((part) => part.type === "month")?.value ?? "1"),
		day: Number(parts.find((part) => part.type === "day")?.value ?? "1"),
	};
};

const parseBusinessCalendarDate = (value?: string | null): Date => {
	if (!value) return new Date(Number.NaN);
	const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (dateOnly) {
		return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
	}
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) return parsed;
	const { year, month, day } = getBusinessDateParts(parsed);
	return new Date(year, month - 1, day);
};

const formatTimeWithDayOffset = (
	value?: string | null,
	baseDate?: string | null,
	showOffset = false,
): string => {
	if (!value) return "";
	const timeLabel = format12HourTime(value);
	if (!showOffset || !baseDate) return timeLabel;

	const base = parseBusinessCalendarDate(baseDate);
	const valueBusinessDate = parseBusinessCalendarDate(value);
	if (Number.isNaN(valueBusinessDate.getTime()) || Number.isNaN(base.getTime())) {
		return timeLabel;
	}

	return toLocalDateKey(valueBusinessDate) > toLocalDateKey(base)
		? `${timeLabel} (+1)`
		: timeLabel;
};

export function TimesheetDayTooltipContent({
	day,
	modified = false,
	onEdit,
}: TimesheetDayTooltipContentProps) {
	const hours = parseHours(day.hoursWorked || "0:00");
	const hasRecordedTime = Boolean(day.timeIn) || Boolean(day.timeOut) || hours > 0;
	const statusKey = String(day.status || "").toUpperCase();
	const hasScheduleError =
		statusKey === "NO_SCHEDULE" ||
		statusKey === "UNSCHEDULED" ||
		day.metadata?.scheduleRepair?.code === "NO_EMPLOYEE_SCHEDULE";
	const isAbsent = isVirtualAbsentLikeRecord(day);
	const isRestDay = day.status === "REST_DAY";
	const leaveEntries = Array.isArray(day.leaveEntries) ? day.leaveEntries : [];
	const holidayEntries = Array.isArray(day.holidayEntries) ? day.holidayEntries : [];
	const hasLeave =
		leaveEntries.length > 0 ||
		Boolean(day.leaveType) ||
		day.primaryMarker === "LEAVE" ||
		day.status === "LEAVE";
	const hasHoliday =
		holidayEntries.length > 0 || day.primaryMarker === "HOLIDAY" || day.status === "HOLIDAY";
	const isOpenShift =
		(statusKey === "NOT_CLOCKED_IN" || statusKey === "SCHEDULED") && !hasRecordedTime;
	const calendarDate = parseBusinessCalendarDate(
		day.businessDate || day.metadata?.businessDate || day.date,
	);
	const rawLateMinutes = Math.max(0, Number(day.metadata?.rawLateMinutes) || 0);
	const graceLateMinutes = Math.max(0, Number(day.metadata?.gracePeriodMinutes) || 0);
	const appliedLateGraceMinutes = Math.min(rawLateMinutes, graceLateMinutes);
	const chargeableLateMinutes = Math.max(0, rawLateMinutes - appliedLateGraceMinutes);
	const rawEarlyOutMinutes = Math.max(0, Number(day.metadata?.rawEarlyOutMinutes) || 0);
	const graceEarlyOutMinutes = Math.max(0, Number(day.metadata?.graceEarlyOutMinutes) || 0);
	const appliedEarlyOutGraceMinutes = Math.min(rawEarlyOutMinutes, graceEarlyOutMinutes);
	const chargeableEarlyOutMinutes = Math.max(0, rawEarlyOutMinutes - appliedEarlyOutGraceMinutes);
	const nightShift = day.nightShift;
	const nightWindowLabel = formatNightWindow(
		nightShift?.scheduledWindow?.startTime,
		nightShift?.scheduledWindow?.endTime,
		nightShift?.scheduledWindow?.isOvernight,
	);
	const timeOutLabel = formatTimeWithDayOffset(
		day.timeOut,
		day.businessDate || day.metadata?.businessDate || day.date,
		Boolean(nightShift?.isNightShiftDay),
	);
	const hasLateDetail = rawLateMinutes > 0;
	const hasEarlyOutDetail = rawEarlyOutMinutes > 0;
	const hasExceptionDetail = hasLateDetail || hasEarlyOutDetail;
	const approverNote = String(day.approverNotes || "").trim();
	const employeeNote = String(day.employeeNotes || "").trim();
	const hasApproverNote = approverNote.length > 0;
	const hasEmployeeNote = employeeNote.length > 0;
	const approvalReasonLabel =
		day.approvalStatus === "APPROVED" && parseDurationToMinutes(day.overtimeHours || "0:00") > 0
			? "Approval reason"
			: "Approver note";

	return (
		<div className="min-w-[260px] max-w-[320px] space-y-3">
			<div className="flex items-center justify-between border-b pb-2 mb-2 gap-2">
				<p className="font-semibold text-base">
					{calendarDate.toLocaleDateString("en-US", {
						weekday: "short",
						month: "short",
						day: "numeric",
					})}
				</p>
				{onEdit && (
					<button
						onClick={(e) => {
							e.stopPropagation();
							onEdit();
						}}
						className="text-gray-400 hover:text-gray-600 transition-colors p-0.5 rounded-sm hover:bg-gray-100">
						<Edit className="w-3 h-3" />
					</button>
				)}
			</div>
			{hasScheduleError ? (
				<p className="text-gray-700 font-medium text-sm">
					Employee has no schedule for this date
				</p>
			) : null}
			{isAbsent ? <p className="text-gray-700 font-medium text-sm">Absent</p> : null}
			{isRestDay ? <p className="text-gray-500 font-medium text-sm">Off day</p> : null}
			{isOpenShift ? (
				<p className="text-slate-600 font-medium text-sm">
					Open Shift
				</p>
			) : null}
			{hasHoliday ? (
				<div className="space-y-0.5">
					<p className="text-xs uppercase tracking-wide text-gray-600 font-semibold">
						Holiday
					</p>
					{holidayEntries.map((holiday) => (
						<p
							key={holiday.calendarItemId}
							className="text-sm text-gray-700 font-medium">
							{holiday.title}
						</p>
					))}
				</div>
			) : null}
			{hasLeave ? (
				<div className="space-y-0.5">
					<p className="text-xs uppercase tracking-wide text-gray-600 font-semibold">
						Leave
					</p>
					{leaveEntries.length
						? leaveEntries.map((entry, idx) => (
								<p
									key={`${entry.requestId || "leave"}-${idx}`}
									className="text-sm text-gray-700 font-medium">
									{entry.label}
									{entry.halfDaySession ? ` (${entry.halfDaySession})` : ""}
								</p>
							))
						: [
								<p
									key="legacy-leave"
									className="text-sm text-gray-700 font-medium">
									{day.leaveType}
								</p>,
							]}
				</div>
			) : null}
			{hasRecordedTime ? (
				<div className="space-y-2 text-sm">
					{nightShift?.isNightShiftDay ? (
						<div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
							<div className="flex items-start justify-between gap-3">
								<div>
									<p className="text-sm font-semibold uppercase tracking-wide text-gray-700">
										Night Shift
									</p>
									<p className="mt-0.5 text-sm text-gray-600">
										{nightWindowLabel || "-"}
									</p>
								</div>
								<div className="text-right">
									<p className="text-sm text-gray-600">Actual</p>
									<p className="font-semibold text-gray-800">
										{formatDuration(nightShift.actualNightHours || "0:00")}
									</p>
								</div>
							</div>
						</div>
					) : null}
					<div className="grid grid-cols-2 gap-2">
						<div className="rounded-md border border-gray-100 bg-gray-50 px-3 py-2">
							<p className="text-xs text-gray-500">Regular</p>
							<p className="font-semibold text-gray-900">
								{formatDuration(day.regularHours || "0:00")}
							</p>
						</div>
						<div className="rounded-md border border-gray-100 bg-gray-50 px-3 py-2">
							<p className="text-xs text-gray-500">Overtime</p>
							<p
								className="font-semibold text-gray-800">
								{formatDuration(day.overtimeHours || "0:00")}
							</p>
						</div>
					</div>
					{hasExceptionDetail ? (
						<div className="border-t border-dashed pt-1.5">
							<p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
								Exceptions
							</p>
							<div className="space-y-1">
								{hasLateDetail ? (
									<div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-sm">
										<span className="text-gray-500">Late</span>
										<span className="font-semibold text-gray-800">
											{formatMinutesLabel(rawLateMinutes)}
										</span>
										<span className="text-gray-500">Grace used</span>
										<span className="text-gray-600">
											{formatMinutesLabel(appliedLateGraceMinutes)}
										</span>
										<span className="text-gray-500">Chargeable</span>
										<span className="font-semibold text-gray-800">
											{formatMinutesLabel(chargeableLateMinutes)}
										</span>
									</div>
								) : null}
								{hasEarlyOutDetail ? (
									<div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-sm">
										<span className="text-gray-500">Early out</span>
										<span className="font-semibold text-gray-800">
											{formatMinutesLabel(rawEarlyOutMinutes)}
										</span>
										<span className="text-gray-500">Grace used</span>
										<span className="text-gray-600">
											{formatMinutesLabel(appliedEarlyOutGraceMinutes)}
										</span>
										<span className="text-gray-500">Chargeable</span>
										<span className="font-semibold text-gray-800">
											{formatMinutesLabel(chargeableEarlyOutMinutes)}
										</span>
									</div>
								) : null}
							</div>
						</div>
					) : null}
					{(day.timeIn || day.timeOut) && (
						<div className="border-t pt-1.5 space-y-1">
							<div className="flex justify-between gap-3 text-sm">
								<span className="text-gray-500">Time In</span>
								<span className="text-gray-700 font-medium">
									{day.timeIn ? format12HourTime(day.timeIn) : "Not clocked in"}
								</span>
							</div>
							<div className="grid grid-cols-[auto_1fr] gap-3 text-sm">
								<span className="text-gray-500">Break</span>
								<span
									className="text-right font-medium leading-snug text-gray-700"
									title={formatBreakValue(day)}>
									{formatBreakValue(day)}
								</span>
							</div>
							<div className="flex justify-between gap-3 text-sm">
								<span className="text-gray-500">Time Out</span>
								<span className="text-gray-700 font-medium">
									{day.timeOut ? timeOutLabel : "Not clocked out"}
								</span>
							</div>
						</div>
					)}
					{(hasApproverNote || hasEmployeeNote) && (
						<div className="border-t pt-1.5 space-y-1.5">
							{hasApproverNote ? (
								<div className="space-y-0.5">
									<p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
										{approvalReasonLabel}
									</p>
									<p className="whitespace-pre-wrap text-sm text-gray-700">
										{approverNote}
									</p>
								</div>
							) : null}
							{hasEmployeeNote ? (
								<div className="space-y-0.5">
									<p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
										Employee note
									</p>
									<p className="whitespace-pre-wrap text-sm text-gray-700">
										{employeeNote}
									</p>
								</div>
							) : null}
						</div>
					)}
				</div>
			) : null}
			{!hasRecordedTime && nightShift?.isNightShiftDay ? (
				<div className="rounded border border-gray-200 bg-gray-50 px-1.5 py-1 text-sm">
					<p className="text-sm font-semibold uppercase tracking-wide text-gray-700">
						Night Shift
					</p>
					<div className="mt-0.5 space-y-0.5">
						<div className="flex justify-between text-sm">
							<span className="text-gray-600">Scheduled</span>
							<span className="font-medium text-gray-800">
								{nightWindowLabel || "-"}
							</span>
						</div>
						<div className="flex justify-between text-sm">
							<span className="text-gray-600">Actual Night</span>
							<span className="font-semibold text-gray-800">
								{formatDuration(nightShift.actualNightHours || "0:00")}
							</span>
						</div>
					</div>
				</div>
			) : null}
			{modified && (
				<p className="text-sm font-semibold text-gray-700 border-t pt-2 mt-2">
					Modified (not submitted)
				</p>
			)}
		</div>
	);
}
