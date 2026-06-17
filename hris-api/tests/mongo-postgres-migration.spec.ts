import { expect } from "chai";
import {
	createWithFkFallback,
	extractFkFieldName,
	MODEL_NAMES as BACKFILL_MODEL_NAMES,
	sanitizeRowForTarget,
} from "../scripts/migration/mongo-to-postgres-backfill";
import {
	buildCountParityRows,
	buildStableRowSignature,
	compareSampleRowSignatures,
	MODEL_NAMES as PARITY_MODEL_NAMES,
	summarizeCountParityRows,
} from "../scripts/migration/mongo-postgres-parity";

describe("mongo to postgres migration helpers", () => {
	it("keeps high-risk DM0-DM7 models in the backfill/parity scope", () => {
		const requiredModels = [
			"attendance",
			"attendanceObligation",
			"timesheet",
			"timesheetline",
			"employeePayroll",
			"document",
			"documentFolder",
			"employeeLeaveBalance",
			"employeeBenefit",
			"employeeLoan",
			"requestTransaction",
			"workflowStepExecution",
		];

		for (const modelName of requiredModels) {
			expect(BACKFILL_MODEL_NAMES).to.include(modelName);
			expect(PARITY_MODEL_NAMES).to.include(modelName);
		}
	});

	it("sanitizes source rows to target scalar fields before writing", () => {
		const allowedFields = new Map<string, Set<string>>([
			["employee", new Set(["id", "employeeId", "organizationId"])],
		]);

		const sanitized = sanitizeRowForTarget(
			"employee",
			{
				id: "emp-1",
				employeeId: "BNEI-001",
				organizationId: "org-1",
				person: { id: "person-1" },
				legacyOnlyField: true,
			},
			allowedFields,
		);

		expect(sanitized).to.deep.equal({
			id: "emp-1",
			employeeId: "BNEI-001",
			organizationId: "org-1",
		});
	});

	it("extracts FK field names from Prisma P2003 metadata", () => {
		expect(extractFkFieldName("Employee_reportToId_fkey")).to.equal("reportToId");
		expect(extractFkFieldName("PayrollPeriod_calculatorId_fkey")).to.equal("calculatorId");
		expect(extractFkFieldName(undefined)).to.equal(null);
	});

	it("nulls one missing FK and retries before writing the backfill row", async () => {
		const writes: any[] = [];
		let attempt = 0;
		const targetModel = {
			create: async ({ data }: any) => {
				attempt += 1;
				writes.push({ ...data });
				if (attempt === 1) {
					const error: any = new Error("FK failed");
					error.code = "P2003";
					error.meta = { field_name: "Employee_reportToId_fkey" };
					throw error;
				}
				return { id: data.id };
			},
		};

		await createWithFkFallback(targetModel, "employee", {
			id: "emp-1",
			reportToId: "missing-manager",
		});

		expect(writes).to.deep.equal([
			{ id: "emp-1", reportToId: "missing-manager" },
			{ id: "emp-1", reportToId: null },
		]);
	});

	it("treats duplicate target rows as idempotent backfill skips", async () => {
		let writes = 0;
		const targetModel = {
			create: async () => {
				writes += 1;
				const error: any = new Error("duplicate");
				error.code = "P2002";
				throw error;
			},
		};

		await createWithFkFallback(targetModel, "employee", { id: "emp-1" });
		expect(writes).to.equal(1);
	});
});

describe("mongo postgres parity helpers", () => {
	it("builds count parity rows and reports mismatches", async () => {
		const source = {
			employee: { count: async () => 2 },
			attendance: { count: async () => 1 },
		};
		const target = {
			employee: { count: async () => 2 },
			attendance: { count: async () => 0 },
		};

		const rows = await buildCountParityRows(source, target, ["employee", "attendance", "missingModel"]);
		const summary = summarizeCountParityRows(rows);

		expect(rows).to.deep.equal([
			{ modelName: "employee", sourceCount: 2, targetCount: 2, ok: true },
			{ modelName: "attendance", sourceCount: 1, targetCount: 0, ok: false },
			{ modelName: "missingModel", sourceCount: 0, targetCount: 0, ok: true, skipped: true },
		]);
		expect(summary).to.deep.equal({
			checked: 2,
			skipped: 1,
			mismatches: ["attendance"],
			hasMismatch: true,
		});
	});

	it("builds stable sample row signatures for content-level parity", () => {
		const signature = buildStableRowSignature({
			id: "att-1",
			employeeId: "BNEI-001",
			date: new Date("2026-05-01T00:00:00.000Z"),
			updatedAt: new Date("2026-05-02T00:00:00.000Z"),
			ignored: "not part of signature",
		});

		expect(signature).to.equal(
			JSON.stringify({
				date: "2026-05-01T00:00:00.000Z",
				employeeId: "BNEI-001",
				id: "att-1",
				updatedAt: "2026-05-02T00:00:00.000Z",
			}),
		);
	});

	it("compares representative row signatures instead of only counts", () => {
		const comparison = compareSampleRowSignatures({
			modelName: "timesheetline",
			keys: ["id", "employeeId", "date"],
			sourceRows: [
				{ id: "line-1", employeeId: "BNEI-001", date: new Date("2026-05-01T00:00:00.000Z") },
			],
			targetRows: [
				{ id: "line-1", employeeId: "BNEI-001", date: new Date("2026-05-02T00:00:00.000Z") },
			],
		});

		expect(comparison.ok).to.equal(false);
		expect(comparison.modelName).to.equal("timesheetline");
		expect(comparison.source[0]).to.include("2026-05-01");
		expect(comparison.target[0]).to.include("2026-05-02");
	});
});
