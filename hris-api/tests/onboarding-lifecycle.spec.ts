import { expect } from "chai";
import {
	ensureOnboardingChecklistForEmployee,
} from "../app/onboarding/onboardingLifecycle.helper";

const TEMPLATE_TREE = {
	id: "ctpl0000000001",
	sections: [
		{
			id: "csec0000000001",
			title: "Section 1",
			order: 1,
			items: [
				{
					id: "citem0000000001",
					parentId: null,
					number: "1",
					title: "Device",
					description: null,
					responsibleDepartmentId: null,
					responsibleDepartmentName: null,
					order: 1,
				},
				{
					id: "citem0000000002",
					parentId: "citem0000000001",
					number: "1.1",
					title: "Laptop",
					description: null,
					responsibleDepartmentId: "dept-it",
					responsibleDepartmentName: "IT",
					order: 1,
				},
			],
		},
	],
};

function buildPrisma(options: {
	existingChecklistId?: string | null;
	template?: any;
	templateExists?: boolean;
	employee?: any;
}) {
	const createdSections: any[] = [];
	const createdItems: any[] = [];
	const createdChecklists: any[] = [];
	const itemCreateOrder: string[] = [];

	const template = options.template ?? TEMPLATE_TREE;
	const templateExists = options.templateExists !== false;

	const prisma: any = {
		onboardingChecklist: {
			findFirst: async () =>
				options.existingChecklistId ? { id: options.existingChecklistId } : null,
		},
		employee: {
			findFirst: async () =>
				options.employee === undefined
					? {
							id: "emp-1",
							employmentStartDate: new Date("2026-09-01"),
							person: { personalInfo: { firstName: "Nina", lastName: "New" } },
						}
					: options.employee,
		},
		onboardingTemplate: {
			findFirst: async (args: any) => {
				if (!templateExists) return null;
				if (args?.include) return template;
				return { id: template.id };
			},
		},
		$transaction: async (fn: any) =>
			fn({
				onboardingChecklist: {
					create: async (args: any) => {
						createdChecklists.push(args.data);
						return { id: "chk-new-1", ...args.data };
					},
				},
				onboardingSection: {
					create: async (args: any) => {
						createdSections.push(args.data);
						return { id: `newsec-${createdSections.length}`, ...args.data };
					},
				},
				onboardingItem: {
					create: async (args: any) => {
						createdItems.push(args.data);
						itemCreateOrder.push(args.data.title);
						return { id: `newitem-${createdItems.length}`, ...args.data };
					},
				},
			}),
	};

	return { prisma, createdSections, createdItems, createdChecklists, itemCreateOrder };
}

describe("ensureOnboardingChecklistForEmployee", () => {
	it("returns exists without writing when the employee already has a checklist", async () => {
		const { prisma, createdChecklists } = buildPrisma({ existingChecklistId: "chk-existing" });
		const result = await ensureOnboardingChecklistForEmployee(prisma, {
			employeeId: "emp-1",
			organizationId: "org-1",
		});
		expect(result.status).to.equal("exists");
		expect(result.checklistId).to.equal("chk-existing");
		expect(createdChecklists).to.have.lengthOf(0);
	});

	it("creates a checklist and deep-copies the tree (parents before children, ids remapped)", async () => {
		const { prisma, createdItems, createdSections, createdChecklists } = buildPrisma({});
		const result = await ensureOnboardingChecklistForEmployee(prisma, {
			employeeId: "emp-1",
			organizationId: "org-1",
		});
		expect(result.status).to.equal("created");
		expect(createdChecklists[0].templateId).to.equal("ctpl0000000001");
		expect(createdChecklists[0].title).to.equal("Onboarding Checklist - Nina New");
		expect(createdSections).to.have.lengthOf(1);
		expect(createdItems.map((i) => i.title)).to.deep.equal(["Device", "Laptop"]);
		// child re-parented to the NEW id of its copied parent
		expect(createdItems[0].parentId).to.equal(null);
		expect(createdItems[1].parentId).to.equal("newitem-1");
		expect(createdItems[1].sectionId).to.equal("newsec-1");
		expect(createdItems[1].responsibleDepartmentId).to.equal("dept-it");
	});

	it("auto-resolves the single active template when none is specified", async () => {
		const { prisma, createdChecklists } = buildPrisma({});
		await ensureOnboardingChecklistForEmployee(prisma, {
			employeeId: "emp-1",
			organizationId: "org-1",
		});
		expect(createdChecklists[0].templateId).to.equal("ctpl0000000001");
	});

	it("skips (requireTemplate) when no active template exists yet", async () => {
		const { prisma, createdChecklists } = buildPrisma({ templateExists: false });
		const result = await ensureOnboardingChecklistForEmployee(prisma, {
			employeeId: "emp-1",
			organizationId: "org-1",
			requireTemplate: true,
		});
		expect(result.status).to.equal("skipped");
		expect(result.reason).to.equal("no-template");
		expect(createdChecklists).to.have.lengthOf(0);
	});

	it("creates an EMPTY checklist when no template exists and requireTemplate is off", async () => {
		const { prisma, createdChecklists, createdItems } = buildPrisma({ templateExists: false });
		const result = await ensureOnboardingChecklistForEmployee(prisma, {
			employeeId: "emp-1",
			organizationId: "org-1",
		});
		expect(result.status).to.equal("created");
		expect(createdChecklists[0].templateId).to.equal(null);
		expect(createdItems).to.have.lengthOf(0);
	});

	it("throws TEMPLATE_NOT_FOUND for an explicit missing template id", async () => {
		const { prisma } = buildPrisma({ templateExists: false });
		try {
			await ensureOnboardingChecklistForEmployee(prisma, {
				employeeId: "emp-1",
				organizationId: "org-1",
				templateId: "ctpl0000000009",
			});
			expect.fail("should have thrown");
		} catch (error: any) {
			expect(error.code).to.equal("TEMPLATE_NOT_FOUND");
		}
	});

	it("skips when the employee does not exist", async () => {
		const { prisma, createdChecklists } = buildPrisma({ employee: null });
		const result = await ensureOnboardingChecklistForEmployee(prisma, {
			employeeId: "emp-ghost",
			organizationId: "org-1",
		});
		expect(result.status).to.equal("skipped");
		expect(result.reason).to.equal("employee-not-found");
		expect(createdChecklists).to.have.lengthOf(0);
	});
});
