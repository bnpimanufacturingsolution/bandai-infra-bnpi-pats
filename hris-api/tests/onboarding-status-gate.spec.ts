import { expect } from "chai";
import { syncEmployeeEmploymentStatus } from "../helper/boarding-documents.helper";

interface DedicatedRow {
	status: string;
	responsibleDepartmentId: string | null;
}

function mockPrisma({
	currentStatus = "ONBOARDING",
	legacyPending = false,
	dedicatedRows = [],
	updateThrows = false,
}: {
	currentStatus?: string;
	legacyPending?: boolean;
	// PENDING dedicated rows with their responsible-department state.
	dedicatedRows?: DedicatedRow[];
	updateThrows?: boolean;
}) {
	const updates: any[] = [];
	const probeWhere: any[] = [];
	const prisma: any = {
		employee: {
			findUnique: async () => ({ id: "emp-1", employmentStatus: currentStatus }),
			update: async (args: any) => {
				if (updateThrows) throw new Error("db down");
				updates.push(args.data);
				return { id: "emp-1", ...args.data };
			},
		},
		boardingProcess: {
			findMany: async () => [
				{
					id: "bp-1",
					checklistItems: [
						{ status: "COMPLETED" },
						...(legacyPending ? [{ status: "PENDING" }] : []),
					],
				},
			],
		},
		probeWhere,
		onboardingItem: {
			findFirst: async (args: any) => {
				const where = args?.where ?? {};
				probeWhere.push(where);
				const and: any[] = where.AND ?? [];
				const requiresNotNull = and.some(
					(c) => c?.responsibleDepartmentId?.not === null,
				);
				const requiresNotEmpty = and.some((c) => c?.responsibleDepartmentId?.not === "");
				// The gate MUST query with the actionable filter (never a bare fetch-all).
				expect(requiresNotNull, "gate must exclude no-department (section) rows").to.be
					.true;
				expect(requiresNotEmpty, "gate must exclude empty-string responsibleDepartmentId").to
					.be.true;
				return (
					dedicatedRows.find(
						(row) =>
							row.status === "PENDING" &&
							String(row.responsibleDepartmentId || "").trim().length > 0,
					) ?? null
				);
			},
		},
	};
	return { prisma, updates, probeWhere };
}

describe("ONBOARDING->ACTIVE gate (design C: legacy AND actionable dedicated items)", () => {
	it("stays ONBOARDING when legacy is complete but an ACTIONABLE dedicated item is PENDING", async () => {
		const { prisma, updates } = mockPrisma({
			dedicatedRows: [{ status: "PENDING", responsibleDepartmentId: "dept-it" }],
		});
		const result = await syncEmployeeEmploymentStatus({ prisma, employeeId: "emp-1" });
		expect(result?.employmentStatus).to.equal("ONBOARDING");
		expect(updates).to.have.lengthOf(0);
	});

	it("ignores PENDING section rows (no responsible department) — promotes to ACTIVE", async () => {
		const { prisma, updates } = mockPrisma({
			dedicatedRows: [
				{ status: "PENDING", responsibleDepartmentId: null },
				{ status: "PENDING", responsibleDepartmentId: "" },
			],
		});
		const result = await syncEmployeeEmploymentStatus({ prisma, employeeId: "emp-1" });
		expect(result?.employmentStatus).to.equal("ACTIVE");
		expect(updates[0].employmentStatus).to.equal("ACTIVE");
	});

	it("promotes to ACTIVE when legacy AND every dedicated item are complete", async () => {
		const { prisma, updates } = mockPrisma({
			dedicatedRows: [{ status: "COMPLETED", responsibleDepartmentId: "dept-it" }],
		});
		const result = await syncEmployeeEmploymentStatus({ prisma, employeeId: "emp-1" });
		expect(result?.employmentStatus).to.equal("ACTIVE");
		expect(updates[0].employmentStatus).to.equal("ACTIVE");
	});

	it("stays ONBOARDING when legacy is pending regardless of the dedicated checklist", async () => {
		const { prisma, updates } = mockPrisma({ legacyPending: true, dedicatedRows: [] });
		const result = await syncEmployeeEmploymentStatus({ prisma, employeeId: "emp-1" });
		expect(result?.employmentStatus).to.equal("ONBOARDING");
		expect(updates).to.have.lengthOf(0);
	});

	it("reopens an ACTIVE employee when an actionable item goes back to PENDING (unsign symmetry)", async () => {
		const { prisma, updates } = mockPrisma({
			currentStatus: "ACTIVE",
			dedicatedRows: [{ status: "PENDING", responsibleDepartmentId: "dept-it" }],
		});
		const result = await syncEmployeeEmploymentStatus({ prisma, employeeId: "emp-1" });
		expect(result?.employmentStatus).to.equal("ONBOARDING");
		expect(updates[0].employmentStatus).to.equal("ONBOARDING");
	});

	it("does NOT reopen ACTIVE for a PENDING section row", async () => {
		const { prisma, updates } = mockPrisma({
			currentStatus: "ACTIVE",
			dedicatedRows: [{ status: "PENDING", responsibleDepartmentId: null }],
		});
		const result = await syncEmployeeEmploymentStatus({ prisma, employeeId: "emp-1" });
		expect(result?.employmentStatus).to.equal("ACTIVE");
		expect(updates).to.have.lengthOf(0);
	});

	it("employees without any dedicated checklist keep pure legacy behavior", async () => {
		const { prisma, updates } = mockPrisma({ dedicatedRows: [] });
		await syncEmployeeEmploymentStatus({ prisma, employeeId: "emp-1" });
		expect(updates[0].employmentStatus).to.equal("ACTIVE");
	});

	it("a parent row WITH a responsible department still gates until signed (operator decision)", async () => {
		const { prisma, updates } = mockPrisma({
			dedicatedRows: [{ status: "PENDING", responsibleDepartmentId: "dept-hr" }],
		});
		const result = await syncEmployeeEmploymentStatus({ prisma, employeeId: "emp-1" });
		expect(result?.employmentStatus).to.equal("ONBOARDING");
		expect(updates).to.have.lengthOf(0);
	});
});
