import type { Notification } from "~/zod/notification";

const isHrRole = (role?: string | null): boolean =>
	role === "hris-hr-manager" || role === "hris-hr-user" || role === "hris-admin";

const HR_TICKET_REQUEST_TYPES = new Set([
	"DOCUMENT_REQUEST",
	"OTHER",
	"RESIGNATION",
	"TERMINATION",
	"TRANSFER",
	"REGULARIZATION",
	"PROMOTION",
	"SALARY_CHANGE",
	"SCHEDULE_CHANGE",
]);

const resolveRequestSelfRoute = (requestType?: string | null): string => {
	return requestType ? "/employee/requests" : "/employee/notifications";
};

const normalizeLegacyEmployeeTarget = (
	target: string | null,
	employeeId?: string | null,
): string | null => {
	if (!target) return target;
	const safeTarget = String(target).trim();
	if (safeTarget.startsWith("/employee/attendance")) {
		return employeeId
			? safeTarget.replace("/employee/attendance", `/employee/${employeeId}/attendance`)
			: "/dashboard";
	}
	if (safeTarget.startsWith("/employee/payroll")) {
		return employeeId
			? safeTarget.replace("/employee/payroll", `/employee/${employeeId}/payroll`)
			: "/dashboard";
	}
	return safeTarget;
};

export const isRegularizationCompletionNotification = (notification: Notification): boolean => {
	const metadata = (notification.metadata || {}) as Record<string, any>;
	return (
		String(metadata.requestType || "").toUpperCase() === "REGULARIZATION" &&
		String(metadata.status || "").toUpperCase() === "COMPLETED"
	);
};

export const resolveNotificationTarget = (
	notification: Notification,
	currentUserRole?: string | null,
): string | null => {
	const metadata = (notification.metadata || {}) as Record<string, any>;
	const routeKey = String(metadata.routeKey || "");
	const targetUrl = typeof metadata.targetUrl === "string" ? metadata.targetUrl : null;
	const requestId = String(metadata.entityId || "");
	const timesheetId = String(metadata.timesheetId || metadata.entityId || "");
	const employeeId =
		typeof metadata.employeeId === "string" ? String(metadata.employeeId) : null;
	const requestType = metadata.requestType ? String(metadata.requestType) : null;
	const normalizedRequestType = String(requestType || "").toUpperCase();
	const normalizedTargetUrl = normalizeLegacyEmployeeTarget(targetUrl, employeeId);

	if (!isHrRole(currentUserRole) && isRegularizationCompletionNotification(notification)) {
		return `/dashboard?regularizationNotification=${encodeURIComponent(notification.id)}`;
	}

	switch (routeKey) {
		case "REQUEST_APPROVAL_VIEW": {
			if (isHrRole(currentUserRole) && HR_TICKET_REQUEST_TYPES.has(normalizedRequestType)) {
				return requestId
					? `/hr/requests/tickets?action=view&id=${requestId}`
					: "/hr/requests/tickets";
			}

			const base = isHrRole(currentUserRole)
				? "/hr/approvals/requests"
				: "/employee/approvals/requests";
			return requestId ? `${base}?action=view&id=${requestId}` : normalizedTargetUrl;
		}
		case "REQUEST_SELF_VIEW": {
			const base = resolveRequestSelfRoute(requestType);
			return requestId ? `${base}?action=view&id=${requestId}` : normalizedTargetUrl;
		}
		case "TIMESHEET_APPROVAL_VIEW": {
			const base = isHrRole(currentUserRole)
				? "/hr/approvals/requests"
				: "/employee/approvals/requests";
			const requestOrTimesheetId = requestId || timesheetId;
			return requestOrTimesheetId
				? `${base}?action=timesheet.review&id=${requestOrTimesheetId}`
				: base;
		}
		case "TIMESHEET_SELF_VIEW":
			if (employeeId) {
				return `/employee/${employeeId}/attendance?action=view-timesheet`;
			}
			return normalizedTargetUrl || "/dashboard";
		case "DOCUMENT_REVIEW_PENDING":
			return isHrRole(currentUserRole)
				? normalizedTargetUrl || "/hr/employee-documents?tab=pending-approval"
				: normalizedTargetUrl;
		default:
			return normalizedTargetUrl;
	}
};
