import { expect } from "chai";
import type { NextFunction, Request, Response } from "express";
import {
	buildAutoApprovedSubmissionMetadata,
	controller,
	evaluateTimesheetSubmitEligibility,
	resolveTimesheetSubmissionOutcome,
	TIMESHEET_AUTO_APPROVE_METADATA_REASON,
} from "../app/timesheet/timesheet.controller";
import { DEFAULT_TIMESHEET_RULES_CONFIG } from "../helper/timesheet-config.helper";

describe("resolveTimesheetSubmissionOutcome (enableAutoApprove policy)", () => {
	it("keeps the historic SUBMITTED flow when auto-approve is off", () => {
		for (const flag of [false, null, undefined]) {
			const outcome = resolveTimesheetSubmissionOutcome(flag);
			expect(outcome.status).to.equal("SUBMITTED");
			expect(outcome.autoApproved).to.equal(false);
		}
	});

	it("lands submissions directly APPROVED when auto-approve is on", () => {
		const outcome = resolveTimesheetSubmissionOutcome(true);
		expect(outcome.status).to.equal("APPROVED");
		expect(outcome.autoApproved).to.equal(true);
	});
});

describe("auto-approve vs submit eligibility gates", () => {
	it("still requires edit permission to resubmit an auto-approved timesheet", () => {
		// Auto-approve never bypasses the correction gate: an APPROVED timesheet
		// (auto or manual) still needs an approved/consumed edit permission.
		const gate = evaluateTimesheetSubmitEligibility("APPROVED", "NONE");
		expect(gate.canSubmit).to.equal(false);
		expect(gate.reason).to.equal("EDIT_PERMISSION_REQUIRED_FOR_RESUBMISSION");
	});

	it("allows the normal first submission the auto-approve flow builds on", () => {
		for (const status of ["DRAFT", "REVISED"]) {
			const gate = evaluateTimesheetSubmitEligibility(status, "NONE");
			expect(gate.canSubmit).to.equal(true);
		}
	});
});

describe("buildAutoApprovedSubmissionMetadata", () => {
	it("mirrors the manual APPROVE snapshot shape plus auto-approve markers", () => {
		const submittedAt = new Date("2026-09-02T06:00:00.000Z");
		const metadata = buildAutoApprovedSubmissionMetadata(
			{ snapshotSubmittedAtLegacy: "keep-me" },
			submittedAt,
			"employee-1",
		);

		expect(metadata.snapshotState).to.equal("APPROVED");
		expect(metadata.snapshotSubmittedAt).to.equal(submittedAt.toISOString());
		expect(metadata.snapshotSubmittedBy).to.equal("employee-1");
		expect(metadata.snapshotType).to.equal("TIMESHEET_PERIOD");
		expect(metadata.snapshotLockedAt).to.equal(submittedAt.toISOString());
		expect(metadata.snapshotLockedBy).to.equal("employee-1");
		expect(metadata.autoApproved).to.equal(true);
		expect(metadata.autoApprovedReason).to.equal(TIMESHEET_AUTO_APPROVE_METADATA_REASON);
		expect(metadata.snapshotSubmittedAtLegacy).to.equal("keep-me");
	});

	it("does not mutate the existing metadata object", () => {
		const existing = { existingKey: 1 };
		buildAutoApprovedSubmissionMetadata(existing, new Date(), "employee-1");
		expect(existing).to.deep.equal({ existingKey: 1 });
	});
});

// ---------------------------------------------------------------------------
// Direct-invocation integration coverage (fake prisma, no network/redis/DB)
//
// Guards the admin "Auto Approve Timesheet" toggle across all three submission
// paths in app/timesheet/timesheet.controller.ts:
//   1. action() SUBMIT case        — request-creation gate (auto-approve skips)
//   2. submit() resubmit branch    — request-creation gate + APPROVED stamping
//   3. submit() auto-generate path — APPROVED status handed to
//      generateTimesheetForEmployee + audit metadata stamped on top
// plus the getConfig/updateConfig derivation `approvalRequired = !enableAutoApprove`.
// ---------------------------------------------------------------------------

const TEST_TIMEOUT = 10_000;

const ORG_ID = "org-1";
const EMPLOYEE_ID = "emp-1";
const PERIOD_ID = "period-1";

type RecordedQuery = { model: string; method: string; args: any };

// The OFF flows exercise the REAL createOrReuseTimesheetSubmissionRequest
// chain: getDefaultRequestWorkflow exact-matches this seeded template so the
// test proves request creation rather than a WORKFLOW_NOT_CONFIGURED error.
const TIMESHEET_WORKFLOW_TEMPLATE = {
	code: "WF-TIMESHEET-DEFAULT",
	name: "Timesheet approval",
	description: "Default timesheet submission workflow",
	domain: "REQUEST",
	requestType: "TIMESHEET",
	steps: [
		{
			step_number: 1,
			step_name: "Employee Submission",
			step_type: "SUBMISSION",
			assignee_type: "REQUESTER",
			is_required: true,
			state_on_enter: "OPEN",
			state_on_complete: "SUBMITTED",
		},
		{
			step_number: 2,
			step_name: "Supervisor Approval",
			step_type: "APPROVAL",
			assignee_type: "SUPERVISOR",
			is_required: true,
			state_on_enter: "SUBMITTED",
			state_on_approve: "APPROVED",
			state_on_reject: "REJECTED",
		},
	],
	states: [
		{ key: "OPEN", label: "Open", order: 0, isTerminal: false },
		{ key: "SUBMITTED", label: "Submitted", order: 1, isTerminal: false },
		{ key: "APPROVED", label: "Approved", order: 2, isTerminal: true },
		{ key: "REJECTED", label: "Rejected", order: 3, isTerminal: true },
	],
	createdAt: new Date("2026-01-01T00:00:00.000Z"),
	updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

const buildRecordingPrisma = (handlers: {
	timesheetConfig: any;
	existingTimesheet?: any;
	payrollPeriod: any;
}) => {
	const queries: RecordedQuery[] = [];
	const mutations: RecordedQuery[] = [];
	const requestStore: any[] = [];
	let timesheetStore: any = handlers.existingTimesheet ? { ...handlers.existingTimesheet } : null;

	const record = (model: string, method: string, args: any) => {
		queries.push({ model, method, args });
		if (method === "update" || method === "create" || method === "upsert") {
			mutations.push({ model, method, args });
		}
	};

	// Last-match: helper-internal updates (e.g. materialize summary stamps) run
	// BEFORE the controller's status/metadata update on these paths, so the
	// assertions must inspect the controller's own mutation.
	const findMutation = (model: string, method: string) => {
		for (let index = mutations.length - 1; index >= 0; index--) {
			const entry = mutations[index];
			if (entry.model === model && entry.method === method) {
				return entry;
			}
		}
		return undefined;
	};

	const prisma: any = {
		__mutations: mutations,
		__queries: queries,
		__findMutation: findMutation,
		$transaction: async (fn: any) => fn(prisma),
		$connect: async () => undefined,
		$disconnect: async () => undefined,
		$on: () => undefined,
		payrollPeriod: {
			// findMany → [] short-circuits AttendanceObligation recompute so the
			// fake stays out of the schedule engine while the submit paths still
			// exercise their real obligation-materialize branch.
			findFirst: async (args: any) => {
				record("payrollPeriod", "findFirst", args);
				return handlers.payrollPeriod;
			},
			findMany: async (args: any) => {
				record("payrollPeriod", "findMany", args);
				return [];
			},
		},
		timesheetConfig: {
			findUnique: async (args: any) => {
				record("timesheetConfig", "findUnique", args);
				return handlers.timesheetConfig;
			},
			create: async (args: any) => {
				record("timesheetConfig", "create", args);
				return handlers.timesheetConfig;
			},
			update: async (args: any) => {
				record("timesheetConfig", "update", args);
				return { ...handlers.timesheetConfig, ...args.data };
			},
		},
		timesheet: {
			findFirst: async (args: any) => {
				record("timesheet", "findFirst", args);
				return timesheetStore;
			},
			findUnique: async (args: any) => {
				record("timesheet", "findUnique", args);
				return timesheetStore;
			},
			update: async (args: any) => {
				record("timesheet", "update", args);
				timesheetStore = { ...timesheetStore, ...args.data };
				return timesheetStore;
			},
			create: async (args: any) => {
				record("timesheet", "create", args);
				timesheetStore = {
					id: "ts-new",
					code: "TS-NEW",
					organizationId: ORG_ID,
					employeeId: EMPLOYEE_ID,
					payrollPeriodId: PERIOD_ID,
					isDeleted: false,
					...args.data,
				};
				return timesheetStore;
			},
		},
		employee: {
			// createOrReuseTimesheetSubmissionRequest resolves the requester here;
			// a null result aborts the OFF flows with REQUESTER_NOT_FOUND.
			findFirst: async (args: any) => {
				record("employee", "findFirst", args);
				return { id: EMPLOYEE_ID, organizationId: ORG_ID, reportToId: null };
			},
			findUnique: async (args: any) => {
				record("employee", "findUnique", args);
				return { id: EMPLOYEE_ID, organizationId: ORG_ID, schedule: null };
			},
			findMany: async (args: any) => {
				record("employee", "findMany", args);
				return [];
			},
		},
		request: {
			findFirst: async (args: any) => {
				record("request", "findFirst", args);
				return null;
			},
			findMany: async (args: any) => {
				record("request", "findMany", args);
				return [];
			},
			create: async (args: any) => {
				record("request", "create", args);
				const createdRequest = {
					id: `request-${requestStore.length + 1}`,
					workflowInstanceId: null,
					currentStepExecutionId: null,
					...(args?.data || {}),
				};
				requestStore.push(createdRequest);
				return createdRequest;
			},
			findUnique: async (args: any) => {
				record("request", "findUnique", args);
				// Created records carry no currentStepExecution include, so
				// publishRequestCreatedNotification resolves to its null no-op.
				return requestStore.find((entry) => entry.id === args?.where?.id) || null;
			},
			update: async (args: any) => {
				record("request", "update", args);
				const existing = requestStore.find((entry) => entry.id === args?.where?.id);
				if (existing) {
					Object.assign(existing, args?.data || {});
					return existing;
				}
				return { id: args?.where?.id ?? "request-unknown" };
			},
		},
		workflowInstance: {
			findMany: async (args: any) => {
				record("workflowInstance", "findMany", args);
				return [TIMESHEET_WORKFLOW_TEMPLATE];
			},
			create: async (args: any) => {
				record("workflowInstance", "create", args);
				return { id: "wfi-1", ...(args?.data || {}) };
			},
			update: async (args: any) => {
				record("workflowInstance", "update", args);
				return { id: "wfi-1", ...(args?.data || {}) };
			},
		},
	};

	const proxy = new Proxy(prisma, {
		// Defensive fallback: any delegate call without an explicit handler is
		// recorded and resolves [] (read-shaped), so a backend addition on these
		// paths surfaces as a recorded query instead of a TypeError.
		get(target: any, prop: string) {
			if (prop === "$transaction") {
				// Interactive-transaction callbacks receive the SAME proxy: a raw
				// literal would hide the fallback models (requestTransaction,
				// workflowStepExecution) inside createOrReuseTimesheetSubmissionRequest.
				return (callback: any) => callback(proxy);
			}
			if (prop in target) {
				return target[prop];
			}
			target[prop] = {
				findFirst: async (args: any) => {
					record(prop, "findFirst", args);
					return null;
				},
				findUnique: async (args: any) => {
					record(prop, "findUnique", args);
					return null;
				},
				findMany: async (args: any) => {
					record(prop, "findMany", args);
					return [];
				},
				count: async (args: any) => {
					record(prop, "count", args);
					return 0;
				},
				create: async (args: any) => {
					record(prop, "create", args);
					return { id: "generated-1" };
				},
				createMany: async (args: any) => {
					record(prop, "createMany", args);
					return { count: (args?.data || []).length };
				},
				update: async (args: any) => {
					record(prop, "update", args);
					return { id: args?.where?.id ?? "generated-1", ...args?.data };
				},
				updateMany: async (args: any) => {
					record(prop, "updateMany", args);
					return { count: 0 };
				},
				upsert: async (args: any) => {
					record(prop, "upsert", args);
					return { id: "generated-1", ...(args?.create?.data || {}) };
				},
				deleteMany: async (args: any) => {
					record(prop, "deleteMany", args);
					return { count: 0 };
				},
			};
			return target[prop];
		},
	});
	return proxy;
};

const buildAuthReq = (extra: Record<string, any> = {}) =>
	({
		userId: "user-1",
		organizationId: ORG_ID,
		role: "hris-admin",
		metadata: { employee: { id: EMPLOYEE_ID } },
		headers: {},
		socket: { remoteAddress: "127.0.0.1" },
		method: "POST",
		originalUrl: "/api/timesheet/submit",
		...extra,
	}) as any;

const buildRes = (sink: { statusCode: number; payload: any }) => {
	let statusCode = 0;
	const res: any = {
		status(code: number) {
			statusCode = code;
			sink.statusCode = code;
			return this;
		},
		json(payload: any) {
			sink.payload = payload;
			return this;
		},
	};
	res.set = () => res;
	return res as Response;
};

const NEXT: NextFunction = () => undefined;

const buildPayrollPeriod = () => ({
	id: PERIOD_ID,
	code: "P-2026-09",
	name: "Period 2026-09",
	startDate: new Date("2026-09-01T00:00:00.000Z"),
	endDate: new Date("2026-09-30T00:00:00.000Z"),
	isDeleted: false,
});

const baseExistingTimesheet = () => ({
	id: "ts-1",
	code: "TS-001",
	organizationId: ORG_ID,
	employeeId: EMPLOYEE_ID,
	payrollPeriodId: PERIOD_ID,
	status: "DRAFT",
	editPermissionStatus: "NONE",
	isDeleted: false,
	metadata: { legacyKey: "keep" },
	payrollPeriod: buildPayrollPeriod(),
	employee: { id: EMPLOYEE_ID, schedule: null },
	attendances: [],
	timesheetlines: [],
});

const buildTimesheetConfig = (enableAutoApprove: boolean | null | undefined) => ({
	id: "config-1",
	organizationId: ORG_ID,
	enableAutoApprove: enableAutoApprove as boolean,
	enableEditBeforeSubmission: true,
	rejectBehavior: "REVISE",
	overtimeFlagThresholdMinutes:
		DEFAULT_TIMESHEET_RULES_CONFIG.overtimeQualification.minimumMinutesBeforeQualification,
	...DEFAULT_TIMESHEET_RULES_CONFIG,
});

const AUTO_APPROVE_OFF_VARIANTS = [false, null, undefined] as const;

describe("auto-approve submission flows (direct controller invocation)", () => {
	it("action SUBMIT with flag OFF keeps SUBMITTED status and creates the approval request", async function () {
		this.timeout(TEST_TIMEOUT);
		for (const flag of AUTO_APPROVE_OFF_VARIANTS) {
			const prisma = buildRecordingPrisma({
				timesheetConfig: buildTimesheetConfig(flag),
				existingTimesheet: baseExistingTimesheet(),
				payrollPeriod: buildPayrollPeriod(),
			});
			const sink = { statusCode: 0, payload: undefined as any };
			await controller(prisma).action(
				buildAuthReq({ params: { id: "ts-1" }, body: { action: "SUBMIT" } }) as Request,
				buildRes(sink),
				NEXT,
			);

			expect(sink.statusCode, `flag=${String(flag)} status code`).to.equal(200);
			expect(sink.payload?.status).to.equal("success");
			expect(sink.payload?.data?.status).to.equal("SUBMITTED");

			const timesheetUpdate = prisma.__findMutation("timesheet", "update");
			expect(timesheetUpdate, `flag=${String(flag)} timesheet.update`).to.exist;
			expect(timesheetUpdate.args.data.status).to.equal("SUBMITTED");
			// Manual-review metadata shape — no autoApproved markers
			expect(timesheetUpdate.args.data.metadata.snapshotState).to.equal("SUBMITTED");
			expect(timesheetUpdate.args.data.metadata.autoApproved).to.be.undefined;

			// Historic behavior: an approval request IS created
			const requestCreate = prisma.__findMutation("request", "create");
			expect(requestCreate, `flag=${String(flag)} request.create`).to.exist;
			expect(requestCreate.args.data.metadata.timesheetAction).to.equal("SUBMISSION");
		}
	});

	it("action SUBMIT with flag ON lands APPROVED with audit metadata and skips the approval request", async function () {
		this.timeout(TEST_TIMEOUT);
		const prisma = buildRecordingPrisma({
			timesheetConfig: buildTimesheetConfig(true),
			existingTimesheet: baseExistingTimesheet(),
			payrollPeriod: buildPayrollPeriod(),
		});
		const sink = { statusCode: 0, payload: undefined as any };
		await controller(prisma).action(
			buildAuthReq({ params: { id: "ts-1" }, body: { action: "SUBMIT" } }) as Request,
			buildRes(sink),
			NEXT,
		);

		expect(sink.statusCode).to.equal(200);
		expect(sink.payload?.status).to.equal("success");
		expect(sink.payload?.data?.status).to.equal("APPROVED");
		expect(sink.payload?.data?.metadata.autoApproved).to.equal(true);
		expect(sink.payload?.data?.metadata.autoApprovedReason).to.equal(
			TIMESHEET_AUTO_APPROVE_METADATA_REASON,
		);
		expect(sink.payload?.data?.metadata.snapshotState).to.equal("APPROVED");
		// Pre-existing metadata survives the auto-approve stamp (audit continuity)
		expect(sink.payload?.data?.metadata.legacyKey).to.equal("keep");

		const timesheetUpdate = prisma.__findMutation("timesheet", "update");
		expect(timesheetUpdate.args.data.status).to.equal("APPROVED");
		expect(timesheetUpdate.args.data.approvedBy).to.equal(EMPLOYEE_ID);
		expect(timesheetUpdate.args.data.approvalDate).to.exist;
		expect(timesheetUpdate.args.data.metadata.autoApproved).to.equal(true);
		expect(timesheetUpdate.args.data.metadata.legacyKey).to.equal("keep");

		// The auto-approve policy must not spawn a review workflow
		expect(prisma.__findMutation("request", "create")).to.be.undefined;
	});

	it("auto-approve never bypasses the correction resubmission gate", async function () {
		this.timeout(TEST_TIMEOUT);
		// An already-APPROVED timesheet without an approved/consumed edit
		// permission is blocked (403) even with the policy ON: auto-approve
		// changes the landing status of a submission, not the correction gate.
		const timesheet = baseExistingTimesheet();
		timesheet.status = "APPROVED";
		const prisma = buildRecordingPrisma({
			timesheetConfig: buildTimesheetConfig(true),
			existingTimesheet: timesheet,
			payrollPeriod: buildPayrollPeriod(),
		});
		const sink = { statusCode: 0, payload: undefined as any };
		await controller(prisma).submit(buildAuthReq({ body: {} }) as Request, buildRes(sink), NEXT);

		expect(sink.statusCode).to.equal(403);
		expect(sink.payload?.message).to.equal("EDIT_PERMISSION_REQUIRED_FOR_RESUBMISSION");
		// Blocked before any timesheet mutation or request creation
		expect(prisma.__findMutation("timesheet", "update")).to.be.undefined;
		expect(prisma.__findMutation("request", "create")).to.be.undefined;
	});
});

describe("auto-approve employee submit flows (resubmit + auto-generate)", () => {
	it("submit resubmit branch with flag OFF keeps SUBMITTED and creates the approval request", async function () {
		this.timeout(TEST_TIMEOUT);
		const prisma = buildRecordingPrisma({
			timesheetConfig: buildTimesheetConfig(false),
			existingTimesheet: baseExistingTimesheet(),
			payrollPeriod: buildPayrollPeriod(),
		});
		const sink = { statusCode: 0, payload: undefined as any };
		await controller(prisma).submit(buildAuthReq({ body: {} }) as Request, buildRes(sink), NEXT);

		expect(sink.statusCode).to.equal(200);
		expect(sink.payload?.data?.status).to.equal("SUBMITTED");

		const requestCreate = prisma.__findMutation("request", "create");
		expect(requestCreate).to.exist;
		expect(requestCreate.args.data.metadata.timesheetAction).to.equal("SUBMISSION");
	});

	it("submit resubmit branch with flag ON lands APPROVED, stamps audit metadata, and skips the approval request", async function () {
		this.timeout(TEST_TIMEOUT);
		const prisma = buildRecordingPrisma({
			timesheetConfig: buildTimesheetConfig(true),
			existingTimesheet: baseExistingTimesheet(),
			payrollPeriod: buildPayrollPeriod(),
		});
		const sink = { statusCode: 0, payload: undefined as any };
		await controller(prisma).submit(buildAuthReq({ body: {} }) as Request, buildRes(sink), NEXT);

		expect(sink.statusCode).to.equal(200);
		expect(sink.payload?.data?.status).to.equal("APPROVED");
		expect(sink.payload?.data?.approvedBy).to.equal(EMPLOYEE_ID);
		expect(sink.payload?.data?.approvalDate).to.exist;
		expect(sink.payload?.data?.metadata.autoApproved).to.equal(true);
		expect(sink.payload?.data?.metadata.autoApprovedReason).to.equal(
			TIMESHEET_AUTO_APPROVE_METADATA_REASON,
		);
		expect(sink.payload?.data?.metadata.snapshotState).to.equal("APPROVED");
		expect(sink.payload?.data?.metadata.legacyKey).to.equal("keep");

		const timesheetUpdate = prisma.__findMutation("timesheet", "update");
		expect(timesheetUpdate.args.data.status).to.equal("APPROVED");
		expect(timesheetUpdate.args.data.approvedBy).to.equal(EMPLOYEE_ID);
		expect(timesheetUpdate.args.data.approvalDate).to.exist;
		expect(timesheetUpdate.args.data.metadata.autoApproved).to.equal(true);

		expect(prisma.__findMutation("request", "create")).to.be.undefined;
	});

	it("submit auto-generate path with flag OFF creates a SUBMITTED timesheet plus the approval request", async function () {
		this.timeout(TEST_TIMEOUT);
		const prisma = buildRecordingPrisma({
			timesheetConfig: buildTimesheetConfig(false),
			payrollPeriod: buildPayrollPeriod(),
		});
		const sink = { statusCode: 0, payload: undefined as any };
		await controller(prisma).submit(buildAuthReq({ body: {} }) as Request, buildRes(sink), NEXT);

		// The auto-generate branch responds 201 (created), unlike the resubmit branch's 200.
		expect(sink.statusCode).to.equal(201);

		const created = prisma.__findMutation("timesheet", "create");
		expect(created, "timesheet.create must run on the auto-generate path").to.exist;
		expect(created.args.data.status).to.equal("SUBMITTED");
		expect(created.args.data.submittedAt).to.exist;
		expect(created.args.data.submittedBy).to.equal(EMPLOYEE_ID);
		expect(created.args.data.approvedBy).to.be.undefined;

		const requestCreate = prisma.__findMutation("request", "create");
		expect(requestCreate).to.exist;
		expect(requestCreate.args.data.metadata.timesheetAction).to.equal("SUBMISSION");
	});

	it("submit auto-generate path with flag ON creates a directly-APPROVED timesheet with audit metadata and no request", async function () {
		this.timeout(TEST_TIMEOUT);
		const prisma = buildRecordingPrisma({
			timesheetConfig: buildTimesheetConfig(true),
			payrollPeriod: buildPayrollPeriod(),
		});
		const sink = { statusCode: 0, payload: undefined as any };
		await controller(prisma).submit(buildAuthReq({ body: {} }) as Request, buildRes(sink), NEXT);

		// 201 created on the auto-generate branch
		expect(sink.statusCode).to.equal(201);
		expect(sink.payload?.data?.status).to.equal("APPROVED");
		expect(sink.payload?.data?.metadata.autoApproved).to.equal(true);
		expect(sink.payload?.data?.metadata.autoApprovedReason).to.equal(
			TIMESHEET_AUTO_APPROVE_METADATA_REASON,
		);

		// generateTimesheetForEmployee stamps the APPROVED triad for APPROVED status
		const created = prisma.__findMutation("timesheet", "create");
		expect(created).to.exist;
		expect(created.args.data.status).to.equal("APPROVED");
		expect(created.args.data.approvedBy).to.equal(EMPLOYEE_ID);
		expect(created.args.data.approvalDate).to.exist;

		// Controller then stamps auto-approve audit metadata on top of the creation
		const metadataUpdate = prisma.__mutations.find(
			(entry: RecordedQuery) =>
				entry.model === "timesheet" &&
				entry.method === "update" &&
				entry.args?.data?.metadata?.autoApproved === true,
		);
		expect(metadataUpdate, "controller must stamp auto-approve audit metadata").to.exist;
		expect(metadataUpdate.args.data.metadata.snapshotState).to.equal("APPROVED");
		expect(metadataUpdate.args.data.metadata.snapshotType).to.equal("TIMESHEET_PERIOD");

		expect(prisma.__findMutation("request", "create")).to.be.undefined;
	});
});

describe("timesheet config auto-approve derivation (direct controller invocation)", () => {
	it("getConfig derives approvalRequired from enableAutoApprove across flag states", async function () {
		this.timeout(TEST_TIMEOUT);
		for (const [flag, expectedApprovalRequired] of [
			[false, true],
			[null, true],
			[undefined, true],
			[true, false],
		] as const) {
			const prisma = buildRecordingPrisma({
				timesheetConfig: buildTimesheetConfig(flag),
				payrollPeriod: buildPayrollPeriod(),
			});
			const sink = { statusCode: 0, payload: undefined as any };
			await controller(prisma).getConfig(
				buildAuthReq({ method: "GET", originalUrl: "/api/timesheet/config" }) as Request,
				buildRes(sink),
				NEXT,
			);

			expect(sink.statusCode, `flag=${String(flag)}`).to.equal(200);
			expect(sink.payload?.status).to.equal("success");
			expect(sink.payload?.data?.enableAutoApprove, `flag=${String(flag)}`).to.equal(flag);
			expect(
				sink.payload?.data?.approvalRequired,
				`approvalRequired for flag=${String(flag)}`,
			).to.equal(expectedApprovalRequired);
			expect(sink.payload?.data?.blockPayrollOnUnsubmitted).to.equal(true);
		}
	});

	it("updateConfig derives approvalRequired from the persisted enableAutoApprove value", async function () {
		this.timeout(TEST_TIMEOUT);
		const prisma = buildRecordingPrisma({
			timesheetConfig: buildTimesheetConfig(true),
			payrollPeriod: buildPayrollPeriod(),
		});
		const sink = { statusCode: 0, payload: undefined as any };
		await controller(prisma).updateConfig(
			buildAuthReq({
				method: "PATCH",
				originalUrl: "/api/timesheet/config",
				body: { enableAutoApprove: true },
			}) as Request,
			buildRes(sink),
			NEXT,
		);

		expect(sink.statusCode).to.equal(200);
		expect(sink.payload?.status).to.equal("success");
		expect(sink.payload?.data?.enableAutoApprove).to.equal(true);
		expect(sink.payload?.data?.approvalRequired).to.equal(false);

		const configUpdate = prisma.__findMutation("timesheetConfig", "update");
		expect(configUpdate).to.exist;
		expect(configUpdate.args.data.enableAutoApprove).to.equal(true);
	});
});
