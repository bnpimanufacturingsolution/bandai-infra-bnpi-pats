import { expect } from "chai";
import {
	ApplicantActionValidationError,
	executeApplicantAction,
} from "../helper/recruitment-runtime.helper";

describe("recruitment-runtime.helper", () => {
	it("blocks stage actions when an applicant is already linked to an employee", async () => {
		const prisma: any = {
			applicant: {
				findFirst: async () => ({
					id: "applicant-1",
					organizationId: "org-1",
					workflowInstanceId: "workflow-1",
					currentWorkflowStateKey: "ONBOARDING_READY",
					convertedToEmployeeId: "employee-1",
					jobId: "job-1",
				}),
			},
			workflowInstance: {
				findUnique: async () => ({
					id: "workflow-1",
					states: [],
					steps: [],
					currentStateKey: "ONBOARDING_READY",
				}),
			},
			workflowStepExecution: {
				findFirst: async () => ({
					id: "step-1",
					applicantId: "applicant-1",
					status: "PENDING",
					stepNumber: 1,
					stepName: "Current step",
					stepType: "TASK",
					metadata: null,
				}),
			},
		};

		try {
			await executeApplicantAction(prisma, {
				organizationId: "org-1",
				applicantId: "applicant-1",
				action: "ADVANCE",
			});
			throw new Error("Expected executeApplicantAction to reject");
		} catch (error) {
			expect(error).to.be.instanceOf(ApplicantActionValidationError);
			expect((error as Error).message).to.equal(
				"Already hired. Employee record is the source of truth.",
			);
			expect((error as ApplicantActionValidationError).statusCode).to.equal(409);
		}
	});

	it("blocks duplicate hire actions when the workflow state is already HIRED", async () => {
		const prisma: any = {
			applicant: {
				findFirst: async () => ({
					id: "applicant-2",
					organizationId: "org-1",
					workflowInstanceId: "workflow-1",
					currentWorkflowStateKey: "HIRED",
					convertedToEmployeeId: null,
					jobId: "job-1",
				}),
			},
			workflowInstance: {
				findUnique: async () => ({
					id: "workflow-1",
					states: [],
					steps: [],
					currentStateKey: "HIRED",
				}),
			},
			workflowStepExecution: {
				findFirst: async () => ({
					id: "step-1",
					applicantId: "applicant-2",
					status: "PENDING",
					stepNumber: 1,
					stepName: "Current step",
					stepType: "TASK",
					metadata: null,
				}),
			},
		};

		try {
			await executeApplicantAction(prisma, {
				organizationId: "org-1",
				applicantId: "applicant-2",
				action: "MARK_HIRED",
			});
			throw new Error("Expected executeApplicantAction to reject");
		} catch (error) {
			expect(error).to.be.instanceOf(ApplicantActionValidationError);
			expect((error as Error).message).to.equal(
				"Already hired. Employee record is the source of truth.",
			);
			expect((error as ApplicantActionValidationError).statusCode).to.equal(409);
		}
	});
});
