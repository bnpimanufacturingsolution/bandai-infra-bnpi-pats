import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { Badge } from "~/components/atoms/Badge";
import { Button } from "~/components/atoms/Button";
import { PANBadge } from "~/components/atoms/PANBadge";
import { EmployeeTableCell } from "~/components/molecules/EmployeeTableCell";
import { Dialog, DialogContent } from "~/components/ui/dialog";
import { useAuth } from "~/lib/hooks/use-auth";
import { useRequest } from "~/lib/hooks/useRequests";
import type {
	Request,
	RequestStepExecution,
	RequestType,
	RequestWorkflowStateKey,
} from "~/services/requests.service";
import {
	getOvertimeCandidateReasonLabel,
	getOvertimeRequestHoursLabel,
} from "~/lib/utils/overtime-request-display";
import { formatManilaClockTime } from "~/lib/utils/manila-clock";
import {
	formatPickerTime12Hour,
	isoToManilaPickerTime,
} from "~/lib/utils/attendance-adjustment-request";
import {
	getDocumentRequestChangeAfterLabel,
	hasGeneratedDocumentFile,
} from "~/lib/document-request-handler";
import {
	AlertCircle,
	ArrowRight,
	Briefcase,
	ChevronDown,
	CheckCircle,
	CheckCircle2,
	Clock,
	Download,
	DollarSign,
	FileText,
	TrendingUp,
	UserCheck,
	UserX,
	XCircle,
} from "lucide-react";

interface RequestReviewModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	request: Request | null;
	onApprove?: (request: Request) => void;
	onReject?: (request: Request) => void;
	isApproving?: boolean;
	isRejecting?: boolean;
	customActions?: ReactNode;
	topContent?: ReactNode;
	highlightTransactionId?: string | null;
	skipRequestFetch?: boolean;
	hideManagerApproval?: boolean;
	hideLegacyLinks?: boolean;
	hideEmployeeProfile?: boolean;
	variant?: "default" | "compact";
}

const TERMINAL_REQUEST_STATES = ["COMPLETED", "REJECTED", "CANCELLED"] as const;

const ACTIVE_REQUEST_STATES = [
	"OPEN",
	"SUBMITTED",
	"FOR_APPROVAL",
	"IN_PROCESS",
	"APPROVED",
] as const;
const PAN_REQUEST_TYPES = new Set([
	"REGULARIZATION",
	"PROMOTION",
	"SALARY_CHANGE",
	"TRANSFER",
	"TERMINATION",
]);

const workflowStateStyles: Record<string, { label: string; badge: string; dot: string }> = {
	OPEN: {
		label: "Open",
		badge: "border-slate-600 bg-slate-600 text-white",
		dot: "bg-white/80",
	},
	SUBMITTED: {
		label: "Submitted",
		badge: "border-amber-500 bg-amber-500 text-white",
		dot: "bg-white/80",
	},
	APPROVED: {
		label: "Approved",
		badge: "border-orange-500 bg-orange-500 text-white",
		dot: "bg-white/80",
	},
	COMPLETED: {
		label: "Completed",
		badge: "border-slate-700 bg-slate-700 text-white",
		dot: "bg-white/80",
	},
	REJECTED: {
		label: "Rejected",
		badge: "border-red-500 bg-red-500 text-white",
		dot: "bg-white/80",
	},
	CANCELLED: {
		label: "Cancelled",
		badge: "border-slate-600 bg-slate-600 text-white",
		dot: "bg-white/80",
	},
};

const getRequestState = (request: Request): RequestWorkflowStateKey =>
	request.currentWorkflowStateKey || "OPEN";

const getMetadataField = (request: Request, field: string) => {
	if (!request.metadata || typeof request.metadata !== "object") return null;
	return request.metadata[field] ?? null;
};

const formatDate = (dateString?: string | Date | null) => {
	if (!dateString) return "N/A";
	return new Date(dateString).toLocaleDateString("en-US", {
		year: "numeric",
		month: "long",
		day: "numeric",
	});
};

const formatDateTimeShort = (dateString?: string | null) => {
	if (!dateString) return "N/A";
	return new Date(dateString).toLocaleString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
};

const formatMetadataLabel = (value: unknown) => {
	if (value === null || value === undefined || value === "") return "N/A";
	return String(value)
		.replace(/_/g, " ")
		.toLowerCase()
		.replace(/\b\w/g, (char) => char.toUpperCase());
};

const GENERIC_REQUEST_DESCRIPTIONS = new Set(["Timesheet edit permission request"]);

const getRequestReasonText = (
	request: Request,
	options?: {
		resignationReasonDetails?: unknown;
		fallback?: string;
	},
) => {
	const metadata = getMetadataRecord(request.metadata);
	const fallback = options?.fallback ?? "No description provided.";

	if (request.type === "RESIGNATION") {
		return String(
			options?.resignationReasonDetails || request.description || "No details provided.",
		);
	}

	const typedReason = [metadata.reason, metadata.justification, request.notes]
		.map((value) => String(value || "").trim())
		.find(Boolean);
	if (typedReason) return typedReason;

	const description = String(request.description || "").trim();
	if (description && !GENERIC_REQUEST_DESCRIPTIONS.has(description)) {
		return description;
	}

	return description || fallback;
};

const getStepStatusConfig = (step: RequestStepExecution) => {
	const normalizedStatus = String(step.status || "").toUpperCase();

	if (normalizedStatus === "APPROVED") {
		const metadata = step.metadata && typeof step.metadata === "object" ? step.metadata : {};
		const isAutoApproved = Boolean((metadata as Record<string, unknown>).autoApproved);
		return {
			icon: CheckCircle,
			iconClass: "text-orange-500",
			lineClass: "bg-orange-200",
			ringClass: "border-orange-200",
			cardClass: "border-gray-200 bg-white",
			badgeClass: "border-orange-200 bg-orange-50 text-orange-700",
			label: isAutoApproved ? "Auto-approved" : "Approved",
		};
	}

	if (normalizedStatus === "COMPLETED") {
		return {
			icon: CheckCircle,
			iconClass: "text-slate-600",
			lineClass: "bg-slate-200",
			ringClass: "border-slate-200",
			cardClass: "border-gray-200 bg-white",
			badgeClass: "border-slate-200 bg-slate-50 text-slate-700",
			label: "Completed",
		};
	}

	if (normalizedStatus === "REJECTED" || normalizedStatus === "CANCELLED") {
		return {
			icon: XCircle,
			iconClass: "text-red-500",
			lineClass: "bg-red-200",
			ringClass: "border-red-200",
			cardClass: "border-gray-200 bg-white",
			badgeClass: "border-red-200 bg-red-50 text-red-700",
			label: "Rejected",
		};
	}

	if (normalizedStatus === "PENDING" || normalizedStatus === "IN_PROGRESS") {
		return {
			icon: Clock,
			iconClass: "text-amber-500",
			lineClass: "bg-gray-200",
			ringClass: "border-gray-200",
			cardClass: "border-gray-200 bg-white",
			badgeClass: "border-amber-200 bg-amber-50 text-amber-700",
			label: "Pending",
		};
	}

	return {
		icon: Clock,
		iconClass: "text-gray-400",
		lineClass: "bg-gray-200",
		ringClass: "border-gray-200",
		cardClass: "border-gray-200 bg-white",
		badgeClass: "border-gray-200 bg-gray-50 text-gray-600",
		label: formatMetadataLabel(step.status || "Pending"),
	};
};

const getStepRoleLabel = (step: RequestStepExecution) => {
	if (step.assigneeType === "HR") return "HR role";
	if (step.assigneeType === "TARGET_DEPARTMENT_MANAGER") return "Target department manager role";
	if (step.assigneeType === "SUPERVISOR") return "Supervisor role";
	if (step.assigneeType === "REQUESTER") return "Requester role";
	if (step.assigneeType === "SYSTEM") return "System";
	return "Assigned role";
};

const isPendingHrPoolStep = (step: RequestStepExecution) => {
	const status = String(step.status || "").toUpperCase();
	return step.assigneeType === "HR" && (status === "PENDING" || status === "IN_PROGRESS");
};

const getStepAssigneeLabel = (step: RequestStepExecution) => {
	const metadata = step.metadata && typeof step.metadata === "object" ? step.metadata : {};
	const isAutoApproved = Boolean((metadata as Record<string, unknown>).autoApproved);

	if (isAutoApproved) {
		return "Auto-approved by workflow rules";
	}

	if (isPendingHrPoolStep(step)) {
		return "Any HR approver";
	}

	if (step.assignee?.person?.personalInfo) {
		const { firstName, lastName } = step.assignee.person.personalInfo;
		const name = `${firstName || ""} ${lastName || ""}`.trim();
		if (name) return name;
	}

	if (step.assignee?.employeeId) return step.assignee.employeeId;

	return getStepRoleLabel(step);
};

const getStepAssigneeProfileId = (step: RequestStepExecution) => {
	const metadata = step.metadata && typeof step.metadata === "object" ? step.metadata : {};
	if (Boolean((metadata as Record<string, unknown>).autoApproved)) return null;
	if (isPendingHrPoolStep(step)) return null;
	return step.assignee?.id || null;
};

const getStepDepartmentLabel = (step: RequestStepExecution) => {
	const metadata = step.metadata && typeof step.metadata === "object" ? step.metadata : {};
	if (Boolean((metadata as Record<string, unknown>).autoApproved)) {
		return "Auto-approved by workflow rules";
	}
	if (isPendingHrPoolStep(step)) {
		return "HR role";
	}
	const status = String(step.status || "").toUpperCase();
	if (
		step.assigneeType === "TARGET_DEPARTMENT_MANAGER" &&
		(status === "PENDING" || status === "IN_PROGRESS")
	) {
		return step.assignee?.department?.name || "Target department manager";
	}
	return (
		step.assignee?.department?.name ||
		(step.assigneeType === "SYSTEM" ? "Automatic Completion" : "")
	);
};

const getValueBadgeVariant = (label: string) => {
	const normalized = label.toLowerCase();
	if (normalized.includes("status")) return "outline" as const;
	if (normalized.includes("type") || normalized.includes("category"))
		return "primary-soft" as const;
	if (normalized.includes("notice period")) return "warning-soft" as const;
	return "outline" as const;
};

const getCompactBadgeClass = (label: string) => {
	const normalized = label.toLowerCase();

	if (normalized.includes("status")) {
		return "border-slate-600 bg-slate-600 text-white";
	}
	if (normalized.includes("type") || normalized.includes("category")) {
		return "border-rose-500 bg-rose-500 text-white";
	}
	if (normalized.includes("notice period")) {
		return "border-amber-500 bg-amber-500 text-white";
	}
	if (normalized.includes("document no")) {
		return "border-slate-600 bg-slate-600 text-white";
	}

	return "border-slate-600 bg-slate-600 text-white";
};

const renderCompactBadge = (
	label: string,
	value: string,
	variant?: ReturnType<typeof getValueBadgeVariant>,
) => (
	<Badge
		variant={variant}
		className={`inline-flex min-w-0 max-w-full items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold leading-none ${getCompactBadgeClass(
			label,
		)}`}
		title={value}>
		<span className="block max-w-full truncate">{value}</span>
	</Badge>
);

const formatCompactToken = (value: string) =>
	value
		.split(/[_\s-]+/)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
		.join(" ");

const getPersonName = (employee?: { person?: { personalInfo?: { firstName?: string; lastName?: string } } } | null) => {
	const info = employee?.person?.personalInfo;
	return `${info?.firstName || ""} ${info?.lastName || ""}`.trim();
};

const getInitials = (value: string) =>
	value
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((part) => part.charAt(0).toUpperCase())
		.join("") || "HR";

const getMetadataRecord = (value: unknown): Record<string, any> =>
	value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, any>)
		: {};

const getLeaveAttendanceReconciliation = (request: Request) => {
	if (request.type !== "LEAVE") return null;
	const requestState = getRequestState(request);
	if (requestState !== "APPROVED" && requestState !== "COMPLETED") return null;
	const metadata = getMetadataRecord(request.metadata);
	const reconciliation = getMetadataRecord(metadata.leaveAttendanceReconciliation);
	return Object.keys(reconciliation).length > 0 ? reconciliation : null;
};

const getTimeAdjustmentReconciliation = (request: Request) => {
	if (request.type !== "TIME_ADJUSTMENT") return null;
	const requestState = getRequestState(request);
	if (requestState !== "APPROVED" && requestState !== "COMPLETED") return null;
	const metadata = getMetadataRecord(request.metadata);
	const reconciliation = getMetadataRecord(metadata.timeAdjustmentReconciliation);
	return Object.keys(reconciliation).length > 0 ? reconciliation : null;
};

const buildLeaveAttendanceImpactLabel = (
	reconciliation: Record<string, any> | null,
	leaveType: unknown,
) => {
	if (!reconciliation) return "";
	const leaveTypeLabel = formatMetadataLabel(leaveType || "LEAVE");
	const attendanceResults = Array.isArray(reconciliation.attendanceResults)
		? reconciliation.attendanceResults
		: [];
	const labels = attendanceResults
		.map((result: any) => {
			const dateKey = String(result?.dateKey || "").trim();
			if (!dateKey) return "";
			if (result?.action === "converted") {
				return `Converted ${dateKey} to ${leaveTypeLabel} Leave`;
			}
			if (result?.action === "created") {
				return `Created ${dateKey} as ${leaveTypeLabel} Leave`;
			}
			if (result?.action === "unchanged") {
				return `${dateKey} already reflects ${leaveTypeLabel} Leave`;
			}
			return "";
		})
		.filter(Boolean);

	return labels.join("; ");
};

const buildTimesheetFollowUpLabel = (reconciliation: Record<string, any> | null) => {
	if (!reconciliation) return "";
	const timesheetResults = Array.isArray(reconciliation.timesheetResults)
		? reconciliation.timesheetResults
		: [];
	const labels = timesheetResults
		.map((result: any) => {
			const dateKey = String(result?.dateKey || "").trim();
			if (!dateKey) return "";
			if (result?.action === "adjustment_required") {
				return `Adjustment required for ${dateKey} (locked timesheet snapshot).`;
			}
			if (result?.action === "refreshed") {
				return `Draft timesheet refreshed for ${dateKey}.`;
			}
			return "";
		})
		.filter(Boolean);

	return labels.join(" ");
};

const getScheduleSnapshotFromValue = (value: unknown): Record<string, any> | null => {
	const record = getMetadataRecord(value);
	return Object.keys(record).length > 0 ? record : null;
};

const toScheduleTimeLabel = (value?: string | null) => {
	if (!value) return "";
	const match = String(value).match(/^(\d{1,2}):(\d{2})/);
	if (!match) return String(value);
	const hour = Number(match[1]);
	const minute = match[2];
	if (!Number.isFinite(hour)) return String(value);
	const period = hour >= 12 ? "PM" : "AM";
	const displayHour = hour % 12 || 12;
	return `${displayHour}:${minute} ${period}`;
};

const getScheduleWindowLabel = (snapshot?: Record<string, any> | null) => {
	if (!snapshot) return "";
	const slots = Array.isArray(snapshot.timeSlots) ? snapshot.timeSlots : [];
	const workSlots = slots.filter(
		(slot: any) => String(slot?.type || "work").toLowerCase() === "work",
	);
	const startTime = snapshot.startTime || workSlots[0]?.startTime || null;
	const endTime = snapshot.endTime || workSlots[workSlots.length - 1]?.endTime || null;
	if (!startTime || !endTime) return "";
	return `${toScheduleTimeLabel(startTime)} - ${toScheduleTimeLabel(endTime)}${
		snapshot.isOvernight ? " (+1)" : ""
	}`;
};

const getScheduleSnapshotLabel = (
	snapshot?: Record<string, any> | null,
	fallback?: string,
) => {
	if (!snapshot) return fallback || "";
	const name =
		snapshot.shiftTypeName ||
		snapshot.scheduleTemplateName ||
		snapshot.shiftTypeCode ||
		fallback ||
		"Schedule";
	const windowLabel = getScheduleWindowLabel(snapshot);
	if (snapshot.isOff) return `${name} (Rest day)`;
	return windowLabel ? `${name} - ${windowLabel}` : String(name);
};

const buildScheduleSnapshotFromMetadata = (metadata: Record<string, any>) => {
	const requestedSnapshot = getScheduleSnapshotFromValue(metadata.requestedScheduleSnapshot);
	if (requestedSnapshot) return requestedSnapshot;
	return {
		shiftTypeName:
			metadata.shiftTypeName ||
			metadata.shiftTypeLabel ||
			metadata.scheduleName ||
			metadata.newSchedule ||
			(String(metadata.requestMode || "").toUpperCase() === "FLEXITIME"
				? "Flexitime"
				: "Requested schedule"),
		shiftTypeCode: metadata.shiftTypeCode || null,
		isOff: Boolean(metadata.shiftTypeIsOff),
		isOvernight: false,
		startTime: metadata.manualStartTime || null,
		endTime: metadata.manualEndTime || null,
		timeSlots: Array.isArray(metadata.requestedTimeSlots)
			? metadata.requestedTimeSlots
			: [],
	};
};

const getScheduleApplicationStatusLabel = (status?: unknown) => {
	const normalized = String(status || "").toUpperCase();
	if (normalized === "CREATED_OVERRIDE") return "Schedule override applied";
	if (normalized === "UPDATED_EXISTING_OVERRIDE") return "Existing schedule override updated";
	if (normalized === "FLEXITIME_REQUIRES_HR_UPDATE") return "HR schedule setup required";
	return normalized ? formatMetadataLabel(normalized) : "";
};

const getPanType = (request: Request) =>
	String(getMetadataField(request, "panSubType") || request.type || "").toUpperCase();

const isPanRequest = (request: Request) => PAN_REQUEST_TYPES.has(getPanType(request));

const getSnapshotName = (snapshot: Record<string, any>) => {
	const fullName = String(snapshot.name || "").trim();
	if (fullName) return fullName;
	const firstName = String(snapshot.firstName || "").trim();
	const lastName = String(snapshot.lastName || "").trim();
	return `${firstName} ${lastName}`.trim();
};

const formatMoney = (value: unknown) => {
	const amount = Number(value);
	if (Number.isNaN(amount)) return "";
	return `PHP ${amount.toLocaleString()}`;
};

const getTerminalOutcomeStyle = (state: string) => {
	if (state === "COMPLETED") {
		return {
			section: "border-orange-200 bg-orange-50/60",
			avatar: "border-orange-200 bg-white text-orange-700",
			label: "text-orange-700",
			badge: "border-orange-200 bg-white text-orange-800",
		};
	}
	if (state === "REJECTED") {
		return {
			section: "border-red-200 bg-red-50",
			avatar: "border-red-200 bg-white text-red-700",
			label: "text-red-700",
			badge: "border-red-200 bg-white text-red-800",
		};
	}
	return {
		section: "border-slate-200 bg-slate-50",
		avatar: "border-slate-200 bg-white text-slate-700",
		label: "text-slate-700",
		badge: "border-slate-200 bg-white text-slate-800",
	};
};

const buildDetailRows = (request: Request) => {
	const rows: Array<{
		label: string;
		value: string;
		displayValue?: string;
		asBadge?: boolean;
	}> = [];
	const panSubType = getMetadataField(request, "panSubType");

	if (panSubType && panSubType !== request.type) {
		rows.push({
			label: "Request Category",
			value: String(panSubType),
			displayValue: formatMetadataLabel(panSubType),
			asBadge: true,
		});
	}

	if (request.type === "EXPENSE_REIMBURSEMENT" && request.amount) {
		rows.push({
			label: "Amount",
			value: `PHP ${Number(request.amount).toLocaleString()}`,
		});
	}

	if (request.type === "LEAVE") {
		const metadata = getMetadataRecord(request.metadata);
		const reconciliation = getLeaveAttendanceReconciliation(request);
		rows.push({
			label: "Leave Type",
			value: String(metadata.leaveType || "N/A"),
			displayValue: formatMetadataLabel(metadata.leaveType),
			asBadge: true,
		});
		rows.push({
			label: "Duration",
			value: metadata.totalDays
				? `${metadata.totalDays} day${Number(metadata.totalDays) === 1 ? "" : "s"}`
				: "N/A",
			asBadge: true,
		});
		rows.push({
			label: "Start Date",
			value: formatDate(request.startDate),
		});
		rows.push({
			label: "End Date",
			value: formatDate(request.endDate || request.startDate),
		});
		const attendanceImpactLabel = buildLeaveAttendanceImpactLabel(
			reconciliation,
			metadata.leaveType,
		);
		if (attendanceImpactLabel) {
			rows.push({
				label: "Attendance Impact",
				value: attendanceImpactLabel,
			});
		}
		const timesheetFollowUpLabel = buildTimesheetFollowUpLabel(reconciliation);
		if (timesheetFollowUpLabel) {
			rows.push({
				label: "Timesheet Follow-up",
				value: timesheetFollowUpLabel,
			});
		}
	}

	if (request.type === "OVERTIME") {
		const metadata = getMetadataRecord(request.metadata);
		const overtimeHours = getOvertimeRequestHoursLabel(metadata);
		const detectionReason = getOvertimeCandidateReasonLabel(metadata.overtimeCandidateReason);

		rows.push({
			label: "Date",
			value: formatDate(request.startDate || metadata.date),
		});
		rows.push({
			label: "Overtime Hours",
			value: overtimeHours || "N/A",
			asBadge: true,
		});
		if (detectionReason) {
			rows.push({
				label: "Detection Reason",
				value: detectionReason,
				asBadge: true,
			});
		}
		if (metadata.periodCode) {
			rows.push({
				label: "Payroll Period",
				value: String(metadata.periodCode),
			});
		}
		if (metadata.timesheetCode) {
			rows.push({
				label: "Timesheet",
				value: String(metadata.timesheetCode),
			});
		}
		if (metadata.startTime) {
			rows.push({
				label: "Start Time",
				value: String(metadata.startTime),
			});
		}
		if (metadata.endTime) {
			rows.push({
				label: "End Time",
				value: String(metadata.endTime),
			});
		}
	}

	if (request.type === "PAYROLL_CORRECTION") {
		const metadata = getMetadataRecord(request.metadata);
		const dayDeltas = Array.isArray(metadata.dayDeltas) ? metadata.dayDeltas : [];
		rows.push({
			label: "Source period",
			value: String(
				metadata.sourcePayrollPeriodName ||
					metadata.sourcePayrollPeriodCode ||
					metadata.periodName ||
					metadata.periodCode ||
					"N/A",
			),
		});
		if (metadata.timesheetCode) {
			rows.push({
				label: "Timesheet",
				value: String(metadata.timesheetCode),
			});
		}
		if (metadata.reason || request.description) {
			rows.push({
				label: "Correction reason",
				value: String(metadata.reason || request.description),
			});
		}
		if (metadata.estimatedAmount != null && metadata.estimatedAmount !== "") {
			const amount = Number(metadata.estimatedAmount);
			rows.push({
				label: "Estimated amount",
				value: Number.isFinite(amount)
					? `PHP ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
					: String(metadata.estimatedAmount),
				asBadge: true,
			});
		}
		if (dayDeltas.length > 0) {
			const summary = dayDeltas
				.map((d: any) => {
					const date = String(d?.date || "").slice(0, 10);
					const type = String(d?.hoursType || "OTHER");
					const before = Number(d?.beforeMinutes) || 0;
					const after = Number(d?.afterMinutes) || 0;
					const delta =
						d?.deltaMinutes != null ? Number(d.deltaMinutes) : after - before;
					const sign = delta > 0 ? "+" : "";
					return `${date} · ${type}: paid ${before} → proposed ${after} min (${sign}${delta})`;
				})
				.join("\n");
			rows.push({
				label: "Day deltas (paid → proposed)",
				value: summary,
			});
		}
		rows.push({
			label: "Apply rule",
			value: "Does not change the locked timesheet. Pays as an explicit retro line on the next open payroll after approval.",
		});
	}

	if (request.type === "TIME_ADJUSTMENT" || request.type === "ATTENDANCE_CORRECTION") {
		const metadata = getMetadataRecord(request.metadata);
		rows.push({
			label: "Date",
			value: formatDate(metadata.date || request.startDate),
		});
		rows.push({
			label: "Adjustment Type",
			value: String(metadata.adjustmentType || metadata.correctionType || "N/A"),
			displayValue: formatMetadataLabel(metadata.adjustmentType || metadata.correctionType),
			asBadge: true,
		});
		const correction = getMetadataRecord(metadata.attendanceCorrection);
		const correctedValues = getMetadataRecord(correction.correctedValues);
		const formatAttendanceClock = (value: unknown) => {
			const raw = String(value || "").trim();
			if (!raw) return "N/A";
			if (/^\d{1,2}:\d{2}$/.test(raw)) {
				return formatPickerTime12Hour(raw.length === 4 ? `0${raw}` : raw);
			}
			const manilaPicker = isoToManilaPickerTime(raw);
			if (manilaPicker) return formatPickerTime12Hour(manilaPicker);
			return formatManilaClockTime(raw) || raw;
		};
		const timeInRaw =
			metadata.timeIn ||
			metadata.correctedTimeIn ||
			correctedValues.timeIn ||
			correction.timeIn ||
			null;
		const timeOutRaw =
			metadata.timeOut ||
			metadata.correctedTimeOut ||
			correctedValues.timeOut ||
			correction.timeOut ||
			null;
		rows.push({
			label: "Time In",
			value: formatAttendanceClock(timeInRaw),
		});
		rows.push({
			label: "Time Out",
			value: formatAttendanceClock(timeOutRaw),
		});
		if (request.type === "TIME_ADJUSTMENT") {
			const reconciliation = getTimeAdjustmentReconciliation(request);
			const timesheetFollowUpLabel = buildTimesheetFollowUpLabel(reconciliation);
			if (timesheetFollowUpLabel) {
				rows.push({
					label: "Timesheet Follow-up",
					value: timesheetFollowUpLabel,
				});
			}
		}
	}

	if (request.type === "TIMESHEET") {
		const metadata = getMetadataRecord(request.metadata);
		rows.push({
			label: "Timesheet Type",
			value: String(metadata.timesheetAction || "SUBMISSION"),
			displayValue: formatMetadataLabel(metadata.timesheetAction || "SUBMISSION"),
			asBadge: true,
		});
		rows.push({
			label: "Period",
			value: String(metadata.payrollPeriodName || metadata.payrollPeriodCode || "N/A"),
		});
		rows.push({
			label: "Start Date",
			value: formatDate(metadata.periodStartDate || request.startDate),
		});
		rows.push({
			label: "End Date",
			value: formatDate(metadata.periodEndDate || request.endDate),
		});
	}

	if (request.type === "SCHEDULE_CHANGE") {
		const metadata = getMetadataRecord(request.metadata);
		rows.push({
			label: "Effective Date",
			value: formatDate(request.startDate || metadata.effectiveDate),
		});
		rows.push({
			label: "Schedule",
			value: String(metadata.scheduleName || metadata.newSchedule || "N/A"),
		});
	}

	if (request.type === "OTHER") {
		const metadata = getMetadataRecord(request.metadata);
		if (metadata.category) {
			rows.push({
				label: "Category",
				value: String(metadata.category),
				displayValue: formatMetadataLabel(metadata.category),
				asBadge: true,
			});
		}
		if (request.startDate || metadata.effectiveDate) {
			rows.push({
				label: "Effective Date",
				value: formatDate(request.startDate || metadata.effectiveDate),
			});
		}
	}

	if (request.type === "DOCUMENT_REQUEST") {
		rows.push({
			label: "Document Type",
			value: String(getMetadataField(request, "documentType") || "N/A"),
			displayValue: formatCompactToken(
				String(getMetadataField(request, "documentType") || "N/A"),
			),
			asBadge: true,
		});
		rows.push({
			label: "Document Status",
			value: String(getMetadataField(request, "documentStatus") || "N/A"),
			displayValue: formatMetadataLabel(getMetadataField(request, "documentStatus")),
			asBadge: true,
		});
		rows.push({
			label: "Document No.",
			value: String(getMetadataField(request, "documentNumber") || "N/A"),
			asBadge: true,
		});
		const generatedAt = getMetadataField(request, "generatedAt");
		if (generatedAt) {
			rows.push({
				label: "Generated",
				value: formatDateTimeShort(String(generatedAt)),
			});
		}
	}

	if (request.type === "RESIGNATION") {
		const resignationReasonCategory = getMetadataField(request, "reasonCategory");
		const resignationLastWorkingDay =
			getMetadataField(request, "lastWorkingDay") || request.endDate || request.startDate;
		const resignationNoticePeriodDays = getMetadataField(request, "noticePeriodDays");
		const resignationAdditionalComments = getMetadataField(request, "additionalComments");

		rows.push({
			label: "Reason Category",
			value: String(resignationReasonCategory || "N/A"),
			displayValue: formatMetadataLabel(resignationReasonCategory),
			asBadge: true,
		});
		rows.push({
			label: "Last Working Day",
			value: formatDate(resignationLastWorkingDay as string | Date | null | undefined),
		});
		rows.push({
			label: "Notice Period",
			value: resignationNoticePeriodDays ? `${resignationNoticePeriodDays} days` : "N/A",
			asBadge: true,
		});
		if (resignationAdditionalComments) {
			rows.push({
				label: "Additional Comments",
				value: String(resignationAdditionalComments),
			});
		}
	}

	if (isPanRequest(request)) {
		const metadata = getMetadataRecord(request.metadata);
		const panType = getPanType(request);
		const effectiveDate = request.endDate || request.startDate || metadata.effectiveDate;
		const rowsByType: Record<
			string,
			Array<{ label: string; value?: unknown; asBadge?: boolean }>
		> = {
			REGULARIZATION: [
				{ label: "Effective Date", value: effectiveDate },
				{
					label: "Regularization Date",
					value: metadata.regularizationDate || effectiveDate,
				},
				{
					label: "Recommendation",
					value: metadata.supervisorRecommendation,
					asBadge: true,
				},
				{ label: "Performance Summary", value: metadata.performanceSummary },
			],
			PROMOTION: [
				{ label: "Effective Date", value: effectiveDate },
				{ label: "New Position", value: metadata.newPosition },
				{ label: "Promotion Level", value: metadata.promotionLevel, asBadge: true },
				{
					label: "New Salary",
					value: metadata.newSalary
						? `PHP ${Number(metadata.newSalary).toLocaleString()}`
						: null,
				},
			],
			SALARY_CHANGE: [
				{ label: "Effective Date", value: effectiveDate },
				{
					label: "New Salary",
					value: metadata.newSalary
						? `PHP ${Number(metadata.newSalary).toLocaleString()}`
						: null,
				},
			],
			TRANSFER: [
				{ label: "Effective Date", value: effectiveDate },
				{ label: "New Department", value: metadata.newDepartment },
				{ label: "New Location", value: metadata.newLocation, asBadge: true },
				{ label: "New Supervisor", value: metadata.newSupervisor },
			],
			TERMINATION: [
				{ label: "Last Working Day", value: metadata.lastWorkingDay || effectiveDate },
				{ label: "Termination Type", value: metadata.terminationType, asBadge: true },
				{ label: "Termination Reason", value: metadata.terminationReason },
			],
		};

		for (const row of rowsByType[panType] || []) {
			if (!row.value) continue;
			const rawValue = String(row.value);
			const displayValue =
				row.label.toLowerCase().includes("date") || row.label === "Last Working Day"
					? formatDate(rawValue)
					: row.asBadge
						? formatMetadataLabel(rawValue)
						: rawValue;
			rows.push({
				label: row.label,
				value: displayValue,
				displayValue,
				asBadge: row.asBadge,
			});
		}
	}

	return rows.filter((row) => row.value && row.value !== "N/A");
};

export function RequestReviewModal({
	open,
	onOpenChange,
	request,
	onApprove,
	onReject,
	isApproving = false,
	isRejecting = false,
	customActions,
	topContent,
	highlightTransactionId = null,
	skipRequestFetch = false,
	hideManagerApproval = false,
	hideLegacyLinks: _hideLegacyLinks = false,
	hideEmployeeProfile = false,
	variant = "default",
}: RequestReviewModalProps) {
	const { user } = useAuth();
	const [timelineOpen, setTimelineOpen] = useState<boolean | null>(null);
	const isCompactView = variant === "compact";
	const isReviewerView = !!(onApprove || onReject);
	const showEmployeeProfileCard = isCompactView && !hideEmployeeProfile;
	const { data: requestDetails } = useRequest(
		open && request?.id && !skipRequestFetch ? request.id : "",
		{
			fields: [
				"id",
				"code",
				"type",
				"description",
				"startDate",
				"endDate",
				"metadata",
				"currentWorkflowStateKey",
				"attachments",
				"notes",
				"createdAt",
				"updatedAt",
				"requesterId",
				"requester.id",
				"requester.employeeId",
				"requester.person.personalInfo",
				"requester.user.avatar",
				"requester.department.name",
				"requester.position.title",
				"targetEmployee.id",
				"targetEmployee.employeeId",
				"targetEmployee.employmentStatus",
				"targetEmployee.employmentType",
				"targetEmployee.probationEndDate",
				"targetEmployee.metadata",
				"targetEmployee.person.personalInfo",
				"targetEmployee.user.avatar",
				"targetEmployee.department.name",
				"targetEmployee.position.title",
				"currentStepExecution",
				"lastCompletedStepExecution",
				"stepExecutions.id",
				"stepExecutions.stepNumber",
				"stepExecutions.stepName",
				"stepExecutions.stepType",
				"stepExecutions.assigneeType",
				"stepExecutions.assigneeId",
				"stepExecutions.status",
				"stepExecutions.completedAt",
				"stepExecutions.metadata",
				"stepExecutions.assignee.id",
				"stepExecutions.assignee.employeeId",
				"stepExecutions.assignee.person.personalInfo",
				"stepExecutions.assignee.department.name",
				"transactions.id",
				"transactions.sequenceNumber",
				"transactions.eventCategory",
				"transactions.eventKey",
				"transactions.fieldChanges",
				"transactions.occurredAt",
			].join(","),
		},
	);

	request = requestDetails || request;

	useEffect(() => {
		if (!request || !isCompactView) return;
		const state = getRequestState(request);
		setTimelineOpen(!TERMINAL_REQUEST_STATES.includes(state as (typeof TERMINAL_REQUEST_STATES)[number]));
	}, [request?.id, request?.currentWorkflowStateKey, isCompactView]);

	if (!request) return null;

	const requestState = getRequestState(request);
	const requestStateStyle = workflowStateStyles[requestState] || workflowStateStyles.OPEN;
	const sortedStepExecutions = (
		[...(request.stepExecutions || [])] as RequestStepExecution[]
	).sort((a, b) => a.stepNumber - b.stepNumber);

	const requesterName = getPersonName(request.requester) || "Unknown Employee";
	const targetEmployee = request.targetEmployee;
	const targetEmployeeName = getPersonName(targetEmployee);
	const requestMetadata = getMetadataRecord(request.metadata);
	const panEmployeeSnapshot = getMetadataRecord(requestMetadata.employee_snapshot);
	const panSnapshotName = getSnapshotName(panEmployeeSnapshot);
	const displayTitle =
		targetEmployeeName || (isPanRequest(request) ? panSnapshotName : "") || requesterName;

	const firstStepAssignee = sortedStepExecutions[0]?.assignee as
		| (RequestStepExecution["assignee"] & {
				position?: { title?: string };
		  })
		| undefined;
	const department =
		targetEmployee?.department?.name ||
		(request.requester as any)?.department?.name ||
		firstStepAssignee?.department?.name ||
		"";

	const requesterId = request.requester?.employeeId || request.requesterId;
	const requesterProfileId = request.requester?.id || request.requesterId || null;
	const targetEmployeeId =
		targetEmployee?.employeeId ||
		(isPanRequest(request) ? String(panEmployeeSnapshot.employeeId || "") : "");
	const targetEmployeeProfileId = targetEmployee?.id || null;
	const displayId = targetEmployeeId || requesterId || "No ID";

	const currentStep = request.currentStepExecution;
	const currentStepLabel = currentStep?.stepName || "No active step";
	const currentStepAssignee = currentStep
		? getStepAssigneeLabel(currentStep as RequestStepExecution)
		: "No assignee";
	const resignationReasonCategory = getMetadataField(request, "reasonCategory");
	const resignationReasonDetails = getMetadataField(request, "reasonDetails");
	const resignationLastWorkingDay =
		getMetadataField(request, "lastWorkingDay") || request.endDate || request.startDate;
	const resignationAdditionalComments = getMetadataField(request, "additionalComments");
	const resignationNoticePeriodDays = getMetadataField(request, "noticePeriodDays");
	const typeLabel = (() => {
		const labels: Record<string, string> = {
			EXPENSE_REIMBURSEMENT: "Expense Reimbursement",
			DOCUMENT_REQUEST: "Document Request",
			TIME_ADJUSTMENT: "Time Adjustment",
			TIMESHEET:
				getMetadataField(request, "timesheetAction") === "EDIT_PERMISSION"
					? "Timesheet Edit Permission"
					: "Timesheet Submission",
			ATTENDANCE_CORRECTION: "Attendance Correction",
			OTHER: "General Request",
			LEAVE: "Leave Request",
			OVERTIME: "Overtime Request",
			PAYROLL_CORRECTION: "Payroll Correction",
			RESIGNATION: "Resignation",
			TERMINATION: "Termination",
			PROMOTION: "Promotion",
			SALARY_CHANGE: "Salary Change",
			REGULARIZATION: "Regularization",
			TRANSFER: "Transfer",
		};
		const subType = getMetadataField(request, "panSubType");
		return labels[subType as string] || labels[request.type] || "General Request";
	})();
	const detailRows = buildDetailRows(request);
	const payrollCorrectionMetadata =
		request.type === "PAYROLL_CORRECTION" ? getMetadataRecord(request.metadata) : null;
	const payrollCorrectionDayDeltas = Array.isArray(payrollCorrectionMetadata?.dayDeltas)
		? (payrollCorrectionMetadata!.dayDeltas as Array<Record<string, unknown>>)
		: [];
	const panType = getPanType(request);
	const isPan = isPanRequest(request);
	const isTerminalOutcome = ["COMPLETED", "REJECTED", "CANCELLED"].includes(requestState);
	const targetEmployeeMetadata = getMetadataRecord(targetEmployee?.metadata);
	const lastPanApplication = getMetadataRecord(targetEmployeeMetadata.lastPanApplication);
	const panAppliedToThisRequest = lastPanApplication.requestId === request.id;
	const panAfter = getMetadataRecord(lastPanApplication.after);
	const panEffectiveDate =
		lastPanApplication.effectiveDate ||
		request.endDate ||
		request.startDate ||
		getMetadataField(request, "effectiveDate") ||
		getMetadataField(request, "regularizationDate");
	const panOutcomeLabel = (() => {
		if (requestState !== "COMPLETED") return `${typeLabel} ${requestStateStyle.label}`;
		if (panType === "REGULARIZATION") return "Employee Became Regular";
		if (panType === "PROMOTION") return "Employee Promoted";
		if (panType === "SALARY_CHANGE") return "Salary Updated";
		if (panType === "TRANSFER") return "Employee Transferred";
		if (panType === "TERMINATION") return "Employment Ended";
		return "Personnel action completed";
	})();
	const canonicalEmploymentType =
		targetEmployee?.employmentType || panAfter.employmentType || null;
	const canonicalEmploymentStatus =
		targetEmployee?.employmentStatus || panAfter.employmentStatus || null;
	const canonicalProbationEnd =
		targetEmployee?.probationEndDate ?? panAfter.probationEndDate ?? null;
	const completedByLabel = request.lastCompletedStepExecution?.assignee?.person?.personalInfo
		? `${request.lastCompletedStepExecution.assignee.person.personalInfo.firstName || ""} ${request.lastCompletedStepExecution.assignee.person.personalInfo.lastName || ""}`.trim()
		: request.lastCompletedStepExecution?.assigneeType === "SYSTEM"
			? "System"
			: request.lastCompletedStepExecution?.assignee?.employeeId ||
				request.lastCompletedStepExecution?.stepName ||
				"N/A";
	const terminalOutcomeLabel =
		isPan && requestState === "COMPLETED"
			? panOutcomeLabel
			: `${typeLabel} ${requestStateStyle.label}`;
	const terminalOutcomeStyle = getTerminalOutcomeStyle(requestState);
	const outcomeProfileId = targetEmployeeProfileId || requesterProfileId;
	const outcomeEmployeeName = displayTitle;
	const outcomeEmployeeId = displayId;
	const outcomeAvatar =
		targetEmployee?.user?.avatar || (request.requester as any)?.user?.avatar || null;
	const outcomePosition =
		targetEmployee?.position?.title || (request.requester as any)?.position?.title || "";
	const panMetadata = requestMetadata;
	const panCurrentValues = getMetadataRecord(panMetadata.current_values);
	const transactionFieldChanges = (request.transactions || [])
		.slice()
		.sort((a, b) => (a.sequenceNumber || 0) - (b.sequenceNumber || 0))
		.flatMap((transaction) =>
			Array.isArray(transaction.fieldChanges) ? transaction.fieldChanges : [],
		);
	const documentTypeLabel = formatCompactToken(
		String(getMetadataField(request, "documentType") || "Requested Document"),
	);
	const effectiveDateLabel = formatDate(
		(panEffectiveDate ||
			request.endDate ||
			request.startDate ||
			getMetadataField(request, "effectiveDate")) as string | Date | null | undefined,
	);
	const impactTitle = (() => {
		if (isPan) {
			if (panType === "REGULARIZATION") return `${outcomeEmployeeName} becomes Regular`;
			if (panType === "PROMOTION") {
				const newPosition = panMetadata.newPosition || targetEmployee?.position?.title;
				const promotionLevel = panMetadata.promotionLevel;
				if (promotionLevel)
					return `${outcomeEmployeeName} is promoted to ${promotionLevel}`;
				return newPosition
					? `${outcomeEmployeeName} moves to ${newPosition}`
					: `${outcomeEmployeeName} is promoted`;
			}
			if (panType === "SALARY_CHANGE") return `${outcomeEmployeeName}'s salary is updated`;
			if (panType === "TRANSFER") {
				const newDepartment = panMetadata.newDepartment || targetEmployee?.department?.name;
				return newDepartment
					? `${outcomeEmployeeName} transfers to ${newDepartment}`
					: `${outcomeEmployeeName} is transferred`;
			}
			if (panType === "TERMINATION") return `${outcomeEmployeeName}'s employment ends`;
			return `${outcomeEmployeeName}'s personnel action is completed`;
		}
		if (request.type === "DOCUMENT_REQUEST") {
			return `${documentTypeLabel} for ${outcomeEmployeeName}`;
		}
		return `${typeLabel} for ${outcomeEmployeeName}`;
	})();
	const impactMetaLine = isPan
		? `Effective ${effectiveDateLabel}`
		: request.type === "DOCUMENT_REQUEST"
			? `Requested by ${requesterName}`
			: `Status: ${requestStateStyle.label}`;
	const impactChangeRows = (() => {
		const rows: Array<{ label: string; before: string; after: string }> = [];
		const targetReportToName = getPersonName(targetEmployee?.reportTo) || "";
		const formatChangeValue = (label: string, value: unknown) => {
			if (value === null || value === undefined || value === "") return "";
			if (label.toLowerCase().includes("salary")) return formatMoney(value) || String(value);
			if (label.toLowerCase().includes("date")) return formatDate(value as string);
			if (typeof value === "object") return "";
			return formatMetadataLabel(value);
		};
		const readBefore = (...keys: string[]) => {
			for (const key of keys) {
				const value = panCurrentValues[key] ?? panEmployeeSnapshot[key];
				if (value !== null && value !== undefined && value !== "") return value;
			}
			return null;
		};
		const readCurrentSupervisor = () =>
			readBefore("supervisor", "reportTo", "manager", "reportToName", "managerName") ||
			targetReportToName ||
			targetEmployee?.reportTo?.employeeId ||
			readBefore("supervisorId", "reportToId", "managerId");
		const addRow = (label: string, beforeValue: unknown, afterValue: unknown) => {
			if (afterValue === null || afterValue === undefined || afterValue === "") return;
			const before = beforeValue ? formatMetadataLabel(beforeValue) : "Previous";
			const after = formatMetadataLabel(afterValue);
			if (before === after) return;
			rows.push({ label, before, after });
		};
		const addTransactionRows = () => {
			for (const change of transactionFieldChanges) {
				if (!change || change.field === "metadata") continue;
				const label = change.label || formatMetadataLabel(change.field);
				const before = formatChangeValue(label, change.before);
				const after = formatChangeValue(label, change.after);
				if (!after || before === after) continue;
				if (rows.some((row) => row.label === label && row.after === after)) continue;
				rows.push({
					label,
					before: before || "Previous",
					after,
				});
			}
		};

		if (!isPan) {
			addTransactionRows();
			if (rows.length > 0) return rows;

			const addBusinessStateRow = (
				label: string,
				beforeValue: unknown,
				afterValue: unknown,
			) => {
				rows.push({
					label,
					before: beforeValue ? String(beforeValue) : "Current record",
					after: afterValue ? String(afterValue) : requestStateStyle.label,
				});
			};

			if (request.type === "DOCUMENT_REQUEST") {
				const documentStatus = formatMetadataLabel(
					getMetadataField(request, "documentStatus"),
				);
				addBusinessStateRow(
					"Document State",
					documentStatus !== "N/A" ? documentStatus : "Requested",
					getDocumentRequestChangeAfterLabel({
						requestState,
						documentTypeLabel,
						hasGeneratedFile: hasGeneratedDocumentFile(request),
					}),
				);
				return rows;
			}

			if (request.type === "LEAVE") {
				addBusinessStateRow(
					"Leave Record",
					`${formatMetadataLabel(requestMetadata.leaveType)} requested`,
					requestState === "REJECTED"
						? "Leave request rejected"
						: `${requestStateStyle.label} leave for ${formatDate(request.startDate)} - ${formatDate(
								request.endDate || request.startDate,
							)}`,
				);
				return rows;
			}

			if (request.type === "ATTENDANCE_CORRECTION" || request.type === "TIME_ADJUSTMENT") {
				addBusinessStateRow(
					"Attendance Record",
					`Current record for ${formatDate(requestMetadata.date || request.startDate)}`,
					`${requestStateStyle.label} correction`,
				);
				return rows;
			}

			if (request.type === "TIMESHEET") {
				const period =
					requestMetadata.payrollPeriodName || requestMetadata.payrollPeriodCode;
				addBusinessStateRow(
					"Timesheet State",
					period ? `Submitted for ${period}` : "Submitted timesheet",
					requestState === "APPROVED"
						? "Payroll/HR review"
						: requestState === "REJECTED"
							? "Returned to employee"
							: requestStateStyle.label,
				);
				return rows;
			}

			if (request.type === "OVERTIME") {
				const overtimeHours = getOvertimeRequestHoursLabel(requestMetadata);
				addBusinessStateRow(
					"Overtime Record",
					overtimeHours ? `${overtimeHours} detected` : "Overtime requested",
					`${requestStateStyle.label} overtime`,
				);
				return rows;
			}

			if (request.type === "SCHEDULE_CHANGE") {
				addBusinessStateRow(
					"Schedule State",
					"Current schedule",
					requestMetadata.scheduleName ||
						requestMetadata.newSchedule ||
						`Effective ${formatDate(request.startDate || requestMetadata.effectiveDate)}`,
				);
				return rows;
			}

			if (request.type === "RESIGNATION") {
				addBusinessStateRow(
					"Employment State",
					"Active employment",
					`Offboarding / last day ${formatDate(
						resignationLastWorkingDay as string | Date | null | undefined,
					)}`,
				);
				return rows;
			}

			if (request.type === "EXPENSE_REIMBURSEMENT") {
				addBusinessStateRow(
					"Reimbursement State",
					request.amount
						? `PHP ${Number(request.amount).toLocaleString()} submitted`
						: "Submitted",
					requestState === "APPROVED" ? "Payment review" : requestStateStyle.label,
				);
				return rows;
			}

			addBusinessStateRow("Request State", "Submitted request", requestStateStyle.label);
			return rows;
		}
		if (panType === "REGULARIZATION") {
			addRow(
				"Employment Type",
				readBefore("employmentType"),
				panAppliedToThisRequest ? canonicalEmploymentType || "REGULAR" : "REGULAR",
			);
			addRow(
				"Employment Status",
				readBefore("employmentStatus"),
				panAppliedToThisRequest ? canonicalEmploymentStatus || "ACTIVE" : "ACTIVE",
			);
			if (panMetadata.regularizationDate || panEffectiveDate) {
				rows.push({
					label: "Regularization Date",
					before: readBefore("probationEndDate")
						? formatDate(readBefore("probationEndDate"))
						: "Pending regularization",
					after: formatDate(panMetadata.regularizationDate || panEffectiveDate),
				});
			}
		}
		if (panType === "PROMOTION") {
			addRow(
				"Position",
				readBefore("position", "positionTitle"),
				panMetadata.newPosition || targetEmployee?.position?.title,
			);
			addRow("Level", readBefore("level", "levelName"), panMetadata.promotionLevel);
			if (panMetadata.newSalary) {
				rows.push({
					label: "Salary",
					before: readBefore("basicSalary")
						? formatMoney(readBefore("basicSalary"))
						: "Previous",
					after: formatMoney(panMetadata.newSalary),
				});
			}
		}
		if (panType === "SALARY_CHANGE" && panMetadata.newSalary) {
			rows.push({
				label: "Salary",
				before: readBefore("basicSalary")
					? formatMoney(readBefore("basicSalary"))
					: "Previous",
				after: formatMoney(panMetadata.newSalary),
			});
		}
		if (panType === "TRANSFER") {
			addRow(
				"Department",
				readBefore("department"),
				panMetadata.newDepartment || targetEmployee?.department?.name,
			);
			addRow("Location", readBefore("workLocation"), panMetadata.newLocation);
			addRow("Report To / Manager", readCurrentSupervisor(), panMetadata.newSupervisor);
		}
		if (panType === "TERMINATION") {
			addRow(
				"Employment Status",
				readBefore("employmentStatus"),
				canonicalEmploymentStatus || "TERMINATED",
			);
			if (panMetadata.lastWorkingDay) {
				rows.push({
					label: "Last Working Day",
					before: "Active",
					after: formatDate(panMetadata.lastWorkingDay),
				});
			}
		}
		addTransactionRows();
		return rows;
	})();
	const impactPanelLabel =
		request.type === "DOCUMENT_REQUEST"
			? "Document impact"
			: isPan
				? "Employee impact"
				: "Request impact";
	const currentActionLabel = currentStep
		? `Waiting on ${currentStepLabel}`
		: isTerminalOutcome
			? `Finalized by ${completedByLabel}`
			: requestStateStyle.label;
	const currentActionMeta = currentStep
		? currentStepAssignee
		: isTerminalOutcome
			? `Completed ${effectiveDateLabel}`
			: "No pending actor assigned";
	const impactWhy = getRequestReasonText(request, {
		resignationReasonDetails,
		fallback: "",
	});
	const impactConsequence = (() => {
		if (request.type === "DOCUMENT_REQUEST") {
			const documentStatus = formatMetadataLabel(getMetadataField(request, "documentStatus"));
			if (requestState === "APPROVED") {
				return `${documentTypeLabel} can be generated and attached to the employee record.`;
			}
			if (documentStatus !== "N/A") return `${documentTypeLabel} is ${documentStatus}.`;
			return `${documentTypeLabel} will be reviewed, generated, or issued based on HR completion.`;
		}
		if (isPan) {
			if (panType === "PROMOTION")
				return "Employee assignment and level records update after completion.";
			if (panType === "REGULARIZATION")
				return "Employment type/status updates after completion.";
			if (panType === "SALARY_CHANGE") return "Compensation records update after completion.";
			if (panType === "TRANSFER")
				return "Department/location reporting context updates after completion.";
			if (panType === "TERMINATION")
				return "Employment status and account access can change after completion.";
		}
		if (request.type === "LEAVE")
			return "Approved leave updates attendance and leave balance records.";
		if (request.type === "ATTENDANCE_CORRECTION" || request.type === "TIME_ADJUSTMENT") {
			return "Approval updates attendance source records that may affect timesheets and payroll.";
		}
		if (request.type === "TIMESHEET")
			return "Approval moves the timesheet toward HR/payroll processing.";
		if (request.type === "OVERTIME")
			return "Approval confirms extra worked time for downstream timekeeping review.";
		if (request.type === "SCHEDULE_CHANGE")
			return "Approval changes the employee schedule context.";
		if (request.type === "RESIGNATION")
			return "Approval can begin offboarding and final working-day processing.";
		return "Approval moves this request to the next workflow state.";
	})();
	const uniqueSubjectBadges = Array.from(
		new Set(
			[department, targetEmployee?.position?.title]
				.map((value) => String(value || "").trim())
				.filter(Boolean),
		),
	);
	const overtimeHoursLabel =
		request.type === "OVERTIME" ? getOvertimeRequestHoursLabel(requestMetadata) : null;
	const overtimeReasonLabel =
		request.type === "OVERTIME"
			? getOvertimeCandidateReasonLabel(requestMetadata.overtimeCandidateReason)
			: null;

	const headerFacts = [
		{
			label: "Ticket",
			value: typeLabel,
			meta: request.code || request.id,
		},
		...(overtimeHoursLabel
			? [
					{
						label: "Overtime",
						value: overtimeHoursLabel,
						meta: overtimeReasonLabel || "Detected from timesheet",
					},
				]
			: []),
		...(isTerminalOutcome
			? []
			: [
					{
						label: "Current Step",
						value: currentStepLabel,
						meta: currentStep ? currentStepAssignee : "No pending action",
					},
				]),
		{
			label: "Requester",
			value: requesterName,
			meta: requesterId,
		},
		{
			label: isTerminalOutcome ? "Effective / Completed" : "Created / Effective",
			value: formatDate(
				request.endDate || request.startDate || panEffectiveDate || request.createdAt,
			),
			meta: isTerminalOutcome
				? `Completed by ${completedByLabel}`
				: `Created ${formatDate(request.createdAt)}`,
		},
	];

	const headerConfig = (() => {
		const panSubType = getMetadataField(request, "panSubType");
		const type = (panSubType as RequestType) || request.type;

		switch (type) {
			case "PROMOTION":
			case "SALARY_CHANGE":
				return {
					icon: TrendingUp,
					gradient: "from-orange-400 to-red-500",
					bgGradient: "from-orange-50/60 to-white",
				};
			case "REGULARIZATION":
				return {
					icon: UserCheck,
					gradient: "from-orange-400 to-amber-500",
					bgGradient: "from-orange-50/60 to-white",
				};
			case "TRANSFER":
				return {
					icon: ArrowRight,
					gradient: "from-orange-400 to-red-500",
					bgGradient: "from-orange-50/60 to-white",
				};
			case "TERMINATION":
				return {
					icon: UserX,
					gradient: "from-red-400 to-rose-500",
					bgGradient: "from-red-50/60 to-white",
				};
			case "EXPENSE_REIMBURSEMENT":
				return {
					icon: DollarSign,
					gradient: "from-orange-400 to-amber-500",
					bgGradient: "from-orange-50/60 to-white",
				};
			case "LEAVE":
			case "TIME_ADJUSTMENT":
			case "OVERTIME":
			case "PAYROLL_CORRECTION":
				return {
					icon: Clock,
					gradient: "from-orange-400 to-amber-500",
					bgGradient: "from-orange-50/60 to-white",
				};
			case "RESIGNATION":
				return {
					icon: AlertCircle,
					gradient: "from-red-400 to-orange-500",
					bgGradient: "from-red-50/60 to-white",
				};
			default:
				return {
					icon: FileText,
					gradient: "from-orange-400 to-red-500",
					bgGradient: "from-orange-50/60 to-white",
				};
		}
	})();

	const HeaderIcon = headerConfig.icon;
	const isTaskStep = request.currentStepExecution?.stepType === "TASK";
	const canManagerAct =
		!hideManagerApproval &&
		ACTIVE_REQUEST_STATES.includes(requestState as (typeof ACTIVE_REQUEST_STATES)[number]) &&
		!!onApprove &&
		(isTaskStep || !!onReject);
	const justificationText = getRequestReasonText(request, { resignationReasonDetails });
	const showTimeline = timelineOpen ?? !isTerminalOutcome;

	if (isCompactView) {
		return (
			<Dialog open={open} onOpenChange={onOpenChange}>
				<DialogContent className="flex max-h-[90vh] w-full flex-col overflow-hidden rounded-2xl border-none bg-white p-0 shadow-2xl outline-none sm:max-w-[640px]">
					<div className="flex-none border-b border-gray-100 px-6 py-4 pr-12">
						<div className="flex flex-wrap items-center gap-2">
							<h2 className="text-lg font-semibold text-gray-900">{typeLabel}</h2>
							<span
								className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${requestStateStyle.badge}`}>
								<span className={`h-1.5 w-1.5 rounded-full ${requestStateStyle.dot}`} />
								{requestStateStyle.label}
							</span>
						</div>
						<p className="mt-0.5 truncate text-xs text-gray-500">
							{request.code || request.id}
						</p>
					</div>

					<div className="flex-1 overflow-y-auto custom-scrollbar">
						<div className="space-y-4 px-6 py-5">
							{topContent}

							{showEmployeeProfileCard ? (
								<section className="rounded-xl border border-gray-200 bg-gray-50/40 px-4 py-3">
									<EmployeeTableCell
										profileId={outcomeProfileId}
										fullName={outcomeEmployeeName}
										employeeId={outcomeEmployeeId}
										avatar={outcomeAvatar}
										className="w-full rounded-lg p-1 transition-colors hover:bg-white"
									/>
									{department || outcomePosition ? (
										<p className="mt-2 pl-12 text-xs text-gray-500">
											{[department, outcomePosition].filter(Boolean).join(" · ")}
										</p>
									) : null}
								</section>
							) : null}

							<section className="rounded-xl border border-gray-200">
								<div className="border-b border-gray-100 px-4 py-3">
									<h3 className="text-sm font-semibold text-gray-900">Details</h3>
								</div>
								<dl className="divide-y divide-gray-100 px-4">
									{isReviewerView && !isTerminalOutcome && currentStep ? (
										<div className="grid gap-1 py-3 sm:grid-cols-[120px_minmax(0,1fr)] sm:gap-4">
											<dt className="text-sm text-gray-500">Current step</dt>
											<dd className="text-sm font-medium text-gray-900">
												{currentStepLabel}
												<span className="mt-0.5 block text-xs font-normal text-gray-500">
													{currentStepAssignee}
												</span>
											</dd>
										</div>
									) : null}
									{detailRows.map((row) => (
										<div
											key={row.label}
											className="grid gap-1 py-3 sm:grid-cols-[120px_minmax(0,1fr)] sm:gap-4">
											<dt className="text-sm text-gray-500">{row.label}</dt>
											<dd className="whitespace-pre-wrap text-sm font-medium text-gray-900 [overflow-wrap:anywhere]">
												{row.displayValue || row.value}
											</dd>
										</div>
									))}
									{request.type === "PAYROLL_CORRECTION" &&
									payrollCorrectionDayDeltas.length > 0 ? (
										<div className="py-3" data-testid="payroll-correction-day-table">
											<p className="mb-2 text-sm text-gray-500">
												Day comparison (paid vs proposed)
											</p>
											<div className="overflow-x-auto rounded-lg border border-neutral-200">
												<table className="min-w-full text-left text-sm">
													<thead className="bg-neutral-50 text-xs font-semibold uppercase tracking-wide text-neutral-500">
														<tr>
															<th className="px-3 py-2">Date</th>
															<th className="px-3 py-2">Type</th>
															<th className="px-3 py-2">Paid (min)</th>
															<th className="px-3 py-2">Proposed (min)</th>
															<th className="px-3 py-2">Delta</th>
														</tr>
													</thead>
													<tbody className="divide-y divide-neutral-100">
														{payrollCorrectionDayDeltas.map((d, index) => {
															const before = Number(d?.beforeMinutes) || 0;
															const after = Number(d?.afterMinutes) || 0;
															const delta =
																d?.deltaMinutes != null
																	? Number(d.deltaMinutes)
																	: after - before;
															const sign = delta > 0 ? "+" : "";
															return (
																<tr
																	key={`${String(d?.date || index)}-${index}`}
																	className="text-neutral-800">
																	<td className="px-3 py-2 font-medium">
																		{String(d?.date || "").slice(0, 10) || "—"}
																	</td>
																	<td className="px-3 py-2">
																		{String(d?.hoursType || "OTHER")}
																	</td>
																	<td className="px-3 py-2 tabular-nums">{before}</td>
																	<td className="px-3 py-2 tabular-nums">{after}</td>
																	<td className="px-3 py-2 font-semibold tabular-nums">
																		{sign}
																		{delta}
																	</td>
																</tr>
															);
														})}
													</tbody>
												</table>
											</div>
										</div>
									) : null}
									<div className="grid gap-1 py-3 sm:grid-cols-[120px_minmax(0,1fr)] sm:gap-4">
										<dt className="text-sm text-gray-500">Reason</dt>
										<dd className="whitespace-pre-wrap text-sm text-gray-900 [overflow-wrap:anywhere]">
											{justificationText}
										</dd>
									</div>
									{isTerminalOutcome ? (
										<div className="grid gap-1 py-3 sm:grid-cols-[120px_minmax(0,1fr)] sm:gap-4">
											<dt className="text-sm text-gray-500">Completed on</dt>
											<dd className="text-sm font-medium text-gray-900">
												{effectiveDateLabel}
											</dd>
										</div>
									) : null}
								</dl>
							</section>

							{impactChangeRows.length > 0 ? (
								<section className="rounded-xl border border-gray-200">
									<div className="border-b border-gray-100 px-4 py-3">
										<h3 className="text-sm font-semibold text-gray-900">
											What changes
										</h3>
									</div>
									<ul className="divide-y divide-gray-100 px-4">
										{impactChangeRows.map((row) => (
											<li
												key={row.label}
												className="flex flex-wrap items-center gap-2 py-3 text-sm">
												<span className="font-medium text-gray-700">
													{row.label}
												</span>
												<span className="text-gray-500">{row.before}</span>
												<ArrowRight className="h-3.5 w-3.5 text-gray-400" />
												<span className="font-medium text-gray-900">
													{row.after}
												</span>
											</li>
										))}
									</ul>
								</section>
							) : null}

							{request.attachments && request.attachments.length > 0 ? (
								<section className="rounded-xl border border-gray-200">
									<div className="border-b border-gray-100 px-4 py-3">
										<h3 className="text-sm font-semibold text-gray-900">
											Attachments
										</h3>
									</div>
									<div className="space-y-2 px-4 py-3">
										{request.attachments.map((attachment, index) => (
											<a
												key={index}
												href={attachment}
												target="_blank"
												rel="noreferrer"
												className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2 text-sm transition-colors hover:bg-gray-50">
												<FileText className="h-4 w-4 flex-shrink-0 text-gray-400" />
												<span className="min-w-0 flex-1 truncate text-gray-900">
													{attachment.split("/").pop() ||
														`Attachment ${index + 1}`}
												</span>
												<Download className="h-4 w-4 flex-shrink-0 text-gray-400" />
											</a>
										))}
									</div>
								</section>
							) : null}

							{request.type === "DOCUMENT_REQUEST" &&
							hasGeneratedDocumentFile(request) ? (
								<section className="rounded-xl border border-orange-200 bg-orange-50 p-4">
									<h3 className="flex items-center gap-2 text-sm font-semibold text-orange-900">
										<CheckCircle2 className="h-4 w-4 text-orange-600" />
										Document ready
									</h3>
									<a
										href={`/employee/${requesterProfileId}?tab=documents&action=view-doc&documentNumber=${(request as any).metadata?.documentNumber || request.code}`}
										target="_blank"
										rel="noreferrer"
										className="mt-3 inline-flex items-center gap-2 rounded-lg bg-orange-600 px-3 py-2 text-sm text-white transition-colors hover:bg-orange-700">
										<FileText className="h-4 w-4" />
										View Document
									</a>
								</section>
							) : request.type === "DOCUMENT_REQUEST" &&
							  (requestState === "COMPLETED" || requestState === "APPROVED") ? (
								<section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
									<h3 className="flex items-center gap-2 text-sm font-semibold text-amber-900">
										<AlertCircle className="h-4 w-4 text-amber-600" />
										No file on Documents yet
									</h3>
									<p className="mt-2 text-sm text-amber-800">
										This request is {requestState.toLowerCase()}, but HR has not
										generated the PDF. Open HR Tickets and use Generate
										Document. Certificates &amp; Education stays empty until
										then.
									</p>
								</section>
							) : null}

							<section className="rounded-xl border border-gray-200">
								<button
									type="button"
									onClick={() => setTimelineOpen(!showTimeline)}
									className="flex w-full items-center justify-between px-4 py-3 text-left">
									<h3 className="text-sm font-semibold text-gray-900">
										Workflow timeline
									</h3>
									<ChevronDown
										className={`h-4 w-4 text-gray-500 transition-transform ${showTimeline ? "rotate-180" : ""}`}
									/>
								</button>
								{showTimeline ? (
									<div className="border-t border-gray-100 px-4 py-3">
										{sortedStepExecutions.length > 0 ? (
											<div className="space-y-2">
												{sortedStepExecutions.map((step) => {
													const status = getStepStatusConfig(step);
													const assigneeLabel = getStepAssigneeLabel(step);
													const stepTime = step.completedAt
														? formatDateTimeShort(step.completedAt)
														: "Pending";

													return (
														<div
															key={step.id}
															className="flex items-start justify-between gap-3 py-2">
															<div className="min-w-0">
																<p className="text-sm font-medium text-gray-900">
																	{step.stepName}
																</p>
																<p className="text-xs text-gray-500">
																	{assigneeLabel}
																</p>
															</div>
															<div className="flex flex-shrink-0 flex-col items-end gap-1">
																<span
																	className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${status.badgeClass}`}>
																	{status.label}
																</span>
																<span className="text-xs text-gray-400">
																	{stepTime}
																</span>
															</div>
														</div>
													);
												})}
											</div>
										) : (
											<p className="text-sm text-gray-500">
												Workflow history is not available yet.
											</p>
										)}
									</div>
								) : null}
							</section>
						</div>
					</div>

					<div className="flex flex-none justify-end gap-3 rounded-b-2xl border-t border-gray-100 bg-white px-4 py-3">
						{customActions}

						{canManagerAct && (
							<>
								{!isTaskStep && onReject ? (
									<Button
										className="hover:cursor-pointer hover:text-red-600 flex-1 md:flex-none bg-white hover:bg-gray-50 text-red-600 border border-gray-200 h-10 px-5 rounded-lg"
										variant="outline"
										onClick={() => onReject?.(request)}
										disabled={isRejecting}>
										<UserX className="w-4 h-4 mr-2" />
										Reject
									</Button>
								) : null}

								<Button
									className="hover:cursor-pointer flex-1 md:flex-none bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white h-10 px-5 rounded-lg"
									onClick={() => onApprove?.(request)}
									disabled={isApproving}>
									<div className="flex items-center gap-2">
										{isApproving ? (
											<div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
										) : (
											<CheckCircle className="w-4 h-4" />
										)}
										<span>
											{isApproving
												? "Processing..."
												: isTaskStep
													? "Complete Task"
													: "Approve"}
										</span>
									</div>
								</Button>
							</>
						)}
					</div>
				</DialogContent>
			</Dialog>
		);
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="flex max-h-[90vh] w-full flex-col overflow-hidden rounded-2xl border-none bg-white p-0 shadow-2xl outline-none sm:max-w-[920px]">
				<div
					className={`flex-none border-b border-gray-100 bg-gradient-to-r ${headerConfig.bgGradient}`}>
					<div className="px-6 py-6 flex items-start gap-4">
						<div className="flex-shrink-0">
							<div
								className={`h-16 w-16 rounded-full bg-gradient-to-br ${headerConfig.gradient} flex items-center justify-center text-white shadow-md border-2 border-white overflow-hidden ring-1 ring-gray-200/50`}>
								<HeaderIcon className="w-8 h-8" />
							</div>
						</div>

						<div className="flex-1 min-w-0">
							<h2 className="text-xl font-semibold text-gray-900 leading-tight truncate">
								{displayTitle}
							</h2>
							<div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-600">
								<div className="flex min-w-0 max-w-full items-center gap-1.5 rounded-full border border-gray-200 bg-white/80 px-2 py-0.5">
									<Briefcase className="w-3.5 h-3.5 text-gray-500" />
									<span className="max-w-full break-all text-xs font-medium tracking-wide text-gray-700">
										{request.code || request.id}
									</span>
								</div>
								<Badge
									variant="outline"
									className="max-w-full whitespace-nowrap border-gray-200 bg-white/80 px-2.5 py-1 text-[11px] font-medium text-gray-700">
									{displayId}
								</Badge>
								{department && (
									<Badge
										variant="outline"
										className="max-w-full whitespace-nowrap border-gray-200 bg-white/80 px-2.5 py-1 text-[11px] font-medium text-gray-600">
										{department}
									</Badge>
								)}
							</div>
							<div className="mt-3 flex flex-wrap items-center gap-2">
								<PANBadge
									intent={
										(getMetadataField(request, "panSubType") as any) ||
										(request.type as any)
									}
									className="max-w-full whitespace-nowrap rounded-full border-transparent bg-slate-700 px-3 py-1 text-xs text-white shadow-sm ring-1 ring-black/5"
								/>
								<span
									className={`inline-flex max-w-full whitespace-nowrap items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${requestStateStyle.badge}`}>
									<span
										className={`h-2 w-2 rounded-full ${requestStateStyle.dot}`}
									/>
									<span>{requestStateStyle.label}</span>
								</span>
							</div>
						</div>
					</div>

					<div
						className={`grid grid-cols-1 gap-3 px-6 pb-5 md:grid-cols-2 ${
							headerFacts.length === 3 ? "xl:grid-cols-3" : "xl:grid-cols-4"
						}`}>
						{headerFacts.map((fact) => (
							<div
								key={fact.label}
								className="min-w-0 rounded-xl border border-gray-200 bg-white/80 p-3">
								<div className="text-xs font-medium uppercase tracking-wide text-gray-500">
									{fact.label}
								</div>
								<div className="mt-1 text-sm font-semibold text-gray-900 [overflow-wrap:anywhere]">
									{fact.value}
								</div>
								{fact.meta ? (
									<div className="mt-1 text-xs text-gray-500 [overflow-wrap:anywhere]">
										{fact.meta}
									</div>
								) : null}
							</div>
						))}
					</div>
				</div>

				<div className="flex-1 overflow-y-auto custom-scrollbar">
					<div className="px-6 py-5 space-y-5">
						{topContent}

						<section className={`rounded-2xl border ${terminalOutcomeStyle.section}`}>
							<div className="grid gap-6 p-5 xl:grid-cols-[minmax(260px,0.78fr)_minmax(0,1.22fr)]">
								<div className="min-w-0">
									<div className="flex items-start gap-4">
										<div
											className={`flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-full border text-lg font-semibold ${terminalOutcomeStyle.avatar}`}>
											{getInitials(outcomeEmployeeName)}
										</div>
										<div className="min-w-0">
											<div
												className={`mb-2 text-xs font-bold uppercase tracking-wide ${terminalOutcomeStyle.label}`}>
												{impactPanelLabel}
											</div>
											<EmployeeTableCell
												profileId={outcomeProfileId}
												fullName={outcomeEmployeeName}
												employeeId={outcomeEmployeeId}
												className="mt-0"
											/>
											<div className="mt-2 flex flex-wrap gap-2">
												{uniqueSubjectBadges.map((badge) => (
													<Badge
														key={badge}
														variant="outline"
														className="max-w-full whitespace-nowrap border-orange-200 bg-white px-2.5 py-1 text-[11px] font-medium text-orange-800">
														{badge}
													</Badge>
												))}
											</div>
										</div>
									</div>
									<div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
										<div className="rounded-xl border border-white/70 bg-white/70 p-3">
											<div
												className={`text-[10px] font-bold uppercase tracking-wide ${terminalOutcomeStyle.label}`}>
												Requested By
											</div>
											<EmployeeTableCell
												profileId={requesterProfileId}
												fullName={requesterName}
												employeeId={requesterId}
												className="mt-1"
											/>
										</div>
										<div className="rounded-xl border border-white/70 bg-white/70 p-3">
											<div
												className={`text-[10px] font-bold uppercase tracking-wide ${terminalOutcomeStyle.label}`}>
												Current Action
											</div>
											<div className="mt-1 text-sm font-semibold text-gray-900">
												{currentActionLabel}
											</div>
											<div className="mt-1 text-xs text-gray-500 [overflow-wrap:anywhere]">
												{currentActionMeta}
											</div>
										</div>
									</div>
								</div>
								<div className="min-w-0">
									<div className="flex flex-wrap items-center gap-2">
										<span className="inline-flex max-w-full whitespace-nowrap rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
											{terminalOutcomeLabel}
										</span>
										<span className="inline-flex max-w-full whitespace-nowrap rounded-full border border-orange-200 bg-white px-3 py-1 text-xs font-semibold text-orange-700">
											{requestStateStyle.label}
										</span>
									</div>
									<h3 className="mt-3 text-lg font-semibold leading-snug text-gray-900 [overflow-wrap:anywhere]">
										{impactTitle}
									</h3>
									<div className="mt-1 text-sm font-medium text-gray-600">
										{impactMetaLine}
									</div>

									{impactChangeRows.length > 0 ? (
										<div className="mt-4 space-y-3">
											<div
												className={`text-[10px] font-bold uppercase tracking-wide ${terminalOutcomeStyle.label}`}>
												Fields changing
											</div>
											{impactChangeRows.map((row) => (
												<div
													key={row.label}
													className="rounded-2xl border border-orange-100 bg-white/85 p-3">
													<div className="grid items-center gap-3 sm:grid-cols-[minmax(0,1fr)_44px_minmax(0,1fr)]">
														<div className="min-w-0 rounded-xl border border-gray-200 bg-white px-4 py-3">
															<div className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
																Before {row.label}
															</div>
															<div className="mt-1 whitespace-normal break-words text-base font-semibold text-gray-900">
																{row.before}
															</div>
														</div>
														<div className="flex items-center justify-center">
															<div className="flex h-11 w-11 items-center justify-center rounded-full border border-orange-200 bg-orange-50 text-orange-700">
																<ArrowRight className="h-5 w-5" />
															</div>
														</div>
														<div className="min-w-0 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3">
															<div className="text-[10px] font-bold uppercase tracking-wide text-orange-700">
																After {row.label}
															</div>
															<div className="mt-1 whitespace-normal break-words text-base font-semibold text-orange-950">
																{row.after}
															</div>
														</div>
													</div>
												</div>
											))}
										</div>
									) : (
										<div className="mt-4 grid gap-3 sm:grid-cols-2">
											<div className="rounded-xl border border-white/70 bg-white/80 p-3">
												<div
													className={`text-[10px] font-bold uppercase tracking-wide ${terminalOutcomeStyle.label}`}>
													Completed By
												</div>
												<div className="mt-1 text-sm font-semibold text-gray-900">
													{completedByLabel}
												</div>
											</div>
											<div className="rounded-xl border border-white/70 bg-white/80 p-3">
												<div
													className={`text-[10px] font-bold uppercase tracking-wide ${terminalOutcomeStyle.label}`}>
													Effective
												</div>
												<div className="mt-1 text-sm font-semibold text-gray-900">
													{formatDate(
														(panEffectiveDate ||
															request.endDate ||
															request.startDate ||
															getMetadataField(
																request,
																"effectiveDate",
															)) as string | Date | null | undefined,
													)}
												</div>
											</div>
										</div>
									)}
									<div
										className={`mt-4 grid gap-3 ${
											impactChangeRows.length > 0
												? "lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]"
												: ""
										}`}>
										<div className="rounded-xl border border-white/70 bg-white/75 p-3">
											<div
												className={`text-[10px] font-bold uppercase tracking-wide ${terminalOutcomeStyle.label}`}>
												Why requested
											</div>
											<div className="mt-1 line-clamp-3 text-sm text-gray-700 [overflow-wrap:anywhere]">
												{impactWhy || "No reason provided."}
											</div>
										</div>
										{impactChangeRows.length > 0 ? (
											<div className="rounded-xl border border-white/70 bg-white/75 p-3">
												<div
													className={`text-[10px] font-bold uppercase tracking-wide ${terminalOutcomeStyle.label}`}>
													If action is completed
												</div>
												<div className="mt-1 text-sm text-gray-700 [overflow-wrap:anywhere]">
													{impactConsequence}
												</div>
											</div>
										) : null}
									</div>
								</div>
							</div>
						</section>

						<div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,.8fr)]">
							<div className="space-y-5">
								<section className="rounded-2xl border border-gray-200 bg-white">
									<div className="border-b border-gray-100 px-5 py-4">
										<h3 className="text-base font-semibold text-gray-900">
											Justification
										</h3>
									</div>
									<div className="px-5 py-4">
										<p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
											{justificationText}
										</p>
									</div>
								</section>

								{request.attachments && request.attachments.length > 0 && (
									<section className="rounded-2xl border border-gray-200 bg-white">
										<div className="border-b border-gray-100 px-5 py-4">
											<h3 className="text-base font-semibold text-gray-900">
												Attachments
											</h3>
										</div>
										<div className="px-5 py-4 flex flex-wrap gap-3">
											{request.attachments.map((attachment, index) => (
												<a
													key={index}
													href={attachment}
													target="_blank"
													rel="noreferrer"
													className="flex min-w-0 flex-1 basis-[240px] items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3 transition-colors hover:bg-gray-100">
													<div className="rounded-lg bg-orange-50 p-2 text-orange-600">
														<FileText className="h-4 w-4" />
													</div>
													<div className="min-w-0 flex-1">
														<p className="text-sm font-medium text-gray-900 [overflow-wrap:anywhere]">
															{attachment.split("/").pop() ||
																`Attachment ${index + 1}`}
														</p>
														<p className="text-xs text-gray-500">
															Click to view
														</p>
													</div>
													<Download className="h-4 w-4 text-gray-400" />
												</a>
											))}
										</div>
									</section>
								)}
							</div>

							<div className="space-y-5">
								<section className="rounded-2xl border border-gray-200 bg-white">
									<div className="border-b border-gray-100 px-5 py-4">
										<h3 className="text-base font-semibold text-gray-900">
											Key Details
										</h3>
									</div>
									<div className="px-5 py-4">
										<div className="grid gap-x-4 gap-y-3 sm:grid-cols-[140px_minmax(0,1fr)]">
											<div className="text-xs font-medium uppercase tracking-wide text-gray-500">
												Type
											</div>
											<div className="min-w-0">
												{renderCompactBadge(
													"Type",
													typeLabel,
													"primary-soft",
												)}
											</div>
											{detailRows.map((row) => (
												<div key={row.label} className="contents">
													<div className="text-xs font-medium uppercase tracking-wide text-gray-500">
														{row.label}
													</div>
													<div className="min-w-0 text-sm text-gray-900">
														{row.asBadge ? (
															renderCompactBadge(
																row.label,
																row.displayValue || row.value,
																getValueBadgeVariant(row.label),
															)
														) : (
															<span className="whitespace-pre-wrap [overflow-wrap:anywhere]">
																{row.displayValue || row.value}
															</span>
														)}
													</div>
												</div>
											))}
										</div>

										{request.type === "PAYROLL_CORRECTION" &&
										payrollCorrectionDayDeltas.length > 0 ? (
											<div
												className="mt-4 border-t border-neutral-100 pt-4"
												data-testid="payroll-correction-day-table">
												<p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
													Day comparison (paid vs proposed)
												</p>
												<div className="overflow-x-auto rounded-xl border border-neutral-200">
													<table className="min-w-full text-left text-sm">
														<thead className="bg-neutral-50 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
															<tr>
																<th className="px-3 py-2">Date</th>
																<th className="px-3 py-2">Type</th>
																<th className="px-3 py-2">Paid</th>
																<th className="px-3 py-2">Proposed</th>
																<th className="px-3 py-2">Delta</th>
															</tr>
														</thead>
														<tbody className="divide-y divide-neutral-100">
															{payrollCorrectionDayDeltas.map((d, index) => {
																const before = Number(d?.beforeMinutes) || 0;
																const after = Number(d?.afterMinutes) || 0;
																const delta =
																	d?.deltaMinutes != null
																		? Number(d.deltaMinutes)
																		: after - before;
																const sign = delta > 0 ? "+" : "";
																return (
																	<tr
																		key={`${String(d?.date || index)}-${index}`}
																		className="text-neutral-800">
																		<td className="px-3 py-2 font-medium">
																			{String(d?.date || "").slice(0, 10) || "—"}
																		</td>
																		<td className="px-3 py-2">
																			{String(d?.hoursType || "OTHER")}
																		</td>
																		<td className="px-3 py-2 tabular-nums">
																			{before} min
																		</td>
																		<td className="px-3 py-2 tabular-nums">
																			{after} min
																		</td>
																		<td className="px-3 py-2 font-semibold tabular-nums">
																			{sign}
																			{delta} min
																		</td>
																	</tr>
																);
															})}
														</tbody>
													</table>
												</div>
												<p className="mt-2 text-xs text-neutral-500">
													Approving schedules this as a retro line on the next open
													payroll. The locked source timesheet is not rewritten.
												</p>
											</div>
										) : null}
									</div>
								</section>

								{request.type === "DOCUMENT_REQUEST" &&
								hasGeneratedDocumentFile(request) ? (
									<section className="rounded-2xl border border-orange-200 bg-orange-50 p-4">
										<h3 className="flex items-center gap-2 text-base font-semibold text-orange-900">
											<CheckCircle2 className="h-4 w-4 text-orange-600" />
											Document Generated
										</h3>
										<a
											href={`/employee/${requesterProfileId}?tab=documents&action=view-doc&documentNumber=${(request as any).metadata?.documentNumber || request.code}`}
											target="_blank"
											rel="noreferrer"
											className="mt-3 inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm text-white transition-colors hover:bg-orange-700">
											<FileText className="h-4 w-4" />
											View Document
										</a>
									</section>
								) : request.type === "DOCUMENT_REQUEST" &&
								  (requestState === "COMPLETED" || requestState === "APPROVED") ? (
									<section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
										<h3 className="flex items-center gap-2 text-base font-semibold text-amber-900">
											<AlertCircle className="h-4 w-4 text-amber-600" />
											No file on Documents yet
										</h3>
										<p className="mt-2 text-sm text-amber-800">
											Workflow completion does not create the PDF. HR must
											Generate Document first. Then it appears in Certificates
											&amp; Education.
										</p>
									</section>
								) : null}
							</div>
						</div>

						<section className="rounded-2xl border border-gray-200 bg-white">
							<div className="border-b border-gray-100 px-5 py-4">
								<h3 className="text-base font-semibold text-gray-900">
									Workflow Timeline
								</h3>
							</div>
							<div className="px-5 py-4">
								{sortedStepExecutions.length > 0 ? (
									<div className="space-y-3">
										{sortedStepExecutions.map((step) => {
											const status = getStepStatusConfig(step);
											const assigneeLabel = getStepAssigneeLabel(step);
											const assigneeProfileId = getStepAssigneeProfileId(step);
											const departmentLabel = getStepDepartmentLabel(step);
											const stepTime = step.completedAt
												? formatDateTimeShort(step.completedAt)
												: "Not started yet";

											return (
												<div
													key={step.id}
													className={`rounded-xl border px-4 py-3 ${status.cardClass}`}>
													<div className="flex flex-wrap items-start justify-between gap-3">
														<div className="min-w-0">
															<div className="flex flex-wrap items-center gap-2">
																<p className="min-w-0 text-sm font-semibold text-gray-900 [overflow-wrap:anywhere]">
																	Step {step.stepNumber}:{" "}
																	{step.stepName}
																</p>
																<span
																	className={`inline-flex max-w-full whitespace-nowrap items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${status.badgeClass}`}>
																	{status.label}
																</span>
															</div>
															{assigneeProfileId ? (
																<Link
																	to={`/employee/${assigneeProfileId}`}
																	title={`Open ${assigneeLabel}'s employee profile`}
																	className="mt-1 inline-flex max-w-full text-sm font-medium text-gray-800 underline-offset-4 [overflow-wrap:anywhere] hover:text-orange-600 hover:underline">
																	{assigneeLabel}
																</Link>
															) : (
																<p className="mt-1 text-sm text-gray-700 [overflow-wrap:anywhere]">
																	{assigneeLabel}
																</p>
															)}
															{departmentLabel && (
																<p className="mt-1 text-xs text-gray-500 [overflow-wrap:anywhere]">
																	{departmentLabel}
																</p>
															)}
														</div>
														<div className="text-right text-xs text-gray-500 [overflow-wrap:anywhere]">
															{stepTime}
														</div>
													</div>
													{step.comments && (
														<p className="mt-3 whitespace-pre-wrap rounded-lg bg-gray-50 px-3 py-2 text-xs leading-relaxed text-gray-600">
															{step.comments}
														</p>
													)}
												</div>
											);
										})}
									</div>
								) : (
									<div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-6 text-sm text-gray-500">
										Request transaction history is not available yet.
									</div>
								)}
							</div>
						</section>
					</div>
				</div>

				<div className="sticky bottom-0 z-20 flex flex-none justify-end gap-3 rounded-b-2xl border-t border-gray-200 bg-white p-4 shadow-[0_-8px_24px_rgba(15,23,42,0.08)]">
					{customActions}

					{canManagerAct && (
						<>
							{!isTaskStep && onReject ? (
								<Button
									className="hover:cursor-pointer hover:text-red-600 flex-1 md:flex-none bg-white hover:bg-gray-50 text-red-600 border border-gray-200 h-10 px-5 rounded-lg"
									variant="outline"
									onClick={() => onReject?.(request)}
									disabled={isRejecting}>
									<UserX className="w-4 h-4 mr-2" />
									Reject
								</Button>
							) : null}

							<Button
								className="hover:cursor-pointer flex-1 md:flex-none bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white h-10 px-5 rounded-lg"
								onClick={() => onApprove?.(request)}
								disabled={isApproving}>
								<div className="flex items-center gap-2">
									{isApproving ? (
										<div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
									) : (
										<CheckCircle className="w-4 h-4" />
									)}
									<span>
										{isApproving
											? "Processing..."
											: isTaskStep
												? "Complete Task"
												: "Approve"}
									</span>
								</div>
							</Button>
						</>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
