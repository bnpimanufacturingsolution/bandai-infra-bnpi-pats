import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router";
import { Button } from "~/components/atoms/Button";
import { Modal } from "~/components/atoms/Modal";
import { X, CheckCircle2, XCircle, AlertCircle, CalendarDays } from "lucide-react";
import { themeColors } from "~/lib/config/theme";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "~/components/ui/tooltip";
import { formatDuration } from "~/lib/utils";
import { TimesheetView } from "./TimesheetView";
import type { ApprovedEditedDaysSummary, Timesheet } from "~/services/timesheet.service";
import {
	TimesheetCalendarApproval,
	checkAllDaysReviewed,
	checkHasRejectedDays,
	type TimesheetBreakdownDay,
} from "~/components/molecules/TimesheetCalendarApproval";
import type { TimesheetDayRequestAction } from "~/components/molecules/TimesheetCalendar";
import { TimesheetDayCell } from "~/components/atoms/TimesheetDayCell";
import { TimesheetEmployeeCard } from "~/components/molecules/TimesheetEmployeeCard";
import { TimesheetHoursOverview } from "~/components/molecules/TimesheetHoursOverview";
import { TimesheetDayEditor } from "~/components/molecules/TimesheetDayEditor";
import { TimesheetDayTooltipContent } from "~/components/molecules/TimesheetDayTooltipContent";
import { useNormalizeTimesheetBreakdownPreview } from "~/lib/hooks/useTimesheets";
import { useEmployeeScheduleCalendar } from "~/lib/hooks/useSchedules";
import { useAuth } from "~/lib/hooks/use-auth";
import type { EmployeeScheduleCalendarResponse } from "~/services/schedules.service";
import { toast } from "sonner";
import { buildNightShiftMeta } from "~/lib/utils/night-shift";
import { isVirtualAbsentLikeRecord } from "~/lib/utils/attendance-status";
import { formatDate } from "~/lib/utils/text-utils";

const formatDayKey = (value?: string | null) => {
	if (!value) return "";
	if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
		return value.slice(0, 10);
	}
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) return "";
	const year = parsed.getFullYear();
	const month = String(parsed.getMonth() + 1).padStart(2, "0");
	const day = String(parsed.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
};

const getTimesheetDayBusinessKey = (day?: Partial<TimesheetBreakdownDay> | null) => {
	const businessDate =
		day?.businessDate ||
		(day?.metadata && typeof day.metadata === "object"
			? (day.metadata as { businessDate?: string | null }).businessDate
			: null);
	return formatDayKey(businessDate || day?.date || null);
};

const isValidDayParam = (value?: string | null) => {
	if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	const parsed = new Date(`${value}T00:00:00`);
	return !Number.isNaN(parsed.getTime());
};

const parseDurationHours = (timeStr?: string | null): number => {
	if (!timeStr) return 0;
	if (!timeStr.includes(":")) return Number(timeStr) || 0;
	const [hours, minutes] = timeStr.split(":").map(Number);
	if (Number.isNaN(hours) || Number.isNaN(minutes)) return 0;
	return hours + minutes / 60;
};

const formatLeaveDaysLabel = (value?: number | null) => {
	const days = Number(value || 0);
	if (!Number.isFinite(days) || days <= 0) return "0 days";
	const display =
		Math.abs(days - Math.round(days)) < 0.0001
			? String(Math.round(days))
			: days.toFixed(2).replace(/\.?0+$/, "");
	return `${display} day${Math.abs(days - 1) < 0.0001 ? "" : "s"}`;
};

export const getCompensatoryLeaveCredit = (timesheet?: Timesheet | null) => {
	const metadata =
		timesheet?.metadata && typeof timesheet.metadata === "object" ? timesheet.metadata : null;
	const credit =
		metadata &&
		typeof metadata.compensatoryLeaveCredit === "object" &&
		metadata.compensatoryLeaveCredit
			? metadata.compensatoryLeaveCredit
			: null;
	if (!credit) return null;
	const totalMinutes = Number(credit.totalMinutes || 0);
	const totalDays = Number(credit.totalDays || 0);
	const lineCount = Number(credit.lineCount || 0);
	if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) return null;

	return {
		totalMinutes,
		totalDays,
		lineCount: Number.isFinite(lineCount) ? lineCount : 0,
		creditedAt: credit.creditedAt || null,
		creditApplied: credit.creditApplied !== false,
		skipReason: credit.skipReason,
	};
};

const toEpochMinute = (value?: string | null) => {
	if (!value) return null;
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) return value;
	return Math.floor(parsed.getTime() / 60000);
};

const normalizeDayForDirtyCheck = (day: TimesheetBreakdownDay) => ({
	timeIn: toEpochMinute(day.timeIn || null),
	timeOut: toEpochMinute(day.timeOut || null),
	status: day.status || null,
	hoursWorked: day.hoursWorked || "0:00",
	regularHours: day.regularHours || "0:00",
	overtimeHours: day.overtimeHours || "0:00",
	lateHours: day.lateHours || "0:00",
	undertimeHours: day.undertimeHours || "0:00",
	earlyOutHours: day.earlyOutHours || "0:00",
	breakMinutes: day.metadata?.breakMinutes ?? null,
	breakDisplay: day.metadata?.breakDisplay ?? null,
	employeeNotes: day.employeeNotes?.trim() || null,
	rawLateMinutes: day.metadata?.rawLateMinutes ?? null,
	gracePeriodMinutes: day.metadata?.gracePeriodMinutes ?? null,
	withinGrace: day.metadata?.withinGrace ?? null,
	rawEarlyOutMinutes: (day.metadata as any)?.rawEarlyOutMinutes ?? null,
	graceEarlyOutMinutes: (day.metadata as any)?.graceEarlyOutMinutes ?? null,
});

const mergeNormalizedDay = (
	baseDay: TimesheetBreakdownDay,
	normalizedDay: TimesheetBreakdownDay,
): TimesheetBreakdownDay => {
	return {
		...baseDay,
		...normalizedDay,
		leaveType: normalizedDay.leaveType ?? baseDay.leaveType ?? null,
		leaveEntries: normalizedDay.leaveEntries ?? baseDay.leaveEntries ?? [],
		holidayEntries: normalizedDay.holidayEntries ?? baseDay.holidayEntries ?? [],
		primaryMarker: normalizedDay.primaryMarker ?? baseDay.primaryMarker,
		metadata: {
			...(baseDay.metadata || {}),
			...(normalizedDay.metadata || {}),
		},
	};
};

type ResolvedCalendarShift = NonNullable<EmployeeScheduleCalendarResponse["days"][number]["shift"]>;
type ResolvedCalendarTimeSlot = NonNullable<ResolvedCalendarShift["timeSlots"]>[number];

interface TimesheetViewModalProps {
	isOpen: boolean;
	onClose: () => void;
	timesheet: Timesheet | null;
	isLoading?: boolean;
	error?: any;
	/** Show submit button and actions */
	showActions?: boolean;
	/** Custom title */
	title?: string;
	/** Submit handler */
	onSubmit?: (updatedBreakdown: TimesheetBreakdownDay[]) => void;
	/** Is submit in progress */
	isSubmitting?: boolean;
	/** Enable approval mode (for managers) */
	approvalMode?: boolean;
	/** Approve handler (for approval mode) */
	onApprove?: (updatedBreakdown: TimesheetBreakdownDay[]) => void;
	/** Reject handler (for approval mode) */
	onReject?: (updatedBreakdown: TimesheetBreakdownDay[], reason: string) => void;
	/** Is approval in progress */
	isApproving?: boolean;
	/** Request edit permission from manager */
	onRequestEditPermission?: (reason: string) => Promise<void> | void;
	/** Is request edit permission in progress */
	isRequestingPermission?: boolean;
	/** Deep-link selected day (YYYY-MM-DD) */
	deepLinkDay?: string | null;
	/** Callback to sync deep-link day in URL */
	onDeepLinkDayChange?: (day: string | null) => void;
	/** Approved edited-day summary from /api/timesheet/view */
	approvedEditedDaysSummary?: ApprovedEditedDaysSummary | null;
}

const HR_ROLE_KEYS = new Set(["hris-admin", "hris-hr-manager", "hris-hr-user"]);

export function TimesheetViewModal({
	isOpen,
	onClose,
	timesheet,
	isLoading = false,
	error,
	showActions = false,
	title,
	onSubmit,
	isSubmitting = false,
	approvalMode = false,
	onApprove,
	onReject,
	isApproving = false,
	onRequestEditPermission,
	isRequestingPermission = false,
	deepLinkDay,
	onDeepLinkDayChange,
	approvedEditedDaysSummary,
}: TimesheetViewModalProps) {
	const navigate = useNavigate();
	const { user } = useAuth();
	// State for approval mode - track updated breakdown
	const [updatedBreakdown, setUpdatedBreakdown] = useState<TimesheetBreakdownDay[]>([]);
	const [editingDay, setEditingDay] = useState<TimesheetBreakdownDay | null>(null);
	const [rejectReason, setRejectReason] = useState("");
	const [showRejectValidation, setShowRejectValidation] = useState(false);
	const [isPermissionModalOpen, setIsPermissionModalOpen] = useState(false);
	const [editPermissionReason, setEditPermissionReason] = useState("");
	const [showPermissionReasonValidation, setShowPermissionReasonValidation] = useState(false);
	const [suppressedDeepLinkDay, setSuppressedDeepLinkDay] = useState<string | null>(null);
	const [showAllApprovedEditedDays, setShowAllApprovedEditedDays] = useState(false);
	const [selectedApprovedEditedEntryId, setSelectedApprovedEditedEntryId] = useState<
		string | null
	>(null);
	const normalizeBreakdownPreviewMutation = useNormalizeTimesheetBreakdownPreview();

	// Reset breakdown when timesheet changes
	useEffect(() => {
		if (timesheet?.breakdown) {
			setUpdatedBreakdown(timesheet.breakdown as TimesheetBreakdownDay[]);
		}
	}, [timesheet?.breakdown]);

	useEffect(() => {
		if (!isOpen) {
			setRejectReason("");
			setShowRejectValidation(false);
			setIsPermissionModalOpen(false);
			setEditPermissionReason("");
			setShowPermissionReasonValidation(false);
			setShowAllApprovedEditedDays(false);
			setSelectedApprovedEditedEntryId(null);
		}
	}, [isOpen]);

	const handleDayClick = (day: TimesheetBreakdownDay) => {
		const canEdit =
			timesheet?.status === "REVISED" || timesheet?.editPermissionStatus === "APPROVED";
		if (!approvalMode && canEdit) {
			setEditingDay(day);
			onDeepLinkDayChange?.(getTimesheetDayBusinessKey(day));
		}
	};

	const handleDayRequestAction = (
		action: TimesheetDayRequestAction,
		day: TimesheetBreakdownDay,
	) => {
		const dayKey = getTimesheetDayBusinessKey(day);
		if (!dayKey) return;
		const params = new URLSearchParams();
		params.set("action", "create");
		params.set("date", dayKey);
		if (action === "schedule-change") {
			params.set("type", "schedule-change");
			navigate(`/employee/requests?${params.toString()}`);
			return;
		}
		if (action === "leave") {
			params.set("kind", "leave");
			navigate(`/employee/requests?${params.toString()}`);
			return;
		}
	};

	const handleDayEditorClose = () => {
		if (editingDay && deepLinkDay && getTimesheetDayBusinessKey(editingDay) === deepLinkDay) {
			setSuppressedDeepLinkDay(deepLinkDay);
		}
		setEditingDay(null);
		onDeepLinkDayChange?.(null);
	};

	const handleDaySave = async (updatedDay: TimesheetBreakdownDay) => {
		const currentBreakdown =
			(updatedBreakdown.length > 0
				? updatedBreakdown
				: ((timesheet?.breakdown as TimesheetBreakdownDay[]) ?? [])) || [];
		const targetDayKey = getTimesheetDayBusinessKey(updatedDay);
		const mergedBreakdown = currentBreakdown.map((d) =>
			getTimesheetDayBusinessKey(d) === targetDayKey ? updatedDay : d,
		);

		if (!timesheet?.id) {
			setUpdatedBreakdown(mergedBreakdown);
			handleDayEditorClose();
			toast.success("Timesheet day updated");
			return;
		}

		try {
			const normalized = await normalizeBreakdownPreviewMutation.mutateAsync({
				timesheetId: timesheet.id,
				breakdown: mergedBreakdown as any,
			});
			const normalizedBreakdown = (normalized?.breakdown as TimesheetBreakdownDay[]) || [];
			const normalizedEditedDay = normalizedBreakdown.find(
				(day) => getTimesheetDayBusinessKey(day) === targetDayKey,
			);
			const nextBreakdown = mergedBreakdown.map((day) => {
				if (getTimesheetDayBusinessKey(day) !== targetDayKey) return day;
				return normalizedEditedDay ? mergeNormalizedDay(day, normalizedEditedDay) : day;
			});
			setUpdatedBreakdown(nextBreakdown);
			handleDayEditorClose();
			toast.success("Timesheet day normalized from server preview");
		} catch (error: any) {
			setUpdatedBreakdown(mergedBreakdown);
			handleDayEditorClose();
			toast.error(error?.message || "Failed to normalize preview, using local values.");
		}
	};

	// Check if all days are reviewed and if there are rejected days
	const allDaysReviewed = useMemo(() => {
		if (!updatedBreakdown.length) return false;
		return checkAllDaysReviewed(updatedBreakdown);
	}, [updatedBreakdown]);

	const hasRejectedDays = useMemo(() => {
		if (!updatedBreakdown.length) return false;
		return checkHasRejectedDays(updatedBreakdown);
	}, [updatedBreakdown]);

	const isAlreadySubmitted = timesheet?.status === "SUBMITTED";
	const isApprovedStatus = timesheet?.status === "APPROVED";
	const isRejected = timesheet?.status === "REJECTED";
	const isRevised = timesheet?.status === "REVISED";
	const hasEditPermissionForResubmit =
		timesheet?.editPermissionStatus === "APPROVED" ||
		timesheet?.editPermissionStatus === "CONSUMED";
	const canEditDays = timesheet?.status === "REVISED" || hasEditPermissionForResubmit;
	// Check if timesheet can be submitted
	const canSubmit =
		timesheet?.status === "DRAFT" ||
		timesheet?.status === "REVISED" ||
		(timesheet?.status === "SUBMITTED" && hasEditPermissionForResubmit) ||
		(timesheet?.status === "APPROVED" && hasEditPermissionForResubmit);
	const isResubmissionFlow = isRevised || isAlreadySubmitted || isApprovedStatus;
	const authReportTo = user?.metadata?.employee?.reportTo;
	const hasAssignedApprover = Boolean(timesheet?.employee?.reportTo?.id || authReportTo?.id);
	const shouldShowSubmitButton = Boolean(
		showActions &&
			!approvalMode &&
			onSubmit &&
			["DRAFT", "REVISED", "SUBMITTED", "APPROVED"].includes(timesheet?.status || ""),
	);
	const submitButtonDisabled = Boolean(isSubmitting || !canSubmit || !hasAssignedApprover);
	const handleSubmitClick = () => {
		if (!onSubmit || !hasAssignedApprover) return;
		onSubmit(
			updatedBreakdown.length > 0
				? updatedBreakdown
				: (timesheet?.breakdown as TimesheetBreakdownDay[]) || [],
		);
	};
	const canOpenPermissionRequest = Boolean(
		onRequestEditPermission &&
			hasAssignedApprover &&
			(timesheet?.id || timesheet?.canRequestEditPermission) &&
			timesheet?.status !== "REVISED" &&
			timesheet?.editPermissionStatus !== "REQUESTED" &&
			timesheet?.editPermissionStatus !== "APPROVED",
	);

	const managerName = useMemo(() => {
		const manager = timesheet?.employee?.reportTo || authReportTo;
		if (!manager) return "";
		const name = `${manager.firstName || ""} ${manager.lastName || ""}`.trim();
		const employeeCode =
			"employeeId" in manager && typeof manager.employeeId === "string"
				? manager.employeeId
				: "";
		return name || employeeCode || "Manager";
	}, [authReportTo, timesheet?.employee?.reportTo]);
	const approverProfileId = useMemo(() => {
		return (
			timesheet?.editPermissionGrantedByEmployee?.id ||
			timesheet?.employee?.reportTo?.id ||
			authReportTo?.id ||
			""
		);
	}, [
		authReportTo?.id,
		timesheet?.editPermissionGrantedByEmployee?.id,
		timesheet?.employee?.reportTo?.id,
	]);
	const attendanceEmployeeId = useMemo(
		() => timesheet?.employee?.id || timesheet?.employeeId || "",
		[timesheet?.employee?.id, timesheet?.employeeId],
	);
	const attendancePeriodId = useMemo(
		() => timesheet?.payrollPeriod?.id || timesheet?.payrollPeriodId || "",
		[timesheet?.payrollPeriod?.id, timesheet?.payrollPeriodId],
	);
	const attendanceDepartmentId = useMemo(
		() => timesheet?.employee?.department?.id || "",
		[timesheet?.employee?.department?.id],
	);
	const isHrRole = HR_ROLE_KEYS.has(
		String(user?.role || user?.metadata?.employee?.role || "").trim(),
	);
	const canNavigateToAttendance = Boolean(isHrRole && attendancePeriodId);
	const timesheetProfileId = useMemo(
		() => timesheet?.employee?.id || timesheet?.employeeId || "",
		[timesheet?.employee?.id, timesheet?.employeeId],
	);

	const handleOpenEmployeeProfile = (employeeId?: string) => {
		const targetProfileId = employeeId || timesheetProfileId;
		if (!targetProfileId) return;
		navigate(`/employee/${targetProfileId}`);
	};

	const handleOpenAttendance = () => {
		if (!canNavigateToAttendance) return;
		const params = new URLSearchParams({
			view: "list",
			page: "1",
			period: attendancePeriodId,
		});
		if (timesheet?.payrollPeriod?.code) {
			params.set("periodCode", timesheet.payrollPeriod.code);
		}
		if (attendanceDepartmentId) {
			params.set("department", attendanceDepartmentId);
		}
		if (attendanceEmployeeId) {
			params.set("employee", attendanceEmployeeId);
		}
		navigate(`/hr/attendance?${params.toString()}`);
	};

	const formatDateTime = (value?: string | null) => {
		if (!value) return "";
		const parsed = new Date(value);
		if (Number.isNaN(parsed.getTime())) return "";
		return parsed.toLocaleString("en-US", {
			month: "short",
			day: "numeric",
			year: "numeric",
			hour: "numeric",
			minute: "2-digit",
		});
	};

	const getActorName = (
		actor?: {
			firstName?: string | null;
			lastName?: string | null;
			employeeId?: string | null;
		} | null,
	) => {
		if (!actor) return "Manager";
		const name = `${actor.firstName || ""} ${actor.lastName || ""}`.trim();
		return name || actor.employeeId || "Manager";
	};

	const getPermissionStatusMessage = () => {
		switch (timesheet?.editPermissionStatus) {
			case "REQUESTED":
				return managerName
					? `Edit permission request sent. Waiting for manager approval (${managerName}).`
					: "Edit permission request sent. Waiting for manager approval.";
			case "APPROVED": {
				const actor = getActorName(timesheet?.editPermissionGrantedByEmployee);
				const actedAt = formatDateTime(timesheet?.editPermissionGrantedAt);
				return actedAt
					? `Edit permission approved. Granted by ${actor} on ${actedAt}.`
					: `Edit permission approved. Granted by ${actor}.`;
			}
			case "REJECTED": {
				const actor = getActorName(timesheet?.editPermissionRejectedByEmployee);
				const actedAt = formatDateTime(timesheet?.editPermissionRejectedAt);
				const reason = timesheet?.editPermissionRejectionReason
					? ` Reason: ${timesheet.editPermissionRejectionReason}`
					: "";
				return actedAt
					? `Edit permission request rejected by ${actor} on ${actedAt}.${reason}`
					: `Edit permission request rejected by ${actor}.${reason}`;
			}
			case "CONSUMED":
				return "Edit permission is in use for this correction session. Continue editing and resubmit for approval.";
			case "EXPIRED":
				return "Edit permission has expired. Request a new approval.";
			case "REVOKED":
				return "Edit permission was revoked. Request manager approval again.";
			default:
				return "";
		}
	};

	const getSubmitInfoMessage = () => {
		if (!hasAssignedApprover) {
			return "You do not have a reporting manager assigned yet. Contact HR before submitting this timesheet.";
		}
		if ((isAlreadySubmitted || isApprovedStatus) && !hasEditPermissionForResubmit) {
			return "Request edit permission first to enable resubmission.";
		}
		if (canEditDays) {
			return "Edit permission is active. You can update this timesheet and resubmit for approval.";
		}
		if (isAlreadySubmitted) {
			return "Timesheet submitted. Waiting for manager approval.";
		}
		if (isApprovedStatus) {
			return "This timesheet is locked after approval.";
		}
		if (isRevised) {
			return "Your manager requested revisions. Update your timesheet and resubmit for approval.";
		}
		if (isRejected) {
			return timesheet?.rejectionReason
				? `Your timesheet was rejected. Reason: ${timesheet.rejectionReason}`
				: "Your timesheet was rejected.";
		}
		if (canSubmit && !isAlreadySubmitted) {
			return "Review your logged hours above. Once submitted, your timesheet will be sent to your manager for approval.";
		}
		return "";
	};

	const getEditInstructionMessage = () => {
		if (!canEditDays) return "";
		return "You can edit by clicking any day or day log above.";
	};
	const permissionStatusMessage = getPermissionStatusMessage();
	const editInstructionMessage = getEditInstructionMessage();
	const isPermissionApproved = timesheet?.editPermissionStatus === "APPROVED";
	const scheduleEmployeeId = attendanceEmployeeId;
	const scheduleStart = formatDayKey(timesheet?.payrollPeriod?.startDate || null);
	const scheduleEnd = formatDayKey(timesheet?.payrollPeriod?.endDate || null);
	const {
		data: resolvedScheduleCalendar,
		isLoading: isResolvedScheduleLoading,
		isFetching: isResolvedScheduleFetching,
	} = useEmployeeScheduleCalendar(
		{
			employeeId: scheduleEmployeeId,
			start: scheduleStart,
			end: scheduleEnd,
		},
		{
			enabled:
				isOpen && !!scheduleEmployeeId && !!scheduleStart && !!scheduleEnd && !approvalMode,
		},
	);

	useEffect(() => {
		if (!isOpen || approvalMode || !canEditDays) return;
		if (!isValidDayParam(deepLinkDay)) return;
		if (deepLinkDay && suppressedDeepLinkDay === deepLinkDay) return;

		const sourceBreakdown =
			(updatedBreakdown.length > 0
				? updatedBreakdown
				: ((timesheet?.breakdown as TimesheetBreakdownDay[]) ?? [])) || [];
		if (!sourceBreakdown.length) return;

		const targetDay = sourceBreakdown.find((day) => getTimesheetDayBusinessKey(day) === deepLinkDay);
		if (!targetDay) return;

		if (editingDay && getTimesheetDayBusinessKey(editingDay) === deepLinkDay) {
			return;
		}

		setEditingDay(targetDay);
	}, [
		isOpen,
		approvalMode,
		canEditDays,
		deepLinkDay,
		suppressedDeepLinkDay,
		updatedBreakdown,
		timesheet?.breakdown,
		editingDay,
	]);

	useEffect(() => {
		if (!deepLinkDay) {
			setSuppressedDeepLinkDay(null);
			return;
		}
		if (suppressedDeepLinkDay && suppressedDeepLinkDay !== deepLinkDay) {
			setSuppressedDeepLinkDay(null);
		}
	}, [deepLinkDay, suppressedDeepLinkDay]);

	const resolvedShiftByDayKey = useMemo(() => {
		const map = new Map<string, ResolvedCalendarShift>();
		for (const day of resolvedScheduleCalendar?.days || []) {
			const key = formatDayKey(day.date);
			if (!key || !day.shift) continue;
			map.set(key, day.shift);
		}
		return map;
	}, [resolvedScheduleCalendar]);
	const editingDayKey = editingDay ? getTimesheetDayBusinessKey(editingDay) : "";
	const isScheduleDefaultsLoading = Boolean(
		editingDayKey &&
			(isResolvedScheduleLoading || isResolvedScheduleFetching) &&
			!resolvedShiftByDayKey.has(editingDayKey),
	);

	const dayEditorDefaultTimes = useMemo(() => {
		if (!editingDay) return {};
		const dayKey = getTimesheetDayBusinessKey(editingDay);
		if (!dayKey) return {};

		const shift = resolvedShiftByDayKey.get(dayKey);
		if (!shift) return {};
		if (shift.isOff) {
			return {
				timeIn: "",
				timeOut: "",
				breakMinutes: 0,
				breakDisplay: "No break",
				scheduleStartTime: "",
				scheduleEndTime: "",
				scheduledWorkMinutes: 0,
			};
		}

		const toMinutes = (value: string) => {
			const [hours, minutes] = value.split(":").map(Number);
			if (Number.isNaN(hours) || Number.isNaN(minutes)) return 0;
			return hours * 60 + minutes;
		};
		const durationBetween = (startValue: string, endValue: string) => {
			const start = toMinutes(startValue);
			const end = toMinutes(endValue);
			if (!startValue || !endValue) return 0;
			return Math.max(0, end <= start ? end + 24 * 60 - start : end - start);
		};
		const toDisplayTime = (value: string) => {
			const [hours, minutes] = value.split(":").map(Number);
			if (Number.isNaN(hours) || Number.isNaN(minutes)) return value;
			const period = hours >= 12 ? "PM" : "AM";
			const normalizedHours = hours % 12 === 0 ? 12 : hours % 12;
			return `${String(normalizedHours).padStart(2, "0")}:${String(minutes).padStart(2, "0")} ${period}`;
		};

		const timeSlots = shift.timeSlots || [];
		const workSlots = timeSlots.filter(
			(slot: ResolvedCalendarTimeSlot) =>
				slot.type === "work" && slot.startTime && slot.endTime,
		);
		const breakSlots = timeSlots.filter(
			(slot: ResolvedCalendarTimeSlot) =>
				slot.type === "break" && slot.startTime && slot.endTime,
		);

		// Keep resolver slot order (especially for overnight shifts) instead of lexical HH:mm sorting.
		const firstWorkStart = workSlots[0]?.startTime || shift.startTime || "";
		const lastWorkEnd = workSlots[workSlots.length - 1]?.endTime || shift.endTime || "";
		const isOvernight =
			Boolean(shift.isOvernight) ||
			Boolean(
				firstWorkStart &&
					lastWorkEnd &&
					toMinutes(lastWorkEnd) <= toMinutes(firstWorkStart),
			);

		const breakMinutesFromSlots = breakSlots.reduce(
			(total: number, slot: ResolvedCalendarTimeSlot) => {
				return total + durationBetween(slot.startTime, slot.endTime);
			},
			0,
		);
		const breakMinutes = breakSlots.length
			? breakMinutesFromSlots
			: Math.max(0, Number(shift.breakMinutes || 0));
		const breakDisplay = breakSlots.length
			? breakSlots
					.map(
						(slot: ResolvedCalendarTimeSlot) =>
							`${toDisplayTime(slot.startTime)} to ${toDisplayTime(slot.endTime)}`,
					)
					.join(", ")
			: breakMinutes > 0
				? `${breakMinutes} minute${breakMinutes === 1 ? "" : "s"} break`
				: "No break";

		const scheduledWorkMinutes = workSlots.length
			? workSlots.reduce((total: number, slot: ResolvedCalendarTimeSlot) => {
					return total + durationBetween(slot.startTime, slot.endTime);
				}, 0)
			: Math.max(0, durationBetween(firstWorkStart, lastWorkEnd) - breakMinutes);

		return {
			timeIn: firstWorkStart,
			timeOut: lastWorkEnd,
			breakMinutes,
			breakDisplay,
			scheduleStartTime: firstWorkStart,
			scheduleEndTime: lastWorkEnd,
			scheduledWorkMinutes,
			isOvernight,
			shiftName:
				shift.shiftTypeName ||
				shift.scheduleTemplateName ||
				shift.shiftTypeCode ||
				"Scheduled shift",
			shiftCode: shift.shiftTypeCode || undefined,
			scheduleWindowDisplay: `${toDisplayTime(firstWorkStart)} - ${toDisplayTime(lastWorkEnd)}${isOvernight ? " (+1 day)" : ""}`,
			timeOutDayOffset: (isOvernight ? 1 : 0) as 0 | 1,
		};
	}, [editingDay, resolvedShiftByDayKey]);

	const displayBreakdown = useMemo(() => {
		const source =
			updatedBreakdown.length > 0
				? updatedBreakdown
				: ((timesheet?.breakdown as TimesheetBreakdownDay[] | undefined) ?? []);

		return source.map((day) => {
			const dayKey = getTimesheetDayBusinessKey(day);
			const resolvedShift = dayKey ? resolvedShiftByDayKey.get(dayKey) : undefined;
			const computedNightShift = buildNightShiftMeta({
				isOvernight: resolvedShift?.isOvernight,
				startTime: resolvedShift?.startTime,
				endTime: resolvedShift?.endTime,
				hoursWorked: day.hoursWorked,
				timeIn: day.timeIn,
				timeOut: day.timeOut,
			});
			const serverNightShift = day.nightShift;
			const hasNightShift =
				Boolean(serverNightShift?.isNightShiftDay) ||
				Boolean(computedNightShift?.isNightShiftDay);

			if (!hasNightShift) {
				if (!serverNightShift) return day;
				return { ...day, nightShift: undefined };
			}

			return {
				...day,
				nightShift: {
					isNightShiftDay: true,
					scheduledWindow:
						serverNightShift?.scheduledWindow || computedNightShift?.scheduledWindow,
					actualNightHours:
						serverNightShift?.actualNightHours ||
						computedNightShift?.actualNightHours ||
						"0:00",
				},
			};
		});
	}, [updatedBreakdown, timesheet?.breakdown, resolvedShiftByDayKey]);

	const periodStart = timesheet?.payrollPeriod?.startDate;
	const periodEnd = timesheet?.payrollPeriod?.endDate;
	const visibleBreakdown = useMemo(() => {
		const startKey = formatDayKey(periodStart);
		const endKey = formatDayKey(periodEnd);
		const daysByDate = new Map<string, TimesheetBreakdownDay>();

		displayBreakdown.forEach((day) => {
			const dayKey = getTimesheetDayBusinessKey(day);
			if (!dayKey) return;
			if (startKey && dayKey < startKey) return;
			if (endKey && dayKey > endKey) return;

			const existingDay = daysByDate.get(dayKey);
			if (!existingDay) {
				daysByDate.set(dayKey, day);
				return;
			}

			const existingHours = parseDurationHours(existingDay.hoursWorked);
			const currentHours = parseDurationHours(day.hoursWorked);
			if (existingHours === 0 && currentHours > 0) {
				daysByDate.set(dayKey, day);
			}
		});

		return Array.from(daysByDate.entries())
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([, day]) => day);
	}, [displayBreakdown, periodStart, periodEnd]);

	const approvedEditedDayItems = useMemo(
		() => approvedEditedDaysSummary?.items || [],
		[approvedEditedDaysSummary],
	);
	const isValidDateValue = (value?: string | null) => {
		if (!value) return false;
		const parsed = new Date(value);
		return !Number.isNaN(parsed.getTime());
	};
	const currentModifiedDayItems = useMemo(() => {
		const displayedDayByDate = new Map(
			visibleBreakdown
				.map((day) => [getTimesheetDayBusinessKey(day), day] as const)
				.filter(([date]) => Boolean(date)),
		);
		const modifiedDayByDate = new Map<string, TimesheetBreakdownDay>();

		for (const day of visibleBreakdown) {
			const dayKey = getTimesheetDayBusinessKey(day);
			const revisionSummary = day.revisionSummary;
			if (!dayKey || !revisionSummary?.isModified || !revisionSummary.changedFields?.length) {
				continue;
			}

			const existing = modifiedDayByDate.get(dayKey);
			if (
				!existing ||
				new Date(revisionSummary.editedAt || day.date).getTime() >
					new Date(existing.revisionSummary?.editedAt || existing.date).getTime()
			) {
				modifiedDayByDate.set(dayKey, day);
			}
		}

		return Array.from(modifiedDayByDate.values()).map((day) => {
			const revisionSummary = day.revisionSummary!;
			const dayKey = getTimesheetDayBusinessKey(day);
			const displayedDay = displayedDayByDate.get(dayKey) || day;
			return {
				entryId: revisionSummary.lineId || dayKey,
				timesheetId: timesheet?.id || "",
				date: dayKey,
				periodLabel:
					revisionSummary.ledgerType === "CORRECTION"
						? "Current correction"
						: revisionSummary.ledgerType || "Current correction",
				sourcePeriodType: "CURRENT" as const,
				approvedAt: revisionSummary.editedAt || day.date,
				modifiedAt: revisionSummary.editedAt || day.date,
				changeType: revisionSummary.changeType,
				changedFields: revisionSummary.changedFields || [],
				dayPreview: {
					timeIn: displayedDay.timeIn,
					timeOut: displayedDay.timeOut,
					status: displayedDay.status,
					hoursWorked: displayedDay.hoursWorked || "0:00",
					regularHours: displayedDay.regularHours || "0:00",
					overtimeHours: displayedDay.overtimeHours || "0:00",
					undertimeHours: displayedDay.undertimeHours || "0:00",
					lateHours: displayedDay.lateHours || "0:00",
					earlyOutHours: displayedDay.earlyOutHours || "0:00",
					leaveType: displayedDay.leaveType,
					leaveEntries: displayedDay.leaveEntries,
					holidayEntries: displayedDay.holidayEntries,
					primaryMarker: displayedDay.primaryMarker,
					approvalStatus: displayedDay.approvalStatus,
					employeeNotes: displayedDay.employeeNotes,
					approverNotes: displayedDay.approverNotes,
					metadata: displayedDay.metadata,
					nightShift: displayedDay.nightShift,
				},
			};
		});
	}, [timesheet?.id, visibleBreakdown]);

	const recentModifiedDayItems = useMemo(() => {
		const priorItems = [...approvedEditedDayItems]
			.filter(
				(item) =>
					Boolean(item?.entryId?.trim()) &&
					Boolean(item?.periodLabel?.trim()) &&
					isValidDateValue(item?.date) &&
					isValidDateValue(item?.approvedAt),
			)
			.sort((a, b) => {
				const approvedDiff =
					new Date(b.approvedAt).getTime() - new Date(a.approvedAt).getTime();
				if (approvedDiff !== 0) return approvedDiff;
				return new Date(b.date).getTime() - new Date(a.date).getTime();
			})
			.map((item) => ({
				...item,
				modifiedAt: item.approvedAt,
			}));

		const latestPriorItemByDate = new Map<string, (typeof priorItems)[number]>();
		for (const item of priorItems) {
			const existing = latestPriorItemByDate.get(item.date);
			if (
				!existing ||
				new Date(item.modifiedAt).getTime() > new Date(existing.modifiedAt).getTime()
			) {
				latestPriorItemByDate.set(item.date, item);
			}
		}

		const sourceItems = approvalMode
			? currentModifiedDayItems
			: currentModifiedDayItems.length > 0
				? currentModifiedDayItems
				: Array.from(latestPriorItemByDate.values());

		return sourceItems.sort((a, b) => {
			const modifiedDiff =
				new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime();
			if (modifiedDiff !== 0) return modifiedDiff;
			return new Date(b.date).getTime() - new Date(a.date).getTime();
		});
	}, [approvalMode, approvedEditedDayItems, currentModifiedDayItems]);
	const visibleApprovedEditedDayItems = showAllApprovedEditedDays
		? recentModifiedDayItems
		: recentModifiedDayItems.slice(0, 3);
	const selectedApprovedEditedRow = useMemo(() => {
		if (!recentModifiedDayItems.length) return null;
		if (!selectedApprovedEditedEntryId) return recentModifiedDayItems[0];
		return (
			recentModifiedDayItems.find((item) => item.entryId === selectedApprovedEditedEntryId) ||
			recentModifiedDayItems[0]
		);
	}, [recentModifiedDayItems, selectedApprovedEditedEntryId]);

	useEffect(() => {
		if (!recentModifiedDayItems.length) {
			setSelectedApprovedEditedEntryId(null);
			return;
		}
		if (!selectedApprovedEditedEntryId) {
			setSelectedApprovedEditedEntryId(recentModifiedDayItems[0].entryId);
			return;
		}
		const stillExists = recentModifiedDayItems.some(
			(item) => item.entryId === selectedApprovedEditedEntryId,
		);
		if (!stillExists) {
			setSelectedApprovedEditedEntryId(recentModifiedDayItems[0].entryId);
		}
	}, [recentModifiedDayItems, selectedApprovedEditedEntryId]);

	const formatPanelDate = (value: string) => {
		const parsed = new Date(value);
		if (Number.isNaN(parsed.getTime())) return value;
		return parsed.toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
			year: "numeric",
		});
	};

	const getDayNumberFromIsoDate = (value: string) => {
		const dayKey = formatDayKey(value);
		return dayKey ? String(Number(dayKey.slice(8, 10))) : "";
	};

	const getChangeTypeLabel = (value: string) => {
		switch (value) {
			case "TIME":
				return "Time";
			case "STATUS":
				return "Status";
			case "NOTES":
				return "Notes";
			default:
				return "Mixed";
		}
	};

	const formatChangeValue = (value: unknown, field?: string, baseDate?: string) => {
		if (value === null || value === undefined || value === "") {
			switch (field) {
				case "timeIn":
					return "No time in recorded";
				case "timeOut":
					return "No time out recorded";
				case "hoursWorked":
					return "No worked hours";
				case "regularHours":
					return "No regular hours";
				case "overtimeHours":
					return "No overtime";
				case "lateHours":
					return "No late time";
				case "earlyOutHours":
					return "No early out";
				case "status":
					return "No status";
				default:
					return "No value";
			}
		}
		if (typeof value === "string") {
			if (/^\d+:\d{2}$/.test(value)) return formatDuration(value);
			if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
				const parsed = new Date(value);
				if (!Number.isNaN(parsed.getTime())) {
					const timeLabel = parsed.toLocaleTimeString("en-US", {
						hour: "numeric",
						minute: "2-digit",
					});
					const baseDayKey = formatDayKey(baseDate);
					const valueDayKey = formatDayKey(value);
					const nextDaySuffix =
						field === "timeOut" && baseDayKey && valueDayKey > baseDayKey
							? " (+1)"
							: "";
					return `${timeLabel}${nextDaySuffix}`;
				}
			}
			return value;
		}
		if (typeof value === "number" || typeof value === "boolean") return String(value);
		return JSON.stringify(value);
	};

	const parseHours = (timeStr?: string | null): number => {
		if (!timeStr) return 0;
		if (!timeStr.includes(":")) return Number(timeStr) || 0;
		const [hours, minutes] = timeStr.split(":").map(Number);
		if (Number.isNaN(hours) || Number.isNaN(minutes)) return 0;
		return hours + minutes / 60;
	};

	const timesheetDisplayStatus = timesheet?.lockedAt ? "LOCKED" : timesheet?.status;

	// Get status badge color (minimal/neutral primary treatment)
	const getStatusColor = () => {
		switch (timesheetDisplayStatus) {
			case "LOCKED":
				return { bg: "#f3f4f6", text: "#374151" };
			case "DRAFT":
			case "REVISED":
				return { bg: "#f3f4f6", text: "#6b7280" };
			case "SUBMITTED":
				return { bg: "#e0f2fe", text: "#0369a1" }; // soft sky
			case "APPROVED":
				return { bg: "#ecfdf5", text: "#166534" }; // soft emerald
			case "REJECTED":
				return { bg: "#fef2f2", text: "#b91c1c" };
			default:
				return { bg: "#f3f4f6", text: "#6b7280" };
		}
	};

	const statusColors = getStatusColor();

	const timeToMinutes = (value?: string | null) => {
		if (!value) return 0;
		const [h, m] = value.split(":").map(Number);
		if (Number.isNaN(h) || Number.isNaN(m)) return 0;
		return h * 60 + m;
	};

	const minutesToTime = (minutes: number) => {
		const safe = Math.max(0, minutes);
		const hours = Math.floor(safe / 60);
		const mins = safe % 60;
		return `${hours}:${String(mins).padStart(2, "0")}`;
	};

	const timesheetPeriodLabel =
		periodStart && periodEnd
			? `${formatDate(periodStart, "short")} - ${formatDate(periodEnd, "short")}`
			: "";
	const modalBaseTitle = title || "Timesheet";
	const modalTitle =
		!approvalMode && timesheetPeriodLabel
			? `${modalBaseTitle} (${timesheetPeriodLabel})`
			: modalBaseTitle;

	const totalNightShiftHours = useMemo(() => {
		const serverNs =
			(timesheet?.metadata as any)?.totalNightShiftHours ||
			(timesheet?.metadata as any)?.totalNightShiftMinutes;
		const computedNsMinutes = visibleBreakdown.reduce((sum, day) => {
			if (day.nightShift?.isNightShiftDay && day.nightShift.actualNightHours) {
				return sum + timeToMinutes(day.nightShift.actualNightHours);
			}
			return sum;
		}, 0);
		if (computedNsMinutes > 0) return minutesToTime(computedNsMinutes);
		if (visibleBreakdown.length > 0) return "0:00";
		if (typeof serverNs === "string" && serverNs !== "0:00") return serverNs;
		if (typeof serverNs === "number" && serverNs > 0) return minutesToTime(serverNs);
		return undefined;
	}, [timesheet?.metadata, visibleBreakdown]);

	const totalHolidayHours = useMemo(() => {
		const serverHoliday =
			(timesheet?.metadata as any)?.totalHolidayHours ||
			(timesheet?.metadata as any)?.totalHolidayMinutes;
		const computedHolidayMinutes = visibleBreakdown.reduce((sum, day) => {
			const holidayEntries = Array.isArray(day.holidayEntries) ? day.holidayEntries : [];
			if (holidayEntries.length === 0) return sum;
			return sum + timeToMinutes(day.hoursWorked);
		}, 0);
		if (computedHolidayMinutes > 0) return minutesToTime(computedHolidayMinutes);
		if (visibleBreakdown.length > 0) return "0:00";
		if (typeof serverHoliday === "string" && serverHoliday !== "0:00") return serverHoliday;
		if (typeof serverHoliday === "number" && serverHoliday > 0) {
			return minutesToTime(serverHoliday);
		}
		return "0:00";
	}, [timesheet?.metadata, visibleBreakdown]);

	const displayedHours = useMemo(() => {
		if (!visibleBreakdown.length) {
			return {
				totalHoursWorked: timesheet?.totalHoursWorked,
				totalRegularHours: timesheet?.totalRegularHours,
				totalOvertimeHours: timesheet?.totalOvertimeHours,
				totalLateHours: timesheet?.totalLateHours,
				totalEarlyOutHours: timesheet?.totalEarlyOutHours,
				totalNightShiftHours,
				totalHolidayHours,
			};
		}

		const totals = visibleBreakdown.reduce(
			(acc, day) => {
				acc.totalHoursWorked += timeToMinutes(day.hoursWorked);
				acc.totalRegularHours += timeToMinutes(day.regularHours);
				acc.totalOvertimeHours += timeToMinutes(day.overtimeHours);
				acc.totalLateHours += timeToMinutes(day.lateHours);
				acc.totalEarlyOutHours += timeToMinutes(day.earlyOutHours);
				return acc;
			},
			{
				totalHoursWorked: 0,
				totalRegularHours: 0,
				totalOvertimeHours: 0,
				totalLateHours: 0,
				totalEarlyOutHours: 0,
			},
		);

		return {
			totalHoursWorked: minutesToTime(totals.totalHoursWorked),
			totalRegularHours: minutesToTime(totals.totalRegularHours),
			totalOvertimeHours: minutesToTime(totals.totalOvertimeHours),
			totalLateHours: minutesToTime(totals.totalLateHours),
			totalEarlyOutHours: minutesToTime(totals.totalEarlyOutHours),
			totalNightShiftHours,
			totalHolidayHours,
		};
	}, [timesheet, totalNightShiftHours, totalHolidayHours, visibleBreakdown]);

	const modifiedDayKeys = useMemo(() => {
		const original = (timesheet?.breakdown as TimesheetBreakdownDay[] | undefined) || [];
		const current = updatedBreakdown.length > 0 ? updatedBreakdown : original;

		if (!original.length || !current.length) return [];

		const originalByDay = new Map<string, TimesheetBreakdownDay>();
		original.forEach((day) => {
			const key = getTimesheetDayBusinessKey(day);
			if (key) originalByDay.set(key, day);
		});

		return current
			.filter((day) => {
				const key = getTimesheetDayBusinessKey(day);
				if (!key) return false;
				const base = originalByDay.get(key);
				if (!base) return true;
				return (
					JSON.stringify(normalizeDayForDirtyCheck(base)) !==
					JSON.stringify(normalizeDayForDirtyCheck(day))
				);
			})
			.map((day) => getTimesheetDayBusinessKey(day))
			.filter(Boolean);
	}, [timesheet?.breakdown, updatedBreakdown]);

	// Get employee info for approval mode
	const employee = timesheet?.employee;
	const employeeName = employee?.person?.personalInfo
		? `${employee.person.personalInfo.firstName} ${employee.person.personalInfo.lastName}`
		: "Employee";

	// Handle approval
	const handleApprove = () => {
		if (onApprove && updatedBreakdown.length) {
			onApprove(updatedBreakdown);
		}
	};

	// Handle rejection
	const handleReject = () => {
		const trimmedReason = rejectReason.trim();
		if (!trimmedReason) {
			setShowRejectValidation(true);
			return;
		}

		if (onReject && updatedBreakdown.length) {
			onReject(updatedBreakdown, trimmedReason);
		}
	};

	const handleRequestEditPermission = async () => {
		const trimmedReason = editPermissionReason.trim();
		if (!trimmedReason) {
			setShowPermissionReasonValidation(true);
			return;
		}

		if (!onRequestEditPermission) return;
		await onRequestEditPermission(trimmedReason);
		setIsPermissionModalOpen(false);
		setEditPermissionReason("");
		setShowPermissionReasonValidation(false);
	};

	// Approval mode description
	const approvalDescription = approvalMode
		? `Review ${employeeName}'s timesheet and approve or reject`
		: showActions
			? "Review and submit your timesheet for approval"
			: "Timesheet details and breakdown";
	const compensatoryLeaveCredit = getCompensatoryLeaveCredit(timesheet);

	return (
		<>
			<Modal
				open={isOpen}
				onOpenChange={(open) => !open && onClose()}
				showCloseButton={false}
				className="w-[96vw] max-w-[1400px] max-h-[98vh]">
				{/* Header */}
				<div className="flex items-start justify-between mb-5">
					<div className="space-y-0.5 flex-1 min-w-0">
						<h2 className="text-xl font-semibold leading-none tracking-tight text-gray-900">
							{approvalMode ? "Timesheet Approval" : modalTitle}
						</h2>
						<p className="text-sm text-gray-500">{approvalDescription}</p>
					</div>
					<div className="flex items-center gap-2">
						{timesheet && (
							<span
								className="px-3 py-0.5 rounded-md text-xs font-semibold uppercase border border-gray-200 bg-white text-gray-700"
								style={statusColors.bg !== "#f3f4f6" ? { borderColor: statusColors.bg, color: statusColors.text } : undefined}>
								{timesheetDisplayStatus}
							</span>
						)}
						{canNavigateToAttendance ? (
							<TooltipProvider>
								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											variant="ghost"
											size="icon"
											className="h-7 w-7 rounded-sm text-gray-600 hover:text-orange-600"
											onClick={handleOpenAttendance}>
											<CalendarDays className="h-4 w-4" />
											<span className="sr-only">View attendance</span>
										</Button>
									</TooltipTrigger>
									<TooltipContent side="bottom" className="text-xs">
										View attendance
									</TooltipContent>
								</Tooltip>
							</TooltipProvider>
						) : null}
						<Button
							variant="ghost"
							size="icon"
							className="h-7 w-7 rounded-sm opacity-70 hover:opacity-100"
							onClick={onClose}>
							<X className="h-4 w-4" />
							<span className="sr-only">Close</span>
						</Button>
					</div>
				</div>

				{/* Content */}
				{approvalMode ? (
					// Approval Mode Content
					<div className="space-y-4">
						{isLoading ? (
							<div className="flex items-center justify-center py-12">
								<div className="w-8 h-8 border-4 border-gray-200 border-t-orange-500 rounded-full animate-spin" />
								<span className="ml-3 text-gray-600">Loading timesheet...</span>
							</div>
						) : error ? (
							<div className="flex flex-col items-center justify-center py-16">
								<p className="text-lg font-semibold text-red-600 mb-2">
									Error Loading Timesheet
								</p>
								<p className="text-sm text-gray-500">
									{(error as any)?.message || "Failed to load timesheet data"}
								</p>
							</div>
						) : (
							<>
								{/* Employee Details + Hours Overview Row */}
								<div className="flex gap-4">
									{/* Employee Details - Left (1/3 width) */}
									{employee && (
										<TimesheetEmployeeCard
											employee={employee}
											profileId={timesheetProfileId}
											onOpenProfile={handleOpenEmployeeProfile}
											className="flex-[1] min-w-0"
										/>
									)}

									{/* Hours Overview - Right (2/3 width) */}
									<TimesheetHoursOverview
										hours={displayedHours}
										className={employee ? "flex-[2] min-w-0" : "w-full"}
									/>
								</div>

								{compensatoryLeaveCredit && compensatoryLeaveCredit.lineCount > 0 ? (
									compensatoryLeaveCredit.creditApplied === false ? (
										<div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
											<div className="flex flex-wrap items-start justify-between gap-3">
												<div>
													<p className="text-sm font-semibold text-gray-900">
														Compensatory Leave Not Credited
													</p>
													<p className="mt-1 text-sm text-gray-700">
														{compensatoryLeaveCredit.skipReason === "NO_COMPENSATORY_LEAVE_POLICY"
															? "Employee's policy does not grant compensatory leave for overtime."
															: "Approved overtime this period did not result in additional credited leave."}
													</p>
												</div>
												<div className="text-right text-xs text-gray-500">
													<p>
														{compensatoryLeaveCredit.lineCount} overtime day
														{compensatoryLeaveCredit.lineCount === 1 ? "" : "s"}
													</p>
												</div>
											</div>
										</div>
									) : (
										<div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
											<div className="flex flex-wrap items-start justify-between gap-3">
												<div>
													<p className="text-sm font-semibold text-emerald-900">
														Compensatory Leave Credited
													</p>
													<p className="mt-1 text-sm text-emerald-800">
														{formatLeaveDaysLabel(
															compensatoryLeaveCredit.totalDays,
														)}{" "}
														from{" "}
														{formatDuration(
															`${Math.floor(compensatoryLeaveCredit.totalMinutes / 60)}:${String(compensatoryLeaveCredit.totalMinutes % 60).padStart(2, "0")}`,
														)}{" "}
														approved overtime.
													</p>
												</div>
												<div className="text-right text-xs text-emerald-700">
													<p>
														{compensatoryLeaveCredit.lineCount} overtime day
														{compensatoryLeaveCredit.lineCount === 1 ? "" : "s"}
													</p>
													{compensatoryLeaveCredit.creditedAt ? (
														<p>
															Credited {formatDate(compensatoryLeaveCredit.creditedAt)}
														</p>
													) : null}
												</div>
											</div>
										</div>
									)
								) : null}

								{recentModifiedDayItems.length > 0 && (
									<div className="rounded-lg border border-gray-200 bg-white">
										<div className="flex items-center justify-between border-b border-gray-200 px-3 py-2">
											<div>
												<p className="text-base font-semibold text-gray-900">
													Recent Modified Days
												</p>
												<p className="text-sm text-gray-500">
													Latest edited rows appear first.
												</p>
											</div>
											{recentModifiedDayItems.length > 3 && (
												<Button
													type="button"
													variant="ghost"
													size="sm"
													className="h-7 px-2 text-xs"
													onClick={() =>
														setShowAllApprovedEditedDays(
															(prev) => !prev,
														)
													}>
													{showAllApprovedEditedDays
														? "Show less"
														: "View all"}
												</Button>
											)}
										</div>
										<TooltipProvider>
											<div className="overflow-x-auto px-3 py-2">
												<div className="grid grid-flow-col auto-cols-[80px] gap-1.5">
													{visibleApprovedEditedDayItems.map((item) => {
														const dayPreview = item.dayPreview;
														const hoursWorked =
															dayPreview?.hoursWorked || "0:00";
														const hasWorkedHours =
															parseHours(hoursWorked) > 0;
														const isAbsent = Boolean(
															dayPreview &&
																isVirtualAbsentLikeRecord(
																	dayPreview,
																),
														);
														const isRestDay =
															dayPreview?.status === "REST_DAY";
														const cellKind = hasWorkedHours
															? "hours"
															: isAbsent
																? "absent"
																: isRestDay
																	? "rest"
																	: "hours";
														const changedFields = Array.isArray(
															(item as any).changedFields,
														)
															? ((item as any)
																	.changedFields as Array<{
																	field: string;
																	label: string;
																	before: unknown;
																	after: unknown;
																}>)
															: [];

														return (
															<Tooltip key={item.entryId}>
																<TooltipTrigger asChild>
																	<TimesheetDayCell
																		dayNumber={getDayNumberFromIsoDate(
																			item.date,
																		)}
																		kind={cellKind}
																		hoursLabel={formatDuration(
																			hoursWorked,
																		)}
																		modified={true}
																		selected={
																			selectedApprovedEditedRow?.entryId ===
																			item.entryId
																		}
																		onClick={() =>
																			setSelectedApprovedEditedEntryId(
																				item.entryId,
																			)
																		}
																	/>
																</TooltipTrigger>
																<TooltipContent
																	side="top"
																	className="max-w-[280px] p-2.5 bg-white shadow-lg border z-50 text-xs">
																	<p className="font-semibold text-gray-900">
																		Modified submission
																	</p>
																	<p className="text-gray-500">
																		{formatPanelDate(
																			item.modifiedAt,
																		)}
																	</p>
																	{changedFields.length > 0 && (
																		<div className="mt-2 space-y-1">
																			{changedFields
																				.slice(0, 5)
																				.map((change) => (
																					<div
																						key={
																							change.field
																						}
																						className="grid grid-cols-[82px_1fr] gap-2">
																						<span className="font-medium text-amber-800">
																							{
																								change.label
																							}
																						</span>
																						<span className="text-gray-700">
																							{formatChangeValue(
																								change.before,
																								change.field,
																								item.date,
																							)}{" "}
																							-&gt;{" "}
																							{formatChangeValue(
																								change.after,
																								change.field,
																								item.date,
																							)}
																						</span>
																					</div>
																				))}
																		</div>
																	)}
																</TooltipContent>
															</Tooltip>
														);
													})}
												</div>
											</div>
										</TooltipProvider>
										{selectedApprovedEditedRow && (
											<div className="border-t border-gray-100 px-3 py-2 text-sm text-gray-600">
												<div>
													<span className="font-medium text-gray-700">
														Type:
													</span>{" "}
													{getChangeTypeLabel(
														selectedApprovedEditedRow.changeType,
													)}
													<span className="mx-2 text-gray-300">|</span>
													<span className="font-medium text-gray-700">
														Modified:
													</span>{" "}
													{formatPanelDate(
														selectedApprovedEditedRow.modifiedAt,
													)}
												</div>
											</div>
										)}
									</div>
								)}

								{/* Calendar with Approval Actions */}
								<TimesheetCalendarApproval
									breakdown={timesheet?.breakdown as TimesheetBreakdownDay[]}
									onApprovalChange={setUpdatedBreakdown}
									payrollPeriodStartDate={periodStart}
									payrollPeriodEndDate={periodEnd}
								/>
							</>
						)}
					</div>
				) : (
					// Normal View Mode Content
					<>
						{compensatoryLeaveCredit && compensatoryLeaveCredit.lineCount > 0 ? (
							compensatoryLeaveCredit.creditApplied === false ? (
								<div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
									<div className="flex flex-wrap items-start justify-between gap-3">
										<div>
											<p className="text-sm font-semibold text-gray-900">
												Compensatory Leave Not Credited
											</p>
											<p className="mt-1 text-sm text-gray-700">
												{compensatoryLeaveCredit.skipReason === "NO_COMPENSATORY_LEAVE_POLICY"
													? "Employee's policy does not grant compensatory leave for overtime."
													: "Approved overtime this period did not result in additional credited leave."}
											</p>
										</div>
										<div className="text-right text-xs text-gray-500">
											<p>
												{compensatoryLeaveCredit.lineCount} overtime day
												{compensatoryLeaveCredit.lineCount === 1 ? "" : "s"}
											</p>
										</div>
									</div>
								</div>
							) : (
								<div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
									<div className="flex flex-wrap items-start justify-between gap-3">
										<div>
											<p className="text-sm font-semibold text-emerald-900">
												Compensatory Leave Credited
											</p>
											<p className="mt-1 text-sm text-emerald-800">
												{formatLeaveDaysLabel(compensatoryLeaveCredit.totalDays)} from{" "}
												{formatDuration(
													`${Math.floor(compensatoryLeaveCredit.totalMinutes / 60)}:${String(compensatoryLeaveCredit.totalMinutes % 60).padStart(2, "0")}`,
												)}{" "}
												approved overtime.
											</p>
										</div>
										<div className="text-right text-xs text-emerald-700">
											<p>
												{compensatoryLeaveCredit.lineCount} overtime day
												{compensatoryLeaveCredit.lineCount === 1 ? "" : "s"}
											</p>
											{compensatoryLeaveCredit.creditedAt ? (
												<p>
													Credited {formatDate(compensatoryLeaveCredit.creditedAt)}
												</p>
											) : null}
										</div>
									</div>
								</div>
							)
						) : null}
						<TimesheetView
							employee={timesheet?.employee}
							employeeProfileId={timesheetProfileId}
							hours={displayedHours}
							breakdown={displayBreakdown}
							isLoading={isLoading}
							error={error}
							showEmployee={true}
							onOpenEmployeeProfile={handleOpenEmployeeProfile}
							onDayClick={canEditDays ? handleDayClick : undefined}
							onDayRequestAction={!approvalMode ? handleDayRequestAction : undefined}
							modifiedDayKeys={modifiedDayKeys}
							payrollPeriodStartDate={periodStart}
							payrollPeriodEndDate={periodEnd}
							belowSummaryContent={
								recentModifiedDayItems.length > 0 ? (
									<div className="rounded-lg border border-gray-200 bg-white">
										<div className="flex items-center justify-between border-b border-gray-200 px-3 py-2">
											<div>
												<p className="text-base font-semibold text-gray-900">
													Recent Modified Days
												</p>
												<p className="text-sm text-gray-500">
													Latest edited rows appear first.
												</p>
											</div>
											{recentModifiedDayItems.length > 3 && (
												<Button
													type="button"
													variant="ghost"
													size="sm"
													className="h-7 px-2 text-xs"
													onClick={() =>
														setShowAllApprovedEditedDays(
															(prev) => !prev,
														)
													}>
													{showAllApprovedEditedDays
														? "Show less"
														: "View all"}
												</Button>
											)}
										</div>
										<TooltipProvider>
											<div className="overflow-x-auto px-3 py-2">
												<div className="grid grid-flow-col auto-cols-[80px] gap-1.5">
													{visibleApprovedEditedDayItems.map((item) => (
														<Tooltip key={item.entryId}>
															<TooltipTrigger asChild>
																{(() => {
																	const dayPreview =
																		item.dayPreview;
																	const hoursWorked =
																		dayPreview?.hoursWorked ||
																		"0:00";
																	const status =
																		dayPreview?.status || null;
																	const hasRecordedTime =
																		(Boolean(
																			dayPreview?.timeIn,
																		) &&
																			Boolean(
																				dayPreview?.timeOut,
																			)) ||
																		parseHours(hoursWorked) > 0;
																	const isAbsent = Boolean(
																		dayPreview &&
																			isVirtualAbsentLikeRecord(
																				dayPreview,
																			),
																	);
																	const isRestDay =
																		status === "REST_DAY";
																	const cellKind:
																		| "hours"
																		| "absent"
																		| "rest"
																		| "marker" = !dayPreview
																		? "marker"
																		: isAbsent
																			? "absent"
																			: isRestDay
																				? "rest"
																				: "hours";
																	return (
																		<TimesheetDayCell
																			dayNumber={getDayNumberFromIsoDate(
																				item.date,
																			)}
																			kind={cellKind}
																			hoursLabel={formatDuration(
																				hoursWorked,
																			)}
																			markerLabel="M"
																			modified={
																				cellKind !==
																				"marker"
																			}
																			selected={
																				selectedApprovedEditedRow?.entryId ===
																				item.entryId
																			}
																			onClick={() =>
																				setSelectedApprovedEditedEntryId(
																					item.entryId,
																				)
																			}
																			badges={[
																				...(dayPreview?.employeeNotes || dayPreview?.approverNotes
																					? [
																							{
																								label: "NOTE",
																								tone: "meta" as const,
																							},
																						]
																					: []),
																				...(dayPreview?.overtimeHours &&
																				dayPreview.overtimeHours !==
																					"0:00"
																					? [
																							{
																								label: "+OT",
																								tone: "ot" as const,
																							},
																						]
																					: []),
																				...(dayPreview
																					?.metadata
																					?.withinGrace
																					? [
																							{
																								label: "GRACE",
																								tone: "meta" as const,
																							},
																						]
																					: []),
																				...(!dayPreview
																					?.metadata
																					?.withinGrace &&
																				dayPreview?.lateHours &&
																				dayPreview.lateHours !==
																					"0:00"
																					? [
																							{
																								label: "LATE",
																								tone: "late" as const,
																							},
																						]
																					: []),
																				...(dayPreview?.earlyOutHours &&
																				dayPreview.earlyOutHours !==
																					"0:00"
																					? [
																							{
																								label: "EO",
																								tone: "eo" as const,
																							},
																						]
																					: []),
																			]}
																		/>
																	);
																})()}
															</TooltipTrigger>
															<TooltipContent
																side="top"
																className="p-4 bg-white shadow-lg border z-50 text-sm">
																<TimesheetDayTooltipContent
																	day={{
																		date: item.date,
																		timeIn:
																			item.dayPreview
																				?.timeIn || null,
																		timeOut:
																			item.dayPreview
																				?.timeOut || null,
																		hoursWorked:
																			item.dayPreview
																				?.hoursWorked ||
																			"0:00",
																		regularHours:
																			item.dayPreview
																				?.regularHours ||
																			"0:00",
																		overtimeHours:
																			item.dayPreview
																				?.overtimeHours ||
																			"0:00",
																		lateHours:
																			item.dayPreview
																				?.lateHours ||
																			"0:00",
																		earlyOutHours:
																			item.dayPreview
																				?.earlyOutHours ||
																			"0:00",
																		status:
																			item.dayPreview
																				?.status || null,
																		approvalStatus:
																			item.dayPreview
																				?.approvalStatus ||
																			null,
																		employeeNotes:
																			item.dayPreview
																				?.employeeNotes ||
																			null,
																		approverNotes:
																			item.dayPreview
																				?.approverNotes ||
																			null,
																		metadata: {
																			breakMinutes:
																				item.dayPreview
																					?.metadata
																					?.breakMinutes ??
																				null,
																			breakDisplay:
																				item.dayPreview
																					?.metadata
																					?.breakDisplay ??
																				null,
																			rawLateMinutes:
																				item.dayPreview
																					?.metadata
																					?.rawLateMinutes ??
																				null,
																			gracePeriodMinutes:
																				item.dayPreview
																					?.metadata
																					?.gracePeriodMinutes ??
																				null,
																			rawEarlyOutMinutes:
																				(
																					item.dayPreview
																						?.metadata as any
																				)
																					?.rawEarlyOutMinutes ??
																				null,
																			graceEarlyOutMinutes:
																				(
																					item.dayPreview
																						?.metadata as any
																				)
																					?.graceEarlyOutMinutes ??
																				null,
																			withinGrace:
																				item.dayPreview
																					?.metadata
																					?.withinGrace ??
																				null,
																		},
																	}}
																	modified={Boolean(
																		item.dayPreview,
																	)}
																/>
																<p className="text-gray-600 border-t pt-1 mt-1">
																	Period: {item.periodLabel}
																</p>
																<p className="text-gray-600">
																	Type:{" "}
																	{getChangeTypeLabel(
																		item.changeType,
																	)}
																</p>
																<p className="text-gray-600">
																	Modified:{" "}
																	{formatDateTime(
																		item.modifiedAt,
																	)}
																</p>
																{Array.isArray(
																	(item as any).changedFields,
																) &&
																	(item as any).changedFields
																		.length > 0 && (
																		<div className="mt-2 border-t pt-1.5">
																			<p className="font-semibold text-amber-800">
																				Modified submission
																			</p>
																			{(
																				(item as any)
																					.changedFields as Array<{
																					field: string;
																					label: string;
																					before: unknown;
																					after: unknown;
																				}>
																			)
																				.slice(0, 5)
																				.map((change) => (
																					<div
																						key={
																							change.field
																						}
																						className="grid grid-cols-[82px_1fr] gap-2 text-gray-700">
																						<span className="font-medium text-amber-800">
																							{
																								change.label
																							}
																						</span>
																						<span>
																							{formatChangeValue(
																								change.before,
																								change.field,
																								item.date,
																							)}{" "}
																							-&gt;{" "}
																							{formatChangeValue(
																								change.after,
																								change.field,
																								item.date,
																							)}
																						</span>
																					</div>
																				))}
																		</div>
																	)}
															</TooltipContent>
														</Tooltip>
													))}
												</div>
											</div>
										</TooltipProvider>
										{selectedApprovedEditedRow && (
											<div className="border-t border-gray-100 px-3 py-2 text-sm text-gray-600">
												<div>
													<span className="font-medium text-gray-700">
														Period:
													</span>{" "}
													{selectedApprovedEditedRow.periodLabel}
													<span className="mx-2 text-gray-300">|</span>
													<span className="font-medium text-gray-700">
														Modified:
													</span>{" "}
													{formatPanelDate(
														selectedApprovedEditedRow.modifiedAt,
													)}
												</div>
												{Array.isArray(
													(selectedApprovedEditedRow as any)
														.changedFields,
												) &&
													(selectedApprovedEditedRow as any).changedFields
														.length > 0 && (
														<div className="mt-1 grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
															{(
																(selectedApprovedEditedRow as any)
																	.changedFields as Array<{
																	field: string;
																	label: string;
																	before: unknown;
																	after: unknown;
																}>
															)
																.slice(0, 6)
																.map((change) => (
																	<div
																		key={change.field}
																		className="rounded border border-amber-100 bg-amber-50 px-2 py-1">
																		<span className="font-medium text-amber-800">
																			{change.label}
																		</span>{" "}
																		<span className="text-gray-500">
																			{formatChangeValue(
																				change.before,
																			)}
																		</span>{" "}
																		<span className="text-gray-400">
																			-&gt;
																		</span>{" "}
																		<span className="font-medium text-gray-800">
																			{formatChangeValue(
																				change.after,
																			)}
																		</span>
																	</div>
																))}
														</div>
													)}
											</div>
										)}
									</div>
								) : null
							}
						/>
						<TimesheetDayEditor
							day={editingDay}
							isOpen={!!editingDay}
							onClose={handleDayEditorClose}
							onSave={handleDaySave}
							scheduleDefaultsLoading={isScheduleDefaultsLoading}
							defaultTimes={dayEditorDefaultTimes}
						/>
					</>
				)}

				{/* Footer - Only show when we have timesheet data */}
				{timesheet && !isLoading && !error && (
					<div className="space-y-3 mt-3">
						{/* Info Message for Submit Mode */}
						{showActions && !approvalMode && (
							<div
								className="rounded-lg p-3 border border-gray-200 bg-white space-y-2">
								{canOpenPermissionRequest ? (
									<div className="flex items-center justify-between gap-2">
										<p className="text-sm text-gray-700 flex-1">
											{getSubmitInfoMessage()}
										</p>
										<Button
											variant="outline"
											size="sm"
											className="text-xs h-7 shrink-0"
											onClick={() => setIsPermissionModalOpen(true)}
											disabled={isRequestingPermission}>
											Request Edit Permission
										</Button>
									</div>
								) : (
									<p className="text-sm text-gray-700">
										{getSubmitInfoMessage()}
									</p>
								)}
								{managerName && (
									<p className="text-sm text-gray-700">
										Approver:{" "}
										{approverProfileId ? (
											<button
												type="button"
												onClick={() =>
													navigate(
														`/employee/${approverProfileId}?from=timesheet-view-modal`,
													)
												}
												className="font-semibold text-orange-700 hover:underline">
												{managerName}
											</button>
										) : (
											<span className="font-semibold">{managerName}</span>
										)}
									</p>
								)}
								{permissionStatusMessage && (
									<p
										className={`text-sm font-medium ${
											isPermissionApproved
												? "text-green-700"
												: "text-gray-700"
										}`}>
										{permissionStatusMessage}
									</p>
								)}
								{editInstructionMessage && (
									<p className="text-sm font-medium text-green-700">
										{editInstructionMessage}
									</p>
								)}
							</div>
						)}

						{/* Info Message for Approval Mode */}
						{approvalMode && (
							<>
								<div
									className="rounded-lg p-3 border bg-white border-gray-200">
									<p className="text-sm text-gray-700">
										{hasRejectedDays ? (
											<>
												<AlertCircle className="w-3.5 h-3.5 inline mr-1 text-red-600" />
												One or more days have been rejected. Add a reason
												and return this timesheet for revision.
											</>
										) : allDaysReviewed ? (
											<>
												<CheckCircle2 className="w-3.5 h-3.5 inline mr-1 text-green-600" />
												All days have been reviewed. You can now approve
												this timesheet.
											</>
										) : (
											<>
												<AlertCircle className="w-3.5 h-3.5 inline mr-1 text-orange-600" />
												Review each week and approve or reject individual
												days. Hover over days to see quick actions, or use
												&quot;Approve&quot; button to approve entire week.
											</>
										)}
									</p>
								</div>
								{hasRejectedDays && (
									<div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-2">
										<label className="text-xs font-semibold text-red-800">
											Reason for revision{" "}
											<span className="text-red-600">*</span>
										</label>
										<textarea
											className="w-full min-h-[80px] rounded-md border border-red-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
											value={rejectReason}
											onChange={(e) => {
												setRejectReason(e.target.value);
												if (showRejectValidation && e.target.value.trim()) {
													setShowRejectValidation(false);
												}
											}}
											placeholder="Explain what needs to be corrected before resubmission."
										/>
										{showRejectValidation && !rejectReason.trim() && (
											<p className="text-xs text-red-700">
												Rejection reason is required.
											</p>
										)}
									</div>
								)}
							</>
						)}

						{/* Buttons */}
						<div className="flex items-center justify-end gap-2 pt-1">
							<Button variant="outline" onClick={onClose} className="text-sm">
								{approvalMode ? "Cancel" : "Close"}
							</Button>

							{/* Submit Mode Buttons */}
							{shouldShowSubmitButton && (
								<Button
									className="text-white font-semibold text-sm"
									style={{ backgroundColor: themeColors.orange }}
									onClick={handleSubmitClick}
									disabled={submitButtonDisabled}>
									{isSubmitting ? (
										<div className="flex items-center gap-2">
											<div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
											{isResubmissionFlow
												? "Resubmitting..."
												: "Submitting..."}
										</div>
									) : isResubmissionFlow ? (
										"Resubmit for Approval"
									) : (
										"Submit for Approval"
									)}
								</Button>
							)}

							{/* Approval Mode Buttons */}
							{approvalMode && (
								<>
									{hasRejectedDays ? (
										<Button
											className="text-white font-semibold text-sm"
											style={{ backgroundColor: "#dc2626" }}
											onClick={handleReject}
											disabled={isApproving || !rejectReason.trim()}>
											{isApproving ? (
												<div className="flex items-center gap-2">
													<div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
													Rejecting...
												</div>
											) : (
												<>
													<XCircle className="w-4 h-4 mr-1" />
													Reject Timesheet
												</>
											)}
										</Button>
									) : (
										<Button
											className="text-white font-semibold text-sm"
											style={{ backgroundColor: themeColors.orange }}
											onClick={handleApprove}
											disabled={!allDaysReviewed || isApproving}>
											{isApproving ? (
												<div className="flex items-center gap-2">
													<div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
													Approving...
												</div>
											) : !allDaysReviewed ? (
												<>
													<AlertCircle className="w-4 h-4 mr-1" />
													Review All Days First
												</>
											) : (
												<>
													<CheckCircle2 className="w-4 h-4 mr-1" />
													Approve Timesheet
												</>
											)}
										</Button>
									)}
								</>
							)}
						</div>
					</div>
				)}
			</Modal>

			<Modal
				open={isPermissionModalOpen}
				onOpenChange={(open) => {
					setIsPermissionModalOpen(open);
					if (!open) {
						setEditPermissionReason("");
						setShowPermissionReasonValidation(false);
					}
				}}
				title="Request Edit Permission"
				description="Submit a request to your manager to unlock this timesheet for corrections."
				className="max-w-lg">
				<div className="space-y-3">
					<label className="text-sm font-medium text-gray-700">
						Reason for correction <span className="text-red-600">*</span>
					</label>
					<textarea
						className="w-full min-h-[110px] rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
						placeholder="e.g. Missing clock-out on Mar 03 due to device issue"
						value={editPermissionReason}
						onChange={(e) => {
							setEditPermissionReason(e.target.value);
							if (showPermissionReasonValidation && e.target.value.trim()) {
								setShowPermissionReasonValidation(false);
							}
						}}
					/>
					{showPermissionReasonValidation && !editPermissionReason.trim() && (
						<p className="text-xs text-red-700">Reason is required.</p>
					)}
					<div className="flex items-center justify-end gap-2 pt-1">
						<Button
							variant="outline"
							onClick={() => {
								setIsPermissionModalOpen(false);
								setEditPermissionReason("");
								setShowPermissionReasonValidation(false);
							}}>
							Cancel
						</Button>
						<Button
							onClick={handleRequestEditPermission}
							disabled={isRequestingPermission}>
							{isRequestingPermission ? "Submitting..." : "Submit Request"}
						</Button>
					</div>
				</div>
			</Modal>
		</>
	);
}
