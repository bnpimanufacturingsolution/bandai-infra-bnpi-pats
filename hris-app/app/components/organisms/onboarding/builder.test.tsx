// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import {
	AdminOnboardingBuilder,
	mapTemplateToSections,
	sectionsToTreePayload,
	type ChecklistSection,
} from "./builder";

vi.mock("~/lib/hooks/useDepartments", () => ({
	useDepartments: () => ({ data: { departments: [] }, isLoading: false }),
}));

vi.mock("~/lib/hooks/useOnboarding", () => ({
	useOnboardingTemplates: () => ({ data: { templates: [] }, isLoading: false }),
	useOnboardingTemplate: () => ({ data: undefined, isLoading: false }),
	useSaveOnboardingTemplateTree: () => ({ mutate: vi.fn(), isPending: false }),
}));

describe("AdminOnboardingBuilder header actions", () => {
	it("opens a preview dialog of the built checklist and keeps a separate checklist link", () => {
		render(
			<MemoryRouter>
				<AdminOnboardingBuilder />
			</MemoryRouter>,
		);

		const previewButton = screen.getByRole("button", { name: "Preview" });
		const checklistLink = screen.getByRole("link", { name: "Go to Checklist" });

		expect(checklistLink).toHaveAttribute(
			"href",
			"/admin/configuration/onboarding/checklist",
		);

		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
		fireEvent.click(previewButton);

		const dialog = screen.getByRole("dialog");
		expect(dialog).toBeInTheDocument();
		expect(
			screen.getByText("Onboarding Checklist Preview"),
		).toBeInTheDocument();
		expect(
			screen.getByText("No sections yet. Add a section to see it here."),
		).toBeInTheDocument();
	});
});

describe("builder tree payload", () => {
	const sections: ChecklistSection[] = [
		{
			id: "sec-1",
			serverId: "csec0000000001",
			name: "Pre-Onboarding",
			items: [
				{
					id: "item-1",
					serverId: "citem0000000001",
					name: "Device",
					personInChargeId: "",
					personInChargeName: "",
					children: [
						{
							id: "item-1-1",
							name: "Laptop",
							personInChargeId: "dept-it",
							personInChargeName: "IT",
							children: [
								{
									id: "item-1-1-1",
									name: "OS installed",
									personInChargeId: "dept-it",
									personInChargeName: "IT",
									children: [],
								},
							],
						},
					],
				},
			],
		},
		{
			id: "sec-2",
			name: "First Day",
			items: [
				{
					id: "item-2",
					name: "Welcome email",
					personInChargeId: "dept-hr",
					personInChargeName: "HR",
					children: [],
				},
			],
		},
	];

	it("computes hierarchical numbering, keeps server ids, and nulls empty departments", () => {
		const payload = sectionsToTreePayload(sections);
		expect(payload).toHaveLength(2);
		expect(payload[0].id).to.equal("csec0000000001");
		expect(payload[1].id).to.be.undefined;

		expect(payload[0].items.map((i) => i.number)).to.deep.equal(["1", "1.1", "1.1.1"]);
		expect(payload[1].items.map((i) => i.number)).to.deep.equal(["1"]);

		expect(payload[0].items[0].id).to.equal("citem0000000001");
		expect(payload[0].items[0].responsibleDepartmentId).to.be.null;
		expect(payload[0].items[1].responsibleDepartmentId).to.equal("dept-it");
		expect(payload[0].items[1].parentTempId).to.equal("item-1");
		expect(payload[0].items[2].parentTempId).to.equal("item-1-1");
	});

	it("maps a server tree back into editable builder sections (round trip keeps identity)", () => {
		const template = {
			id: "ctpl0000000001",
			name: "Standard",
			description: null,
			isActive: true,
			sections: [
				{
					id: "csec0000000001",
					title: "Pre-Onboarding",
					order: 1,
					items: [
						{
							id: "citem0000000001",
							sectionId: "csec0000000001",
							parentId: null,
							number: "1",
							title: "Device",
							description: null,
							responsibleDepartmentId: null,
							responsibleDepartmentName: null,
							order: 1,
							children: [
								{
									id: "citem0000000002",
									sectionId: "csec0000000001",
									parentId: "citem0000000001",
									number: "1.1",
									title: "Laptop",
									description: null,
									responsibleDepartmentId: "dept-it",
									responsibleDepartmentName: "IT",
									order: 1,
									children: [],
								},
							],
						},
					],
				},
			],
		};

		const mapped = mapTemplateToSections(template as any);
		expect(mapped).toHaveLength(1);
		expect(mapped[0].serverId).to.equal("csec0000000001");
		expect(mapped[0].items[0].serverId).to.equal("citem0000000001");
		expect(mapped[0].items[0].children[0].personInChargeId).to.equal("dept-it");

		const payload = sectionsToTreePayload(mapped);
		expect(payload[0].items[1].id).to.equal("citem0000000002");
		expect(payload[0].items[1].number).to.equal("1.1");
	});
});
