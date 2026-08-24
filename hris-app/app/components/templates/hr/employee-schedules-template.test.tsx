// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EmployeeSchedulesPage } from "./employee-schedules-template";

const mockUseRoster = vi.fn();

vi.mock("~/lib/hooks/useEmployees", () => ({
	useEmployeeScheduleRoster: (...args: unknown[]) => mockUseRoster(...args),
}));

vi.mock("~/lib/hooks/useDepartments", () => ({
	useDepartments: () => ({
		data: {
			departments: [{ id: "dept-1", name: "Production", code: "PROD" }],
		},
	}),
}));

vi.mock("~/lib/hooks/useSections", () => ({
	useSections: () => ({
		data: {
			sections: [{ id: "sec-1", name: "Assembly", code: "ASM", departmentId: "dept-1" }],
		},
	}),
}));

vi.mock("~/components/molecules/DepartmentSectionPicker", () => ({
	DepartmentSectionPicker: ({
		departmentId,
		sectionId,
		onDepartmentChange,
		onSectionChange,
	}: {
		departmentId?: string;
		sectionId?: string;
		onDepartmentChange: (departmentId: string) => void;
		onSectionChange: (departmentId: string, sectionId: string) => void;
	}) => (
		<div>
			<span data-testid="dept-filter">{departmentId || "all"}</span>
			<span data-testid="section-filter">{sectionId || ""}</span>
			<button type="button" onClick={() => onDepartmentChange("dept-1")}>
				Filter Production
			</button>
			<button type="button" onClick={() => onSectionChange("dept-1", "sec-1")}>
				Filter Assembly
			</button>
		</div>
	),
}));

vi.mock("~/components/atoms/DataTable", () => ({
	DataTable: ({
		title,
		data,
		columns,
		onRowClick,
		customFilters,
		renderActions,
		emptyMessage,
	}: {
		title: string;
		data: any[];
		columns: Array<{ key: string; render?: (value: unknown, item: any) => unknown }>;
		onRowClick?: (item: any) => void;
		customFilters?: unknown;
		renderActions?: (item: any) => unknown;
		emptyMessage?: string;
	}) => (
		<div>
			<h1>{title}</h1>
			{customFilters as never}
			{data.length === 0 ? (
				<p>{emptyMessage}</p>
			) : (
				<ul>
					{data.map((item) => (
						<li key={item.id}>
							<button type="button" onClick={() => onRowClick?.(item)}>
								{item.employeeId}
							</button>
							{columns.map((column) => (
								<div key={String(column.key)}>
									{column.render ? column.render(item[column.key], item) : item[column.key]}
								</div>
							))}
							{renderActions?.(item)}
						</li>
					))}
				</ul>
			)}
		</div>
	),
}));

vi.mock("~/components/atoms/Modal", () => ({
	Modal: ({ open, title, children }: { open?: boolean; title?: string; children: unknown }) =>
		open ? (
			<div role="dialog">
				<h2>{title}</h2>
				{children as never}
			</div>
		) : null,
}));

vi.mock("~/components/organisms/employee-detail/change-weekly-schedule-modal", () => ({
	ChangeWeeklyScheduleModal: ({
		open,
		employee,
	}: {
		open: boolean;
		employee: { employeeId?: string };
	}) => (open ? <div data-testid="schedule-editor">Editor {employee.employeeId}</div> : null),
}));

const zen = {
	id: "emp-zen",
	employeeId: "00010",
	person: { personalInfo: { firstName: "Zen", lastName: "Andrei" } },
	department: { id: "dept-1", name: "Production" },
	section: { id: "sec-1", name: "Assembly" },
	embeddedSchedule: {
		cycleDays: 7,
		pattern: [
			{
				day: 1,
				shiftSnapshot: {
					isOff: false,
					timeSlots: [{ type: "work", startTime: "06:00", endTime: "15:00" }],
				},
			},
			{
				day: 2,
				shiftSnapshot: {
					isOff: false,
					timeSlots: [{ type: "work", startTime: "07:00", endTime: "16:00" }],
				},
			},
		],
	},
};

describe("EmployeeSchedulesPage", () => {
	beforeEach(() => {
		mockUseRoster.mockReset();
		mockUseRoster.mockReturnValue({
			data: { employees: [zen], pagination: { total: 1, page: 1, limit: 25, totalPages: 1 } },
			isLoading: false,
		});
	});

	it("lists current weekday hours and opens the preview then editor", () => {
		render(
			<MemoryRouter>
				<EmployeeSchedulesPage />
			</MemoryRouter>,
		);

		expect(screen.getByText("Employee Schedules")).toBeTruthy();
		expect(screen.getAllByText("00010").length).toBeGreaterThan(0);
		expect(screen.getByText("06:00–15:00")).toBeTruthy();
		expect(screen.getByText("07:00–16:00")).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: "00010" }));
		expect(screen.getByTestId("employee-schedule-preview")).toBeTruthy();
		expect(screen.getByText(/zen andrei schedule/i)).toBeTruthy();

		fireEvent.click(screen.getByTestId("change-weekly-hours"));
		expect(screen.getByTestId("schedule-editor")).toHaveTextContent("Editor 00010");
	});

	it("filters the roster by department and section", () => {
		render(
			<MemoryRouter>
				<EmployeeSchedulesPage />
			</MemoryRouter>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Filter Production" }));
		expect(mockUseRoster.mock.calls.at(-1)?.[0]).toMatchObject({
			filter: "employmentStatus:ACTIVE,departmentId:dept-1",
		});

		fireEvent.click(screen.getByRole("button", { name: "Filter Assembly" }));
		expect(mockUseRoster.mock.calls.at(-1)?.[0]).toMatchObject({
			filter: "employmentStatus:ACTIVE,departmentId:dept-1,sectionId:sec-1",
		});
	});

	it("opens the editor directly from the table Change action", () => {
		render(
			<MemoryRouter>
				<EmployeeSchedulesPage />
			</MemoryRouter>,
		);
		fireEvent.click(screen.getByTestId("change-schedule-emp-zen"));
		expect(screen.getByTestId("schedule-editor")).toBeTruthy();
		expect(screen.queryByTestId("employee-schedule-preview")).toBeNull();
	});
});
