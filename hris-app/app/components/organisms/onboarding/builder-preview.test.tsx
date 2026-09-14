// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import BuilderPreview from "./builder-preview";
import type { ChecklistSection } from "./builder";

const sampleSections: ChecklistSection[] = [
	{
		id: "section-1",
		name: "Day One",
		items: [
			{
				id: "item-1",
				name: "Setup accounts",
				personInChargeId: "3",
				personInChargeName: "IT",
				children: [
					{
						id: "item-2",
						name: "Email access",
						personInChargeId: "3",
						personInChargeName: "IT",
						children: [],
					},
				],
			},
			{
				id: "item-3",
				name: "ID badge",
				personInChargeId: "",
				personInChargeName: "",
				children: [],
			},
		],
	},
];

describe("BuilderPreview", () => {
	it("renders a checklist table with hierarchical numbering, department names, and disabled checkboxes", () => {
		render(
			<BuilderPreview open onOpenChange={() => {}} sections={sampleSections} />,
		);

		const dialog = screen.getByRole("dialog");
		expect(dialog).toBeInTheDocument();
		expect(screen.getByText("Onboarding Checklist Preview")).toBeInTheDocument();
		expect(screen.getByText("Day One")).toBeInTheDocument();

		expect(screen.getByText("Setup accounts")).toBeInTheDocument();
		expect(screen.getByText("Email access")).toBeInTheDocument();
		expect(screen.getByText("ID badge")).toBeInTheDocument();

		const numberCells = within(dialog).getAllByRole("row").map((row) => row.textContent);
		expect(numberCells.some((text) => text?.startsWith("1"))).toBe(true);
		expect(numberCells.some((text) => text?.startsWith("1.1"))).toBe(true);
		expect(numberCells.some((text) => text?.startsWith("2"))).toBe(true);

		expect(screen.getAllByText("IT")).toHaveLength(2);
		expect(screen.queryByText("3")).not.toBeInTheDocument();

		const checkboxes = within(dialog).getAllByRole("button", {
			name: /Mark .+ completed$/,
		});
		expect(checkboxes).toHaveLength(3);
		for (const checkbox of checkboxes) {
			expect(checkbox).toBeDisabled();
		}
	});

	it("shows an empty state when there are no sections", () => {
		render(<BuilderPreview open onOpenChange={() => {}} sections={[]} />);

		expect(
			screen.getByText("No sections yet. Add a section to see it here."),
		).toBeInTheDocument();
	});
});
