// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { ManpowerDatabankSection } from "./ManpowerDatabankSection";

describe("ManpowerDatabankSection", () => {
	it("renders position and employment-type summaries with databank drill links", () => {
		render(
			<MemoryRouter>
				<ManpowerDatabankSection
					positionRows={[
						{
							position: "Operator",
							positionId: "position-operator",
							headcount: 8,
							direct: 5,
							agency: 3,
							departments: 1,
							sections: 2,
							employmentTypeMix: "Regular 5, Probationary 3",
							employmentTypeBreakdown: [
								{ employmentType: "REGULAR", count: 5 },
								{ employmentType: "PROBATIONARY", count: 3 },
							],
							isUnassigned: false,
						},
					]}
					employmentTypeRows={[
						{
							employmentType: "REGULAR",
							headcount: 5,
							direct: 5,
							agency: 0,
							positions: 2,
						},
					]}
				/>
			</MemoryRouter>,
		);

		expect(screen.getByText("Manpower Databank")).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Operator" })).toHaveAttribute(
			"href",
			"/hr/employees?view=list&statusScope=active-manpower&page=1&positionId=position-operator",
		);
		expect(screen.getByText("Regular 5, Probationary 3")).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Regular" })).toHaveAttribute(
			"href",
			"/hr/employees?view=list&statusScope=active-manpower&page=1&employmentType=REGULAR",
		);
	});

	it("renders the empty state when the databank has no rows", () => {
		render(
			<MemoryRouter>
				<ManpowerDatabankSection positionRows={[]} employmentTypeRows={[]} />
			</MemoryRouter>,
		);

		expect(screen.getByText("No manpower databank rows found")).toBeInTheDocument();
	});

	it("renders unassigned position as plain text, not a link", () => {
		render(
			<MemoryRouter>
				<ManpowerDatabankSection
					positionRows={[
						{
							position: "Unassigned position",
							positionId: null,
							headcount: 2,
							direct: 2,
							agency: 0,
							departments: 1,
							sections: 1,
							employmentTypeMix: "Regular 2",
							employmentTypeBreakdown: [{ employmentType: "REGULAR", count: 2 }],
							isUnassigned: true,
						},
					]}
					employmentTypeRows={[]}
				/>
			</MemoryRouter>,
		);

		expect(screen.queryByRole("link", { name: "Unassigned position" })).toBeNull();
		expect(screen.getByText("Unassigned position")).toBeInTheDocument();
	});

	it("shows zero-count agency cells as plain text, not links", () => {
		render(
			<MemoryRouter>
				<ManpowerDatabankSection
					positionRows={[
						{
							position: "Operator",
							positionId: "position-operator",
							headcount: 3,
							direct: 3,
							agency: 0,
							departments: 1,
							sections: 1,
							employmentTypeMix: "Regular 3",
							employmentTypeBreakdown: [{ employmentType: "REGULAR", count: 3 }],
							isUnassigned: false,
						},
					]}
					employmentTypeRows={[]}
				/>
			</MemoryRouter>,
		);

		const agencyCells = screen.getAllByText("0");
		expect(agencyCells.some((el) => el.tagName !== "A")).toBe(true);
	});
});
