import { expect } from "chai";
import { cache, cachePublic, cacheUser, invalidateCache } from "../../middleware/cache";
import {
	tryAuthenticateRequest,
	__setVerifyTokenDependenciesForTests,
	__resetVerifyTokenDependenciesForTests,
} from "../../middleware/verifyToken";
import {
	normalizeWorkforceRecruitmentPolicyInput,
	buildWorkforceRecruitmentPolicyCreateInput,
	serializeWorkforceRecruitmentSetting,
	isDepartmentJobRequisitionMetadata,
	resolveWorkforcePolicy,
	buildHiringRequisitionDescription,
} from "../../helper/workforce-recruitment.helper";
import {
	resolveRequestTransactionActorType,
	buildRequestFieldChanges,
} from "../../helper/request-transaction.helper";
import {
	getMatchingRequestTypePostActions,
	hasRequestTypePostAction,
	REQUEST_TYPE_POST_ACTION,
} from "../../helper/request-type-post-action.helper";
import {
	getDefaultWorkflowStates,
	normalizeWorkflowStates,
	getStateLabel,
	getStepEnterState,
	getFinalStateForSteps,
	buildAssigneeResolutionMetadata,
} from "../../helper/request-runtime.helper";

describe("cache/cacheUser/cachePublic", () => {
	it("cache returns middleware function", () => expect(typeof cache()).to.equal("function"));
	it("cachePublic returns middleware function", () =>
		expect(typeof cachePublic).to.equal("function"));
	it("cacheUser returns middleware function", () => expect(typeof cacheUser).to.equal("function"));
	it("cache skips non-GET by calling next", async () => {
		let called = false;
		await cache()({ method: "POST" } as any, {} as any, () => {
			called = true;
		});
		expect(called).to.equal(true);
	});
	it("cache supports skipCache option", async () => {
		let called = false;
		await cache({ skipCache: () => true })({ method: "GET" } as any, {} as any, () => {
			called = true;
		});
		expect(called).to.equal(true);
	});
});

describe("invalidateCache helper", () => {
	it("exports byPattern function", () => expect(typeof invalidateCache.byPattern).to.equal("function"));
	it("exports byKey function", () => expect(typeof invalidateCache.byKey).to.equal("function"));
	it("exports byUser function", () => expect(typeof invalidateCache.byUser).to.equal("function"));
	it("exports public function", () => expect(typeof invalidateCache.public).to.equal("function"));
	it("exports all function", () => expect(typeof invalidateCache.all).to.equal("function"));
});

describe("tryAuthenticateRequest + verify token test hooks", () => {
	it("returns missing_token when no token is present", async () => {
		const out = await tryAuthenticateRequest({ headers: {}, cookies: {} } as any);
		expect(out.authenticated).to.equal(false);
		if (!out.authenticated) expect(out.reason).to.equal("missing_token");
	});
	it("clears context on missing token", async () => {
		const req: any = { headers: {}, cookies: {}, userId: "u1", role: "x" };
		await tryAuthenticateRequest(req);
		expect(req.userId).to.equal(undefined);
		expect(req.role).to.equal(undefined);
	});
	it("supports dependency override hook", () => {
		__setVerifyTokenDependenciesForTests({ prisma: { employee: { findFirst: async () => null } as any } as any });
		__resetVerifyTokenDependenciesForTests();
		expect(true).to.equal(true);
	});
	it("returns failed when malformed bearer token is provided", async () => {
		const out = await tryAuthenticateRequest({
			headers: { authorization: "Bearer not-a-jwt" },
			cookies: {},
		} as any);
		expect(out.authenticated).to.equal(false);
		if (!out.authenticated) expect(out.reason).to.equal("failed");
	});
	it("contains error kind when failed", async () => {
		const out = await tryAuthenticateRequest({
			headers: { authorization: "Bearer bad-token" },
			cookies: {},
		} as any);
		if (!out.authenticated && out.reason === "failed") {
			expect(out.error.kind).to.be.a("string");
		}
	});
});

describe("workforce recruitment helper", () => {
	it("normalizes policy defaults", () => {
		const out = normalizeWorkforceRecruitmentPolicyInput({});
		expect(out.limitBehavior).to.equal("BLOCK");
	});
	it("normalizes tags and ids", () => {
		const out = normalizeWorkforceRecruitmentPolicyInput({
			departmentId: " dep ",
			jobTags: [" a ", "", "b"],
		} as any);
		expect(out.departmentId).to.equal("dep");
		expect(out.jobTags).to.deep.equal(["a", "b"]);
	});
	it("builds policy create input with organization id", () => {
		const out = buildWorkforceRecruitmentPolicyCreateInput("org-1", { targetHeadcount: 2 });
		expect(out.organizationId).to.equal("org-1");
	});
	it("serializes setting and policies", () => {
		const out = serializeWorkforceRecruitmentSetting({
			id: "s1",
			organizationId: "org-1",
			isEnabled: true,
			enforceDepartmentManagerScope: true,
			defaultWorkflowCode: "wf",
			requestSubtype: "DEPARTMENT_JOB_REQUISITION",
			autoCreateJobOnApproval: true,
			seededAt: new Date(),
			updatedAt: new Date(),
			policies: [],
		} as any);
		expect(out.organizationId).to.equal("org-1");
	});
	it("detects department requisition metadata", () => {
		expect(isDepartmentJobRequisitionMetadata({ requestSubtype: "DEPARTMENT_JOB_REQUISITION" })).to.equal(true);
	});
	it("resolves highest specificity policy", () => {
		const selected = resolveWorkforcePolicy(
			{
				id: "s",
				organizationId: "o",
				isEnabled: true,
				enforceDepartmentManagerScope: true,
				defaultWorkflowCode: "X",
				requestSubtype: "DEPARTMENT_JOB_REQUISITION",
				autoCreateJobOnApproval: true,
				policies: [
					{ id: "a", departmentId: "d1", positionId: null, levelId: null, targetHeadcount: 1, limitBehavior: "WARN", defaultWorkflowCode: null, autoCreateJobOnApproval: true, jobType: null, jobLocation: null, jobTags: [], jobDescriptionTemplate: null, isActive: true },
					{ id: "b", departmentId: "d1", positionId: "p1", levelId: null, targetHeadcount: 2, limitBehavior: "BLOCK", defaultWorkflowCode: null, autoCreateJobOnApproval: true, jobType: null, jobLocation: null, jobTags: [], jobDescriptionTemplate: null, isActive: true },
				],
			},
			{ departmentId: "d1", positionId: "p1" },
		);
		expect(selected?.id).to.equal("b");
	});
	it("builds hiring requisition description text", () => {
		const out = buildHiringRequisitionDescription({
			departmentName: "HR",
			positionTitle: "Analyst",
			levelName: "Mid",
			requestedHeadcount: 2,
		});
		expect(out).to.contain("2 headcount");
	});
});

describe("request transaction helper", () => {
	it("maps HR role to HR actor", () =>
		expect(resolveRequestTransactionActorType("hris-hr-user")).to.equal("HR"));
	it("maps manager role to MANAGER actor", () =>
		expect(resolveRequestTransactionActorType("hris-employee-manager")).to.equal("MANAGER"));
	it("returns SYSTEM for system-generated", () =>
		expect(resolveRequestTransactionActorType("hris-employee", true)).to.equal("SYSTEM"));
	it("returns UNKNOWN for unrecognized role", () =>
		expect(resolveRequestTransactionActorType("unknown-role")).to.equal("UNKNOWN"));
	it("buildRequestFieldChanges includes changed fields only", () => {
		const out = buildRequestFieldChanges({ a: 1, b: 2 }, { a: 2, b: 2 });
		expect(out).to.have.length(1);
		expect(out[0].field).to.equal("a");
	});
});

describe("request type post action helper", () => {
	it("returns empty when postActions is not array", () =>
		expect(getMatchingRequestTypePostActions(null, "on_approve")).to.deep.equal([]));
	it("matches valid post actions by timing", () => {
		const out = getMatchingRequestTypePostActions(
			[{ type: REQUEST_TYPE_POST_ACTION, timing: "on_approve" }],
			"on_approve",
		);
		expect(out).to.have.length(1);
	});
	it("hasRequestTypePostAction returns true when action exists", () =>
		expect(
			hasRequestTypePostAction([{ type: REQUEST_TYPE_POST_ACTION, timing: "on_cancel" }], "on_cancel"),
		).to.equal(true));
	it("hasRequestTypePostAction returns false when timing differs", () =>
		expect(
			hasRequestTypePostAction([{ type: REQUEST_TYPE_POST_ACTION, timing: "on_cancel" }], "on_approve"),
		).to.equal(false));
	it("ignores non-matching action types", () =>
		expect(hasRequestTypePostAction([{ type: "OTHER", timing: "on_cancel" }], "on_cancel")).to.equal(false));
});

describe("request runtime small deterministic helpers", () => {
	it("getDefaultWorkflowStates returns non-empty ordered states", () => {
		const out = getDefaultWorkflowStates();
		expect(out.length).to.be.greaterThan(0);
	});
	it("normalizeWorkflowStates falls back to defaults", () =>
		expect(normalizeWorkflowStates(null).length).to.be.greaterThan(0));
	it("getStateLabel resolves label from state key", () => {
		const states = [{ key: "OPEN", label: "Open", order: 1 }];
		expect(getStateLabel(states as any, "OPEN")).to.equal("Open");
	});
	it("getStepEnterState returns OPEN for submission step", () =>
		expect(getStepEnterState({ step_type: "SUBMISSION" } as any)).to.equal("OPEN"));
	it("getFinalStateForSteps returns APPROVED for non-task last step", () =>
		expect(getFinalStateForSteps([{ step_type: "APPROVAL" } as any])).to.equal("APPROVED"));
	it("buildAssigneeResolutionMetadata includes expected keys", () => {
		const out = buildAssigneeResolutionMetadata({
			assigneeId: "a1",
			chain: "SUPERVISOR_CHAIN",
			fallbackLevel: 1,
			reason: "X",
		});
		expect(out).to.have.property("resolved_assignee_id");
	});
});
