import { useState, useMemo, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
	Clock,
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	ChevronUp,
	Calendar as CalendarIcon,
	CalendarOff,
	Play,
	Pause,
	Timer,
	CheckCircle,
	AlertCircle,
} from "lucide-react";
import {
	format,
	startOfMonth,
	endOfMonth,
	endOfDay,
	subMonths,
	addMonths,
	isSameMonth,
} from "date-fns";

import { Button } from "~/components/atoms/Button";
import { Badge } from "~/components/atoms/Badge";
import { useAuth } from "~/lib/hooks/use-auth";
import {
	useTodayAttendance,
	useClockIn,
	useClockOut,
	useEmployeeAttendance,
	employeesQueryKeys,
} from "~/lib/hooks/useEmployees";
import { useViewTimesheets } from "~/lib/hooks/useTimesheets";
import { queryKeys as metricsQueryKeys } from "~/lib/hooks/useMetrics";
import { timesheetQueryKeys } from "~/lib/hooks/useTimesheets";
import { useSocket } from "~/contexts/socket-context";
import { TimesheetModal } from "~/components/organisms/timesheet-modal";
import {
	getAttendanceDisplayStatus,
	getAttendancePrimaryMarker,
	getAttendanceStatusBadgeClass,
	matchesAttendanceFilter,
} from "~/lib/utils/attendance-status";
import type { AttendanceFilterValue } from "~/lib/utils/attendance-status";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { Skeleton } from "~/components/ui/skeleton";

interface AttendanceTemplateProps {
	employeeIdOverride?: string;
	hideTodaySection?: boolean;
	hideTimesheetActions?: boolean;
}

/** Temporary product flag: hide Clock In/Out action until re-enabled. */
const SHOW_CLOCK_IN_BUTTON = false;

/** Raw attendance record from API (subset we use for details) */
interface AttendanceRawRecord {
	id: string;
	date: string;
	timeIn?: string | null;
	timeOut?: string | null;
	status: string;
	breakMinutes?: number;
	totalMinutesWorked?: number | null;
	regularMinutes?: number | null;
	overtimeMinutes?: number | null;
	undertimeMinutes?: number | null;
	lateMinutes?: number | null;
	earlyOutMinutes?: number | null;
	hoursWorked?: string;
	regularHours?: string;
	overtimeHours?: string;
	undertimeHours?: string;
	lateHours?: string;
	earlyOutHours?: string;
	dayOfWeek?: string;
	isRestDay?: boolean;
	remarks?: string | null;
	notes?: string | null;
	isManualEntry?: boolean;
	approvedBy?: string | null;
	timeInLocation?: unknown;
	timeOutLocation?: unknown;
	deviceInfo?: unknown;
	leaveType?: string | null;
	leaveEntries?: Array<{
		requestId?: string;
		leaveType: string;
		label: string;
		durationUnit?: string;
		halfDaySession?: string;
		startDate?: string;
		endDate?: string;
	}> | null;
	holidayEntries?: Array<{
		calendarItemId: string;
		title: string;
		startDate: string;
		endDate: string;
		tags?: string[];
	}> | null;
	primaryMarker?: "HOLIDAY" | "LEAVE" | "REST_DAY" | "ABSENT" | "HOURS" | null;
	metadata?: Record<string, unknown> | null;
}

interface AttendanceRecordCard {
	id: string;
	date: string;
	dateLabel: string;
	month: string;
	day: number;
	timeIn: string;
	timeOut: string;
	hours: string;
	status: string;
	isMissingClockOut: boolean;
	missingClockOutState: "waiting" | "missed" | null;
	filterBucket: AttendanceFilterValue | "OTHER";
	raw: AttendanceRawRecord;
}

type AttendanceTimingMetadata = {
	state?: "early" | "late" | "withinGrace" | "onTime";
	hasTimeIn?: boolean;
	minutesBeforeStart?: number;
	rawLateMinutes?: number;
	chargeableLateMinutes?: number;
	gracePeriodMinutes?: number;
	withinGrace?: boolean;
	schedule?: {
		shiftTypeCode?: string | null;
		shiftTypeName?: string | null;
		scheduleTemplateName?: string | null;
		startTime?: string | null;
		endTime?: string | null;
		timeSlots?: Array<{
			type?: string | null;
			label?: string | null;
			startTime?: string | null;
			endTime?: string | null;
		}> | null;
		isOvernight?: boolean;
		breakMinutes?: number | null;
		templateDay?: number | null;
		cycleDays?: number | null;
	};
};

const CLOCK_IN_OPEN_WINDOW_MS = 3 * 60 * 60 * 1000;
const MANILA_TIME_ZONE = "Asia/Manila";

const getManilaDate = () => {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: MANILA_TIME_ZONE,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(new Date());
	const valueFor = (type: string) => parts.find((part) => part.type === type)?.value || "";
	return `${valueFor("year")}-${valueFor("month")}-${valueFor("day")}`;
};

const getDateOnly = (value?: string | Date | null) => {
	if (!value) return "";
	if (value instanceof Date) return format(value, "yyyy-MM-dd");
	const isoDateMatch = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
	if (isoDateMatch?.[1]) return isoDateMatch[1];
	return format(new Date(value), "yyyy-MM-dd");
};

const getBusinessDateOnly = (value?: string | Date | null) => {
	if (!value) return "";
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return getDateOnly(value);
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: MANILA_TIME_ZONE,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(date);
	const valueFor = (type: string) => parts.find((part) => part.type === type)?.value || "";
	return `${valueFor("year")}-${valueFor("month")}-${valueFor("day")}`;
};

const parseDateOnlyAsNoonUtc = (value: string) => {
	const [year, month, day] = value.split("-").map(Number);
	return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
};

const formatManilaDateTime = (value: string) =>
	new Intl.DateTimeFormat("en-US", {
		timeZone: MANILA_TIME_ZONE,
		hour: "numeric",
		minute: "2-digit",
		hour12: true,
	}).format(new Date(value));

const toMinutes = (value?: string | null): number => {
	if (!value) return 0;
	const normalized = String(value).trim();
	if (!normalized || normalized === "0:00" || normalized === "0h 0m") return 0;

	const hhmmMatch = normalized.match(/^(-?\d+):(-?\d{1,2})$/);
	if (hhmmMatch) {
		const minutes = Number(hhmmMatch[1]) * 60 + Number(hhmmMatch[2]);
		return Math.max(0, minutes);
	}

	const hmMatch = normalized.match(/^(-?\d+)h\s*(-?\d+)m$/i);
	if (hmMatch) {
		const minutes = Number(hmMatch[1]) * 60 + Number(hmMatch[2]);
		return Math.max(0, minutes);
	}

	return 0;
};

const getRecordMinutes = (
	record: AttendanceRawRecord,
	minuteField:
		| "totalMinutesWorked"
		| "regularMinutes"
		| "overtimeMinutes"
		| "undertimeMinutes"
		| "lateMinutes"
		| "earlyOutMinutes",
	hoursField:
		| "hoursWorked"
		| "regularHours"
		| "overtimeHours"
		| "undertimeHours"
		| "lateHours"
		| "earlyOutHours",
) => {
	const numericValue = Number(record[minuteField]);
	if (Number.isFinite(numericValue) && numericValue > 0) {
		return Math.max(0, Math.round(numericValue));
	}
	return toMinutes(record[hoursField]);
};

const getWorkedMinutes = (record: AttendanceRawRecord) => {
	const storedMinutes = getRecordMinutes(record, "totalMinutesWorked", "hoursWorked");
	if (storedMinutes > 0) return storedMinutes;
	if (!record.timeIn || !record.timeOut) return 0;
	const diffMinutes = Math.round(
		(new Date(record.timeOut).getTime() - new Date(record.timeIn).getTime()) / (1000 * 60),
	);
	return Math.max(0, diffMinutes);
};

const formatMinutesAsDuration = (value?: number | null): string => {
	const minutes = Math.max(0, Number(value) || 0);
	const hours = Math.floor(minutes / 60);
	const mins = minutes % 60;
	return `${hours}h ${mins}m`;
};

const formatAttendanceDuration = (minutes: number): string => {
	if (minutes <= 0) return "-";
	const hours = Math.floor(minutes / 60);
	const mins = minutes % 60;
	return `${hours}:${String(mins).padStart(2, "0")}`;
};

const formatCountdownDuration = (milliseconds: number): string => {
	const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

const formatScheduleClock = (value?: string | null): string => {
	if (!value) return "-";
	const [hourRaw, minuteRaw] = value.split(":").map(Number);
	if (!Number.isFinite(hourRaw) || !Number.isFinite(minuteRaw)) return value;
	const suffix = hourRaw >= 12 ? "PM" : "AM";
	const hour = hourRaw % 12 || 12;
	return `${hour}:${String(minuteRaw).padStart(2, "0")} ${suffix}`;
};

const formatScheduleWindow = (schedule?: AttendanceTimingMetadata["schedule"]) => {
	if (!schedule) return "-";
	return `${formatScheduleClock(schedule.startTime)} - ${formatScheduleClock(schedule.endTime)}`;
};

const getScheduleBreakLabel = (schedule?: AttendanceTimingMetadata["schedule"]) => {
	if (!schedule) return null;
	const slots = Array.isArray(schedule.timeSlots) ? schedule.timeSlots : [];
	const breakSlot = slots.find((slot) => {
		const type = String(slot.type || slot.label || "").toUpperCase();
		return type.includes("BREAK");
	});
	if (breakSlot?.startTime && breakSlot?.endTime) {
		return `${formatScheduleClock(breakSlot.startTime)} - ${formatScheduleClock(breakSlot.endTime)}`;
	}
	if (Number(schedule.breakMinutes || 0) > 0) {
		return `${schedule.breakMinutes} min`;
	}
	return null;
};

const getTodayScheduleStart = (schedule?: AttendanceTimingMetadata["schedule"]): Date | null => {
	if (!schedule?.startTime) return null;
	const [hourRaw, minuteRaw] = schedule.startTime.split(":").map(Number);
	if (!Number.isFinite(hourRaw) || !Number.isFinite(minuteRaw)) return null;
	const start = new Date();
	start.setHours(hourRaw, minuteRaw, 0, 0);
	return start;
};

const getTimingTone = (state?: string, hasTimeIn?: boolean) => {
	if (state === "late") {
		return {
			iconClass: "bg-red-50 text-red-600",
			titleClass: "text-red-700",
			textClass: "text-red-700",
			title: hasTimeIn ? "Late after grace" : "Late if clocked now",
		};
	}
	if (state === "early") {
		return {
			iconClass: "bg-orange-50 text-orange-600",
			titleClass: "text-gray-900",
			textClass: "text-gray-600",
			title: "Before shift window",
		};
	}
	if (state === "withinGrace") {
		return {
			iconClass: "bg-amber-50 text-amber-600",
			titleClass: "text-amber-800",
			textClass: "text-amber-700",
			title: "Inside grace period",
		};
	}
	return {
		iconClass: "bg-green-50 text-green-700",
		titleClass: "text-green-700",
		textClass: "text-gray-600",
		title: "Ready for attendance",
	};
};

const getTimingDetail = (timing?: AttendanceTimingMetadata | null): string | null => {
	if (!timing) return null;
	if (timing.state === "early" && Number(timing.minutesBeforeStart || 0) > 0) {
		return timing.hasTimeIn
			? `Clocked in ${formatMinutesAsDuration(timing.minutesBeforeStart)} before shift start.`
			: `Shift starts in ${formatMinutesAsDuration(timing.minutesBeforeStart)}.`;
	}
	if (timing.state === "withinGrace" && Number(timing.rawLateMinutes || 0) > 0) {
		return timing.hasTimeIn
			? `Clocked in ${formatMinutesAsDuration(timing.rawLateMinutes)} after shift start, still inside grace.`
			: `${formatMinutesAsDuration(timing.rawLateMinutes)} after shift start, still inside grace.`;
	}
	if (timing.state === "late" && Number(timing.chargeableLateMinutes || 0) > 0) {
		return timing.hasTimeIn
			? `${formatMinutesAsDuration(timing.chargeableLateMinutes)} counted as late after grace.`
			: `Clocking in now will count ${formatMinutesAsDuration(timing.chargeableLateMinutes)} late after grace.`;
	}
	return timing.schedule ? "Ready to record attendance for this shift." : null;
};

const getEmployeeAttendanceFilterBucket = (
	record: AttendanceRawRecord,
): AttendanceFilterValue | "OTHER" => {
	const marker = getAttendancePrimaryMarker(record);
	if (marker === "HOLIDAY") return "HOLIDAY";
	if (marker === "LEAVE") return "LEAVE";

	const normalizedStatus = String(record.status || "").toUpperCase();
	const hasWorkedSignal =
		Boolean(record.timeIn) || Boolean(record.timeOut) || toMinutes(record.hoursWorked) > 0;
	const isWorkStatus =
		normalizedStatus === "PRESENT" ||
		normalizedStatus === "LATE" ||
		normalizedStatus === "HALF_DAY" ||
		normalizedStatus === "INCOMPLETE";

	if (marker === "HOURS" || isWorkStatus || hasWorkedSignal) return "WORK_DAY";
	return "OTHER";
};

function getStatusBadge(status: string) {
	if (status === "Pre-Start") {
		return <Badge className="bg-blue-100 text-blue-700 border border-blue-200">{status}</Badge>;
	}
	const cls = getAttendanceStatusBadgeClass(status);
	return <Badge className={cls}>{status}</Badge>;
}

const getTodayNonWorkReason = (attendance: any) => {
	const marker = getAttendancePrimaryMarker(attendance);
	if (marker === "HOLIDAY") {
		const holidayTitle = attendance?.holidayEntries?.[0]?.title;
		return {
			kind: "holiday" as const,
			title: holidayTitle || "Holiday today",
			detail: holidayTitle
				? "Attendance is closed for this holiday unless HR records an exception."
				: "Attendance is closed for this holiday unless HR records an exception.",
			buttonLabel: "Clocking Closed",
			cardClass: "border-orange-200 bg-orange-50/70",
			iconClass: "bg-white text-orange-700",
			titleClass: "text-orange-900",
			detailClass: "text-orange-800",
		};
	}
	if (marker === "LEAVE") {
		const leaveLabel =
			attendance?.leaveEntries?.[0]?.label ||
			attendance?.leaveEntries?.[0]?.leaveType ||
			attendance?.leaveType;
		return {
			kind: "leave" as const,
			title: leaveLabel ? `On ${leaveLabel} today` : "On approved leave today",
			detail: "No clock-in is needed for an approved leave day.",
			buttonLabel: "On Leave Today",
			cardClass: "border-amber-200 bg-amber-50/70",
			iconClass: "bg-white text-amber-700",
			titleClass: "text-amber-900",
			detailClass: "text-amber-800",
		};
	}
	if (String(attendance?.status || "").toUpperCase() === "REST_DAY" || marker === "REST_DAY") {
		return {
			kind: "rest" as const,
			title: "Rest day today",
			detail: "Your schedule marks today as a rest day, so clock-in is not required.",
			buttonLabel: "Rest Day",
			cardClass: "border-gray-200 bg-gray-50",
			iconClass: "bg-white text-gray-700",
			titleClass: "text-gray-900",
			detailClass: "text-gray-600",
		};
	}
	return null;
};

function AttendanceTemplateSkeleton({ hideTodaySection }: { hideTodaySection: boolean }) {
	return (
		<div className="bg-gray-50/40 min-h-screen pb-10">
			<div className="grid lg:grid-cols-3 gap-8">
				<div className="lg:col-span-2 space-y-6">
					<div className="flex items-center justify-between gap-4">
						<div className="flex items-center gap-2">
							<div className="rounded-md bg-red-50 p-1.5">
								<CalendarIcon className="h-5 w-5 text-red-300" />
							</div>
							<Skeleton className="h-6 w-44" />
						</div>
						<div className="flex items-center gap-2">
							<Skeleton className="h-9 w-40 rounded-md" />
							<Skeleton className="h-9 w-36 rounded-md" />
						</div>
					</div>

					<div className="space-y-4">
						{Array.from({ length: 5 }).map((_, index) => (
							<div
								key={`attendance-skeleton-${index}`}
								className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
								<div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
									<div className="flex items-center gap-4">
										<div className="bg-gray-50 rounded-lg p-3 min-w-[60px] space-y-2">
											<Skeleton className="h-3 w-8 mx-auto" />
											<Skeleton className="h-6 w-7 mx-auto" />
										</div>
										<div className="space-y-2">
											<div className="flex items-center gap-2 flex-wrap">
												<Skeleton className="h-5 w-32" />
												<Skeleton className="h-5 w-16 rounded-full" />
												<Skeleton className="h-4 w-12 rounded" />
											</div>
											<div className="flex items-center gap-2">
												<Skeleton className="h-4 w-24" />
												<Skeleton className="h-4 w-24" />
											</div>
										</div>
									</div>
									<div className="flex items-center justify-between md:justify-end gap-6 flex-1">
										<div className="text-right space-y-2">
											<Skeleton className="h-3 w-12 ml-auto" />
											<Skeleton className="h-6 w-16 ml-auto" />
										</div>
										<Skeleton className="h-5 w-5 rounded" />
									</div>
								</div>
							</div>
						))}
					</div>
				</div>

				<div className="flex flex-col gap-6">
					<div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm space-y-4">
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-2">
								<div className="p-1.5 bg-red-50 rounded-md">
									<Clock className="h-4 w-4 text-red-300" />
								</div>
								<Skeleton className="h-5 w-24" />
							</div>
							<Skeleton className="h-6 w-20 rounded-full" />
						</div>
						<Skeleton className="h-3 w-32" />
						<div className="space-y-3">
							{Array.from({ length: 4 }).map((_, index) => (
								<div
									key={`attendance-summary-skeleton-${index}`}
									className="flex items-center justify-between">
									<Skeleton className="h-4 w-20" />
									<Skeleton className="h-5 w-8" />
								</div>
							))}
						</div>
					</div>

					<div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm space-y-4">
						<Skeleton className="h-5 w-28" />
						{!hideTodaySection && (
							<>
								<div className="grid grid-cols-2 gap-3">
									<div className="bg-gray-50 rounded-lg p-3 space-y-2">
										<Skeleton className="h-3 w-14" />
										<Skeleton className="h-5 w-20" />
									</div>
									<div className="bg-gray-50 rounded-lg p-3 space-y-2">
										<Skeleton className="h-3 w-16" />
										<Skeleton className="h-5 w-20" />
									</div>
								</div>
								<Skeleton className="h-10 w-full rounded-md" />
							</>
						)}
						<Skeleton className="h-10 w-full rounded-md" />
					</div>
				</div>
			</div>
		</div>
	);
}

export default function AttendanceTemplate({
	employeeIdOverride,
	hideTodaySection = false,
	hideTimesheetActions = false,
}: AttendanceTemplateProps = {}) {
	const [searchParams, setSearchParams] = useSearchParams();
	const queryClient = useQueryClient();
	const { user } = useAuth();
	const employeeId = employeeIdOverride || user?.metadata?.employee?.id || "";
	const socketEmployeeId = user?.metadata?.employee?.id || "";
	const organizationId =
		user?.metadata?.employee?.organizationId ||
		(user?.metadata as any)?.organization?.id ||
		(user as any)?.organizationId ||
		"";
	const { socket, isConnected } = useSocket();

	const { data: todayAttendanceData, isLoading: todayLoading } = useTodayAttendance(employeeId, {
		enabled: !hideTodaySection,
	});
	const clockInMutation = useClockIn();
	const clockOutMutation = useClockOut();

	const todayStr = getManilaDate();
	const today = parseDateOnlyAsNoonUtc(todayStr);
	const [currentMonth, setCurrentMonth] = useState(today);
	const [attendanceFilter, setAttendanceFilter] = useState<AttendanceFilterValue>("ALL");
	const { data: timesheetViewData, isLoading: isTimesheetViewLoading } = useViewTimesheets({
		enabled: !hideTimesheetActions,
	});
	const currentTimesheet = timesheetViewData?.timesheet || null;
	const activePayrollPeriod = currentTimesheet?.payrollPeriod || null;
	const activePeriodStartStr = getDateOnly(activePayrollPeriod?.startDate);
	const activePeriodEndStr = getDateOnly(activePayrollPeriod?.endDate);
	const hasActivePeriod = Boolean(activePeriodStartStr && activePeriodEndStr);
	const activePeriodStart = hasActivePeriod ? parseDateOnlyAsNoonUtc(activePeriodStartStr) : null;
	const activePeriodEndForRecordsStr =
		hasActivePeriod && activePeriodEndStr > todayStr ? todayStr : activePeriodEndStr;
	const monthStart = startOfMonth(currentMonth);
	const monthEnd = endOfMonth(currentMonth);
	// Only show records up to today (not future dates in current month)
	const dateTo = isSameMonth(currentMonth, today) ? endOfDay(today) : monthEnd;
	const recordsStartDate = activePeriodStart || monthStart;
	const recordsEndDate = activePeriodEndForRecordsStr
		? parseDateOnlyAsNoonUtc(activePeriodEndForRecordsStr)
		: dateTo;

	const queryParams = useMemo(
		() => ({
			dateFrom: recordsStartDate.toISOString(),
			dateTo: recordsEndDate.toISOString(),
			limit: 50,
			sort: "date",
			order: "desc" as const,
		}),
		[recordsStartDate, recordsEndDate],
	);

	const canLoadAttendanceHistory = hideTimesheetActions || !isTimesheetViewLoading;
	const { data: attendanceHistoryData, isLoading: isHistoryLoading } = useEmployeeAttendance(
		employeeId,
		queryParams,
		{ enabled: canLoadAttendanceHistory },
	);
	const effectiveStartDateRaw =
		(attendanceHistoryData as any)?.employment?.effectiveStartDate ||
		(todayAttendanceData as any)?.effectiveStartDate ||
		(todayAttendanceData as any)?.employmentStartDate ||
		null;
	const effectiveStartMonth = effectiveStartDateRaw
		? startOfMonth(new Date(effectiveStartDateRaw))
		: null;
	const todayMonth = startOfMonth(today);
	const canGoPrevMonth = effectiveStartMonth ? monthStart > effectiveStartMonth : true;
	const canGoNextMonth = monthStart < todayMonth;

	// Filter by calendar date (YYYY-MM-DD) so timezone doesn't show wrong month (e.g. Jan 31 in Feb list)
	const monthStartStr = hasActivePeriod ? activePeriodStartStr : format(monthStart, "yyyy-MM-dd");
	const dateToStr = hasActivePeriod ? activePeriodEndForRecordsStr : format(dateTo, "yyyy-MM-dd");
	const monthAttendanceItems = useMemo<AttendanceRawRecord[]>(() => {
		const raw = (attendanceHistoryData as any)?.attendances || [];
		return raw
			.filter((r: any) => {
				const dateStr = getBusinessDateOnly(r.date);
				return dateStr >= monthStartStr && dateStr <= dateToStr;
			})
			.map((r: AttendanceRawRecord) => ({ ...r }));
	}, [attendanceHistoryData, monthStartStr, dateToStr]);

	const attendanceItems = useMemo(() => {
		if (attendanceFilter === "ALL") return monthAttendanceItems;

		return monthAttendanceItems.filter((record) => {
			const bucket = getEmployeeAttendanceFilterBucket(record);
			if (attendanceFilter === "WORK_DAY") return bucket === "WORK_DAY";
			if (attendanceFilter === "HOLIDAY") return bucket === "HOLIDAY";
			if (attendanceFilter === "LEAVE") return bucket === "LEAVE";
			return matchesAttendanceFilter(record, attendanceFilter);
		});
	}, [monthAttendanceItems, attendanceFilter]);

	const todayAttendance = useMemo(() => {
		if (!todayAttendanceData) {
			return {
				clockIn: null as string | null,
				clockOut: null as string | null,
				status: "Not Clocked In",
				hasTimeIn: false,
				hasTimeOut: false,
				isPreStart: false,
				effectiveStartDate: null as string | null,
				timing: null as AttendanceTimingMetadata | null,
				nonWorkReason: null as ReturnType<typeof getTodayNonWorkReason>,
			};
		}
		const isPreStart = Boolean((todayAttendanceData as any).isPreStart);
		const formatTime = (timeString: string) => {
			return formatManilaDateTime(timeString);
		};
		const hasTimeIn = !!todayAttendanceData.timeIn;
		const hasTimeOut = !!todayAttendanceData.timeOut;
		let status = "Not Clocked In";
		const markerAwareStatus = getAttendanceDisplayStatus(todayAttendanceData as any);
		if (isPreStart) {
			status = "Pre-Start";
		} else if (markerAwareStatus === "Holiday" || markerAwareStatus === "Leave") {
			status = markerAwareStatus;
		} else if (hasTimeIn && !hasTimeOut) {
			status = "Clocked In";
		} else if (hasTimeIn) {
			status =
				(todayAttendanceData as any).status === "LATE"
					? "Late"
					: (todayAttendanceData as any).status === "HALF_DAY"
						? "Half Day"
						: "Present";
		}
		return {
			clockIn: todayAttendanceData.timeIn ? formatTime(todayAttendanceData.timeIn) : null,
			clockOut: todayAttendanceData.timeOut ? formatTime(todayAttendanceData.timeOut) : null,
			status,
			hasTimeIn,
			hasTimeOut,
			isPreStart,
			effectiveStartDate:
				(todayAttendanceData as any).effectiveStartDate ||
				(todayAttendanceData as any).employmentStartDate ||
				null,
			timing:
				(
					((todayAttendanceData as any).metadata || {}) as {
						timing?: AttendanceTimingMetadata;
					}
				).timing || null,
			nonWorkReason: getTodayNonWorkReason(todayAttendanceData as any),
		};
	}, [todayAttendanceData]);

	const patchAttendanceListCache = useCallback(
		(attendanceInput: unknown) => {
			if (!employeeId || !attendanceInput) return;
			const attendance =
				(attendanceInput as any)?.attendance ||
				(attendanceInput as any)?.data?.attendance ||
				attendanceInput;
			if (!(attendance as AttendanceRawRecord)?.date) return;
			const attendanceDateKey = getBusinessDateOnly((attendance as AttendanceRawRecord).date);
			if (!attendanceDateKey) return;

			queryClient.setQueriesData(
				{ queryKey: employeesQueryKeys.employees.attendanceByEmployee(employeeId) },
				(oldData: any) => {
					const oldAttendances = Array.isArray(oldData?.attendances)
						? oldData.attendances
						: null;
					if (!oldAttendances) return oldData;

					let didReplace = false;
					const nextAttendances = oldAttendances.map((record: AttendanceRawRecord) => {
						const recordDateKey = getBusinessDateOnly(record.date);
						if (recordDateKey !== attendanceDateKey) return record;
						didReplace = true;
						return {
							...record,
							...(attendance as Record<string, unknown>),
							dayOfWeek: record.dayOfWeek,
							isRestDay: false,
							remarks: (attendance as AttendanceRawRecord).remarks || record.remarks,
						};
					});

					return {
						...oldData,
						attendances: didReplace
							? nextAttendances
							: [attendance, ...oldAttendances],
					};
				},
			);
		},
		[employeeId, queryClient],
	);

	const refreshAttendanceSurface = useCallback(async () => {
		if (!employeeId) return;

		await Promise.all([
			queryClient.invalidateQueries({
				queryKey: employeesQueryKeys.employees.attendanceToday(employeeId),
			}),
			queryClient.invalidateQueries({
				queryKey: employeesQueryKeys.employees.attendanceByEmployee(employeeId),
			}),
			queryClient.refetchQueries({
				queryKey: employeesQueryKeys.employees.attendanceList(employeeId, queryParams),
				type: "active",
			}),
			queryClient.invalidateQueries({ queryKey: metricsQueryKeys.metrics.all }),
			queryClient.invalidateQueries({ queryKey: timesheetQueryKeys.timesheets.all }),
		]);
	}, [employeeId, queryClient, queryParams]);

	useEffect(() => {
		if (!socket || !isConnected || !employeeId) return;

		const handleAttendanceEvent = (payload?: { employeeId?: string | null }) => {
			if (payload?.employeeId && payload.employeeId !== employeeId) return;
			void refreshAttendanceSurface();
		};

		const shouldJoinPageEmployeeRoom = employeeId && employeeId !== socketEmployeeId;
		const attendanceRoomPayload = organizationId ? { organizationId } : null;
		if (shouldJoinPageEmployeeRoom) {
			socket.emit("join:employee", employeeId);
		}
		if (attendanceRoomPayload) {
			socket.emit("join:attendance", attendanceRoomPayload);
		}
		socket.on("attendance:event", handleAttendanceEvent);

		return () => {
			socket.off("attendance:event", handleAttendanceEvent);
			if (shouldJoinPageEmployeeRoom) {
				socket.emit("leave:employee", employeeId);
			}
			if (attendanceRoomPayload) {
				socket.emit("leave:attendance", attendanceRoomPayload);
			}
		};
	}, [
		socket,
		isConnected,
		employeeId,
		socketEmployeeId,
		organizationId,
		refreshAttendanceSurface,
	]);

	const handleClockIn = async () => {
		if (!employeeId) return;
		const result = await clockInMutation.mutateAsync({ employeeId });
		patchAttendanceListCache(result);
		await refreshAttendanceSurface();
	};

	const handleClockOut = async () => {
		if (!employeeId) return;
		const result = await clockOutMutation.mutateAsync({ employeeId });
		patchAttendanceListCache(result);
		await refreshAttendanceSurface();
	};

	const handleClockAction = () => {
		if (todayAttendance.hasTimeIn && !todayAttendance.hasTimeOut) {
			handleClockOut();
		} else {
			handleClockIn();
		}
	};

	const [clockNow, setClockNow] = useState(() => new Date());

	const [isTimesheetModalOpen, setIsTimesheetModalOpen] = useState(false);
	const deepLinkDay = searchParams.get("day");

	// Handle deep link - open timesheet modal if action=view-timesheet
	useEffect(() => {
		const action = searchParams.get("action");
		if (!hideTimesheetActions && action === "view-timesheet") {
			setIsTimesheetModalOpen(true);
		}
	}, [hideTimesheetActions, searchParams]);

	const handleOpenTimesheetModal = () => {
		setIsTimesheetModalOpen(true);
		setSearchParams((prev) => {
			const next = new URLSearchParams(prev);
			next.set("action", "view-timesheet");
			return next;
		});
	};
	const handleCloseTimesheetModal = () => {
		setIsTimesheetModalOpen(false);
		setSearchParams((prev) => {
			const next = new URLSearchParams(prev);
			next.delete("action");
			next.delete("day");
			return next;
		});
	};

	const handleDeepLinkDayChange = (day: string | null) => {
		setSearchParams((prev) => {
			const next = new URLSearchParams(prev);
			if (day) {
				next.set("day", day);
			} else {
				next.delete("day");
			}
			return next;
		});
	};

	// Build card list from attendance (no DataTable). Use date string (YYYY-MM-DD) for display to avoid timezone shifting the day.
	const recordCards: AttendanceRecordCard[] = attendanceItems.map((record: any) => {
		const dateStr = getBusinessDateOnly(record.date);
		const [y, m, d] = dateStr ? dateStr.split("-").map(Number) : [0, 0, 0];
		// Build a UTC noon date for this calendar day so format() and day/month are correct
		const date = dateStr ? new Date(Date.UTC(y, m - 1, d, 12, 0, 0)) : new Date(record.date);
		const formatTime = (timeString?: string) => {
			if (!timeString) return "-";
			return formatManilaDateTime(timeString);
		};
		const _getTotalHours = () => {
			if (!record.timeIn || !record.timeOut) return "-";
			const start = new Date(record.timeIn);
			const end = new Date(record.timeOut);
			const diffMs = end.getTime() - start.getTime();
			const h = Math.floor(diffMs / (1000 * 60 * 60));
			const m = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
			return `${h}h ${m}m`;
		};
		const isMissingClockOut = Boolean(record.timeIn) && !record.timeOut;
		const missingClockOutState = isMissingClockOut
			? dateStr && dateStr < todayStr
				? "missed"
				: "waiting"
			: null;
		return {
			id: record.id,
			date: record.date,
			dateLabel: dateStr
				? format(date, "MMM d, yyyy")
				: format(new Date(record.date), "MMM d, yyyy"),
			month: dateStr ? format(date, "MMM") : format(new Date(record.date), "MMM"),
			day: dateStr ? d : new Date(record.date).getDate(),
			timeIn: formatTime(record.timeIn),
			timeOut: isMissingClockOut ? "Not clocked out" : formatTime(record.timeOut),
			hours: formatAttendanceDuration(getWorkedMinutes(record)),
			status: getAttendanceDisplayStatus(record),
			isMissingClockOut,
			missingClockOutState,
			filterBucket: getEmployeeAttendanceFilterBucket(record as AttendanceRawRecord),
			raw: record as AttendanceRawRecord,
		};
	});

	const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
	const toggleExpanded = (id: string) => {
		setExpandedCardId((prev) => (prev === id ? null : id));
	};

	const filterLabelByValue: Record<AttendanceFilterValue, string> = {
		ALL: "All",
		WORK_DAY: "Work Day",
		HOLIDAY: "Holiday",
		LEAVE: "Leave",
	};

	const _formatTimeValue = (val: string | undefined | null) => {
		if (val == null || val === "" || val === "0:00") return "-";
		return val;
	};

	const _formatLateValue = (record: AttendanceRawRecord) => {
		const rawLateMinutes = Math.max(0, Number((record.metadata as any)?.rawLateMinutes) || 0);
		if (rawLateMinutes > 0) return formatMinutesAsDuration(rawLateMinutes);
		return _formatTimeValue(record.lateHours);
	};

	const formatRecordMetricValue = (
		record: AttendanceRawRecord,
		minuteField:
			| "totalMinutesWorked"
			| "regularMinutes"
			| "overtimeMinutes"
			| "undertimeMinutes"
			| "lateMinutes"
			| "earlyOutMinutes",
		hoursField:
			| "hoursWorked"
			| "regularHours"
			| "overtimeHours"
			| "undertimeHours"
			| "lateHours"
			| "earlyOutHours",
	) => {
		const minutes = getRecordMinutes(record, minuteField, hoursField);
		const workedMinutes = getWorkedMinutes(record);
		if (minuteField === "overtimeMinutes") {
			return formatAttendanceDuration(Math.min(minutes, workedMinutes));
		}
		return formatAttendanceDuration(minutes);
	};

	const formatRecordLateValue = (record: AttendanceRawRecord) => {
		const lateMinutes = getRecordMinutes(record, "lateMinutes", "lateHours");
		return lateMinutes > 0 ? formatMinutesAsDuration(lateMinutes) : "-";
	};

	const shouldShowQuickActionsCard = !hideTodaySection || !hideTimesheetActions;
	const todayTimingTone = getTimingTone(
		todayAttendance.timing?.state,
		todayAttendance.hasTimeIn,
	);
	const todayTimingDetail = todayAttendance.hasTimeIn
		? null
		: getTimingDetail(todayAttendance.timing);
	const todayTimingSchedule = todayAttendance.timing?.schedule;
	const todayBreakLabel = getScheduleBreakLabel(todayTimingSchedule);
	const todayShiftStartAt = useMemo(
		() => getTodayScheduleStart(todayTimingSchedule),
		[todayTimingSchedule],
	);
	const shiftCountdownMs = todayShiftStartAt
		? todayShiftStartAt.getTime() - clockNow.getTime()
		: 0;
	const shouldShowShiftCountdown =
		todayAttendance.timing?.state === "early" &&
		!todayAttendance.timing?.hasTimeIn &&
		shiftCountdownMs > 0;
	const clockInOpensAt = todayShiftStartAt
		? new Date(todayShiftStartAt.getTime() - CLOCK_IN_OPEN_WINDOW_MS)
		: null;
	const isBeforeClockInWindow =
		shouldShowShiftCountdown && shiftCountdownMs > CLOCK_IN_OPEN_WINDOW_MS;
	const isClockActionDisabled =
		todayAttendance.isPreStart ||
		Boolean(todayAttendance.nonWorkReason) ||
		clockInMutation.isPending ||
		clockOutMutation.isPending ||
		(todayAttendance.hasTimeIn && todayAttendance.hasTimeOut) ||
		(!todayAttendance.hasTimeIn && isBeforeClockInWindow);
	const recordsTitle = hasActivePeriod ? "Attendance Log" : "Monthly Attendance";
	const recordsDateRangeLabel = hasActivePeriod
		? `${format(parseDateOnlyAsNoonUtc(activePeriodStartStr), "MMM d")} - ${format(
				parseDateOnlyAsNoonUtc(activePeriodEndStr),
				"MMM d, yyyy",
			)}`
		: `${format(monthStart, "MMM d")} - ${
				isSameMonth(currentMonth, today)
					? format(today, "MMM d, yyyy")
					: format(monthEnd, "MMM d, yyyy")
			}`;
	const timesheetStatus = currentTimesheet?.status || "DRAFT";
	const periodName =
		activePayrollPeriod?.name || activePayrollPeriod?.code || "Current payroll period";
	const workedTotal = currentTimesheet?.totalHoursWorked || "0h 0m";
	const lateTotal = currentTimesheet?.totalLateHours || "0h 0m";
	const overtimeTotal = currentTimesheet?.totalOvertimeHours || "0h 0m";
	const nextActionLabel = todayAttendance.isPreStart
		? "Not yet active"
		: todayAttendance.nonWorkReason
			? todayAttendance.nonWorkReason.buttonLabel
			: todayAttendance.hasTimeIn && todayAttendance.hasTimeOut
				? "Shift complete"
				: isBeforeClockInWindow
					? clockInOpensAt
						? `Clock in opens ${format(clockInOpensAt, "h:mm a")}`
						: "Clock in not open"
					: todayAttendance.hasTimeIn
						? "Clock out"
						: "Clock in";

	useEffect(() => {
		if (hideTodaySection || !todayTimingSchedule?.startTime) return;
		setClockNow(new Date());
		const intervalId = window.setInterval(() => {
			setClockNow(new Date());
		}, 1000);
		return () => window.clearInterval(intervalId);
	}, [hideTodaySection, todayTimingSchedule?.startTime]);

	if (
		(!hideTodaySection && todayLoading) ||
		isTimesheetViewLoading ||
		isHistoryLoading
	) {
		return <AttendanceTemplateSkeleton hideTodaySection={hideTodaySection} />;
	}

	return (
		<div className="bg-gray-50/30 min-h-screen pb-12">
			{!hideTimesheetActions && (
				<TimesheetModal
					isOpen={isTimesheetModalOpen}
					onClose={handleCloseTimesheetModal}
					employeeId={employeeId}
					deepLinkDay={deepLinkDay}
					onDeepLinkDayChange={handleDeepLinkDayChange}
				/>
			)}

			<div className="grid gap-5 lg:grid-cols-[minmax(360px,420px)_minmax(0,1fr)] xl:grid-cols-[420px_minmax(0,1fr)]">
				{/* Left Column: Current period attendance (cards, no DataTable) */}
				<div className="space-y-4 lg:order-2">
					<div className="flex flex-col gap-3 rounded-md border border-gray-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
						<div className="min-w-0">
							<h2 className="text-sm font-semibold text-gray-950">{recordsTitle}</h2>
							<div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
								<span>{recordsDateRangeLabel}</span>
								<span>{recordCards.length} days</span>
								{hasActivePeriod && (
									<span className="max-w-[220px] truncate text-gray-700">
										{periodName}
									</span>
								)}
							</div>
						</div>
						<div className="flex shrink-0 flex-wrap items-center gap-2">
							<div className="w-[128px]">
								<Select
									value={attendanceFilter}
									onValueChange={(value) =>
										setAttendanceFilter(value as AttendanceFilterValue)
									}>
									<SelectTrigger className="h-9 bg-white">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="ALL">All</SelectItem>
										<SelectItem value="WORK_DAY">Work Day</SelectItem>
										<SelectItem value="HOLIDAY">Holiday</SelectItem>
										<SelectItem value="LEAVE">Leave</SelectItem>
									</SelectContent>
								</Select>
							</div>
							{!hasActivePeriod && (
								<div className="flex items-center gap-1 bg-gray-100 rounded-md p-1">
									<Button
										variant="ghost"
										size="icon"
										className="h-7 w-7"
										onClick={() =>
											canGoPrevMonth &&
											setCurrentMonth((m) => subMonths(m, 1))
										}
										disabled={!canGoPrevMonth}>
										<ChevronLeft className="h-4 w-4" />
									</Button>
									<span className="text-sm font-medium px-2 min-w-[100px] text-center">
										{format(currentMonth, "MMMM yyyy")}
									</span>
									<Button
										variant="ghost"
										size="icon"
										className="h-7 w-7"
										onClick={() =>
											canGoNextMonth &&
											setCurrentMonth((m) => addMonths(m, 1))
										}
										disabled={!canGoNextMonth}>
										<ChevronRight className="h-4 w-4" />
									</Button>
								</div>
							)}
						</div>
					</div>

					<div className="space-y-2.5">
						{isHistoryLoading ? (
							<div className="space-y-4">
								{[1, 2, 3, 4, 5].map((i) => (
									<div
										key={i}
										className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm animate-pulse h-24"
									/>
								))}
							</div>
						) : (
							<>
								{recordCards.map((item: AttendanceRecordCard) => {
									const isExpanded = expandedCardId === item.id;
									const r = item.raw;
									const rawLateMinutes = Math.max(
										0,
										Number((r.metadata as any)?.rawLateMinutes) || 0,
									);
									const hasHoliday =
										r.primaryMarker === "HOLIDAY" ||
										item.status === "Holiday" ||
										(Array.isArray(r.holidayEntries) &&
											r.holidayEntries.length > 0);
									const hasOvertime = toMinutes(r.overtimeHours) > 0;
									const hasLate =
										rawLateMinutes > 0 || toMinutes(r.lateHours) > 0;
									const hasEarlyOut = toMinutes(r.earlyOutHours) > 0;
									const missingClockOutLabel =
										item.missingClockOutState === "missed"
											? "Missed clock out"
											: "Needs clock out";
									const missingClockOutDetail =
										item.missingClockOutState === "missed"
											? "Clock out missing"
											: "Waiting for clock out";
									return (
										<div
											key={item.id}
											className={`bg-white rounded-md border transition-colors overflow-hidden ${
												item.isMissingClockOut
													? "border-amber-200"
													: "border-gray-200"
											}`}>
											<button
												type="button"
												onClick={() => toggleExpanded(item.id)}
												className="w-full group p-3 flex flex-col gap-3 text-left md:flex-row md:items-center md:justify-between">
												<div className="flex min-w-0 items-center gap-3">
													<div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-md border border-gray-100 bg-gray-50">
														<div className="text-[10px] font-semibold uppercase text-gray-500">
															{item.month}
														</div>
														<div className="mt-0.5 text-lg font-semibold leading-none text-gray-950">
															{item.day}
														</div>
													</div>
													<div className="min-w-0">
														<div className="mb-1 flex flex-wrap items-center gap-1.5">
															<h3 className="text-sm font-semibold text-gray-950">
																{item.dateLabel}
															</h3>
															{getStatusBadge(item.status)}
															{item.isMissingClockOut && (
																<span className="inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
																	<AlertCircle className="h-3 w-3" />
																	{missingClockOutLabel}
																</span>
															)}
															{(hasHoliday ||
																hasOvertime ||
																hasLate ||
																hasEarlyOut) && (
																<div className="flex flex-wrap items-center gap-1">
																	{hasHoliday && (
																		<span className="rounded bg-sky-50 px-1 py-0.5 text-[10px] font-semibold text-sky-700">
																			HOL
																		</span>
																	)}
																	{hasOvertime && (
																		<span className="rounded bg-emerald-50 px-1 py-0.5 text-[10px] font-semibold text-emerald-700">
																			+EX
																		</span>
																	)}
																	{hasLate &&
																		item.status !== "Late" && (
																			<span className="rounded bg-amber-50 px-1 py-0.5 text-[10px] font-semibold text-amber-700">
																				LATE
																			</span>
																		)}
																	{hasEarlyOut && (
																		<span className="rounded bg-orange-50 px-1 py-0.5 text-[10px] font-semibold text-orange-700">
																			EO
																		</span>
																	)}
																</div>
															)}
															{r.dayOfWeek && (
																<span className="text-xs text-gray-400">
																	{r.dayOfWeek}
																</span>
															)}
														</div>
														<p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
															<span>In: {item.timeIn}</span>
															<span
																className={
																	item.isMissingClockOut
																		? "font-medium text-amber-700"
																		: undefined
																}>
																Out: {item.timeOut}
															</span>
														</p>
													</div>
												</div>

												<div className="flex flex-1 items-center justify-between gap-4 md:justify-end">
													<div className="text-right">
														<div className="text-[10px] font-medium uppercase text-gray-400">
															Credited
														</div>
														<div className="text-sm font-semibold text-gray-950">
															{item.hours}
														</div>
													</div>
													{isExpanded ? (
														<ChevronUp className="h-5 w-5 shrink-0 text-red-500" />
													) : (
														<ChevronDown className="h-5 w-5 shrink-0 text-gray-300 transition-colors group-hover:text-red-500" />
													)}
												</div>
											</button>

											{isExpanded && (
												<div className="border-t border-gray-100 bg-gray-50/60 px-3 pb-3 pt-3">
													<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-6 gap-y-3 text-sm">
														<div>
															<div className="text-[10px] text-gray-400 uppercase font-medium">
																Regular
															</div>
															<div className="font-medium text-gray-900">
																{formatRecordMetricValue(
																	r,
																	"regularMinutes",
																	"regularHours",
																)}
															</div>
														</div>
														<div>
															<div className="text-[10px] text-gray-400 uppercase font-medium">
																Excess time
															</div>
															<div className="font-medium text-green-700">
																{formatRecordMetricValue(
																	r,
																	"overtimeMinutes",
																	"overtimeHours",
																)}
															</div>
														</div>
														<div>
															<div className="text-[10px] text-gray-400 uppercase font-medium">
																Undertime
															</div>
															<div className="font-medium text-amber-600">
																{formatRecordMetricValue(
																	r,
																	"undertimeMinutes",
																	"undertimeHours",
																)}
															</div>
														</div>
														<div>
															<div className="text-[10px] text-gray-400 uppercase font-medium">
																Late
															</div>
															<div className="font-medium text-red-600">
																{formatRecordLateValue(r)}
															</div>
														</div>
														<div>
															<div className="text-[10px] text-gray-400 uppercase font-medium">
																Early out
															</div>
															<div className="font-medium text-orange-600">
																{formatRecordMetricValue(
																	r,
																	"earlyOutMinutes",
																	"earlyOutHours",
																)}
															</div>
														</div>
														<div>
															<div className="text-[10px] text-gray-400 uppercase font-medium">
																Break
															</div>
															<div className="font-medium text-gray-900">
																{r.breakMinutes != null &&
																r.breakMinutes > 0
																	? `${r.breakMinutes} min`
																	: "-"}
															</div>
														</div>
														{r.isRestDay != null && (
															<div>
																<div className="text-[10px] text-gray-400 uppercase font-medium">
																	Rest day
																</div>
																<div className="font-medium text-gray-900">
																	{r.isRestDay ? "Yes" : "No"}
																</div>
															</div>
														)}
														{item.isMissingClockOut && (
															<div>
																<div className="text-[10px] text-gray-400 uppercase font-medium">
																	Clock state
																</div>
																<div className="font-medium text-amber-700">
																	{missingClockOutDetail}
																</div>
															</div>
														)}
														{r.isManualEntry != null && (
															<div>
																<div className="text-[10px] text-gray-400 uppercase font-medium">
																	Manual entry
																</div>
																<div className="font-medium text-gray-900">
																	{r.isManualEntry ? "Yes" : "No"}
																</div>
															</div>
														)}
													</div>
													{(r.remarks || r.notes) && (
														<div className="mt-3 pt-3 border-t border-gray-200">
															<div className="text-[10px] text-gray-400 uppercase font-medium mb-1">
																Remarks / Notes
															</div>
															<p className="text-sm text-gray-700">
																{r.remarks || r.notes || "-"}
															</p>
														</div>
													)}
												</div>
											)}
										</div>
									);
								})}

								{recordCards.length === 0 && (
									<div className="text-center py-10 text-gray-500 bg-white rounded-xl border border-dashed space-y-3">
										<p>
											{attendanceFilter === "ALL"
												? "No attendance records for this month."
												: `No ${filterLabelByValue[attendanceFilter]} records for ${format(currentMonth, "MMMM yyyy")}.`}
										</p>
										{attendanceFilter !== "ALL" && (
											<div>
												<Button
													variant="outline"
													size="sm"
													onClick={() => setAttendanceFilter("ALL")}>
													Show All
												</Button>
											</div>
										)}
									</div>
								)}
							</>
						)}
					</div>
				</div>

				{/* Active attendance and period context */}
				<div className="flex flex-col gap-5 lg:order-1">
					{/* Current period summary */}
					<div className="order-2 rounded-md border border-gray-200 bg-white p-4">
						<div className="mb-4 flex items-center justify-between gap-3">
							<div className="min-w-0">
								<h3 className="text-sm font-semibold text-gray-950">
									Timesheet Status
								</h3>
								<p className="mt-1 truncate text-xs text-gray-500">
									{periodName}
								</p>
							</div>
							<Badge variant="outline" className="font-normal">
								{timesheetStatus}
							</Badge>
						</div>
						<div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-gray-200 bg-gray-200">
							<div className="bg-white p-3">
								<div className="text-[10px] font-medium uppercase text-gray-500">
									Days
								</div>
								<div className="mt-1 text-base font-semibold text-gray-950">
									{recordCards.length}
								</div>
							</div>
							<div className="bg-white p-3">
								<div className="text-[10px] font-medium uppercase text-gray-500">
									Worked
								</div>
								<div className="mt-1 text-base font-semibold text-gray-950">
									{workedTotal}
								</div>
							</div>
							<div className="bg-white p-3">
								<div className="text-[10px] font-medium uppercase text-gray-500">
									Excess
								</div>
								<div className="mt-1 text-base font-semibold text-gray-950">
									{overtimeTotal}
								</div>
							</div>
							<div className="bg-white p-3">
								<div className="text-[10px] font-medium uppercase text-gray-500">
									Late
								</div>
								<div className="mt-1 text-base font-semibold text-gray-950">
									{lateTotal}
								</div>
							</div>
						</div>
					</div>

					{/* Today Attendance */}
					{shouldShowQuickActionsCard && (
						<div className="order-1 rounded-md border border-gray-300 bg-white p-5 shadow-sm">
							<div className="mb-4 flex items-start justify-between gap-3">
								<div className="min-w-0">
									<div className="text-sm font-semibold text-gray-950">
										{hideTodaySection ? "Timesheet" : "Today"}
									</div>
									{!hideTodaySection && (
										<div className="mt-1 text-xs text-gray-500">
											{format(today, "MMMM d, yyyy")}
										</div>
									)}
								</div>
								{!hideTodaySection && getStatusBadge(todayAttendance.status)}
							</div>
							{!hideTodaySection && (
								<>
									<div className="mb-4 rounded-md border border-gray-200 bg-gray-50 px-3 py-3">
										<div className="text-xs font-medium text-gray-500">
											Next action
										</div>
										<div className="mt-1 text-2xl font-semibold leading-tight text-gray-950">
											{nextActionLabel}
										</div>
									</div>
									{todayTimingSchedule && (
										<div className="mb-4 border-y border-gray-100 py-3">
											<div className="flex items-start justify-between gap-3">
												<div className="min-w-0">
													<div className="text-xs font-medium text-gray-500">
														Time slot
													</div>
													<div className="mt-1 text-base font-semibold leading-6 text-gray-950">
														{formatScheduleWindow(todayTimingSchedule)}
													</div>
													<div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
														{todayBreakLabel && (
															<span>Break: {todayBreakLabel}</span>
														)}
														{todayTimingSchedule.isOvernight && (
															<span>Overnight shift</span>
														)}
													</div>
												</div>
												{shouldShowShiftCountdown ? (
													<div className="shrink-0 text-right">
														<div className="font-mono text-sm font-semibold text-gray-950 tabular-nums">
															{formatCountdownDuration(
																shiftCountdownMs,
															)}
														</div>
														<div className="text-xs text-gray-500">
															until start
														</div>
													</div>
												) : null}
											</div>
											{todayTimingDetail && (
												<div
													className={`mt-3 rounded-md px-3 py-2 text-xs leading-5 ${
														todayAttendance.timing?.state === "late"
															? "bg-red-50 text-red-700"
															: todayAttendance.timing?.state ===
																  "withinGrace"
																? "bg-amber-50 text-amber-800"
																: "bg-gray-50 text-gray-600"
													}`}>
													<span className="font-medium">
														{todayTimingTone.title}.
													</span>{" "}
													{todayTimingDetail}
												</div>
											)}
										</div>
									)}
									{todayAttendance.isPreStart && (
										<div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
											Attendance will be available on{" "}
											<span className="font-semibold">
												{todayAttendance.effectiveStartDate
													? format(
															new Date(
																todayAttendance.effectiveStartDate,
															),
															"MMM d, yyyy",
														)
													: "your start date"}
											</span>
											.
										</div>
									)}
									{todayAttendance.nonWorkReason && (
										<div
											className={`mb-4 rounded-lg border px-4 py-3 ${todayAttendance.nonWorkReason.cardClass}`}>
											<div className="flex items-start gap-3">
												<div
													className={`mt-0.5 rounded-md p-1.5 ${todayAttendance.nonWorkReason.iconClass}`}>
													<CalendarOff className="h-4 w-4" />
												</div>
												<div className="min-w-0">
													<h3
														className={`text-base font-bold leading-6 ${todayAttendance.nonWorkReason.titleClass}`}>
														{todayAttendance.nonWorkReason.title}
													</h3>
													<p
														className={`mt-1 text-sm leading-5 ${todayAttendance.nonWorkReason.detailClass}`}>
														{todayAttendance.nonWorkReason.detail}
													</p>
												</div>
											</div>
										</div>
									)}
									<div className="grid grid-cols-2 gap-3 mb-4">
										<div className="rounded-md border border-gray-200 bg-white p-4">
											<div className="mb-1 text-xs font-medium text-gray-500">
												Clock In
											</div>
											<div className="text-xl font-semibold leading-tight text-gray-950">
												{todayAttendance.clockIn || "-"}
											</div>
										</div>
										<div className="rounded-md border border-gray-200 bg-white p-4">
											<div className="mb-1 text-xs font-medium text-gray-500">
												Clock Out
											</div>
											<div className="text-xl font-semibold leading-tight text-gray-950">
												{todayAttendance.clockOut || "-"}
											</div>
										</div>
									</div>
									{todayAttendance.hasTimeIn && !todayAttendance.hasTimeOut && (
										<div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
											<AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
											<span>
												Clock-in is recorded. Clock out is still missing for
												this shift.
											</span>
										</div>
									)}
									{SHOW_CLOCK_IN_BUTTON && (
										<Button
											className={
												isClockActionDisabled
													? "w-full flex items-center justify-center gap-2 mb-3 bg-gray-400 hover:bg-gray-400 cursor-not-allowed text-white"
													: "w-full flex items-center justify-center gap-2 mb-3 bg-red-600 hover:bg-red-700 text-white"
											}
											onClick={handleClockAction}
											disabled={isClockActionDisabled}>
											{clockInMutation.isPending ||
											clockOutMutation.isPending ? (
												<>
													<Timer className="w-4 h-4 animate-spin" />
													Processing...
												</>
											) : todayAttendance.isPreStart ? (
												<>
													<Clock className="w-4 h-4" />
													Not Yet Started
												</>
											) : todayAttendance.nonWorkReason ? (
												<>
													<CalendarOff className="w-4 h-4" />
													{todayAttendance.nonWorkReason.buttonLabel}
												</>
											) : todayAttendance.hasTimeIn &&
											  todayAttendance.hasTimeOut ? (
												<>
													<CheckCircle className="w-4 h-4" />
													Already Clocked Out
												</>
											) : isBeforeClockInWindow ? (
												<>
													<Clock className="w-4 h-4" />
													Opens at{" "}
													{clockInOpensAt
														? format(clockInOpensAt, "h:mm a")
														: "3h before shift"}
												</>
											) : todayAttendance.hasTimeIn &&
											  !todayAttendance.hasTimeOut ? (
												<>
													<Pause className="w-4 h-4" />
													Clock Out
												</>
											) : (
												<>
													<Play className="w-4 h-4" />
													Clock In
												</>
											)}
										</Button>
									)}
								</>
							)}
							{!hideTimesheetActions && (
								<Button
									variant="outline"
									className="attendance-timesheet-btn w-full flex h-[3.75rem] min-h-[3.75rem] items-center justify-center gap-2 rounded-[10px] text-base font-bold"
									onClick={handleOpenTimesheetModal}>
									<CheckCircle className="w-5 h-5" />
									View Timesheet
								</Button>
							)}
						</div>
					)}

					{/* Help Card - same style as payroll */}
					{/* <div className="bg-red-50/50 rounded-xl p-6 border border-red-100">
						<div className="flex gap-3">
							<div className="bg-red-100 p-2 rounded-lg h-fit text-red-600">
								<HelpCircle className="h-5 w-5" />
							</div>
							<div>
								<h3 className="text-sm font-bold text-red-900 mb-1">
									Attendance Questions?
								</h3>
								<p className="text-xs text-red-700/80 leading-relaxed mb-3">
									If you notice any discrepancy in your attendance records, please
									contact your manager or HR.
								</p>
								<Button
									size="sm"
									variant="outline"
									className="bg-white border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800 h-8 text-xs">
									Contact HR
								</Button>
							</div>
						</div>
					</div> */}
				</div>
			</div>
		</div>
	);
}
