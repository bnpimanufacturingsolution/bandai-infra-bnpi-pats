import { expect } from "chai";
import {
	ACCOUNT_DEACTIVATED_MESSAGE,
	EMPLOYEE_SELF_SERVICE_BLOCK_MESSAGE,
	buildEmployeeActionBlockedPayload,
	getEmployeeActionBlock,
	getEmployeeActionBlockById,
	isEmployeeSelfServiceBlockedStatus,
	normalizeEmploymentStatus,
} from "../helper/employee-action-block.helper";

describe("employee-action-block.helper", () => {
	it("normalizes employment status to uppercase trimmed value", () => {
		expect(normalizeEmploymentStatus("  resigned ")).to.equal("RESIGNED");
	});

	it("returns empty string when status is missing", () => {
		expect(normalizeEmploymentStatus(undefined)).to.equal("");
	});

	it("blocks TERMINATED status", () => {
		expect(isEmployeeSelfServiceBlockedStatus("TERMINATED")).to.equal(true);
	});

	it("blocks case-insensitive inactive status", () => {
		expect(isEmployeeSelfServiceBlockedStatus(" inactive ")).to.equal(true);
	});

	it("does not block ONBOARDING status", () => {
		expect(isEmployeeSelfServiceBlockedStatus("ONBOARDING")).to.equal(false);
	});

	it("does not block SERVING_NOTICE status", () => {
		expect(isEmployeeSelfServiceBlockedStatus("SERVING_NOTICE")).to.equal(false);
	});

	it("getEmployeeActionBlock returns blocked false for active employee", () => {
		const result = getEmployeeActionBlock({ employmentStatus: "ACTIVE" });
		expect(result.blocked).to.equal(false);
		expect(result.status).to.equal("ACTIVE");
	});

	it("getEmployeeActionBlock returns blocked true with reason code for resigned employee", () => {
		const result = getEmployeeActionBlock({ employmentStatus: "RESIGNED" });
		expect(result.blocked).to.equal(true);
		expect(result.reasonCode).to.equal("EMPLOYEE_SELF_SERVICE_BLOCKED");
		expect(result.message).to.equal(EMPLOYEE_SELF_SERVICE_BLOCK_MESSAGE);
	});

	it("getEmployeeActionBlock handles null employee gracefully", () => {
		const result = getEmployeeActionBlock(null);
		expect(result.blocked).to.equal(false);
		expect(result.status).to.equal(null);
	});

	it("buildEmployeeActionBlockedPayload returns consistent payload shape", () => {
		const payload = buildEmployeeActionBlockedPayload({
			blocked: true,
			status: "TERMINATED",
			message: ACCOUNT_DEACTIVATED_MESSAGE,
			reasonCode: "EMPLOYEE_SELF_SERVICE_BLOCKED",
		});
		expect(payload.error).to.equal("EMPLOYEE_SELF_SERVICE_BLOCKED");
		expect(payload.data.employmentStatus).to.equal("TERMINATED");
		expect(payload.message).to.equal(ACCOUNT_DEACTIVATED_MESSAGE);
	});

	it("buildEmployeeActionBlockedPayload falls back to default message and reason", () => {
		const payload = buildEmployeeActionBlockedPayload({ blocked: true, status: "INACTIVE" });
		expect(payload.message).to.equal(EMPLOYEE_SELF_SERVICE_BLOCK_MESSAGE);
		expect(payload.data.reasonCode).to.equal("EMPLOYEE_SELF_SERVICE_BLOCKED");
	});

	it("getEmployeeActionBlockById blocks terminated employee from database result", async () => {
		const prisma = {
			employee: {
				findFirst: async () => ({ employmentStatus: "TERMINATED" }),
			},
		} as any;
		const result = await getEmployeeActionBlockById(prisma, {
			employeeId: "emp-1",
			organizationId: "org-1",
		});
		expect(result.blocked).to.equal(true);
		expect(result.status).to.equal("TERMINATED");
	});

	it("getEmployeeActionBlockById returns unblocked for missing employee record", async () => {
		const prisma = {
			employee: {
				findFirst: async () => null,
			},
		} as any;
		const result = await getEmployeeActionBlockById(prisma, {
			employeeId: "emp-1",
		});
		expect(result.blocked).to.equal(false);
		expect(result.status).to.equal(null);
	});
});

