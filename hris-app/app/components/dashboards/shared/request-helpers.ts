import type { Request } from "~/services/requests.service";
import { getOvertimeRequestHoursLabel } from "~/lib/utils/overtime-request-display";

type RequestLikeForTimesheetLink = {
	type?: string | null;
	metadata?: Record<string, any> | null;
	requesterId?: string | null;
	requester?: { id?: string | null } | null;
};

export const getTimesheetDeepLink = (request: RequestLikeForTimesheetLink): string | null => {
	if (request.type !== "TIMESHEET") return null;

	const timesheetAction = String(request.metadata?.timesheetAction || "").toUpperCase();
	const isTimesheetAction =
		!timesheetAction ||
		timesheetAction === "EDIT_PERMISSION" ||
		timesheetAction === "SUBMISSION";
	if (!isTimesheetAction) return null;

	const employeeId =
		request.metadata?.employeeId || request.requester?.id || request.requesterId;
	if (!employeeId || typeof employeeId !== "string") return null;

	return `/employee/${employeeId}/attendance?action=view-timesheet`;
};

export const getRequestTypeLabel = (request: Request): string => {
	const type = request.type;
	if (type === "TIMESHEET") {
		const action = request.metadata?.timesheetAction;
		if (action === "EDIT_PERMISSION") return "Timesheet Edit Permission";
		return "Timesheet Submission";
	}

	const labels: Record<string, string> = {
		EXPENSE_REIMBURSEMENT: "Expense Reimbursement",
		DOCUMENT_REQUEST: "Document Request",
		TIME_ADJUSTMENT: "Time Adjustment",
		OTHER: "General Request",
		LEAVE: "Leave Request",
		OVERTIME: "Overtime Request",
		PAYROLL_CORRECTION: "Payroll Correction",
		TIMESHEET: "Timesheet Submission",
		RESIGNATION: "Resignation",
		TERMINATION: "Termination",
		REGULARIZATION: "Regularization",
		PROMOTION: "Promotion",
		SALARY_CHANGE: "Salary Change",
		TRANSFER: "Transfer",
	};
	return labels[type] || type;
};

export const getRequestDescription = (request: Request): string => {
	if (
		request.startDate &&
		(request.type === "TIME_ADJUSTMENT" ||
			request.type === "LEAVE" ||
			request.type === "OVERTIME" ||
			request.type === "PAYROLL_CORRECTION" ||
			request.type === "OTHER")
	) {
		if (request.endDate && request.startDate !== request.endDate) {
			const startDate = new Date(request.startDate).toLocaleDateString("en-US", {
				month: "short",
				day: "numeric",
			});
			const endDate = new Date(request.endDate).toLocaleDateString("en-US", {
				month: "short",
				day: "numeric",
			});
			return `${startDate} - ${endDate}`;
		}

		return new Date(request.startDate).toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
		});
	}

	if (request.type === "EXPENSE_REIMBURSEMENT" && request.amount) {
		return `P${request.amount.toLocaleString()}`;
	}

	if (request.type === "OVERTIME") {
		const overtimeHours = getOvertimeRequestHoursLabel(
			request.metadata as Record<string, unknown> | null,
		);
		const dateLabel = request.startDate
			? new Date(request.startDate).toLocaleDateString("en-US", {
					month: "short",
					day: "numeric",
				})
			: null;
		if (overtimeHours && dateLabel) return `${overtimeHours} OT · ${dateLabel}`;
		if (overtimeHours) return `${overtimeHours} overtime`;
	}

	return request.description
		? request.description.length > 50
			? `${request.description.slice(0, 50)}...`
			: request.description
		: "No description";
};

export const getRequestState = (request: Pick<Request, "currentWorkflowStateKey">): string =>
	request.currentWorkflowStateKey || "OPEN";

export const getRequestStatusClasses = (status: string): string => {
	if (status === "SUBMITTED") return "bg-yellow-100 text-yellow-800";
	if (status === "APPROVED") return "bg-orange-100 text-orange-800";
	if (status === "COMPLETED") return "bg-green-100 text-green-800";
	if (status === "REJECTED") return "bg-red-100 text-red-800";
	if (status === "CANCELLED") return "bg-gray-100 text-gray-800";
	if (status === "OPEN" || status === "FOR_APPROVAL" || status === "IN_PROCESS") {
		return "bg-yellow-100 text-yellow-800";
	}
	return "bg-slate-100 text-slate-800";
};

export const getRequestStatusLabel = (status: string): string => {
	if (status === "OPEN") return "Open";
	if (status === "SUBMITTED") return "Submitted";
	if (status === "FOR_APPROVAL") return "For Approval";
	if (status === "IN_PROCESS") return "In Process";
	if (status === "APPROVED") return "Approved";
	if (status === "COMPLETED") return "Completed";
	if (status === "REJECTED") return "Rejected";
	if (status === "CANCELLED") return "Cancelled";
	return status.replace(/_/g, " ");
};

export const getEmployeeRequestNavigationPath = (request: Request): string => {
	const timesheetDeepLink = getTimesheetDeepLink(request);
	if (timesheetDeepLink) return timesheetDeepLink;

	return `/employee/requests?action=view&id=${request.id}`;
};
