import { useMemo, useState } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "~/components/ui/tooltip";
import { themeColors } from "~/lib/config/theme";
import { formatDuration } from "~/lib/utils";
import {
	isAbsenceLikeStatus,
	isVirtualAbsentLikeRecord,
} from "~/lib/utils/attendance-status";
import type { TimesheetBreakdown } from "~/services/timesheet.service";
import { TimesheetDayCell } from "~/components/atoms/TimesheetDayCell";
import {
	canFileOvertimeRequest,
	readOvertimeCandidateFromDay,
	resolveOvertimeDayBadge,
} from "~/lib/utils/overtime-candidate";
import { TimesheetDayTooltipContent } from "~/components/molecules/TimesheetDayTooltipContent";
import type { DayPayrollCorrectionMarker } from "~/lib/utils/payroll-correction-day-markers";
import { Calendar, CalendarClock, Pencil, Wallet } from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";

export type TimesheetBreakdownDay = TimesheetBreakdown & {
	leaveType?: string | null;
	businessDate?: string | null;
};

export type TimesheetDayRequestAction =
	| "leave"
	| "schedule-change"
	| "overtime"
	| "payroll-correction";

interface TimesheetCalendarProps {
	breakdown?: TimesheetBreakdownDay[];
	className?: string;
	onDayClick?: (day: TimesheetBreakdownDay) => void;
	onDayRequestAction?: (action: TimesheetDayRequestAction, day: TimesheetBreakdownDay) => void;
	modifiedDayKeys?: string[];
	payrollPeriodStartDate?: string | null;
	payrollPeriodEndDate?: string | null;
	/** Suppress hover tooltips while a day editor modal is open */
	disableDayTooltips?: boolean;
	/** When true, day menu prioritizes payroll correction (period already processed) */
	isPayrollLocked?: boolean;
	/** Map of YYYY-MM-DD → payroll correction marker for requested/approved deltas */
	payrollCorrectionByDate?: Map<string, DayPayrollCorrectionMarker> | null;
	/** Multi-select days by click (used by inline payroll correction mode) */
	selectionMode?: boolean;
	/** Selected day keys (YYYY-MM-DD) when selectionMode is on */
	selectedDayKeys?: string[] | Set<string> | null;
	/** Toggle a day in multi-select mode */
	onToggleDaySelect?: (day: TimesheetBreakdownDay) => void;
}

// Helper function to convert "HH:MM" to decimal hours
const parseHours = (timeStr?: string): number => {
	if (!timeStr) return 0;
	if (!timeStr.includes(":")) return parseFloat(timeStr);
	const [hours, minutes] = timeStr.split(":").map(Number);
	return hours + (minutes || 0) / 60;
};

// Helper function to sum time strings in HH:MM format
const sumTimeStrings = (timeStrings: string[]): string => {
	let totalMinutes = 0;
	for (const timeStr of timeStrings) {
		if (!timeStr || timeStr === "0:00") continue;
		const [hours, minutes] = timeStr.split(":").map(Number);
		totalMinutes += hours * 60 + (minutes || 0);
	}
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;
	return `${hours}:${minutes.toString().padStart(2, "0")}`;
};

// Note: formatMilitaryTime is now imported from ~/lib/utils

// Day column headers
const dayHeaders = ["M", "T", "W", "TH", "F", "S", "SU"];
const businessTimeZone = "Asia/Manila";

const getDatePartsInBusinessTimeZone = (date: Date) => {
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

export function TimesheetCalendar({
	breakdown,
	className = "",
	onDayClick,
	onDayRequestAction,
	modifiedDayKeys,
	payrollPeriodStartDate,
	payrollPeriodEndDate,
	disableDayTooltips = false,
	isPayrollLocked = false,
	payrollCorrectionByDate = null,
	selectionMode = false,
	selectedDayKeys = null,
	onToggleDaySelect,
}: TimesheetCalendarProps) {
	const [openDayMenuKey, setOpenDayMenuKey] = useState<string | null>(null);
	const showDayTooltips =
		!disableDayTooltips && openDayMenuKey === null && !selectionMode;
	const selectedDaysSet = useMemo(() => {
		if (!selectedDayKeys) return new Set<string>();
		if (selectedDayKeys instanceof Set) return selectedDayKeys;
		return new Set(selectedDayKeys.filter(Boolean));
	}, [selectedDayKeys]);
	const toLocalMidnight = (date: Date) =>
		new Date(date.getFullYear(), date.getMonth(), date.getDate());

	const parseLocalCalendarDate = (value: string | Date) => {
		if (value instanceof Date) return toLocalMidnight(value);
		const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
		if (match) {
			return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
		}
		const parsed = new Date(value);
		if (Number.isNaN(parsed.getTime())) return toLocalMidnight(parsed);
		const { year, month, day } = getDatePartsInBusinessTimeZone(parsed);
		return new Date(year, month - 1, day);
	};

	const getBreakdownCalendarDate = (day: TimesheetBreakdownDay) =>
		parseLocalCalendarDate(day.businessDate || day.metadata?.businessDate || day.date);

	const toLocalDateKey = (date: Date) => {
		const y = date.getFullYear();
		const m = String(date.getMonth() + 1).padStart(2, "0");
		const d = String(date.getDate()).padStart(2, "0");
		return `${y}-${m}-${d}`;
	};
	const todayLocalDateKey = toLocalDateKey(toLocalMidnight(new Date()));

	const getWeekStartMonday = (date: Date) => {
		const midnight = toLocalMidnight(date);
		const dayOfWeek = midnight.getDay(); // 0 is Sunday
		const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
		const weekStart = new Date(midnight);
		weekStart.setDate(midnight.getDate() + diff);
		return weekStart;
	};

	const payrollStart = payrollPeriodStartDate
		? parseLocalCalendarDate(payrollPeriodStartDate)
		: null;
	const payrollEnd = payrollPeriodEndDate ? parseLocalCalendarDate(payrollPeriodEndDate) : null;
	const modifiedDaysSet = useMemo(() => new Set(modifiedDayKeys || []), [modifiedDayKeys]);

	// Group breakdown by weeks with days aligned to M-T-W-TH-F-S-SU columns
	const weeks = useMemo(() => {
		// First, deduplicate days by date
		const daysByDate: { [date: string]: TimesheetBreakdownDay } = {};
		(breakdown ?? []).forEach((day) => {
			const dayDate = getBreakdownCalendarDate(day);
			if (payrollStart && dayDate < payrollStart) return;
			if (payrollEnd && dayDate > payrollEnd) return;
			const dateStr = toLocalDateKey(dayDate);
			const hours = parseHours(day.hoursWorked);
			const existingDay = daysByDate[dateStr];

			if (!existingDay) {
				daysByDate[dateStr] = day;
			} else {
				const existingHours = parseHours(existingDay.hoursWorked);
				if (existingHours === 0 && hours > 0) {
					daysByDate[dateStr] = day;
				}
			}
		});

		const getWeekStartsFromPeriod = () => {
			if (!payrollStart || !payrollEnd) return [];
			const starts: string[] = [];
			let cursor = getWeekStartMonday(payrollStart);
			const endWeekStart = getWeekStartMonday(payrollEnd);
			while (cursor <= endWeekStart) {
				starts.push(toLocalDateKey(cursor));
				cursor = new Date(cursor);
				cursor.setDate(cursor.getDate() + 7);
			}
			return starts;
		};

		const weekStartsFromBreakdown = Array.from(
			new Set(
				Object.values(daysByDate).map((day) => {
					const dayDate = getBreakdownCalendarDate(day);
					return toLocalDateKey(getWeekStartMonday(dayDate));
				}),
			),
		).sort((a, b) => parseLocalCalendarDate(a).getTime() - parseLocalCalendarDate(b).getTime());

		const weekStarts =
			getWeekStartsFromPeriod().length > 0
				? getWeekStartsFromPeriod()
				: weekStartsFromBreakdown;

		return weekStarts.map((weekStart) => {
			// Create array of 7 days (Mon-Sun), filling in nulls for missing days
			const weekDays: (TimesheetBreakdownDay | null)[] = [
				null,
				null,
				null,
				null,
				null,
				null,
				null,
			];

			const weekStartDate = parseLocalCalendarDate(weekStart);
			for (let index = 0; index < 7; index++) {
				const dayDate = new Date(weekStartDate);
				dayDate.setDate(weekStartDate.getDate() + index);
				const dayKey = toLocalDateKey(dayDate);
				const inPayrollRange =
					(!payrollStart || dayDate >= payrollStart) &&
					(!payrollEnd || dayDate <= payrollEnd);
				if (!inPayrollRange) continue;
				weekDays[index] = daysByDate[dayKey] || null;
			}

			// Sum time strings directly to avoid precision loss
			const totalTime = sumTimeStrings(
				weekDays
					.filter((day): day is TimesheetBreakdownDay => Boolean(day))
					.map((day) => day.hoursWorked || "0:00"),
			);

			// Get week label with date range
			const weekEndDate = new Date(weekStartDate);
			weekEndDate.setDate(weekEndDate.getDate() + 6);

			const clampedStart =
				payrollStart && weekStartDate < payrollStart ? payrollStart : weekStartDate;
			const clampedEnd = payrollEnd && weekEndDate > payrollEnd ? payrollEnd : weekEndDate;

			const formatShort = (d: Date) =>
				d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

			return {
				weekKey: weekStart,
				weekLabel: `${formatShort(clampedStart)} - ${formatShort(clampedEnd)}`,
				days: weekDays,
				totalTime,
			};
		});
	}, [breakdown, payrollStart, payrollEnd]);

	if ((!breakdown || breakdown.length === 0) && weeks.length === 0) {
		return (
			<div className={`border rounded-lg p-8 text-center text-gray-500 ${className}`}>
				No attendance data available
			</div>
		);
	}

	return (
		<TooltipProvider>
			<div className={`border border-gray-200 rounded-lg overflow-hidden bg-white ${className}`}>
				{/* Table Header */}
				<div className="grid grid-cols-[100px_repeat(7,1fr)_70px] border-b border-gray-200 bg-white">
					<div className="px-2 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
						Week
					</div>
					{dayHeaders.map((day, i) => (
						<div
							key={i}
							className="px-1 py-2 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
							{day}
						</div>
					))}
					<div className="px-1 py-2 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
						Total
					</div>
				</div>

				{/* Week Rows */}
				<div className="max-h-[420px] overflow-y-auto">
					{weeks.map((week, weekIndex) => (
						<div
							key={weekIndex}
							className={`grid grid-cols-[100px_repeat(7,1fr)_70px] ${weekIndex !== weeks.length - 1 ? "border-b" : ""}`}>
							{/* Week Label */}
							<div className="px-2 py-1.5 flex items-center bg-white border-r border-gray-200 h-[80px]">
								<span className="text-xs font-medium text-gray-700 leading-tight">
									{week.weekLabel}
								</span>
							</div>

							{/* Day Cells */}
							{week.days.map((day, i) => {
								// Handle null days (days not in the pay period)
								if (!day) {
									return (
										<div
											key={i}
											className="border-r border-gray-200 bg-white flex items-center justify-center h-[80px]">
											<span className="text-gray-300 text-xs">—</span>
										</div>
									);
								}

								const hours = parseHours(day.hoursWorked);
								const hasRecordedTime =
									Boolean(day.timeIn) || Boolean(day.timeOut) || hours > 0;
								const hasWorkedHours = hours > 0;
								const statusKey = String(day.status || "").toUpperCase();
								const hasScheduleError =
									statusKey === "NO_SCHEDULE" ||
									statusKey === "UNSCHEDULED" ||
									day.metadata?.scheduleRepair?.code === "NO_EMPLOYEE_SCHEDULE";
								const isAbsent =
									isVirtualAbsentLikeRecord(day) || isAbsenceLikeStatus(day.status);
								const isRestDay = day.status === "REST_DAY";
								const leaveEntries = Array.isArray(day.leaveEntries)
									? day.leaveEntries
									: [];
								const holidayEntries = Array.isArray(day.holidayEntries)
									? day.holidayEntries
									: [];
								const hasLeave =
									leaveEntries.length > 0 ||
									Boolean(day.leaveType) ||
									day.primaryMarker === "LEAVE" ||
									day.status === "LEAVE";
								const hasHoliday =
									holidayEntries.length > 0 ||
									day.primaryMarker === "HOLIDAY" ||
									day.status === "HOLIDAY";
								const isOpenShift =
									(statusKey === "NOT_CLOCKED_IN" || statusKey === "SCHEDULED") &&
									!hasRecordedTime;
								const isNightShiftDay = Boolean(day.nightShift?.isNightShiftDay);
								const primaryMarker = hasHoliday
									? "HOLIDAY"
									: hasLeave
										? "LEAVE"
										: isRestDay
											? "REST_DAY"
											: isAbsent
												? "ABSENT"
												: day.primaryMarker === "HOLIDAY" ||
													  day.primaryMarker === "LEAVE" ||
													  day.primaryMarker === "REST_DAY" ||
													  day.primaryMarker === "ABSENT"
													? day.primaryMarker
													: "HOURS";
								const calendarDate = getBreakdownCalendarDate(day);
								const dayNum = calendarDate.getDate();
								const dayKey = toLocalDateKey(calendarDate);
								const isPastDay = dayKey < todayLocalDateKey;
								const isModified = modifiedDaysSet.has(dayKey);
								const canRequestScheduleChange = dayKey >= todayLocalDateKey;

								const kind:
									| "hours"
									| "absent"
									| "rest"
									| "leave"
									| "marker"
									| "pending"
									| "scheduleError" = hasScheduleError
									? "scheduleError"
									: hasWorkedHours
									? "hours"
									: hasLeave
											? "leave"
											: isRestDay
												? "rest"
												: isAbsent
													? "absent"
													: primaryMarker === "HOLIDAY"
														? "marker"
													: isOpenShift
														? "pending"
														: "hours";

								const overtimeCandidate = readOvertimeCandidateFromDay(day);
								const overtimeBadge = resolveOvertimeDayBadge(day);
								const correctionMarker =
									payrollCorrectionByDate?.get(dayKey) || null;
								const isDaySelected = selectedDaysSet.has(dayKey);
								const cellBadges = [
									...(isNightShiftDay
										? [{ label: "NS", tone: "night" as const }]
										: []),
									...(hasHoliday
										? [{ label: "HOL", tone: "meta" as const }]
										: []),
									...(hasLeave ? [{ label: "LV", tone: "meta" as const }] : []),
									...(primaryMarker === "ABSENT"
										? [{ label: "ABSENT", tone: "late" as const }]
										: []),
									...(isRestDay && hasWorkedHours
										? [{ label: "OFF", tone: "meta" as const }]
										: []),
									...(overtimeBadge ? [overtimeBadge] : []),
									...(day.metadata?.withinGrace
										? [{ label: "GRACE", tone: "meta" as const }]
										: []),
									...(!day.metadata?.withinGrace &&
									day.lateHours &&
									day.lateHours !== "0:00"
										? [{ label: "LATE", tone: "late" as const }]
										: []),
									...(day.earlyOutHours && day.earlyOutHours !== "0:00"
										? [{ label: "EO", tone: "eo" as const }]
										: []),
									...(day.dayLaborType === "DIRECT"
										? [{ label: "DIR", tone: "meta" as const }]
										: []),
									...(day.dayLaborType === "INDIRECT"
										? [{ label: "IND", tone: "meta" as const }]
										: []),
									...(correctionMarker
										? [
												{
													label: correctionMarker.badgeLabel,
													tone: correctionMarker.badgeTone,
												},
											]
										: []),
								];
								const dayCell = (
									<TimesheetDayCell
										dayNumber={dayNum}
										kind={kind}
										isPastDay={isPastDay}
										markerLabel={primaryMarker === "HOLIDAY" ? "H" : "M"}
										hoursLabel={formatDuration(day.hoursWorked)}
										leaveLabel={
											(
												leaveEntries[0]?.leaveType ||
												day.leaveType ||
												"LEAVE"
											)
												.toString()
												.slice(0, 4) || undefined
										}
										modified={isModified}
										selected={isDaySelected}
										hasPayrollCorrection={Boolean(correctionMarker)}
										payrollCorrectionTone={
											correctionMarker?.badgeTone || "correction-ready"
										}
										onClick={
											selectionMode && onToggleDaySelect
												? () => onToggleDaySelect(day)
												: onDayRequestAction
													? undefined
													: onDayClick
														? () => onDayClick(day)
														: undefined
										}
										className={
											selectionMode
												? isDaySelected
													? "cursor-pointer bg-orange-50/70"
													: "cursor-pointer"
												: onDayRequestAction
													? "cursor-pointer"
													: ""
										}
										badges={cellBadges}
									/>
								);
								const dayTrigger =
									selectionMode ? (
										dayCell
									) : onDayRequestAction ? (
									<DropdownMenu
										open={openDayMenuKey === dayKey}
										onOpenChange={(open) =>
											setOpenDayMenuKey(open ? dayKey : null)
										}>
										<DropdownMenuTrigger asChild>{dayCell}</DropdownMenuTrigger>
										<DropdownMenuContent align="center" className="w-52">
											{isPayrollLocked && (
												<>
													<DropdownMenuItem
														onClick={() =>
															onDayRequestAction(
																"payroll-correction",
																day,
															)
														}>
														<Wallet className="mr-2 h-4 w-4" />
														Request payroll correction
													</DropdownMenuItem>
													<DropdownMenuSeparator />
												</>
											)}
											{onDayClick && !isPayrollLocked && (
												<>
													<DropdownMenuItem onClick={() => onDayClick(day)}>
														<Pencil className="mr-2 h-4 w-4" />
														Edit Timesheet Day
													</DropdownMenuItem>
													<DropdownMenuSeparator />
												</>
											)}
											{!isPayrollLocked && (
												<>
													<DropdownMenuItem
														onClick={() =>
															onDayRequestAction("leave", day)
														}>
														<Calendar className="mr-2 h-4 w-4" />
														Leave Request
													</DropdownMenuItem>
													{canFileOvertimeRequest(overtimeCandidate) && (
														<DropdownMenuItem
															onClick={() =>
																onDayRequestAction("overtime", day)
															}>
															<CalendarClock className="mr-2 h-4 w-4" />
															File Overtime Request (
															{overtimeCandidate.pendingOvertimeHours})
														</DropdownMenuItem>
													)}
													{canRequestScheduleChange && (
														<DropdownMenuItem
															onClick={() =>
																onDayRequestAction(
																	"schedule-change",
																	day,
																)
															}>
															<CalendarClock className="mr-2 h-4 w-4" />
															Schedule Change Request
														</DropdownMenuItem>
													)}
												</>
											)}
										</DropdownMenuContent>
									</DropdownMenu>
								) : (
									dayCell
								);

								if (!showDayTooltips) {
									return <div key={i}>{dayTrigger}</div>;
								}

								return (
									<Tooltip key={i}>
										<TooltipTrigger asChild>
											<div>{dayTrigger}</div>
										</TooltipTrigger>
										<TooltipContent
											side="top"
											sideOffset={8}
											className="p-4 bg-white shadow-lg border z-50 min-w-[260px]">
											<TimesheetDayTooltipContent
												day={{
													date: day.date,
													businessDate: day.businessDate,
													timeIn: day.timeIn,
													timeOut: day.timeOut,
													hoursWorked: day.hoursWorked,
													regularHours: day.regularHours,
													overtimeHours: day.overtimeHours,
													lateHours: day.lateHours,
													earlyOutHours: day.earlyOutHours,
													status: day.status,
													leaveType: day.leaveType,
													leaveEntries: leaveEntries,
													holidayEntries: holidayEntries,
													primaryMarker: primaryMarker,
													approvalStatus: day.approvalStatus,
													employeeNotes: day.employeeNotes,
													approverNotes: day.approverNotes,
													metadata: {
														...(day.metadata || {}),
														businessDate:
															day.businessDate ||
															day.metadata?.businessDate ||
															dayKey,
													},
													nightShift: day.nightShift,
													dayLaborType: day.dayLaborType,
												}}
												modified={isModified}
												payrollCorrection={correctionMarker}
												onEdit={
													onDayClick && !isPayrollLocked
														? () => onDayClick(day)
														: undefined
												}
											/>
										</TooltipContent>
									</Tooltip>
								);
							})}

							{/* Week Total */}
							<div className="px-1 py-1.5 flex items-center justify-center bg-gray-50 border-l h-[80px]">
								<span
									className="text-xs font-bold leading-tight whitespace-nowrap"
									style={{ color: themeColors.orange }}>
									{formatDuration(week.totalTime)}
								</span>
							</div>
						</div>
					))}
				</div>
			</div>
		</TooltipProvider>
	);
}
