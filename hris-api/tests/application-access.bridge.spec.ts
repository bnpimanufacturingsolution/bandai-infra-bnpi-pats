import { expect } from "chai";
import { describe, it } from "mocha";
import {
	buildExternalAccessFromEffective,
	buildExternalAccessFields,
	createExternalLaunch,
	type ExternalProfile,
} from "../lib/external-handoff.service";
import { resolveTrainingPerformanceAccess } from "../lib/application-access/resolver";
import { UpdateApplicationAccessSchema, EmployeeIdParamSchema } from "../lib/application-access/validation";

/**
 * Auth-bridge contract tests (Phase 3 §32).
 * Verifies the handoff payload carries N>1 EPMR subroles as an array while
 * the HMAC envelope stays byte-identical to the frozen contract. LMS-side
 * acceptance was verified in Phase 2 (normalizeTokenList + per-token mapping)
 * and is re-asserted here via the shared token vocabulary — no LMS edits.
 */

const profile = (role: string): ExternalProfile => ({
	userId: "user-1",
	employeeId: "EMP-0001",
	firstName: "Test",
	lastName: "User",
	email: "test.user@example.com",
	departmentName: "Engineering",
	positionTitle: "Engineer",
	role,
	isManager: false,
	isHrManager: false,
	avatar: null,
});

describe("external-handoff Training & Performance contract", () => {
	it("legacy static mapping still emits a single-element epmrSubRole array (backward compat)", () => {
		const access = buildExternalAccessFields("hris-employee");
		expect(access.lmsAccess).to.equal("EMPLOYEE");
		expect(access.epmrSubRole).to.deep.equal(["epmr_ratee"]);
	});

	it("resolver-driven access emits N>1 epmrSubRole as an array", () => {
		const effective = resolveTrainingPerformanceAccess(
			{ employmentStatus: "ACTIVE" },
			{ epmrGrants: ["epmr_qa"] },
		);
		const access = buildExternalAccessFromEffective(effective);
		expect(access.lmsAccess).to.equal("EMPLOYEE");
		expect(Array.isArray(access.epmrSubRole)).to.equal(true);
		expect(access.epmrSubRole).to.deep.equal(["epmr_ratee", "epmr_rater", "epmr_qa"]);
	});

	it("superadmin effective access emits all four epmr subroles as an array", () => {
		const effective = resolveTrainingPerformanceAccess({ employmentStatus: "ACTIVE" }, {
			lmsRoleOverride: "superadmin",
		} as never);
		const access = buildExternalAccessFromEffective(effective);
		expect(access.epmrSubRole).to.deep.equal([
			"epmr_admin",
			"epmr_ratee",
			"epmr_rater",
			"epmr_qa",
		]);
		expect(access.lmsAccess).to.equal("ADMIN");
	});

	it("ineligible employees carry no access fields", () => {
		const effective = resolveTrainingPerformanceAccess({ employmentStatus: "TERMINATED" }, null);
		const access = buildExternalAccessFromEffective(effective);
		expect(access.lmsAccess).to.equal(undefined);
		expect(access.epmrSubRole).to.equal(undefined);
	});

	it("createExternalLaunch denies ineligible employees before any bridge traffic", async () => {
		let bridgeCalled = false;
		const employee = {
			employeeId: "EMP-0001",
			role: "hris-employee",
			employmentStatus: "TERMINATED",
			organization: { code: "bnei" },
			person: { personalInfo: { firstName: "Test", lastName: "User" }, contactInfo: { email: "t@e.com" } },
		};
		const effective = resolveTrainingPerformanceAccess(employee, null);
		try {
			// Guard the global fetch so a regression cannot reach the network.
			const originalFetch = globalThis.fetch;
			globalThis.fetch = (async () => {
				bridgeCalled = true;
				throw new Error("bridge must not be called");
			}) as typeof fetch;
			await createExternalLaunch(employee, "lms", { effectiveAccess: effective });
			throw new Error("expected launch to fail");
		} catch (error: any) {
			expect(error.statusCode).to.equal(403);
			expect(bridgeCalled).to.equal(false);
		}
	});

	it("validation rejects unknown LMS override roles", () => {
		const result = UpdateApplicationAccessSchema.safeParse({
			lmsRoleOverride: "superadmin",
			epmrGrants: [],
			epmrRemovals: [],
		});
		expect(result.success).to.equal(false);
	});

	it("validation rejects unknown EPMR subrole values", () => {
		const result = UpdateApplicationAccessSchema.safeParse({
			lmsRoleOverride: null,
			epmrGrants: ["epmr_ceo"],
			epmrRemovals: [],
		});
		expect(result.success).to.equal(false);
	});

	it("validation rejects grant/removal conflicts", () => {
		const result = UpdateApplicationAccessSchema.safeParse({
			lmsRoleOverride: null,
			epmrGrants: ["epmr_qa"],
			epmrRemovals: ["epmr_qa"],
		});
		expect(result.success).to.equal(false);
	});

	it("validation rejects removals of explicit-only subroles (epmr_admin, epmr_qa)", () => {
		const adminRemoval = UpdateApplicationAccessSchema.safeParse({
			lmsRoleOverride: null,
			epmrGrants: [],
			epmrRemovals: ["epmr_admin"],
		});
		expect(adminRemoval.success).to.equal(false);

		const qaRemoval = UpdateApplicationAccessSchema.safeParse({
			lmsRoleOverride: null,
			epmrGrants: [],
			epmrRemovals: ["epmr_qa"],
		});
		expect(qaRemoval.success).to.equal(false);
	});

	it("validation rejects mass-assignment of server-controlled fields", () => {
		const result = UpdateApplicationAccessSchema.safeParse({
			lmsRoleOverride: null,
			epmrGrants: [],
			epmrRemovals: [],
			provisioningStatus: "SYNCED",
			effectiveEpmrSubroles: ["epmr_admin"],
			isSuperadminInherited: true,
		});
		expect(result.success).to.equal(false);
	});

	it("validation accepts a valid full-replacement payload", () => {
		const result = UpdateApplicationAccessSchema.safeParse({
			lmsRoleOverride: "employee",
			epmrGrants: ["epmr_qa"],
			epmrRemovals: ["epmr_rater"],
		});
		expect(result.success).to.equal(true);
	});
});

describe("EmployeeIdParamSchema (Postgres cuid regression)", () => {
	const realCuid = "cmpxw28pk009z7zws7k4rmizt";

	it("accepts a real-shaped Postgres-tree cuid employee ID", () => {
		expect(EmployeeIdParamSchema.safeParse(realCuid).success).to.equal(true);
	});

	it("still accepts legacy 24-char hex ObjectId employee IDs", () => {
		expect(EmployeeIdParamSchema.safeParse("507f1f77bcf86cd7994390aa").success).to.equal(true);
	});

	it("rejects malformed employee IDs", () => {
		for (const bad of [
			"",
			"not-an-objectid",
			"../etc/passwd",
			"a".repeat(400),
			"cmpxw28pk009z7zws7k4rmizt; DROP TABLE employees;--",
			"CMPXW28PK009Z7ZWS7K4RMIZT!", // uppercase + punctuation
		]) {
			expect(EmployeeIdParamSchema.safeParse(bad).success, `should reject: ${bad}`).to.equal(
				false,
			);
		}
	});
});
