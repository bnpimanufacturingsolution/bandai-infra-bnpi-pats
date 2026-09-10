import { expect } from "chai";
import {
	canActAsLineLeaderForEmployee,
	getSectionEmployeeIds,
	getSectionIdsForEmployee,
	getSectionIdsLedByEmployee,
	resolveLeaderAssigneeIdsForTargets,
	resolveResponsibleLineLeaderId,
} from "../helper/section-leader-scope.helper";

/**
 * Fake PrismaClient modeling the confirmed data:
 * - SectionLineLeader join rows (leader -> sections)
 * - Employee.sectionId and Employee.position.sectionId membership paths
 * - Employee.lineLeaderId explicit responsible-leader assignment
 */
function makePrisma(data: {
	leaders: Array<{ sectionId: string; employeeId: string }>;
	employees: Array<{
		id: string;
		organizationId: string;
		isDeleted?: boolean;
		sectionId?: string | null;
		lineLeaderId?: string | null;
		position?: { sectionId?: string | null } | null;
	}>;
}) {
	return {
		sectionLineLeader: {
			findMany: async ({ where }: any) => {
				let rows = data.leaders;
				if (where?.employeeId !== undefined) rows = rows.filter((r) => r.employeeId === where.employeeId);
				if (where?.sectionId?.in) rows = rows.filter((r) => where.sectionId.in.includes(r.sectionId));
				return rows;
			},
		},
		employee: {
			findFirst: async ({ where }: any) => {
				const id = where?.id;
				return (
					data.employees.find(
						(e) => e.id === id && e.organizationId === where.organizationId && !(e.isDeleted ?? false),
					) || null
				);
			},
			findMany: async ({ where }: any) => {
				const sectionFilter = where?.OR?.[0]?.sectionId?.in as string[] | undefined;
				const positionFilter = where?.OR?.[1]?.position?.is?.sectionId?.in as string[] | undefined;
				return data.employees.filter((e) => {
					if (e.organizationId !== where.organizationId || (e.isDeleted ?? false)) return false;
					if (sectionFilter && e.sectionId && sectionFilter.includes(e.sectionId)) return true;
					if (positionFilter && e.position?.sectionId && positionFilter.includes(e.position.sectionId))
						return true;
					return false;
				});
			},
		},
	} as any;
}

const ORG = "org-1";

describe("getSectionIdsLedByEmployee", () => {
	it("returns sections the employee leads", async () => {
		const prisma = makePrisma({
			leaders: [
				{ sectionId: "sec-a", employeeId: "leader-1" },
				{ sectionId: "sec-b", employeeId: "leader-1" },
				{ sectionId: "sec-a", employeeId: "leader-2" },
			],
			employees: [],
		});
		expect(await getSectionIdsLedByEmployee(prisma, "leader-1")).to.deep.equal(["sec-a", "sec-b"]);
	});

	it("returns empty for a non-leader", async () => {
		const prisma = makePrisma({ leaders: [], employees: [] });
		expect(await getSectionIdsLedByEmployee(prisma, "nobody")).to.deep.equal([]);
	});
});

describe("getSectionEmployeeIds / getSectionIdsForEmployee", () => {
	const employees = [
		{ id: "e1", organizationId: ORG, sectionId: "sec-a" },
		{ id: "e2", organizationId: ORG, position: { sectionId: "sec-a" } },
		{ id: "e3", organizationId: ORG, sectionId: "sec-b" },
		{ id: "e4", organizationId: ORG, sectionId: "sec-a", isDeleted: true },
	];

	it("finds members via sectionId OR position.sectionId, excluding deleted", async () => {
		const prisma = makePrisma({ leaders: [], employees });
		const ids = await getSectionEmployeeIds(prisma, { organizationId: ORG, sectionIds: ["sec-a"] });
		expect(ids.sort()).to.deep.equal(["e1", "e2"]);
	});

	it("resolves an employee's sections from both paths", async () => {
		const prisma = makePrisma({ leaders: [], employees });
		expect(await getSectionIdsForEmployee(prisma, ORG, "e2")).to.deep.equal(["sec-a"]);
		expect(await getSectionIdsForEmployee(prisma, ORG, "e1")).to.deep.equal(["sec-a"]);
		expect(await getSectionIdsForEmployee(prisma, ORG, "e3")).to.deep.equal(["sec-b"]);
		expect(await getSectionIdsForEmployee(prisma, ORG, "ghost")).to.deep.equal([]);
	});
});

describe("resolveResponsibleLineLeaderId", () => {
	it("explicit lineLeaderId wins", async () => {
		const prisma = makePrisma({
			leaders: [
				{ sectionId: "sec-a", employeeId: "leader-1" },
				{ sectionId: "sec-a", employeeId: "leader-2" },
			],
			employees: [{ id: "e1", organizationId: ORG, sectionId: "sec-a", lineLeaderId: "leader-2" }],
		});
		expect(await resolveResponsibleLineLeaderId(prisma, { organizationId: ORG, employeeId: "e1" })).to.equal(
			"leader-2",
		);
	});

	it("unset + single section leader resolves to that leader", async () => {
		const prisma = makePrisma({
			leaders: [{ sectionId: "sec-a", employeeId: "leader-1" }],
			employees: [{ id: "e1", organizationId: ORG, sectionId: "sec-a" }],
		});
		expect(await resolveResponsibleLineLeaderId(prisma, { organizationId: ORG, employeeId: "e1" })).to.equal(
			"leader-1",
		);
	});

	it("unset + 2+ leaders is ambiguous -> null (any may act until assigned)", async () => {
		const prisma = makePrisma({
			leaders: [
				{ sectionId: "sec-a", employeeId: "leader-1" },
				{ sectionId: "sec-a", employeeId: "leader-2" },
			],
			employees: [{ id: "e1", organizationId: ORG, sectionId: "sec-a" }],
		});
		expect(await resolveResponsibleLineLeaderId(prisma, { organizationId: ORG, employeeId: "e1" })).to.equal(
			null,
		);
	});
});

describe("canActAsLineLeaderForEmployee", () => {
	it("grants when explicitly assigned to the acting leader", async () => {
		const prisma = makePrisma({
			leaders: [
				{ sectionId: "sec-a", employeeId: "leader-1" },
				{ sectionId: "sec-a", employeeId: "leader-2" },
			],
			employees: [
				{ id: "leader-1", organizationId: ORG, sectionId: "sec-a" },
				{ id: "e1", organizationId: ORG, sectionId: "sec-a", lineLeaderId: "leader-1" },
			],
		});
		const result = await canActAsLineLeaderForEmployee(prisma, {
			organizationId: ORG,
			leaderEmployeeId: "leader-1",
			targetEmployeeId: "e1",
		});
		expect(result.ok).to.equal(true);
	});

	it("denies when target is explicitly assigned to a different leader in the same section", async () => {
		const prisma = makePrisma({
			leaders: [
				{ sectionId: "sec-a", employeeId: "leader-1" },
				{ sectionId: "sec-a", employeeId: "leader-2" },
			],
			employees: [
				{ id: "leader-1", organizationId: ORG, sectionId: "sec-a" },
				{ id: "e1", organizationId: ORG, sectionId: "sec-a", lineLeaderId: "leader-2" },
			],
		});
		const result = await canActAsLineLeaderForEmployee(prisma, {
			organizationId: ORG,
			leaderEmployeeId: "leader-1",
			targetEmployeeId: "e1",
		});
		expect(result.ok).to.equal(false);
		expect(result.reason).to.equal("target_outside_led_sections");
	});

	it("allows either leader when section has 2+ leaders and no explicit assignment", async () => {
		const prisma = makePrisma({
			leaders: [
				{ sectionId: "sec-a", employeeId: "leader-1" },
				{ sectionId: "sec-a", employeeId: "leader-2" },
			],
			employees: [
				{ id: "leader-1", organizationId: ORG, sectionId: "sec-a" },
				{ id: "e1", organizationId: ORG, sectionId: "sec-a" },
			],
		});
		const r1 = await canActAsLineLeaderForEmployee(prisma, {
			organizationId: ORG,
			leaderEmployeeId: "leader-1",
			targetEmployeeId: "e1",
		});
		const r2 = await canActAsLineLeaderForEmployee(prisma, {
			organizationId: ORG,
			leaderEmployeeId: "leader-2",
			targetEmployeeId: "e1",
		});
		expect(r1.ok).to.equal(true);
		expect(r2.ok).to.equal(true);
	});

	it("denies a leader acting outside their sections", async () => {
		const prisma = makePrisma({
			leaders: [{ sectionId: "sec-a", employeeId: "leader-1" }],
			employees: [
				{ id: "leader-1", organizationId: ORG, sectionId: "sec-a" },
				{ id: "e9", organizationId: ORG, sectionId: "sec-z" },
			],
		});
		const result = await canActAsLineLeaderForEmployee(prisma, {
			organizationId: ORG,
			leaderEmployeeId: "leader-1",
			targetEmployeeId: "e9",
		});
		expect(result.ok).to.equal(false);
		expect(result.reason).to.equal("target_outside_led_sections");
	});

	it("denies a non-leader entirely", async () => {
		const prisma = makePrisma({
			leaders: [],
			employees: [{ id: "e1", organizationId: ORG, sectionId: "sec-a" }],
		});
		const result = await canActAsLineLeaderForEmployee(prisma, {
			organizationId: ORG,
			leaderEmployeeId: "random-employee",
			targetEmployeeId: "e1",
		});
		expect(result.ok).to.equal(false);
		expect(result.reason).to.equal("not_a_section_leader");
	});

	it("respects position-based section membership", async () => {
		const prisma = makePrisma({
			leaders: [{ sectionId: "sec-a", employeeId: "leader-1" }],
			employees: [
				{ id: "leader-1", organizationId: ORG, sectionId: "sec-a" },
				{ id: "e2", organizationId: ORG, position: { sectionId: "sec-a" } },
			],
		});
		const result = await canActAsLineLeaderForEmployee(prisma, {
			organizationId: ORG,
			leaderEmployeeId: "leader-1",
			targetEmployeeId: "e2",
		});
		expect(result.ok).to.equal(true);
	});
});

describe("resolveLeaderAssigneeIdsForTargets", () => {
	it("uses explicit assignment first, then section fallback", async () => {
		const prisma = makePrisma({
			leaders: [
				{ sectionId: "sec-b", employeeId: "leader-b" },
				{ sectionId: "sec-c", employeeId: "leader-c1" },
				{ sectionId: "sec-c", employeeId: "leader-c2" },
			],
			employees: [
				{ id: "t1", organizationId: ORG, sectionId: "sec-b", lineLeaderId: "leader-explicit" },
				{ id: "t2", organizationId: ORG, sectionId: "sec-c" },
			],
		});
		const ids = await resolveLeaderAssigneeIdsForTargets(prisma, {
			organizationId: ORG,
			targetEmployeeIds: ["t1", "t2"],
		});
		expect(ids.sort()).to.deep.equal(["leader-c1", "leader-c2", "leader-explicit"]);
	});

	it("returns empty for employees with no sections/leaders", async () => {
		const prisma = makePrisma({
			leaders: [],
			employees: [{ id: "t9", organizationId: ORG }],
		});
		const ids = await resolveLeaderAssigneeIdsForTargets(prisma, {
			organizationId: ORG,
			targetEmployeeIds: ["t9"],
		});
		expect(ids).to.deep.equal([]);
	});
});
