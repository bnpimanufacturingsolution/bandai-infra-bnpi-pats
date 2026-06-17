import type {
	WorkflowActionTiming,
	WorkflowPostActionConfig,
	WorkflowStateKey,
} from "./request-runtime.helper";

export type RequestTypePostActionRequest = {
	id: string;
	type: string;
	requesterId?: string | null;
	targetEmployeeId?: string | null;
	currentWorkflowStateKey?: WorkflowStateKey | null;
	metadata?: Record<string, unknown> | null;
	[key: string]: unknown;
};

export type RequestTypePostActionContext = {
	request: RequestTypePostActionRequest;
	timing: WorkflowActionTiming;
	currentWorkflowStateKey?: WorkflowStateKey | null;
	stepExecution?: {
		id?: string | null;
		stepNumber?: number | null;
		stepName?: string | null;
		stepType?: string | null;
		status?: string | null;
	} | null;
	actorEmployeeId?: string | null;
	config?: Record<string, unknown>;
};

type RequestTypePostActionHandler = (context: RequestTypePostActionContext) => Promise<void>;

type RequestTypeHandlerMap = Partial<Record<string, Partial<Record<WorkflowActionTiming, RequestTypePostActionHandler>>>>;

export const REQUEST_TYPE_POST_ACTION = "RUN_REQUEST_TYPE_POST_ACTION" as const;

export function getMatchingRequestTypePostActions(
	postActions: unknown,
	timing: WorkflowActionTiming,
): WorkflowPostActionConfig[] {
	if (!Array.isArray(postActions)) {
		return [];
	}

	return postActions.filter((action): action is WorkflowPostActionConfig => {
		return (
			typeof action === "object" &&
			action !== null &&
			(action as WorkflowPostActionConfig).type === REQUEST_TYPE_POST_ACTION &&
			(action as WorkflowPostActionConfig).timing === timing
		);
	});
}

export function hasRequestTypePostAction(
	postActions: unknown,
	timing: WorkflowActionTiming,
): boolean {
	return getMatchingRequestTypePostActions(postActions, timing).length > 0;
}

export async function runRequestTypePostActions(
	postActions: unknown,
	context: Omit<RequestTypePostActionContext, "config">,
	handlers: RequestTypeHandlerMap,
): Promise<void> {
	const matchingActions = getMatchingRequestTypePostActions(postActions, context.timing);
	if (matchingActions.length === 0) {
		return;
	}

	const requestType = String(context.request.type || "").toUpperCase();
	if (!requestType) {
		return;
	}

	const requestTypeHandlers = handlers[requestType];
	const handler = requestTypeHandlers?.[context.timing];
	if (!handler) {
		return;
	}

	for (const action of matchingActions) {
		await handler({
			...context,
			config: action.config,
		});
	}
}
