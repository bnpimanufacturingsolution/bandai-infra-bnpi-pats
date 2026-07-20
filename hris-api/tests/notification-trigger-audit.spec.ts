import { expect } from "chai";

import { prisma } from "../config/database";
import { controller as requestControllerFactory } from "../app/request/request.controller";
import { controller as timesheetControllerFactory } from "../app/timesheet/timesheet.controller";

const TEST_IDS = {
	employee1: "111111111111111111111111",
	manager1: "222222222222222222222222",
	employee2: "333333333333333333333333",
	manager2: "444444444444444444444444",
} as const;

const originalActivityLoggingCreate = prisma.activityLogging.create;
const originalAuditLoggingCreate = prisma.auditLogging.create;

prisma.activityLogging.create = (async ({ data }: any) => ({
	id: "activityLogging-test",
	...data,
})) as typeof prisma.activityLogging.create;

prisma.auditLogging.create = (async ({ data }: any) => ({
	id: "auditLogging-test",
	...data,
})) as typeof prisma.auditLogging.create;

type EmployeeRecord = {
	id: string;
	employeeId?: string | null;
	organizationId: string;
	role: string;
	userId?: string | null;
	reportToId?: string | null;
	departmentId?: string | null;
	person?: {
		personalInfo?: {
			firstName?: string;
			lastName?: string;
		};
	};
	department?: {
		id?: string;
		name?: string;
		managerId?: string | null;
	};
};

type WorkflowTemplateRecord = {
	id: string;
	code: string;
	name: string;
	description?: string | null;
	organizationId: string;
	requestType: string;
	steps: any[];
	states: any[];
};

type RequestRecord = {
	id: string;
	organizationId: string;
	code: string;
	type: string;
	requesterId: string;
	targetEmployeeId?: string | null;
	currentWorkflowStateKey: string;
	currentStepExecutionId?: string | null;
	lastCompletedStepExecutionId?: string | null;
	cancelledStepExecutionId?: string | null;
	workflowInstanceId?: string | null;
	description?: string | null;
	metadata?: Record<string, any> | null;
	notes?: string | null;
	isDeleted?: boolean;
	createdAt?: Date;
	updatedAt?: Date;
};

type TimesheetRecord = {
	id: string;
	organizationId: string;
	code: string;
	employeeId: string;
	status: string;
	editPermissionStatus?: string | null;
	editPermissionRequestId?: string | null;
	payrollPeriod?: {
		id?: string;
		code?: string | null;
		name?: string | null;
		startDate?: Date | null;
		endDate?: Date | null;
	};
	metadata?: Record<string, any> | null;
	isDeleted?: boolean;
};

type WorkflowInstanceRecord = {
	id: string;
	organizationId: string;
	domain: string;
	domainRecordId: string | null;
	requestType: string | null;
	code?: string | null;
	name?: string | null;
	description?: string | null;
	steps: any[];
	states: any[];
	currentStateKey?: string | null;
	isDeleted?: boolean;
};

type WorkflowStepExecutionRecord = {
	id: string;
	organizationId: string;
	workflowInstanceId: string;
	requestId: string;
	stepNumber: number;
	stepName: string;
	stepType: string;
	assigneeType: string;
	assigneeId: string | null;
	status: string;
	completedAt: Date | null;
	isRequired: boolean;
	isDeleted: boolean;
	comments?: string | null;
	metadata?: Record<string, any> | null;
};

type NotificationRecord = {
	id: string;
	organizationId: string;
	sourceEmployeeId: string | null;
	category: string;
	type: string;
	title: string;
	description: string;
	eventKey: string;
	metadata: Record<string, any> | null;
	recipients: {
		read: Array<{ employeeId: string; readAt: Date | null }>;
		unread: Array<{ employeeId: string; readAt: Date | null }>;
	};
};

type TestState = {
	employees: EmployeeRecord[];
	organizations: Array<{ id: string; isDeleted?: boolean; branding?: Record<string, any> | null }>;
	requests: RequestRecord[];
	timesheets: TimesheetRecord[];
	workflowInstances: WorkflowInstanceRecord[];
	workflowStepExecutions: WorkflowStepExecutionRecord[];
	timesheetConfigs: Array<{ organizationId: string; enableEditBeforeSubmission: boolean }>;
	notifications: NotificationRecord[];
	requestTransactions: any[];
};

const clone = <T,>(value: T): T => structuredClone(value);

const hasOwn = (value: Record<string, any>, key: string) =>
	Object.prototype.hasOwnProperty.call(value, key);

const matchesWhere = (record: Record<string, any>, where: Record<string, any> | undefined): boolean => {
	if (!where) return true;

	return Object.entries(where).every(([key, expected]) => {
		const actual = record[key];
		if (expected && typeof expected === "object" && !Array.isArray(expected)) {
			if (hasOwn(expected, "in")) {
				return Array.isArray(expected.in) && expected.in.includes(actual);
			}
			if (hasOwn(expected, "not")) {
				return actual !== expected.not;
			}
			if (hasOwn(expected, "lte") && !(actual <= expected.lte)) {
				return false;
			}
			if (hasOwn(expected, "gte") && !(actual >= expected.gte)) {
				return false;
			}
			if (hasOwn(expected, "equals")) {
				return actual === expected.equals;
			}
			if (expected === null) {
				return actual === null;
			}
			return matchesWhere(actual ?? {}, expected as Record<string, any>);
		}
		return actual === expected;
	});
};

const sortRecords = (records: Record<string, any>[], orderBy?: Record<string, any>) => {
	if (!orderBy) return records;
	const [[field, direction]] = Object.entries(orderBy);
	return [...records].sort((left, right) => {
		const leftValue = left[field];
		const rightValue = right[field];
		if (leftValue === rightValue) return 0;
		const comparison = leftValue > rightValue ? 1 : -1;
		return direction === "desc" ? -comparison : comparison;
	});
};

const makeEmployee = (
	state: TestState,
	employee: EmployeeRecord,
): Record<string, any> => {
	const reportTo = employee.reportToId
		? state.employees.find((item) => item.id === employee.reportToId)
		: null;

	return {
		...clone(employee),
		person: employee.person || {
			personalInfo: {
				firstName: "Test",
				lastName: "Employee",
			},
		},
		department: employee.department || (employee.departmentId
			? {
					id: employee.departmentId,
					name: "Operations",
					managerId: employee.reportToId || null,
				}
			: undefined),
		reportTo: reportTo
			? {
					id: reportTo.id,
					employeeId: reportTo.employeeId || null,
					role: reportTo.role,
					reportToId: reportTo.reportToId || null,
					person: reportTo.person || {
						personalInfo: {
							firstName: "Report",
							lastName: "To",
						},
					},
			  }
			: null,
	};
};

const makeWorkflowInstance = (state: TestState, workflow: WorkflowInstanceRecord) => ({
	...clone(workflow),
	steps: clone(workflow.steps),
	states: clone(workflow.states),
});

const makeStepExecution = (state: TestState, step: WorkflowStepExecutionRecord) => ({
	...clone(step),
	assignee: step.assigneeId
		? {
				role: state.employees.find((employee) => employee.id === step.assigneeId)?.role || null,
		  }
		: null,
});

const makeRequest = (state: TestState, request: RequestRecord) => {
	const currentStepExecutionId =
		request.currentStepExecutionId ?? request.cancelledStepExecutionId ?? null;

	return {
		...clone(request),
		requester: makeEmployee(
			state,
			state.employees.find((employee) => employee.id === request.requesterId) || {
				id: request.requesterId,
				organizationId: request.organizationId,
				role: "hris-employee",
			},
		) as any,
		targetEmployee: request.targetEmployeeId
			? makeEmployee(
					state,
					state.employees.find((employee) => employee.id === request.targetEmployeeId) || {
						id: request.targetEmployeeId,
						organizationId: request.organizationId,
						role: "hris-employee",
					},
			  )
			: null,
		workflowInstance: request.workflowInstanceId
			? (() => {
					const workflow = state.workflowInstances.find(
						(item) => item.id === request.workflowInstanceId,
					);
					return workflow ? makeWorkflowInstance(state, workflow) : null;
			  })()
			: null,
		currentStepExecution: currentStepExecutionId
			? (() => {
					const step = state.workflowStepExecutions.find(
						(item) => item.id === currentStepExecutionId,
					);
					return step ? makeStepExecution(state, step) : null;
			  })()
			: null,
		stepExecutions: state.workflowStepExecutions
			.filter((item) => item.requestId === request.id)
			.sort((left, right) => left.stepNumber - right.stepNumber)
			.map((item) => makeStepExecution(state, item)),
	};
};

const makeTimesheet = (state: TestState, timesheet: TimesheetRecord) => ({
	...clone(timesheet),
	employee: makeEmployee(state, state.employees.find((employee) => employee.id === timesheet.employeeId) || {
		id: timesheet.employeeId,
		organizationId: timesheet.organizationId,
		role: "hris-employee",
	}),
	payrollPeriod: timesheet.payrollPeriod || null,
	timesheetlines: [],
});

const createPrismaHarness = (seed: Partial<TestState> = {}) => {
	const state: TestState = {
		employees: clone(seed.employees || []),
		organizations: clone(seed.organizations || []),
		requests: clone(seed.requests || []),
		timesheets: clone(seed.timesheets || []),
		workflowInstances: clone(seed.workflowInstances || []),
		workflowStepExecutions: clone(seed.workflowStepExecutions || []),
		timesheetConfigs: clone(seed.timesheetConfigs || []),
		notifications: clone(seed.notifications || []),
		requestTransactions: clone(seed.requestTransactions || []),
	};

	const counters = {
		request: 1,
		workflowInstance: 1,
		workflowStepExecution: 1,
		notification: 1,
		requestTransaction: 1,
		timesheet: 1,
		activityLogging: 1,
		auditLogging: 1,
	};

	const nextId = (prefix: keyof typeof counters) => `${prefix}-${counters[prefix]++}`;

	const prisma: any = {
		notification: {
			findFirst: async ({ where }: any) => {
				const found = state.notifications.find((notification) => matchesWhere(notification, where));
				return found ? clone(found) : null;
			},
			create: async ({ data }: any) => {
				const notification: NotificationRecord = {
					id: nextId("notification"),
					organizationId: data.organizationId,
					sourceEmployeeId: data.sourceEmployeeId ?? null,
					category: data.category,
					type: data.type,
					title: data.title,
					description: data.description,
					eventKey: data.eventKey,
					metadata: data.metadata ? clone(data.metadata) : null,
					recipients: clone(data.recipients),
				};
				state.notifications.push(notification);
				return clone(notification);
			},
			update: async ({ where, data }: any) => {
				const notification = state.notifications.find((item) => matchesWhere(item, where));
				if (!notification) throw new Error("Notification not found");
				Object.assign(notification, clone(data));
				return clone(notification);
			},
		},
		activityLogging: {
			create: async ({ data }: any) => ({ id: nextId("activityLogging"), ...clone(data) }),
		},
		auditLogging: {
			create: async ({ data }: any) => ({ id: nextId("auditLogging"), ...clone(data) }),
		},
		employee: {
			findFirst: async ({ where }: any) => {
				const employee = state.employees.find((item) => matchesWhere(item, where));
				return employee ? makeEmployee(state, employee) : null;
			},
			findUnique: async ({ where }: any) => {
				const employee = state.employees.find((item) => matchesWhere(item, where));
				return employee ? makeEmployee(state, employee) : null;
			},
			findMany: async ({ where }: any) => {
				return state.employees.filter((item) => matchesWhere(item, where)).map((item) => makeEmployee(state, item));
			},
		},
		organization: {
			findFirst: async ({ where }: any) => {
				const organization = state.organizations.find((item) => matchesWhere(item, where));
				return organization ? clone(organization) : null;
			},
		},
		timesheetConfig: {
			findUnique: async ({ where }: any) => {
				const config = state.timesheetConfigs.find((item) => matchesWhere(item, where));
				return config ? clone(config) : null;
			},
			create: async ({ data }: any) => {
				const config = {
					organizationId: data.organizationId,
					enableEditBeforeSubmission: data.enableEditBeforeSubmission,
					...clone(data),
				};
				state.timesheetConfigs.push(config);
				return clone(config);
			},
			update: async ({ where, data }: any) => {
				const config = state.timesheetConfigs.find((item) => matchesWhere(item, where));
				if (!config) throw new Error("Timesheet config not found");
				Object.assign(config, clone(data));
				return clone(config);
			},
		},
		request: {
			findFirst: async ({ where }: any) => {
				const request = state.requests.find((item) => matchesWhere(item, where));
				return request ? makeRequest(state, request) : null;
			},
			findUnique: async ({ where }: any) => {
				const request = state.requests.find((item) => matchesWhere(item, where));
				return request ? makeRequest(state, request) : null;
			},
			findMany: async ({ where, orderBy, take }: any) => {
				let requests = state.requests.filter((item) => matchesWhere(item, where));
				requests = sortRecords(requests, orderBy);
				if (typeof take === "number") {
					requests = requests.slice(0, take);
				}
				return requests.map((item) => makeRequest(state, item));
			},
			create: async ({ data }: any) => {
				const request: RequestRecord = {
					id: data.id || nextId("request"),
					organizationId: data.organizationId,
					code: data.code,
					type: data.type,
					requesterId: data.requester?.connect?.id || data.requesterId,
					targetEmployeeId: data.targetEmployee?.connect?.id ?? data.targetEmployeeId ?? null,
					currentWorkflowStateKey: data.currentWorkflowStateKey || "OPEN",
					currentStepExecutionId: data.currentStepExecutionId ?? null,
					lastCompletedStepExecutionId: data.lastCompletedStepExecutionId ?? null,
					workflowInstanceId: data.workflowInstanceId ?? null,
					description: data.description || null,
					metadata: data.metadata ? clone(data.metadata) : null,
					notes: data.notes ?? null,
					isDeleted: data.isDeleted ?? false,
					createdAt: data.createdAt || new Date(),
					updatedAt: data.updatedAt || new Date(),
				};
				state.requests.push(request);
				return clone(request);
			},
			update: async ({ where, data }: any) => {
				const request = state.requests.find((item) => matchesWhere(item, where));
				if (!request) throw new Error("Request not found");
				const nextData = clone(data);
				if (hasOwn(nextData, "metadata") && nextData.metadata && typeof nextData.metadata === "object") {
					request.metadata = {
						...(request.metadata || {}),
						...nextData.metadata,
					};
					delete nextData.metadata;
				}
				if (nextData.currentStepExecutionId === null && request.currentStepExecutionId) {
					request.cancelledStepExecutionId = request.currentStepExecutionId;
				}
				Object.assign(request, nextData, { updatedAt: new Date() });
				return clone(request);
			},
		},
		timesheet: {
			findFirst: async ({ where }: any) => {
				const timesheet = state.timesheets.find((item) => matchesWhere(item, where));
				return timesheet ? makeTimesheet(state, timesheet) : null;
			},
			findUnique: async ({ where }: any) => {
				const timesheet = state.timesheets.find((item) => matchesWhere(item, where));
				return timesheet ? makeTimesheet(state, timesheet) : null;
			},
			update: async ({ where, data }: any) => {
				const timesheet = state.timesheets.find((item) => matchesWhere(item, where));
				if (!timesheet) throw new Error("Timesheet not found");
				const nextData = clone(data);
				if (hasOwn(nextData, "payrollPeriod") && nextData.payrollPeriod) {
					timesheet.payrollPeriod = {
						...(timesheet.payrollPeriod || {}),
						...nextData.payrollPeriod,
					};
					delete nextData.payrollPeriod;
				}
				Object.assign(timesheet, nextData);
				return makeTimesheet(state, timesheet);
			},
		},
		workflowInstance: {
			findMany: async ({ where }: any) => {
				const templates = state.workflowInstances.filter((item) => matchesWhere(item, where));
				return templates.map((item) => clone(item));
			},
			create: async ({ data }: any) => {
				const workflow: WorkflowInstanceRecord = {
					id: data.id || nextId("workflowInstance"),
					organizationId: data.organizationId,
					domain: data.domain,
					domainRecordId: data.domainRecordId ?? null,
					requestType: data.requestType ?? null,
					code: data.code ?? null,
					name: data.name ?? null,
					description: data.description ?? null,
					steps: clone(data.steps || []),
					states: clone(data.states || []),
					currentStateKey: data.currentStateKey ?? null,
					isDeleted: data.isDeleted ?? false,
				};
				state.workflowInstances.push(workflow);
				return clone(workflow);
			},
			update: async ({ where, data }: any) => {
				const workflow = state.workflowInstances.find((item) => matchesWhere(item, where));
				if (!workflow) throw new Error("Workflow instance not found");
				Object.assign(workflow, clone(data));
				return clone(workflow);
			},
		},
		workflowStepExecution: {
			createMany: async ({ data }: any) => {
				for (const item of data || []) {
					const step: WorkflowStepExecutionRecord = {
						id: item.id || nextId("workflowStepExecution"),
						organizationId: item.organizationId,
						workflowInstanceId: item.workflowInstanceId,
						requestId: item.requestId,
						stepNumber: item.stepNumber,
						stepName: item.stepName,
						stepType: item.stepType,
						assigneeType: item.assigneeType,
						assigneeId: item.assigneeId ?? null,
						status: item.status,
						completedAt: item.completedAt ?? null,
						isRequired: item.isRequired !== false,
						isDeleted: item.isDeleted ?? false,
						comments: item.comments ?? null,
						metadata: item.metadata ? clone(item.metadata) : null,
					};
					state.workflowStepExecutions.push(step);
				}
				return { count: Array.isArray(data) ? data.length : 0 };
			},
			findMany: async ({ where, orderBy }: any) => {
				const steps = state.workflowStepExecutions.filter((item) => matchesWhere(item, where));
				return sortRecords(steps, orderBy).map((item) => makeStepExecution(state, item));
			},
			findFirst: async ({ where, orderBy }: any) => {
				const steps = state.workflowStepExecutions.filter((item) => matchesWhere(item, where));
				const sorted = sortRecords(steps, orderBy);
				return sorted.length > 0 ? makeStepExecution(state, sorted[0]) : null;
			},
			update: async ({ where, data }: any) => {
				const step = state.workflowStepExecutions.find((item) => matchesWhere(item, where));
				if (!step) throw new Error("Workflow step execution not found");
				const nextData = clone(data);
				Object.assign(step, nextData);
				return makeStepExecution(state, step);
			},
			updateMany: async ({ where, data }: any) => {
				const steps = state.workflowStepExecutions.filter((item) => matchesWhere(item, where));
				for (const step of steps) {
					Object.assign(step, clone(data));
				}
				return { count: steps.length };
			},
		},
		requestTransaction: {
			create: async ({ data }: any) => {
				const transaction = { id: nextId("requestTransaction"), ...clone(data) };
				state.requestTransactions.push(transaction);
				return clone(transaction);
			},
			count: async ({ where }: any) =>
				state.requestTransactions.filter((item) => matchesWhere(item, where)).length,
		},
		$transaction: async (callback: any) => (typeof callback === "function" ? callback(prisma) : null),
	};

	return { prisma, state };
};

const buildRequestTemplate = (organizationId: string, requestType: string): WorkflowTemplateRecord => ({
	id: `${requestType.toLowerCase()}-template`,
	code: requestType === "TIMESHEET" ? "WF-TIMESHEET-EDIT-PERMISSION" : "WF-TEST-REQUEST",
	name: `${requestType} Request Workflow`,
	description: `Test workflow for ${requestType.toLowerCase()} notifications`,
	organizationId,
	requestType,
	steps: [
		{
			step_number: 1,
			step_name: "Manager Approval",
			step_type: "APPROVAL",
			assignee_type: "SUPERVISOR",
			is_required: true,
			state_on_enter: "SUBMITTED",
			state_on_approve: "APPROVED",
			state_on_reject: "REJECTED",
		},
		{
			step_number: 2,
			step_name: "System Completion",
			step_type: "TASK",
			assignee_type: "SYSTEM",
			is_required: true,
			state_on_enter: "APPROVED",
			state_on_complete: "COMPLETED",
			state_on_skip: "COMPLETED",
		},
	],
	states: [
		{ key: "OPEN", label: "Draft", order: 0, isTerminal: false },
		{ key: "SUBMITTED", label: "Submitted", order: 1, isTerminal: false },
		{ key: "APPROVED", label: "Approved", order: 2, isTerminal: false },
		{ key: "COMPLETED", label: "Completed", order: 3, isTerminal: true },
		{ key: "REJECTED", label: "Rejected", order: 4, isTerminal: true },
		{ key: "CANCELLED", label: "Cancelled", order: 5, isTerminal: true },
	],
});

const buildWorkflowTemplateInstance = (
	organizationId: string,
	requestType: string,
): WorkflowInstanceRecord => {
	const template = buildRequestTemplate(organizationId, requestType);
	return {
		id: template.id,
		organizationId,
		domain: "REQUEST",
		domainRecordId: null,
		requestType,
		code: template.code,
		name: template.name,
		description: template.description,
		steps: clone(template.steps),
		states: clone(template.states),
		currentStateKey: null,
		isDeleted: false,
	};
};

const seedWorkflowRequest = (state: TestState, params: {
	requestId: string;
	workflowInstanceId: string;
	organizationId: string;
	requesterId: string;
	targetEmployeeId?: string | null;
	requestType: string;
	currentWorkflowStateKey?: string;
	currentStepExecutionId: string;
	lastCompletedStepExecutionId?: string | null;
	code?: string;
}) => {
	const template = buildRequestTemplate(params.organizationId, params.requestType);
	state.workflowInstances.push({
		id: params.workflowInstanceId,
		organizationId: params.organizationId,
		domain: "REQUEST",
		domainRecordId: params.requestId,
		requestType: params.requestType,
		code: template.code,
		name: template.name,
		description: template.description,
		steps: clone(template.steps),
		states: clone(template.states),
		currentStateKey: params.currentWorkflowStateKey || "SUBMITTED",
		isDeleted: false,
	});
	for (const step of template.steps) {
		const assigneeId =
			step.assignee_type === "SUPERVISOR"
				? state.employees.find((employee) => employee.id === params.requesterId)?.reportToId || null
				: null;
		state.workflowStepExecutions.push({
			id: step.step_number === 1 ? params.currentStepExecutionId : `${params.requestId}-step-${step.step_number}`,
			organizationId: params.organizationId,
			workflowInstanceId: params.workflowInstanceId,
			requestId: params.requestId,
			stepNumber: step.step_number,
			stepName: step.step_name,
			stepType: step.step_type,
			assigneeType: step.assignee_type,
			assigneeId,
			status: step.step_number === 1 ? "PENDING" : "PENDING",
			completedAt: null,
			isRequired: step.is_required !== false,
			isDeleted: false,
			metadata: {},
		});
	}

	state.requests.push({
		id: params.requestId,
		organizationId: params.organizationId,
		code: params.code || "REQ-00001",
		type: params.requestType,
		requesterId: params.requesterId,
		targetEmployeeId: params.targetEmployeeId ?? null,
		currentWorkflowStateKey: params.currentWorkflowStateKey || "SUBMITTED",
		currentStepExecutionId: params.currentStepExecutionId,
		lastCompletedStepExecutionId: params.lastCompletedStepExecutionId ?? null,
		workflowInstanceId: params.workflowInstanceId,
		description: `${params.requestType} request`,
		metadata: params.requestType === "TIMESHEET"
			? { timesheetAction: "EDIT_PERMISSION", timesheetId: "timesheet-1" }
			: null,
		notes: null,
		isDeleted: false,
		createdAt: new Date(),
		updatedAt: new Date(),
	});
};

const buildRequestContext = (prisma: any, overrides: Record<string, any> = {}) => ({
	body: {},
	params: {},
	query: {},
	originalUrl: "/api/request",
	user: {
		id: "tester-user",
		organizationId: "org-1",
		...overrides.user,
	},
	userId: "tester-user",
	role: "hris-employee",
	organizationId: "org-1",
	metadata: {
		employee: {
			id: TEST_IDS.employee1,
			...(overrides.metadata?.employee || {}),
		},
		...overrides.metadata,
	},
	connection: {
		remoteAddress: "127.0.0.1",
	},
	socket: {
		remoteAddress: "127.0.0.1",
	},
	ip: "127.0.0.1",
	get: (header: string) => {
		if (header === "Content-Type") return "application/json";
		return undefined;
	},
	io: null,
	...overrides,
});

const buildTimesheetContext = (overrides: Record<string, any> = {}) => ({
	body: {},
	params: {},
	query: {},
	originalUrl: "/api/timesheet",
	user: {
		id: "tester-user",
		organizationId: "org-1",
		...overrides.user,
	},
	userId: "tester-user",
	role: "hris-hr-manager",
	organizationId: "org-1",
	metadata: {
		employee: {
			id: TEST_IDS.employee1,
			...(overrides.metadata?.employee || {}),
		},
		...overrides.metadata,
	},
	connection: {
		remoteAddress: "127.0.0.1",
	},
	socket: {
		remoteAddress: "127.0.0.1",
	},
	ip: "127.0.0.1",
	get: (header: string) => {
		if (header === "Content-Type") return "application/json";
		return undefined;
	},
	io: null,
	...overrides,
});

const invoke = async (
	handler: (req: any, res: any, next: any) => Promise<void>,
	req: any,
) => {
	let statusCode = 200;
	let payload: any = undefined;
	const res: any = {
		status(code: number) {
			statusCode = code;
			return res;
		},
		json(data: any) {
			payload = data;
			return res;
		},
		send(data: any) {
			payload = data;
			return res;
		},
		end() {
			return res;
		},
	};

	await handler(req, res, () => undefined);
	return { statusCode, payload };
};

const expectNotification = (
	notification: NotificationRecord,
	expected: {
		eventKey: string;
		category: string;
		type: string;
		title?: string;
		targetUrl: string;
		recipientIds: string[];
	},
) => {
	expect(notification.eventKey).to.equal(expected.eventKey);
	expect(notification.category).to.equal(expected.category);
	expect(notification.type).to.equal(expected.type);
	if (expected.title) {
		expect(notification.title).to.equal(expected.title);
	}
	expect(notification.metadata?.targetUrl).to.equal(expected.targetUrl);
	expect(notification.recipients.unread.map((recipient) => recipient.employeeId)).to.deep.equal(
		expected.recipientIds,
	);
};

describe("notification trigger audit", () => {
	it("creates the request notification for the actual approver on request creation", async () => {
		const { prisma, state } = createPrismaHarness({
			employees: [
				{
					id: TEST_IDS.employee1,
					employeeId: "EMP-001",
					organizationId: "org-1",
					role: "hris-employee",
					isDeleted: false,
					userId: "user-1",
					reportToId: TEST_IDS.manager1,
					person: { personalInfo: { firstName: "Mina", lastName: "Santos" } },
				},
				{
					id: TEST_IDS.manager1,
					employeeId: "EMP-MGR",
					organizationId: "org-1",
					role: "hris-employee-manager",
					isDeleted: false,
					person: { personalInfo: { firstName: "Rene", lastName: "Lopez" } },
				},
			],
			organizations: [{ id: "org-1", isDeleted: false, branding: null }],
			workflowInstances: [buildWorkflowTemplateInstance("org-1", "OTHER")],
		});
		const requestController = requestControllerFactory(prisma);

		const response = await invoke(requestController.create, buildRequestContext(prisma, {
			body: {
				organizationId: "org-1",
				requesterId: TEST_IDS.employee1,
				type: "OTHER",
				description: "Test request creation",
			},
			role: "hris-employee",
			user: { id: "user-1", organizationId: "org-1" },
			metadata: { employee: { id: TEST_IDS.employee1 } },
		}));

		expect(response.statusCode).to.equal(201);
		expect(state.requests).to.have.length(1);
		expect(state.notifications).to.have.length(1);
		expectNotification(state.notifications[0], {
			eventKey: "request:request-1:step:workflowStepExecution-1:assigned",
			category: "REQUEST",
			type: "INFO",
			title: "Approval required",
			targetUrl: "/employee/approvals/requests?action=view&id=request-1",
			recipientIds: [TEST_IDS.manager1],
		});
	});

	it("publishes the request decision notification to the requester after approval completes", async () => {
		const { prisma, state } = createPrismaHarness({
			employees: [
				{
					id: TEST_IDS.employee1,
					employeeId: "EMP-001",
					organizationId: "org-1",
					role: "hris-employee",
					isDeleted: false,
					reportToId: TEST_IDS.manager1,
					person: { personalInfo: { firstName: "Mina", lastName: "Santos" } },
				},
				{
					id: TEST_IDS.manager1,
					employeeId: "EMP-MGR",
					organizationId: "org-1",
					role: "hris-employee-manager",
					isDeleted: false,
					person: { personalInfo: { firstName: "Rene", lastName: "Lopez" } },
				},
			],
			organizations: [{ id: "org-1", isDeleted: false, branding: null }],
		});
		seedWorkflowRequest(state, {
			requestId: "request-approval",
			workflowInstanceId: "workflow-approval",
			organizationId: "org-1",
			requesterId: TEST_IDS.employee1,
			requestType: "OTHER",
			currentWorkflowStateKey: "SUBMITTED",
			currentStepExecutionId: "request-approval-step-1",
			code: "REQ-00042",
		});
		const requestController = requestControllerFactory(prisma);

		const response = await invoke(requestController.approval, {
			...buildRequestContext(prisma, {
				params: { id: "request-approval" },
				body: { action: "approve" },
				role: "hris-employee-manager",
			metadata: { employee: { id: TEST_IDS.manager1 } },
			}),
		});

		expect(response.statusCode).to.equal(200);
		expect(state.notifications).to.have.length(1);
		expectNotification(state.notifications[0], {
			eventKey: "request:request-approval:status:COMPLETED",
			category: "APPROVAL",
			type: "SUCCESS",
			title: "Request completed",
			targetUrl: "/employee/requests?action=view&id=request-approval",
			recipientIds: [TEST_IDS.employee1],
		});
	});

	it("publishes the request cancellation notification to the current approver", async () => {
		const { prisma, state } = createPrismaHarness({
			employees: [
				{
					id: TEST_IDS.employee1,
					employeeId: "EMP-001",
					organizationId: "org-1",
					role: "hris-employee",
					isDeleted: false,
					reportToId: TEST_IDS.manager1,
					person: { personalInfo: { firstName: "Mina", lastName: "Santos" } },
				},
				{
					id: TEST_IDS.manager1,
					employeeId: "EMP-MGR",
					organizationId: "org-1",
					role: "hris-employee-manager",
					isDeleted: false,
					person: { personalInfo: { firstName: "Rene", lastName: "Lopez" } },
				},
			],
			organizations: [{ id: "org-1", isDeleted: false, branding: null }],
		});
		seedWorkflowRequest(state, {
			requestId: "request-cancel",
			workflowInstanceId: "workflow-cancel",
			organizationId: "org-1",
			requesterId: TEST_IDS.employee1,
			requestType: "OTHER",
			currentWorkflowStateKey: "SUBMITTED",
			currentStepExecutionId: "request-cancel-step-1",
			code: "REQ-00043",
		});
		const requestController = requestControllerFactory(prisma);

		const response = await invoke(requestController.cancel, buildRequestContext(prisma, {
			params: { id: "request-cancel" },
			body: { reason: "No longer needed" },
		}));

		expect(response.statusCode).to.equal(200);
		expect(state.notifications).to.have.length(1);
		expectNotification(state.notifications[0], {
			eventKey: "request:request-cancel:status:CANCELLED",
			category: "REQUEST",
			type: "WARNING",
			title: "Request cancelled",
			targetUrl: "/employee/approvals/requests?action=view&id=request-cancel",
			recipientIds: [TEST_IDS.manager1],
		});
	});

	it("publishes the edit permission request notification to the reviewer from timesheet.create flow", async () => {
		const { prisma, state } = createPrismaHarness({
			employees: [
				{
					id: TEST_IDS.employee1,
					employeeId: "EMP-001",
					organizationId: "org-1",
					role: "hris-employee",
					isDeleted: false,
					reportToId: TEST_IDS.manager1,
					person: { personalInfo: { firstName: "Mina", lastName: "Santos" } },
				},
				{
					id: TEST_IDS.manager1,
					employeeId: "EMP-MGR",
					organizationId: "org-1",
					role: "hris-employee-manager",
					isDeleted: false,
					person: { personalInfo: { firstName: "Rene", lastName: "Lopez" } },
				},
			],
			organizations: [{ id: "org-1", isDeleted: false, branding: null }],
			timesheets: [
				{
					id: "timesheet-1",
					organizationId: "org-1",
					code: "TS-001",
					employeeId: TEST_IDS.employee1,
					isDeleted: false,
					status: "DRAFT",
					editPermissionStatus: "NONE",
					payrollPeriod: {
						id: "period-1",
						code: "PER-001",
						name: "Period 1 - June 2026",
					},
				},
			],
			timesheetConfigs: [
				{
					organizationId: "org-1",
					enableEditBeforeSubmission: true,
				},
			],
			workflowInstances: [buildWorkflowTemplateInstance("org-1", "TIMESHEET")],
		});
		const timesheetController = timesheetControllerFactory(prisma);

		const response = await invoke(timesheetController.requestEditPermission, buildTimesheetContext({
			params: { id: "timesheet-1" },
			body: { reason: "Need to correct punch-in" },
			role: "hris-employee",
			metadata: { employee: { id: TEST_IDS.employee1 } },
		}));

		expect(response.statusCode).to.equal(200);
		expect(state.notifications).to.have.length(1);
		expectNotification(state.notifications[0], {
			eventKey: "request:request-1:step:workflowStepExecution-1:assigned",
			category: "REQUEST",
			type: "INFO",
			title: "Approval required",
			targetUrl: "/employee/approvals/requests?action=view&id=request-1",
			recipientIds: [TEST_IDS.manager1],
		});
	});

	it("sends draft reminders to the employee and submitted reminders to the manager", async () => {
		const { prisma: draftPrisma, state: draftState } = createPrismaHarness({
			employees: [
				{
					id: TEST_IDS.employee1,
					employeeId: "EMP-001",
					organizationId: "org-1",
					role: "hris-employee",
					isDeleted: false,
					reportToId: TEST_IDS.manager1,
					person: { personalInfo: { firstName: "Mina", lastName: "Santos" } },
				},
				{
					id: TEST_IDS.manager1,
					employeeId: "EMP-MGR",
					organizationId: "org-1",
					role: "hris-employee-manager",
					isDeleted: false,
					person: { personalInfo: { firstName: "Rene", lastName: "Lopez" } },
				},
			],
			organizations: [{ id: "org-1", isDeleted: false, branding: null }],
			timesheets: [
				{
					id: "timesheet-draft",
					organizationId: "org-1",
					code: "TS-002",
					employeeId: TEST_IDS.employee1,
					isDeleted: false,
					status: "DRAFT",
					payrollPeriod: {
						id: "period-2",
						code: "PER-002",
						name: "Period 2 - June 2026",
					},
				},
			],
		});
		const draftTimesheetController = timesheetControllerFactory(draftPrisma);
		const draftResponse = await invoke(draftTimesheetController.sendReminder, buildTimesheetContext({
			params: { id: "timesheet-draft" },
			body: { kind: "employee_submit" },
			role: "hris-hr-manager",
		}));

		expect(draftResponse.statusCode).to.equal(200);
		expect(draftState.notifications).to.have.length(1);
		expectNotification(draftState.notifications[0], {
			eventKey: "timesheet:timesheet-draft:reminder:employee_submit",
			category: "REMINDER",
			type: "REMINDER",
			title: "Submit your timesheet",
			targetUrl: "/employee/attendance?action=view-timesheet",
			recipientIds: [TEST_IDS.employee1],
		});

		const { prisma: submittedPrisma, state: submittedState } = createPrismaHarness({
			employees: [
				{
					id: TEST_IDS.employee2,
					employeeId: "EMP-002",
					organizationId: "org-1",
					role: "hris-employee",
					isDeleted: false,
					reportToId: TEST_IDS.manager2,
					person: { personalInfo: { firstName: "Lara", lastName: "Reyes" } },
				},
				{
					id: TEST_IDS.manager2,
					employeeId: "EMP-MGR-2",
					organizationId: "org-1",
					role: "hris-employee-manager",
					isDeleted: false,
					person: { personalInfo: { firstName: "Nico", lastName: "Tan" } },
				},
			],
			organizations: [{ id: "org-1", isDeleted: false, branding: null }],
			timesheets: [
				{
					id: "timesheet-submitted",
					organizationId: "org-1",
					code: "TS-003",
					employeeId: TEST_IDS.employee2,
					isDeleted: false,
					status: "SUBMITTED",
					payrollPeriod: {
						id: "period-3",
						code: "PER-003",
						name: "Period 3 - June 2026",
					},
				},
			],
		});
		const submittedTimesheetController = timesheetControllerFactory(submittedPrisma);
		const submittedResponse = await invoke(
			submittedTimesheetController.sendReminder,
			buildTimesheetContext({
				params: { id: "timesheet-submitted" },
				body: { kind: "manager_approval" },
				role: "hris-hr-manager",
			}),
		);

		expect(submittedResponse.statusCode).to.equal(200);
		expect(submittedState.notifications).to.have.length(1);
		expectNotification(submittedState.notifications[0], {
			eventKey: "timesheet:timesheet-submitted:reminder:manager_approval",
			category: "REMINDER",
			type: "REMINDER",
			title: "Timesheet awaiting approval",
			targetUrl: "/employee/approvals/timesheet?action=timesheet.review&id=timesheet-submitted",
			recipientIds: [TEST_IDS.manager2],
		});
	});

	it("publishes fallback timesheet decision notifications for approve and reject actions without a linked request", async () => {
		const { prisma: approvePrisma, state: approveState } = createPrismaHarness({
			employees: [
				{
					id: TEST_IDS.employee1,
					employeeId: "EMP-001",
					organizationId: "org-1",
					role: "hris-employee",
					isDeleted: false,
					person: { personalInfo: { firstName: "Mina", lastName: "Santos" } },
				},
			],
			organizations: [{ id: "org-1", isDeleted: false, branding: null }],
			timesheets: [
				{
					id: "timesheet-approve",
					organizationId: "org-1",
					code: "TS-004",
					employeeId: TEST_IDS.employee1,
					isDeleted: false,
					status: "SUBMITTED",
					payrollPeriod: {
						id: "period-4",
						code: "PER-004",
						name: "Period 4 - June 2026",
					},
				},
			],
		});
		const approveTimesheetController = timesheetControllerFactory(approvePrisma);
		const approveResponse = await invoke(approveTimesheetController.action, buildTimesheetContext({
			params: { id: "timesheet-approve" },
			body: { action: "APPROVE", notes: "Looks good" },
			role: "hris-hr-manager",
			metadata: { employee: { id: TEST_IDS.employee1 } },
		}));

		expect(approveResponse.statusCode).to.equal(200);
		expect(approveState.notifications).to.have.length(1);
		expectNotification(approveState.notifications[0], {
			eventKey: "timesheet:timesheet-approve:status:APPROVED",
			category: "APPROVAL",
			type: "SUCCESS",
			title: "Timesheet approved",
			targetUrl: "/employee/attendance?action=view-timesheet",
			recipientIds: [TEST_IDS.employee1],
		});

		const { prisma: rejectPrisma, state: rejectState } = createPrismaHarness({
			employees: [
				{
					id: TEST_IDS.employee2,
					employeeId: "EMP-002",
					organizationId: "org-1",
					role: "hris-employee",
					isDeleted: false,
					person: { personalInfo: { firstName: "Lara", lastName: "Reyes" } },
				},
			],
			organizations: [{ id: "org-1", isDeleted: false, branding: null }],
			timesheets: [
				{
					id: "timesheet-reject",
					organizationId: "org-1",
					code: "TS-005",
					employeeId: TEST_IDS.employee2,
					isDeleted: false,
					status: "SUBMITTED",
					payrollPeriod: {
						id: "period-5",
						code: "PER-005",
						name: "Period 5 - June 2026",
					},
				},
			],
		});
		const rejectTimesheetController = timesheetControllerFactory(rejectPrisma);
		const rejectResponse = await invoke(rejectTimesheetController.action, buildTimesheetContext({
			params: { id: "timesheet-reject" },
			body: { action: "REJECT", rejectionReason: "Please correct the totals" },
			role: "hris-hr-manager",
			metadata: { employee: { id: TEST_IDS.employee2 } },
		}));

		expect(rejectResponse.statusCode).to.equal(200);
		expect(rejectState.notifications).to.have.length(1);
		expectNotification(rejectState.notifications[0], {
			eventKey: "timesheet:timesheet-reject:status:REJECTED",
			category: "APPROVAL",
			type: "WARNING",
			title: "Timesheet rejected",
			targetUrl: "/employee/attendance?action=view-timesheet",
			recipientIds: [TEST_IDS.employee2],
		});
	});

	it("creates the document request notifications (submitted + approval needed) on document request creation", async () => {
		const { prisma, state } = createPrismaHarness({
			employees: [
				{
					id: TEST_IDS.employee1,
					employeeId: "EMP-001",
					organizationId: "org-1",
					role: "hris-employee",
					isDeleted: false,
					userId: "user-1",
					reportToId: TEST_IDS.manager1,
					person: { personalInfo: { firstName: "Mina", lastName: "Santos" } },
				},
				{
					id: TEST_IDS.manager1,
					employeeId: "EMP-MGR",
					organizationId: "org-1",
					role: "hris-employee-manager",
					isDeleted: false,
					person: { personalInfo: { firstName: "Rene", lastName: "Lopez" } },
				},
			],
			organizations: [{ id: "org-1", isDeleted: false, branding: null }],
			workflowInstances: [buildWorkflowTemplateInstance("org-1", "DOCUMENT_REQUEST")],
		});
		const requestController = requestControllerFactory(prisma);

		const response = await invoke(requestController.create, buildRequestContext(prisma, {
			body: {
				organizationId: "org-1",
				requesterId: TEST_IDS.employee1,
				type: "DOCUMENT_REQUEST",
				description: "Request Certificate of Employment",
				metadata: { documentType: "COE" },
			},
			role: "hris-employee",
			user: { id: "user-1", organizationId: "org-1" },
			metadata: { employee: { id: TEST_IDS.employee1 } },
		}));

		expect(response.statusCode).to.equal(201);
		expect(state.requests).to.have.length(1);
		expect(state.notifications).to.have.length(2);

		expectNotification(state.notifications[0], {
			eventKey: "request:request-1:status:SUBMITTED",
			category: "REQUEST",
			type: "INFO",
			title: "Document request submitted",
			targetUrl: "/employee/requests/documents?action=view&id=request-1",
			recipientIds: [TEST_IDS.employee1],
		});
		expect(state.notifications[0].description).to.contain("Certificate of Employment");

		expectNotification(state.notifications[1], {
			eventKey: "request:request-1:step:workflowStepExecution-1:assigned",
			category: "APPROVAL",
			type: "INFO",
			title: "Document approval needed",
			targetUrl: "/employee/approvals/requests?action=view&id=request-1",
			recipientIds: [TEST_IDS.manager1],
		});
		expect(state.notifications[1].description).to.contain("Certificate of Employment");
	});

	it("publishes the document request completed notification when transitioning to COMPLETED", async () => {
		const { prisma, state } = createPrismaHarness({
			employees: [
				{
					id: TEST_IDS.employee1,
					employeeId: "EMP-001",
					organizationId: "org-1",
					role: "hris-employee",
					isDeleted: false,
					userId: "user-1",
					reportToId: TEST_IDS.manager1,
					person: { personalInfo: { firstName: "Mina", lastName: "Santos" } },
				},
				{
					id: TEST_IDS.manager1,
					employeeId: "EMP-MGR",
					organizationId: "org-1",
					role: "hris-employee-manager",
					isDeleted: false,
					person: { personalInfo: { firstName: "Rene", lastName: "Lopez" } },
				},
			],
			organizations: [{ id: "org-1", isDeleted: false, branding: null }],
		});

		seedWorkflowRequest(state, {
			requestId: "doc-request-1",
			workflowInstanceId: "doc-wf-1",
			organizationId: "org-1",
			requesterId: TEST_IDS.employee1,
			requestType: "DOCUMENT_REQUEST",
			currentWorkflowStateKey: "APPROVED",
			currentStepExecutionId: "doc-step-2",
			code: "REQ-COE-1",
		});

		state.requests[0].metadata = { documentType: "COE" };

		const requestController = requestControllerFactory(prisma);

		const response = await invoke(requestController.approval, {
			...buildRequestContext(prisma, {
				params: { id: "doc-request-1" },
				body: { action: "approve" },
				role: "hris-employee-manager",
				metadata: { employee: { id: TEST_IDS.manager1 } },
			}),
		});

		expect(response.statusCode).to.equal(200);
		expect(state.notifications).to.have.length(1);
		expectNotification(state.notifications[0], {
			eventKey: "request:doc-request-1:status:COMPLETED",
			category: "REQUEST",
			type: "SUCCESS",
			title: "Document completed",
			targetUrl: "/employee/requests/documents?action=view&id=doc-request-1",
			recipientIds: [TEST_IDS.employee1],
		});
		expect(state.notifications[0].description).to.contain("Certificate of Employment");
	});
});

after(() => {
	prisma.activityLogging.create = originalActivityLoggingCreate;
	prisma.auditLogging.create = originalAuditLoggingCreate;
});
