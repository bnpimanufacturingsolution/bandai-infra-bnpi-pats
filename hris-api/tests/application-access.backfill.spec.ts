import { expect } from "chai";
import { PrismaClient } from "../generated/prisma";

/**
 * Backfill contract (Phase 3 §27): legacy implicit access (HRIS admin roles
 * -> LMS admin + epmr_admin) is preserved as explicit configuration.
 * Idempotent, never overwrites existing explicit configuration.
 *
 * The backfill script's core decision table is mirrored here against the
 * same rules the script implements; the script itself is exercised via
 * `npm run backfill:application-access` (dry-run) against a live DB.
 */

const BACKFILL_HRIS_ROLES = ["hris-admin", "admin", "super_admin", "superadmin"];

const hasExplicitConfig = (row: {
	lmsRoleOverride: string | null;
	epmrGrants: string[];
	epmrRemovals: string[];
}): boolean =>
	Boolean(
		row.lmsRoleOverride ||
			(Array.isArray(row.epmrGrants) && row.epmrGrants.length > 0) ||
			(Array.isArray(row.epmrRemovals) && row.epmrRemovals.length > 0),
	);

describe("application access backfill contract", () => {
	const decide = (employee: { role: string }, existing: any | null) => {
		if (!BACKFILL_HRIS_ROLES.includes(employee.role)) return "skip-not-legacy-admin";
		if (existing && hasExplicitConfig(existing)) return "skip-explicit-exists";
		if (existing) return "update-telemetry-row";
		return "create";
	};

	it("creates explicit config for legacy admin employees without rows", () => {
		expect(decide({ role: "hris-admin" }, null)).to.equal("create");
		expect(decide({ role: "admin" }, null)).to.equal("create");
		expect(decide({ role: "super_admin" }, null)).to.equal("create");
		expect(decide({ role: "superadmin" }, null)).to.equal("create");
	});

	it("never touches rows that already carry explicit configuration", () => {
		expect(
			decide({ role: "hris-admin" }, {
				lmsRoleOverride: "employee",
				epmrGrants: [],
				epmrRemovals: [],
			}),
		).to.equal("skip-explicit-exists");
		expect(
			decide({ role: "admin" }, {
				lmsRoleOverride: null,
				epmrGrants: ["epmr_qa"],
				epmrRemovals: [],
			}),
		).to.equal("skip-explicit-exists");
	});

	it("fills telemetry-only rows (created by launch upsert) with explicit config", () => {
		expect(
			decide({ role: "hris-admin" }, {
				lmsRoleOverride: null,
				epmrGrants: [],
				epmrRemovals: [],
			}),
		).to.equal("update-telemetry-row");
	});

	it("ignores employees whose HRIS role never had implicit access", () => {
		expect(decide({ role: "hris-employee" }, null)).to.equal("skip-not-legacy-admin");
		expect(decide({ role: "hris-hr-manager" }, null)).to.equal("skip-not-legacy-admin");
	});

	it("backfill payload preserves prior implicit access exactly", () => {
		// The backfill writes lmsRoleOverride "admin" + epmr_admin grant —
		// the resolver must then reproduce the legacy effective access.
		// (Resolver behavior is pinned in application-access.resolver.spec.ts;
		// here we pin the payload shape.)
		const payload = { lmsRoleOverride: "admin", epmrGrants: ["epmr_admin"], epmrRemovals: [] };
		expect(hasExplicitConfig(payload)).to.equal(true);
	});

	it("mocked prisma create path is idempotent (second run changes nothing)", async () => {
		const created: any[] = [];
		const rows = new Map<string, any>();
		const mockPrisma = {
			employee: {
				findMany: async () => [
					{
						id: "emp-1",
						employeeId: "E1",
						organizationId: "org-1",
						user: { id: "u1", role: "hris-admin" },
					},
				],
			},
			employeeApplicationAccess: {
				findMany: async () => [...rows.values()],
				create: async (params: any) => {
					const row = { id: `r${created.length + 1}`, ...params.data };
					rows.set(row.employeeId, row);
					created.push(row);
					return row;
				},
				update: async (params: any) => params,
			},
		} as unknown as PrismaClient;

		const runBackfill = async () => {
			const employees = await mockPrisma.employee.findMany();
			const existingRows = await mockPrisma.employeeApplicationAccess.findMany();
			const rowsByEmployee = new Map(existingRows.map((row) => [row.employeeId, row]));
			for (const employee of employees) {
				const existing = rowsByEmployee.get(employee.id);
				if (existing && hasExplicitConfig(existing)) continue;
				if (existing) {
					await mockPrisma.employeeApplicationAccess.update({ where: { id: existing.id } } as any);
					continue;
				}
				const row = await mockPrisma.employeeApplicationAccess.create({
					data: {
						organizationId: employee.organizationId,
						employeeId: employee.id,
						lmsRoleOverride: "admin",
						epmrGrants: ["epmr_admin"],
						epmrRemovals: [],
						provisioningStatus: "PENDING",
					},
				} as any);
				rowsByEmployee.set(row.employeeId, row);
			}
		};

		await runBackfill();
		const afterFirstRun = created.length;
		await runBackfill();
		expect(afterFirstRun).to.equal(1);
		expect(created.length).to.equal(1);
	});
});
