import { useMemo, useState } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "~/components/ui/tooltip";
import { themeColors } from "~/lib/config/theme";
import { CheckCircle2, XCircle, Check, X, MessageSquare } from "lucide-react";
import { Button } from "~/components/atoms/Button";
import { TimesheetDayCell } from "~/components/atoms/TimesheetDayCell";
import type { TimesheetBreakdown } from "~/services/timesheet.service";
import { formatDuration } from "~/lib/utils";
import {
	isAbsenceLikeStatus,
	isVirtualAbsentLikeRecord,
} from "~/lib/utils/attendance-status";
import { TimesheetDayTooltipContent } from "~/components/molecules/TimesheetDayTooltipContent";
import { resolveOvertimeDayBadge } from "~/lib/utils/overtime-candidate";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";

// Extend the base breakdown type with optional leaveType
export type TimesheetBreakdownDay = TimesheetBreakdown & {
	leaveType?: string | null;
	businessDate?: string | null;
};

interface DayApprovalStatus {
	approved: boolean;
	rejected: boolean;
	approverNote: string;
}

interface TimesheetCalendarApprovalProps {
	breakdown?: TimesheetBreakdownDay[];
	className?: string;
	/** Called when week approval status changes - provides updated breakdown */
	onApprovalChange?: (breakdown: TimesheetBreakdownDay[]) => void;
	/** Whether all days have been reviewed */
	allDaysReviewed?: boolean;
	/** Whether there are rejected days */
	hasRejectedDays?: boolean;
	payrollPeriodStartDate?: string | null;
	payrollPeriodEndDate?: string | null;
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

const formatRevisionValue = (value: unknown): string => {
	if (value === null || value === undefined || value === "") return "-";
	if (typeof value === "string") {
		const parsed = new Date(value);
		if (/^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(parsed.getTime())) {
			return parsed.toLocaleTimeString("en-US", {
				hour: "numeric",
				minute: "2-digit",
			});
		}
		return value;
	}
	if (typeof value === "number" || typeof value === "boolean") return String(value);
	return JSON.stringify(value);
};

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

export function TimesheetCalendarApproval({
	breakdown,
	className = "",
	onApprovalChange,
	payrollPeriodStartDate,
	payrollPeriodEndDate,
}: TimesheetCalendarApprovalProps) {
	const [dayStatuses, setDayStatuses] = useState<Record<string, DayApprovalStatus>>({});
	const [rejectingDay, setRejectingDay] = useState<TimesheetBreakdownDay | null>(null);
	const [rejectReason, setRejectReason] = useState("");

	const toLocalMidnight = (date: Date) =>
		new Date(date.getFullYear(), date.getMonth(), date.getDate());

	const parseLocalCalendarDate = (value: string | Date) => {
		if (value instanceof Date) return toLocalMidnight(value);
		const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
		if (match) {
			return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
		}
		const parsed = new Date(value);
		if (Number.isNaN(parsed.getTime())) return toLocalMidnight(parsed);
		const { year, month, day } = getDatePartsInBusinessTimeZone(parsed);
		return new Date(year, month - 1, day);
	};

	const getDayBusinessKey = (day: TimesheetBreakdownDay) =>
		toLocalDateKey(
			parseLocalCalendarDate(day.businessDate || day.metadata?.businessDate || day.date),
		);

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

	// Initialize day statuses from breakdown on mount/change
	useMemo(() => {
		if (!breakdown) return;

		const newStatuses: Record<string, DayApprovalStatus> = {};
		breakdown.forEach((day) => {
			// Preserve existing approval status from backend only.
			const dayKey = getDayBusinessKey(day);
			if (day.approvalStatus && !dayStatuses[dayKey]) {
				newStatuses[dayKey] = {
					approved: day.approvalStatus === "APPROVED",
					rejected: day.approvalStatus === "REJECTED",
					approverNote: day.approverNotes || "",
				};
			}
		});

		if (Object.keys(newStatuses).length > 0) {
			setDayStatuses((prev) => ({ ...prev, ...newStatuses }));
		}
	}, [breakdown]);

	// Get day status (local or from breakdown)
	const getDayStatus = (day: TimesheetBreakdownDay): DayApprovalStatus => {
		const localStatus = dayStatuses[getDayBusinessKey(day)];
		if (localStatus) {
			return localStatus;
		}

		if (day.approvalStatus) {
			return {
				approved: day.approvalStatus === "APPROVED",
				rejected: day.approvalStatus === "REJECTED",
				approverNote: day.approverNotes || "",
			};
		}

		return { approved: false, rejected: false, approverNote: "" };
	};

	// Handle approving a single day
	const handleApproveDay = (dayKey: string, note?: string) => {
		const newStatuses = {
			...dayStatuses,
			[dayKey]: {
				approved: true,
				rejected: false,
				approverNote: note || dayStatuses[dayKey]?.approverNote || "",
			},
		};
		setDayStatuses(newStatuses);
		notifyChange(newStatuses);
	};

	// Handle rejecting a single day
	const handleRejectDay = (dayKey: string, note: string) => {
		const newStatuses = {
			...dayStatuses,
			[dayKey]: { approved: false, rejected: true, approverNote: note },
		};
		setDayStatuses(newStatuses);
		setRejectingDay(null);
		setRejectReason("");
		notifyChange(newStatuses);
	};

	// Handle approving an entire week
	const handleApproveWeek = (weekDays: (TimesheetBreakdownDay | null)[]) => {
		const newStatuses = { ...dayStatuses };
		let hasChanges = false;

		weekDays.forEach((day) => {
			if (!day) return;
			const hours = parseHours(day.hoursWorked);
			const isRestDay = day.status === "REST_DAY";
			const isAbsent = isVirtualAbsentLikeRecord(day) || isAbsenceLikeStatus(day.status);
			const leaveEntries = Array.isArray(day.leaveEntries) ? day.leaveEntries : [];
			const holidayEntries = Array.isArray(day.holidayEntries) ? day.holidayEntries : [];
			const hasLeave = leaveEntries.length > 0 || Boolean(day.leaveType);
			const hasHoliday = holidayEntries.length > 0;
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
			const isActionable = hours > 0 || primaryMarker !== "HOURS";
			const dayKey = getDayBusinessKey(day);

			// Skip if already approved or not actionable
			if (newStatuses[dayKey]?.approved) return;
			if (!isActionable) return;

			newStatuses[dayKey] = {
				approved: true,
				rejected: false,
				approverNote: newStatuses[dayKey]?.approverNote || "",
			};
			hasChanges = true;
		});

		if (hasChanges) {
			setDayStatuses(newStatuses);
			notifyChange(newStatuses);
		}
	};

	// Check if a week is fully approved
	const isWeekApproved = (weekDays: (TimesheetBreakdownDay | null)[]): boolean => {
		return weekDays.every((day) => {
			if (!day) return true;
			const hours = parseHours(day.hoursWorked);
			const isRestDay = day.status === "REST_DAY";
			const isAbsent = isVirtualAbsentLikeRecord(day) || isAbsenceLikeStatus(day.status);
			const leaveEntries = Array.isArray(day.leaveEntries) ? day.leaveEntries : [];
			const holidayEntries = Array.isArray(day.holidayEntries) ? day.holidayEntries : [];
			const hasLeave = leaveEntries.length > 0 || Boolean(day.leaveType);
			const hasHoliday = holidayEntries.length > 0;
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
			const isEmpty = hours === 0 && primaryMarker === "HOURS";

			// Only truly empty days are considered implicitly reviewed.
			if (isEmpty) return true;

			const status = getDayStatus(day);
			return status.approved || status.rejected;
		});
	};

	// Notify parent of approval changes
	const notifyChange = (statuses: Record<string, DayApprovalStatus>) => {
		if (!onApprovalChange || !breakdown) return;

		const updatedBreakdown = breakdown.map((day) => {
			const status = statuses[getDayBusinessKey(day)];
			if (!status) return day;

			return {
				...day,
				approvalStatus: status.approved
					? "APPROVED"
					: status.rejected
						? "REJECTED"
						: day.approvalStatus,
				approverNotes: status.approverNote || day.approverNotes,
			};
		});

		onApprovalChange(updatedBreakdown);
	};

	const handleDayLaborChange = (
		dayKey: string,
		value: "DIRECT" | "INDIRECT" | "unset",
	) => {
		if (!onApprovalChange || !breakdown) return;
		onApprovalChange(
			breakdown.map((day) =>
				getDayBusinessKey(day) === dayKey
					? {
							...day,
							dayLaborType: value === "unset" ? null : value,
						}
					: day,
			),
		);
	};

	// Group breakdown by weeks with days aligned to M-T-W-TH-F-S-SU columns
	const weeks = useMemo(() => {
		// First, deduplicate days by date
		const daysByDate: { [date: string]: TimesheetBreakdownDay } = {};
		(breakdown ?? []).forEach((day) => {
			const dayDate = parseLocalCalendarDate(
				day.businessDate || day.metadata?.businessDate || day.date,
			);
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
					const dayDate = parseLocalCalendarDate(
						day.businessDate || day.metadata?.businessDate || day.date,
					);
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
				<div className="grid grid-cols-[110px_repeat(7,1fr)_84px_112px] border-b border-gray-200 bg-white">
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
					<div className="px-1 py-2 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
						Action
					</div>
				</div>

				{/* Week Rows */}
				<div className="max-h-[420px] overflow-y-auto">
					{weeks.map((week, weekIndex) => {
						const weekApproved = isWeekApproved(week.days);

						return (
							<div
								key={weekIndex}
								className={`grid grid-cols-[110px_repeat(7,1fr)_84px_112px] ${weekIndex !== weeks.length - 1 ? "border-b" : ""}`}>
								{/* Week Label */}
								<div className="px-3 py-1.5 flex items-center bg-white border-r border-gray-200 h-[80px]">
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
												<span className="text-gray-300 text-xs">-</span>
											</div>
										);
									}

									const hours = parseHours(day.hoursWorked);
									const isAbsent =
										isVirtualAbsentLikeRecord(day) ||
										isAbsenceLikeStatus(day.status);
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
									const dayBusinessKey = getDayBusinessKey(day);
									const isPastDay = dayBusinessKey < todayLocalDateKey;
									const dayNum = Number(dayBusinessKey.slice(8, 10));
									const dayStatus = getDayStatus(day);
									const hasEmployeeNote =
										day.employeeNotes && day.employeeNotes.trim() !== "";
									const revisionSummary = day.revisionSummary;
									const hasRevisionChanges = Boolean(
										revisionSummary?.isModified &&
											revisionSummary.changedFields?.length,
									);
									const hasApproverNote =
										dayStatus.approverNote &&
										dayStatus.approverNote.trim() !== "";
									const isActionable = hours > 0 || primaryMarker !== "HOURS";
									const hasWorkedHours = hours > 0;
									const cellKind:
										| "hours"
										| "absent"
										| "rest"
										| "leave"
										| "marker" = hasWorkedHours
										? "hours"
										: hasLeave
													? "leave"
													: isRestDay
														? "rest"
														: isAbsent
															? "absent"
															: primaryMarker === "HOLIDAY"
																? "marker"
																: "hours";
									const overtimeBadge = resolveOvertimeDayBadge(day);
									const cellBadges = [
										...(hasHoliday
											? [{ label: "HOL", tone: "meta" as const }]
											: []),
										...(primaryMarker === "ABSENT"
											? [{ label: "ABSENT", tone: "late" as const }]
											: []),
										...(primaryMarker === "REST_DAY" && hasWorkedHours
											? [{ label: "REST", tone: "meta" as const }]
											: []),
										...(day.nightShift?.isNightShiftDay
											? [{ label: "NS", tone: "night" as const }]
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
									];
									const wrapperStateClass = dayStatus.approved
										? "bg-green-50 ring-1 ring-inset ring-green-300"
										: dayStatus.rejected
											? "bg-red-50 ring-1 ring-inset ring-red-300"
											: "";

									return (
										<Tooltip key={i}>
											<TooltipTrigger asChild>
												<div
													className={`group relative border-r border-gray-100 ${wrapperStateClass}`}>
													{/* Status Icons - Top Right */}
													<div className="absolute top-0.5 right-0.5 flex gap-0.5">
														{dayStatus.approved && (
															<CheckCircle2 className="w-3 h-3 text-green-600" />
														)}
														{dayStatus.rejected && (
															<XCircle className="w-3 h-3 text-red-600" />
														)}
														{hasApproverNote && (
															<MessageSquare className="w-3 h-3 text-blue-500" />
														)}
													</div>
													<TimesheetDayCell
														dayNumber={dayNum}
														kind={cellKind}
														isPastDay={isPastDay}
														hoursLabel={formatDuration(day.hoursWorked)}
														leaveLabel={(
															leaveEntries[0]?.leaveType ||
															day.leaveType ||
															"LEAVE"
														)
															.toString()
															.slice(0, 4)}
														markerLabel={
															primaryMarker === "HOLIDAY" ? "H" : "M"
														}
														badges={cellBadges}
														modified={hasRevisionChanges}
														className="cursor-help"
													/>

													{/* Hover Action Buttons */}
													{isActionable &&
														!dayStatus.approved &&
														!dayStatus.rejected && (
															<div className="absolute inset-x-0 bottom-0 flex justify-center z-10 opacity-0 group-hover:opacity-100 transition-all duration-200">
																<div className="flex items-center gap-0.5 p-0.5 bg-white shadow-lg border rounded-full scale-90">
																	<button
																		onClick={(e) => {
																			e.stopPropagation();
																			handleApproveDay(
																				dayBusinessKey,
																			);
																		}}
																		className="w-5 h-5 flex items-center justify-center rounded-full text-green-600 hover:bg-green-50 transition-colors"
																		title="Approve">
																		<Check className="w-3 h-3 stroke-[3]" />
																	</button>
																	<button
																		onClick={(e) => {
																			e.stopPropagation();
																			setRejectingDay(day);
																			setRejectReason("");
																		}}
																		className="w-5 h-5 flex items-center justify-center rounded-full text-red-600 hover:bg-red-50 transition-colors"
																		title="Reject">
																		<X className="w-3 h-3 stroke-[3]" />
																	</button>
																</div>
															</div>
														)}
												</div>
											</TooltipTrigger>
											<TooltipContent
												side="top"
												sideOffset={8}
												className="p-2.5 bg-white shadow-lg border z-50">
												<div className="space-y-2 min-w-[220px] p-2">
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
															metadata: {
																...(day.metadata || {}),
																businessDate:
																	day.businessDate ||
																	day.metadata?.businessDate ||
																	dayBusinessKey,
															},
															nightShift: day.nightShift,
															dayLaborType: day.dayLaborType,
														}}
													/>
													<div
														className="pt-1"
														onPointerDown={(event) =>
															event.stopPropagation()
														}>
														<p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
															Day labor
														</p>
														<Select
															value={
																day.dayLaborType === "DIRECT" ||
																day.dayLaborType === "INDIRECT"
																	? day.dayLaborType
																	: "unset"
															}
															onValueChange={(value) =>
																handleDayLaborChange(
																	dayBusinessKey,
																	value as
																		| "DIRECT"
																		| "INDIRECT"
																		| "unset",
																)
															}>
															<SelectTrigger className="h-8 rounded-sm border-gray-200 bg-white text-xs">
																<SelectValue />
															</SelectTrigger>
															<SelectContent>
																<SelectItem value="unset">
																	Not tagged
																</SelectItem>
																<SelectItem value="DIRECT">
																	Direct
																</SelectItem>
																<SelectItem value="INDIRECT">
																	Indirect
																</SelectItem>
															</SelectContent>
														</Select>
													</div>
													{hasEmployeeNote && (
														<div className="text-[10px] text-gray-600 bg-orange-50 p-1.5 rounded mt-1 border border-orange-100">
															<b className="text-orange-700">Note:</b>{" "}
															{day.employeeNotes}
														</div>
													)}
													{hasApproverNote && (
														<div className="text-[10px] text-gray-600 bg-blue-50 p-1.5 rounded mt-1 border border-blue-100">
															<b className="text-blue-700">
																Approver:
															</b>{" "}
															{dayStatus.approverNote}
														</div>
													)}
													{hasRevisionChanges && revisionSummary && (
														<div className="text-[10px] text-gray-700 bg-amber-50 p-1.5 rounded mt-1 border border-amber-100">
															<div className="font-semibold text-amber-800">
																Modified submission
															</div>
															<div className="mt-1 space-y-1">
																{revisionSummary.changedFields
																	.slice(0, 5)
																	.map((change) => (
																		<div
																			key={change.field}
																			className="grid grid-cols-[68px_1fr] gap-1">
																			<span className="font-medium text-gray-700">
																				{change.label}
																			</span>
																			<span className="text-gray-600">
																				{formatRevisionValue(
																					change.before,
																				)}{" "}
																				-&gt;{" "}
																				{formatRevisionValue(
																					change.after,
																				)}
																			</span>
																		</div>
																	))}
															</div>
															{revisionSummary.changedFields.length > 5 && (
																<div className="mt-1 text-gray-500">
																	+
																	{revisionSummary.changedFields
																		.length - 5}{" "}
																	more
																</div>
															)}
														</div>
													)}
													{/* Approval Status */}
													{(dayStatus.approved || dayStatus.rejected) && (
														<div
															className={`text-[10px] font-semibold mt-1 ${dayStatus.approved ? "text-green-600" : "text-red-600"}`}>
															{dayStatus.approved
																? "Approved"
																: "Rejected"}
														</div>
													)}
												</div>
											</TooltipContent>
										</Tooltip>
									);
								})}

								{/* Week Total */}
								<div className="px-2 py-1.5 flex items-center justify-center bg-gray-50 border-l">
									<span
										className="text-xs font-bold leading-tight whitespace-nowrap"
										style={{ color: themeColors.orange }}>
										{formatDuration(week.totalTime)}
									</span>
								</div>

								{/* Week Action Button */}
								<div className="px-2 py-1.5 flex items-center justify-center bg-gray-50 border-l">
									{weekApproved ? (
										<div className="flex items-center gap-1 text-green-600">
											<CheckCircle2 className="w-4 h-4" />
											<span className="text-[10px] font-semibold">Done</span>
										</div>
									) : (
										<Button
											size="sm"
											onClick={() => handleApproveWeek(week.days)}
											className="h-7 px-2 text-[10px] font-semibold text-white"
											style={{ backgroundColor: themeColors.orange }}>
											<Check className="w-3 h-3 mr-1" />
											Approve
										</Button>
									)}
								</div>
							</div>
						);
					})}
				</div>
			</div>

			{/* Reject Reason Modal */}
			{rejectingDay && (
				<div
					className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
					onClick={() => setRejectingDay(null)}>
					<div
						className="bg-white rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl"
						onClick={(e) => e.stopPropagation()}>
						<h3 className="text-lg font-semibold text-gray-900 mb-4">
							Reject Day:{" "}
							{parseLocalCalendarDate(
								rejectingDay.businessDate ||
									rejectingDay.metadata?.businessDate ||
									rejectingDay.date,
							).toLocaleDateString("en-US", {
								month: "short",
								day: "numeric",
							})}
						</h3>
						<div className="mb-4">
							<label className="block text-sm font-medium text-gray-700 mb-2">
								Reason for Rejection <span className="text-red-500">*</span>
							</label>
							<textarea
								value={rejectReason}
								onChange={(e) => setRejectReason(e.target.value)}
								placeholder="Please provide a reason..."
								className="w-full p-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500"
								rows={3}
								autoFocus
							/>
						</div>
						<div className="flex gap-3">
							<Button
								variant="outline"
								className="flex-1"
								onClick={() => setRejectingDay(null)}>
								Cancel
							</Button>
							<Button
								className="flex-1 bg-red-600 hover:bg-red-700 text-white"
								disabled={!rejectReason.trim()}
								onClick={() => {
									handleRejectDay(getDayBusinessKey(rejectingDay), rejectReason);
								}}>
								Confirm Reject
							</Button>
						</div>
					</div>
				</div>
			)}
		</TooltipProvider>
	);
}

// Export helper to check if all days are reviewed
export function checkAllDaysReviewed(breakdown: TimesheetBreakdownDay[]): boolean {
	return breakdown.every((day) => {
		const hours = parseHours(day.hoursWorked);
		const isRestDay = day.status === "REST_DAY";
		const isAbsent = isVirtualAbsentLikeRecord(day) || isAbsenceLikeStatus(day.status);
		const leaveEntries = Array.isArray(day.leaveEntries) ? day.leaveEntries : [];
		const holidayEntries = Array.isArray(day.holidayEntries) ? day.holidayEntries : [];
		const hasLeave = leaveEntries.length > 0 || Boolean(day.leaveType);
		const hasHoliday = holidayEntries.length > 0;
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
		const isEmpty = hours === 0 && primaryMarker === "HOURS";

		// Only truly empty days are considered implicitly reviewed.
		if (isEmpty) return true;

		return day.approvalStatus === "APPROVED" || day.approvalStatus === "REJECTED";
	});
}

// Export helper to check if there are rejected days
export function checkHasRejectedDays(breakdown: TimesheetBreakdownDay[]): boolean {
	return breakdown.some((day) => day.approvalStatus === "REJECTED");
}
