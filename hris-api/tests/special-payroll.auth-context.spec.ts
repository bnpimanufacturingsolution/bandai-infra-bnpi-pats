import assert from "node:assert/strict";
import type { Request } from "express";
import { getAuthContext } from "../app/specialPayroll/specialPayroll.controller";

describe("special-payroll auth context (verifyToken shape)", () => {
	it("reads role/userId/org/employee from req fields set by verifyToken", () => {
		const req = {
			role: "hris-hr-manager",
			userId: "user-1",
			organizationId: "org-1",
			metadata: { employee: { id: "emp-1" } },
		} as unknown as Request;

		const auth = getAuthContext(req);

		assert.equal(auth.role, "hris-hr-manager");
		assert.equal(auth.userId, "user-1");
		assert.equal(auth.organizationId, "org-1");
		assert.equal(auth.employeeId, "emp-1");
		assert.equal(auth.isHr, true);
	});

	it("grants HR for hris-hr-user and hris-admin", () => {
		assert.equal(
			getAuthContext({
				role: "hris-hr-user",
				organizationId: "org-1",
			} as unknown as Request).isHr,
			true,
		);
		assert.equal(
			getAuthContext({
				role: "hris-admin",
				organizationId: "org-1",
			} as unknown as Request).isHr,
			true,
		);
	});

	it("does not treat missing role as HR even when organizationId is present", () => {
		// Pre-fix regression: organizationId fallback worked but role was never read,
		// so isHr was always false → 403 "HR access required" on import preview.
		const auth = getAuthContext({
			organizationId: "org-1",
			userId: "user-1",
		} as unknown as Request);

		assert.equal(auth.organizationId, "org-1");
		assert.equal(auth.role, null);
		assert.equal(auth.isHr, false);
	});

	it("falls back to req.user when present (legacy shape)", () => {
		const auth = getAuthContext({
			user: {
				role: "hris-hr-manager",
				userId: "legacy-user",
				organizationId: "legacy-org",
				employeeId: "legacy-emp",
			},
		} as unknown as Request);

		assert.equal(auth.isHr, true);
		assert.equal(auth.userId, "legacy-user");
		assert.equal(auth.organizationId, "legacy-org");
		assert.equal(auth.employeeId, "legacy-emp");
	});

	it("prefers verifyToken fields over req.user when both exist", () => {
		const auth = getAuthContext({
			role: "hris-hr-user",
			userId: "token-user",
			organizationId: "token-org",
			metadata: { employee: { id: "token-emp" } },
			user: {
				role: "employee",
				userId: "legacy-user",
				organizationId: "legacy-org",
				employeeId: "legacy-emp",
			},
		} as unknown as Request);

		assert.equal(auth.role, "hris-hr-user");
		assert.equal(auth.userId, "token-user");
		assert.equal(auth.organizationId, "token-org");
		assert.equal(auth.employeeId, "token-emp");
		assert.equal(auth.isHr, true);
	});

	it("denies non-HR roles", () => {
		const auth = getAuthContext({
			role: "hris-employee",
			organizationId: "org-1",
		} as unknown as Request);
		assert.equal(auth.isHr, false);
	});
});
