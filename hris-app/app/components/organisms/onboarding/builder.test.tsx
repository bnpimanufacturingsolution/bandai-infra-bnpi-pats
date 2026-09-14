// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import {
	AdminOnboardingBuilder,
	mapTemplateToSections,
	sectionsToTreePayload,
	updateItemInItems,
	removeItemFromItems,
	updateSectionName,
	removeSectionById,
	type ChecklistItem,
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

const makeItem = (id: string, children: ChecklistItem[] = []): ChecklistItem => ({
	id,
	name: `Item ${id}`,
	personInChargeId: "",
	personInChargeName: "",
	children,
});

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

	it("hides every create-another-template affordance (no selector, single Save)", () => {
		render(
			<MemoryRouter>
				<AdminOnboardingBuilder />
			</MemoryRouter>,
		);

		expect(screen.queryByLabelText("Existing template")).not.toBeInTheDocument();
		expect(screen.queryByText("New template…")).not.toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Save Template" })).not.toBeInTheDocument();
	});
});

describe("builder section/item edit + delete", () => {
	const renderBuilder = () =>
		render(
			<MemoryRouter>
				<AdminOnboardingBuilder />
			</MemoryRouter>,
		);

	const createSection = (name: string) => {
		fireEvent.click(screen.getByRole("button", { name: "Add Section" }));
		const dialog = screen.getByRole("dialog");
		const input = within(dialog).getByPlaceholderText("Enter Section Name");
		fireEvent.change(input, { target: { value: name } });
		fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));
	};

	it("renames a section inline", () => {
		renderBuilder();
		createSection("Old Section");
		expect(screen.getByText("Old Section")).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: "Edit" }));
		const nameInput = screen.getByLabelText("Section name");
		fireEvent.change(nameInput, { target: { value: "Renamed Section" } });
		fireEvent.blur(nameInput);

		expect(screen.getByText("Renamed Section")).toBeInTheDocument();
		expect(screen.queryByText("Old Section")).not.toBeInTheDocument();
	});

	it("deletes a section through the confirm dialog", () => {
		renderBuilder();
		createSection("Doomed Section");
		expect(screen.getByText("Doomed Section")).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: /delete section doomed section/i }));
		const dialog = screen.getByRole("dialog");
		fireEvent.click(within(dialog).getByRole("button", { name: "Delete section" }));

		expect(screen.queryByText("Doomed Section")).not.toBeInTheDocument();
	});

	it("deletes an item and its whole subtree after confirm", () => {
		renderBuilder();
		createSection("Items");

		// add a parent item
		fireEvent.click(screen.getByRole("button", { name: "Add Item" }));
		let dialog = screen.getByRole("dialog");
		fireEvent.change(within(dialog).getByLabelText("Item name"), {
			target: { value: "Parent X" },
		});
		fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));

		// add a child under it
		fireEvent.click(screen.getByRole("button", { name: "Add Subitem" }));
		dialog = screen.getByRole("dialog");
		fireEvent.change(within(dialog).getByLabelText("Item name"), {
			target: { value: "Child Y" },
		});
		fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));

		expect(screen.getByText("Parent X")).toBeInTheDocument();
		expect(screen.getByText("Child Y")).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: /delete item parent x/i }));
		dialog = screen.getByRole("dialog");
		expect(within(dialog).getByText(/sub-items will be removed too/i)).toBeInTheDocument();
		fireEvent.click(within(dialog).getByRole("button", { name: "Delete item" }));

		expect(screen.queryByText("Parent X")).not.toBeInTheDocument();
		expect(screen.queryByText("Child Y")).not.toBeInTheDocument();
	});
});

describe("builder pure helpers", () => {
	it("updateItemInItems patches nested items by id", () => {
		const tree = [makeItem("a", [makeItem("b")])];
		const updated = updateItemInItems(tree, "b", { name: "B2", personInChargeId: "dept-it" });
		expect(updated[0].children[0].name).to.equal("B2");
		expect(updated[0].children[0].personInChargeId).to.equal("dept-it");
	});

	it("removeItemFromItems removes the node and its subtree", () => {
		const tree = [makeItem("a", [makeItem("b", [makeItem("c")]), makeItem("d")])];
		const pruned = removeItemFromItems(tree, "b");
		expect(pruned[0].children.map((c) => c.id)).to.deep.equal(["d"]);
	});

	it("rename/remove section helpers are id-targeted", () => {
		const sections: ChecklistSection[] = [
			{ id: "s1", name: "One", items: [] },
			{ id: "s2", name: "Two", items: [] },
		];
		expect(updateSectionName(sections, "s1", "Uno")[0].name).to.equal("Uno");
		expect(removeSectionById(sections, "s1").map((s) => s.id)).to.deep.equal(["s2"]);
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
