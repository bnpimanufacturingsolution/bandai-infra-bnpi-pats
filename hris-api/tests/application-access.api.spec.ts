import { controller } from "../app/applicationAccess/applicationAccess.controller";
import { expect } from "chai";
import { Request, Response, NextFunction } from "express";
import { PrismaClient, Prisma } from "../generated/prisma";
import { prisma as singletonPrisma } from "../config/database";

// Other audit-related specs also patch the shared logging delegates at
// module load; the LAST patch wins. Re-apply ours per test and restore
// afterwards so both this spec and the others stay honest.
const savedDelegates: Record<string, unknown> = {};
const applyAuditPatch = () => {
	for (const key of ["auditLogging", "activityLogging"] as const) {
		savedDelegates[key] = (singletonPrisma as any)[key];
		(singletonPrisma as any)[key] = {
			create: async (params: any) => {
				if (key === "auditLogging") auditCreates.push(params);
				return {};
			},
		};
	}
	savedDelegates.employee = (singletonPrisma as any).employee;
	(singletonPrisma as any).employee = {
		findFirst: async (params: any) =>
			params.where?.userId !== undefined ? { id: "507f1f77bcf86cd7994390aa" } : (savedDelegates.employee as any)?.findFirst?.(params),
	};
};
const restoreAuditPatch = () => {
	for (const key of ["auditLogging", "activityLogging", "employee"] as const) {
		if (savedDelegates[key] !== undefined) {
			(singletonPrisma as any)[key] = savedDelegates[key];
		}
	}
};

const auditCreates: any[] = [];

const TEST_TIMEOUT = 5000;

/**
 * Training & Performance access API contract (Phase 3 Â§31).
 * Admin-only behavior is enforced by verifyRole at the router layer (unit
 * covered by existing middleware tests); here we pin controller behavior:
 * org isolation, validation, lazy creation, full replacement, audit wiring.
 */

const mockEmployee = {
	id: "cmpxw28pk009z7zws7k4rmizt", // real-shaped Postgres-tree cuid (regression: hex-only validation masked the bug)
	employeeId: "EMP-0001",
	employmentStatus: "ACTIVE",
	role: "hris-employee",
	organizationId: "org-1",
	person: { personalInfo: { firstName: "Test", lastName: "User" } },
	department: { id: "dept-1", name: "Engineering" },
	email: "test.user@example.com",
};

const mockAccessRow = {
	id: "507f1f77bcf86cd7994390bb",
	organizationId: "org-1",
	employeeId: mockEmployee.id,
	lmsRoleOverride: null as string | null,
	epmrGrants: [] as string[],
	epmrRemovals: [] as string[],
	provisioningStatus: "PENDING",
	lastProvisionedAt: null as Date | null,
	lastBridgeSnapshot: null as unknown,
	lastSyncError: null as string | null,
	isDeleted: false,
	createdAt: new Date(),
	updatedAt: new Date(),
};

describe("ApplicationAccess Controller", () => {
	let applicationAccessController: any;
	let req: Partial<Request>;
	let res: Response;
	let next: NextFunction;
	let prisma: any;
	let sentData: any;
	let statusCode: number;
	let auditCalls: any[];
	let createCalls: any[];
	let updateCalls: any[];

	const buildPrisma = () => {
		createCalls = [];
		updateCalls = [];
		return {
			employee: {
				findFirst: async (params: Prisma.EmployeeFindFirstArgs) => {
					// Org isolation simulation: employee belongs to org-1 only.
					if (params.where?.organizationId && params.where.organizationId !== mockEmployee.organizationId) {
						return null;
					}
					return { ...mockEmployee };
				},
				count: async () => 1,
				findMany: async () => [{ ...mockEmployee }],
			},
			employeeApplicationAccess: {
				findFirst: async (params: Prisma.EmployeeApplicationAccessFindFirstArgs) => {
					if (params.where?.organizationId !== mockEmployee.organizationId) return null;
					return rowsStore.has(mockEmployee.id) ? { ...rowsStore.get(mockEmployee.id) } : null;
				},
				findMany: async (params: Prisma.EmployeeApplicationAccessFindManyArgs) => {
					const orgId = (params.where?.organizationId as any)?.in?.[0] ?? params.where?.organizationId;
					if (orgId !== mockEmployee.organizationId) return [];
					return [...rowsStore.values()].map((row) => ({ ...row }));
				},
				create: async (params: Prisma.EmployeeApplicationAccessCreateArgs) => {
					const row = {
						...mockAccessRow,
						...(params.data as any),
						id: `new-${createCalls.length + 1}`,
						epmrGrants: (params.data as any).epmrGrants || [],
						epmrRemovals: (params.data as any).epmrRemovals || [],
						createdAt: new Date(),
						updatedAt: new Date(),
					};
					rowsStore.set(row.employeeId, row);
					createCalls.push(row);
					return row;
				},
				update: async (params: Prisma.EmployeeApplicationAccessUpdateArgs) => {
					const existing = rowsStore.get((params.where as any).id) ?? mockAccessRow;
					const row = { ...existing, ...(params.data as any), updatedAt: new Date() };
					rowsStore.set(row.employeeId, row);
					updateCalls.push({ where: params.where, data: params.data });
					return row;
				},
				upsert: async (params: Prisma.EmployeeApplicationAccessUpsertArgs) => {
					const key = params.where as any;
					const existing = rowsStore.has(key.employeeId) ? rowsStore.get(key.employeeId) : null;
					if (existing) {
						const row = { ...existing, ...(params.update as any), updatedAt: new Date() };
						rowsStore.set(key.employeeId, row);
						updateCalls.push({ where: params.where, data: params.update });
						return row;
					}
					const row = {
						...mockAccessRow,
						...(params.create as any),
						id: `upsert-${createCalls.length + 1}`,
						createdAt: new Date(),
						updatedAt: new Date(),
					};
					rowsStore.set(key.employeeId, row);
					createCalls.push(row);
					return row;
				},
			},
		};
	};

	let rowsStore: Map<string, any>;

	afterEach(() => {
		restoreAuditPatch();
	});

	beforeEach(() => {
		applyAuditPatch();
		rowsStore = new Map();
		auditCalls = [];
		prisma = buildPrisma();
		// Audit/activity logging is side-effectful against the real DB in other
		// specs; stub the loggers through module injection points.
		applicationAccessController = controller(prisma as PrismaClient);
		sentData = undefined;
		statusCode = 200;
		req = {
			query: {},
			params: {},
			body: {},
			get: (header: string) => (header === "Content-Type" ? "application/json" : undefined),
			headers: {},
			ip: "127.0.0.1",
			socket: { remoteAddress: "127.0.0.1" },
			method: "PUT",
			originalUrl: "/api/admin/applications/access",
			organizationId: "org-1",
			user: { id: "user-1" },
		} as any;
		res = {
			status: (code: number) => {
				statusCode = code;
				return res;
			},
			json: (data: any) => {
				sentData = data;
				return res;
			},
		} as unknown as Response;
		next = (() => {}) as NextFunction;
	});

	describe(".listAccess()", () => {
		it("returns employees with effective access (defaults when no config)", async () => {
			await applicationAccessController.listAccess(req as Request, res as Response, next);
			expect(statusCode).to.equal(200);
			expect(sentData.status).to.equal("success");
			const item = sentData.data.items[0];
			expect(item.employeeId).to.equal(mockEmployee.id);
			expect(item.lmsRole).to.equal("employee");
			expect(item.epmrSubroles).to.deep.equal(["epmr_ratee", "epmr_rater"]);
			expect(item.hasExplicitConfig).to.equal(false);
		});

		it("rejects missing organization context", async () => {
			req.organizationId = undefined;
			await applicationAccessController.listAccess(req as Request, res as Response, next);
			expect(statusCode).to.equal(400);
		});
	});

	describe(".getAccess()", () => {
		it("returns detail with explicit config and effective access", async () => {
			req.params = { employeeId: mockEmployee.id };
			await applicationAccessController.getAccess(req as Request, res as Response, next);
			expect(statusCode).to.equal(200);
			expect(sentData.data.effective.lmsRole).to.equal("employee");
			expect(sentData.data.explicitConfig).to.equal(null);
		});

		it("returns 404 for cross-organization employee", async () => {
			req.organizationId = "org-B";
			req.params = { employeeId: mockEmployee.id };
			await applicationAccessController.getAccess(req as Request, res as Response, next);
			expect(statusCode).to.equal(404);
		});

		it("returns 400 for malformed employee ID", async () => {
			req.params = { employeeId: "not-an-objectid" };
			await applicationAccessController.getAccess(req as Request, res as Response, next);
			expect(statusCode).to.equal(400);
		});
	});

	describe(".updateAccess()", () => {
		it("lazily creates the config row on first PUT", async () => {
			req.params = { employeeId: mockEmployee.id };
			req.body = { lmsRoleOverride: null, epmrGrants: ["epmr_qa"], epmrRemovals: [] };
			await applicationAccessController.updateAccess(req as Request, res as Response, next);
			expect(statusCode).to.equal(200);
			expect(createCalls).to.have.lengthOf(1);
			expect(sentData.data.effective.epmrSubroles).to.deep.equal([
				"epmr_ratee",
				"epmr_rater",
				"epmr_qa",
			]);
			expect(sentData.data.provisioningStatus).to.equal("PENDING");
		});

		it("full-replaces explicit configuration on subsequent PUT", async () => {
			req.params = { employeeId: mockEmployee.id };
			req.body = { lmsRoleOverride: "instructor", epmrGrants: ["epmr_qa"], epmrRemovals: [] };
			await applicationAccessController.updateAccess(req as Request, res as Response, next);
			expect(createCalls).to.have.lengthOf(1);

			req.body = { lmsRoleOverride: null, epmrGrants: [], epmrRemovals: ["epmr_rater"] };
			await applicationAccessController.updateAccess(req as Request, res as Response, next);
			expect(statusCode).to.equal(200);
			expect(createCalls).to.have.lengthOf(1);
			expect(updateCalls).to.have.lengthOf(1);
			expect(sentData.data.explicitConfig).to.deep.equal({
				lmsRoleOverride: null,
				epmrGrants: [],
				epmrRemovals: ["epmr_rater"],
			});
			expect(sentData.data.effective.epmrSubroles).to.deep.equal(["epmr_ratee"]);
		});

		it("rejects invalid payload with 400", async () => {
			req.params = { employeeId: mockEmployee.id };
			req.body = { lmsRoleOverride: "superadmin", epmrGrants: [], epmrRemovals: [] };
			await applicationAccessController.updateAccess(req as Request, res as Response, next);
			expect(statusCode).to.equal(400);
			expect(sentData.status).to.equal("error");
		});

		it("returns 404 for cross-organization update", async () => {
			req.organizationId = "org-B";
			req.params = { employeeId: mockEmployee.id };
			req.body = { lmsRoleOverride: null, epmrGrants: [], epmrRemovals: [] };
			await applicationAccessController.updateAccess(req as Request, res as Response, next);
			expect(statusCode).to.equal(404);
			expect(createCalls).to.have.lengthOf(0);
		});

		it("records audit with before/after explicit and effective access", async () => {
			auditCreates.length = 0;
			req.params = { employeeId: mockEmployee.id };
			req.body = { lmsRoleOverride: null, epmrGrants: ["epmr_admin"], epmrRemovals: [] };
			await applicationAccessController.updateAccess(req as Request, res as Response, next);
			expect(statusCode).to.equal(200);
			// logAudit/logActivity are intentionally fire-and-forget (repo
			// convention) â€” poll briefly for the deferred write under load.
			const auditDeadline = Date.now() + 1000;
			while (auditCreates.length === 0 && Date.now() < auditDeadline) {
				await new Promise((resolve) => setImmediate(resolve));
			}
			expect(auditCreates.length).to.be.greaterThan(0);
			const audit = auditCreates[auditCreates.length - 1];
			expect(audit.data.severity).to.equal("HIGH");
			expect(audit.data.entity.type).to.equal("employee");
			expect(audit.data.changes.before.explicit).to.equal(null);
			expect(audit.data.changes.after.explicit.epmrGrants).to.deep.equal(["epmr_admin"]);
			expect(audit.data.changes.after.effective.epmrSubroles).to.deep.equal([
				"epmr_admin",
				"epmr_ratee",
				"epmr_rater",
			]);
		});
	});

	describe(".getCatalog()", () => {
		it("exposes assignable LMS roles and EPMR vocabulary only", async () => {
			await applicationAccessController.getCatalog(req as Request, res as Response, next);
			expect(statusCode).to.equal(200);
			expect(sentData.data.lmsRoles.assignable).to.deep.equal(["employee", "instructor", "admin"]);
			expect(sentData.data.lmsRoles.nonAssignable).to.include("superadmin");
			expect(sentData.data.epmrSubroles.assignable).to.deep.equal([
				"epmr_admin",
				"epmr_ratee",
				"epmr_rater",
				"epmr_qa",
			]);
			expect(sentData.data.defaultEpmrSubroles).to.deep.equal(["epmr_ratee", "epmr_rater"]);
		});
	});
});

