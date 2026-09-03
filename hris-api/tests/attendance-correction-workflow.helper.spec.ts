import assert from "node:assert/strict";
import {
	isAttendanceCorrectionHrRole,
	isAttendanceCorrectionRequestType,
	normalizeAttendanceCorrectionWorkflowSteps,
	shouldAutoCompleteAttendanceCorrectionHrReview,
} from "../helper/attendance-correction-workflow.helper";

describe("attendance correction workflow", () => {
	it("is supervisor first, then HR review", () => {
		const steps = normalizeAttendanceCorrectionWorkflowSteps();
		assert.equal(isAttendanceCorrectionRequestType("ATTENDANCE_CORRECTION"), true);
		assert.deepEqual(
			steps.map((step) => `${step.step_number}:${step.assignee_type}`),
			["1:REQUESTER", "2:SUPERVISOR", "3:HR", "4:SYSTEM"],
		);
		assert.equal(steps[1].step_type, "APPROVAL");
		assert.equal(steps[2].step_type, "TASK");
	});

	it("auto-completes HR Review after an HR actor already approved", () => {
		assert.equal(isAttendanceCorrectionHrRole("hris-hr-manager"), true);
		assert.equal(isAttendanceCorrectionHrRole("hris-employee-manager"), false);
		assert.equal(
			shouldAutoCompleteAttendanceCorrectionHrReview({
				requestType: "ATTENDANCE_CORRECTION",
				actingEmployeeRole: "hris-hr-manager",
				nextStep: {
					stepName: "HR Review",
					stepType: "TASK",
					assigneeType: "HR",
					status: "PENDING",
				},
			}),
			true,
		);
		assert.equal(
			shouldAutoCompleteAttendanceCorrectionHrReview({
				requestType: "ATTENDANCE_CORRECTION",
				actingEmployeeRole: "hris-employee-manager",
				nextStep: {
					stepName: "HR Review",
					stepType: "TASK",
					assigneeType: "HR",
					status: "PENDING",
				},
			}),
			false,
		);
	});
});
