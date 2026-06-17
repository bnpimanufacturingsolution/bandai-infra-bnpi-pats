import { useState, useEffect } from "react";
import { Button } from "~/components/atoms/Button";
import { Modal } from "~/components/atoms/Modal";
import { ReviewActionModal, type ReviewStatus } from "~/components/organisms/ReviewActionModal";
import {
	Calendar,
	CheckCircle2,
	AlertCircle,
	FileText,
	XCircle,
	Clock,
	Palmtree,
	MessageSquare,
	Check,
	X,
} from "lucide-react";
import { toast } from "sonner";
import { themeColors } from "~/lib/config/theme";
import type { Timesheet } from "~/services/timesheet.service";
import { useTimesheet, useTimesheetAction } from "~/lib/hooks/useTimesheets";
import { formatMinutesDuration } from "~/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";

interface DayStatus {
	approved: boolean;
	rejected: boolean;
	approverNote: string;
}

interface TimesheetModalProps {
	isOpen: boolean;
	onClose: () => void;
	timesheet?: Timesheet | null;
	onApprove?: (id: string) => void;
	onReject?: (id: string, reason: string) => void;
	searchParams?: URLSearchParams;
	updateSearchParams?: (fn: (params: URLSearchParams) => void) => void;
	onRefresh?: () => void;
	isLoading?: boolean;
}

// Helper function to convert "HH:MM" to decimal hours
const parseHours = (timeStr?: string): number => {
	if (!timeStr) return 0;
	// Handle decimal directly if passed as string
	if (!timeStr.includes(":")) return parseFloat(timeStr);
	const [hours, minutes] = timeStr.split(":").map(Number);
	return hours + (minutes || 0) / 60;
};

// Helper function to sum time strings in HH:MM format directly (avoids precision loss)
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

// Helper function to convert decimal hours to HH:MM format
const formatDecimalToTime = (decimalHours: number): string => {
	const hours = Math.floor(decimalHours);
	const minutes = Math.round((decimalHours - hours) * 60);
	return `${hours}:${minutes.toString().padStart(2, "0")}`;
};

// Helper function to format hours as hours and minutes
const formatHoursMinutes = (decimalHours: number): string => {
	if (decimalHours === 0) return "—";
	const hours = Math.floor(decimalHours);
	const minutes = Math.round((decimalHours - hours) * 60);
	if (minutes === 0) return `${hours}h`;
	if (hours === 0) return `${minutes}m`;
	return `${hours}h ${minutes}m`;
};

// Helper function to format ISO timestamp to readable time
const formatTime = (isoString: string): string => {
	try {
		const date = new Date(isoString);
		return date.toLocaleTimeString("en-US", {
			hour: "2-digit",
			minute: "2-digit",
			hour12: true,
		});
	} catch {
		return isoString;
	}
};

const formatWithinGraceLabel = (rawLateMinutes?: number | null): string => {
	const raw = Math.max(0, Number(rawLateMinutes) || 0);
	if (raw <= 0) return "Within grace";
	return `Within grace (${formatMinutesDuration(raw, { compact: true })})`;
};

export function TimesheetModal({
	isOpen,
	onClose,
	timesheet,
	onApprove,
	onReject,
	searchParams,
	updateSearchParams,
	isLoading,
}: TimesheetModalProps) {
	const [approvedWeeks, setApprovedWeeks] = useState<string[]>([]);
	const [dayStatuses, setDayStatuses] = useState<Record<string, DayStatus>>({});
	const [selectedDay, setSelectedDay] = useState<any>(null);
	const [rejectingDay, setRejectingDay] = useState<any>(null);
	const [rejectReason, setRejectReason] = useState("");
	const [approverNote, setApproverNote] = useState("");

	// Use existing hook for timesheet actions
	const timesheetActionMutation = useTimesheetAction();

	// Deep link: auto-select day based on URL parameters
	const dayParam = searchParams?.get("day");

	// Use passed timesheet directly
	const effectiveTimesheet = timesheet;
	const breakdown = effectiveTimesheet?.breakdown || [];

	useEffect(() => {
		if (dayParam && breakdown.length > 0) {
			const day = breakdown.find((d: any) => {
				const date = new Date(d.date).toISOString().split("T")[0];
				return date === dayParam;
			});
			if (
				day &&
				(!selectedDay ||
					new Date(selectedDay.date).toISOString().split("T")[0] !== dayParam)
			) {
				setSelectedDay(day);
				const status = dayStatuses[day.date];
				// Load existing approver note from backend or local state
				setApproverNote(status?.approverNote || day.approverNotes || "");
			}
		} else if (!dayParam && selectedDay) {
			setSelectedDay(null);
			setApproverNote("");
		}
	}, [dayParam, breakdown, dayStatuses]);

	// Reset states when modal closes
	useEffect(() => {
		if (!isOpen) {
			setApprovedWeeks([]);
			setDayStatuses({});
			setSelectedDay(null);
			setRejectingDay(null);
			setRejectReason("");
			setApproverNote("");
		}
	}, [isOpen]);

	if (!effectiveTimesheet && !isLoading) {
		return null;
	}

	// Get employee info
	const employee = (effectiveTimesheet as any)?.employee;
	const employeeName = employee?.person?.personalInfo
		? `${employee.person.personalInfo.firstName} ${employee.person.personalInfo.lastName}`
		: "Employee";

	const payrollPeriod = (effectiveTimesheet as any)?.payrollPeriod;
	const periodName = payrollPeriod?.name || "Pay Period";

	// Use backend response values directly
	const totalHoursWorked = effectiveTimesheet?.totalHoursWorked || "0:00";
	const totalRegularHours = effectiveTimesheet?.totalRegularHours || "0:00";
	const totalOvertimeHours = effectiveTimesheet?.totalOvertimeHours || "0:00";

	// Only parse for progress calculation if needed
	const totalHours = parseHours(totalHoursWorked);
	const targetHours = parseHours(totalRegularHours) + parseHours(totalOvertimeHours);
	const progressPercent = targetHours > 0 ? (totalHours / targetHours) * 100 : 0;

	// Handle approving a single day
	const handleApproveDay = (dayKey: string, approverNote?: string) => {
		setDayStatuses((prev) => ({
			...prev,
			[dayKey]: {
				approved: true,
				rejected: false,
				approverNote: approverNote || prev[dayKey]?.approverNote || "",
			},
		}));
	};

	// Handle rejecting a single day
	const handleRejectDay = (dayKey: string, approverNote: string) => {
		setDayStatuses((prev) => ({
			...prev,
			[dayKey]: { approved: false, rejected: true, approverNote },
		}));

		if (updateSearchParams) {
			updateSearchParams((next) => {
				next.delete("day");
			});
		} else {
			setSelectedDay(null);
			setApproverNote("");
		}
	};

	const getDayStatus = (dayKey: string): DayStatus => {
		const localStatus = dayStatuses[dayKey];
		if (localStatus) {
			return localStatus;
		}

		const day = breakdown.find((d: any) => d.date === dayKey);
		if (day && day.approvalStatus) {
			return {
				approved: day.approvalStatus === "APPROVED",
				rejected: day.approvalStatus === "REJECTED",
				approverNote: day.approverNotes || "",
			};
		}

		return { approved: false, rejected: false, approverNote: "" };
	};

	const handleApproveWeek = (weekLabel: string, weekDays: any[]) => {
		const isAlreadyApproved = approvedWeeks.includes(weekLabel);

		// Only update local state, no API call
		const validDays = weekDays.filter((day: any) => {
			const dayOfWeek = new Date(day.date).getDay();
			const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
			const hours = parseHours(day.hoursWorked || "0");
			const isRestDay = day.status === "REST_DAY";
			const isAbsent = day.status === "ABSENT";
			const isEmpty = hours === 0 && !day.leaveType && !isAbsent;
			return isRestDay || (!isWeekend && !isEmpty);
		});

		const newStatuses = { ...dayStatuses };
		validDays.forEach((day: any) => {
			if (isAlreadyApproved) {
				delete newStatuses[day.date];
			} else {
				newStatuses[day.date] = {
					approved: true,
					rejected: false,
					approverNote: newStatuses[day.date]?.approverNote || "",
				};
			}
		});
		setDayStatuses(newStatuses);

		if (isAlreadyApproved) {
			setApprovedWeeks((prev) => prev.filter((w) => w !== weekLabel));
		} else {
			setApprovedWeeks((prev) => [...prev, weekLabel]);
		}
	};

	const isWeekApproved = (weekLabel: string) => approvedWeeks.includes(weekLabel);

	// Group breakdown by weeks (Robust Logic)
	const getWeekLabel = (dateStr: string) => {
		const date = new Date(dateStr);
		return date.toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
			year: "numeric",
		});
	};

	const groupedByWeeks = (() => {
		if (!breakdown) return [];

		// First, deduplicate days by date (robust logic from timesheet-modal.tsx)
		const daysByDate: { [date: string]: any } = {};
		breakdown.forEach((day: any) => {
			const dateStr = new Date(day.date).toISOString().split("T")[0];
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

		// Now group deduplicated days by weeks
		const weeks: { [key: string]: any[] } = {};
		Object.values(daysByDate).forEach((day: any) => {
			const date = new Date(day.date);
			const dayMidnight = new Date(date.getFullYear(), date.getMonth(), date.getDate());
			const weekStart = new Date(dayMidnight);
			const dayOfWeek = dayMidnight.getDay(); // 0 is Sunday
			const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
			weekStart.setDate(dayMidnight.getDate() + diff);

			const weekKey = weekStart.toISOString().split("T")[0];

			if (!weeks[weekKey]) {
				weeks[weekKey] = [];
			}
			weeks[weekKey].push(day);
		});

		// Sort weeks by date (oldest first - critical for showing full history)
		const sortedWeeks = Object.entries(weeks).sort(
			([a], [b]) => new Date(a).getTime() - new Date(b).getTime(),
		);

		return sortedWeeks.map(([weekStart, days]) => {
			// Sort days within each week by date
			const sortedDays = days.sort(
				(a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime(),
			);
			// Sum time strings directly to avoid precision loss
			const totalTime = sumTimeStrings(
				sortedDays.map((day: any) => day.hoursWorked || "0:00"),
			);
			return {
				weekKey: weekStart,
				weekLabel: `Week of ${getWeekLabel(weekStart)}`,
				days: sortedDays,
				totalTime,
			};
		});
	})();

	const allDaysReviewed = breakdown.every((day: any) => {
		const status = getDayStatus(day.date);
		return status.approved || status.rejected;
	});

	const hasRejectedDays = breakdown.some((day: any) => {
		const status = getDayStatus(day.date);
		return status.rejected;
	});

	const submitTimesheet = async () => {
		const timesheetId = effectiveTimesheet?.id;
		if (!timesheetId) {
			toast.error("Timesheet ID missing");
			return;
		}

		// Merge local statuses into breakdown
		const updatedBreakdown = (effectiveTimesheet.breakdown || []).map((day: any) => {
			const status = dayStatuses[day.date];
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

		// Approve the timesheet using the action endpoint with breakdown
		timesheetActionMutation.mutate(
			{
				id: timesheetId,
				action: {
					action: "APPROVE",
					breakdown: updatedBreakdown,
				},
			},
			{
				onSuccess: () => {
					if (onApprove) {
						onApprove(timesheetId);
					}
					onClose();
				},
				onError: (error: any) => {
					console.error("Error approving timesheet:", error);
					toast.error(error?.message || "Failed to approve timesheet");
				},
			},
		);
	};

	const rejectTimesheet = async () => {
		const timesheetId = effectiveTimesheet?.id;
		if (!timesheetId) {
			toast.error("Timesheet ID missing");
			return;
		}

		// Merge local statuses into breakdown
		const updatedBreakdown = (effectiveTimesheet.breakdown || []).map((day: any) => {
			const status = dayStatuses[day.date];
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

		// Reject the timesheet using the action endpoint with breakdown
		timesheetActionMutation.mutate(
			{
				id: timesheetId,
				action: {
					action: "REJECT",
					breakdown: updatedBreakdown,
					rejectionReason: "One or more days were rejected",
				},
			},
			{
				onSuccess: () => {
					if (onReject) {
						onReject(timesheetId, "One or more days were rejected");
					}
					onClose();
				},
				onError: (error: any) => {
					console.error("Error rejecting timesheet:", error);
					toast.error(error?.message || "Failed to reject timesheet");
				},
			},
		);
	};

	// Determine status for the banner
	const statusObject: ReviewStatus = {
		type: "info",
		title: "Timesheet Review",
		description: "Review employee hours and approve or reject the timesheet.",
	};

	// Check if we can determine dynamic status (if timesheet has a status field, otherwise default to Pending intent)
	// Assuming timesheet might have status, if not we keep it as review mode.
	if ((effectiveTimesheet as any)?.status === "APPROVED") {
		statusObject.type = "success";
		statusObject.title = "Approved Timesheet";
		statusObject.description = "This timesheet has been approved.";
	}

	return (
		<ReviewActionModal
			open={isOpen}
			onOpenChange={(open) => !open && onClose()}
			title="Timesheet Approval"
			// description={`${employeeName} • ${periodName}`} // Description moved to banner or redundant with stats
			className="max-w-6xl"
			status={statusObject}
			actions={
				<div className="flex gap-3 pt-2">
					<Button variant="outline" onClick={onClose} className="flex-1">
						Cancel
					</Button>
					{hasRejectedDays && (
						<Button
							className="flex-1 text-white font-semibold"
							style={{ backgroundColor: "#ef4444" }}
							disabled={timesheetActionMutation.isPending}
							onClick={rejectTimesheet}>
							{timesheetActionMutation.isPending ? (
								<div className="flex items-center gap-2">
									<div className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />
									Rejecting...
								</div>
							) : (
								<div className="flex items-center gap-2">
									<XCircle className="w-4 h-4" />
									Reject Timesheet
								</div>
							)}
						</Button>
					)}
					{!hasRejectedDays && (
						<Button
							className="flex-1 text-white font-semibold"
							style={{ backgroundColor: themeColors.red }}
							disabled={!allDaysReviewed || timesheetActionMutation.isPending}
							onClick={submitTimesheet}>
							{!allDaysReviewed ? (
								<div className="flex items-center gap-2">
									<AlertCircle className="w-4 h-4" />
									Review All Days First
								</div>
							) : timesheetActionMutation.isPending ? (
								<div className="flex items-center gap-2">
									<div className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />
									Approving...
								</div>
							) : (
								<div className="flex items-center gap-2">
									<CheckCircle2 className="w-4 h-4" />
									Approve Timesheet
								</div>
							)}
						</Button>
					)}
				</div>
			}>
			{isLoading ? (
				<div className="py-20 flex flex-col items-center justify-center text-gray-500">
					<div className="animate-spin w-10 h-10 border-4 border-gray-200 border-t-blue-600 rounded-full mb-4" />
					<p>Loading timesheet details...</p>
				</div>
			) : (
				<TooltipProvider>
					<div className="space-y-6">
						{/* Employee Info Header sub-section */}
						<div className="flex justify-between items-center px-1">
							<div>
								<h3 className="text-lg font-bold text-gray-900">{employeeName}</h3>
								<p className="text-sm text-gray-500">{periodName}</p>
							</div>
						</div>

						{/* Header Stats Card */}
						<div
							className="rounded-xl p-6 border"
							style={{
								backgroundColor: `${themeColors.redLight}`,
								borderColor: themeColors.red,
							}}>
							<div className="flex items-center justify-between">
								<div className="flex-1">
									<p className="text-sm font-medium text-gray-600 mb-2">
										Total Hours Logged
									</p>
									<div className="flex items-baseline gap-2">
										<span
											className="text-4xl font-bold"
											style={{ color: themeColors.red }}>
											{totalHoursWorked}
										</span>
										<span className="text-lg text-gray-500">
											/ {totalRegularHours}
										</span>
									</div>
									{/* Progress bar */}
									<div className="mt-4 w-full bg-gray-200 rounded-full h-2 overflow-hidden">
										<div
											className="h-full transition-all duration-500"
											style={{
												width: `${Math.min(progressPercent, 100)}%`,
												backgroundColor: themeColors.orange,
											}}
										/>
									</div>
								</div>
								<div className="flex flex-col items-end gap-2">
									<Calendar
										className="w-12 h-12 opacity-20"
										style={{ color: themeColors.red }}
									/>
									<div className="flex gap-4 text-sm">
										<div className="flex items-center gap-1">
											<div className="w-3 h-3 rounded-full bg-green-500" />
											<span className="text-gray-600">Approved</span>
										</div>
										<div className="flex items-center gap-1">
											<div className="w-3 h-3 rounded-full bg-red-500" />
											<span className="text-gray-600">Rejected</span>
										</div>
										<div className="flex items-center gap-1">
											<Palmtree className="w-3 h-3 text-purple-500" />
											<span className="text-gray-600">Leave</span>
										</div>
									</div>
								</div>
							</div>
						</div>

						{/* Detailed Summary Cards */}
						<div className="grid grid-cols-2 md:grid-cols-4 gap-3">
							<div className="bg-green-50 border border-green-200 rounded-lg p-3">
								<p className="text-xs text-gray-600 mb-1">Overtime</p>
								<p className="text-xl font-bold text-green-700">
									{effectiveTimesheet?.totalOvertimeHours || "0:00"}
								</p>
							</div>
							<div className="bg-red-50 border border-red-200 rounded-lg p-3">
								<p className="text-xs text-gray-600 mb-1">Late</p>
								<p className="text-xl font-bold text-red-700">
									{effectiveTimesheet?.totalLateHours || "0:00"}
								</p>
							</div>
							<div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
								<p className="text-xs text-gray-600 mb-1">Early Out</p>
								<p className="text-xl font-bold text-orange-700">
									{effectiveTimesheet?.totalEarlyOutHours || "0:00"}
								</p>
							</div>
						</div>

						{/* Weeks Grid */}
						<div className="space-y-6 max-h-[500px] overflow-y-auto pr-2">
							{groupedByWeeks.map((week: any, weekIndex: number) => {
								const weekApproved = isWeekApproved(week.weekLabel);
								const allDaysFilled = week.days.every(
									(d: any) =>
										parseHours(d.hoursWorked) > 0 ||
										d.leaveType ||
										d.status === "ABSENT" ||
										d.status === "REST_DAY" ||
										new Date(d.date).getDay() === 0 ||
										new Date(d.date).getDay() === 6,
								);

								return (
									<div key={weekIndex} className="space-y-3">
										<div className="flex items-center justify-between">
											<h3 className="text-base font-semibold text-gray-900">
												{week.weekLabel}
											</h3>
											<div className="flex items-center gap-2">
												<span className="text-sm font-medium text-gray-600">
													{week.totalTime}
												</span>
												{weekApproved && (
													<CheckCircle2
														className="w-5 h-5"
														style={{ color: themeColors.orange }}
													/>
												)}
											</div>
										</div>

										{/* Flex Container: Grid + Approve Button */}
										<div className="flex gap-2">
											{/* Grid of Days */}
											<div className="flex-1 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
												{week.days.map((day: any, i: number) => {
													const dayKey = day.date;
													const dayStatus = getDayStatus(dayKey);
													const hours = parseHours(day.hoursWorked);
													const isAbsent = day.status === "ABSENT";
													const isRestDay = day.status === "REST_DAY";
													const hasLeave = day.leaveType;
													const isEmpty =
														hours === 0 &&
														!hasLeave &&
														!isAbsent &&
														!isRestDay;

													const hasEmployeeNote =
														day.employeeNotes &&
														day.employeeNotes.trim() !== "";
													const hasApproverNote =
														dayStatus.approverNote &&
														dayStatus.approverNote.trim() !== "";

													const dayDateDisp = new Date(
														day.date,
													).toLocaleDateString("en-US", {
														weekday: "short",
														day: "numeric",
													});
													const dayFullDate = new Date(
														day.date,
													).toLocaleDateString("en-US", {
														weekday: "short",
														month: "short",
														day: "numeric",
													});

													// Determine styling
													let bgStyle: any = {};
													let borderStyle = "border border-gray-200";
													let textClass = "text-gray-700";

													if (dayStatus.approved) {
														bgStyle = {
															backgroundColor: "#dcfce7",
															borderColor: "#22c55e",
														};
														borderStyle = "border-2";
													} else if (dayStatus.rejected) {
														bgStyle = {
															backgroundColor: "#fee2e2",
															borderColor: "#ef4444",
														};
														borderStyle = "border-2";
													} else {
														// Pending
														if (isAbsent) {
															bgStyle = {
																backgroundColor: "#fef2f2",
																borderColor: "#fca5a5",
															};
															borderStyle = "border-2";
															textClass = "text-red-700";
														} else if (isRestDay) {
															bgStyle = {
																backgroundColor: "#f9fafb",
															};
															borderStyle = "border border-gray-200";
															textClass = "text-gray-500";
														} else if (hasLeave) {
															bgStyle = {
																backgroundColor: "#f3e8ff",
																borderColor: "#a855f7",
															};
															borderStyle = "border-2";
														} else if (isEmpty) {
															bgStyle = {
																backgroundColor: "#f3f4f6",
																color: "#9ca3af",
															};
															borderStyle = "border border-gray-200";
														} else {
															// Worked
															bgStyle = {
																backgroundColor: "#ffffff",
															};
															if (hours > 0) {
																bgStyle = {
																	backgroundColor: `${themeColors.yellowLight}`,
																	borderColor: themeColors.yellow,
																};
																borderStyle =
																	"border border-orange-200";
															}
														}
													}

													// Make REST_DAY actionable like regular days.
													const isActionable =
														hours > 0 ||
														hasLeave ||
														isAbsent ||
														isRestDay;

													return (
														<Tooltip key={i}>
															<TooltipTrigger asChild>
																<div
																	className={`
																	group relative rounded-lg text-center p-1 px-1.5 text-sm transition-all flex flex-col items-center justify-between min-h-[110px] h-full
																	${isActionable ? "hover:shadow-md hover:scale-105" : ""}
																	${isEmpty ? "opacity-50" : ""}
																	${borderStyle}
																	${textClass}
																	cursor-default
																`}
																	style={bgStyle}>
																	{/* Top: Date */}
																	<p className="font-medium text-xs text-gray-600 w-full text-center">
																		{dayDateDisp}
																	</p>

																	{/* Middle: Content */}
																	<div className="flex-1 flex flex-col justify-center items-center w-full">
																		{isAbsent ? (
																			<>
																				<p className="font-bold text-red-600 text-xs">
																					ABSENT
																				</p>
																				{!dayStatus.approved &&
																					!dayStatus.rejected && (
																						<p className="text-[10px] text-red-500 leading-tight mt-0.5">
																							No
																							attendance
																						</p>
																					)}
																			</>
																		) : isRestDay ? (
																			<>
																				<p className="font-bold text-gray-500 text-xs">
																					REST
																				</p>
																				{!dayStatus.approved &&
																					!dayStatus.rejected && (
																						<p className="text-[10px] text-gray-400 leading-tight mt-0.5">
																							Day off
																						</p>
																					)}
																			</>
																		) : hasLeave ? (
																			<div className="flex flex-col items-center gap-1">
																				<Palmtree className="w-4 h-4 text-purple-600" />
																				<span className="font-bold text-purple-600 text-xs break-all line-clamp-2 px-1">
																					{day.leaveType}
																				</span>
																			</div>
																		) : (
																			<>
																				<span
																					className={`text-lg font-bold ${
																						hours > 0
																							? "text-gray-900"
																							: "text-gray-400"
																					}`}>
																					{day.hoursWorked ||
																						"0:00"}
																				</span>

																				{/* Details Grid - Only OT and UT */}
																				<div className="w-full mt-1 space-y-0.5 text-[9px]">
																					{/* OT */}
																					{day.overtimeHours &&
																						day.overtimeHours !==
																							"0:00" && (
																							<div className="flex justify-between items-center px-1 bg-green-50 rounded">
																								<span className="text-gray-500">
																									OT:
																								</span>
																								<span className="font-bold text-green-700">
																									+
																									{
																										day.overtimeHours
																									}
																								</span>
																							</div>
																						)}

																					{day.lateHours &&
																						day.lateHours !==
																							"0:00" &&
																						!day
																							.metadata
																							?.withinGrace && (
																							<div className="flex justify-between items-center px-1 bg-red-50 rounded">
																								<span className="text-gray-500">
																									Late:
																								</span>
																								<span className="font-bold text-red-700">
																									{
																										day.lateHours
																									}
																								</span>
																							</div>
																						)}
																					{day.metadata
																						?.withinGrace && (
																						<div className="flex justify-between items-center px-1 bg-amber-50 rounded border border-amber-100">
																							<span className="text-gray-500">
																								Late:
																							</span>
																							<span className="font-bold text-amber-700">
																								{formatWithinGraceLabel(
																									day
																										.metadata
																										?.rawLateMinutes,
																								)}
																							</span>
																						</div>
																					)}
																					{day.earlyOutHours &&
																						day.earlyOutHours !==
																							"0:00" && (
																							<div className="flex justify-between items-center px-1 bg-orange-50 rounded">
																								<span className="text-gray-500">
																									EO:
																								</span>
																								<span className="font-bold text-orange-700">
																									{
																										day.earlyOutHours
																									}
																								</span>
																							</div>
																						)}
																				</div>
																			</>
																		)}
																	</div>

																	{/* Bottom: Time In/Out */}
																	{day.timeIn &&
																		day.timeOut &&
																		!isAbsent &&
																		!isRestDay && (
																			<div className="text-[10px] text-gray-500 w-full pt-1 border-t border-black/5 mt-1">
																				<div className="flex justify-between px-1">
																					<span>
																						{formatTime(
																							day.timeIn,
																						).replace(
																							/\s[AP]M/,
																							"",
																						)}
																					</span>
																					<span>
																						{formatTime(
																							day.timeOut,
																						).replace(
																							/\s[AP]M/,
																							"",
																						)}
																					</span>
																				</div>
																			</div>
																		)}

																	{/* Status / Note Icons */}
																	<div className="absolute top-1 right-1 flex gap-0.5">
																		{dayStatus.approved && (
																			<CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
																		)}
																		{dayStatus.rejected && (
																			<XCircle className="w-3.5 h-3.5 text-red-600" />
																		)}
																		{hasApproverNote && (
																			<MessageSquare className="w-3.5 h-3.5 text-blue-500" />
																		)}
																	</div>

																	{hasEmployeeNote && (
																		<div className="absolute top-1 left-1">
																			<FileText className="w-3 h-3 text-orange-500" />
																		</div>
																	)}

																	{/* Hover Action Pill - clean & premium */}
																	{isActionable && (
																		<div className="absolute inset-x-0 bottom-2 flex justify-center z-10 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-2 group-hover:translate-y-0">
																			<div className="flex items-center gap-1 p-1 bg-white dark:bg-zinc-800 shadow-xl border border-gray-100 dark:border-zinc-700 rounded-full scale-90 hover:scale-100 transition-transform">
																				<button
																					onClick={(
																						e,
																					) => {
																						e.stopPropagation();
																						handleApproveDay(
																							day.date,
																							dayStatus.approverNote,
																						);
																					}}
																					className="w-8 h-8 flex items-center justify-center rounded-full text-green-600 hover:bg-green-50 hover:text-green-700 transition-colors"
																					title="Quick Approve">
																					<Check className="w-4 h-4 stroke-[3]" />
																				</button>
																				<div className="w-px h-4 bg-gray-200 dark:bg-zinc-700" />
																				<button
																					onClick={(
																						e,
																					) => {
																						e.stopPropagation();
																						setRejectingDay(
																							day,
																						);
																						setRejectReason(
																							dayStatus.approverNote ||
																								"",
																						);
																					}}
																					className="w-8 h-8 flex items-center justify-center rounded-full text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors"
																					title="Reject with Note">
																					<X className="w-4 h-4 stroke-[3]" />
																				</button>
																			</div>
																		</div>
																	)}
																</div>
															</TooltipTrigger>
															<TooltipContent
																side="top"
																className="max-w-xs p-3 bg-white shadow-xl border border-gray-200 z-50">
																<div className="space-y-2 min-w-[180px]">
																	<p className="font-semibold text-gray-900 border-b pb-1">
																		{dayFullDate}
																	</p>

																	{/* Detailed Breakdown Table */}
																	{!isAbsent &&
																		!isRestDay &&
																		!hasLeave && (
																			<div className="space-y-1 text-xs">
																				<div className="flex justify-between">
																					<span className="text-gray-500">
																						Regular
																					</span>
																					<span className="font-medium text-gray-700">
																						{day.regularHours ||
																							"0:00"}
																					</span>
																				</div>
																				<div className="flex justify-between">
																					<span className="text-gray-500">
																						Overtime
																					</span>
																					<span
																						className={`${day.overtimeHours && day.overtimeHours !== "0:00" ? "text-green-600 font-bold" : "text-gray-400"}`}>
																						{day.overtimeHours ||
																							"0:00"}
																					</span>
																				</div>
																				<div className="flex justify-between">
																					<span className="text-gray-500">
																						Late
																					</span>
																					{day.metadata
																						?.withinGrace ? (
																						<span className="text-amber-700 font-bold">
																							{formatWithinGraceLabel(
																								day
																									.metadata
																									?.rawLateMinutes,
																							)}
																						</span>
																					) : (
																						<span
																							className={`${day.lateHours && day.lateHours !== "0:00" ? "text-red-600 font-bold" : "text-gray-400"}`}>
																							{day.lateHours ||
																								"0:00"}
																						</span>
																					)}
																				</div>
																				<div className="flex justify-between pt-1 border-t border-dashed">
																					<span className="text-gray-500">
																						Early Out
																					</span>
																					<span
																						className={`${day.earlyOutHours && day.earlyOutHours !== "0:00" ? "text-red-600 font-bold" : "text-gray-400"}`}>
																						{day.earlyOutHours ||
																							"0:00"}
																					</span>
																				</div>
																			</div>
																		)}

																	<div className="text-sm pt-1">
																		{isAbsent ? (
																			<span className="text-red-600 font-medium">
																				Absent
																			</span>
																		) : isRestDay ? (
																			<span className="text-gray-500 font-medium">
																				Rest Day
																			</span>
																		) : hasLeave ? (
																			<span className="text-purple-600 font-medium">
																				Leave:{" "}
																				{day.leaveType}
																			</span>
																		) : null}
																	</div>

																	{hasEmployeeNote && (
																		<div className="text-xs text-gray-600 bg-gray-50 p-2 rounded mt-2 border border-gray-100">
																			<b className="block text-gray-700 mb-0.5">
																				Note:
																			</b>
																			{day.employeeNotes}
																		</div>
																	)}
																</div>
															</TooltipContent>
														</Tooltip>
													);
												})}
											</div>

											{/* Approve Week Button - Right Side */}
											<div className="w-28 flex-shrink-0 flex flex-col justify-center">
												<button
													onClick={() =>
														handleApproveWeek(week.weekLabel, week.days)
													}
													disabled={
														(!weekApproved && !allDaysFilled) ||
														timesheetActionMutation.isPending
													}
													className={`
													w-full h-full rounded-lg text-xs font-semibold transition-all p-2 flex flex-col items-center justify-center gap-2
													${
														weekApproved
															? "bg-green-100 text-green-700 border-2 border-green-500 hover:bg-green-200 active:scale-95 cursor-pointer"
															: allDaysFilled
																? "border-2 text-white font-bold hover:shadow-md active:scale-95"
																: "bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200"
													}
												`}
													style={
														!weekApproved && allDaysFilled
															? {
																	backgroundColor:
																		themeColors.orange,
																	borderColor: themeColors.orange,
																}
															: {}
													}>
													{timesheetActionMutation.isPending ? (
														<div className="animate-spin w-5 h-5 border-2 border-current border-t-transparent rounded-full" />
													) : weekApproved ? (
														<>
															<CheckCircle2 className="w-8 h-8" />
															<span>Approved</span>
														</>
													) : (
														<>
															<CheckCircle2 className="w-8 h-8 opacity-80" />
															<span>Approve Week</span>
														</>
													)}
												</button>
											</div>
										</div>
									</div>
								);
							})}
						</div>

						{/* Day Review Modal */}
						{selectedDay && (
							<div
								className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
								onClick={() => {
									if (updateSearchParams) {
										updateSearchParams((next) => {
											next.delete("day");
										});
									} else {
										setSelectedDay(null);
									}
								}}>
								<div
									className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl"
									onClick={(e) => e.stopPropagation()}>
									<h3 className="text-lg font-semibold text-gray-900 mb-4">
										Review Day:{" "}
										{new Date(selectedDay.date).toLocaleDateString("en-US", {
											weekday: "long",
											month: "long",
											day: "numeric",
										})}
									</h3>

									{/* Day Summary */}
									<div className="space-y-3 mb-4 p-3 bg-gray-50 rounded-lg">
										{selectedDay.status === "ABSENT" ? (
											<div className="text-center py-4">
												<p className="font-bold text-red-600 text-lg">
													ABSENT
												</p>
												<p className="text-sm text-red-500 mt-1">
													No attendance recorded
												</p>
											</div>
										) : selectedDay.status === "REST_DAY" ? (
											<div className="text-center py-4">
												<p className="font-bold text-gray-500 text-lg">
													REST DAY
												</p>
												<p className="text-sm text-gray-400 mt-1">
													Day off
												</p>
											</div>
										) : (
											<>
												<div className="flex justify-between text-sm">
													<span className="text-gray-600">
														Hours Worked:
													</span>
													<span className="font-medium">
														{selectedDay.hoursWorked || "0:00"}
													</span>
												</div>
												{selectedDay.timeIn && selectedDay.timeOut && (
													<div className="flex justify-between text-sm">
														<span className="text-gray-600">Time:</span>
														<span className="font-medium">
															{formatTime(selectedDay.timeIn)} -{" "}
															{formatTime(selectedDay.timeOut)}
														</span>
													</div>
												)}
												{selectedDay.leaveType && (
													<div className="flex justify-between text-sm">
														<span className="text-gray-600">
															Leave Type:
														</span>
														<span className="font-medium text-purple-600">
															{selectedDay.leaveType}
														</span>
													</div>
												)}
												{selectedDay.employeeNotes && (
													<div className="text-sm">
														<span className="text-gray-600 font-medium">
															Employee Note:
														</span>
														<p className="mt-1 text-gray-800 bg-orange-50 p-2 rounded border border-orange-200">
															{selectedDay.employeeNotes}
														</p>
													</div>
												)}
											</>
										)}
									</div>

									{/* Approver Note Input */}
									<div className="mb-4">
										<label className="block text-sm font-medium text-gray-700 mb-2">
											Approver Note (optional)
										</label>
										<textarea
											value={approverNote}
											onChange={(e) => setApproverNote(e.target.value)}
											placeholder="Add your note..."
											className="w-full p-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
											rows={3}
										/>
									</div>

									{/* Action Buttons */}
									<div className="flex gap-3">
										<Button
											variant="outline"
											className="flex-1"
											onClick={() => {
												if (updateSearchParams) {
													updateSearchParams((next) => {
														next.delete("day");
													});
												} else {
													setSelectedDay(null);
													setApproverNote("");
												}
											}}>
											Cancel
										</Button>
										<Button
											className="flex-1 bg-red-600 hover:bg-red-700 text-white"
											disabled={timesheetActionMutation.isPending}
											onClick={() =>
												handleRejectDay(selectedDay.date, approverNote)
											}>
											<XCircle className="w-4 h-4 mr-1" />
											{timesheetActionMutation.isPending
												? "Saving..."
												: "Reject"}
										</Button>
										<Button
											className="flex-1 bg-green-600 hover:bg-green-700 text-white"
											disabled={timesheetActionMutation.isPending}
											onClick={() => {
												// Pass the note directly to handleApproveDay
												handleApproveDay(selectedDay.date, approverNote);
												if (updateSearchParams) {
													updateSearchParams((next) => {
														next.delete("day");
													});
												} else {
													setSelectedDay(null);
													setApproverNote("");
												}
											}}>
											<CheckCircle2 className="w-4 h-4 mr-1" />
											{timesheetActionMutation.isPending
												? "Saving..."
												: "Approve"}
										</Button>
									</div>
								</div>
							</div>
						)}

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
										{new Date(rejectingDay.date).toLocaleDateString("en-US", {
											month: "short",
											day: "numeric",
										})}
									</h3>
									<div className="mb-4">
										<label className="block text-sm font-medium text-gray-700 mb-2">
											Reason for Rejection{" "}
											<span className="text-red-500">*</span>
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
											disabled={
												timesheetActionMutation.isPending ||
												!rejectReason.trim()
											}
											onClick={() => {
												handleRejectDay(rejectingDay.date, rejectReason);
												setRejectingDay(null);
												setRejectReason("");
											}}>
											Confirm Reject
										</Button>
									</div>
								</div>
							</div>
						)}
					</div>
				</TooltipProvider>
			)}
		</ReviewActionModal>
	);
}
