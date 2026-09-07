import { expect } from "chai";
import {
	reconcileSectionLineLeaders,
	resolveLineLeaderIds,
} from "../helper/section-line-leaders.helper";
import { deriveRoleAndFlags, deriveRoleAndFlagsFromRecord } from "../utils/role-derivation";

describe("resolveLineLeaderIds", () => {
	const makePrisma = (employees: Array<{ id: string }>) => ({
		employee: {
			findMany: async ({ where }: any) =>
				employees.filter(
					(employee) =>
						where.id?.in?.includes(employee.id) &&
						(!where.organizationId || where.organizationId === "org-1") &&
						(!where.isDeleted || where.isDeleted === false),
				),
		},
	});

	it("returns ids: null when the field is omitted (no reconciliation)", async () => {
		const result = await resolveLineLeaderIds(makePrisma([]) as any, undefined, "org-1");
		expect(result).to.deep.equal({ ok: true, ids: null });
	});

	it("returns empty array for an empty list (clears all memberships)", async () => {
		const result = await resolveLineLeaderIds(makePrisma([]) as any, [], "org-1");
		expect(result).to.deep.equal({ ok: true, ids: [] });
	});

	it("accepts employees that exist in the same organization", async () => {
		const prisma = makePrisma([{ id: "emp-a" }, { id: "emp-b" }]);
		const result = await resolveLineLeaderIds(prisma as any, ["emp-a", "emp-b"], "org-1");
		expect(result).to.deep.equal({ ok: true, ids: ["emp-a", "emp-b"] });
	});

	it("deduplicates requested ids", async () => {
		const prisma = makePrisma([{ id: "emp-a" }]);
		const result = await resolveLineLeaderIds(prisma as any, ["emp-a", "emp-a"], "org-1");
		expect(result).to.deep.equal({ ok: true, ids: ["emp-a"] });
	});

	it("reports missing employees instead of throwing", async () => {
		const prisma = makePrisma([{ id: "emp-a" }]);
		const result = await resolveLineLeaderIds(prisma as any, ["emp-a", "emp-ghost"], "org-1");
		expect(result).to.deep.equal({ ok: false, missing: ["emp-ghost"] });
	});
});

describe("reconcileSectionLineLeaders", () => {
	it("is a no-op returning [] when ids is null (field omitted)", async () => {
		let transactionRan = false;
		const prisma = {
			$transaction: async () => {
				transactionRan = true;
				return [];
			},
		};
		const changed = await reconcileSectionLineLeaders(prisma as any, "sec-1", "org-1", null);
		expect(changed).to.deep.equal([]);
		expect(transactionRan).to.equal(false);
	});

	it("creates missing memberships and returns added ids", async () => {
		const created: any[] = [];
		const current: Array<{ id: string; employeeId: string }> = [];
		const prisma = {
			$transaction: async (fn: (tx: any) => Promise<any>) =>
				fn({
					sectionLineLeader: {
						findMany: async () => current,
						createMany: async ({ data }: any) => {
							created.push(...data);
							current.push(...data.map((row: any, index: number) => ({ id: `new-${index}`, employeeId: row.employeeId })));
							return { count: data.length };
						},
						deleteMany: async () => ({ count: 0 }),
					},
				}),
		};
		const changed = await reconcileSectionLineLeaders(prisma as any, "sec-1", "org-1", [
			"emp-a",
			"emp-b",
		]);
		expect(changed.sort()).to.deep.equal(["emp-a", "emp-b"]);
		expect(created.map((row) => row.employeeId).sort()).to.deep.equal(["emp-a", "emp-b"]);
		expect(created[0].organizationId).to.equal("org-1");
		expect(created[0].sectionId).to.equal("sec-1");
	});

	it("removes memberships that are no longer requested and returns removed ids", async () => {
		let deletedIds: string[] = [];
		const current = [
			{ id: "row-a", employeeId: "emp-a" },
			{ id: "row-b", employeeId: "emp-b" },
		];
		const prisma = {
			$transaction: async (fn: (tx: any) => Promise<any>) =>
				fn({
					sectionLineLeader: {
						findMany: async () => current,
						createMany: async () => ({ count: 0 }),
						deleteMany: async ({ where }: any) => {
							deletedIds = where.id.in;
							return { count: deletedIds.length };
						},
					},
				}),
		};
		const changed = await reconcileSectionLineLeaders(prisma as any, "sec-1", "org-1", [
			"emp-a",
		]);
		expect(changed).to.deep.equal(["emp-b"]);
		expect(deletedIds).to.deep.equal(["row-b"]);
	});

	it("is idempotent: no create/delete when desired set matches current", async () => {
		const current = [{ id: "row-a", employeeId: "emp-a" }];
		let createCalled = false;
		let deleteCalled = false;
		const prisma = {
			$transaction: async (fn: (tx: any) => Promise<any>) =>
				fn({
					sectionLineLeader: {
						findMany: async () => current,
						createMany: async () => {
							createCalled = true;
							return { count: 0 };
						},
						deleteMany: async () => {
							deleteCalled = true;
							return { count: 0 };
						},
					},
				}),
		};
		const changed = await reconcileSectionLineLeaders(prisma as any, "sec-1", "org-1", [
			"emp-a",
		]);
		expect(changed).to.deep.equal([]);
		expect(createCalled).to.equal(false);
		expect(deleteCalled).to.equal(false);
	});
});

describe("line leader role derivation", () => {
	it("plain employee becomes hris-line-leader with isManager=true when membership exists", () => {
		const result = deriveRoleAndFlags({
			department: { isHr: false, name: "Production" },
			level: { isManager: false, name: "Senior" },
			isLineLeader: true,
		});
		expect(result.role).to.equal("hris-line-leader");
		expect(result.isManager).to.equal(true);
		expect(result.isHrManager).to.equal(false);
	});

	it("manager level wins over line-leader membership (no downgrade)", () => {
		const result = deriveRoleAndFlags({
			department: { isHr: false },
			level: { isManager: true },
			isLineLeader: true,
		});
		expect(result.role).to.equal("hris-employee-manager");
		expect(result.isManager).to.equal(true);
	});

	it("HR department wins over line-leader membership", () => {
		const result = deriveRoleAndFlags({
			department: { isHr: true },
			level: { isManager: false },
			isLineLeader: true,
		});
		expect(result.role).to.equal("hris-hr-user");
	});

	it("HR manager level keeps hris-hr-manager even with membership", () => {
		const result = deriveRoleAndFlags({
			department: { isHr: true },
			level: { isManager: true },
			isLineLeader: true,
		});
		expect(result.role).to.equal("hris-hr-manager");
	});

	it("no membership and no manager flag stays hris-employee", () => {
		const result = deriveRoleAndFlagsFromRecord(
			{ isHr: false },
			{ isManager: false },
		);
		expect(result.role).to.equal("hris-employee");
		expect(result.isManager).to.equal(false);
	});

	it("membership without the isLineLeader flag does not grant the role (string/legacy path unchanged)", () => {
		const result = deriveRoleAndFlags("Production", "Senior");
		expect(result.role).to.equal("hris-employee");
	});
});
