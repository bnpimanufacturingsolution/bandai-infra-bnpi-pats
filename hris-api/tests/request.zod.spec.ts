import { expect } from "chai";
import { CreateRequestSchema } from "../zod/request.zod";

const basePanRequest = {
	organizationId: "507f1f77bcf86cd799439011",
	requesterId: "507f1f77bcf86cd799439012",
	targetEmployeeId: "507f1f77bcf86cd799439013",
	description: "Personnel action request",
	startDate: "2026-05-15",
};

describe("Request Zod PAN validation", () => {
	it("allows manager regularization without HR attendance confirmation", () => {
		const result = CreateRequestSchema.safeParse({
			...basePanRequest,
			type: "REGULARIZATION",
			metadata: {
				initiatedByRole: "MANAGER",
				performanceAssessment: "Employee has met role expectations and is ready.",
				recommendation: "Recommend",
				regularizationDate: "2026-05-15",
			},
		});

		expect(result.success).to.equal(true);
	});

	it("rejects malformed HR attendance confirmation when supplied", () => {
		const result = CreateRequestSchema.safeParse({
			...basePanRequest,
			type: "REGULARIZATION",
			metadata: {
				initiatedByRole: "HR",
				performanceAssessment: "Employee has met role expectations and is ready.",
				recommendation: "Recommend",
				attendanceConfirmation: "PENDING",
				regularizationDate: "2026-05-15",
			},
		});

		expect(result.success).to.equal(false);
	});

	it("accepts salary change as a PAN request type", () => {
		const result = CreateRequestSchema.safeParse({
			...basePanRequest,
			type: "SALARY_CHANGE",
			description: "Salary change due to expanded responsibilities",
			metadata: {
				newSalary: 75000,
				justification: "Expanded scope and sustained strong performance.",
			},
		});

		expect(result.success).to.equal(true);
	});
});
