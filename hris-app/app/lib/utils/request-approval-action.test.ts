import { describe, expect, it } from "vitest";
import {
	canActOnApprovalRequest,
	canRejectApprovalRequest,
} from "./request-approval-action";

const hrReviewTask = {
	currentWorkflowStateKey: "APPROVED",
	currentStepExecution: {
		stepType: "TASK",
		assigneeType: "HR",
		assigneeId: "emp-maria",
		assignee: { id: "emp-maria" },
	},
};

describe("request approval action", () => {
	it("lets HR complete a pending attendance HR Review task from My Approvals", () => {
		expect(
			canActOnApprovalRequest(hrReviewTask, {
				currentEmployeeId: "emp-rio",
				currentRole: "hris-hr-user",
				isHrActor: true,
			}),
		).toBe(true);
		expect(
			canRejectApprovalRequest(hrReviewTask, {
				currentEmployeeId: "emp-rio",
				currentRole: "hris-hr-user",
				isHrActor: true,
			}),
		).toBe(false);
	});

	it("lets the assigned HR manager complete the same task", () => {
		expect(
			canActOnApprovalRequest(hrReviewTask, {
				currentEmployeeId: "emp-maria",
				currentRole: "hris-hr-manager",
				isHrActor: true,
			}),
		).toBe(true);
	});

	it("does not let a non-HR supervisor complete the HR Review task", () => {
		expect(
			canActOnApprovalRequest(hrReviewTask, {
				currentEmployeeId: "emp-rio",
				currentRole: "hris-employee-manager",
				isHrActor: false,
			}),
		).toBe(false);
	});
});
