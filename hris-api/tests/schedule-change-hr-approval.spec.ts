import assert from "node:assert/strict";
import {
	getSeededWorkflowConfigs,
	mergeWithSeededWorkflowConfigs,
} from "../helper/workflow-config.helper";
import {
	isStaleScheduleChangeHrTaskExecution,
	normalizeScheduleChangeWorkflowStepsForHrApproval,
	SCHEDULE_CHANGE_HR_APPROVAL_STEP_NAME,
	SCHEDULE_CHANGE_HR_APPROVAL_STEP_NUMBER,
} from "../helper/schedule-change-workflow.helper";
import { CreateScheduleOverrideSchema } from "../zod/scheduleOverride.zod";

const getScheduleHrStep = (steps: Array<Record<string, any>>) =>
	steps.find((step) => Number(step.step_number) === SCHEDULE_CHANGE_HR_APPROVAL_STEP_NUMBER);

describe("schedule change HR approval workflow", () => {
	it("seeds schedule change with HR approval instead of an HR task", () => {
		const workflow = getSeededWorkflowConfigs().find(
			(config) => config.code === "WF-SCHEDULE-CHANGE-DEFAULT",
		);

		assert.notEqual(workflow, undefined);
		const hrStep = getScheduleHrStep(workflow?.steps || []);
		assert.equal(hrStep?.step_name, SCHEDULE_CHANGE_HR_APPROVAL_STEP_NAME);
		assert.equal(hrStep?.step_type, "APPROVAL");
		assert.equal(hrStep?.assignee_type, "HR");
		assert.equal(hrStep?.state_on_approve, "APPROVED");
		assert.equal(hrStep?.state_on_reject, "REJECTED");
		assert.equal(hrStep?.state_on_complete, undefined);
	});

	it("self-repairs stored default workflow configs that still contain the old HR task", () => {
		const merged = mergeWithSeededWorkflowConfigs({
			provisioning: {
				workflowConfigs: [
					{
						code: "WF-SCHEDULE-CHANGE-DEFAULT",
						name: "Schedule Change Workflow",
						domain: "REQUEST",
						requestType: "SCHEDULE_CHANGE",
						states: [],
						steps: [
							{
								step_number: 1,
								step_name: "Employee Submission",
								step_type: "SUBMISSION",
								assignee_type: "REQUESTER",
							},
							{
								step_number: 2,
								step_name: "Manager Approval",
								step_type: "APPROVAL",
								assignee_type: "SUPERVISOR",
							},
							{
								step_number: 3,
								step_name: "HR Schedule Update",
								step_type: "TASK",
								assignee_type: "HR",
								state_on_enter: "FOR_APPROVAL",
								state_on_complete: "APPROVED",
							},
						],
					},
				],
			},
		});

		const workflow = merged.find((config) => config.code === "WF-SCHEDULE-CHANGE-DEFAULT");
		const hrStep = getScheduleHrStep(workflow?.steps || []);
		assert.equal(hrStep?.step_name, SCHEDULE_CHANGE_HR_APPROVAL_STEP_NAME);
		assert.equal(hrStep?.step_type, "APPROVAL");
		assert.equal(hrStep?.state_on_approve, "APPROVED");
		assert.equal(hrStep?.state_on_complete, undefined);
	});

	it("detects a stale pending HR task execution for runtime repair", () => {
		assert.equal(
			isStaleScheduleChangeHrTaskExecution({
				stepNumber: 3,
				stepName: "HR Schedule Update",
				stepType: "TASK",
				assigneeType: "HR",
			}),
			true,
		);

		assert.equal(
			isStaleScheduleChangeHrTaskExecution({
				stepNumber: 3,
				stepName: "HR Approval",
				stepType: "APPROVAL",
				assigneeType: "HR",
			}),
			false,
		);
	});

	it("normalizes stale schedule workflow steps without touching the system completion step", () => {
		const normalized = normalizeScheduleChangeWorkflowStepsForHrApproval([
			{
				step_number: 3,
				step_name: "HR Schedule Update",
				step_type: "TASK",
				assignee_type: "HR",
				state_on_enter: "FOR_APPROVAL",
				state_on_complete: "APPROVED",
			},
			{
				step_number: 4,
				step_name: "Schedule Change Completion",
				step_type: "TASK",
				assignee_type: "SYSTEM",
				state_on_enter: "APPROVED",
			},
		]);

		assert.equal(normalized[0].step_type, "APPROVAL");
		assert.equal(normalized[1].step_type, "TASK");
		assert.equal(normalized[1].assignee_type, "SYSTEM");
	});

	it("accepts copied schedule override snapshots without a master shift type", () => {
		const parsed = CreateScheduleOverrideSchema.safeParse({
			organizationId: "cm0000000000000000000000",
			employeeId: "cm0000000000000000000001",
			date: "2026-05-25",
			reason: "Approved employee schedule change",
			shiftSnapshot: {
				source: "schedule_change_request",
				shiftTypeName: "Flexitime",
				shiftTypeCode: "FLEXITIME",
				isOff: false,
				isOvernight: false,
				timeSlots: [
					{ type: "work", label: "Work", startTime: "10:00", endTime: "14:00" },
					{ type: "break", label: "Break", startTime: "14:00", endTime: "15:00" },
					{ type: "work", label: "Work", startTime: "15:00", endTime: "19:00" },
				],
			},
		});

		assert.equal(parsed.success, true);
		assert.equal(
			CreateScheduleOverrideSchema.safeParse({
				organizationId: "cm0000000000000000000000",
				employeeId: "cm0000000000000000000001",
				date: "2026-05-25",
			}).success,
			false,
		);
	});
});
