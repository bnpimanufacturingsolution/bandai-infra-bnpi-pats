// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DataTable, type Column } from "./DataTable";

type AdminConfigRow = {
	id: string;
	name: string;
	code: string;
};

const rows: AdminConfigRow[] = [
	{ id: "dept-1", name: "People Operations", code: "HR" },
	{ id: "dept-2", name: "Software Engineering", code: "ENG" },
];

const columns: Column<AdminConfigRow>[] = [
	{ key: "name", label: "Name" },
	{ key: "code", label: "Code" },
];

describe("DataTable", () => {
	it("filters admin config rows from the search input and keeps the result count accurate", async () => {
		render(
			<DataTable
				title="Departments"
				data={rows}
				columns={columns}
				showFilters={false}
				showExport={false}
				noCard
			/>,
		);

		fireEvent.change(screen.getByPlaceholderText("Search..."), {
			target: { value: "eng" },
		});

		expect(screen.queryByText("People Operations")).not.toBeInTheDocument();
		expect(screen.getAllByText("Software Engineering").length).toBeGreaterThan(0);
		expect(screen.getByText("Showing 1 to 1 of 1 results")).toBeInTheDocument();
	});

	it("updates paginated admin config rows when the user changes pages", async () => {
		render(
			<DataTable
				title="Departments"
				data={rows}
				columns={columns}
				itemsPerPage={1}
				showSearch={false}
				showFilters={false}
				showExport={false}
				noCard
			/>,
		);

		expect(screen.getAllByText("People Operations").length).toBeGreaterThan(0);
		expect(screen.queryByText("Software Engineering")).not.toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: "2" }));

		expect(screen.queryByText("People Operations")).not.toBeInTheDocument();
		expect(screen.getAllByText("Software Engineering").length).toBeGreaterThan(0);
		expect(screen.getByText("Showing 2 to 2 of 2 results")).toBeInTheDocument();
	});

	it("renders the column visibility button in the card header when search and filters are hidden", () => {
		render(
			<DataTable
				title="Timesheets"
				data={rows}
				columns={columns}
				showSearch={false}
				showFilters={false}
				showExport={false}
			/>,
		);

		const columnsButton = screen.getByRole("button", { name: "Columns" });
		const headerRow = screen.getByText("Timesheets").closest(".flex");
		expect(columnsButton).toBeInTheDocument();
		expect(headerRow).toContainElement(columnsButton);
	});

	it("renders one table when containedScroll is off so header and body columns stay aligned", () => {
		const { container } = render(
			<DataTable
				title="Departments"
				data={rows}
				columns={columns}
				showSearch={false}
				showFilters={false}
				showExport={false}
				noCard
			/>,
		);

		const tableShell = container.querySelector("[data-datatable-table-shell]");
		expect(tableShell).not.toBeNull();
		expect(tableShell?.querySelectorAll("table")).toHaveLength(1);
		expect(tableShell?.querySelector("thead")).not.toBeNull();
		expect(tableShell?.querySelector("tbody")).not.toBeNull();
	});

	it("calls server-side search while preserving API-provided rows and totals", async () => {
		const handleSearch = vi.fn();

		render(
			<DataTable
				title="Departments"
				data={rows}
				columns={columns}
				searchValue=""
				onSearch={handleSearch}
				currentPage={2}
				totalItems={42}
				itemsPerPage={10}
				showFilters={false}
				showExport={false}
				noCard
			/>,
		);

		fireEvent.change(screen.getByPlaceholderText("Search..."), {
			target: { value: "eng" },
		});

		expect(handleSearch).toHaveBeenLastCalledWith("eng");
		expect(screen.getAllByText("People Operations").length).toBeGreaterThan(0);
		expect(screen.getAllByText("Software Engineering").length).toBeGreaterThan(0);
		expect(screen.getByText("Showing 11 to 20 of 42 results")).toBeInTheDocument();
	});
});
