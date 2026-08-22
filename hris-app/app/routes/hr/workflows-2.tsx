import React, { useState, useMemo, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router";
import {
	Kanban,
	List,
	Search,
	Check,
	X,
	Clock,
	FileText,
	MoreVertical,
	ChevronRight,
	ChevronDown,
	ArrowLeft,
	FolderTree,
	AlertCircle,
	UserCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/atoms/Card";
import { Modal } from "~/components/atoms/Modal";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/atoms/Badge";
import { Avatar, AvatarFallback } from "~/components/ui/avatar";
import { Progress } from "~/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { DataTable } from "~/components/atoms/DataTable";
import { Skeleton } from "~/components/ui/skeleton";
import { useQueries } from "@tanstack/react-query";
import {
	useRequests,
	useApproveRequest,
	useCancelRequest,
	useDelegateRequestStep,
} from "~/lib/hooks/useRequests";
import {
	useWorkflowStatuses,
	useWorkflowPermissions,
	queryKeys,
} from "~/lib/hooks/useRequestWorkflowRuntime";
import requestWorkflowRuntimeService, {
	type WorkflowStatusConfig,
} from "~/services/request-workflow-runtime.service";
import { useAuth } from "~/lib/hooks/use-auth";
import { Loader2 } from "lucide-react";
import { getTimesheetDeepLink } from "~/components/dashboards/shared/request-helpers";

export interface DetailItemProps {
	label: string;
	value?: React.ReactNode;
	className?: string;
}
export const DetailItem = ({ label, value, className }: DetailItemProps) => (
	<div className={`space-y-1 ${className ?? ""}`}>
		<p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
		<div className="text-sm leading-relaxed text-gray-900">
			{value ?? <span className="text-gray-400">Not specified</span>}
		</div>
	</div>
);

// --- Enums & Interfaces ---
export enum RequestType {
	LEAVE = "LEAVE",
	OVERTIME = "OVERTIME",
	TIME_ADJUSTMENT = "TIME_ADJUSTMENT",
	TIMESHEET = "TIMESHEET",
	EXPENSE_REIMBURSEMENT = "EXPENSE_REIMBURSEMENT",
	DOCUMENT_REQUEST = "DOCUMENT_REQUEST",
	RESIGNATION = "RESIGNATION",
	TERMINATION = "TERMINATION",
	REGULARIZATION = "REGULARIZATION",
	PROMOTION = "PROMOTION",
	SALARY_CHANGE = "SALARY_CHANGE",
	TRANSFER = "TRANSFER",
	OTHER = "OTHER",
}

export enum RequestStatus {
	OPEN = "OPEN",
	SUBMITTED = "SUBMITTED",
	PENDING = "PENDING",
	IN_REVIEW = "IN_REVIEW",
	PROCESSING = "PROCESSING",
	APPROVED = "APPROVED",
	REJECTED = "REJECTED",
	CANCELLED = "CANCELLED",
	COMPLETED = "COMPLETED",
}

export interface StepExecution {
	id: string;
	stepNumber: number;
	stepName: string;
	stepType: "SUBMISSION" | "APPROVAL" | "TASK";
	assigneeType: "REQUESTER" | "SUPERVISOR" | "HR";
	assigneeName: string;
	status: "PENDING" | "IN_PROGRESS" | "APPROVED" | "REJECTED" | "COMPLETED" | "SKIPPED";
	note?: string;
	completedAt?: string;
}

export interface RequestItem {
	id: string;
	code: string;
	type: RequestType;
	requesterId?: string;
	status: RequestStatus;
	description: string;
	requesterName: string;
	requesterAvatar: string;
	requesterPosition: string;
	startDate?: string;
	endDate?: string;
	createdAt: string;
	stepExecutions: StepExecution[];
	currentStepId?: string;
	metadata?: any;
	requester?: {
		id?: string;
	} | null;
}

const isActiveWorkflowState = (status: string) =>
	["OPEN", "SUBMITTED", "PENDING", "IN_REVIEW", "PROCESSING"].includes(status);

// --- MOCK DATA ---
const createMockData = (): RequestItem[] => {
	return [
		{
			id: "REQ-001",
			code: "REQ-001",
			type: RequestType.LEAVE,
			status: RequestStatus.IN_REVIEW,
			description: "Annual Vacation Leave - Palawan Trip",
			requesterName: "Janice Smith",
			requesterAvatar: "JS",
			requesterPosition: "Marketing Lead",
			startDate: "2024-03-10",
			endDate: "2024-03-15",
			createdAt: "2024-02-25",
			stepExecutions: [
				{
					id: "S1",
					stepNumber: 1,
					stepName: "Submit Request",
					stepType: "SUBMISSION",
					assigneeType: "REQUESTER",
					assigneeName: "Janice Smith",
					status: "COMPLETED",
					completedAt: "2024-02-25T10:00:00Z",
					note: "Please approve, flights booked.",
				},
				{
					id: "S2",
					stepNumber: 2,
					stepName: "Manager Approval",
					stepType: "APPROVAL",
					assigneeType: "SUPERVISOR",
					assigneeName: "Robert Davis",
					status: "IN_PROGRESS",
				},
				{
					id: "S3",
					stepNumber: 3,
					stepName: "HR Verification",
					stepType: "APPROVAL",
					assigneeType: "HR",
					assigneeName: "HR Team",
					status: "PENDING",
				},
			],
			currentStepId: "S2",
			metadata: { request_details: { leaveType: "VACATION" } },
		},
		{
			id: "REQ-002",
			code: "REQ-002",
			type: RequestType.OVERTIME,
			status: RequestStatus.PENDING,
			description: "Weekend deployment support",
			requesterName: "Mark Wilson",
			requesterAvatar: "MW",
			requesterPosition: "Senior Engineer",
			createdAt: "2024-02-28",
			stepExecutions: [
				{
					id: "S1",
					stepNumber: 1,
					stepName: "Submit Request",
					stepType: "SUBMISSION",
					assigneeType: "REQUESTER",
					assigneeName: "Mark Wilson",
					status: "COMPLETED",
					completedAt: "2024-02-28T09:00:00Z",
				},
				{
					id: "S2",
					stepNumber: 2,
					stepName: "Manager Approval",
					stepType: "APPROVAL",
					assigneeType: "SUPERVISOR",
					assigneeName: "Sarah Chen",
					status: "PENDING",
				},
			],
			currentStepId: "S2",
		},
		{
			id: "REQ-003",
			code: "REQ-003",
			type: RequestType.DOCUMENT_REQUEST,
			status: RequestStatus.PROCESSING,
			description: "Certificate of Employment for Visa",
			requesterName: "Elisa Wang",
			requesterAvatar: "EW",
			requesterPosition: "Product Manager",
			createdAt: "2024-02-27",
			stepExecutions: [
				{
					id: "S1",
					stepNumber: 1,
					stepName: "Submit Request",
					stepType: "SUBMISSION",
					assigneeType: "REQUESTER",
					assigneeName: "Elisa Wang",
					status: "COMPLETED",
				},
				{
					id: "S2",
					stepNumber: 2,
					stepName: "Generate Document",
					stepType: "TASK",
					assigneeType: "HR",
					assigneeName: "HR Team",
					status: "IN_PROGRESS",
				},
			],
			currentStepId: "S2",
		},
		{
			id: "REQ-004",
			code: "REQ-004",
			type: RequestType.TIME_ADJUSTMENT,
			status: RequestStatus.REJECTED,
			description: "Forgot to clock out on Monday",
			requesterName: "David Kim",
			requesterAvatar: "DK",
			requesterPosition: "Designer",
			createdAt: "2024-02-26",
			stepExecutions: [
				{
					id: "S1",
					stepNumber: 1,
					stepName: "Submit Request",
					stepType: "SUBMISSION",
					assigneeType: "REQUESTER",
					assigneeName: "David Kim",
					status: "COMPLETED",
				},
				{
					id: "S2",
					stepNumber: 2,
					stepName: "Manager Approval",
					stepType: "APPROVAL",
					assigneeType: "SUPERVISOR",
					assigneeName: "Rachel Lee",
					status: "REJECTED",
					note: "Timesheet was already locked for Monday.",
				},
			],
			currentStepId: "S2",
		},
		{
			id: "REQ-005",
			code: "REQ-005",
			type: RequestType.EXPENSE_REIMBURSEMENT,
			status: RequestStatus.APPROVED,
			description: "Client dinner with XYZ Corp",
			requesterName: "Tom Hardy",
			requesterAvatar: "TH",
			requesterPosition: "Sales Executive",
			createdAt: "2024-02-20",
			stepExecutions: [
				{
					id: "S1",
					stepNumber: 1,
					stepName: "Submit Request",
					stepType: "SUBMISSION",
					assigneeType: "REQUESTER",
					assigneeName: "Tom Hardy",
					status: "COMPLETED",
				},
				{
					id: "S2",
					stepNumber: 2,
					stepName: "Finance Approval",
					stepType: "APPROVAL",
					assigneeType: "SUPERVISOR",
					assigneeName: "Finance Team",
					status: "COMPLETED",
				},
				{
					id: "S3",
					stepNumber: 3,
					stepName: "Payout Issue",
					stepType: "TASK",
					assigneeType: "HR",
					assigneeName: "Finance Team",
					status: "COMPLETED",
				},
			],
		},
		{
			id: "REQ-006",
			code: "REQ-006",
			type: RequestType.PROMOTION,
			status: RequestStatus.IN_REVIEW,
			description: "Promotion to Tech Lead",
			requesterName: "Alicia Keys",
			requesterAvatar: "AK",
			requesterPosition: "Senior Dev",
			createdAt: "2024-02-15",
			stepExecutions: [
				{
					id: "S1",
					stepNumber: 1,
					stepName: "Manager Nomination",
					stepType: "SUBMISSION",
					assigneeType: "SUPERVISOR",
					assigneeName: "Sarah Chen",
					status: "COMPLETED",
				},
				{
					id: "S2",
					stepNumber: 2,
					stepName: "Department Head Approval",
					stepType: "APPROVAL",
					assigneeType: "SUPERVISOR",
					assigneeName: "VP of Eng",
					status: "COMPLETED",
				},
				{
					id: "S3",
					stepNumber: 3,
					stepName: "HR Review & Budgeting",
					stepType: "APPROVAL",
					assigneeType: "HR",
					assigneeName: "HR Team",
					status: "IN_PROGRESS",
				},
			],
			currentStepId: "S3",
		},
		{
			id: "REQ-007",
			code: "REQ-007",
			type: RequestType.LEAVE,
			status: RequestStatus.PENDING,
			description: "Sick Leave - Flu",
			requesterName: "Ben Foster",
			requesterAvatar: "BF",
			requesterPosition: "QA Analyst",
			startDate: "2024-02-28",
			endDate: "2024-02-29",
			createdAt: "2024-02-28",
			stepExecutions: [
				{
					id: "S1",
					stepNumber: 1,
					stepName: "Submit Request",
					stepType: "SUBMISSION",
					assigneeType: "REQUESTER",
					assigneeName: "Ben Foster",
					status: "COMPLETED",
				},
				{
					id: "S2",
					stepNumber: 2,
					stepName: "Manager Approval",
					stepType: "APPROVAL",
					assigneeType: "SUPERVISOR",
					assigneeName: "Robert Davis",
					status: "PENDING",
				},
			],
			currentStepId: "S2",
			metadata: { request_details: { leaveType: "SICK" } },
		},
		{
			id: "REQ-008",
			code: "REQ-008",
			type: RequestType.RESIGNATION,
			status: RequestStatus.PROCESSING,
			description: "Notice of Resignation",
			requesterName: "Chloe Grace",
			requesterAvatar: "CG",
			requesterPosition: "Content Writer",
			createdAt: "2024-02-10",
			stepExecutions: [
				{
					id: "S1",
					stepNumber: 1,
					stepName: "Submit Notice",
					stepType: "SUBMISSION",
					assigneeType: "REQUESTER",
					assigneeName: "Chloe Grace",
					status: "COMPLETED",
				},
				{
					id: "S2",
					stepNumber: 2,
					stepName: "Acknowledge Resignation",
					stepType: "APPROVAL",
					assigneeType: "SUPERVISOR",
					assigneeName: "Manager",
					status: "COMPLETED",
				},
				{
					id: "S3",
					stepNumber: 3,
					stepName: "Exit Interview",
					stepType: "TASK",
					assigneeType: "HR",
					assigneeName: "HR Team",
					status: "IN_PROGRESS",
				},
			],
			currentStepId: "S3",
		},
		{
			id: "REQ-009",
			code: "REQ-009",
			type: RequestType.TRANSFER,
			status: RequestStatus.IN_REVIEW,
			description: "Transfer to Design Team",
			requesterName: "David Kim",
			requesterAvatar: "DK",
			requesterPosition: "Frontend Dev",
			createdAt: "2024-02-22",
			stepExecutions: [
				{
					id: "S1",
					stepNumber: 1,
					stepName: "Apply for Transfer",
					stepType: "SUBMISSION",
					assigneeType: "REQUESTER",
					assigneeName: "David Kim",
					status: "COMPLETED",
				},
				{
					id: "S2",
					stepNumber: 2,
					stepName: "Current Manager Approval",
					stepType: "APPROVAL",
					assigneeType: "SUPERVISOR",
					assigneeName: "Rachel Lee",
					status: "COMPLETED",
				},
				{
					id: "S3",
					stepNumber: 3,
					stepName: "New Manager Approval",
					stepType: "APPROVAL",
					assigneeType: "SUPERVISOR",
					assigneeName: "Design Lead",
					status: "IN_PROGRESS",
				},
			],
			currentStepId: "S3",
		},
		{
			id: "REQ-010",
			code: "REQ-010",
			type: RequestType.OVERTIME,
			status: RequestStatus.APPROVED,
			description: "Q1 Final Prep",
			requesterName: "Elisa Wang",
			requesterAvatar: "EW",
			requesterPosition: "Product Manager",
			createdAt: "2024-02-20",
			stepExecutions: [
				{
					id: "S1",
					stepNumber: 1,
					stepName: "Submit Request",
					stepType: "SUBMISSION",
					assigneeType: "REQUESTER",
					assigneeName: "Elisa Wang",
					status: "COMPLETED",
				},
				{
					id: "S2",
					stepNumber: 2,
					stepName: "Manager Approval",
					stepType: "APPROVAL",
					assigneeType: "SUPERVISOR",
					assigneeName: "Rachel Lee",
					status: "COMPLETED",
				},
			],
		},
		{
			id: "REQ-011",
			code: "REQ-011",
			type: RequestType.EXPENSE_REIMBURSEMENT,
			status: RequestStatus.PENDING,
			description: "Monthly Internet Allowance",
			requesterName: "Mark Wilson",
			requesterAvatar: "MW",
			requesterPosition: "Senior Engineer",
			createdAt: "2024-02-28",
			stepExecutions: [
				{
					id: "S1",
					stepNumber: 1,
					stepName: "Submit Request",
					stepType: "SUBMISSION",
					assigneeType: "REQUESTER",
					assigneeName: "Mark Wilson",
					status: "COMPLETED",
				},
				{
					id: "S2",
					stepNumber: 2,
					stepName: "Finance Approval",
					stepType: "APPROVAL",
					assigneeType: "SUPERVISOR",
					assigneeName: "Finance",
					status: "PENDING",
				},
			],
			currentStepId: "S2",
		},
		{
			id: "REQ-012",
			code: "REQ-012",
			type: RequestType.DOCUMENT_REQUEST,
			status: RequestStatus.COMPLETED,
			description: "Payslip Copy Jan 2024",
			requesterName: "Tom Hardy",
			requesterAvatar: "TH",
			requesterPosition: "Sales Executive",
			createdAt: "2024-02-05",
			stepExecutions: [
				{
					id: "S1",
					stepNumber: 1,
					stepName: "Submit Request",
					stepType: "SUBMISSION",
					assigneeType: "REQUESTER",
					assigneeName: "Tom Hardy",
					status: "COMPLETED",
				},
				{
					id: "S2",
					stepNumber: 2,
					stepName: "Generate Document",
					stepType: "TASK",
					assigneeType: "HR",
					assigneeName: "HR Team",
					status: "COMPLETED",
				},
			],
		},
		{
			id: "REQ-013",
			code: "REQ-013",
			type: RequestType.LEAVE,
			status: RequestStatus.CANCELLED,
			description: "Personal Leave",
			requesterName: "Janice Smith",
			requesterAvatar: "JS",
			requesterPosition: "Marketing Lead",
			createdAt: "2024-02-18",
			stepExecutions: [
				{
					id: "S1",
					stepNumber: 1,
					stepName: "Submit Request",
					stepType: "SUBMISSION",
					assigneeType: "REQUESTER",
					assigneeName: "Janice Smith",
					status: "SKIPPED",
					note: "Cancelled by user",
				},
			],
			metadata: { request_details: { leaveType: "PERSONAL" } },
		},
		{
			id: "REQ-014",
			code: "REQ-014",
			type: RequestType.TERMINATION,
			status: RequestStatus.IN_REVIEW,
			description: "Contract Non-renewal",
			requesterName: "HR Dept",
			requesterAvatar: "HR",
			requesterPosition: "HR Manager",
			createdAt: "2024-02-25",
			stepExecutions: [
				{
					id: "S1",
					stepNumber: 1,
					stepName: "Draft Notice",
					stepType: "SUBMISSION",
					assigneeType: "HR",
					assigneeName: "HR User",
					status: "COMPLETED",
				},
				{
					id: "S2",
					stepNumber: 2,
					stepName: "Legal Approval",
					stepType: "APPROVAL",
					assigneeType: "SUPERVISOR",
					assigneeName: "Legal Team",
					status: "IN_PROGRESS",
				},
			],
			currentStepId: "S2",
		},
		{
			id: "REQ-015",
			code: "REQ-015",
			type: RequestType.REGULARIZATION,
			status: RequestStatus.PROCESSING,
			description: "Six-month Probation Completion",
			requesterName: "Ben Foster",
			requesterAvatar: "BF",
			requesterPosition: "QA Analyst",
			createdAt: "2024-02-10",
			stepExecutions: [
				{
					id: "S1",
					stepNumber: 1,
					stepName: "Performance Evaluation",
					stepType: "TASK",
					assigneeType: "SUPERVISOR",
					assigneeName: "Robert Davis",
					status: "COMPLETED",
				},
				{
					id: "S2",
					stepNumber: 2,
					stepName: "HR Finalize Paperwork",
					stepType: "TASK",
					assigneeType: "HR",
					assigneeName: "HR Team",
					status: "IN_PROGRESS",
				},
			],
			currentStepId: "S2",
		},
	];
};

// --- CATEGORY MAPPINGS ---
export const CategoryMap: Record<string, RequestType[]> = {
	"Leave Request": [RequestType.LEAVE],
	Timesheet: [RequestType.TIMESHEET],
	"File Documents": [RequestType.DOCUMENT_REQUEST],
	"PAN Request": [
		RequestType.RESIGNATION,
		RequestType.TERMINATION,
		RequestType.REGULARIZATION,
		RequestType.PROMOTION,
		RequestType.SALARY_CHANGE,
		RequestType.TRANSFER,
	],
	Other: [RequestType.OTHER],
};

const getTypeEmojiAndLabel = (type: RequestType, metadata?: any) => {
	switch (type) {
		case RequestType.LEAVE:
			let leaveLabel = "Leave";
			if (metadata?.request_details?.leaveType) {
				const specificLeaveType = metadata.request_details.leaveType.toLowerCase();
				leaveLabel =
					specificLeaveType.charAt(0).toUpperCase() +
					specificLeaveType.slice(1) +
					" Leave";
			}
			return { emoji: "🏖️", label: leaveLabel };
		case RequestType.OVERTIME:
			return { emoji: "⏰", label: "Overtime" };
		case RequestType.EXPENSE_REIMBURSEMENT:
			return { emoji: "💰", label: "Expense" };
		case RequestType.DOCUMENT_REQUEST:
			return { emoji: "📄", label: "Document" };
		case RequestType.TIME_ADJUSTMENT:
			return { emoji: "⏱️", label: "Time Adj." };
		case RequestType.TIMESHEET:
			if (metadata?.timesheetAction === "EDIT_PERMISSION") {
				return { emoji: "🕒", label: "Timesheet Edit Permission" };
			}
			return { emoji: "📋", label: "Timesheet Submission" };
		case RequestType.PROMOTION:
			return { emoji: "🚀", label: "Promotion" };
		case RequestType.TRANSFER:
			return { emoji: "🔄", label: "Transfer" };
		case RequestType.RESIGNATION:
			return { emoji: "👋", label: "Resignation" };
		case RequestType.TERMINATION:
			return { emoji: "🛑", label: "Termination" };
		case RequestType.REGULARIZATION:
			return { emoji: "✅", label: "Regularization" };
		default:
			return { emoji: "📝", label: "Other" };
	}
};

const getStatusBadgeVariant = (status: RequestStatus) => {
	switch (status) {
		case RequestStatus.OPEN:
			return "secondary";
		case RequestStatus.SUBMITTED:
			return "warning-soft";
		case RequestStatus.PENDING:
			return "warning-soft";
		case RequestStatus.IN_REVIEW:
			return "info";
		case RequestStatus.PROCESSING:
			return "primary-soft";
		case RequestStatus.APPROVED:
			return "success-soft";
		case RequestStatus.REJECTED:
			return "destructive-soft";
		case RequestStatus.CANCELLED:
			return "secondary";
		case RequestStatus.COMPLETED:
			return "default";
		default:
			return "outline";
	}
};

const getStatusBadgeColor = (status: RequestStatus) => {
	switch (status) {
		case RequestStatus.OPEN:
			return {
				border: "border-slate-200",
				bg: "bg-slate-50/50",
				text: "text-slate-800",
				badgeBg: "bg-slate-500",
			};
		case RequestStatus.SUBMITTED:
			return {
				border: "border-amber-200",
				bg: "bg-amber-50/50",
				text: "text-amber-800",
				badgeBg: "bg-amber-500",
			};
		case RequestStatus.PENDING:
			return {
				border: "border-orange-200",
				bg: "bg-orange-50/50",
				text: "text-orange-800",
				badgeBg: "bg-orange-500",
			};
		case RequestStatus.IN_REVIEW:
			return {
				border: "border-blue-200",
				bg: "bg-blue-50/50",
				text: "text-blue-800",
				badgeBg: "bg-blue-500",
			};
		case RequestStatus.PROCESSING:
			return {
				border: "border-purple-200",
				bg: "bg-purple-50/50",
				text: "text-purple-800",
				badgeBg: "bg-purple-500",
			};
		case RequestStatus.APPROVED:
		case RequestStatus.COMPLETED:
			return {
				border: "border-emerald-200",
				bg: "bg-emerald-50/50",
				text: "text-emerald-800",
				badgeBg: "bg-emerald-500",
			};
		case RequestStatus.REJECTED:
		case RequestStatus.CANCELLED:
			return {
				border: "border-rose-200",
				bg: "bg-rose-50/50",
				text: "text-rose-800",
				badgeBg: "bg-rose-500",
			};
		default:
			return {
				border: "border-gray-200",
				bg: "bg-gray-50/50",
				text: "text-gray-800",
				badgeBg: "bg-gray-500",
			};
	}
};

const getAssigneePillColor = (type: string) => {
	switch (type) {
		case "REQUESTER":
			return "bg-slate-100 text-slate-700 border-slate-200";
		case "SUPERVISOR":
			return "bg-blue-100 text-blue-700 border-blue-200";
		case "HR":
			return "bg-purple-100 text-purple-700 border-purple-200";
		default:
			return "bg-gray-100 text-gray-700 border-gray-200";
	}
};

const getStepActions = (
	stepType: string,
	status: string,
): { label: string; variant: "default" | "destructive" | "outline" | "secondary" }[] => {
	if (status !== "IN_PROGRESS" && status !== "PENDING" && status !== "REJECTED") return [];
	if (status === "REJECTED") return [{ label: "Resubmit", variant: "secondary" }];

	if (stepType === "SUBMISSION") return [{ label: "Cancel Request", variant: "outline" }];
	if (stepType === "APPROVAL")
		return [
			{ label: "Approve", variant: "default" },
			{ label: "Reject", variant: "destructive" },
		];
	if (stepType === "TASK") return [{ label: "Mark Done", variant: "default" }];
	return [];
};

function WorkflowBoardSkeleton() {
	return (
		<div className="space-y-6 max-w-7xl mx-auto p-4 md:p-8">
			<div className="flex items-center justify-between">
				<Skeleton className="h-8 w-56" />
			</div>

			<div className="flex bg-gray-50 p-1.5 rounded-2xl w-full overflow-x-auto border border-gray-100 gap-1">
				{Array.from({ length: 5 }).map((_, idx) => (
					<div
						key={idx}
						className="flex-1 min-w-[140px] rounded-xl bg-white px-3 py-2 border border-gray-100">
						<div className="flex items-center justify-between gap-2">
							<Skeleton className="h-4 w-24" />
							<Skeleton className="h-5 w-8 rounded-full" />
						</div>
					</div>
				))}
			</div>

			<div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
				<div className="p-4 space-y-3">
					{Array.from({ length: 6 }).map((_, idx) => (
						<div
							key={idx}
							className="rounded-xl border border-neutral-200 bg-neutral-50/50 overflow-hidden">
							<div className="w-full flex items-center justify-between px-4 py-3">
								<div className="flex items-center gap-3">
									<Skeleton className="w-1.5 h-1.5 rounded-full" />
									<Skeleton className="h-4 w-40" />
								</div>
								<Skeleton className="h-6 w-10 rounded-full" />
							</div>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}

// --- COMPONENTS ---
export default function WorkflowBoardMockup() {
	const navigate = useNavigate();
	const { user } = useAuth();
	const userRole = user?.role || "";
	const userId = user?.metadata?.employee?.id || "";
	const isManager = userRole === "hris-employee-manager";
	const isHR = userRole === "hris-hr-manager" || userRole === "hris-hr-user";

	// Managers only see Leave Request and Timesheet categories
	const ManagerCategories = ["Leave Request", "Timesheet"];

	const visibleCategories = useMemo(() => {
		if (isManager) {
			return Object.fromEntries(
				Object.entries(CategoryMap).filter(([key]) => ManagerCategories.includes(key)),
			);
		}
		// HR and admin see everything
		return CategoryMap;
	}, [isManager]);

	const [activeCategory, setActiveCategory] = useState<string>(() => {
		return isManager ? "Leave Request" : "Leave Request";
	});
	const [selectedType, setSelectedType] = useState<RequestType | null>(null);

	const [viewMode, setViewMode] = useState<"KANBAN" | "TABLE">("TABLE");
	const [searchQuery, setSearchQuery] = useState("");
	const [searchParams, setSearchParams] = useSearchParams();
	const reqIdFromUrl = searchParams.get("requestId");

	const { data: requestsResponse, isLoading } = useRequests({
		limit: 1000,
		fields: "id,code,requesterId,requester.id,requester.person.personalInfo,requester.position.title,description,type,startDate,endDate,currentWorkflowStateKey,createdAt,stepExecutions,currentStepExecution,metadata",
	});

	const { mutate: approveRequest } = useApproveRequest();
	const { mutate: cancelRequest } = useCancelRequest();
	const { mutate: delegateRequestStep, isPending: isEscalatingStep } = useDelegateRequestStep();

	// Fetch custom statuses for the selected request type
	const { data: workflowStatusesResponse } = useWorkflowStatuses(selectedType ?? "");
	const customStatuses = useMemo<WorkflowStatusConfig[]>(() => {
		if (!workflowStatusesResponse?.statuses) return [];
		return [...workflowStatusesResponse.statuses].sort((a, b) => a.order - b.order);
	}, [workflowStatusesResponse]);

	// Fetch user's permissions for the selected workflow
	const templateCode = workflowStatusesResponse?.workflowCode ?? "";
	const { data: permissionsResponse, isLoading: isLoadingPermissions } =
		useWorkflowPermissions(templateCode);

	// Build a map: status key → permissions the current user has for that status
	const myPermissionsByStatus = useMemo<Record<string, string[]>>(() => {
		if (!permissionsResponse?.permissions) return {};
		return permissionsResponse.permissions;
	}, [permissionsResponse]);

	// True when the user's role is assigned to at least one status in the workflow.
	// Falls back to true when permissions haven't loaded yet (avoids flickering).
	const userHasWorkflowAccess = useMemo(() => {
		if (!templateCode) return true;
		// Still loading — optimistically allow until we know for sure.
		if (isLoadingPermissions || !permissionsResponse) return true;
		// Has at least one status with a non-empty permissions array.
		return Object.values(myPermissionsByStatus).some((perms) => perms.length > 0);
	}, [templateCode, isLoadingPermissions, permissionsResponse, myPermissionsByStatus]);

	// ── Pre-drill-down access map ─────────────────────────────────────────────
	// Batch-fetch statuses for every request type so we can gate counts and
	// list rows BEFORE the user opens a type's modal.
	const allVisibleTypes = useMemo(
		() => Array.from(new Set(Object.values(visibleCategories).flat())),
		[visibleCategories],
	);

	const typeStatusQueries = useQueries({
		queries: allVisibleTypes.map((type) => ({
			queryKey: queryKeys.requestWorkflowRuntime.statuses(type),
			queryFn: () => requestWorkflowRuntimeService.getStatusesByRequestType(type),
			staleTime: 5 * 60 * 1000,
		})),
	});

	// Build a map: requestType → boolean (does this role have access?)
	const accessByType = useMemo<Record<string, boolean>>(() => {
		const map: Record<string, boolean> = {};
		const isAdmin = ["super_admin", "superadmin", "admin", "hris-admin"].includes(
			(userRole || "").toLowerCase().trim(),
		);
		allVisibleTypes.forEach((type, idx) => {
			const result = typeStatusQueries[idx];
			// Still loading or errored → optimistically allow
			if (!result || result.isLoading || result.isError || !result.data) {
				map[type] = true;
				return;
			}
			const statuses = result.data.statuses || [];
			// No workflow configured → allow
			if (!result.data.workflowCode || statuses.length === 0) {
				map[type] = true;
				return;
			}
			if (isAdmin) {
				map[type] = true;
				return;
			}
			// Check if user's role appears in any status's assigned_roles
			map[type] = statuses.some((s: any) =>
				s.assigned_roles?.some(
					(r: string) => r.toLowerCase().trim() === (userRole || "").toLowerCase().trim(),
				),
			);
		});
		return map;
	}, [allVisibleTypes, typeStatusQueries, userRole]);

	// Build a lookup map: status key → WorkflowStatusConfig
	const statusConfigMap = useMemo(() => {
		const map: Record<string, WorkflowStatusConfig> = {};
		customStatuses.forEach((s) => (map[s.key] = s));
		return map;
	}, [customStatuses]);

	const data = useMemo<RequestItem[]>(() => {
		if (!requestsResponse?.requests) return [];
		return requestsResponse.requests.map((req: any) => {
			const firstName = req.requester?.person?.personalInfo?.firstName || "";
			const lastName = req.requester?.person?.personalInfo?.lastName || "";
			const name = `${firstName} ${lastName}`.trim() || "Unknown Requester";
			const initials =
				name !== "Unknown Requester"
					? name
							.split(" ")
							.map((n: string) => n[0])
							.join("")
							.substring(0, 2)
							.toUpperCase()
					: "??";

			const position = req.requester?.position?.title || "Employee";

			const stepExecutions =
				req.stepExecutions?.map((step: any) => ({
					id: step.id,
					stepNumber: step.stepNumber,
					stepName: step.stepName,
					stepType: step.stepType,
					assigneeType: step.assigneeType,
					assigneeName: step.assignee?.person?.personalInfo?.firstName
						? `${step.assignee.person.personalInfo.firstName} ${step.assignee.person.personalInfo.lastName}`.trim()
						: step.assigneeType,
					status: step.status,
					completedAt: step.completedAt,
					note: step.comments,
				})) || [];

			return {
				id: req.id,
				code: req.code || req.id.substring(0, 8),
				type: req.type as RequestType,
				requesterId: req.requesterId,
				status: (req.currentWorkflowStateKey || "OPEN") as RequestStatus,
				description: req.description || "No description provided",
				requesterName: name,
				requesterAvatar: initials,
				requesterPosition: position,
				startDate: req.startDate,
				endDate: req.endDate,
				createdAt: req.createdAt,
				stepExecutions,
				currentStepId: req.currentStepExecution?.id,
				metadata: req.metadata,
				requester: req.requester ? { id: req.requester.id } : null,
			};
		});
	}, [requestsResponse]);

	const selectedReq = useMemo(() => {
		if (!reqIdFromUrl) return null;
		return data.find((r) => r.id === reqIdFromUrl) || null;
	}, [reqIdFromUrl, data]);

	const setSelectedReq = (req: RequestItem | null) => {
		if (req) {
			const timesheetDeepLink = getTimesheetDeepLink({
				type: req.type,
				metadata: req.metadata,
				requesterId: req.requesterId || "",
				requester: req.requester,
			});
			if (timesheetDeepLink) {
				navigate(timesheetDeepLink);
				return;
			}

			setSearchParams(
				(prev) => {
					prev.set("requestId", req.id);
					return prev;
				},
				{ preventScrollReset: true },
			);
		} else {
			setSearchParams(
				(prev) => {
					prev.delete("requestId");
					return prev;
				},
				{ preventScrollReset: true },
			);
		}
	};

	// Table View States
	const [groupBy, setGroupBy] = useState<"STATUS" | "TYPE" | "ASSIGNEE">("STATUS");
	const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

	// Filtering Active List based on drill-down state
	const filteredData = useMemo(() => {
		return data.filter((req) => {
			if (selectedType && req.type !== selectedType) return false;

			// Role-based visibility: hide requests when the user's role is not
			// assigned to any status in this workflow (same gate used for counts).
			if (selectedType && accessByType[selectedType] === false) return false;

			if (searchQuery) {
				const q = searchQuery.toLowerCase();
				return (
					req.code.toLowerCase().includes(q) ||
					req.description.toLowerCase().includes(q) ||
					req.requesterName.toLowerCase().includes(q)
				);
			}
			return true;
		});
	}, [data, selectedType, searchQuery, accessByType]);

	// Grouping for both Kanban and Table — use custom statuses if available
	const groupedByStatus = useMemo(() => {
		const groups: Record<string, RequestItem[]> = {};
		if (customStatuses.length > 0) {
			// Initialize groups from custom statuses (ordered)
			customStatuses.forEach((s) => (groups[s.key] = []));
			filteredData.forEach((req) => {
				if (groups[req.status]) {
					groups[req.status].push(req);
				} else {
					// Fallback bucket for statuses not in the config
					if (!groups["_OTHER"]) groups["_OTHER"] = [];
					groups["_OTHER"].push(req);
				}
			});
		} else {
			// Fallback to hardcoded enum
			Object.values(RequestStatus).forEach((s) => (groups[s] = []));
			filteredData.forEach((req) => {
				if (!groups[req.status]) {
					groups[req.status] = [];
				}
				groups[req.status].push(req);
			});
		}
		return groups;
	}, [filteredData, customStatuses]);

	const activeTabsCount = useMemo(() => {
		const counts: Record<string, number> = { ALL: 0 };
		data.forEach((req) => {
			// Only count this request if the user has access to its workflow.
			const hasAccess = accessByType[req.type] !== false;
			if (hasAccess) {
				counts[req.type] = (counts[req.type] || 0) + 1;
				counts.ALL = (counts.ALL || 0) + 1;
			}
		});
		return counts;
	}, [data, accessByType]);

	const handleAction = (request: RequestItem, action: string, note?: string) => {
		// Permission guard: check if user has permission for this action on this status
		const permsForStatus = myPermissionsByStatus[request.status];
		if (permsForStatus && permsForStatus.length > 0) {
			const requiredPerm =
				action === "Approve"
					? "approve"
					: action === "Reject"
						? "reject"
						: action === "Cancel Request"
							? "cancel"
							: action === "Mark Complete"
								? "complete"
								: action === "Reopen"
									? "reopen"
									: null;

			if (requiredPerm && !permsForStatus.includes(requiredPerm)) {
				toast.error("You don't have permission to perform this action.", {
					description: `Missing '${requiredPerm}' permission for status '${request.status}'.`,
				});
				return;
			}
		}

		if (action === "Approve") {
			approveRequest({ id: request.id, action: "approve", comment: note });
		} else if (action === "Reject") {
			approveRequest({ id: request.id, action: "reject", comment: note });
		} else if (action === "Cancel Request") {
			cancelRequest({ id: request.id, reason: note });
		} else {
			toast.success(`Action '${action}' recorded.`, {
				description: note ? `Note: ${note}` : "",
			});
		}
		setSelectedReq(null);
	};

	const handleEscalate = (requestId: string) => {
		delegateRequestStep(
			{ requestId, mode: "REASSIGN" },
			{
				onSuccess: () => {
					setSelectedReq(null);
				},
			},
		);
	};

	const summaryColumns = [
		{
			key: "label",
			label: "Request Type",
			render: (_: any, item: any) => (
				<div className="flex items-center gap-3">
					<span className="text-xl">{item.emoji}</span>
					<span className="font-semibold text-gray-900">{item.label}</span>
				</div>
			),
		},
		{
			key: "count",
			label: "Active Requests",
			render: (_: any, item: any) => (
				<Badge variant="secondary" className="px-2.5 py-1 text-sm bg-gray-100 font-bold">
					{item.count}
				</Badge>
			),
		},
	];

	const summaryData = useMemo(() => {
		if (selectedType !== null) return [];
		if (!visibleCategories[activeCategory]) return [];
		return visibleCategories[activeCategory].map((type) => {
			const { emoji, label } = getTypeEmojiAndLabel(type);
			return {
				type,
				emoji,
				label,
				count: activeTabsCount[type] || 0,
			};
		});
	}, [activeCategory, selectedType, activeTabsCount]);

	if (isLoading) {
		return <WorkflowBoardSkeleton />;
	}

	return (
		<div className="space-y-6 max-w-7xl mx-auto p-4 md:p-8 relative">
			{/* Page Header */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold text-gray-900 overflow-hidden">
						Request Workflows
					</h1>
				</div>
			</div>
			<div className="flex bg-gray-50 p-1.5 rounded-2xl w-full overflow-x-auto scroller-hide border border-gray-100 gap-1">
				{Object.keys(visibleCategories).map((catName) => {
					const totalInCategory = visibleCategories[catName].reduce(
						(acc, type) => acc + (activeTabsCount[type] || 0),
						0,
					);

					if (totalInCategory === 0 && catName === "Other") return null;

					return (
						<button
							key={catName}
							onClick={() => setActiveCategory(catName)}
							className={`flex-1 min-w-fit py-2 px-4 text-[14px] font-medium rounded-xl transition-all whitespace-nowrap flex items-center justify-center gap-2 ${
								activeCategory === catName
									? "bg-white text-orange-600 shadow-sm border border-gray-100/50"
									: "text-slate-600 hover:text-slate-900 hover:bg-white/50"
							}`}>
							{catName}
							{totalInCategory > 0 && (
								<span
									className={`text-[11px] font-bold px-2 py-0.5 rounded-full flex items-center justify-center min-w-[1.5rem] ${
										activeCategory === catName
											? "bg-orange-100/80 text-orange-700"
											: "bg-slate-200/80 text-slate-700"
									}`}>
									{totalInCategory}
								</span>
							)}
						</button>
					);
				})}
			</div>

			<>
				<div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
					<div className="p-4 space-y-2">
						{(visibleCategories[activeCategory] || []).map((type) => {
							const { label } = getTypeEmojiAndLabel(type);
							const hasAccess = accessByType[type] !== false;
							const count = hasAccess ? activeTabsCount[type] || 0 : 0;

							return (
								<div
									key={type}
									onClick={() => hasAccess && setSelectedType(type)}
									className={`rounded-xl border border-neutral-200 bg-neutral-50/50 overflow-hidden ${
										hasAccess
											? "cursor-pointer group"
											: "cursor-not-allowed opacity-50"
									}`}>
									<div className="w-full flex items-center justify-between px-4 py-3 text-left transition-colors hover:opacity-80 bg-gradient-to-r from-neutral-100 to-neutral-50 text-neutral-700">
										<div className="flex items-center gap-3">
											<span className="w-1.5 h-1.5 rounded-full bg-gray-400 group-hover:bg-gray-600 transition-colors flex-shrink-0" />
											<span className="font-semibold text-sm text-gray-700">
												{label}
											</span>
										</div>
										<div className="flex items-center gap-3">
											<span
												className={`text-xs font-black px-2.5 py-0.5 rounded-full shadow-sm flex items-center justify-center min-w-[1.5rem] ${count > 0 ? "bg-neutral-500 text-white" : "bg-neutral-200 text-neutral-400"}`}>
												{count}
											</span>
										</div>
									</div>
								</div>
							);
						})}
						{(visibleCategories[activeCategory] || []).length === 0 && (
							<div className="text-center py-8 text-gray-500">
								No request types mapped to this category.
							</div>
						)}
					</div>
				</div>
			</>

			{/* DRILL-DOWN MODAL */}
			<Modal
				open={selectedType !== null && !selectedReq}
				onOpenChange={(open) => {
					if (!open) setSelectedType(null);
				}}
				title={
					selectedType ? (
						<div className="flex items-center gap-2">
							<span className="font-bold text-gray-900 text-base">
								{getTypeEmojiAndLabel(selectedType).label} Requests
							</span>
							<Badge
								variant="secondary"
								className="font-semibold bg-rose-100/80 text-rose-600 px-2.5 py-0.5 text-[11px] rounded-full ml-1">
								{(accessByType[selectedType] !== false
									? activeTabsCount[selectedType]
									: 0) || 0}{" "}
								total active
							</Badge>
						</div>
					) : undefined
				}
				description={
					selectedType
						? `Manage all active workflows for ${getTypeEmojiAndLabel(selectedType).label.toLowerCase()}`
						: undefined
				}
				className="max-w-[1000px] w-full flex flex-col h-[75vh] p-8 gap-6 shadow-xl border-0">
				{selectedType && (
					<div className="flex flex-col h-full w-full overflow-hidden bg-white">
						{/* Modal Header Action Bar */}
						<div className="bg-white pb-4 border-b border-gray-100 flex items-center justify-between shrink-0 mb-4">
							<div className="relative">
								<Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
								<input
									type="text"
									placeholder="Search requests..."
									value={searchQuery}
									onChange={(e) => setSearchQuery(e.target.value)}
									className="pl-9 pr-4 py-2 border border-gray-200 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 w-72 transition-all shadow-sm"
								/>
							</div>

							<div className="flex bg-gray-50/80 p-1 rounded-full border border-gray-100 h-fit shadow-sm">
								<Tabs
									defaultValue="TABLE"
									className="w-[200px]"
									onValueChange={(v: string) =>
										setViewMode(v as "KANBAN" | "TABLE")
									}>
									<TabsList className="grid w-full grid-cols-2 bg-transparent">
										<TabsTrigger
											value="KANBAN"
											className="flex gap-2 text-xs rounded-full data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-gray-900 text-gray-500 py-1.5 font-medium">
											<Kanban className="w-3.5 h-3.5" /> Kanban
										</TabsTrigger>
										<TabsTrigger
											value="TABLE"
											className="flex gap-2 text-xs rounded-full data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-gray-900 text-gray-500 py-1.5 font-medium">
											<List className="w-3.5 h-3.5" /> Table
										</TabsTrigger>
									</TabsList>
								</Tabs>
							</div>
						</div>

						{/* Modal Content Area */}
						<div className="bg-white flex-1 overflow-auto h-full scrollbar-bottom">
							{isLoadingPermissions ? (
								<div className="flex items-center justify-center h-full py-20">
									<Loader2 className="w-6 h-6 animate-spin text-orange-500" />
								</div>
							) : viewMode === "KANBAN" ? (
								<KanbanView
									data={groupedByStatus}
									onCardClick={setSelectedReq}
									statusConfigMap={statusConfigMap}
								/>
							) : (
								<TableView
									data={filteredData}
									groupedByStatus={groupedByStatus}
									statusConfigMap={statusConfigMap}
									groupBy={groupBy}
									setGroupBy={setGroupBy}
									expanded={expandedGroups}
									setExpanded={setExpandedGroups}
									onRowClick={setSelectedReq}
								/>
							)}
						</div>
					</div>
				)}
			</Modal>

			{/* DETAIL MODAL */}
			{selectedReq && (
				<RequestDetailModal
					request={selectedReq}
					isOpen={true}
					onClose={() => setSelectedReq(null)}
					onAction={handleAction}
					statusConfigMap={statusConfigMap}
					myPermissionsByStatus={myPermissionsByStatus}
					isLoadingPermissions={isLoadingPermissions}
					templateCode={templateCode}
					onEscalate={handleEscalate}
					isEscalating={isEscalatingStep}
				/>
			)}
		</div>
	);
}

// --- KANBAN VIEW ---
function KanbanView({
	data,
	onCardClick,
	statusConfigMap,
}: {
	data: Record<string, RequestItem[]>;
	onCardClick: (r: RequestItem) => void;
	statusConfigMap: Record<string, WorkflowStatusConfig>;
}) {
	const hasCustomStatuses = Object.keys(statusConfigMap).length > 0;
	// When custom statuses exist: show ALL custom status columns (even empty ones)
	// When falling back to enum: show only columns with data or the essential pending columns
	const visibleColumns = Object.keys(data).filter((status) => {
		if (hasCustomStatuses) {
			// Always show every custom status column; hide _OTHER bucket only when empty
			return statusConfigMap[status] !== undefined || (data[status]?.length ?? 0) > 0;
		}
		return data[status].length > 0 || isActiveWorkflowState(status);
	});

	return (
		<div className="flex gap-4 h-full overflow-x-auto pb-4 items-start scroller-hide px-1 pt-1">
			{visibleColumns.map((statusKey) => {
				const items = data[statusKey];
				const config = statusConfigMap[statusKey];
				const fallbackColor = getStatusBadgeColor(statusKey as RequestStatus);
				const displayLabel = config?.label || statusKey.replace(/_/g, " ");
				const hexColor = config?.color;

				return (
					<div
						key={statusKey}
						className={`w-[260px] flex-shrink-0 flex flex-col h-full rounded-xl border shadow-sm overflow-hidden ${
							!hexColor ? `${fallbackColor.bg} ${fallbackColor.border}` : ""
						}`}
						style={
							hexColor
								? { backgroundColor: `${hexColor}0D`, borderColor: `${hexColor}33` }
								: undefined
						}>
						{/* Column Header */}
						<div
							className={`py-3 px-3.5 flex items-center justify-between border-b bg-white/40 ${
								!hexColor ? fallbackColor.border : ""
							}`}
							style={hexColor ? { borderColor: `${hexColor}33` } : undefined}>
							<div className="flex items-center gap-2">
								<div
									className={`w-1.5 h-1.5 rounded-full ${!hexColor ? fallbackColor.badgeBg : ""}`}
									style={hexColor ? { backgroundColor: hexColor } : undefined}
								/>
								<h3
									className={`font-bold text-[11px] uppercase tracking-wider ${!hexColor ? fallbackColor.text : ""}`}
									style={hexColor ? { color: hexColor } : undefined}>
									{displayLabel}
								</h3>
							</div>
							<div
								className={`text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/60 border ${
									!hexColor ? `${fallbackColor.border} ${fallbackColor.text}` : ""
								}`}
								style={
									hexColor
										? { borderColor: `${hexColor}33`, color: hexColor }
										: undefined
								}>
								{items.length}
							</div>
						</div>

						{/* Column Content */}
						<div className="flex-1 overflow-y-auto space-y-2.5 custom-scrollbar p-2.5">
							{items.map((req) => (
								<KanbanCard
									key={req.id}
									request={req}
									onClick={() => onCardClick(req)}
								/>
							))}
							{items.length === 0 && (
								<div
									className={`border border-dashed rounded-xl p-4 flex flex-col items-center justify-center text-center mt-1 h-24 bg-white/30 ${
										!hexColor ? fallbackColor.border : ""
									}`}
									style={hexColor ? { borderColor: `${hexColor}33` } : undefined}>
									<div className="mb-1.5">
										<Check
											className={`w-3.5 h-3.5 opacity-50 ${!hexColor ? fallbackColor.text : ""}`}
											style={hexColor ? { color: hexColor } : undefined}
										/>
									</div>
									<p
										className={`text-[10px] font-medium opacity-60 ${!hexColor ? fallbackColor.text : ""}`}
										style={hexColor ? { color: hexColor } : undefined}>
										No requests
									</p>
								</div>
							)}
						</div>
					</div>
				);
			})}
		</div>
	);
}

function KanbanCard({ request, onClick }: { request: RequestItem; onClick: () => void }) {
	const { emoji, label } = getTypeEmojiAndLabel(request.type, request.metadata);

	return (
		<div
			onClick={onClick}
			className={`bg-white border text-left bg-clip-padding border-gray-200 rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:border-orange-300 hover:shadow-md transition-all cursor-pointer overflow-hidden group p-3 flex flex-col gap-2.5`}>
			<div className="flex items-center justify-between gap-2">
				<div className="flex items-center gap-2 min-w-0">
					<Avatar className="w-6 h-6 rounded-full border border-gray-100 shadow-sm object-cover flex-shrink-0">
						<AvatarFallback className="bg-orange-50 text-orange-600 uppercase text-[9px] font-bold">
							{request.requesterAvatar}
						</AvatarFallback>
					</Avatar>
					<p className="text-xs font-semibold text-gray-800 leading-tight truncate">
						{request.requesterName}
					</p>
				</div>

				<span className="text-[10px] font-medium text-gray-400 font-mono tracking-tight shrink-0">
					{new Date(request.createdAt).toLocaleDateString(undefined, {
						month: "short",
						day: "numeric",
					})}
				</span>
			</div>
			<div className="flex items-center gap-1.5 text-[10px] font-medium text-gray-500 bg-gray-50/80 w-fit px-2 py-1 rounded-md border border-gray-100">
				<span className="text-xs">{emoji}</span>
				<span className="truncate">
					{request.code} <span className="text-gray-300 mx-0.5">•</span>{" "}
					<span className="text-gray-600 font-semibold">{label}</span>
				</span>
			</div>
		</div>
	);
}

// --- TABLE VIEW ---
function TableView({
	data,
	groupedByStatus,
	statusConfigMap,
	groupBy,
	setGroupBy,
	expanded,
	setExpanded,
	onRowClick,
}: any) {
	const groups = useMemo(() => {
		// When grouping by STATUS, use the pre-computed groupedByStatus (which respects
		// custom status ordering and grouping when custom statuses exist)
		if (groupBy === "STATUS" && groupedByStatus) {
			return groupedByStatus as Record<string, RequestItem[]>;
		}
		const res: Record<string, RequestItem[]> = {};
		if (groupBy === "TYPE") {
			data.forEach((r: any) => {
				res[r.type] = res[r.type] || [];
				res[r.type].push(r);
			});
		} else {
			data.forEach((r: any) => {
				const step = r.stepExecutions.find((s: any) => s.id === r.currentStepId);
				const name = step ? step.assigneeName : "None/Done";
				res[name] = res[name] || [];
				res[name].push(r);
			});
		}
		return res;
	}, [data, groupedByStatus, statusConfigMap, groupBy]);

	const toggleGroup = (key: string) =>
		setExpanded((p: any) => ({ ...p, [key]: p[key] === false ? true : false }));

	return (
		<div className="bg-white rounded-xl shadow-sm border border-gray-200 h-full flex flex-col overflow-hidden">
			<div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50/50">
				<h3 className="font-semibold text-gray-800">List View</h3>
				<div className="flex items-center gap-2">
					<span className="text-sm text-gray-500">Group By:</span>
					<select
						value={groupBy}
						onChange={(e) => setGroupBy(e.target.value)}
						className="text-sm border border-gray-300 rounded-md py-1.5 px-3 focus:ring-2 focus:ring-orange-500 focus:outline-none">
						<option value="STATUS">Status</option>
						<option value="TYPE">Type</option>
						<option value="ASSIGNEE">Awaiting Assignee</option>
					</select>
				</div>
			</div>

			<div className="flex-1 overflow-auto">
				<table className="w-full text-left text-sm border-collapse">
					<thead className="sticky top-0 bg-white shadow-sm z-10 text-xs font-semibold text-gray-500 uppercase tracking-wider">
						<tr>
							<th className="px-6 py-4">Request</th>
							{groupBy !== "TYPE" && <th className="px-6 py-4">Type</th>}
							<th className="px-6 py-4">Requester</th>
							{groupBy !== "ASSIGNEE" && <th className="px-6 py-4">Awaiting</th>}
							{groupBy !== "STATUS" && <th className="px-6 py-4">Status</th>}
							<th className="px-6 py-4 text-center">Progress</th>
						</tr>
					</thead>
					<tbody>
						{Object.keys(groups).map((groupKey) => {
							const items = groups[groupKey];
							if (items.length === 0) return null;
							const isExpanded = expanded[groupKey] !== false;
							// Resolve custom status config for group header styling
							const groupStatusConfig = statusConfigMap?.[groupKey];
							const groupLabel =
								groupStatusConfig?.label || groupKey.replace(/_/g, " ");
							const groupColor = groupStatusConfig?.color;

							return (
								<React.Fragment key={groupKey}>
									<tr
										onClick={() => toggleGroup(groupKey)}
										className="border-y border-gray-200 cursor-pointer hover:opacity-90 transition-colors"
										style={
											groupColor
												? { backgroundColor: `${groupColor}0D` }
												: { backgroundColor: "#f9fafb" }
										}>
										<td colSpan={10} className="px-6 py-2">
											<div className="flex items-center gap-2">
												{isExpanded ? (
													<ChevronDown
														className="w-4 h-4"
														style={
															groupColor
																? { color: groupColor }
																: { color: "#6b7280" }
														}
													/>
												) : (
													<ChevronRight
														className="w-4 h-4"
														style={
															groupColor
																? { color: groupColor }
																: { color: "#6b7280" }
														}
													/>
												)}
												{groupColor && (
													<div
														className="w-2 h-2 rounded-full flex-shrink-0"
														style={{ backgroundColor: groupColor }}
													/>
												)}
												<span
													className="font-semibold text-sm"
													style={
														groupColor
															? { color: groupColor }
															: { color: "#374151" }
													}>
													{groupLabel}
												</span>
												<span
													className="px-2 py-0.5 rounded-full text-xs font-medium"
													style={
														groupColor
															? {
																	backgroundColor: `${groupColor}1A`,
																	color: groupColor,
																	border: `1px solid ${groupColor}33`,
																}
															: {
																	backgroundColor: "#e5e7eb",
																	color: "#4b5563",
																}
													}>
													{items.length}
												</span>
											</div>
										</td>
									</tr>
									{isExpanded &&
										items.map((req: any) => {
											const currentStep = req.stepExecutions.find(
												(s: any) => s.id === req.currentStepId,
											);
											const awaiting = currentStep
												? currentStep.assigneeName
												: "-";
											const { emoji, label } = getTypeEmojiAndLabel(
												req.type,
												req.metadata,
											);
											const statusBadgeVariant = getStatusBadgeVariant(
												req.status,
											);

											return (
												<tr
													key={req.id}
													onClick={() => onRowClick(req)}
													className="border-b border-gray-100 hover:bg-orange-50/30 cursor-pointer transition-colors">
													<td className="px-6 py-4">
														<p className="font-bold text-gray-900 group-hover:text-orange-600 mb-0.5">
															{req.code}
														</p>
														<p className="text-gray-500 text-xs truncate max-w-[250px]">
															{req.description}
														</p>
													</td>
													{groupBy !== "TYPE" && (
														<td className="px-6 py-4">
															<span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-700 bg-gray-100 px-2.5 py-1 rounded-md">
																<span>{emoji}</span> {label}
															</span>
														</td>
													)}
													<td className="px-6 py-4">
														<div className="flex items-center gap-2.5">
															<Avatar className="w-8 h-8 rounded-full border shadow-sm object-cover">
																<AvatarFallback className="bg-primary/10 text-primary uppercase text-[10px] font-bold">
																	{req.requesterAvatar}
																</AvatarFallback>
															</Avatar>
															<div>
																<p className="font-medium text-gray-900 text-xs">
																	{req.requesterName}
																</p>
																<p className="text-[10px] text-gray-500">
																	{req.requesterPosition}
																</p>
															</div>
														</div>
													</td>
													{groupBy !== "ASSIGNEE" && (
														<td className="px-6 py-4 text-sm text-gray-700">
															{awaiting}
														</td>
													)}
													{groupBy !== "STATUS" && (
														<td className="px-6 py-4">
															{statusConfigMap?.[req.status] ? (
																<Badge
																	className="capitalize"
																	style={{
																		backgroundColor: `${statusConfigMap[req.status].color}1A`,
																		color: statusConfigMap[
																			req.status
																		].color,
																		borderColor: `${statusConfigMap[req.status].color}33`,
																	}}>
																	{
																		statusConfigMap[req.status]
																			.label
																	}
																</Badge>
															) : (
																<Badge
																	variant={
																		statusBadgeVariant as any
																	}
																	className="capitalize">
																	{req.status
																		.replace(/_/g, " ")
																		.toLowerCase()}
																</Badge>
															)}
														</td>
													)}
													<td className="px-6 py-4 w-32 align-middle">
														<div className="flex flex-col gap-1 w-full">
															<div className="flex items-center justify-end w-full">
																<span className="text-[10px] font-semibold text-gray-500">
																	{Math.round(
																		(req.stepExecutions.filter(
																			(s: any) =>
																				[
																					"COMPLETED",
																					"APPROVED",
																					"SKIPPED",
																				].includes(
																					s.status,
																				),
																		).length /
																			req.stepExecutions
																				.length) *
																			100,
																	)}
																	%
																</span>
															</div>
															<Progress
																value={Math.round(
																	(req.stepExecutions.filter(
																		(s: any) =>
																			[
																				"COMPLETED",
																				"APPROVED",
																				"SKIPPED",
																			].includes(s.status),
																	).length /
																		req.stepExecutions.length) *
																		100,
																)}
																className="h-1.5 w-full bg-gray-100"
															/>
														</div>
													</td>
												</tr>
											);
										})}
								</React.Fragment>
							);
						})}
					</tbody>
				</table>
			</div>
		</div>
	);
}

// --- DETAIL MODAL ---
function RequestDetailModal({
	request,
	isOpen,
	onClose,
	onAction,
	statusConfigMap,
	myPermissionsByStatus,
	isLoadingPermissions = false,
	templateCode = "",
	onEscalate,
	isEscalating = false,
}: {
	request: RequestItem;
	isOpen: boolean;
	onClose: () => void;
	onAction: (request: RequestItem, action: string, note?: string) => void;
	statusConfigMap: Record<string, WorkflowStatusConfig>;
	myPermissionsByStatus: Record<string, string[]>;
	isLoadingPermissions?: boolean;
	templateCode?: string;
	onEscalate?: (requestId: string) => void;
	isEscalating?: boolean;
}) {
	const [noteOpenAction, setNoteOpenAction] = useState<any>(null);
	const [noteText, setNoteText] = useState("");

	const { emoji, label } = getTypeEmojiAndLabel(request.type, request.metadata);
	const statusBadgeVariant = getStatusBadgeVariant(request.status);

	// Get the current status config and its permissions
	const currentStatusConfig = statusConfigMap[request.status];
	const allowedTransitions = currentStatusConfig?.allowed_transitions ?? [];

	// Use server-returned permissions for this user on this status
	// Falls back to the status config permissions if server data not available
	const myPerms = myPermissionsByStatus[request.status] ?? currentStatusConfig?.permissions ?? [];

	// Build permission-aware action buttons — only show actions the current user has permission for
	const permissionActions = useMemo(() => {
		const actions: {
			label: string;
			variant: "default" | "destructive" | "outline" | "secondary";
			permission: string;
		}[] = [];
		if (myPerms.includes("approve") && allowedTransitions.includes("APPROVED")) {
			actions.push({ label: "Approve", variant: "default", permission: "approve" });
		}
		if (myPerms.includes("reject") && allowedTransitions.includes("REJECTED")) {
			actions.push({ label: "Reject", variant: "destructive", permission: "reject" });
		}
		if (myPerms.includes("cancel") && allowedTransitions.includes("CANCELLED")) {
			actions.push({ label: "Cancel Request", variant: "outline", permission: "cancel" });
		}
		if (myPerms.includes("complete") && allowedTransitions.includes("COMPLETED")) {
			actions.push({ label: "Mark Complete", variant: "default", permission: "complete" });
		}
		if (myPerms.includes("reopen") && allowedTransitions.includes("PENDING")) {
			actions.push({ label: "Reopen", variant: "secondary", permission: "reopen" });
		}
		return actions;
	}, [myPerms, allowedTransitions]);

	if (!isOpen) return null;

	return (
		<Modal
			open={true}
			onOpenChange={onClose}
			title="Workflow Details"
			description="Review timeline and workflow execution details"
			className="max-w-3xl">
			<div className="space-y-6 pt-2">
				<div className="grid gap-6 md:grid-cols-2">
					<DetailItem
						label="Request Code"
						value={
							<span className="font-mono text-sm">{request.code || request.id}</span>
						}
					/>
					<DetailItem
						label="Status"
						value={
							currentStatusConfig ? (
								<Badge
									className="capitalize"
									style={{
										backgroundColor: `${currentStatusConfig.color}1A`,
										color: currentStatusConfig.color,
										borderColor: `${currentStatusConfig.color}33`,
									}}>
									{currentStatusConfig.label}
								</Badge>
							) : (
								<Badge variant={statusBadgeVariant as any} className="capitalize">
									{request.status.replace(/_/g, " ").toLowerCase()}
								</Badge>
							)
						}
					/>
					<DetailItem
						label="Requester"
						value={
							<div className="flex items-center gap-2">
								<Avatar className="w-8 h-8 rounded-full border shadow-sm">
									<AvatarFallback className="text-[10px] bg-primary/10 text-primary font-bold">
										{request.requesterAvatar}
									</AvatarFallback>
								</Avatar>
								<div>
									<p className="font-medium text-gray-900 text-sm">
										{request.requesterName}
									</p>
								</div>
							</div>
						}
					/>
					<DetailItem label="Position" value={request.requesterPosition} />
					<DetailItem
						label="Workflow Type"
						value={
							<span className="flex items-center gap-1.5">
								<span>{emoji}</span> {label}
							</span>
						}
					/>
					<DetailItem
						label="Created At"
						value={new Date(request.createdAt).toLocaleDateString()}
					/>
					{(request.startDate || request.endDate) && (
						<>
							<DetailItem
								label="Start Date"
								value={
									request.startDate
										? new Date(request.startDate).toLocaleDateString()
										: undefined
								}
							/>
							<DetailItem
								label="End Date"
								value={
									request.endDate
										? new Date(request.endDate).toLocaleDateString()
										: undefined
								}
							/>
						</>
					)}
				</div>

				<DetailItem
					className="md:col-span-2 mt-4"
					label="Description"
					value={
						request.description ? (
							<p className="whitespace-pre-line text-sm text-gray-900 border p-3 rounded-md bg-gray-50 border-gray-100">
								{request.description}
							</p>
						) : undefined
					}
				/>

				<div className="mt-8 border-t border-gray-100 pt-6">
					<h4 className="text-sm font-bold uppercase tracking-wide text-gray-500 mb-6 flex items-center gap-2">
						<List className="w-4 h-4" /> Execution Timeline
					</h4>

					<div className="relative pl-4 space-y-6 pb-2">
						<div className="absolute top-2 bottom-2 left-[19px] w-px bg-gray-200" />
						{request.stepExecutions.map((step: any, i: number) => {
							const isCurrent = request.currentStepId === step.id;
							const isPast = ["COMPLETED", "APPROVED", "SKIPPED"].includes(
								step.status,
							);
							const isRejected = step.status === "REJECTED";

							let Icon = Clock;
							let dotBg = "bg-gray-100 border-gray-300 text-gray-400";
							let titleColor = "text-gray-500";

							if (isPast) {
								Icon = Check;
								dotBg = "bg-emerald-50 border-emerald-500 text-emerald-600";
								titleColor = "text-gray-900";
							} else if (isRejected) {
								Icon = X;
								dotBg = "bg-rose-50 border-rose-500 text-rose-600";
								titleColor = "text-gray-900";
							} else if (isCurrent) {
								Icon = MoreVertical;
								dotBg =
									"bg-white border-blue-500 text-blue-500 ring-4 ring-blue-50";
								titleColor = "text-blue-700 font-bold";
							}

							const actions = isCurrent
								? getStepActions(step.stepType, step.status).filter((act) => {
										// While permissions are loading, show all actions optimistically
										if (isLoadingPermissions) return true;
										// If workflow has permissions configured but user has none for this status → deny
										if (myPerms.length === 0 && templateCode) return false;
										// No workflow configured → allow all (backward compat)
										if (myPerms.length === 0) return true;
										if (act.label === "Approve")
											return myPerms.includes("approve");
										if (act.label === "Reject")
											return myPerms.includes("reject");
										if (act.label === "Cancel Request")
											return myPerms.includes("cancel");
										if (act.label === "Mark Done")
											return myPerms.includes("complete");
										if (act.label === "Resubmit")
											return myPerms.includes("reopen");
										return true;
									})
								: [];

							return (
								<div key={step.id} className="relative z-10 flex gap-4 group">
									<div
										className={`w-8 h-8 rounded-full border-2 flex items-center justify-center flex-shrink-0 relative bg-white ${dotBg} transition-all`}>
										<Icon className="w-4 h-4" />
									</div>

									<div
										className={`flex-1 pb-1 ${isCurrent ? "bg-blue-50/50 p-4 -mt-3.5 rounded-lg border border-blue-100" : ""}`}>
										<div className="flex justify-between items-start mb-1">
											<h5
												className={`text-sm font-medium flex items-center gap-2 ${titleColor}`}>
												{step.stepName}
												{isCurrent && (
													<span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700 uppercase leading-none border border-blue-200">
														Current
													</span>
												)}
											</h5>
											{step.completedAt && (
												<span className="text-xs text-gray-400">
													{new Date(step.completedAt).toLocaleTimeString(
														undefined,
														{ hour: "2-digit", minute: "2-digit" },
													)}
												</span>
											)}
										</div>

										<div className="flex items-center gap-2 mt-1.5">
											<span
												className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold border ${getAssigneePillColor(step.assigneeType)}`}>
												{step.assigneeType}
											</span>
											<span className="text-xs text-gray-600 font-medium">
												{step.assigneeName}
											</span>
										</div>

										{step.note && (
											<div className="mt-2 bg-gray-50 py-2 px-3 rounded border border-gray-100 text-xs text-gray-600 italic">
												"{step.note}"
											</div>
										)}

										{actions.length > 0 && (
											<div className="mt-4 pt-4 border-t border-blue-100">
												{!noteOpenAction ? (
													<div className="flex gap-2">
														{actions.map((act: any) => (
															<Button
																key={act.label}
																variant={act.variant as any}
																onClick={() =>
																	setNoteOpenAction(act)
																}
																className="h-8 text-xs font-semibold px-3">
																{act.label}
															</Button>
														))}
													</div>
												) : (
													<div className="bg-white p-3 rounded-lg border border-blue-200 shadow-sm animate-in fade-in slide-in-from-top-1">
														<label className="block text-xs font-semibold text-gray-700 mb-1.5 tracking-wide">
															Add Note (Optional)
														</label>
														<textarea
															className="w-full border border-gray-300 rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none mb-3 resize-none"
															rows={2}
															value={noteText}
															onChange={(e) =>
																setNoteText(e.target.value)
															}
															placeholder={`Why are you choosing to ${noteOpenAction.label}?`}
														/>
														<div className="flex justify-end gap-2">
															<Button
																variant="ghost"
																className="h-8 text-xs px-3"
																onClick={() =>
																	setNoteOpenAction(null)
																}>
																Cancel
															</Button>
															<Button
																variant={
																	noteOpenAction.variant as any
																}
																className="h-8 text-xs px-3 font-semibold"
																onClick={() => {
																	onAction(
																		request,
																		noteOpenAction.label,
																		noteText,
																	);
																	setNoteOpenAction(null);
																	setNoteText("");
																}}>
																Confirm {noteOpenAction.label}
															</Button>
														</div>
													</div>
												)}
											</div>
										)}

										{/* Waiting for approver notice — shown when user has no permission for this step */}
										{isCurrent &&
											actions.length === 0 &&
											!isLoadingPermissions &&
											templateCode &&
											isActiveWorkflowState(request.status) && (
												<div className="mt-4 pt-4 border-t border-blue-100">
													<div className="flex items-start gap-2 p-3 bg-amber-50 rounded-lg border border-amber-200">
														<AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
														<div>
															<p className="text-xs font-semibold text-amber-800">
																Waiting for assigned approver
															</p>
															<p className="text-xs text-amber-700 mt-0.5">
																This step is awaiting action from
																the assigned approver. You do not
																have permission to act on this step.
															</p>
														</div>
													</div>
												</div>
											)}

										{/* Delegate to supervisor — shown when no specific person is assigned to this step */}
										{isCurrent &&
											step.assigneeName === step.assigneeType &&
											onEscalate &&
											isActiveWorkflowState(request.status) && (
												<div className="mt-3">
													<div className="flex items-start gap-2 p-3 bg-orange-50 rounded-lg border border-orange-200">
														<UserCheck className="w-4 h-4 text-orange-500 mt-0.5 flex-shrink-0" />
														<div className="flex-1">
															<p className="text-xs font-semibold text-orange-800">
																No approver assigned
															</p>
															<p className="text-xs text-orange-700 mt-0.5 mb-2">
																No user with the required role was
																found. You can delegate this step to
																the employee's direct supervisor.
															</p>
															<Button
																variant="outline"
																className="h-7 text-xs px-3 border-orange-300 text-orange-700 hover:bg-orange-100"
																disabled={isEscalating}
																onClick={() =>
																	onEscalate(request.id)
																}>
																{isEscalating ? (
																	<span className="flex items-center gap-1.5">
																		<div className="w-3 h-3 border-2 border-orange-400/30 border-t-orange-500 rounded-full animate-spin" />
																		Delegating...
																	</span>
																) : (
																	<span className="flex items-center gap-1.5">
																		<UserCheck className="w-3 h-3" />
																		Delegate to Supervisor
																	</span>
																)}
															</Button>
														</div>
													</div>
												</div>
											)}
									</div>
								</div>
							);
						})}
					</div>
				</div>

				<div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
					<Button type="button" variant="outline" onClick={onClose}>
						Close Detail
					</Button>
				</div>
			</div>
		</Modal>
	);
}

// Simple CalendarIcon fallback for detail view
function CalendarIcon(props: any) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="24"
			height="24"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			{...props}>
			<rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
			<line x1="16" x2="16" y1="2" y2="6" />
			<line x1="8" x2="8" y1="2" y2="6" />
			<line x1="3" x2="21" y1="10" y2="10" />
		</svg>
	);
}
