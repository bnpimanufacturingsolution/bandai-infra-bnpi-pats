// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminOnboardingChecklist } from "./checklist";

const templatesMock = vi.hoisted(() => ({ current: [] as any[] }));
const templateMock = vi.hoisted(() => ({ current: null as any }));

vi.mock("~/lib/hooks/useOnboarding", () => ({
	useOnboardingTemplates: () => ({
		data: { templates: templatesMock.current },
		isLoading: false,
		isError: false,
	}),
	useOnboardingTemplate: () => ({ data: templateMock.current, isLoading: false }),
}));

const TEMPLATE_TREE = {
	template: {
		id: "ctpl0000000001",
		name: "Standard Onboarding Checklist",
		description: null,
		isActive: true,
		sections: [
			{
				id: "csec0000000001",
				title: "Section 1: Pre-Onboarding",
				order: 1,
				items: [
					{
						id: "citem0000000001",
						sectionId: "csec0000000001",
						parentId: null,
						number: "1",
						title: "Offer letter sent",
						description: null,
						responsibleDepartmentId: "dept-hr",
						responsibleDepartmentName: "HR",
						order: 1,
						children: [],
					},
				],
			},
		],
	},
};

describe("AdminOnboardingChecklist (page preview)", () => {
	beforeEach(() => {
		templatesMock.current = [];
		templateMock.current = null;
	});

	const renderPage = () =>
		render(
			<MemoryRouter>
				<AdminOnboardingChecklist />
			</MemoryRouter>,
		);

	it("shows an honest empty state with a Builder CTA when no checklist exists", () => {
		renderPage();
		expect(screen.getByText("No checklist has been built yet.")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Build your checklist" })).toBeInTheDocument();
	});

	it("renders the created checklist in the Preview table layout when a template exists", () => {
		templatesMock.current = [
			{ id: "ctpl0000000001", name: "Standard Onboarding Checklist", isActive: true },
		];
		templateMock.current = TEMPLATE_TREE;
		renderPage();

		expect(screen.getByText("Standard Onboarding Checklist")).toBeInTheDocument();
		expect(screen.getByText("Section 1: Pre-Onboarding")).toBeInTheDocument();
		expect(screen.getByText("Offer letter sent")).toBeInTheDocument();
		expect(screen.getByText("HR")).toBeInTheDocument();
		// preview columns
		expect(screen.getByText("Responsible")).toBeInTheDocument();
		expect(screen.getByText("Remarks/Signature")).toBeInTheDocument();
	});

	it("contains nothing employee-related (no roster combobox, no sign widgets)", () => {
		templatesMock.current = [
			{ id: "ctpl0000000001", name: "Standard Onboarding Checklist", isActive: true },
		];
		templateMock.current = TEMPLATE_TREE;
		renderPage();

		expect(screen.queryByLabelText("Onboarding employee")).not.toBeInTheDocument();
		expect(screen.queryByText(/has no checklist yet/i)).not.toBeInTheDocument();
		expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
	});
});
