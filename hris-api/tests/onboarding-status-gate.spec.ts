import { expect } from "chai";
import { syncEmployeeEmploymentStatus } from "../helper/boarding-documents.helper";

function mockPrisma({
	currentStatus = "ONBOARDING",
	legacyPending = false,
	dedicatedPending = false,
	updateThrows = false,
}: {
	currentStatus?: string;
	legacyPending?: boolean;
	dedicatedPending?: boolean;
	updateThrows?: boolean;
}) {
	const updates: any[] = [];
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
		onboardingItem: {
			findFirst: async () => (dedicatedPending ? { id: "oi-1" } : null),
		},
	};
	return { prisma, updates };
}

describe("ONBOARDING->ACTIVE gate (design C: legacy AND dedicated checklist)", () => {
	it("stays ONBOARDING when legacy is complete but the dedicated checklist still has PENDING items", async () => {
		const { prisma, updates } = mockPrisma({ legacyPending: false, dedicatedPending: true });
		const result = await syncEmployeeEmploymentStatus({ prisma, employeeId: "emp-1" });
		expect(result?.employmentStatus).to.equal("ONBOARDING");
		expect(updates).to.have.lengthOf(0);
	});

	it("promotes to ACTIVE when legacy AND dedicated are both complete", async () => {
		const { prisma, updates } = mockPrisma({ legacyPending: false, dedicatedPending: false });
		const result = await syncEmployeeEmploymentStatus({ prisma, employeeId: "emp-1" });
		expect(result?.employmentStatus).to.equal("ACTIVE");
		expect(updates[0].employmentStatus).to.equal("ACTIVE");
	});

	it("stays ONBOARDING when legacy is pending regardless of the dedicated checklist", async () => {
		const { prisma, updates } = mockPrisma({ legacyPending: true, dedicatedPending: false });
		const result = await syncEmployeeEmploymentStatus({ prisma, employeeId: "emp-1" });
		expect(result?.employmentStatus).to.equal("ONBOARDING");
		expect(updates).to.have.lengthOf(0);
	});

	it("reopens an ACTIVE employee when dedicated items go back to PENDING (unsign symmetry)", async () => {
		const { prisma, updates } = mockPrisma({
			currentStatus: "ACTIVE",
			legacyPending: false,
			dedicatedPending: true,
		});
		const result = await syncEmployeeEmploymentStatus({ prisma, employeeId: "emp-1" });
		expect(result?.employmentStatus).to.equal("ONBOARDING");
		expect(updates[0].employmentStatus).to.equal("ONBOARDING");
	});

	it("employees without any dedicated checklist keep pure legacy behavior", async () => {
		// dedicatedPending=false models "no rows found" (also the no-checklist case)
		const { prisma, updates } = mockPrisma({ legacyPending: false, dedicatedPending: false });
		await syncEmployeeEmploymentStatus({ prisma, employeeId: "emp-1" });
		expect(updates[0].employmentStatus).to.equal("ACTIVE");
	});
});
