import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import sectionsService from "~/services/sections.service";
import {
	AlertCircle,
	Award,
	BadgeCheck,
	BriefcaseBusiness,
	Calendar,
	CalendarClock,
	Clock,
	Eye,
	FileText,
	type LucideIcon,
	MoreVertical,
	Plus,
	Receipt,
	Repeat,
	Trash2,
	XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "~/components/atoms/Button";
import { Badge } from "~/components/atoms/Badge";
import { DataTable, type Column, type FilterOption } from "~/components/atoms/DataTable";
import { Modal } from "~/components/atoms/Modal";
import { Input } from "~/components/atoms/Input";
import { Select } from "~/components/atoms/Select";
import { RequestReviewModal } from "~/components/molecules/RequestReviewModal";
import { LeaveRequestModal } from "~/components/organisms/leave-request-modal";
import {
	DocumentRequestModal,
	type DocumentRequestData,
} from "~/components/organisms/document-request-modal";
import JobRequisitionRequestModal from "~/components/modals/JobRequisitionRequestModal";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "~/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { useAuth } from "~/lib/hooks/use-auth";
import { getEmployeeActionBlock } from "~/lib/employee-action-block";
import { useEmployees } from "~/lib/hooks/useEmployees";
import {
	useCancelRequest,
	useCreateRequest,
	useDeleteRequest,
	useRequest,
	useRequests,
} from "~/lib/hooks/useRequests";
import { PANRequestModal } from "~/components/modals/PANRequestModal";
import { ResignationFlowModal } from "~/components/templates/common/ResignationFlowModal";
import type { PANIntent } from "~/components/atoms/PANBadge";
import type { Request, RequestStatus, RequestType } from "~/services/requests.service";
import {
	getLeaveRequestPrefillFromSearchParams,
	REQUEST_ROUTE_END_DATE_PARAM,
	REQUEST_ROUTE_LEAVE_TYPE_PARAM,
	REQUEST_ROUTE_START_DATE_PARAM,
} from "~/lib/utils/requests-route";
import { CalendarDatePicker } from "~/components/ui/calendar-date-picker";
import { useShiftTypes } from "~/lib/hooks/useSchedules";
import { TimePicker } from "~/components/molecules/TimePicker";
import {
	AttendanceAdjustmentRequestModal,
	type AttendanceTimeRequestFormValues,
} from "~/components/modals/AttendanceAdjustmentRequestModal";
import {
	buildAttendanceAdjustmentRequestPayload,
	buildOvertimeRequestPayload,
} from "~/lib/utils/attendance-adjustment-request";

type RequestCreateKind =
	| "leave"
	| "document"
	| "personnel-action"
	| "resignation"
	| "job-requisition"
	| "schedule-change"
	| "attendance-adjustment";

type ScheduleChangeFormData = {
	date: string;
	scheduleMode: "FLEXITIME" | "SHIFT_TYPE";
	shiftTypeId: string;
	shiftTypeLabel: string;
	shiftTypeName: string;
	shiftTypeCode: string;
	manualStartTime?: string;
	manualEndTime?: string;
	reason: string;
	notes?: string;
	requestedTimeSlots?: RequestedScheduleTimeSlot[];
};

type RequestedScheduleTimeSlot = {
	type: string;
	label: string;
	startTime: string;
	endTime: string;
};

type HubRequestRow = {
	id: string;
	requestCode: string;
	requestTypeLabel: string;
	requestTypeKey: string;
	descriptionText: string;
	submittedDate: string;
	submittedDateLabel: string;
	statusKey: string;
	currentStepLabel: string;
	request: Request;
};

const PERSONNEL_ACTION_TYPES = new Set<RequestType>([
	"REGULARIZATION",
	"PROMOTION",
	"SALARY_CHANGE",
	"TRANSFER",
	"TERMINATION",
]);
const hasManagerProfileFlag = (employee?: Record<string, any> | null) =>
	employee?.isManager === true ||
	employee?.isManager === "true" ||
	employee?.isDepartmentManager === true;

const HUB_WITHDRAW_REQUEST_TYPES = new Set<RequestType>([
	"LEAVE",
	"DOCUMENT_REQUEST",
	"RESIGNATION",
	"SCHEDULE_CHANGE",
	...PERSONNEL_ACTION_TYPES,
]);

const REQUEST_DETAIL_FIELDS = [
	"id",
	"code",
	"type",
	"currentWorkflowStateKey",
	"description",
	"startDate",
	"endDate",
	"metadata",
	"attachments",
	"notes",
	"createdAt",
	"updatedAt",
	"requester.person.personalInfo",
	"requester.employeeId",
	"requester.id",
	"stepExecutions.id",
	"stepExecutions.stepNumber",
	"stepExecutions.stepName",
	"stepExecutions.stepType",
	"stepExecutions.assigneeType",
	"stepExecutions.status",
	"stepExecutions.completedAt",
	"stepExecutions.comments",
	"stepExecutions.assignee.id",
	"stepExecutions.assignee.employeeId",
	"stepExecutions.assignee.person.personalInfo",
	"stepExecutions.assignee.department.name",
	"stepExecutions.assignee.department.code",
	"currentStepExecution.id",
	"currentStepExecution.stepName",
	"currentStepExecution.stepType",
	"currentStepExecution.assigneeType",
	"currentStepExecution.status",
	"currentStepExecution.assignee.id",
	"currentStepExecution.assignee.employeeId",
	"currentStepExecution.assignee.person.personalInfo",
	"lastCompletedStepExecution.id",
	"lastCompletedStepExecution.stepName",
	"lastCompletedStepExecution.completedAt",
	"lastCompletedStepExecution.assignee.person.personalInfo",
].join(",");

const formatRequestState = (request?: Request | null): RequestStatus =>
	(request?.currentWorkflowStateKey as RequestStatus) || "OPEN";

const formatTitleCase = (value: string) =>
	value
		.split("_")
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
		.join(" ");

const getRequestTypeLabel = (request: Request): string => {
	if (
		request.type === "OTHER" &&
		String(request.metadata?.requestSubtype || "").toUpperCase() ===
			"DEPARTMENT_JOB_REQUISITION"
	) {
		return "Job Requisition";
	}

	if (PERSONNEL_ACTION_TYPES.has(request.type)) {
		return formatTitleCase(request.type);
	}

	const labels: Record<string, string> = {
		LEAVE: "Leave Request",
		DOCUMENT_REQUEST: "Document Request",
		TIME_ADJUSTMENT: "Time Adjustment",
		ATTENDANCE_CORRECTION: "Attendance Request",
		OVERTIME: "Overtime Request",
		SCHEDULE_CHANGE: "Schedule Change Request",
		EXPENSE_REIMBURSEMENT: "Expense Reimbursement",
		RESIGNATION: "Resignation",
		TIMESHEET:
			request.metadata?.timesheetAction === "EDIT_PERMISSION"
				? "Timesheet Edit Permission"
				: "Timesheet Submission",
		OTHER: "General Request",
	};

	return labels[request.type] || formatTitleCase(request.type);
};

const getRequestTypeKey = (request: Request): string => {
	if (
		request.type === "OTHER" &&
		String(request.metadata?.requestSubtype || "").toUpperCase() ===
			"DEPARTMENT_JOB_REQUISITION"
	) {
		return "JOB_REQUISITION";
	}

	if (PERSONNEL_ACTION_TYPES.has(request.type)) {
		return "PERSONNEL_ACTION";
	}

	return request.type;
};

const getRequestTypeIcon = (request: Request) => {
	if (PERSONNEL_ACTION_TYPES.has(request.type)) return BriefcaseBusiness;

	switch (request.type) {
		case "LEAVE":
			return Calendar;
		case "DOCUMENT_REQUEST":
			return FileText;
		case "SCHEDULE_CHANGE":
			return CalendarClock;
		case "EXPENSE_REIMBURSEMENT":
			return Receipt;
		case "RESIGNATION":
			return AlertCircle;
		case "OTHER":
			return BriefcaseBusiness;
		default:
			return Clock;
	}
};

const formatDateLabel = (value?: string | null): string => {
	if (!value) return "-";

	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "-";

	return date.toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
};

const getLocalDateKey = (date: Date) => {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
};

const normalizePickerTime = (value?: string | null) => {
	const text = String(value || "").trim();
	const match = text.match(/^(\d{1,2}):(\d{2})/);
	if (!match) return "";
	const hour = Math.max(0, Math.min(23, Number(match[1]) || 0));
	const minute = Math.max(0, Math.min(59, Number(match[2]) || 0));
	return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
};

const formatTimeRange = (start?: string | null, end?: string | null) => {
	const startTime = normalizePickerTime(start);
	const endTime = normalizePickerTime(end);
	if (!startTime || !endTime) return "";
	return `${startTime} - ${endTime}`;
};

const formatMinutesLabel = (minutes: number) => {
	const normalized = Math.max(0, Math.round(minutes));
	if (normalized < 60) return `${normalized}m`;
	const hours = Math.floor(normalized / 60);
	const remainingMinutes = normalized % 60;
	return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
};

const timeToMinutes = (value?: string | null) => {
	const time = normalizePickerTime(value);
	if (!time) return null;
	const [hours, minutes] = time.split(":").map(Number);
	return hours * 60 + minutes;
};

const getSlotDurationMinutes = (start?: string | null, end?: string | null) => {
	const startMinutes = timeToMinutes(start);
	let endMinutes = timeToMinutes(end);
	if (startMinutes == null || endMinutes == null) return 0;
	if (endMinutes <= startMinutes) endMinutes += 24 * 60;
	return Math.max(0, endMinutes - startMinutes);
};

const addMinutesToTime = (value?: string | null, minutesToAdd = 60) => {
	const minutes = timeToMinutes(value);
	if (minutes == null) return "08:00";
	const nextMinutes = (minutes + minutesToAdd) % (24 * 60);
	const hours = Math.floor(nextMinutes / 60);
	const remainingMinutes = nextMinutes % 60;
	return `${String(hours).padStart(2, "0")}:${String(remainingMinutes).padStart(2, "0")}`;
};

const DEFAULT_FLEXITIME_SLOTS: RequestedScheduleTimeSlot[] = [
	{ type: "work", label: "Morning Work", startTime: "08:00", endTime: "12:00" },
	{ type: "break", label: "Break", startTime: "12:00", endTime: "13:00" },
	{ type: "work", label: "Afternoon Work", startTime: "13:00", endTime: "17:00" },
];

const normalizeShiftTimeSlots = (
	timeSlots?: Array<{
		type?: string | null;
		label?: string | null;
		startTime?: string | null;
		endTime?: string | null;
	}> | null,
): RequestedScheduleTimeSlot[] =>
	(Array.isArray(timeSlots) ? timeSlots : [])
		.map((slot) => {
			const type = String(slot?.type || "work").trim().toLowerCase() || "work";
			return {
				type,
				label:
					String(slot?.label || "").trim() ||
					(type === "break" ? "Break" : "Work Slot"),
				startTime: normalizePickerTime(slot?.startTime),
				endTime: normalizePickerTime(slot?.endTime),
			};
		})
		.filter((slot) => slot.startTime && slot.endTime);

const getShiftDefaultWindow = (shiftType?: {
	isOff?: boolean | null;
	timeSlots?: Array<{
		type?: string | null;
		startTime?: string | null;
		endTime?: string | null;
	}> | null;
}) => {
	if (!shiftType || shiftType.isOff) {
		return { startTime: "", endTime: "", slotLabel: "Off day" };
	}

	const slots = normalizeShiftTimeSlots(shiftType.timeSlots);
	const workSlots = slots.filter(
		(slot) => String(slot?.type || "").toLowerCase() === "work",
	);
	const sourceSlots = workSlots.length > 0 ? workSlots : slots;
	const firstSlot = sourceSlots.find((slot) => slot?.startTime);
	const lastSlot = [...sourceSlots].reverse().find((slot) => slot?.endTime);
	const startTime = normalizePickerTime(firstSlot?.startTime);
	const endTime = normalizePickerTime(lastSlot?.endTime);

	return {
		startTime,
		endTime,
		slotLabel: formatTimeRange(startTime, endTime) || "No time slots",
	};
};

const buildRequestedTimeSlots = (data: ScheduleChangeFormData): RequestedScheduleTimeSlot[] => {
	if (data.requestedTimeSlots?.length) {
		return normalizeShiftTimeSlots(data.requestedTimeSlots);
	}
	if (!data.manualStartTime || !data.manualEndTime) return [];
	return [
		{
			type: "work",
			label:
				data.scheduleMode === "SHIFT_TYPE"
					? data.shiftTypeName || "Work Slot"
					: "Flexitime Window",
			startTime: data.manualStartTime,
			endTime: data.manualEndTime,
		},
	];
};

const buildRequestedScheduleSnapshot = (data: ScheduleChangeFormData) => {
	const timeSlots = buildRequestedTimeSlots(data);
	const workSlots = timeSlots.filter((slot) => slot.type === "work");
	const firstWorkSlot = workSlots[0];
	const lastWorkSlot = workSlots[workSlots.length - 1];
	const isOvernight = workSlots.some((slot) => {
		const start = timeToMinutes(slot.startTime);
		const end = timeToMinutes(slot.endTime);
		return start !== null && end !== null && end <= start;
	});
	const name =
		data.shiftTypeName ||
		data.shiftTypeLabel ||
		(data.scheduleMode === "FLEXITIME" ? "Flexitime" : "Requested shift");
	const code =
		data.shiftTypeCode ||
		(data.scheduleMode === "FLEXITIME" ? "FLEXITIME" : undefined);

	return {
		source:
			data.scheduleMode === "FLEXITIME"
				? "requested_flexitime"
				: "requested_shift_copy",
		shiftTypeId: data.scheduleMode === "SHIFT_TYPE" ? data.shiftTypeId || null : null,
		shiftTypeName: name,
		shiftTypeCode: code || null,
		name,
		code: code || null,
		isOff: workSlots.length === 0,
		isOvernight,
		startTime: firstWorkSlot?.startTime || data.manualStartTime || null,
		endTime: lastWorkSlot?.endTime || data.manualEndTime || null,
		timeSlots,
	};
};

const getCurrentStepLabel = (request: Request): string =>
	request.currentStepExecution?.stepName ||
	request.lastCompletedStepExecution?.stepName ||
	"No active step";

const getStatusBadge = (status: string) => {
	const styles: Record<
		string,
		{
			variant: "default" | "success" | "secondary" | "destructive" | "warning" | "info";
			label: string;
		}
	> = {
		OPEN: { variant: "info", label: "Open" },
		PENDING: { variant: "warning", label: "Pending" },
		SUBMITTED: { variant: "default", label: "Submitted" },
		FOR_APPROVAL: { variant: "warning", label: "For Approval" },
		IN_PROCESS: { variant: "info", label: "In Process" },
		APPROVED: { variant: "success", label: "Approved" },
		COMPLETED: { variant: "success", label: "Completed" },
		REJECTED: { variant: "destructive", label: "Rejected" },
		CANCELLED: { variant: "warning", label: "Cancelled" },
	};

	return styles[status] || { variant: "default", label: status.replace(/_/g, " ") };
};

const canCancelRequest = (request: Request): boolean => {
	const state = formatRequestState(request);
	return ["OPEN", "PENDING", "FOR_APPROVAL", "SUBMITTED"].includes(state);
};

const supportsWithdrawAction = (request: Request): boolean =>
	HUB_WITHDRAW_REQUEST_TYPES.has(request.type);

const shouldUseDeleteWithdrawal = (request: Request): boolean =>
	PERSONNEL_ACTION_TYPES.has(request.type) || request.type === "RESIGNATION";

const getDismissActionLabel = (request?: Request | null): string =>
	request && supportsWithdrawAction(request) ? "Withdraw Request" : "Cancel Request";

const getDismissActionVerb = (request?: Request | null): string =>
	request && supportsWithdrawAction(request) ? "withdraw" : "cancel";

const shouldDismissCreateFlowAfterError = (error: unknown): boolean => {
	const message = error instanceof Error ? error.message : String(error || "");
	const normalizedMessage = message.toLowerCase();

	return (
		normalizedMessage.includes("already have an active") ||
		normalizedMessage.includes("already requested") ||
		normalizedMessage.includes("already exists")
	);
};

const buildHubRows = (requests: Request[]): HubRequestRow[] =>
	requests.map((request) => ({
		id: request.id,
		requestCode: request.code || request.id.slice(0, 8).toUpperCase(),
		requestTypeLabel: getRequestTypeLabel(request),
		requestTypeKey: getRequestTypeKey(request),
		descriptionText: request.description || "No description",
		submittedDate: request.createdAt || request.startDate || "",
		submittedDateLabel: formatDateLabel(request.createdAt || request.startDate),
		statusKey: formatRequestState(request),
		currentStepLabel: getCurrentStepLabel(request),
		request,
	}));

const REQUEST_TYPE_OPTIONS: Array<{
	kind: RequestCreateKind;
	label: string;
	icon: LucideIcon;
	intent?: PANIntent;
	managerOnly?: boolean;
}> = [
	{
		kind: "leave",
		label: "Leave Request",
		icon: Calendar,
	},
	{
		kind: "document",
		label: "Document Request",
		icon: FileText,
	},
	{
		kind: "schedule-change",
		label: "Schedule Change Request",
		icon: CalendarClock,
	},
	{
		kind: "attendance-adjustment",
		label: "Attendance Request",
		icon: Clock,
	},
	{
		kind: "personnel-action",
		label: "Regularization",
		icon: BadgeCheck,
		intent: "REGULARIZATION",
		managerOnly: true,
	},
	{
		kind: "personnel-action",
		label: "Promotion",
		icon: Award,
		intent: "PROMOTION",
		managerOnly: true,
	},
	{
		kind: "personnel-action",
		label: "Transfer",
		icon: Repeat,
		intent: "TRANSFER",
		managerOnly: true,
	},
	{
		kind: "resignation",
		label: "Resignation",
		icon: AlertCircle,
	},
	{
		kind: "job-requisition",
		label: "Job Requisition",
		icon: BriefcaseBusiness,
		managerOnly: true,
	},
];

function ScheduleChangeRequestModal({
	isOpen,
	onClose,
	onSubmit,
	isPending,
	initialDate,
}: {
	isOpen: boolean;
	onClose: () => void;
	onSubmit: (data: ScheduleChangeFormData) => Promise<void>;
	isPending?: boolean;
	initialDate?: string | null;
}) {
	const [formData, setFormData] = useState<ScheduleChangeFormData>({
		date: "",
		scheduleMode: "FLEXITIME",
		shiftTypeId: "",
		shiftTypeLabel: "",
		shiftTypeName: "",
		shiftTypeCode: "",
		manualStartTime: "",
		manualEndTime: "",
		reason: "",
		notes: "",
		requestedTimeSlots: DEFAULT_FLEXITIME_SLOTS,
	});
	const [submitted, setSubmitted] = useState(false);
	const dateFieldRef = useRef<HTMLDivElement | null>(null);
	const timeSlotsFieldRef = useRef<HTMLDivElement | null>(null);
	const reasonFieldRef = useRef<HTMLTextAreaElement | null>(null);
	const todayDateKey = useMemo(() => getLocalDateKey(new Date()), []);
	const { data: shiftTypesData, isLoading: isLoadingShiftTypes } = useShiftTypes(
		{ page: 1, limit: 1000, document: true, count: true },
		{ enabled: isOpen },
	);
	const shiftOptions = useMemo(
		() =>
			(shiftTypesData?.shiftTypes || [])
				.filter((shiftType) => shiftType.isActive !== false && !shiftType.isDeleted)
				.map((shiftType) => ({
					value: shiftType.id,
					label: `${shiftType.name} (${shiftType.code})`,
				})),
		[shiftTypesData?.shiftTypes],
	);
	const requestedShiftOptions = useMemo(
		() => [{ value: "FLEXITIME", label: "Flexitime" }, ...shiftOptions],
		[shiftOptions],
	);
	const requestedShiftValue =
		formData.scheduleMode === "SHIFT_TYPE" && formData.shiftTypeId
			? formData.shiftTypeId
			: "FLEXITIME";
	const selectedShift = useMemo(
		() => shiftOptions.find((option) => option.value === formData.shiftTypeId),
		[formData.shiftTypeId, shiftOptions],
	);
	const selectedShiftType = useMemo(
		() =>
			(shiftTypesData?.shiftTypes || []).find(
				(shiftType) => shiftType.id === formData.shiftTypeId,
			),
		[formData.shiftTypeId, shiftTypesData?.shiftTypes],
	);
	const selectedShiftWindow = useMemo(
		() => getShiftDefaultWindow(selectedShiftType),
		[selectedShiftType],
	);
	const selectedShiftTimeSlots = useMemo(
		() => normalizeShiftTimeSlots(selectedShiftType?.timeSlots),
		[selectedShiftType],
	);
	const flexitimeActive = formData.scheduleMode === "FLEXITIME";
	const slotsEditable = true;
	const editableSourceSlots = useMemo(
		() =>
			normalizeShiftTimeSlots(formData.requestedTimeSlots).length
				? normalizeShiftTimeSlots(formData.requestedTimeSlots)
				: formData.scheduleMode === "SHIFT_TYPE" && selectedShiftTimeSlots.length
					? selectedShiftTimeSlots
					: DEFAULT_FLEXITIME_SLOTS,
		[formData.requestedTimeSlots, formData.scheduleMode, selectedShiftTimeSlots],
	);
	const requestedTimeSlots = useMemo(
		() =>
			buildRequestedTimeSlots({
				...formData,
				requestedTimeSlots: editableSourceSlots,
			}),
		[editableSourceSlots, formData],
	);
	const requestedWorkSlots = requestedTimeSlots.filter((slot) => slot.type === "work");
	const requestedBreakSlots = requestedTimeSlots.filter((slot) => slot.type === "break");
	const requestedBreakMinutes = requestedBreakSlots.reduce(
		(total, slot) => total + getSlotDurationMinutes(slot.startTime, slot.endTime),
		0,
	);
	const requestedWorkMinutes = requestedWorkSlots.reduce(
		(total, slot) => total + getSlotDurationMinutes(slot.startTime, slot.endTime),
		0,
	);
	const requestedWindowLabel =
		requestedWorkSlots.length > 0
			? formatTimeRange(
					requestedWorkSlots[0]?.startTime,
					requestedWorkSlots[requestedWorkSlots.length - 1]?.endTime,
				)
			: selectedShiftWindow.slotLabel;
	const errors = {
		date: !formData.date || formData.date < todayDateKey,
		timeSlots: requestedWorkSlots.length === 0,
		reason: !formData.reason.trim(),
	};

	useEffect(() => {
		if (!isOpen) return;
		setFormData({
			date: initialDate || "",
			scheduleMode: "FLEXITIME",
			shiftTypeId: "",
			shiftTypeLabel: "",
			shiftTypeName: "",
			shiftTypeCode: "",
			manualStartTime: "",
			manualEndTime: "",
			reason: "",
			notes: "",
			requestedTimeSlots: DEFAULT_FLEXITIME_SLOTS,
		});
		setSubmitted(false);
	}, [initialDate, isOpen]);

	const updateField = (key: keyof ScheduleChangeFormData, value: string) => {
		setFormData((current) => ({ ...current, [key]: value }));
	};

	const handleShiftChange = (value: string) => {
		if (value === "FLEXITIME") {
			setFormData((current) => ({
				...current,
				scheduleMode: "FLEXITIME",
				shiftTypeId: "",
				shiftTypeLabel: "Flexitime",
				shiftTypeName: "Flexitime",
				shiftTypeCode: "FLEXITIME",
				requestedTimeSlots: current.requestedTimeSlots?.length
					? current.requestedTimeSlots
					: DEFAULT_FLEXITIME_SLOTS,
			}));
			return;
		}

		const option = shiftOptions.find((item) => item.value === value);
		const shiftType = (shiftTypesData?.shiftTypes || []).find(
			(item) => item.id === value,
		);
		const defaultWindow = getShiftDefaultWindow(shiftType);
		setFormData((current) => ({
			...current,
			scheduleMode: "SHIFT_TYPE",
			shiftTypeId: value,
			shiftTypeLabel: option?.label || "",
			shiftTypeName: shiftType?.name || "",
			shiftTypeCode: shiftType?.code || "",
			manualStartTime: defaultWindow.startTime,
			manualEndTime: defaultWindow.endTime,
			requestedTimeSlots: normalizeShiftTimeSlots(shiftType?.timeSlots),
		}));
	};

	const updateFlexitimeSlot = (
		index: number,
		key: keyof RequestedScheduleTimeSlot,
		value: string,
	) => {
		setFormData((current) => {
			const slots = normalizeShiftTimeSlots(current.requestedTimeSlots);
			const nextSlots = slots.length ? slots : DEFAULT_FLEXITIME_SLOTS;
			return {
				...current,
				requestedTimeSlots: nextSlots.map((slot, slotIndex) =>
					slotIndex === index
						? {
								...slot,
								[key]:
									key === "type"
										? value === "break"
											? "break"
											: "work"
										: value,
							}
						: slot,
				),
			};
		});
	};

	const appendFlexitimeSlot = (type: "work" | "break") => {
		setFormData((current) => {
			const slots = normalizeShiftTimeSlots(current.requestedTimeSlots);
			const nextSlots = slots.length ? slots : DEFAULT_FLEXITIME_SLOTS;
			const lastSlot = nextSlots[nextSlots.length - 1];
			const startTime = addMinutesToTime(lastSlot?.endTime, 0);
			return {
				...current,
				requestedTimeSlots: [
					...nextSlots,
					{
						type,
						label: type === "break" ? "Break" : "Work Slot",
						startTime,
						endTime: addMinutesToTime(startTime, type === "break" ? 60 : 240),
					},
				],
			};
		});
	};

	const removeFlexitimeSlot = (index: number) => {
		setFormData((current) => {
			const nextSlots = normalizeShiftTimeSlots(current.requestedTimeSlots).filter(
				(_, slotIndex) => slotIndex !== index,
			);
			return {
				...current,
				requestedTimeSlots: nextSlots.length ? nextSlots : DEFAULT_FLEXITIME_SLOTS,
			};
		});
	};

	const handleSubmit = async () => {
		setSubmitted(true);
		if (errors.date || errors.timeSlots || errors.reason) {
			window.setTimeout(() => {
				const target = errors.date
					? dateFieldRef.current
					: errors.timeSlots
						? timeSlotsFieldRef.current
						: reasonFieldRef.current;
				target?.scrollIntoView({ behavior: "smooth", block: "center" });
				target?.focus({ preventScroll: true });
			}, 0);
			return;
		}
		const firstWorkSlot = requestedWorkSlots[0];
		const lastWorkSlot = requestedWorkSlots[requestedWorkSlots.length - 1];
		await onSubmit({
			...formData,
			shiftTypeLabel: selectedShift?.label || formData.shiftTypeLabel,
			shiftTypeName: selectedShiftType?.name || formData.shiftTypeName,
			shiftTypeCode: selectedShiftType?.code || formData.shiftTypeCode,
			manualStartTime: firstWorkSlot?.startTime || formData.manualStartTime,
			manualEndTime: lastWorkSlot?.endTime || formData.manualEndTime,
			requestedTimeSlots,
			reason: formData.reason.trim(),
			notes: formData.notes?.trim() || undefined,
		});
	};

	return (
		<Modal
			open={isOpen}
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
			title="Schedule Change Request"
			className="max-h-[88vh] sm:max-w-[1040px]">
			<div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_340px]">
				<div className="min-w-0 space-y-4">
					<div className="grid gap-4 md:grid-cols-2">
						<div ref={dateFieldRef} tabIndex={-1} className="outline-none">
							<label className="mb-1.5 block text-sm font-medium text-gray-700">
								Date
							</label>
							<CalendarDatePicker
								value={formData.date}
								onChange={(value) => updateField("date", value)}
								minDate={new Date(`${todayDateKey}T00:00:00`)}
								className={submitted && errors.date ? "border-red-300" : ""}
							/>
							{submitted && errors.date && (
								<p className="mt-1 text-xs text-red-600">
									Select today or a future date.
								</p>
							)}
						</div>
						<div>
							<label className="mb-1.5 block text-sm font-medium text-gray-700">
								Schedule Option
							</label>
							<Select
								options={requestedShiftOptions}
								value={requestedShiftValue}
								onChange={handleShiftChange}
								placeholder={
									isLoadingShiftTypes ? "Loading shifts..." : "Select option"
								}
								disabled={isLoadingShiftTypes}
							/>
						</div>
					</div>

				<div
					ref={timeSlotsFieldRef}
					tabIndex={-1}
					className={`overflow-hidden rounded-lg border ${
						submitted && errors.timeSlots ? "border-red-300" : "border-gray-200"
					}`}>
					<div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2">
						<p className="text-xs font-medium text-gray-900">Time Slots</p>
						{slotsEditable ? (
							<div className="flex flex-wrap items-center gap-1.5">
								<Button
									type="button"
									variant="outline"
									size="sm"
									className="h-7 gap-1 px-2 text-xs"
									onClick={() => appendFlexitimeSlot("work")}>
									<Plus className="h-3 w-3" />
									Work Slot
								</Button>
								<Button
									type="button"
									variant="outline"
									size="sm"
									className="h-7 gap-1 px-2 text-xs"
									onClick={() => appendFlexitimeSlot("break")}>
									<Plus className="h-3 w-3" />
									Break Slot
								</Button>
							</div>
						) : null}
					</div>
					<div className="max-h-[390px] space-y-2 overflow-y-auto bg-white p-2.5 modern-scroll">
						{requestedTimeSlots.map((slot, index) => (
							<div
								key={`${slot.type}-${slot.startTime}-${slot.endTime}-${index}`}
								className="rounded-md border border-gray-200 bg-gray-50/60 p-2">
								<div className="grid gap-2 lg:grid-cols-[112px_minmax(0,1fr)_104px_104px_32px] lg:items-start">
									<div>
										<label className="mb-1 block text-[11px] font-medium text-gray-500">
											Type
										</label>
										{slotsEditable ? (
											<Select
												options={[
													{ value: "work", label: "WORK" },
													{ value: "break", label: "BREAK" },
												]}
												value={slot.type}
												onChange={(value) =>
													updateFlexitimeSlot(index, "type", value || "work")
												}
											/>
										) : (
											<Input
												value={slot.type === "break" ? "BREAK" : "WORK"}
												disabled
												readOnly
												className="bg-white font-medium"
											/>
										)}
									</div>
									<div>
										<label className="mb-1 block text-[11px] font-medium text-gray-500">
											Label
										</label>
										<Input
											value={slot.label}
											onChange={(event) =>
												updateFlexitimeSlot(index, "label", event.target.value)
											}
											placeholder="Label"
											disabled={!slotsEditable}
											readOnly={!slotsEditable}
											className={!slotsEditable ? "bg-white" : ""}
										/>
									</div>
									<div>
										<label className="mb-1 block text-[11px] font-medium text-gray-500">
											Start
										</label>
										<TimePicker
											className={`w-full whitespace-nowrap ${
												!slotsEditable ? "bg-white" : ""
											}`}
											value={slot.startTime}
											onChange={(value) =>
												updateFlexitimeSlot(index, "startTime", value)
											}
											disabled={!slotsEditable}
										/>
									</div>
									<div>
										<label className="mb-1 block text-[11px] font-medium text-gray-500">
											End
										</label>
										<TimePicker
											className={`w-full whitespace-nowrap ${
												!slotsEditable ? "bg-white" : ""
											}`}
											value={slot.endTime}
											onChange={(value) =>
												updateFlexitimeSlot(index, "endTime", value)
											}
											disabled={!slotsEditable}
										/>
									</div>
									<div className="flex items-end lg:h-[60px]">
										{slotsEditable ? (
											<Button
												type="button"
												variant="ghost"
												size="sm"
												className="h-9 w-9 px-0 text-gray-500 hover:text-red-600"
												onClick={() => removeFlexitimeSlot(index)}>
												<Trash2 className="h-4 w-4" />
											</Button>
										) : null}
									</div>
								</div>
							</div>
						))}
					</div>
				</div>
				{submitted && errors.timeSlots && (
					<p className="-mt-2 text-xs text-red-600">
						Add at least one work slot with start and end time.
					</p>
				)}
				</div>

				<div className="min-w-0 space-y-4">
				{(selectedShift || formData.scheduleMode === "FLEXITIME") && (
					<div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700">
						<div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
							<div className="min-w-0">
								<div className="text-[11px] font-medium text-gray-500">Requested</div>
								<div className="mt-0.5 truncate font-medium text-gray-900">
									{selectedShift?.label || "Flexitime"}
								</div>
							</div>
							<div>
								<div className="text-[11px] font-medium text-gray-500">Window</div>
								<div className="mt-0.5 font-medium text-gray-900">
									{requestedWindowLabel || "No work slot"}
								</div>
							</div>
							<div>
								<div className="text-[11px] font-medium text-gray-500">Break</div>
								<div className="mt-0.5 font-medium text-gray-900">
									{requestedBreakMinutes > 0
										? formatMinutesLabel(requestedBreakMinutes)
										: "No break"}
								</div>
							</div>
						</div>
						{requestedTimeSlots.length > 0 ? (
							<div className="mt-3 overflow-hidden rounded-md border border-gray-200 bg-white">
								{requestedTimeSlots.map((slot, index) => (
									<div
										key={`${slot.type}-${slot.startTime}-${slot.endTime}-${index}`}
										className="grid grid-cols-[78px_minmax(0,1fr)_88px] items-center gap-2 border-b border-gray-100 px-2.5 py-2 last:border-b-0">
										<span className="text-[11px] font-semibold uppercase text-gray-500">
											{slot.type === "break" ? "Break" : "Work"}
										</span>
										<span className="min-w-0 truncate text-gray-800">
											{slot.label}
										</span>
										<span className="text-right font-mono text-[11px] text-gray-700">
											{formatTimeRange(slot.startTime, slot.endTime)}
										</span>
									</div>
								))}
							</div>
						) : null}
						<div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-500">
							<span>
								Work:{" "}
								{requestedWorkMinutes > 0
									? formatMinutesLabel(requestedWorkMinutes)
									: "--"}
							</span>
							<span>
								{flexitimeActive
									? "Flexitime is reviewed by HR before the schedule is updated."
									: "Selected shift was copied; edits apply only to this date after approval."}
							</span>
						</div>
					</div>
				)}

				<div>
					<label className="mb-1.5 block text-sm font-medium text-gray-700">
						Reason
					</label>
					<textarea
						ref={reasonFieldRef}
						value={formData.reason}
						onChange={(event) => updateField("reason", event.target.value)}
						placeholder="Why do you need this schedule?"
						className={`min-h-[96px] w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100 ${
							submitted && errors.reason ? "border-red-300" : "border-gray-300"
						}`}
					/>
					{submitted && errors.reason && (
						<p className="mt-1 text-xs text-red-600">Add a short reason.</p>
					)}
				</div>

				<div>
					<label className="mb-1.5 block text-sm font-medium text-gray-700">
						Note
					</label>
					<Input
						value={formData.notes || ""}
						onChange={(event) => updateField("notes", event.target.value)}
						placeholder="Optional details"
					/>
				</div>
				</div>
			</div>
			<div className="mt-5 flex justify-end gap-3 border-t border-gray-100 pt-4">
				<Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
					Cancel
				</Button>
				<Button type="button" onClick={handleSubmit} disabled={isPending}>
					{isPending ? "Submitting..." : "Submit Request"}
				</Button>
			</div>
		</Modal>
	);
}

export default function EmployeeRequestsHubPage() {
	const { user } = useAuth();
	const [searchParams, setSearchParams] = useSearchParams();
	const employeeId = user?.metadata?.employee?.id || "";
	const organizationId =
		user?.organizationId ||
		user?.organization?.id ||
		(user?.metadata as { employee?: { organizationId?: string } } | undefined)?.employee
			?.organizationId ||
		"";
	const leaveRequestPrefill = getLeaveRequestPrefillFromSearchParams(searchParams);
	const action = searchParams.get("action");
	const activeRequestId = action === "view" ? searchParams.get("id") || "" : "";
	const createKind = useMemo(() => {
		const kind = searchParams.get("kind") as RequestCreateKind | null;
		const type = String(searchParams.get("type") || "").trim().toLowerCase();
		if (kind) return kind;
		if (type === "schedule-change" || type === "schedule_change") {
			return "schedule-change";
		}
		if (
			type === "attendance-adjustment" ||
			type === "attendance_correction" ||
			type === "attendance-correction"
		) {
			return "attendance-adjustment";
		}
		return null;
	}, [searchParams]);
	const personnelIntent = searchParams.get("intent")?.toUpperCase();
	const personnelStep = Number(searchParams.get("panStep") || "1");
	const personnelInitialStep = Number.isFinite(personnelStep)
		? Math.max(0, Math.min(4, personnelStep - 1))
		: 0;
	const targetEmployeeId = searchParams.get("targetEmployeeId") || "";
	const userRole = String(user?.role || user?.metadata?.employee?.role || "")
		.trim()
		.toLowerCase();
	const actionBlock = getEmployeeActionBlock(user?.metadata?.employee);
	const isHrOrAdmin = [
		"hris-admin",
		"hris-hr-manager",
		"hris-hr-user",
		"admin",
		"super_admin",
		"superadmin",
	].includes(userRole);
	const isDepartmentManager = !!user?.metadata?.employee?.isDepartmentManager;
	const hasManagerMarker =
		userRole === "hris-employee-manager" ||
		hasManagerProfileFlag(user?.metadata?.employee as any);
	const managerDepartmentId = user?.metadata?.employee?.department?.id || "";
	const managerDepartmentName = user?.metadata?.employee?.department?.name || "Department";
	const { data: directReportsData } = useEmployees(
		employeeId && !isHrOrAdmin
			? {
					page: 1,
					limit: 1,
					count: true,
					filter: { reportToId: employeeId },
				}
			: undefined,
		{ enabled: Boolean(employeeId && !isHrOrAdmin) },
	);
	const directReportCount = Number(
		(directReportsData as any)?.pagination?.total ??
			(directReportsData as any)?.total ??
			(directReportsData as any)?.count ??
			((directReportsData as any)?.employees || (directReportsData as any)?.data || [])
				.length ??
			0,
	);
	const canCreateManagerPan = isHrOrAdmin || hasManagerMarker || directReportCount > 0;

	// Line-leader on-behalf filing: fetch sections this employee leads and their
	// active members so the overtime form can offer a "For whom" picker.
	const isLineLeader = userRole === "hris-line-leader";
	const { data: ledMembersData } = useQuery({
		queryKey: ["section-led-members", employeeId],
		queryFn: () => sectionsService.getLedMembers(),
		enabled: isLineLeader && Boolean(employeeId),
		staleTime: 60_000,
	});
	const onBehalfOptions = useMemo(() => {
		if (!isLineLeader || !employeeId) return null;
		const options = [{ id: employeeId, label: "Myself", isSelf: true }];
		for (const member of ledMembersData?.members || []) {
			if (member.id === employeeId) continue;
			const info = member.person?.personalInfo || {};
			const name = [info.firstName, info.lastName].filter(Boolean).join(" ").trim();
			const label = name
				? `${name} (${member.employeeId})`
				: String(member.employeeId || member.id);
			options.push({ id: member.id, label, isSelf: false });
		}
		return options;
	}, [employeeId, isLineLeader, ledMembersData?.members]);

	const [cancelTarget, setCancelTarget] = useState<Request | null>(null);

	const { data: requestsData, isLoading } = useRequests({
		page: 1,
		limit: 100,
		count: true,
		sort: "createdAt",
		order: "desc",
		filter: {
			requesterId: employeeId,
		},
	});

	const requests = useMemo(
		() => ((requestsData as any)?.requests || []) as Request[],
		[requestsData],
	);
	const rows = useMemo(() => buildHubRows(requests), [requests]);
	const requestTypeFilters = useMemo(() => {
		const seen = new Map<string, string>();
		rows.forEach((row) => {
			if (!seen.has(row.requestTypeKey)) {
				seen.set(row.requestTypeKey, row.requestTypeLabel);
			}
		});

		return Array.from(seen.entries()).map(([value, label]) => ({ value, label }));
	}, [rows]);

	const filters = useMemo<FilterOption[]>(
		() => [
			{
				key: "requestTypeKey",
				label: "Request Type",
				options: requestTypeFilters,
			},
			{
				key: "statusKey",
				label: "Status",
				options: Array.from(new Set(rows.map((row) => row.statusKey))).map((value) => ({
					value,
					label: getStatusBadge(value).label,
				})),
			},
		],
		[requestTypeFilters, rows],
	);

	const { data: activeRequest, isLoading: isLoadingRequest } = useRequest(activeRequestId, {
		fields: REQUEST_DETAIL_FIELDS,
	});

	const createRequestMutation = useCreateRequest();
	const cancelRequestMutation = useCancelRequest();
	const deleteRequestMutation = useDeleteRequest();

	const updateSearchParams = (mutator: (next: URLSearchParams) => void) => {
		setSearchParams((prev) => {
			const next = new URLSearchParams(prev);
			mutator(next);
			return next;
		});
	};

	const clearCreateParams = () => {
		updateSearchParams((next) => {
			next.delete("action");
			next.delete("kind");
			next.delete("type");
			next.delete("date");
			next.delete(REQUEST_ROUTE_START_DATE_PARAM);
			next.delete(REQUEST_ROUTE_END_DATE_PARAM);
			next.delete(REQUEST_ROUTE_LEAVE_TYPE_PARAM);
			next.delete("shiftTypeId");
			next.delete("targetEmployeeId");
			next.delete("intent");
			next.delete("panStep");
		});
	};

	const clearViewParams = () => {
		updateSearchParams((next) => {
			next.delete("action");
			next.delete("id");
		});
	};

	const handleOpenCreate = () => {
		if (actionBlock.blocked) {
			toast.error(actionBlock.message);
			return;
		}
		updateSearchParams((next) => {
			next.set("action", "create");
			next.delete("kind");
			next.delete("type");
			next.delete("date");
			next.delete("shiftTypeId");
			next.delete("targetEmployeeId");
			next.delete("intent");
			next.delete("panStep");
		});
	};

	const handleChooseCreateKind = (kind: RequestCreateKind, intent?: PANIntent) => {
		if (actionBlock.blocked) {
			toast.error(actionBlock.message);
			return;
		}
		updateSearchParams((next) => {
			next.set("action", "create");
			next.set("kind", kind);
			if (kind === "schedule-change") {
				next.set("type", "schedule-change");
			} else if (kind === "attendance-adjustment") {
				next.set("type", "attendance-adjustment");
			} else {
				next.delete("type");
			}
			if (intent) {
				next.set("intent", intent);
			} else {
				next.delete("intent");
			}
			if (kind === "personnel-action") {
				next.set("panStep", "1");
			} else {
				next.delete("panStep");
			}
		});
	};

	const handleViewRequest = (row: HubRequestRow) => {
		updateSearchParams((next) => {
			next.set("action", "view");
			next.set("id", row.id);
		});
	};

	const handleOpenCancel = (row: HubRequestRow) => {
		setCancelTarget(row.request);
	};

	const handleCloseCancel = () => setCancelTarget(null);

	const handleConfirmCancel = async () => {
		if (!cancelTarget) return;

		try {
			if (shouldUseDeleteWithdrawal(cancelTarget)) {
				await deleteRequestMutation.mutateAsync({
					id: cancelTarget.id,
					successMessage: "Request withdrawn successfully",
					errorMessage: "Failed to withdraw request",
				});
			} else {
				await cancelRequestMutation.mutateAsync({
					id: cancelTarget.id,
					successMessage: supportsWithdrawAction(cancelTarget)
						? "Request withdrawn successfully"
						: "Request cancelled successfully",
					errorMessage: supportsWithdrawAction(cancelTarget)
						? "Failed to withdraw request"
						: "Failed to cancel request",
				});
			}
			handleCloseCancel();
		} catch (error) {
			// Mutation hooks already toast errors.
		}
	};

	const handleCreateLeave = async (data: {
		leaveType: string;
		startDate: string;
		endDate: string;
		durationUnit: "FULL_DAY" | "HALF_DAY";
		halfDaySession?: "AM" | "PM";
		totalDays: number;
		description: string;
		notes?: string;
	}) => {
		if (actionBlock.blocked) {
			toast.error(actionBlock.message);
			clearCreateParams();
			return;
		}
		if (!employeeId || !organizationId) {
			toast.error("Employee context is missing. Please refresh and try again.");
			return;
		}

		try {
			await createRequestMutation.mutateAsync({
				requesterId: employeeId,
				organizationId,
				type: "LEAVE",
				description: data.description,
				startDate: data.startDate || undefined,
				endDate: data.endDate || undefined,
				notes: data.notes || undefined,
				metadata: {
					leaveType: data.leaveType,
					startDate: data.startDate,
					endDate: data.endDate,
					totalDays: data.totalDays,
					durationUnit: data.durationUnit,
					...(data.durationUnit === "HALF_DAY" && data.halfDaySession
						? { halfDaySession: data.halfDaySession }
						: {}),
				},
			});
			clearCreateParams();
		} catch (error) {
			if (shouldDismissCreateFlowAfterError(error)) {
				clearCreateParams();
			}
		}
	};

	const handleCreateDocument = async (data: DocumentRequestData) => {
		if (actionBlock.blocked) {
			toast.error(actionBlock.message);
			clearCreateParams();
			return;
		}
		if (!employeeId || !organizationId) {
			toast.error("Employee context is missing. Please refresh and try again.");
			return;
		}

		try {
			await createRequestMutation.mutateAsync({
				requesterId: employeeId,
				organizationId,
				type: "DOCUMENT_REQUEST",
				description: data.description,
				notes: data.notes || undefined,
				metadata: {
					documentType: data.documentType,
					...(data.year ? { year: data.year } : {}),
				},
			});
			clearCreateParams();
		} catch (error) {
			if (shouldDismissCreateFlowAfterError(error)) {
				clearCreateParams();
			}
		}
	};

	const handleCreateScheduleChange = async (data: ScheduleChangeFormData) => {
		if (actionBlock.blocked) {
			toast.error(actionBlock.message);
			clearCreateParams();
			return;
		}
		if (!employeeId || !organizationId) {
			toast.error("Employee context is missing. Please refresh and try again.");
			return;
		}

		try {
			const requestedTimeSlots = buildRequestedTimeSlots(data);
			const requestedScheduleSnapshot = buildRequestedScheduleSnapshot({
				...data,
				requestedTimeSlots,
			});
			await createRequestMutation.mutateAsync({
				requesterId: employeeId,
				organizationId,
				type: "SCHEDULE_CHANGE",
				description: data.reason,
				startDate: data.date || undefined,
				endDate: data.date || undefined,
				notes: data.notes || undefined,
				metadata: {
					effectiveDate: data.date,
					requestedDate: data.date,
					requestMode: data.scheduleMode,
					...(data.scheduleMode === "SHIFT_TYPE"
						? {
								shiftTypeId: data.shiftTypeId,
								shiftTypeName: data.shiftTypeName || data.shiftTypeLabel,
								shiftTypeCode: data.shiftTypeCode,
							}
						: {}),
					manualStartTime: data.manualStartTime || undefined,
					manualEndTime: data.manualEndTime || undefined,
					requestedTimeSlots,
					requestedScheduleSnapshot,
					scheduleName: data.shiftTypeLabel,
					newSchedule: data.shiftTypeLabel,
					reason: data.reason,
					requestSource: "EMPLOYEE_SELF_SERVICE",
				},
			});
			clearCreateParams();
		} catch (error) {
			if (shouldDismissCreateFlowAfterError(error)) {
				clearCreateParams();
			}
		}
	};

	const handleCreateAttendanceAdjustment = async (data: AttendanceTimeRequestFormValues) => {
		if (actionBlock.blocked) {
			toast.error(actionBlock.message);
			clearCreateParams();
			return;
		}
		if (!employeeId || !organizationId) {
			toast.error("Employee context is missing. Please refresh and try again.");
			return;
		}

		const payload =
			data.requestKind === "OVERTIME"
				? buildOvertimeRequestPayload({
						// The OT is FOR the selected member (or the actor when filing
						// for self); on-behalf keeps the leader as requester and the
						// backend routes the leader-filed manager→HR chain.
						employeeId: data.memberEmployeeId || employeeId,
						organizationId,
						date: data.date,
						overtimeHourPart: data.overtimeHourPart,
						overtimeMinutePart: data.overtimeMinutePart,
						notes: data.notes,
						...(data.memberEmployeeId && data.memberEmployeeId !== employeeId
							? {
									onBehalf: {
										requesterEmployeeId: employeeId,
										filedByRole: userRole || "hris-line-leader",
									},
								}
							: {}),
					})
				: buildAttendanceAdjustmentRequestPayload({
						// The adjustment is FOR the selected member (or the actor when
						// filing for self); on-behalf keeps the leader as requester and
						// the backend routes the leader-filed manager-final chain
						// (2026-09-09 requirement).
						employeeId: data.memberEmployeeId || employeeId,
						organizationId,
						date: data.date,
						timeIn: data.timeIn,
						timeOut: data.timeOut,
						reasonCategory: data.reasonCategory,
						notes: data.notes,
						attendanceId: searchParams.get("attendanceId"),
						adjustmentKind: data.adjustmentKind,
						...(data.memberEmployeeId && data.memberEmployeeId !== employeeId
							? {
									onBehalf: {
										requesterEmployeeId: employeeId,
										filedByRole: userRole || "hris-line-leader",
									},
								}
							: {}),
					});
		await createRequestMutation.mutateAsync(payload);
		clearCreateParams();
	};

	const handleCreateJobRequisition = async (data: {
		positionId: string;
		sectionId?: string | null;
		levelId?: string | null;
		requestedHeadcount: number;
		justification: string;
		jobType?: string;
		jobLocation?: string;
		jobTags?: string[];
		jobDescription?: string;
		workflowCode?: string;
		description: string;
	}) => {
		if (actionBlock.blocked) {
			toast.error(actionBlock.message);
			clearCreateParams();
			return;
		}
		if (!employeeId || !organizationId || !managerDepartmentId) {
			toast.error("Department manager context is missing. Please refresh and try again.");
			return;
		}

		try {
			await createRequestMutation.mutateAsync({
				requesterId: employeeId,
				organizationId,
				type: "OTHER",
				description: data.description,
				startDate: new Date().toISOString(),
				endDate: new Date().toISOString(),
				metadata: {
					requestSubtype: "DEPARTMENT_JOB_REQUISITION",
					...(data.workflowCode ? { workflowCode: data.workflowCode } : {}),
					requisition: {
						departmentId: managerDepartmentId,
						...(data.sectionId ? { sectionId: data.sectionId } : {}),
						positionId: data.positionId,
						...(data.levelId ? { levelId: data.levelId } : {}),
						requestedHeadcount: data.requestedHeadcount,
						justification: data.justification,
						...(data.jobType ? { jobType: data.jobType } : {}),
						...(data.jobLocation ? { jobLocation: data.jobLocation } : {}),
						...(data.jobTags?.length ? { jobTags: data.jobTags } : {}),
						...(data.jobDescription ? { jobDescription: data.jobDescription } : {}),
					},
				},
			});
			clearCreateParams();
		} catch (error) {
			if (shouldDismissCreateFlowAfterError(error)) {
				clearCreateParams();
			}
		}
	};

	useEffect(() => {
		if (action === "create" && actionBlock.blocked) {
			clearCreateParams();
		}
	}, [action, actionBlock.blocked]);

	useEffect(() => {
		if (action !== "create") return;
		if (createKind) return;
		if (!targetEmployeeId) return;

		updateSearchParams((next) => {
			next.set("kind", "personnel-action");
		});
	}, [action, createKind, targetEmployeeId]);

	useEffect(() => {
		if (action !== "create" || createKind !== "job-requisition") return;
		if (isDepartmentManager) return;
		clearCreateParams();
	}, [action, createKind, isDepartmentManager]);

	const columns = useMemo<Column<HubRequestRow>[]>(
		() => [
			{
				key: "requestCode",
				label: "Request Code",
				width: "170px",
				sortable: true,
				render: (value) => (
					<span className="font-mono text-sm font-medium text-gray-900">
						{String(value)}
					</span>
				),
			},
			{
				key: "requestTypeLabel",
				label: "Request Type",
				width: "220px",
				sortable: true,
				render: (_value, item) => {
					const Icon = getRequestTypeIcon(item.request);

					return (
						<div className="flex items-center gap-3">
							<div className="flex h-9 w-9 items-center justify-center rounded-full border border-orange-100 bg-orange-50">
								<Icon className="h-4 w-4 text-orange-600" />
							</div>
							<div className="min-w-0">
								<div className="truncate text-sm font-medium text-gray-900">
									{item.requestTypeLabel}
								</div>
								<div className="truncate text-xs text-gray-500">
									{item.descriptionText}
								</div>
							</div>
						</div>
					);
				},
			},
			{
				key: "submittedDate",
				label: "Submitted Date",
				width: "160px",
				sortable: true,
				render: (_value, item) => (
					<span className="text-sm text-gray-700">{item.submittedDateLabel}</span>
				),
			},
			{
				key: "statusKey",
				label: "Status",
				width: "140px",
				sortable: true,
				render: (value) => {
					const badge = getStatusBadge(String(value));
					return (
						<Badge variant={badge.variant} className="whitespace-nowrap">
							{badge.label}
						</Badge>
					);
				},
			},
			{
				key: "currentStepLabel",
				label: "Current Step",
				width: "220px",
				sortable: true,
				render: (value) => (
					<span className="block truncate text-sm text-gray-700">
						{String(value || "-")}
					</span>
				),
			},
		],
		[],
	);

	const renderActions = (row: HubRequestRow) => (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="outline"
					size="sm"
					className="flex h-8 w-8 items-center justify-center p-0">
					<MoreVertical className="h-4 w-4" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-48">
				<DropdownMenuItem onClick={() => handleViewRequest(row)}>
					<Eye className="mr-2 h-4 w-4" />
					View Request
				</DropdownMenuItem>
				{canCancelRequest(row.request) && (
					<>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							onClick={() => handleOpenCancel(row)}
							className="text-red-600 focus:bg-red-50 focus:text-red-600">
							<XCircle className="mr-2 h-4 w-4" />
							{getDismissActionLabel(row.request)}
						</DropdownMenuItem>
					</>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);

	return (
		<div className="space-y-6">
			{actionBlock.blocked && (
				<div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
					<AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
					<div>
						<div className="font-semibold">Request creation is blocked</div>
						<p className="mt-1 text-xs leading-5 text-amber-800">
							{actionBlock.message}
						</p>
					</div>
				</div>
			)}
			<DataTable
				title="My Requests"
				description=""
				data={rows}
				columns={columns}
				filters={filters}
				searchFields={[
					"requestCode",
					"requestTypeLabel",
					"descriptionText",
					"currentStepLabel",
				]}
				renderActions={renderActions}
				isLoading={isLoading}
				emptyMessage="No requests found"
				emptyDescription="Your submitted requests will appear here."
				searchWidth="w-80"
				itemsPerPage={10}
				onAdd={actionBlock.blocked ? undefined : handleOpenCreate}
				addButtonLabel="New Request"
			/>

			<RequestReviewModal
				variant="compact"
				hideEmployeeProfile
				open={action === "view"}
				onOpenChange={(open) => {
					if (!open) {
						clearViewParams();
					}
				}}
				request={activeRequest || null}
				topContent={
					isLoadingRequest ? (
						<div className="flex items-center justify-center py-8">
							<div className="text-gray-500">Loading request details...</div>
						</div>
					) : null
				}
				customActions={
					activeRequest && canCancelRequest(activeRequest) ? (
						<Button
							type="button"
							variant="outline"
							onClick={() => setCancelTarget(activeRequest)}
							disabled={
								cancelRequestMutation.isPending || deleteRequestMutation.isPending
							}
							className="border-red-600 text-red-500 hover:bg-red-50 hover:text-red-600">
							{getDismissActionLabel(activeRequest)}
						</Button>
					) : null
				}
			/>

			<Modal
				open={!!cancelTarget}
				onOpenChange={(open) => {
					if (!open) handleCloseCancel();
				}}
				title={getDismissActionLabel(cancelTarget)}
				description={`Are you sure you want to ${getDismissActionVerb(cancelTarget)} this request? This action cannot be undone.`}
				className="max-w-md">
				<div className="flex justify-end gap-3 pt-4">
					<Button variant="outline" onClick={handleCloseCancel}>
						Back
					</Button>
					<Button
						variant="destructive"
						onClick={handleConfirmCancel}
						disabled={
							cancelRequestMutation.isPending || deleteRequestMutation.isPending
						}>
						{cancelRequestMutation.isPending || deleteRequestMutation.isPending
							? `${getDismissActionVerb(cancelTarget)}ing...`
							: getDismissActionLabel(cancelTarget)}
					</Button>
				</div>
			</Modal>

			<Dialog
				open={action === "create" && !createKind}
				onOpenChange={(open) => {
					if (!open) {
						clearCreateParams();
					}
				}}>
				<DialogContent className="sm:max-w-[640px]">
					<DialogHeader>
						<DialogTitle>New Request</DialogTitle>
					</DialogHeader>
					<div className="grid gap-3 md:grid-cols-3">
						{REQUEST_TYPE_OPTIONS.filter((option) =>
							option.kind === "job-requisition"
								? isDepartmentManager
								: option.managerOnly
									? canCreateManagerPan
									: true,
						).map((option) => {
							const Icon = option.icon;
							return (
								<button
									key={`${option.kind}-${option.intent || option.label}`}
									type="button"
									onClick={() =>
										handleChooseCreateKind(option.kind, option.intent)
									}
									className="rounded-2xl border border-gray-200 bg-white p-4 text-left transition-colors hover:border-orange-300 hover:bg-orange-50">
									<div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-orange-100 bg-orange-50">
										<Icon className="h-5 w-5 text-orange-600" />
									</div>
									<div className="text-sm font-semibold text-gray-900">
										{option.label}
									</div>
								</button>
							);
						})}
					</div>
				</DialogContent>
			</Dialog>

			<LeaveRequestModal
				key={
					leaveRequestPrefill.honorPrefilledDates
						? `leave-prefill-${leaveRequestPrefill.initialStartDate}`
						: "leave-create"
				}
				isOpen={action === "create" && createKind === "leave"}
				onClose={clearCreateParams}
				onSubmit={handleCreateLeave}
				isPending={createRequestMutation.isPending}
				initialLeaveType={leaveRequestPrefill.initialLeaveType}
				initialStartDate={leaveRequestPrefill.initialStartDate}
				initialEndDate={leaveRequestPrefill.initialEndDate}
				initialDurationUnit={
					leaveRequestPrefill.honorPrefilledDates ? "FULL_DAY" : undefined
				}
				honorPrefilledDates={leaveRequestPrefill.honorPrefilledDates}
			/>

			<DocumentRequestModal
				isOpen={action === "create" && createKind === "document"}
				onClose={clearCreateParams}
				onSubmit={handleCreateDocument}
				isPending={createRequestMutation.isPending}
			/>

			<PANRequestModal
				isOpen={action === "create" && createKind === "personnel-action"}
				onClose={clearCreateParams}
				employeeObjectId={targetEmployeeId || null}
				initialStep={personnelInitialStep}
				onStepChange={(nextStep) => {
					updateSearchParams((next) => {
						if (
							next.get("action") === "create" &&
							next.get("kind") === "personnel-action"
						) {
							next.set("panStep", String(nextStep + 1));
						}
					});
				}}
				defaultIntent={
					personnelIntent === "REGULARIZATION" ||
					personnelIntent === "PROMOTION" ||
					personnelIntent === "TRANSFER" ||
					personnelIntent === "TERMINATION"
						? personnelIntent
						: undefined
				}
			/>

			<ResignationFlowModal
				isOpen={action === "create" && createKind === "resignation"}
				onClose={clearCreateParams}
				employeeId={employeeId}
				organizationId={organizationId}
			/>

			<JobRequisitionRequestModal
				isOpen={
					action === "create" && createKind === "job-requisition" && isDepartmentManager
				}
				onClose={clearCreateParams}
				departmentId={managerDepartmentId}
				departmentName={managerDepartmentName}
				isPending={createRequestMutation.isPending}
				onSubmit={handleCreateJobRequisition}
			/>

			<ScheduleChangeRequestModal
				isOpen={action === "create" && createKind === "schedule-change"}
				onClose={clearCreateParams}
				onSubmit={handleCreateScheduleChange}
				isPending={createRequestMutation.isPending}
				initialDate={searchParams.get("date")}
			/>

			<AttendanceAdjustmentRequestModal
				isOpen={action === "create" && createKind === "attendance-adjustment"}
				onClose={clearCreateParams}
				onSubmit={handleCreateAttendanceAdjustment}
				isPending={createRequestMutation.isPending}
				initialDate={searchParams.get("date")}
				initialTimeIn={searchParams.get("timeIn")}
				initialTimeOut={searchParams.get("timeOut")}
				initialRequestKind={
					searchParams.get("requestKind") === "OVERTIME"
						? "OVERTIME"
						: "ATTENDANCE_ADJUSTMENT"
				}
				initialAdjustmentKind={
					(searchParams.get("adjustmentKind") as
						| "CLOCK_IN"
						| "CLOCK_OUT"
						| "CLOCK_IN_OUT"
						| null) || undefined
				}
				onBehalfOptions={onBehalfOptions ?? undefined}
			/>
		</div>
	);
}
