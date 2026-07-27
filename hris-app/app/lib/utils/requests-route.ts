export type RequestCreateKind =
	| "leave"
	| "document"
	| "personnel-action"
	| "time-adjustment"
	| "overtime"
	| "resignation";

export const REQUEST_ROUTE_ACTION_PARAM = "action";
export const REQUEST_ROUTE_ID_PARAM = "id";
export const REQUEST_ROUTE_KIND_PARAM = "kind";
export const REQUEST_ROUTE_TARGET_EMPLOYEE_ID_PARAM = "targetEmployeeId";
export const REQUEST_ROUTE_INTENT_PARAM = "intent";
export const REQUEST_ROUTE_DATE_PARAM = "date";
export const REQUEST_ROUTE_START_DATE_PARAM = "startDate";
export const REQUEST_ROUTE_END_DATE_PARAM = "endDate";
export const REQUEST_ROUTE_LEAVE_TYPE_PARAM = "leaveType";

export type LeaveRequestPrefillParams = {
	initialStartDate?: string;
	initialEndDate?: string;
	initialLeaveType?: string;
	honorPrefilledDates: boolean;
};

const REQUEST_CREATE_KINDS = new Set<RequestCreateKind>([
	"leave",
	"document",
	"personnel-action",
	"time-adjustment",
	"overtime",
	"resignation",
]);

export function getRequestRouteAction(searchParams: URLSearchParams): string | null {
	return searchParams.get(REQUEST_ROUTE_ACTION_PARAM);
}

export function getActiveRequestId(searchParams: URLSearchParams): string {
	const action = getRequestRouteAction(searchParams);
	return action === "view" ? searchParams.get(REQUEST_ROUTE_ID_PARAM) || "" : "";
}

export function getRequestCreateKind(searchParams: URLSearchParams): RequestCreateKind | null {
	const action = getRequestRouteAction(searchParams);
	if (action !== "create") return null;

	const kind = searchParams.get(REQUEST_ROUTE_KIND_PARAM);
	if (kind && REQUEST_CREATE_KINDS.has(kind as RequestCreateKind)) {
		return kind as RequestCreateKind;
	}

	return null;
}

export function buildRequestCreateSearchParams(
	currentSearchParams: URLSearchParams,
	kind: RequestCreateKind,
	extras?: { targetEmployeeId?: string; intent?: string },
): URLSearchParams {
	const next = new URLSearchParams(currentSearchParams);
	next.set(REQUEST_ROUTE_ACTION_PARAM, "create");
	next.set(REQUEST_ROUTE_KIND_PARAM, kind);
	next.delete(REQUEST_ROUTE_ID_PARAM);

	if (extras?.targetEmployeeId) {
		next.set(REQUEST_ROUTE_TARGET_EMPLOYEE_ID_PARAM, extras.targetEmployeeId);
	} else {
		next.delete(REQUEST_ROUTE_TARGET_EMPLOYEE_ID_PARAM);
	}

	if (extras?.intent) {
		next.set(REQUEST_ROUTE_INTENT_PARAM, extras.intent);
	} else {
		next.delete(REQUEST_ROUTE_INTENT_PARAM);
	}

	return next;
}

export function buildRequestViewSearchParams(
	currentSearchParams: URLSearchParams,
	requestId: string,
): URLSearchParams {
	const next = new URLSearchParams(currentSearchParams);
	next.set(REQUEST_ROUTE_ACTION_PARAM, "view");
	next.set(REQUEST_ROUTE_ID_PARAM, requestId);
	next.delete(REQUEST_ROUTE_KIND_PARAM);
	next.delete(REQUEST_ROUTE_TARGET_EMPLOYEE_ID_PARAM);
	next.delete(REQUEST_ROUTE_INTENT_PARAM);
	return next;
}

export function getLeaveRequestPrefillFromSearchParams(
	searchParams: URLSearchParams,
): LeaveRequestPrefillParams {
	const date = searchParams.get(REQUEST_ROUTE_DATE_PARAM) || undefined;
	const startDate =
		searchParams.get(REQUEST_ROUTE_START_DATE_PARAM) || date || undefined;
	const endDate =
		searchParams.get(REQUEST_ROUTE_END_DATE_PARAM) || date || undefined;
	const leaveType = searchParams.get(REQUEST_ROUTE_LEAVE_TYPE_PARAM) || undefined;

	return {
		initialStartDate: startDate,
		initialEndDate: endDate,
		initialLeaveType: leaveType,
		honorPrefilledDates: !!date,
	};
}

export function clearRequestModalSearchParams(
	currentSearchParams: URLSearchParams,
): URLSearchParams {
	const next = new URLSearchParams(currentSearchParams);
	next.delete(REQUEST_ROUTE_ACTION_PARAM);
	next.delete(REQUEST_ROUTE_ID_PARAM);
	next.delete(REQUEST_ROUTE_KIND_PARAM);
	next.delete(REQUEST_ROUTE_TARGET_EMPLOYEE_ID_PARAM);
	next.delete(REQUEST_ROUTE_INTENT_PARAM);
	next.delete(REQUEST_ROUTE_DATE_PARAM);
	next.delete(REQUEST_ROUTE_START_DATE_PARAM);
	next.delete(REQUEST_ROUTE_END_DATE_PARAM);
	next.delete(REQUEST_ROUTE_LEAVE_TYPE_PARAM);
	return next;
}