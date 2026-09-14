import { expect } from "chai";
import {
	getLeaderFiledWorkflowCode,
	isLeaderFiledWorkflowCode,
	LEADER_FILED_OVERTIME_CODE,
	LEADER_FILED_TIMESHEET_CODE,
	LEADER_FILED_ATTENDANCE_CORRECTION_CODE,
	LEADER_FILED_OVERTIME_STEPS,
	LEADER_FILED_ATTENDANCE_CORRECTION_STEPS,
} from "../helper/line-leader-workflow.helper";
import { getRequestWorkflowTemplate } from "../prisma/seeds/requestWorkflowCatalog";
import { normalizeWorkflowConfigRecord } from "../helper/workflow-config.helper";

describe("leader-filed workflow codes", () => {
	it("maps supported request types to their leader-filed templates", () => {
		expect(getLeaderFiledWorkflowCode("OVERTIME")).to.equal(LEADER_FILED_OVERTIME_CODE);
		expect(getLeaderFiledWorkflowCode("TIMESHEET")).to.equal(LEADER_FILED_TIMESHEET_CODE);
		expect(getLeaderFiledWorkflowCode("ATTENDANCE_CORRECTION")).to.equal(
			LEADER_FILED_ATTENDANCE_CORRECTION_CODE,
		);
		expect(getLeaderFiledWorkflowCode("LEAVE")).to.equal(null);
		expect(getLeaderFiledWorkflowCode(undefined)).to.equal(null);
	});

	it("recognizes leader-filed codes case-insensitively and rejects self-service codes", () => {
		expect(isLeaderFiledWorkflowCode("wf-overtime-leader-filed")).to.equal(true);
		expect(isLeaderFiledWorkflowCode(LEADER_FILED_ATTENDANCE_CORRECTION_CODE)).to.equal(true);
		expect(isLeaderFiledWorkflowCode("WF-OVERTIME-DEFAULT")).to.equal(false);
		expect(isLeaderFiledWorkflowCode(null)).to.equal(false);
	});
});

describe("leader-filed step chains", () => {
	it("overtime chain is leader submission -> member's manager (final) -> completion (2026-09-08 operator decision: no HR step)", () => {
		expect(LEADER_FILED_OVERTIME_STEPS).to.have.lengthOf(3);
		expect(LEADER_FILED_OVERTIME_STEPS[1].assignee_type).to.equal("TARGET_DEPARTMENT_MANAGER");
		expect(LEADER_FILED_OVERTIME_STEPS[1].step_type).to.equal("APPROVAL");
		// The manager step is the FINAL approval: approve transitions to APPROVED
		// so the SYSTEM completion task fires the payable-OT side effects.
		expect((LEADER_FILED_OVERTIME_STEPS[1] as any).state_on_approve).to.equal("APPROVED");
		// No HR step anywhere in the OT chain.
		expect(
			LEADER_FILED_OVERTIME_STEPS.some((step) => String((step as any).assignee_type) === "HR"),
		).to.equal(false);
		// Completion is the SYSTEM task that auto-runs after approval.
		expect(LEADER_FILED_OVERTIME_STEPS[2].assignee_type).to.equal("SYSTEM");
		expect(LEADER_FILED_OVERTIME_STEPS[2].step_type).to.equal("TASK");
	});

	it("attendance correction chain mirrors OT: leader submission -> member's manager (final, approve=APPROVED) -> SYSTEM completion (2026-09-09 operator direction; no HR step)", () => {
		expect(LEADER_FILED_ATTENDANCE_CORRECTION_STEPS).to.have.lengthOf(3);
		const managerStep = LEADER_FILED_ATTENDANCE_CORRECTION_STEPS[1] as any;
		expect(managerStep.assignee_type).to.equal("TARGET_DEPARTMENT_MANAGER");
		expect(managerStep.step_type).to.equal("APPROVAL");
		expect(managerStep.state_on_approve).to.equal("APPROVED");
		expect(
			LEADER_FILED_ATTENDANCE_CORRECTION_STEPS.some(
				(step) => String((step as any).assignee_type) === "HR",
			),
		).to.equal(false);
		const completionStep = LEADER_FILED_ATTENDANCE_CORRECTION_STEPS[2] as any;
		expect(completionStep.assignee_type).to.equal("SYSTEM");
		expect(completionStep.step_type).to.equal("TASK");
	});
});

describe("leader-filed templates resolve from the catalog", () => {
	it("catalog returns the overtime leader template by code", () => {
		const template = getRequestWorkflowTemplate({ code: LEADER_FILED_OVERTIME_CODE });
		expect(template).to.not.equal(null);
		expect(template && template.steps).to.have.lengthOf(3);
	});

	it("catalog returns the attendance correction leader template by code", () => {
		const template = getRequestWorkflowTemplate({
			code: LEADER_FILED_ATTENDANCE_CORRECTION_CODE,
		});
		expect(template).to.not.equal(null);
	});
});

describe("normalizer exemption", () => {
	it("config normalization does NOT flatten leader-filed overtime steps to the HR-direct chain", () => {
		const normalized = normalizeWorkflowConfigRecord({
			code: LEADER_FILED_OVERTIME_CODE,
			name: "Overtime (Line Leader Filed)",
			requestType: "OVERTIME",
			steps: LEADER_FILED_OVERTIME_STEPS as any,
		});
		// Shape-only normalization keeps all 3 steps with the manager step intact.
		expect(normalized.steps).to.have.lengthOf(3);
		const managerStep = normalized.steps.find(
			(step) => String((step as any).assignee_type) === "TARGET_DEPARTMENT_MANAGER",
		);
		expect(managerStep).to.exist;
	});

	it("config normalization still flattens the self-service overtime workflow to the HR-direct chain", () => {
		const normalized = normalizeWorkflowConfigRecord({
			code: "WF-OVERTIME-DEFAULT",
			name: "Overtime",
			requestType: "OVERTIME",
			// Wrong-shape input on purpose: the self-service normalizer replaces
			// the steps entirely with the HR-direct chain.
			steps: [{ step_number: 9, step_name: "placeholder" }] as any,
		});
		expect(normalized.steps).to.have.lengthOf(3);
		const managerStep = normalized.steps.find(
			(step) => String((step as any).assignee_type) === "TARGET_DEPARTMENT_MANAGER",
		);
		expect(managerStep).to.not.exist;
	});
});
