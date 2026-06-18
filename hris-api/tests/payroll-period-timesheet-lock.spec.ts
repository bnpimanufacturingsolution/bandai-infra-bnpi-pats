/// <reference types="mocha" />

import assert from "node:assert/strict";
import { resolvePayrollTimesheetLockEmployeeId } from "../helper/payroll-period.helper";

describe("payroll period timesheet lock actor resolution", () => {
	it("uses the employee id when processedBy is already an employee id", async () => {
		const prisma = {
			employee: {
				findFirst: async (args: any) => {
					assert.deepEqual(args.where, {
						organizationId: "org-1",
						isDeleted: false,
						OR: [{ id: "emp-1" }, { userId: "emp-1" }],
					});
					return { id: "emp-1" };
				},
			},
		};

		const resolved = await resolvePayrollTimesheetLockEmployeeId(prisma as any, {
			organizationId: "org-1",
			processedBy: "emp-1",
		});

		assert.equal(resolved, "emp-1");
	});

	it("maps a user id to the linked employee id before writing Timesheet.lockedBy", async () => {
		const prisma = {
			employee: {
				findFirst: async () => ({ id: "emp-linked-to-user" }),
			},
		};

		const resolved = await resolvePayrollTimesheetLockEmployeeId(prisma as any, {
			organizationId: "org-1",
			processedBy: "user-1",
		});

		assert.equal(resolved, "emp-linked-to-user");
	});

	it("returns null when the actor cannot be resolved to an employee", async () => {
		const prisma = {
			employee: {
				findFirst: async () => null,
			},
		};

		const resolved = await resolvePayrollTimesheetLockEmployeeId(prisma as any, {
			organizationId: "org-1",
			processedBy: "missing-user",
		});

		assert.equal(resolved, null);
	});
});
