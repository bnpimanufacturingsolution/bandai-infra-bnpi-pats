// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EmployeeMultiSelectModal } from "./EmployeeMultiSelectModal";

const onOpenChange = vi.fn();
const onConfirm = vi.fn();

vi.mock("~/components/atoms/Button", () => ({
	Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));
vi.mock("~/components/atoms/EmployeeAvatar", () => ({
	EmployeeAvatar: () => <div data-testid="avatar" />,
}));
vi.mock("~/components/atoms/Input", () => ({
	Input: (props: any) => <input {...props} />,
}));
vi.mock("~/components/atoms/Modal", () => ({
	Modal: ({ open, children, title }: any) =>
		open ? (
			<div data-testid="modal" role="dialog" aria-label={title}>
				{children}
			</div>
		) : null,
}));
vi.mock("~/components/atoms/Select", () => ({
	Select: ({ options, value, onChange, placeholder }: any) => (
		<select
			aria-label={placeholder}
			value={value}
			onChange={(event) => onChange(event.target.value)}>
			{options.map((option: any) => (
				<option key={option.value} value={option.value}>
					{option.label}
				</option>
			))}
		</select>
	),
}));

vi.mock("~/lib/hooks/useEmployees", () => ({
	useEmployees: () => ({
		data: {
			employees: [
				{
					id: "employee-1",
					employeeId: "EMP-1",
					departmentId: "dept-1",
					person: { personalInfo: { firstName: "Ada", lastName: "Lovelace" } },
				},
				{
					id: "employee-2",
					employeeId: "EMP-2",
					departmentId: "dept-1",
					person: { personalInfo: { firstName: "Grace", lastName: "Hopper" } },
				},
				{
					id: "employee-3",
					employeeId: "EMP-3",
					departmentId: "dept-2",
					person: { personalInfo: { firstName: "Alan", lastName: "Turing" } },
				},
			],
		},
		isLoading: false,
		isError: false,
		isFetching: false,
	}),
}));
vi.mock("~/lib/hooks/useDepartments", () => ({
	useDepartments: () => ({
		data: {
			departments: [
				{ id: "dept-1", name: "Engineering" },
				{ id: "dept-2", name: "Research" },
			],
		},
	}),
}));
vi.mock("~/lib/hooks/useSections", () => ({
	useSections: () => ({ data: { sections: [] } }),
}));
vi.mock("~/lib/hooks/usePositions", () => ({
	usePositions: () => ({ data: { positions: [] } }),
}));
vi.mock("~/lib/hooks/useLevels", () => ({
	useLevels: () => ({ data: { levels: [] } }),
}));

describe("EmployeeMultiSelectModal", () => {
	beforeEach(() => {
		onOpenChange.mockReset();
		onConfirm.mockReset();
	});

	it("shows a visible selection toolbar with Select all count", async () => {
		render(
			<EmployeeMultiSelectModal
				open
				onOpenChange={onOpenChange}
				selectedIds={[]}
				onConfirm={onConfirm}
				multi
			/>,
		);

		await waitFor(() =>
			expect(screen.getByTestId("employee-picker-grid")).toBeInTheDocument(),
		);
		expect(screen.getByTestId("employee-picker-selection-bar")).toBeInTheDocument();
		expect(screen.getByTestId("employee-picker-select-all")).toHaveTextContent(
			"Select all (3)",
		);
		expect(screen.getByTestId("employee-picker-selected-count")).toHaveTextContent("0");
	});

	it("selects all filtered employees with Select all", async () => {
		render(
			<EmployeeMultiSelectModal
				open
				onOpenChange={onOpenChange}
				selectedIds={[]}
				onConfirm={onConfirm}
				multi
			/>,
		);

		await waitFor(() =>
			expect(screen.getByTestId("employee-picker-grid")).toBeInTheDocument(),
		);

		fireEvent.click(screen.getByTestId("employee-picker-select-all"));
		expect(screen.getByTestId("employee-picker-selected-count")).toHaveTextContent("3");
		expect(screen.getByTestId("employee-picker-select-all")).toHaveTextContent(
			"Deselect all",
		);
		fireEvent.click(screen.getByTestId("employee-picker-confirm"));

		expect(onConfirm).toHaveBeenCalledWith([
			"employee-1",
			"employee-2",
			"employee-3",
		]);
	});

	it("selects only employees matching the active filter", async () => {
		render(
			<EmployeeMultiSelectModal
				open
				onOpenChange={onOpenChange}
				selectedIds={[]}
				onConfirm={onConfirm}
				multi
			/>,
		);

		await waitFor(() =>
			expect(screen.getByTestId("employee-picker-grid")).toBeInTheDocument(),
		);

		fireEvent.change(screen.getByLabelText("All departments"), {
			target: { value: "dept-2" },
		});
		expect(screen.getByTestId("employee-picker-select-all")).toHaveTextContent(
			"Select all matching (1)",
		);
		fireEvent.click(screen.getByTestId("employee-picker-select-all"));
		fireEvent.click(screen.getByTestId("employee-picker-confirm"));

		expect(onConfirm).toHaveBeenCalledWith(["employee-3"]);
	});

	it("hides Select all in single-select mode", async () => {
		render(
			<EmployeeMultiSelectModal
				open
				onOpenChange={onOpenChange}
				selectedIds={[]}
				onConfirm={onConfirm}
				multi={false}
			/>,
		);

		await waitFor(() =>
			expect(screen.getByTestId("employee-picker-grid")).toBeInTheDocument(),
		);
		expect(screen.queryByTestId("employee-picker-selection-bar")).not.toBeInTheDocument();
		expect(screen.queryByTestId("employee-picker-select-all")).not.toBeInTheDocument();
	});
});
