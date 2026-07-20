// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	EmployeeBenefitForm,
	isPerfectAttendanceBenefitTypeCode,
	PFA_ATTENDANCE_BASED_WARNING_BODY,
	PFA_ATTENDANCE_BASED_WARNING_TEST_ID,
	PFA_ATTENDANCE_BASED_WARNING_TITLE,
	SELECT_EMPLOYEES_ACTION,
	shouldShowPfaAttendanceBasedWarning,
} from "./employee-benefit-form";

let activeBenefit: any = undefined;
const bulkCreateMutate = vi.fn();
const updateMutate = vi.fn();
const onCancel = vi.fn();
const onSuccess = vi.fn();

vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

vi.mock("~/components/atoms/Button", () => ({
	Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));
vi.mock("~/components/atoms/DatePicker", () => ({
	DatePicker: ({ value, onChange, placeholder }: any) => {
		const isEnd =
			placeholder === "Select end date" ||
			placeholder === "Leave empty for open-ended";
		return (
			<input
				aria-label={placeholder}
				data-testid={isEnd ? "end-date" : "start-date"}
				value={value || ""}
				onChange={(event) => onChange(event.target.value)}
			/>
		);
	},
}));
vi.mock("~/components/atoms/Select", () => ({
	Select: ({ options, value, onChange, disabled }: any) => {
		const testId = options.some((option: any) => option.value === "TIME_BOUND")
			? "schedule-mode"
			: options.some((option: any) => option.value === "benefit-type-1")
				? "benefit-type"
				: "select";
		return (
			<select
				data-testid={testId}
				value={value || ""}
				disabled={disabled}
				onChange={(event) => onChange(event.target.value)}>
				<option value="" />
				{options.map((option: any) => (
					<option key={option.value} value={option.value}>{option.label}</option>
				))}
			</select>
		);
	},
}));

vi.mock("~/components/molecules/employee/EmployeeMultiSelectModal", () => ({
	EmployeeMultiSelectModal: ({ open, onConfirm, onOpenChange, multi }: any) =>
		open ? (
			<div data-testid="employee-picker-modal">
				<button
					type="button"
					data-testid="mock-pick-employee-1"
					onClick={() => {
						onConfirm(multi === false ? ["employee-1"] : ["employee-1", "employee-2"]);
						onOpenChange?.(false);
					}}>
					Pick employees
				</button>
				<button
					type="button"
					data-testid="mock-close-picker"
					onClick={() => onOpenChange?.(false)}>
					Close
				</button>
			</div>
		) : null,
}));

vi.mock("~/components/ui/switch", () => ({
	Switch: ({ checked, onCheckedChange, ...props }: any) => (
		<button
			type="button"
			role="switch"
			aria-checked={checked}
			data-testid={props["data-testid"] || "switch"}
			onClick={() => onCheckedChange?.(!checked)}
		/>
	),
}));

vi.mock("~/lib/hooks/useBenefitTypes", () => ({
	useBenefitTypes: () => ({
		data: {
			benefitTypes: [
				{ id: "benefit-type-1", name: "HMO", code: "HMO", payrollDirection: "DEDUCTION" },
				{
					id: "benefit-type-pfa",
					name: "Performance Bonus",
					code: "PFA",
					payrollDirection: "COMPENSATION",
				},
			],
		},
		isLoading: false,
	}),
}));
vi.mock("~/lib/hooks/useEmployees", () => ({
	useEmployees: () => ({
		data: {
			employees: [
				{ id: "employee-1", employeeId: "EMP-1", person: { personalInfo: { firstName: "Ada", lastName: "Lovelace" } } },
				{ id: "employee-2", employeeId: "EMP-2", person: { personalInfo: { firstName: "Grace", lastName: "Hopper" } } },
			],
		},
		isLoading: false,
	}),
}));
vi.mock("~/lib/hooks/usePayrollPeriods", () => ({
	usePayrollPeriods: () => ({
		data: { payrollPeriods: [
			{ id: "period-1", name: "June first half", startDate: "2026-06-01", endDate: "2026-06-15", status: "OPEN" },
			{ id: "period-2", name: "June second half", startDate: "2026-06-16", endDate: "2026-06-30", status: "OPEN" },
		] },
		isLoading: false,
		isError: false,
	}),
}));
vi.mock("~/lib/hooks/use-auth", () => ({ useAuth: () => ({ user: { organizationId: "org-1" } }) }));
vi.mock("~/lib/hooks/useEmployeeBenefits", () => ({
	queryKeys: { employeeBenefits: { all: ["employee-benefits"] } },
	useEmployeeBenefit: () => ({ data: activeBenefit, isLoading: false }),
	useBulkCreateEmployeeBenefits: () => ({ mutate: bulkCreateMutate, isPending: false }),
	useUpdateEmployeeBenefit: () => ({ mutate: updateMutate, isPending: false }),
}));

type CreateFormProps = Partial<{
	payrollPeriodId: string;
	periodCode: string;
	periodStart: string;
	periodEnd: string;
}>;

const renderCreateForm = (
	props: CreateFormProps = {},
	initialEntry = "/hr/benefits-management/new",
) =>
	render(
		<MemoryRouter initialEntries={[initialEntry]}>
			<EmployeeBenefitForm
				mode="create"
				presentation="page"
				onCancel={onCancel}
				onSuccess={onSuccess}
				{...props}
			/>
		</MemoryRouter>,
	);

const selectEmployees = () => {
	fireEvent.click(screen.getByTestId("select-employees-button"));
	fireEvent.click(screen.getByTestId("mock-pick-employee-1"));
};

const fillRequiredFields = () => {
	selectEmployees();
	fireEvent.change(screen.getByTestId("benefit-type"), { target: { value: "benefit-type-1" } });
	fireEvent.change(screen.getByLabelText("Name *"), { target: { value: "HMO" } });
	fireEvent.change(screen.getByLabelText("Amount *"), { target: { value: "1000" } });
};

describe("EmployeeBenefitForm schedule modes", () => {
	beforeEach(() => {
		activeBenefit = undefined;
		bulkCreateMutate.mockReset();
		updateMutate.mockReset();
		onCancel.mockReset();
		onSuccess.mockReset();
	});

	it("defaults new adjustments to the time-bound schedule mode", () => {
		renderCreateForm();
		expect(screen.getByTestId("schedule-mode")).toHaveValue("TIME_BOUND");
	});

	it("shows the end date for time-bound schedules", () => {
		renderCreateForm();
		expect(screen.getByTestId("end-date")).toBeInTheDocument();
		expect(screen.queryByLabelText("Installment Count *")).not.toBeInTheDocument();
	});

	it("shows the installment count instead of an end date for fixed schedules", () => {
		renderCreateForm();
		fireEvent.change(screen.getByTestId("schedule-mode"), { target: { value: "FIXED_INSTALLMENTS" } });
		expect(screen.getByLabelText("Installment Count *")).toBeInTheDocument();
		expect(screen.queryByTestId("end-date")).not.toBeInTheDocument();
	});

	it("clears the irrelevant end date after changing to fixed installments", () => {
		renderCreateForm();
		fireEvent.change(screen.getByTestId("end-date"), { target: { value: "2026-06-30" } });
		fireEvent.change(screen.getByTestId("schedule-mode"), { target: { value: "FIXED_INSTALLMENTS" } });
		fireEvent.change(screen.getByTestId("schedule-mode"), { target: { value: "TIME_BOUND" } });
		expect(screen.getByTestId("end-date")).toHaveValue("");
	});

	it("requires employees and an end date before a time-bound benefit can be submitted", async () => {
		renderCreateForm();
		fireEvent.change(screen.getByTestId("benefit-type"), { target: { value: "benefit-type-1" } });
		fireEvent.change(screen.getByLabelText("Name *"), { target: { value: "HMO" } });
		fireEvent.change(screen.getByLabelText("Amount *"), { target: { value: "1000" } });
		fireEvent.click(screen.getByRole("button", { name: "Add benefit" }));
		await waitFor(() =>
			expect(screen.getByText("Select at least one employee")).toBeInTheDocument(),
		);
	});

	it("requires an end date before a time-bound benefit can be submitted", async () => {
		renderCreateForm();
		fillRequiredFields();
		fireEvent.click(screen.getByRole("button", { name: "Add benefit" }));
		await waitFor(() => expect(screen.getByText("End date is required for time-bound schedules")).toBeInTheDocument());
	});

	it("rejects a non-integer fixed installment count", async () => {
		renderCreateForm();
		fireEvent.change(screen.getByTestId("schedule-mode"), { target: { value: "FIXED_INSTALLMENTS" } });
		fillRequiredFields();
		fireEvent.change(screen.getByLabelText("Installment Count *"), { target: { value: "1.5" } });
		fireEvent.click(screen.getByRole("button", { name: "Add benefit" }));
		await waitFor(() => expect(screen.getByText("Installment count must be a positive whole number")).toBeInTheDocument());
	});

	it("previews the number of payroll periods covered by a time-bound schedule", () => {
		renderCreateForm();
		fireEvent.change(screen.getByTestId("start-date"), { target: { value: "2026-06-01" } });
		fireEvent.change(screen.getByTestId("end-date"), { target: { value: "2026-06-30" } });
		expect(screen.getByText(/Estimated 2 payroll-period installments/)).toBeInTheDocument();
	});

	it("previews a fixed per-installment amount", () => {
		renderCreateForm();
		fireEvent.change(screen.getByTestId("schedule-mode"), { target: { value: "FIXED_INSTALLMENTS" } });
		fireEvent.change(screen.getByLabelText("Amount *"), { target: { value: "1000" } });
		fireEvent.change(screen.getByLabelText("Installment Count *"), { target: { value: "4" } });
		expect(screen.getByText(/₱250.00 per installment/)).toBeInTheDocument();
	});

	it("previews the final-centavo rounding remainder for fixed installments", () => {
		renderCreateForm();
		fireEvent.change(screen.getByTestId("schedule-mode"), { target: { value: "FIXED_INSTALLMENTS" } });
		fireEvent.change(screen.getByLabelText("Amount *"), { target: { value: "1000" } });
		fireEvent.change(screen.getByLabelText("Installment Count *"), { target: { value: "3" } });
		expect(screen.getByText(/final installment ₱333.34/)).toBeInTheDocument();
	});

	it("sends a bulk fixed schedule payload with multiple employeeIds", async () => {
		renderCreateForm();
		fireEvent.change(screen.getByTestId("schedule-mode"), { target: { value: "FIXED_INSTALLMENTS" } });
		fillRequiredFields();
		fireEvent.change(screen.getByLabelText("Installment Count *"), { target: { value: "4" } });
		fireEvent.click(screen.getByRole("button", { name: "Add benefit" }));
		await waitFor(() => expect(bulkCreateMutate).toHaveBeenCalledTimes(1));
		expect(bulkCreateMutate.mock.calls[0][0]).toMatchObject({
			organizationId: "org-1",
			scheduleMode: "FIXED_INSTALLMENTS",
			totalInstallments: 4,
			employeeIds: ["employee-1", "employee-2"],
		});
		expect(bulkCreateMutate.mock.calls[0][0]).not.toHaveProperty("endDate");
		expect(bulkCreateMutate.mock.calls[0][0]).not.toHaveProperty("employeeId");
	});

	it("keeps legacy edit records editable by using the time-bound default", async () => {
		activeBenefit = {
			id: "benefit-1", employeeId: "employee-1", benefitTypeId: "benefit-type-1", name: "Legacy HMO",
			amount: 1200, startDate: "2026-06-01", endDate: "2026-06-30", isActive: true, status: "ACTIVE",
		};
		render(
			<MemoryRouter>
				<EmployeeBenefitForm
					mode="edit"
					presentation="modal"
					benefitId="benefit-1"
					onCancel={onCancel}
					onSuccess={onSuccess}
				/>
			</MemoryRouter>,
		);
		await waitFor(() => expect(screen.getByTestId("schedule-mode")).toHaveValue("TIME_BOUND"));
		expect(screen.getByTestId("end-date")).toHaveValue("2026-06-30");
		expect(screen.getByTestId("selected-employee-count")).toHaveTextContent(
			"1 employee selected",
		);
		expect(screen.queryByTestId("selected-employee-chips")).not.toBeInTheDocument();
	});

	it("does not render selected employee chips on the create page after picking employees", () => {
		renderCreateForm();
		selectEmployees();
		expect(screen.getByTestId("selected-employee-count")).toHaveTextContent(
			"2 employees selected",
		);
		expect(screen.getByTestId("select-employees-button")).toHaveTextContent(
			"Edit employees",
		);
		expect(screen.queryByTestId("selected-employee-chips")).not.toBeInTheDocument();
	});

	it("prefills the payroll period from the payroll route context", async () => {
		renderCreateForm({ payrollPeriodId: "period-2" });
		await waitFor(() =>
			expect(
				screen.getAllByTestId("select").some(
					(element) => (element as HTMLSelectElement).value === "period-2",
				),
			).toBe(true),
		);
	});

	it("shows optional end date and per-period amount for recurring schedules", () => {
		renderCreateForm();
		fireEvent.change(screen.getByTestId("schedule-mode"), { target: { value: "RECURRING" } });
		expect(screen.getByLabelText("Amount per payroll period *")).toBeInTheDocument();
		expect(screen.getByTestId("end-date")).toBeInTheDocument();
		expect(screen.queryByLabelText("Installment Count *")).not.toBeInTheDocument();
		expect(screen.getByTestId("recurrence-frequency")).toBeInTheDocument();
		expect(screen.getByTestId("recurrence-frequency")).toHaveValue("EVERY_CUTOFF");
	});

	it("hides recurrence control when schedule is not recurring", () => {
		renderCreateForm();
		expect(screen.queryByTestId("recurrence-frequency")).not.toBeInTheDocument();
		fireEvent.change(screen.getByTestId("schedule-mode"), { target: { value: "RECURRING" } });
		expect(screen.getByTestId("recurrence-frequency")).toBeInTheDocument();
		fireEvent.change(screen.getByTestId("schedule-mode"), { target: { value: "TIME_BOUND" } });
		expect(screen.queryByTestId("recurrence-frequency")).not.toBeInTheDocument();
	});

	it("previews an open-ended recurring schedule", () => {
		renderCreateForm();
		fireEvent.change(screen.getByTestId("schedule-mode"), { target: { value: "RECURRING" } });
		fireEvent.change(screen.getByLabelText("Amount per payroll period *"), {
			target: { value: "500" },
		});
		fireEvent.change(screen.getByTestId("start-date"), { target: { value: "2026-06-01" } });
		expect(
			screen.getByText(/₱500\.00 each payroll period from .* until cancelled\./),
		).toBeInTheDocument();
	});

	it("previews monthly and yearly recurring cadence", () => {
		renderCreateForm();
		fireEvent.change(screen.getByTestId("schedule-mode"), { target: { value: "RECURRING" } });
		fireEvent.change(screen.getByLabelText("Amount per payroll period *"), {
			target: { value: "500" },
		});
		fireEvent.change(screen.getByTestId("start-date"), { target: { value: "2026-06-01" } });
		fireEvent.change(screen.getByTestId("recurrence-frequency"), {
			target: { value: "MONTHLY" },
		});
		expect(
			screen.getByText(/₱500\.00 each month on the 2nd cutoff.*until cancelled\./),
		).toBeInTheDocument();
		fireEvent.change(screen.getByTestId("recurrence-frequency"), {
			target: { value: "YEARLY" },
		});
		expect(
			screen.getByText(/₱500\.00 once per fiscal year on the year-end cutoff.*until cancelled\./),
		).toBeInTheDocument();
	});

	it("allows submitting a recurring benefit without an end date for multiple employees", async () => {
		renderCreateForm();
		fireEvent.change(screen.getByTestId("schedule-mode"), { target: { value: "RECURRING" } });
		selectEmployees();
		fireEvent.change(screen.getByTestId("benefit-type"), { target: { value: "benefit-type-1" } });
		fireEvent.change(screen.getByLabelText("Name *"), { target: { value: "Monthly allowance" } });
		fireEvent.change(screen.getByLabelText("Amount per payroll period *"), {
			target: { value: "500" },
		});
		fireEvent.change(screen.getByTestId("start-date"), { target: { value: "2026-06-01" } });
		fireEvent.click(screen.getByRole("button", { name: "Add benefit" }));
		await waitFor(() => expect(bulkCreateMutate).toHaveBeenCalledTimes(1));
		expect(bulkCreateMutate.mock.calls[0][0]).toMatchObject({
			organizationId: "org-1",
			scheduleMode: "RECURRING",
			recurrenceFrequency: "EVERY_CUTOFF",
			amount: 500,
			startDate: "2026-06-01",
			employeeIds: ["employee-1", "employee-2"],
		});
		expect(bulkCreateMutate.mock.calls[0][0]).not.toHaveProperty("endDate");
		expect(bulkCreateMutate.mock.calls[0][0]).not.toHaveProperty("totalInstallments");
	});

	it("submits MONTHLY and YEARLY recurrenceFrequency on recurring create", async () => {
		renderCreateForm();
		fireEvent.change(screen.getByTestId("schedule-mode"), { target: { value: "RECURRING" } });
		selectEmployees();
		fireEvent.change(screen.getByTestId("benefit-type"), { target: { value: "benefit-type-1" } });
		fireEvent.change(screen.getByLabelText("Name *"), { target: { value: "Yearly bonus" } });
		fireEvent.change(screen.getByLabelText("Amount per payroll period *"), {
			target: { value: "1000" },
		});
		fireEvent.change(screen.getByTestId("start-date"), { target: { value: "2026-01-01" } });
		fireEvent.change(screen.getByTestId("recurrence-frequency"), {
			target: { value: "YEARLY" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Add benefit" }));
		await waitFor(() => expect(bulkCreateMutate).toHaveBeenCalledTimes(1));
		expect(bulkCreateMutate.mock.calls[0][0]).toMatchObject({
			scheduleMode: "RECURRING",
			recurrenceFrequency: "YEARLY",
			amount: 1000,
		});
	});

	it("includes an optional end date on a recurring create payload", async () => {
		renderCreateForm();
		fireEvent.change(screen.getByTestId("schedule-mode"), { target: { value: "RECURRING" } });
		selectEmployees();
		fireEvent.change(screen.getByTestId("benefit-type"), { target: { value: "benefit-type-1" } });
		fireEvent.change(screen.getByLabelText("Name *"), { target: { value: "Monthly allowance" } });
		fireEvent.change(screen.getByLabelText("Amount per payroll period *"), {
			target: { value: "500" },
		});
		fireEvent.change(screen.getByTestId("start-date"), { target: { value: "2026-06-01" } });
		fireEvent.change(screen.getByTestId("end-date"), { target: { value: "2026-12-31" } });
		fireEvent.click(screen.getByRole("button", { name: "Add benefit" }));
		await waitFor(() => expect(bulkCreateMutate).toHaveBeenCalledTimes(1));
		expect(bulkCreateMutate.mock.calls[0][0]).toMatchObject({
			scheduleMode: "RECURRING",
			endDate: "2026-12-31",
			employeeIds: ["employee-1", "employee-2"],
		});
	});

	it("opens the employee picker from a select-employees deep link", () => {
		renderCreateForm(
			{},
			`/hr/benefits-management/new?action=${SELECT_EMPLOYEES_ACTION}`,
		);
		expect(screen.getByTestId("employee-picker-modal")).toBeInTheDocument();
	});

	it("writes action=select-employees when opening the employee picker", async () => {
		renderCreateForm({}, "/hr/benefits-management/new?payrollPeriodId=period-1");
		expect(screen.queryByTestId("employee-picker-modal")).not.toBeInTheDocument();
		fireEvent.click(screen.getByTestId("select-employees-button"));
		await waitFor(() =>
			expect(screen.getByTestId("employee-picker-modal")).toBeInTheDocument(),
		);
	});

	it("clears the select-employees deep link when the picker closes", async () => {
		renderCreateForm(
			{},
			`/hr/benefits-management/new?action=${SELECT_EMPLOYEES_ACTION}&payrollPeriodId=period-1`,
		);
		expect(screen.getByTestId("employee-picker-modal")).toBeInTheDocument();
		fireEvent.click(screen.getByTestId("mock-close-picker"));
		await waitFor(() =>
			expect(screen.queryByTestId("employee-picker-modal")).not.toBeInTheDocument(),
		);
	});
});

describe("PFA + attendance-based warning helpers", () => {
	it("recognizes PFA benefit type codes case-insensitively", () => {
		expect(isPerfectAttendanceBenefitTypeCode("PFA")).toBe(true);
		expect(isPerfectAttendanceBenefitTypeCode("pfa")).toBe(true);
		expect(isPerfectAttendanceBenefitTypeCode(" PFA ")).toBe(true);
		expect(isPerfectAttendanceBenefitTypeCode("HMO")).toBe(false);
		expect(isPerfectAttendanceBenefitTypeCode("Performance Bonus")).toBe(false);
		expect(isPerfectAttendanceBenefitTypeCode(null)).toBe(false);
	});

	it("shows the warning only when PFA and attendance-based are both active", () => {
		expect(
			shouldShowPfaAttendanceBasedWarning({
				benefitTypeCode: "PFA",
				attendanceBased: true,
			}),
		).toBe(true);
		expect(
			shouldShowPfaAttendanceBasedWarning({
				benefitTypeCode: "PFA",
				attendanceBased: false,
			}),
		).toBe(false);
		expect(
			shouldShowPfaAttendanceBasedWarning({
				benefitTypeCode: "HMO",
				attendanceBased: true,
			}),
		).toBe(false);
		expect(
			shouldShowPfaAttendanceBasedWarning({
				benefitTypeCode: "PFA",
				attendanceBased: null,
			}),
		).toBe(false);
	});
});

describe("EmployeeBenefitForm Perfect Attendance (PFA) attendance-based warning", () => {
	beforeEach(() => {
		activeBenefit = undefined;
		bulkCreateMutate.mockReset();
		updateMutate.mockReset();
		onCancel.mockReset();
		onSuccess.mockReset();
	});

	it("does not show the PFA warning when attendance-based is off for PFA", () => {
		renderCreateForm();
		fireEvent.change(screen.getByTestId("benefit-type"), {
			target: { value: "benefit-type-pfa" },
		});
		expect(screen.getByTestId("attendance-based-toggle")).toHaveAttribute(
			"aria-checked",
			"false",
		);
		expect(screen.queryByTestId(PFA_ATTENDANCE_BASED_WARNING_TEST_ID)).not.toBeInTheDocument();
	});

	it("shows the PFA warning when attendance-based is enabled for PFA", () => {
		renderCreateForm();
		fireEvent.change(screen.getByTestId("benefit-type"), {
			target: { value: "benefit-type-pfa" },
		});
		fireEvent.click(screen.getByTestId("attendance-based-toggle"));
		const warning = screen.getByTestId(PFA_ATTENDANCE_BASED_WARNING_TEST_ID);
		expect(warning).toBeInTheDocument();
		expect(warning).toHaveTextContent(PFA_ATTENDANCE_BASED_WARNING_TITLE);
		expect(warning).toHaveTextContent(/not an all-or-nothing Perfect Attendance award/i);
		expect(warning).toHaveTextContent(/ABSENT days only/i);
		expect(warning).toHaveTextContent(/Late, undertime, and leave/i);
		expect(warning).toHaveTextContent(/metrics report/i);
		// Body constant stays the source of truth for copy.
		expect(warning).toHaveTextContent(PFA_ATTENDANCE_BASED_WARNING_BODY);
	});

	it("does not show the PFA warning when attendance-based is on for a non-PFA type", () => {
		renderCreateForm();
		fireEvent.change(screen.getByTestId("benefit-type"), {
			target: { value: "benefit-type-1" },
		});
		fireEvent.click(screen.getByTestId("attendance-based-toggle"));
		expect(screen.getByTestId("attendance-based-toggle")).toHaveAttribute(
			"aria-checked",
			"true",
		);
		expect(screen.queryByTestId(PFA_ATTENDANCE_BASED_WARNING_TEST_ID)).not.toBeInTheDocument();
	});

	it("hides the PFA warning when attendance-based is turned back off", () => {
		renderCreateForm();
		fireEvent.change(screen.getByTestId("benefit-type"), {
			target: { value: "benefit-type-pfa" },
		});
		fireEvent.click(screen.getByTestId("attendance-based-toggle"));
		expect(screen.getByTestId(PFA_ATTENDANCE_BASED_WARNING_TEST_ID)).toBeInTheDocument();
		fireEvent.click(screen.getByTestId("attendance-based-toggle"));
		expect(screen.queryByTestId(PFA_ATTENDANCE_BASED_WARNING_TEST_ID)).not.toBeInTheDocument();
	});

	it("shows the PFA warning on edit when an existing PFA enrollment is attendance-based", async () => {
		activeBenefit = {
			id: "benefit-pfa-1",
			employeeId: "employee-1",
			benefitTypeId: "benefit-type-pfa",
			benefitType: {
				id: "benefit-type-pfa",
				name: "Performance Bonus",
				code: "PFA",
				payrollDirection: "COMPENSATION",
			},
			name: "Perfect Attendance",
			amount: 200,
			startDate: "2026-06-01",
			scheduleMode: "RECURRING",
			attendanceBased: true,
			attendanceAmountBasis: "PER_CUTOFF",
			isActive: true,
			status: "ACTIVE",
		};
		render(
			<MemoryRouter>
				<EmployeeBenefitForm
					mode="edit"
					presentation="modal"
					benefitId="benefit-pfa-1"
					onCancel={onCancel}
					onSuccess={onSuccess}
				/>
			</MemoryRouter>,
		);
		await waitFor(() =>
			expect(screen.getByTestId(PFA_ATTENDANCE_BASED_WARNING_TEST_ID)).toBeInTheDocument(),
		);
		expect(screen.getByTestId("attendance-based-toggle")).toHaveAttribute(
			"aria-checked",
			"true",
		);
	});

	it("still allows submitting PFA with attendance-based enabled (warn only, no block)", async () => {
		renderCreateForm();
		fireEvent.change(screen.getByTestId("schedule-mode"), { target: { value: "RECURRING" } });
		selectEmployees();
		fireEvent.change(screen.getByTestId("benefit-type"), {
			target: { value: "benefit-type-pfa" },
		});
		fireEvent.change(screen.getByLabelText("Name *"), {
			target: { value: "Perfect Attendance" },
		});
		fireEvent.click(screen.getByTestId("attendance-based-toggle"));
		expect(screen.getByTestId(PFA_ATTENDANCE_BASED_WARNING_TEST_ID)).toBeInTheDocument();
		fireEvent.change(screen.getByLabelText("Full amount for cut-off *"), {
			target: { value: "200" },
		});
		fireEvent.change(screen.getByTestId("start-date"), { target: { value: "2026-06-01" } });
		fireEvent.click(screen.getByRole("button", { name: "Add benefit" }));
		await waitFor(() => expect(bulkCreateMutate).toHaveBeenCalledTimes(1));
		expect(bulkCreateMutate.mock.calls[0][0]).toMatchObject({
			benefitTypeId: "benefit-type-pfa",
			attendanceBased: true,
			attendanceAmountBasis: "PER_CUTOFF",
			amount: 200,
			scheduleMode: "RECURRING",
			employeeIds: ["employee-1", "employee-2"],
		});
	});
});
